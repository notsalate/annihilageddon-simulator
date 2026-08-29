# Путь физических карт в текущем коде

## Область проверки

Проверены только текущие исходники репозитория: путь `findCardLocation`, создание веток Analyzer, локальный Defense rollback, все найденные механизмы изменения физических зон и создание `CardInstance`. Измерения производительности не запускались; выводы ниже алгоритмические.

Обозначения:

- `N` — общее число физических карт во всех зонах состояния;
- `P` — число игроков;
- `Z` — размер зоны, в которой ищется карта;
- `k` — число карт, чья принадлежность зоне отличается от родительского состояния после действий ветки.

## Фактический путь `findCardLocation`

`findCardLocation` (`src/engine/control-ledger.ts:780-792`) делает следующее:

1. учитывает один point search в диагностике;
2. вызывает `listPhysicalCardLocations(state)`;
3. только после полного построения списка вызывает `.find(...)` по `instanceId`;
4. возвращает только `{ card, zoneName }`, без индекса в массиве.

`listPhysicalCardLocations` (`control-ledger.ts:594-613`) обходит все дескрипторы и для каждой карты создаёт новый объект `{ card, zoneName, index, expectedOwnerId? }`. При этом `descriptor.read()` в `createArrayCardZoneDescriptor` (`control-ledger.ts:1029-1057`) сначала копирует весь массив зоны через `.map(...)` даже без включённой диагностики. Поэтому один вызов `findCardLocation` всегда:

- читает все физические зоны;
- копирует `N` ссылок на карты во временные массивы;
- создаёт `N` записей `PhysicalCardLocation`;
- затем линейно просматривает построенный список.

Раннего выхода нет даже для карты в первой зоне. Кэш `physicalCardZoneDescriptorCache` (`control-ledger.ts:16-23`, `337-354`) сохраняет только объекты дескрипторов; копии массивов и location records он не сохраняет.

Встроенный inventory состоит из шести зон на игрока (`deck`, `hand`, `discard`, `playedThisTurn`, `permanents`, `unboughtFamiliars`; `control-ledger.ts:269-334`) и девяти общих зон (`mainMarket`, `legendMarket`, `mainDeck`, `legendDeck`, `wildMagicStack`, `limpWandStack`, `destroyedPile`, `destroyedMayhem`, `destroyedMegaMayhem`; `control-ledger.ts:357-455`). Итого дескрипторов `6P + 9`. Сейчас все они создаются как `cardinality: "many"`; вариант `zeroOrOne` есть только в типе и проверках.

Смежные point-операции устроены неодинаково:

- `removeCardFromLocation` (`control-ledger.ts:794-817`) читает зоны по очереди и может остановиться раньше, но не принимает известную исходную зону;
- `reorderPhysicalCard` (`820-857`) уже получает точное имя зоны и ищет только в ней;
- `movePhysicalCard` (`860-966`) при `expectedSourceZoneName` читает только указанную исходную зону и destination, а без него ищет по всем зонам;
- `insertDetachedCard` (`969-1023`) сначала вызывает полный `findCardLocation`, чтобы доказать отсутствие карты во всех зонах.

## Где повторно разрешается уже известная карта

Есть несколько путей, где индекс не является единственным вариантом оптимизации:

