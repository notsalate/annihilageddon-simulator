# Сравнение общей стоимости вариантов location lookup

## Задача и границы

Этот документ сравнивает шесть вариантов ускорения точечного поиска физической карты в Best-Move Analyzer:

1. allocation-free streaming scan;
2. per-state `Map`;
3. dense `cardsBySlot`;
4. shared membership + one-zone scan;
5. copy-on-write typed membership;
6. persistent overlays.

Вывод основан на текущем коде Analyzer, действующем benchmark-протоколе и уже сохранённом `light/current` diagnostic artifact. Новый тяжёлый benchmark не запускался. Сохранённый `current` artifact не сопоставим с E1 и используется только как профиль формы нагрузки, а не как baseline времени ([summary.json](../tmp/analyzer-location-research-light/summary.json), [benchmark contract](../../docs/benchmarks/README.md)).

## Что уже доказано измерениями

Сохранённый `light/current` прогон на Node `v22.23.1`, Windows x64 дал:

- clean total: `3907,30 мс`, enumeration: `3639,62 мс`, ranking: `227,94 мс`;
- `10 059` action applications и столько же `GameState` forks;
- `287 956` point location searches;
- `287 067` full location lists, то есть `99,69%` от числа point searches;
- `59 431 515` location records, в среднем `207,03` записи на полный list;
- `63 098 637` просмотренных карт;
- `313 903` `physicalLocationChanges`;
- `103 933` поиска внутри action attempts, в среднем `10,33` на attempt;
- `184 023` поиска, или `63,91%`, выполнены вне action attempts;
- `9 210` из `10 059` attempts попали в корзину `8+` point searches.

CPU profile отнёс `1487,14 мс` sampled self-time к `listPhysicalCardLocations`, `745,62 мс` к GC и `336,41 мс` к `cloneLedgerValue`. Allocation profile поставил `listPhysicalCardLocations` на первое место среди project hotspots: `882 872` sampled bytes. Это sampled views, не точные суммы allocation или GC pause ([summary.json](../tmp/analyzer-location-research-light/summary.json)).

Все четыре процесса diagnostic run дали один result fingerprint `246dfec3b5d4d66ff3a51885b0a2098b2f6f22341520aa69a23a27bfb0d0e3cc`. Это подтверждает пригодность fingerprint как correctness gate, но не делает `current` workload сопоставимым с E1.

Принятый E1 artifact даёт другой, reference-only масштаб: `light` — `1585,04 мс`, `typical` — `2696,68 мс`, `heavy` — `12461,04 мс`; accepted total-time tolerances соответственно `3,50% / 55,45 мс`, `4,19% / 74,22 мс` и `6,45% / 675,28 мс` ([performance-epoch-e1.json](../../docs/benchmarks/performance-epoch-e1.json)). Эти значения нельзя напрямую сравнивать с локальным Windows/current прогоном. Они нужны только для финального штатного gate; архитектурный турнир должен иметь собственные физически парные A/B measurements.

