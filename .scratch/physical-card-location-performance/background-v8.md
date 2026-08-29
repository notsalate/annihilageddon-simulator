# Низкоуровневые свойства Node/V8 для per-branch индекса

## Граница вывода

Это не выбор общей архитектуры индекса, а проверка того, что реально дают и чего не дают Node/V8/ECMAScript/TypeScript. Масштаб берётся из основного исследования: примерно 207 физических карт в состоянии и 10 059 forks в `light/current` run ([контекст и измерения](./research.md)).

Локально проверено:

- Node `v22.23.1`;
- V8 `12.4.254.21-node.56`;
- `process.config.variables.v8_enable_pointer_compression === 0`.

Последний пункт важен: нельзя оценивать массив ссылок как «4 байта на ссылку» по статьям о pointer compression в Chrome. Pointer compression — настройка сборки V8, а не гарантия ECMAScript; сама V8 описывает её как замену 64-битных tagged values 32-битными смещениями внутри heap cage ([V8: Pointer Compression](https://v8.dev/blog/pointer-compression)). В текущей локальной сборке эта настройка выключена. Точный retained size обычного `Array`, `Map` и объектов всё равно надо измерять heap snapshot-ом на целевом Node, а не выводить из одной статьи или исходника V8.

## Короткая матрица

| Идея                                         | Что реально даёт                                                                                                                        | Что является псевдомагией                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Map<instanceId, location>` на каждый branch | Среднее sublinear lookup; простой API; семантически надёжен                                                                             | `new Map(source)` не является persistent/COW clone и обязан обработать все entries; «O(1)» не означает малую память     |
| `WeakMap<GameState, index>`                  | Один внешний lifecycle handle на state; index не меняет shape/serialization state; unreachable state не удерживается только этим ключом | Не освобождает index, пока `GameState` жив; не делает вложенный `Map` компактнее; GC/reclamation не детерминированы     |
| Packed `Array`                               | Быстрый dense integer/object index; Smi не требует отдельного HeapNumber; подходит для `cardByOrdinal`                                  | Любой `Array` автоматически packed; `new Array(N)` создаёт holes; Symbol-поле не превращает object в packed storage     |
| `Uint8Array` / `Uint16Array`                 | Гарантированно 1/2 байта на элемент backing buffer, fixed numeric representation, без holes                                             | `subarray()` не делает COW; overflow не бросает ошибку, а преобразует значение; typed array не хранит object references |
| Application COW                              | Может сделать fork O(1) до первой записи, если все записи идут через один seam                                                          | V8 сам не даёт приложению persistent arrays/Maps; `readonly` TypeScript не обеспечивает runtime immutability            |
| Малый overlay                                | O(k) памяти на k изменённых карт; при малом k линейный scan может быть дешевле отдельного hash table                                    | Бесконечная parent-chain остаётся O(depth × k) и легко съедает выигрыш                                                  |
| Symbol metadata                              | Не конфликтует со строковыми ключами; `JSON.stringify` не включает Symbol keys                                                          | Symbol остаётся named property, меняет hidden class при позднем добавлении и занимает storage                           |
| `WeakRef`                                    | Негоден как ownership, но допустим для необязательного cache hint                                                                       | Нельзя строить на нём корректность, детерминизм или гарантию освобождения в нужный момент                               |
| Arena / branch IDs                           | Может убрать тысячи мелких buffer/object allocations и переиспользовать строки плотной таблицы                                          | Монотонный ID в `Uint16Array` не безопасен без жёсткой границы; reuse без generation создаёт ABA/stale-handle ошибки    |

## `Map`: корректно, но не компактно и не persistent

ECMAScript гарантирует для `Map` лишь среднее время доступа, sublinear по числу entries; конкретная hash-table реализация и размер entry не являются контрактом ([ECMAScript: Map Objects](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-map-objects)). Поэтому обещать строгое O(1), фиксированное число байт на entry или одинаковую цену между версиями Node нельзя.

В текущем V8 `Map` реализуется через ordered hash table. Официальный исходник V8 показывает отдельные bucket data, data table, chain links, capacity/load factor и key/value slots; это заведомо больше одного плотного scalar slot на карту ([V8 `ordered-hash-table.h`: layout](https://chromium.googlesource.com/v8/v8/+/HEAD/src/objects/ordered-hash-table.h)). Точная layout локального V8 12.4 может отличаться от `HEAD`, поэтому исходник подтверждает направление overhead, но не даёт честной оценки retained bytes для проекта.

`new Map(existingMap)` не делит backing store по контракту. Конструктор получает iterator и вызывает `set` для каждой пары через `AddEntriesFromIterable` ([ECMAScript: Map constructor](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-map-iterable)). Даже если конкретный V8 имеет fast path, приложение не может считать это O(1) structural sharing. Общий mutable `Map` между sibling branches также небезопасен: `set` меняет тот же объект.

На масштабе 207 карт per-branch `Map<string, { card, zone }>` платит минимум за:

- hash-table capacity/buckets/chains;
- 207 key/value slots;
- вероятные 207 entry-value objects `{ card, zone }`, если значение не упаковано иначе;
- один новый table build при каждом eager fork либо при первом lazy build.

Это всё ещё может быть лучшим инженерным baseline из-за простоты и малой цены lookup. Но его нужно сравнивать с плотным ordinal layout, а не считать автоматически оптимальным из-за слова `Map`.

Практичная оптимизация, следующая из runtime properties: оставить только **один разделяемый registry** `instanceId -> cardOrdinal` на игру, а per-state данные держать плотно. Тогда string hashing и 207 map entries существуют один раз, а не на каждый fork.

## `WeakMap`: правильный внешний lifecycle seam, не сжатие данных

Спецификация прямо описывает `WeakMap` как способ динамически связать состояние с объектом так, чтобы сама ассоциация не удерживала недостижимый key; keys нельзя перечислить, а задержка удаления implementation-dependent и не наблюдаема программой ([ECMAScript: WeakMap Objects](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-weakmap-objects)).

Отсюда реально применимо:

- `WeakMap<GameState, PhysicalCardIndex>` не меняет `GameState`, его hidden class и обычные сериализации/fingerprints;
- outer `WeakMap` создаёт одну weak association на state, а не 207;
- когда state действительно недостижим, association не должна удерживать его только из-за key.

Ограничения:

- terminal state, сохранённый в результате Analyzer, остаётся достижимым, следовательно его index тоже жив;
- `WeakMap` не гарантирует немедленное освобождение после последней ссылки;
- если index нужно сбросить до смерти state, требуется явный `delete(state)` или lifecycle API;
- `WeakMap<CardInstance, ...>` на каждую cloned card не решает per-branch multiplicative overhead: cloned cards всё равно разные keys.

То есть внешний `WeakMap<GameState, DenseIndex>` выглядит полезно. Внешний `WeakMap<GameState, Map<207 entries>>` решает shape/ownership, но не решает главную память вложенного индекса.

## Packed `Array`, elements kinds и hidden classes

V8 хранит integer-indexed elements отдельно от named properties. Dense arrays получают packed elements kind; holey arrays требуют дополнительных проверок и prototype-chain lookup. Переходы обычно идут только от более специального kind к более общему ([V8: Elements kinds](https://v8.dev/blog/elements-kinds), [V8: Fast properties](https://v8.dev/blog/fast-properties)).

Для индекса полезны два разных dense массива:

1. `cardByOrdinal: CardInstance[]` — 207 state-local ссылок на cloned cards;
2. `zoneByOrdinal` — integer zone codes, предпочтительно typed array.

Если использовать обычный массив:

- строить его плотным `push`-проходом без пропусков;
- не использовать `delete` и не писать сразу в далёкий индекс;
- не читать за `length` в hot loop;
- для numeric array сохранять только небольшие целые, без `NaN`, `Infinity`, `-0` и object/string pollution.

`new Array(207)` начинает жизнь holey. В V8 есть свежая специальная оптимизация `Array.prototype.fill`, способная вернуть packed kind, но она появилась только в 2025 году; локальный V8 12.4 старше этого изменения, и код проекта не должен зависеть от backport/engine-specific repacking. Самый переносимый hot-path паттерн — плотное построение без holes.

Для `cardByOrdinal` object elements неизбежны, но плотный `PACKED_ELEMENTS` всё равно лучше 207 hash entries. Для `zoneByOrdinal` обычный `PACKED_SMI_ELEMENTS` не создаёт по объекту на число, однако его slot size и headers зависят от V8 build; typed array даёт более сильную гарантию размера.

Hidden classes касаются named properties, не array elements. Объекты с одинаковыми properties, добавленными в одинаковом порядке, делят hidden class; позднее добавление property создаёт transition, а разнообразие shapes ухудшает inline caches ([V8: Fast properties](https://v8.dev/blog/fast-properties#hiddenclasses-and-descriptorarrays)). Следовательно, если `cardOrdinal` становится полем `CardInstance`, его лучше:

- задавать во всех constructor/factory/clone paths в одном порядке;
- хранить как обычный integer field с явным смыслом;
- не добавлять лениво только на часть уже прогретых card objects;
- не удалять между фазами.

## Typed arrays: самое сильное обещание по payload

Спецификация задаёт element size: `Uint8Array` — 1 байт, `Uint16Array` — 2 байта ([ECMAScript: TypedArray table](https://tc39.es/ecma262/multipage/indexed-collections.html#table-the-typedarray-constructors)). Поэтому для 207 карт payload одной полной location row равен:

- `Uint8Array(207)` — 207 байт;
- `Uint16Array(207)` — 414 байт.

При 10 059 forks полное копирование только такой row означает примерно:

- 2 082 213 байт (`~1,99 MiB`) данных для `Uint8Array`;
- 4 164 426 байт (`~3,97 MiB`) данных для `Uint16Array`.

Это cumulative bytes copied/allocated over the run, а не peak retained memory; wrappers, alignment, allocator и GC сюда не входят. Но порядок величины показывает, что 207-byte memcpy сам по себе может быть дешевле 207 hash entries и 207 entry objects. Это нужно проверить парным benchmark, потому что allocation rate и external-memory bookkeeping тоже имеют цену.

Для zone codes `Uint8Array` достаточен, если кодов меньше 255 и `255` зарезервирован как `MISSING/DETACHED`. 207 — число карт, а не число зон; ordinal карты `0..206` также помещается в byte, оставляя `255` sentinel. Если кодовое пространство может вырасти до 255 реальных значений, нужен `Uint16Array`.

Критический риск: typed integer stores **не проверяют переполнение**. `Uint8Array` использует `ToUint8`, то есть приводит значение к диапазону `0..255`; `Uint16Array` — к `0..65535` ([ECMAScript: ToUint8/ToUint16](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-touint8)). Значение вне диапазона не является безопасной ошибкой. Нужны явные dev assertions до записи, иначе overflow может тихо совпасть с валидным code/sentinel.

Копирование и sharing различаются принципиально:

- `typed.slice()` создаёт новый typed array и новый buffer и копирует bytes ([ECMAScript: `%TypedArray%.prototype.slice`](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-%typedarray%.prototype.slice));
- `new Uint8Array(existingTypedArray)` также создаёт отдельный buffer по алгоритму typed-array construction;
- `typed.subarray()` создаёт новый view **того же ArrayBuffer** ([ECMAScript: `%TypedArray%.prototype.subarray`](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-%typedarray%.prototype.subarray)).

Поэтому `subarray()` — не COW и опасен для sibling branches: запись через любой view видна всем. Он полезен только для read-only base или arena row view, где mutation контролирует владелец arena.

Node учитывает память `ArrayBuffer` отдельно: `process.memoryUsage().arrayBuffers` входит в `external`, тогда как `heapUsed` описывает V8 heap ([Node: `process.memoryUsage()`](https://nodejs.org/api/process.html#processmemoryusage)). Benchmark `Map` против typed arrays обязан сравнивать хотя бы `heapUsed`, `external`, `arrayBuffers`, RSS и GC, иначе typed вариант может выглядеть «бесплатным» только из-за другой категории учёта.

## Copy-on-write: только явный контракт приложения

ECMAScript не предоставляет persistent `Array`, `Map` или typed array. V8 действительно имеет внутренние COW arrays для некоторых array literals и копирует backing store при первой записи; официальный исходник показывает `EnsureWriteableFastElements` и `FixedCOWArray` ([V8 `array.tq`](https://chromium.googlesource.com/v8/v8/+/HEAD/src/builtins/array.tq)). Но это private implementation detail, в первую очередь для literal boilerplates, не API для branch state.

Отсюда:

- нельзя считать `array.slice()` или `new Map(old)` O(1) COW без измерения конкретного V8;
- нельзя делить mutable typed array между siblings и надеяться, что V8 отделит его при записи;
- TypeScript `readonly`/`ReadonlyArray` — только проверка типов. TypeScript прямо говорит, что `readonly` не меняет runtime behavior и может быть обойдён aliasing; types стираются при компиляции ([TypeScript: `readonly`](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties), [TypeScript: erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html#erased-types)).

Application-level COW требует явного wrapper, например `{ data, shared }`, и единственного write seam:

1. fork делит immutable `data` и помечает обе стороны shared;
2. первая запись делает `data.slice()` и переводит child в exclusive;
3. все mutations обязаны проходить через `ensureExclusive()`.

Для 207-byte `zoneByOrdinal` такой COW может быть сложнее и рискованнее, чем безусловный copy. Его смысл появляется, если значительная доля forks вообще не меняет membership или если вместе копируется гораздо больший `cardByOrdinal`. Но `cardByOrdinal` уже должен содержать child-local cloned card references, поэтому его backing store обычно нельзя разделить с parent даже при неизменных зонах.

## Малые overlays

Если branch меняет membership лишь у `k << 207` карт, полезен shared immutable base плюс branch overlay. Runtime properties дают несколько форм:

- две плотные arrays `changedOrdinals[]` + `changedZones[]` и линейный scan;
- маленький `Map<number, zoneCode>`;
- fixed-capacity typed overlay, например до 8 изменений, затем materialization полной 207-byte row;
- parent-linked overlay node `{ parentId, ordinal, zone }` в arena.

Для очень малого `k` линейный scan по packed integers часто имеет меньший constant/allocation overhead, чем новый `Map`; это не стандартная гарантия и порог нужно замерять на V8 12.4. Typed overlay из двух отдельных `ArrayBuffer` на каждый branch может проиграть обычным packed arrays из-за wrapper/buffer overhead, несмотря на меньший payload.

Главный не-магический предел: lookup по linked overlays стоит O(depth × local-k). Нужна bounded depth/size policy: например materialize после 8–16 patches или при первом hot lookup после порога. Без compaction persistent overlay переносит цену с fork на каждое чтение.

Практичный гибрид для этого масштаба:

- shared immutable ordinal registry;
- base `Uint8Array(207)`;
- 0–несколько packed `(ordinal, zone)` patches;
- при превышении benchmark-derived порога — одна `slice()` base и применение patches;
- отдельный `cardByOrdinal` заполняется child-local references во время уже существующего clone pass.

## Symbol-поля: скрытие от обычной сериализации, не экономия

В V8 Symbol keys относятся к named properties и хранятся в properties backing store, а не в array elements ([V8: Hiding the hash code](https://v8.dev/blog/hash-code#javascript-object-backing-stores)). Та же статья описывает реальную проблему старого private-Symbol hash code: позднее добавление вызывало hidden-class transition, polymorphism и deoptimization ([V8: hash-code hidden-class transition](https://v8.dev/blog/hash-code#hash-code)).

Следствия для `cardOrdinal`/`branchId`:

- Symbol предотвращает collision со строковым именем и не попадает в `JSON.stringify`;
- Symbol property, заданный обычным assignment, всё равно own property и имеет storage;
- `Reflect.ownKeys` и `Object.getOwnPropertySymbols` его видят; generic clone через `Reflect.ownKeys` тоже может перенести его;
- позднее добавление Symbol только на часть объектов загрязняет shapes так же концептуально, как позднее строковое поле;
- `Object.defineProperty(..., { enumerable: false })` меняет видимость, но не отменяет storage/shape transition.

Поэтому Symbol — вопрос API visibility, не performance trick. Если ordinal нужен каждому card clone, явное стабильное integer field часто проще. Если metadata не должна попадать в object graph, лучше внешний `WeakMap`, понимая его lookup/memory цену.

## `WeakRef`: исключить из correctness path

`WeakRef` не удерживает target от GC, а `deref()` может вернуть `undefined`; если target возвращён, он удерживается лишь до конца текущего выполнения ECMAScript code ([ECMAScript: WeakRef](https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref-objects), [`WeakRef.prototype.deref`](https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref.prototype.deref)).

Индекс location участвует в корректности симуляции и детерминизме, поэтому:

- `WeakRef<Map>` или `WeakRef<DenseIndex>` недопустим как единственный index;
- GC timing не должен превращать hit в rebuild в непредсказуемой точке benchmark или, хуже, менять результат;
- `FinalizationRegistry` также не подходит для обязательного release/cleanup.

Допустим только необязательный cache hint, где исчезновение полностью эквивалентно cache miss и rebuild не меняет observable semantics. Для state index обычный `WeakMap<GameState, Index>` уже решает ownership лучше и проще.

## Arena и branch IDs

Из маленькой фиксированной `N = 207` следует ещё один вариант организации: не создавать по `ArrayBuffer` на branch, а хранить rows в arena:

```text
zoneArena: Uint8Array(capacityRows * 207)
rowHandle(state) -> { slot, generation }
location(slot, ordinal) = zoneArena[slot * 207 + ordinal]
```

Fork row копируется через `target.set(sourceSubarray)`; `subarray` здесь безопасен как временный read view, если destination не перекрывает source и у каждой живой ветки отдельный slot. Это всё ещё O(207) bytes per fork, но amortizes JS wrappers/ArrayBuffers и позволяет free-list reuse.

Ограничения arena:

- нужно расти/перекладывать buffer или заранее выбирать capacity;
- free-list reuse требует `{ slot, generation }`, иначе stale handle может прочитать новую ветку в старом slot (ABA);
- raw monotonic `branchId` нельзя бездумно хранить в `Uint16Array`: текущие 10 059 forks помещаются, но 65 535 — маленькая граница для heavy/долгого процесса;
- `Uint32Array` отодвигает wrap до `2^32 - 1`, но не устраняет необходимость overflow policy;
- обычный JS `number` точно представляет integers до `2^53 - 1` ([ECMAScript: `Number.MAX_SAFE_INTEGER`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.max_safe_integer)), но вычисление `branchId * 207` всё равно должно проверять bounds конкретного buffer;
- пока terminal state жив, его row нельзя reuse; внешний `WeakMap<GameState, handle>` не знает, когда бизнес-логика уже разрешает ранний release.

Arena особенно полезна, если profiler покажет, что проблема — тысячи мелких typed-array wrappers/ArrayBuffers, а не 2 MiB cumulative zone bytes. Если одновременно живо мало branches, free-list может сильно снизить peak. Если Analyzer удерживает много terminal states, arena лишь уплотнит storage, но не уменьшит число live rows.

Ещё более агрессивный вариант для строго DFS и невидимых terminal states — одна mutable row плюс undo log `(ordinal, previousZone)` на push/pop branch. Он даёт почти нулевую per-fork location memory, но неприменим там, где sibling/terminal states должны одновременно существовать или читаться позже. Это lifecycle optimization, а не свойство V8.

## Наиболее применимые low-level layouts для парного измерения

### A. Простой baseline

```text
WeakMap<GameState, Map<CardInstanceId, { card, zoneCode }>>
```

Плюсы: минимум новых invariants. Минусы: 207 hash entries и, вероятно, 207 value objects на indexed state; clone/build O(207), нет COW.

### B. Плотный ordinal index

```text
shared per-game Map<CardInstanceId, CardOrdinal>  // один раз
WeakMap<GameState, {
  cards: packed CardInstance[207],               // child-local refs
  zones: Uint8Array(207)                         // zone code / 255 missing
}>
shared zoneCode -> zoneName/descriptor table
```

Lookup: один shared string->ordinal lookup, затем два dense reads. Fork: `zones.slice()` плюс заполнение `cards[ordinal]` во время существующего clone traversal. Mutation membership: одна byte write; shuffle/reorder не меняют byte.

Это наиболее прямое следствие runtime properties: одна hash table вместо per-branch hash tables, гарантированные 207 bytes для зон и плотный массив ссылок для cards. Риск — нужно ввести стабильный ordinal и закрыть все mutation/rollback seams.

### C. Плотный base + малый overlay/COW

Как B, но `zones` делится read-only до первой записи либо branch хранит несколько patches. Имеет смысл только после измерения доли forks с membership mutations и patch count. Для 207-byte row безусловный copy может оказаться быстрее и проще.

### D. Arena rows

Как B, но `zones` — row большого arena buffer, а state хранит handle. Измерять, если B снижает heap, но показывает много `ArrayBuffer` allocations/external-memory churn.

## Что измерять, чтобы не принять учёт памяти за ускорение

Парный benchmark на том же Node/V8 должен фиксировать:

- wall/CPU time на fork, point lookup и membership mutation отдельно;
- builds, hits, misses, bytes/rows copied, overlay materializations;
- peak/final `heapUsed`, `external`, `arrayBuffers`, RSS;
- young/old GC time и retained terminal-state memory;
- heap snapshot retained sizes для `Map`, value objects, packed arrays, typed arrays;
- одинаковый result fingerprint и порядок действий.

Микробенч `Map.get` против `typed[ordinal]` без стоимости `instanceId -> ordinal`, fork lifecycle, GC и terminal retention недостаточен. Точно так же сравнение только `heapUsed` искусственно выгодно typed arrays, потому что их backing buffers учитываются в `arrayBuffers/external`.

## Факты, на которые не стоит опираться как на контракт

- точный размер `Map` entry из V8 `HEAD`;
- 4-байтная ссылка из Chrome pointer compression;
- O(1) clone для `Map`, `Array.slice()` или typed array;
- автоматическое COW для `subarray()`;
- освобождение `WeakMap`/`WeakRef` в конкретный момент;
- runtime immutability от TypeScript `readonly`;
- отсутствие hidden-class transition у Symbol field;
- безопасность `Uint8Array`/`Uint16Array` при overflow;
- уникальность recycled branch ID без generation.