- `moveResolvedNonOngoingCardToDestination` сначала делает полный `findCardLocation`, затем `removeCardFromLocation` того же ID (`card-play-resolution.ts:269-286`), хотя ожидаемая зона уже вычислена как `playedThisTurn`;
- `moveCardToZonePreservingOwner` сначала вызывает `findCardLocation`, затем либо `reorderPhysicalCard`, либо `removeCardFromLocation` (`effect-runtime.ts:4106-4163`). Это два поиска одной карты; при cross-zone второй снова не получает уже найденную зону;
- `listDefenseCardLocations` строит полный список всех зон и затем оставляет только одну руку (`control-ledger.ts:766-778`);
- `dead_wizard_token_shuffle_owned_permanents` получает живые `CardInstance` из `getControlledCards`, но для каждой карты отдельно вызывает `findCardLocation`, чтобы проверить зону permanents (`effect-runtime-dead-wizard-token.ts:870-900`);
- проверка cleanup reveal-карт и некоторые effect-source проверки уже имеют `CardInstance` или ID с более узким контекстом, но снова обращаются к глобальному locator (`effect-runtime-cards-ownership-choice.ts:1835-1868`, `effect-runtime-registry.ts:2653-2662`);
- настоящие произвольные ID lookup остаются у `temporaryCardControls` (`control-ledger.ts:197-212`) и `turn.gainedCards` (`effect-runtime.ts:1543-1556`), потому что эти записи хранят только ID.

Следовательно, часть нагрузки можно снять передачей уже разрешённого handle/контекста, даже не вводя глобальный точный индекс.

## Все механизмы изменения физических зон

Ниже перечислены механизмы, а не каждый конкретный effect ID.

### Через Control Ledger

- setup-замена карты в одной player-зоне через `descriptor.replace` (`control-ledger.ts:229-267`; единственный вызов находится в `effect-runtime-setup.ts:346`);
- remove, reorder, cross-zone move и insert detached card (`control-ledger.ts:794-1023`);
- семейства runtime effects вызывают общие `moveCardToPlayerZone`, `moveCardToZonePreservingOwner`, `restoreDetachedCardToZone` и `playResolvedCard`; эти сервисы используются в activation, cards/ownership/choice, combat, Mayhem, DWT interactions и special-card-stack (`effect-runtime.ts:4055-4192` и их вызовы);
- Defense перемещает карту защиты и карты оплаты через `movePhysicalCard` (`attack-defense.ts:503-555`, `701-750`);
- Mayhem refresh legend market использует `movePhysicalCard` с известной исходной зоной (`effect-runtime-mayhem.ts:1616-1733`).

### Прямые изменения массивов зон

Точный индекс должен учитывать и эти пути; дескрипторы их не перехватывают.

- `endTurn`: вся рука переходит в discard, `playedThisTurn` распределяется по discard владельцев, затем draw меняет deck/discard/hand (`actions-core.ts:484-529`, `915-933`);
- обычный `playCard` удаляет карту из hand напрямую (`actions-core.ts:969-1005`), а `resolveCardPlay` добавляет её в permanents или `playedThisTurn` (`card-play-resolution.ts:199-217`);
- `deck-lifecycle`: refill переносит весь discard в deck, shuffle переставляет элементы на месте, draw делает `deck.shift()` (`deck-lifecycle.ts:34-64`, `110-146`); эти helpers вызываются из end turn и нескольких effect families;
- draw effects добавляют результат в hand (`effect-runtime-resources-draw.ts:257-280`);
- attack cost напрямую переносит hand -> discard (`effect-runtime-combat-attack.ts:587-620`);
- Mayhem hand redraw и battle напрямую делают hand -> discard, deck/discard -> hand (`effect-runtime-mayhem.ts:1482-1519`, `1838-1859`);
- `moveGainedCardToPlayerDestination` сначала detaches карту через Ledger, а после вложенных on-gain effects напрямую кладёт её в deck/hand/discard (`effect-runtime.ts:1038-1125`);
- `discardTopDeckCards`, `drawTopDeckCard` и `peekTopDeckCard` меняют deck/discard через `deck-lifecycle`, затем вызывающий код может положить detached card в другую зону (`effect-runtime.ts:4252-4273`, `4381-4399`);
- `market-flow` делает `sourceDeck.shift()`, затем `market.push(card)` или `destroyedEvents.push(card)` для main/legend market (`market-flow.ts:45-78`, `169-259`);
- некоторые card-choice и DWT handlers перемещают карты через общие runtime-сервисы, а затем вызывают `shuffleDeck` над player deck (`effect-runtime-cards-ownership-choice.ts:809-865`, `effect-runtime-dead-wizard-token.ts:830-901`).