Текущий hot path действительно создаёт полный массив locations до `.find(...)`; каждый zone `read()` до этого ещё копирует массив через `.map(...)` ([control-ledger.ts](../../src/engine/control-ledger.ts#L594), [point lookup](../../src/engine/control-ledger.ts#L780), [descriptor read](../../src/engine/control-ledger.ts#L1029)). Поэтому streaming-кандидат считается честным только при private raw visitor/read: замена `.find` без устранения zone copies оставит значительную часть allocation.

## Важное различие: position churn не равен membership writes

`physicalLocationChanges` нельзя подставлять в модель как число межзонных перемещений.

Diagnostic snapshot хранит для каждого `instanceId` пару `{ zoneName, index }`, а Analyzer сравнивает snapshots до и после попытки или evaluation-policy call ([capture](../../src/engine/control-ledger.ts#L616), [branch measurement](../../src/engine/best-move-analysis.ts#L489), [policy measurement](../../src/engine/best-move-analysis.ts#L973)). Поэтому один `shift`, front insert, reorder или shuffle может увеличить `physicalLocationChanges` для многих карт, хотя membership index должен изменить ноль или одну запись zone membership. Обратная ситуация тоже возможна: карта переместилась и вернулась между двумя snapshots, а итоговый счётчик этого не увидит.

Кроме того, `descriptor.read(false)` не увеличивает `physicalZonePasses`, но всё равно копирует zone array, а snapshot создаёт `Map` position records. Эта диагностическая работа отсутствует в clean run и способна скрыть выигрыш кандидата в instrumented timing. Следствия:

- `physicalLocationChanges` сохраняется как semantic counter и обязан совпасть между кандидатами;
- отдельно нужен counter фактических `membershipTransitions`, включая detach/insert и batch count;
- instrumented timing не участвует в выборе быстрейшей реализации;
- оптимизированный membership index нельзя использовать как oracle для `physicalLocationChanges`, потому что он намеренно не хранит exact index.

## Модель общей стоимости

Обозначения:

- `N` — число физических карт в состоянии; в сохранённом прогоне полный list в среднем содержал около `207` карт;
- `Z` — число встроенных зон; для двух игроков сейчас их `6P + 9 = 21`;
- `Q` — point reads;
- `F` — forks;
- `U` — число состояний, на которых индекс реально был построен;
- `M` — фактические membership transitions, не `physicalLocationChanges`;
- `W` — число состояний, в которых после fork случилась первая membership write;
- `S` — peak одновременно удерживаемых indexed states;
- `P` — суммарное число карт, просмотренных streaming scan;
- `V` — суммарное число карт, просмотренных one-zone scan;
- `D` — средняя глубина overlay probe;
- `L` — число настоящих полных ordered traversals для invariants, snapshots и других list consumers.

Главная нагрузка из artifact: `Q/F = 28,63` point reads на fork, но только `10,33` из них в среднем происходят внутри самой action attempt. Поиски вне attempts важны: operation-local cache не покрывает их, а state-local представление может переиспользоваться при legal-action enumeration и дальнейшей жизни того же состояния.

Analyzer сохраняет `terminalState` в каждой `AnalyzedTurnLine` до ranking ([best-move-analysis.ts](../../src/engine/best-move-analysis.ts#L373), [line retention](../../src/engine/best-move-analysis.ts#L726)). При этом workload обрабатывает seeds последовательно: после enumeration одного seed сразу идёт ranking ([analyzer-benchmark.ts](../../src/engine/analyzer-benchmark.ts#L449)). Поэтому `S` — high-water mark одного seed, а не сумма `terminalStates` по всему report. Существующие aggregate counters не дают `S`; его нужно измерить отдельно.

## Определения сравниваемых кандидатов

### A1 — allocation-free streaming scan

`findCardLocation` проходит cached descriptor inventory и raw zone arrays с ранним выходом, не создавая zone copies и location records.

- Read: `O(Z_prefix + cards_prefix)`, miss — `O(Z + N)`.
- Write: дополнительной цены нет.
- Fork: дополнительной цены нет.
- Retained memory: `O(1)`.
- GC: минимальный lookup garbage.
- Isolation: автоматически следует из существующих cloned zone arrays.

Это обязательный контрольный вариант. Он удаляет доказанный allocation hotspot при наименьшей correctness surface, но сохраняет повторное чтение тех же карт.

### A2 — per-state `Map<id, {card, zone}>`

Внешний `WeakMap<GameState, MembershipMap>` хранит для каждого состояния ссылки только на его cloned cards.

- Read: `O(1)` `Map.get`.
- Build: `O(N)` entries и records на indexed state.
- Write: `O(1)` на membership transition, `O(k)` на batch; reorder/shuffle — без update.
- Fork: либо lazy `O(1)` и первый read `O(N)`, либо eager `O(N)` rebind во время clone pass.
- Retained memory: `Theta(SN)` Map entries плюс per-entry object/string references.
- GC: lookup garbage почти исчезает, но Maps терминальных состояний могут перейти в old generation.
- Isolation: Map и card references нельзя разделять между source/child/siblings.

Для eager policy построение можно совместить с уже обязательным клонированием физических карт ([clonePhysicalCardLedger](../../src/engine/control-ledger.ts#L474)). Но это всё равно `N` Map writes на fork; экономия только в отсутствии второго zone traversal.

### A3 — dense `cardsBySlot`

Одна shared immutable таблица `slotByInstanceId` назначает card ID плотный slot. Состояние хранит `cardsBySlot[slot]` с local cloned card reference и, при необходимости, компактный `zoneCodeBySlot`.

- Read: shared `slotByInstanceId.get(id)` + 1–2 array accesses, то есть ожидаемое `O(1)`.
- Build/fork: `O(N)` плотных assignments; их можно выполнять внутри clone pass.
- Write: `O(1)` zone-code update; reorder/shuffle — без membership update.
- Retained memory: `Theta(SN)` references плюс `N` байт/слов zone codes на state; обычно заметно компактнее `Map` entries.
- GC: меньше отдельных objects и лучше locality, но каждый retained state всё ещё держит массив длины `N`.
- Isolation: `cardsBySlot` строго state-local; shared могут быть только ID/slot и zone-code metadata, не card references.

Нельзя строить этот вариант на разборе строки `card-N`: production setup действительно создаёт такие ID, но тип `CardInstanceId` — общий branded string, а `markCardInstanceId` допускает произвольные значения ([types.ts](../../src/domain/types.ts#L14), [ID factory](../../src/domain/types.ts#L53)). Нужна явная slot table и политика для detached card, отсутствовавшей при первом build. Рост slot table после forks также должен быть отдельным correctness case.

### A4 — shared membership + one-zone scan

Shared immutable membership хранит только `slot/id -> zoneCode`; card reference при lookup находится raw scan-ом одной предсказанной зоны. Это уменьшает `P` до `V` и не удерживает duplicate card-reference table.

- Read: `O(1)` membership lookup + `O(cards_in_zone)` local-card scan.
- Fork: `O(1)`, пока membership одинаково.
- Retained memory: shared `O(N)` base + `O(S)` pointers.
- GC: мало fork garbage и нет per-state `N` card references.
- Isolation: безопасно делить только immutable zone membership; local card всё равно разрешается из child zone.

Сам по себе этот вариант неполон: после первой membership mutation child больше не соответствует shared base. Минимальная самостоятельная политика для benchmark — **share-or-drop**: fork делит base, первая membership write помечает его unusable, следующий point read один раз перестраивает state-local base через `O(N)` traversal. Эта политика показывает, окупается ли cheap fork при реальной частоте writes. Если вместо drop сделать typed copy, получится A5; если хранить deltas — A6.

### A5 — copy-on-write typed membership

Shared `slotByInstanceId` сочетается с `Uint8Array`/`Uint16Array zoneCodeBySlot`. Parent и child делят typed array; первая membership write в конкретном state делает `.slice()`, затем меняет один slot. Card возвращается one-zone scan-ом.

- Read: `O(1)` zone lookup + `O(cards_in_zone)` card scan.
- Fork: `O(1)` shared pointer.
- Первая write на state: `O(N bytes)` copy; следующие writes: `O(1)`.
- Retained memory: `O(N + WN bytes + S pointers)`, без Map entries и duplicate card-reference arrays.
- GC: typed-array payload учитывается в `external/arrayBuffers`, а не только в `heapUsed`; короткие buffers могут всё равно создавать pressure.
- Isolation: owner token/generation обязан гарантировать, что source и siblings никогда не мутируют shared buffer.

При 21 зоне достаточно `Uint8Array`, но representation должна иметь detached/unknown sentinel и не предполагать навсегда `Z < 256` без проверки. Если slot registry растёт, typed arrays всех lineage states нельзя молча переиспользовать с разной длиной.

### A6 — persistent overlays

Shared immutable base хранит membership, а fork добавляет persistent delta nodes `slot -> zoneCode/detached`. Lookup проходит overlay chain или небольшой state-local overlay index, затем делает one-zone card scan.

- Read: `O(D + cards_in_zone)`; при chain compaction — периодические `O(N)` rebuilds.
- Write: `O(1)` новая delta record.
- Fork: `O(1)` pointer.
- Retained memory: `O(N + total retained deltas)`, но child удерживает ancestor chain.
- GC: нет `N`-copy на каждый written state, зато много мелких persistent nodes/Maps и возможен pointer-chasing.
- Isolation: естественная, если base и delta nodes immutable.

Overlay оправдан только если A5 доказанно проигрывает на first-write copies или retained buffers. Иначе он добавляет compaction policy, depth variance и rollback complexity без улучшения one-zone read.

## Сводная стоимость

| Кандидат               | Hot reads                    | Дополнительная fork/write работа  | Retained memory                     | Главный риск                           |
| ---------------------- | ---------------------------- | --------------------------------- | ----------------------------------- | -------------------------------------- |
| A1 streaming           | `Theta(P)`                   | нет                               | `O(1)`                              | линейное повторное чтение              |
| A2 per-state Map lazy  | `O(Q)` после build           | `O(UN + M)`                       | `Theta(SN)` тяжёлых entries         | old-gen Map retention                  |
| A2 per-state Map eager | `O(Q)`                       | `O(FN + M)`                       | `Theta(SN)` тяжёлых entries         | платит за каждый fork                  |
| A3 dense `cardsBySlot` | `O(Q)`                       | `O(FN + M)` либо lazy `O(UN + M)` | `Theta(SN)` refs + typed membership | slot growth и retained arrays          |
| A4 share-or-drop       | `Theta(V)` после base lookup | `O(rebuilds * N)`                 | shared `O(N)` + rebuilt states      | rebuild после branch writes            |
| A5 COW typed           | `Theta(V)`                   | `O(WN bytes + M)`                 | `O(N + WN bytes)`                   | почти каждый branch может сделать copy |
| A6 overlays            | `Theta(QD + V)`              | `O(M + compactions * N)`          | `O(N + retained deltas)`            | depth, objects, compaction             |

`L * N` authoritative traversals и diagnostic position snapshots остаются у всех кандидатов одинаковыми и не должны считаться преимуществом какого-либо индекса.

## Что нужно добавить в diagnostic-only counters

Общие counters:

- point lookup: hit/miss, target zone, cards examined, searches по call site;
- `membershipTransitions`, отдельно attach/detach/inter-zone и batch card count;
- reorder/shuffle count, для которых membership updates должны быть нулевыми;
- exact `physicalLocationChanges` оставить без изменения;
- state/fork ID только как агрегаты, не в hot path clean run.

По кандидатам:

- A2: builds, cards indexed, eager fork binds, lazy first-read builds, incremental updates, dirty rebuilds;
- A3: slot registrations/growth, dense assignments, state arrays allocated/released;
- A4: shared forks, first-write drops, rebuild count/cards, one-zone cards scanned;
- A5: shared forks, first-write copies, copied bytes, owned/shared buffer states;
- A6: overlay records, lookup probes, depth histogram, compactions и compacted cards.

Counters должны быть полностью выключены в clean process. Candidate diagnostic run обязан сохранить тот же `physicalLocationChanges`, phase distribution, lines и fingerprints, но его timing остаётся diagnostic-only.

## Решающий benchmark-план

### 1. Реализации

Собрать A0–A6 как отдельные commits/worktrees от одного base commit. Не переключать representation runtime-флагом внутри hot lookup. Общий diagnostic interface допустим, если production sink отсутствует в clean run и ветка компилируется в один прямой путь.

У всех кандидатов остаются одинаковыми:

- authoritative ordered zone traversal;
- action/choice order;
- RNG calls и forked RNG position;
- public `CardLocation` result;
- exact diagnostic position snapshot;
- source data и Analyzer workloads.

Любой cache/index должен оставаться внешним implementation detail, например значением `WeakMap` по точному `GameState`. Он не входит в clone/serialization/fingerprint, а порядок `Map`, slot table или overlays никогда не используется для rules, action order и ranking. Result fingerprint строится из workload и стабильной проекции ranked lines ([analyzer-benchmark.ts](../../src/engine/analyzer-benchmark.ts#L279), [line projection](../../src/engine/analyzer-benchmark.ts#L589)).

### 2. Correctness gate до времени

Для каждого кандидата:

1. После прогрева lookup выполнить remove/move/reorder/insert и сравнить все point results с authoritative traversal.
2. Покрыть early/late common zones, singleton zones, missing ID и detached card.
3. Проверить batch cleanup, draw/refill/shuffle, market refill и Defense rollback.
4. После parent cache/index build создать два sibling forks. Переместить карту и изменить mutable card fields в одном child; source и sibling должны сохранить свою zone membership и свои card objects.
5. Проверить fork до первого read, read до fork, write до read и read после write.
6. Для slot variants проверить произвольный branded ID, detached-before-first-build, slot growth и неизвестный ID.
7. Для COW проверить, что первая write отделяет только один child, а вторая write не копирует buffer повторно.
8. Для overlays проверить depth/compaction boundary и rollback через несколько deltas.
9. Обычный и instrumented Analyzer должны дать одинаковые lines.
10. Все кандидаты должны совпасть с A0 по workload fingerprint, workload-volume fingerprint, result fingerprint, line/ranked-line/action/branch/choice counts и limit results.

Любое несовпадение — немедленный reject, даже если timing лучше.

### 3. Microbench всех шести кандидатов

Запускать каждый case в отдельном fresh process. Сначала один warmup, затем не менее трёх measurements; порядок A/B менять `AB/BA`.

Read cases:

- hit в первой маленькой зоне;
- hit в `playedThisTurn`;
- hit в большой/поздней common zone;
- miss;
- replay реального target-zone distribution после добавления counters.

State-transition cases:

- `100 reads : 1 membership transition`;
- `10 : 1`;
- `1 : 1`;
- reorder/shuffle без membership transition;
- batch transition по фактическому end-turn/market размеру;
- move card away and back между diagnostic snapshots.

Fork cases:

- fork без lookup и write;
- fork + `1`, `10` и `30` reads;
- fork + write до первого read;
- fork + read + первая write + следующие writes;
- parent + 2 siblings с независимыми moves;
- выборки с фактическим `M/F`, который даст новый membership counter.

Microbench должен отдельно вывести:

- ns/read и cards examined;
- ns/fork;
- ns/first write и ns/subsequent write;
- bytes allocated/fork и allocated/read;
- A4 rebuild cards, A5 copied bytes, A6 probes/compactions.

### 4. Retained-memory и GC benchmark

Обычный benchmark измеряет `maxRSS` через `process.resourceUsage().maxRSS` ([benchmark-support.ts](../../src/engine/benchmark-support.ts#L19)), но сохранённый diagnostic `clean-benchmark.json` не содержит memory field. Для архитектурного выбора нужен отдельный raw artifact.

В fresh process с `--expose-gc`:

1. Создать terminal-like states тем же fork/read/write mix, что измерен Analyzer.
2. Удержать `S = 0, 1k, 5k, 10k` states, выполнить GC boundary.
3. Записать абсолютные `rss`, `heapUsed`, `external`, `arrayBuffers` и `maxRSS`.
4. Освободить states, выполнить повторный GC boundary и проверить возврат к baseline noise.
5. Рассчитать наклон retained bytes на `(state * card)`; для overlays также bytes на delta, для COW — bytes на detached buffer.

Нельзя смотреть только на `heapUsed`: typed membership живёт в `arrayBuffers/external`. Нельзя смотреть только на warmup-subtracted `maxRSS`: это process-lifetime maximum и он не показывает, освобождаются ли WeakMap values. CPU/allocation profiling запускать отдельными процессами; минимум сравнить GC sampled time, project sampled allocations и появление новых `Map build`, typed-copy или overlay hotspots.

### 5. Analyzer tournament

Этап 1 — `light/current` для всех A0–A6: correctness, counters и отсев явного проигрыша. Эти timings не сравнивать с E1.

Этап 2 — `typical/current` для surviving candidates: проверить target-zone mix, fork/write counters и retained-memory high-water mark.

Этап 3 — `heavy/current`, решающий турнир:

- сравнивать каждого indexed/persistent кандидата прежде всего с A1 streaming, а не только с дорогим A0;
- запускать fresh-process matched `AB/BA` pairs на одной машине, с одинаковым workload/environment fingerprint и собственным общим pair ID;
- взять минимум 10 matched pairs для двух финалистов;
- считать paired delta для `totalMs` и `enumerationMs`, median delta и bootstrap 95% interval;
- сохранять абсолютный peak RSS и retained-memory slope рядом со временем;
- CPU, allocation и GC artifacts получать отдельными процессами и проверять один result fingerprint.

Этап 4 — победитель проходит `light`, `typical`, `heavy` reference workloads и simulation benchmark через штатный PR performance gate. Только здесь результат может сравниваться с E1: нужны точный accepted workload/protocol, environment fingerprint и один non-empty `comparisonPairId` внутри пары. E1 baseline и calibration не переписывать.

### 6. Предварительно зафиксированное правило выбора

1. Reject при любом semantic/fingerprint/branch-isolation mismatch или утечке после release.
2. Reject при подтверждённой регрессии штатного E1 gate в `light`, `typical` или simulation.
3. На `heavy` победитель — кандидат с наименьшим paired `totalMs`, если 95% interval его преимущества над следующим кандидатом не пересекает ноль.
4. Если timing статистически неразличим, выбрать меньший p95 peak RSS и меньший retained-bytes slope.
5. Если memory также неразличима, выбрать меньшие GC pause/sampled GC и project allocations.
6. Если различий снова нет, выбрать менее stateful representation: A1 streaming, затем A2 Map, A3 dense, A5 COW, A6 overlay. A4 share-or-drop выбирается только если его rebuild counters практически нулевые на heavy; иначе он менее предсказуем, чем A5.
7. Overlay может победить COW только если измеренно снижает retained memory или first-write cost и не проигрывает ему по heavy total time. Само наличие лучшей асимптотики fork не является достаточным основанием.

Это правило не вводит новый E1 threshold: оно выбирает реализацию внутри одной задачи, а действующие blocking tolerances остаются собственностью принятой E1 calibration.

## Ожидаемая развилка по результатам

- Если A1 снимает почти весь CPU/GC hotspot и indexed candidates не дают устойчивого heavy выигрыша, выбрать A1.
- Если A2 быстрее A1, но retained Map slope или old-generation GC заметны, сравнить A3; dense representation должна показать тот же read выигрыш с меньшей памятью.
- Если A3 быстрее, но `FN` assignments и retained arrays становятся новым bottleneck, перейти к A5.
- Если one-zone cards examined малы, а `W/F` существенно меньше единицы, A5 — наиболее вероятный компромисс fork/memory/read.
- Если почти каждый fork делает membership write, A5 платит `WN`; тогда A3 может быть быстрее, потому что его `N` work уже слито с clone pass.
- Если A4 часто rebuild-ится после writes, он доминируемо хуже A5 и исключается.
- Если A5 first-write copies доминируют, а на branch обычно меняется мало IDs, только тогда A6 получает основание для финального сравнения.

## Итог

По существующим данным нельзя честно выбрать per-state `Map`, dense index или persistent representation только по скорости point lookup: в `light/current` на каждый fork приходится много reads, но Analyzer одновременно клонирует `10 059` состояний и удерживает terminal states до ranking. Поэтому решающее сравнение должно измерять сумму lookup + fork + membership writes + retained memory + GC.

A1 streaming — обязательный низкорисковый baseline. A2 показывает верхнюю границу скорости `O(1)` Map lookup. A3 проверяет, можно ли сохранить эту скорость без Map-entry overhead. A4 нужен как контроль цены one-zone scan и rebuild. A5 проверяет основной memory/fork компромисс. A6 допускается как финальный сложный кандидат только при доказанном bottleneck A5.