Setup отдельно наполняет исходные зоны и перемешивает колоды. После setup новые логические карты и новые `instanceId` в engine не вводятся: единственная фабрика исходных `CardInstance` находится в `createInstanceFactory` (`setup.ts:1671-1688`), а fork только клонирует уже существующую карту с тем же ID (`control-ledger.ts:539-547`). Поэтому множество логических карт и их stable slots можно считать неизменным на протяжении Analyzer search, хотя карта может временно быть detached и позже возвращена.

Поля самой карты тоже mutable: `ownerId`, `marketChips` и `faceUp` меняются во время игры (`control-ledger.ts:140`, `card-play-resolution.ts:210`, `effect-runtime.ts:1068-1069`, `4090-4103`, `deck-lifecycle.ts:21-25`, `attack-defense.ts:545-547`). Это важно для branch-local ссылки на карту: одинаковый ID в разных ветках указывает на разные клонированные объекты.

## Fork, snapshot и rollback

### Analyzer fork

Каждая попытка action/choice path создаёт новый fork исходного состояния (`best-move-analysis.ts:480-492`). Вложенный DFS передаёт полученный state как источник следующих действий (`660-768`), но каждое действие снова начинается с `forkGameStateForAnalyzer`. Choice replay также каждый раз начинает с нового fork того же source, а не откатывает использованную ветку.

`forkGameStateForAnalyzer` и публичный `forkGameState` сходятся в `createFork` (`game-state-fork.ts:7-23`):

- `clonePhysicalCardLedger(source)` полностью клонирует `players`, `common`, physical `CardInstance` и `temporaryCardControls`;
- RNG копируется в текущей позиции через `source.rng.fork()` (`game-state-fork.ts:27`; `rng.ts:40-46`);
- definition maps разделяются по ссылке;
- Analyzer разделяет только immutable event-log prefix; обычный fork клонирует event log (`game-state-fork.ts:72-81`).

`clonePhysicalCardLedger` сначала обходит все зоны и строит `Set` всех физических объектов, затем generic deep clone повторно проходит `players/common` и создаёт отдельный объект для каждой физической карты (`control-ledger.ts:481-591`). То есть fork уже имеет стоимость `Theta(N)` и уже видит каждую карту; построение locator в этом проходе не изменит асимптотику, но добавит существенные записи и удерживаемую память на каждое промежуточное/terminal state.

Replay линии делает обычный полный fork (`best-move-analysis.ts:776-794`). Недоверенная evaluation policy дополнительно клонирует source и terminal state (`860-889`, `1011-1041`).

### Диагностический location snapshot

`capturePhysicalCardLocationSnapshot` (`control-ledger.ts:616-629`) уже строит полный `Map<id, {zoneName,index}>`, но только для диагностического счётчика до/после action (`best-move-analysis.ts:489-492`, `617-623`, `973-993`). Он не участвует в выполнении и не обновляется при мутациях. Счётчик считает изменением и смену индекса, поэтому shuffle/front insertion могут отметить много карт, даже если zone membership не менялась.

### Единственный локальный rollback

Общего action rollback нет: после успешного preflight любая ошибка mutating action превращается в `ActionExecutionError` (`actions.ts:35-55`), а Analyzer просто отбрасывает fork. Единственный найденный локальный rollback физических зон — nested Defense.

Defense:

- копирует массив карт каждой зоны (`physical-card-zone-snapshot.ts:24-53`);
- отдельно копирует mutable-значения всех `CardInstance` и прочих объектов, RNG, turn и event-log length (`attack-defense.ts:132-180`);
- при rollback восстанавливает поля тех же объектов через `Object.assign`, затем заменяет массив каждой зоны и проверяет порядок по строгому равенству ссылок (`attack-defense.ts:199-249`, `physical-card-zone-snapshot.ts:56-165`).

Значит, branch-local locator обязан иметь явную семантику Defense restore. `cardsBySlot` внутри одного state может сохранить ссылки, потому что rollback не заменяет `CardInstance`; но exact zone/index data нужно либо snapshot/restore, либо пересобрать из восстановленных зон. Внешний индекс, о котором `restorePhysicalCardZoneState` не знает, станет устаревшим.

## Нижняя граница branch-local данных

Текущий публичный результат locator не требует индекса. Это существенно: смена зоны затрагивает одну карту, а вставка в начало, удаление и shuffle меняют индексы многих карт.

Для lookup, который сначала знает только ID, нужны две независимые вещи:

1. получить branch-local `CardInstance` с этим ID;
2. узнать текущую зону этой карты.

При нынешнем eager clone объектов строгий `O(1)` для пункта 1 требует прямой branch-local ссылки на каждый клонированный объект — `Theta(N)` ссылок, например `cardsBySlot`. Без этого карту можно получить сканированием известной зоны за `O(Z)`.

Для пункта 2 полная копия membership не является теоретически обязательной. Если общий base registry immutable, ветке достаточно хранить различия: в общем случае по одной записи для каждой из `k` карт, сменивших зону, плюс маркер `detached` при необходимости. Внутризонный reorder/shuffle не требует ни одной membership-записи. Для произвольного набора per-card различий worst-case нижняя граница zone-only overlay относительно родителя — `Omega(k)`, а не `Omega(N)`; специальные batch-операции иногда можно сжать сильнее. Реализация persistent overlay должна также ограничивать глубину parent-chain или периодически уплотняться.

Если требовать точный array index и `O(1)` remove, `k` перестаёт быть числом физически перемещённых карт: `shift`, `unshift`, удаление из середины и shuffle меняют позиции до `Theta(N)` карт. Для текущего `findCardLocation` это лишний контракт.

## Сравнение структур

### 1. Полный `Map` на ветку

Вариант: `Map<CardInstanceId, {card, zoneName}>`, при необходимости с `index`.

Плюсы:

- простой `O(1)` lookup;
- можно наполнить во время уже существующего clone traversal, без отдельного полного scan;
- хорошо диагностируется и валидируется по inventory.

Минусы:

- `Theta(N)` hash entries, ключей и value records на каждый fork; Analyzer удерживает много resulting/terminal states;
- встроенный JS `Map` не даёт дешёвого copy-on-write: `new Map(parent)` снова `Theta(N)`;
- вариант с `index` требует массовых обновлений на reorder/shuffle;
- Defense restore должен восстанавливать или перестраивать Map.

Практически полный Map разумнее хранить без `index`; removal после получения zone может один раз просканировать только эту зону.

### 2. Shared membership + поиск внутри известной зоны

Вариант: общий registry `id -> base zone/slot`, а ветка хранит persistent overlay `id/slot -> current zone | detached`. Locator выбирает известную зону и ищет карту только в её массиве.

Стоимость:

- branch-local память `Theta(k)` для membership;
- lookup `O(Z)` по массиву известной зоны;
- reorder/shuffle не меняют membership;
- cross-zone move меняет одну запись на карту.

Это минимальная структура, совместимая с текущим возвратом `{card, zoneName}`. Главный инженерный риск — прямые мутации массивов. Есть два безопасных режима:

1. сделать все mutation paths Ledger-owned и обновлять overlay точно;
2. трактовать membership как проверяемую подсказку: искать ID в указанной зоне, а при промахе делать глобальный fallback, исправлять branch-local overlay и никогда не доверять stale hint без проверки.

Второй режим можно вводить поэтапно и он сохраняет корректность даже при пропущенной mutation hook. Худший случай остаётся `O(N)`, но неизменившиеся карты и известные source zones перестают создавать `N` location records на каждый вызов.

### 3. Dense `cardsBySlot`

После setup множество карт неизменно, поэтому можно один раз построить общий `Map<CardInstanceId, slot>`. Нельзя безопасно получать slot разбором строки `card-N`: production factory создаёт такие ID (`domain/types.ts:53-56`, `setup.ts:1671-1688`), но тип `CardInstanceId` допускает branded произвольную строку, и тестовые/внутренние fixtures активно этим пользуются.

На fork `cardsBySlot[slot] = clonedCard` можно заполнять непосредственно при клонировании. Это даёт:

- branch-local `Theta(N)` плотных ссылок без hash-entry/value-object overhead полного Map;
- `O(1)` ID -> branch card после общего `id -> slot`;
- хороший locality и меньшую постоянную память, чем у `Map`.

Но `cardsBySlot` само по себе не отвечает на вопрос о зоне. Нужен один из вариантов:

- плотный `zoneBySlot` (`Uint16Array`/обычный массив) на каждую ветку — ещё `Theta(N)`, но компактно;
- shared base `zoneBySlot` + persistent branch overlay `Theta(k)`;
- zone metadata на клонированной карте плюс гарантированные mutation hooks.

Dense вариант особенно полезен, если нужен строгий `O(1)` доступ к branch-local объекту. Если достаточно `O(Z)` scan в известной зоне, массив из `N` дополнительных ссылок не является нижней границей и может не окупиться.

## Дополнительные варианты, следующие из call path

### Ephemeral resolved handle

Ввести внутренний результат вида `{ descriptor/zoneId, cards, index, card }` и потреблять его один раз до следующей мутации зоны. Это убирает пары `find -> remove/reorder` без долговечного индекса. Перед удалением handle можно дешёво проверить `cards[index] === card`; при несовпадении — просканировать только известную зону.

Наиболее очевидные первые места: `card-play-resolution.ts:269-286` и `effect-runtime.ts:4106-4163`.

### Передача source context/slot вместо повторного ID resolution

Внутренний effect context может нести уже разрешённый `CardInstance` или stable slot, сохраняя ID-only внешний/event контракт. Аналогично `TemporaryCardControl` и `GainedCardRecord` могут иметь приватный slot/handle. Это сокращает глобальные lookup в `getControlledCards`, source-owner modifiers и gained-card predicates.

### Ленивый locator на ветку

Полный Map можно строить только при первом настоящем point lookup. Это уменьшит стоимость веток с нулём поисков, но без надёжной invalidation после прямых array mutations exact-cache небезопасен. Безопасная версия — только verified hints с fallback, как в варианте 2.

### Persistent/COW physical state

Самая глубокая альтернатива — перестать eager-клонировать все zone arrays и mutable card objects, хранить cards/zone membership по stable slot и делать copy-on-write только для изменённых карт/зон. Тогда branch-local граница действительно приближается к `Theta(k)`. Но это уже изменение общего `forkGameState` lifecycle, identity semantics, Defense rollback и всех direct mutators, а не локальная оптимизация `findCardLocation`.

## Локальный вывод

Для текущего API точный array index не нужен и создаёт наибольшую стоимость обновлений. Минимально достаточная branch-local информация — изменения zone membership (`Theta(k)`), если карту допустимо искать внутри известной зоны. Если нужен строгий `O(1)` ID -> branch-local object, плотный `cardsBySlot` добавляет неизбежные при текущем eager clone `Theta(N)` ссылок, но дешевле полного `Map` по постоянным расходам.

Наиболее безопасный поэтапный путь по фактическому коду:

1. устранить повторное resolution через expected-zone/resolved handles;
2. сузить очевидные полные scans до конкретной зоны;
3. при необходимости добавить shared slot/membership hints с проверкой и fallback;
4. только после централизации или инструментирования всех перечисленных mutation paths делать exact per-branch index.
