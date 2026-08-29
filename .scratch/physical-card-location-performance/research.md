# Исследование производительности поиска физических карт

## Вывод

Первопричина — не сам факт хранения карт по зонам, а несоответствие между точечным запросом и реализацией: `findCardLocation` для одного `instanceId` вызывает `listPhysicalCardLocations`, который полностью читает все физические зоны, копирует каждый массив зоны и создаёт отдельную запись `{ card, zoneName, index, expectedOwnerId }` для каждой карты. Только после этого выполняется `.find(...)` ([`findCardLocation`](../../src/engine/control-ledger.ts#L780-L792), [`listPhysicalCardLocations`](../../src/engine/control-ledger.ts#L594-L614), [`createArrayCardZoneDescriptor`](../../src/engine/control-ledger.ts#L1029-L1058)). Кэш в Control Ledger сохраняет только набор descriptor-объектов, но не содержимое зон и не расположения карт, поэтому он не уменьшает эту работу ([`listPhysicalCardZoneDescriptors`](../../src/engine/control-ledger.ts#L337-L355)).

Дополнительный разбор CPU profile изменил первоначальную рекомендацию. Из `1684,9 мс` sampled inclusive time внутри `findCardLocation` около `1668,4 мс`, то есть примерно `99%`, находилось под `getControlledCards`; из них `1237,7 мс` пришло через `buildControlledObjectView`. Это не доказывает `99%` вызовов, но доказывает, что наблюдаемая цена почти целиком создаётся повторным разрешением карт из `temporaryCardControls`, где сейчас хранится только ID.

Поэтому наиболее перспективный вариант — **устранить доминирующий поиск у источника**, а не создавать индекс для всех карт каждой ветки:

1. хранить в `TemporaryCardControl` branch-local `CardInstance` вместо отдельного `cardInstanceId` либо рядом с ним;
2. в `getControlledCards` использовать эту прямую ссылку;
3. оставить `findCardLocation` allocation-free streaming scan с ранним выходом для редких общих запросов;
4. передавать уже разрешённые `card`/`zone` между соседними операциями, где код сейчас повторно делает `find -> remove/reorder`.

Этот handle не требует таблицы на `N` карт. Текущий `clonePhysicalCardLedger` уже клонирует единый объектный граф и сохраняет соответствие через `clones: Map<object, object>`: ссылка из control-record автоматически попадёт на тот же child-card, что и ссылка в child-zone ([`cloneLedgerValue`](../../src/engine/control-ledger.ts#L531-L591)). Если заменить поле ID ссылкой, число полей control-record вообще не растёт; stable ID получается как `control.card.instanceId`. Snapshot/rollback переставляют те же объекты карт между массивами, поэтому ссылка остаётся branch-local и актуальной.

Поддерживаемый индекс членства остаётся сильным **резервным** кандидатом, если после этой специализации реальные residual point-lookups всё ещё заметны. Но строить полный `Map` заранее означает платить `Theta(N)` retained entries на множество forks ради hotspot, который можно убрать одной ссылкой на каждый активный temporary control.

## Границы исследования

Исходное измерение задачи содержало следующие числа:

- `1 214 045` точечных поисков;
- `272 352 102` просмотренные карты;
- `253 747 465` location-records;
- около `5,91 с` CPU в `listPhysicalCardLocations`;
- около `5,28 с` в GC;
- около `19,85 с` весь clean run.

После добавления точной классификации поисков тяжёлый `current`-профиль был повторён локально. Он воспроизвёл ровно те же объёмы работы: `1 214 045` point-searches, `272 352 102` просмотренные карты и `253 747 465` location-records. Из поисков `1 202 923` (`99,0839%`) вызваны разрешением `TemporaryCardControl`, где ранее известная ссылка на карту была сохранена только как ID. Остаток составили `8 899` removal-поисков (`0,7330%`) и `2 223` разрешения `EffectSourceContext` (`0,1831%`); остальные категории дали ноль. Сумма категорий равна общему счётчику без остатка.

Clean run занял `20 617,62 мс`; CPU profile показал `5 816,43 мс` sampled self-time в `listPhysicalCardLocations` и `5 163,22 мс` GC. Все четыре процесса дали один result fingerprint `f4f876588f0e685dc95fc7e3cab0183877764c738ac9bd30712cee85f540814f`. Артефакт сохранён в [`summary.json`](../tmp/analyzer-reference-loss-heavy-20260829/summary.json). Поскольку роль `current` не сопоставима с E1, время используется только как проверка воспроизведения исходного hotspot, а не как новый baseline.

Из этих чисел следуют примерно `224,33` просмотра карты и `209,01` созданной записи на точечный поиск. Если CPU-категории профиля не перекрываются, `listPhysicalCardLocations + GC` объясняют около `56,4%` времени; устранение всей этой доли дало бы лишь теоретический верхний предел около `2,29x`, а не обещание результата. Репозиторный протокол отдельно предупреждает, что location counters, CPU profile и allocation profile измеряют разные величины ([`docs/benchmarks.md`](../../docs/benchmarks.md#L59-L72)).

После начала исследования был получен свежий полный `light/current` diagnose на Node `v22.23.1`, Windows x64, Intel Core i5-13420H. Это диагностическое свидетельство, не сопоставимое с E1 из-за роли `current`; исходный артефакт сохранён в [`summary.json`](../tmp/analyzer-location-research-light/summary.json). Clean run занял `3907,30 мс`, из них enumeration — `3639,62 мс`, ranking — `227,94 мс`. Инструментированный запуск насчитал `10 059` action attempts/forks, `287 956` point-searches, `287 067` полных lists, `63 098 637` просмотренных карт и `59 431 515` location-records. То есть полная materialization происходила в `99,69%` от числа point-searches; это уже прямое подтверждение, а не только вывод из отношения records/searches.

В CPU profile `listPhysicalCardLocations` был первым hotspot с `1487,14 мс` sampled self-time, GC — `745,62 мс`; вместе это около `56,0%` sampled CPU profile. Allocation profile также поставил `listPhysicalCardLocations` на первое место среди project hotspots (`882 872` sampled bytes; это sampled view, не точный объём). Все четыре процесса дали один result fingerprint `246dfec3b5d4d66ff3a51885b0a2098b2f6f22341520aa69a23a27bfb0d0e3cc` ([`summary.json`](../tmp/analyzer-location-research-light/summary.json)).

Branch distribution уточняет масштаб: внутри `10 059` attempts выполнено `103 933` searches, в среднем `10,33`; `9 210` attempts попали в корзину `8+`. Остальные `184 023` searches выполнены вне attempts. В отрыве от call sites это делало state-local индекс правдоподобным, но не доказывало его необходимость: многократные searches могли повторять один и тот же уже известный ID ([`summary.json`](../tmp/analyzer-location-research-light/summary.json), [`docs/benchmarks.md`](../../docs/benchmarks.md#L59-L66), [`enumerateTurnLines`](../../src/engine/best-move-analysis.ts#L671-L695)).

После этого call tree сохранённого CPU profile был агрегирован по родителю `findCardLocation`. Sampled inclusive time распределился так: `getControlledCards` — `1668,4 мс`, `clearPlayerCardEffectiveType` — `15,8 мс`, `setPlayerCardEffectiveType` — `0,7 мс`. Внутри `getControlledCards` главные родители: `buildControlledObjectView` — `1237,7 мс`, `getCardEffectiveTypeActionCards` — `194,2 мс`, `listLegalActions` — `140,1 мс`. Поэтому первоначальный вывод о необходимости общего state-local индекса был слишком широким: профиль указывает на конкретную потерянную ссылку в модели временного контроля.

## Первопричина

### 1. Полная материализация для точечного запроса

Для двух игроков Control Ledger создаёт `6 * players + 9`, то есть 21 встроенный descriptor: по шесть массивов игрока и девять общих массивов ([player zones](../../src/engine/control-ledger.ts#L269-L335), [common zones](../../src/engine/control-ledger.ts#L357-L455)). Каждый `descriptor.read()` сам создаёт копию массива через `.map`, затем `listPhysicalCardLocations` создаёт ещё одну запись на каждую карту ([`createArrayCardZoneDescriptor`](../../src/engine/control-ledger.ts#L1029-L1058), [`listPhysicalCardLocations`](../../src/engine/control-ledger.ts#L594-L614)). Поэтому один `findCardLocation` имеет стоимость `O(Z + N)` по чтению и `O(N)` по краткоживущим объектам независимо от того, где находится искомая карта.

`removeCardFromLocation` и `movePhysicalCard` уже не строят общий массив location-records, но по-прежнему последовательно читают descriptor-ы, а каждый read копирует соответствующий массив ([`removeCardFromLocation`](../../src/engine/control-ledger.ts#L794-L817), [`movePhysicalCard`](../../src/engine/control-ledger.ts#L860-L966)). `reorderPhysicalCard` ограничивается одной известной зоной, но тоже получает её копию ([`reorderPhysicalCard`](../../src/engine/control-ledger.ts#L819-L857)). После устранения temporary-control lookup остаются как минимум `8 899` removal-поисков и `2 223` разрешения source context; allocation-free streaming scan с ранним выходом адресует этот небольшой остаток без полного индекса.

### 2. Analyzer многократно воспроизводит один и тот же префикс

Для каждого action/choice prefix Analyzer создаёт новый fork исходного состояния, заново применяет действие, а при новом запросе выбора добавляет варианты в стек и повторяет всю попытку с нового fork ([`enumerateActionBranchesCore`](../../src/engine/best-move-analysis.ts#L468-L634)). DFS затем повторяет это на каждом промежуточном состоянии линии ([`enumerateTurnLines`](../../src/engine/best-move-analysis.ts#L660-L770)). Fork изолирует карты, массивы, RNG и event context через `clonePhysicalCardLedger` и `rng.fork()` ([`createFork`](../../src/engine/game-state-fork.ts#L19-L85), [`clonePhysicalCardLedger`](../../src/engine/control-ledger.ts#L474-L497)).

Таким образом, любое часто вызываемое чтение внутри `listLegalActions`, preflight, effect dispatch или evaluation умножается на число action attempts и choice replays. Диагностика специально считает point-searches как внутри попыток ветки, так и при построении legal actions ([`AnalyzerDiagnosticsSession`](../../src/engine/best-move-analysis.ts#L185-L217), [`docs/benchmarks.md`](../../docs/benchmarks.md#L59-L66)).

### 3. Временный контроль создаёт почти весь наблюдаемый hotspot

`getControlledCards` начинает с `permanents`, затем для каждой записи `temporaryCardControls` разрешает `cardInstanceId` через глобальный `findCardLocation` ([`getControlledCards`](../../src/engine/control-ledger.ts#L190-L215)). Этот helper вызывается непосредственно при построении legal actions и через controlled/effective-value/trigger пути; видимый fan-out есть в `listLegalActions`, `buildControlledObjectView`, `getControlledOngoingCards` и Trigger Dispatch ([`listLegalActions`](../../src/engine/actions-core.ts#L142-L187), [`buildControlledObjectView`](../../src/engine/control-ledger.ts#L86-L117), [`getControlledOngoingCards`](../../src/engine/control-ledger.ts#L217-L227), [`trigger-dispatch.ts`](../../src/engine/trigger-dispatch.ts#L261-L289)).

Каждая не-Ongoing карта после розыгрыша помещается в `playedThisTurn` и получает запись временного контроля ([`placeResolvedCard`](../../src/engine/card-play-resolution.ts#L199-L218)). Поэтому по мере удлинения Analyzer-линии растут и число временно контролируемых карт, и число повторных полных обходов. Точная классификация тяжёлого прогона подтвердила CPU call tree: `1 202 923` из `1 214 045` point-searches, или `99,0839%`, выполняются именно при разрешении `temporaryCardControls`. Это уже точное число вызовов, а не оценка по CPU samples.

### 4. Дополнительные полные обходы существуют, но не объясняют основной объём записей

Fork сначала сканирует все descriptor-ы, чтобы найти physical-card objects для изолированного клонирования, и при включённой диагностике этот scan увеличивает `physicalCardsViewed` ([`clonePhysicalCardLedger`](../../src/engine/control-ledger.ts#L481-L497)). Инструментированный Analyzer до и после каждой попытки создаёт `Map<instanceId, { zoneName, index }>` для подсчёта изменившихся расположений ([`capturePhysicalCardLocationSnapshot`](../../src/engine/control-ledger.ts#L616-L629), [`enumerateActionBranchesCore`](../../src/engine/best-move-analysis.ts#L489-L492), [`enumerateActionBranchesCore`](../../src/engine/best-move-analysis.ts#L615-L629)). Snapshot намеренно читает зоны с `instrument=false`: он добавляет работу обхода и сравнения, но не увеличивает `physicalCardsViewed` и не создаёт `PhysicalCardLocation` records. Близость `locationRecordsCreated / pointLocationSearches` к числу карт в состоянии поэтому согласуется с тем, что основная масса records приходит именно из `findCardLocation -> listPhysicalCardLocations`, хотя точную долю без call-site counters определить нельзя.

## Мутации и жизненный цикл состояния

Индекс нельзя добавлять только в `movePhysicalCard`: физические массивы пока изменяются несколькими законными путями.

| Класс изменения                        | Фактические пути                                                                                                                                                                                                                                                                                                                                                                                                                      | Требование к индексу членства                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Обычное remove/move/insert             | `removeCardFromLocation`, `movePhysicalCard`, `insertDetachedCard` ([`control-ledger.ts`](../../src/engine/control-ledger.ts#L794-L817), [`control-ledger.ts`](../../src/engine/control-ledger.ts#L860-L1023))                                                                                                                                                                                                                        | Удалить/обновить одну запись. Detached card должен временно отсутствовать.                                                                           |
| Розыгрыш и завершение карты            | `playCard` удаляет из hand напрямую; resolver добавляет в `permanents`/`playedThisTurn`, а cleanup переносит в discard ([`actions-core.ts`](../../src/engine/actions-core.ts#L969-L1005), [`card-play-resolution.ts`](../../src/engine/card-play-resolution.ts#L199-L218), [`card-play-resolution.ts`](../../src/engine/card-play-resolution.ts#L238-L293))                                                                           | Эти переходы нужно провести через один Ledger mutation seam либо явно уведомлять индекс.                                                             |
| Конец хода                             | Hand cleanup, played cleanup и draw напрямую используют `splice`, `push` и deck helpers ([`actions-core.ts`](../../src/engine/actions-core.ts#L484-L529), [`cleanupPlayedCards`](../../src/engine/actions-core.ts#L915-L934))                                                                                                                                                                                                         | Лучше одна пакетная операция: обновить только реально перемещённые IDs.                                                                              |
| Gain и общие runtime move helpers      | Сначала Ledger removal, затем прямой `push/unshift` в player zone ([gain destination](../../src/engine/effect-runtime.ts#L1040-L1120), [`moveCardToPlayerZone`](../../src/engine/effect-runtime.ts#L4055-L4088), [`moveCardToZonePreservingOwner`](../../src/engine/effect-runtime.ts#L4106-L4163))                                                                                                                                   | Destination insertion обязана завершать запись индекса; ошибка между remove и insert оставляет карту detached и должна обрабатываться транзакционно. |
| Draw/refill                            | `drawDeckCard(s)` делает `discard.splice`, `deck.push`, shuffle и `deck.shift`; вызывающий затем помещает cards в hand/discard ([`deck-lifecycle.ts`](../../src/engine/deck-lifecycle.ts#L53-L65), [`deck-lifecycle.ts`](../../src/engine/deck-lifecycle.ts#L110-L146), [`drawCardsForPlayer`](../../src/engine/effect-runtime-resources-draw.ts#L257-L280), [`discardTopDeckCards`](../../src/engine/effect-runtime.ts#L4252-L4274)) | Generic helper не знает `GameState` и zone names. Нужна state-aware Ledger-обёртка или пакет результата, применяемый одним владельцем.               |
| Market flow и массовые Mayhem-переходы | Market flow мутирует переданные deck/market/destroyed arrays; Mayhem напрямую переносит hand/discard/draw группы ([`fillMarket`](../../src/engine/market-flow.ts#L170-L255), [Mayhem redraw](../../src/engine/effect-runtime-mayhem.ts#L1485-L1520), [Mayhem battle](../../src/engine/effect-runtime-mayhem.ts#L1838-L1859))                                                                                                          | Нужны пакетные update-операции, иначе глобальная invalidation приведёт к частым `O(N)` rebuild.                                                      |
| Defense                                | Перемещение карты и payment уже идут через `movePhysicalCard` ([`moveDefenseCard`](../../src/engine/attack-defense.ts#L503-L545), [`commitDefensePaymentPlan`](../../src/engine/attack-defense.ts#L713-L745))                                                                                                                                                                                                                         | Обычное обновление записи; особенно важно корректное восстановление при ошибке branch.                                                               |
| Reorder и shuffle                      | `reorderPhysicalCard` меняет порядок одной зоны; shuffle переставляет элементы на месте ([`reorderPhysicalCard`](../../src/engine/control-ledger.ts#L819-L857), [`shuffleItems`](../../src/engine/deck-lifecycle.ts#L39-L50))                                                                                                                                                                                                         | Для индекса **членства** обновление не нужно. Полный API с точными индексами продолжает читать массив.                                               |
| Setup                                  | Setup создаёт и перемешивает массивы до начала обычной игры ([initial decks](../../src/engine/setup.ts#L953-L987), [initial hands](../../src/engine/setup.ts#L1566-L1590))                                                                                                                                                                                                                                                            | Ленивое первое построение после setup автоматически видит итоговое состояние.                                                                        |

### Fork и изоляция веток

Карты при fork клонируются как отдельные objects, поэтому state-local индекс с `card` reference нельзя разделить между source и child. Его можно собрать за тот же проход, в котором `cloneLedgerValue` уже создаёт cloned physical card, без дополнительного обхода зон, но с одной `Map.set` на карту ([`cloneLedgerValue`](../../src/engine/control-ledger.ts#L531-L591)). Тесты требуют независимости mutable cards, зон и sibling forks ([`game-state-fork.test.ts`](../../tests/game-state-fork.test.ts#L195-L250), [`game-state-fork.test.ts`](../../tests/game-state-fork.test.ts#L326-L343), [`game-state-fork.test.ts`](../../tests/game-state-fork.test.ts#L345-L394)).

Ленивая альтернатива не копирует индекс при fork, но первый lookup каждого child платит `O(N)` за построение. Eager-вариант добавляет `O(N)` Map writes к уже существующему `O(N)` clone, зато не делает второй scan. Какой вариант быстрее, зависит от числа forks без поиска и от удержания terminal states; это нужно измерять, а не выбирать умозрительно.

Свежий light diagnose даёт порядок величин: `59 431 515 / 287 067 = 207,03` records на полный list и `10 059` forks. Если eager index регистрирует примерно одну запись на карту в каждом fork, это около `2,08 млн` Map writes — примерно в `28,5` раза меньше, чем текущие location-record allocations. Сравнение неполное: Map entries живут дольше и тяжелее отдельной простой записи, поэтому peak RSS и old-generation GC остаются обязательными критериями ([`summary.json`](../tmp/analyzer-location-research-light/summary.json)).

### Snapshot и rollback

Defense snapshot сохраняет массив каждой физической зоны, mutable card objects, RNG и длину event log ([`createDefenseMutationSnapshot`](../../src/engine/attack-defense.ts#L132-L180)). Rollback заменяет storage всех зон из snapshot, затем восстанавливает RNG/events/usage sets ([`restoreDefenseMutationSnapshot`](../../src/engine/attack-defense.ts#L199-L250), [`restorePhysicalCardZoneState`](../../src/engine/physical-card-zone-snapshot.ts#L56-L125)).

Индекс должен либо:

1. сохранять и возвращать прежний index handle вместе со snapshot; либо
2. помечаться dirty до restore и один раз перестраиваться после завершения всех `descriptor.replace`.

Второй вариант проще и безопаснее при частичной ошибке restore: следующий lookup строится из фактически оставшихся массивов. Обновлять индекс после каждой восстанавливаемой зоны хуже — между заменами существует временно неконсистентное межзонное состояние.

### Fingerprints и порядок

Analyzer result fingerprint строится из workload и стабильного представления ранжированных lines: rank, score, action и selected choices ([`createAnalyzerResultFingerprint`](../../src/engine/analyzer-benchmark.ts#L279-L284), [`toAnalyzerLineFingerprint`](../../src/engine/analyzer-benchmark.ts#L589-L615)). Attack-chain recurrence отдельно проецирует ordered physical arrays, `temporaryCardControls` и RNG ([`createAttackChainRecurrenceKey`](../../src/engine/attack-cycle.ts#L29-L78), [physical projections](../../src/engine/attack-cycle.ts#L120-L164)). Поэтому при переходе control-record с ID на card handle эта проекция должна явно записывать только `{ cardInstanceId: control.card.instanceId, controllerId }`; иначе объект карты войдёт в fingerprint второй раз и изменит контракт. Внешний индекс или cache также не должен быть enumerable-полем `GameState`.

Полный `listPhysicalCardLocations` нужно сохранить как детерминированный authoritative traversal. Invariants используют его для owner checks, duplicate membership и stale temporary controls ([`assertGameStateInvariants`](../../src/engine/invariants.ts#L21-L86)). Сортировать Map entries или использовать порядок Map для rules logic нельзя: action/choice order должен остаться порядком массивов и descriptor inventory.

## Сравнение вариантов

Обозначения: `N` — все физические карты, `C` — активные записи временного контроля, `Q` — point-lookups, `M` — реальные переходы между зонами, `F` — forks, `V` — карты, просмотренные внутри уже известной зоны.

| Вариант                                                           | Чтение                                        | Дополнительная цена fork/изменений                                                    | Память и GC                                                    | Вывод                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Текущая материализация                                            | `Theta(N)` copies и records на каждый запрос  | Нет                                                                                   | `Theta(QN)` мусора                                             | Первопричина; исключить                                                                                                                           |
| Allocation-free streaming scan                                    | Ранний выход, worst-case `O(N)`               | Нет                                                                                   | `O(1)` мусора                                                  | Обязательный fallback и контрольный кандидат                                                                                                      |
| **Прямая ссылка в `TemporaryCardControl`**                        | `O(1)` на доминирующем пути                   | Уже существующий clone делает `O(C)` rebind; если ссылка заменяет ID, новых полей нет | Одна существующая ссылка на control; location garbage исчезает | **Основной кандидат по фактическому профилю**                                                                                                     |
| Передача resolved handle/expected zone между соседними операциями | Убирает повторные `find -> remove/reorder`    | Нет persistent state                                                                  | Только короткоживущий контекст                                 | Дополнение после control-handle                                                                                                                   |
| Малый branch-local memo только найденных IDs                      | Hit `O(1)`/малый linear cache, miss streaming | `O(unique queried IDs)`, cache пуст на fork                                           | Меньше полного индекса, но новые cache objects                 | Проверять только при заметном residual lookup                                                                                                     |
| Полный поддерживаемый `Map<id,{card,zone}>`                       | `O(1)` для всех запросов                      | `Theta(N)` entries/rebind на indexed state; `O(M)` updates                            | `Theta(FN)` retained entries у живых веток                     | Быстрый read, но платит не за реальный hot set, а за все карты                                                                                    |
| Shared `id -> slot` + state-local `cardsBySlot`                   | `O(1)`                                        | `Theta(N)` packed pointer writes на fork; можно слить с clone pass                    | Компактнее `Map`, но всё ещё `Theta(FN)` ссылок                | Лучший полный индекс, если он вообще понадобится                                                                                                  |
| Shared membership + COW `Uint8Array` + scan одной зоны            | `O(V)` после zone lookup                      | Fork `O(1)`; первая membership write копирует `N` байт                                | Низкая retained цена, но нужен application-level COW           | Сильный компромисс, если residual searches распределены по многим ID                                                                              |
| Persistent overlay                                                | `O(depth + V)`                                | Fork/update `O(1)`, периодическая materialization                                     | Много мелких nodes и pointer chasing                           | Только если измерения докажут проблему typed-copy                                                                                                 |
| Analyzer DFS index + undo-log                                     | Потенциально `O(1)` без per-state копии       | Push/rollback изменений вместо state-local index                                      | Память по глубине/изменениям                                   | Теоретически привлекателен, но связывает Control Ledger с порядком обхода Analyzer и делает произвольный доступ к states дорогим; не первый выбор |
| Exact-position index                                              | `O(1)`                                        | `shift`, `unshift`, reorder и shuffle обновляют много позиций                         | Больше writes и metadata                                       | Не нужен текущему `CardLocation`                                                                                                                  |
| Shared immutable `CardInstance` + mutable sidecars                | `O(1)` и дешёвый fork                         | Требует переноса `ownerId`, `marketChips`, `faceUp` и зон в новое представление       | Может быть лучшим теоретически                                 | Это уже крупная перестройка `GameState`, запрещённая условиями                                                                                    |

TypeScript не даёт скрытой оптимизации представления: interfaces, assertions и generics стираются при emit, поэтому выигрыш определяется JavaScript/V8-структурами ([TypeScript transformer](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/compiler/transformers/ts.ts)). `WeakMap` решает только lifetime ключа; пока terminal `GameState` удерживается линией Analyzer, его value также жив. `TypedArray.subarray()` делит buffer, но не создаёт copy-on-write; COW нужно реализовывать явно. Разбор строки `card-N` как slot небезопасен: `CardInstanceId` — произвольный branded string, и fixtures используют другие значения ([`domain/types.ts`](../../src/domain/types.ts#L14-L29)).

Другой низкоуровневой «бесплатности» тоже нет. V8 хранит packed array elements отдельно от named properties, поэтому dense `cardsBySlot` действительно компактнее hash entries, но holey arrays и поздно добавленные поля требуют дополнительных проверок/hidden-class transitions ([V8 elements kinds](https://v8.dev/blog/elements-kinds), [V8 fast properties](https://v8.dev/blog/fast-properties)). Symbol остаётся named property и не экономит storage. `WeakRef` нельзя использовать в correctness path: результат `deref()` зависит от GC и может исчезнуть ([ECMAScript WeakRef](https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref-objects)). На локальном Node `v22.23.1` pointer compression выключен, поэтому оценка «4 байта на ссылку» здесь неприменима; exact retained size нужно измерять heap snapshot, а не угадывать по типам ([V8 pointer compression](https://v8.dev/blog/pointer-compression)).

### Почему direct handle действительно почти бесплатен

Сейчас `TemporaryCardControl` содержит две ссылки: `cardInstanceId` и `controllerId` ([`TemporaryCardControl`](../../src/engine/setup.ts#L80-L84)). В целевой форме он может содержать те же две ссылки: `card` и `controllerId`; ID получается из `card.instanceId`. То есть нет ни `Map`, ни массива длины `N`, ни дополнительного поля на каждую карту.

`clonePhysicalCardLedger` клонирует `players`, `common` и `temporaryCardControls` одним вызовом `cloneLedgerValue`. Когда clone встречает ссылку `control.card`, `physicalCards.has(card)` и общий `clones` возвращают тот же child-object, который уже помещён в child-zone. Поэтому source, child и sibling получают разные card objects без отдельной таблицы rebind.

Defense rollback заменяет содержимое зон ссылками на прежние объекты и восстанавливает поля этих объектов; он не создаёт новые `CardInstance`. Значит, control-handle не устаревает от shuffle, reorder, обычного move или rollback. Условие корректности уже существует: invariant требует, чтобы каждый temporary control ссылался на карту ровно в одной физической зоне ([`assertTemporaryCardControls`](../../src/engine/invariants.ts#L88-L112)). Его следует усилить проверкой object identity.

## Рекомендуемая архитектура

### Слой 1 — убрать доминирующее разрешение ID

- изменить внутреннюю запись временного контроля ровно на `{ card: CardInstance, controllerId }`: не хранить рядом дублирующий `cardInstanceId`;
- `grantTemporaryControl` должен получать уже имеющийся `CardInstance`; production caller в `card-play-resolution.ts` им располагает;
- `getControlledCards` добавляет `control.card` напрямую и больше не вызывает `findCardLocation`;
- `removeTemporaryCardControl` продолжает принимать stable ID и сравнивает `control.card.instanceId`;
- `clonePhysicalCardLedger` обязан клонировать zones и controls одним object graph; тест проверяет `forkControl.card === forkZoneCard` и `forkControl.card !== sourceControl.card`;
- attack-chain projection сериализует только `{ cardInstanceId: control.card.instanceId, controllerId }`, никогда не весь объект карты;
- destroy/control-release удаляют запись; временный detach внутри транзакционной операции не должен быть наблюдаемым, а rollback возвращает ту же карту и ту же control-связь;
- все fixtures и ручные конструкторы control-record мигрируют сразу; legacy-форма с одним ID в runtime не поддерживается и не оставляет медленный fallback в hot path.

Это локальное изменение модели Control Ledger, а не перестройка всего `GameState`. Оно не меняет правила, порядок зон, RNG или дерево Analyzer.

### Слой 2 — сделать общий locator безаллокаторным

`findCardLocation` должен обходить descriptors и карты напрямую и возвращаться на первом совпадении. Для этого private descriptor API нужен raw visitor/read без копирования zone array; публичный `read()` можно оставить защитным. `PhysicalCardLocation` records создаются только реальными full-list consumers, а не point lookup.

Одновременно узкие операции должны использовать уже известный контекст:

- `listDefenseCardLocations` читает только `${playerId}.hand`;
- найденная `{ card, zoneName }` передаётся в remove/move вместо второго глобального поиска;
- операции с известным `expectedSourceZone` сразу читают эту зону;
- `EffectSourceContext` получает optional live handle только если residual profile покажет пользу; выборы и fingerprints по-прежнему хранят ID.

### Слой 3 — индекс только по доказанному остатку

После слоёв 1–2 снова снять call-site counters и CPU profile. Если общий locator больше не hotspot, индекс не нужен. Если остался значимый разнообразный поток произвольных ID:

1. сначала сравнить dense `cardsBySlot` с shared membership + one-zone scan;
2. COW membership хранить в `Uint8Array` с `detached` sentinel;
3. полный per-state `Map` использовать только как контроль верхней границы read-speed;
4. overlays/undo-log допускать лишь после измеренного bottleneck fork или retained memory.

Такой порядок получает основное ускорение без постоянной цены каждой ветки и оставляет более тяжёлую структуру опциональной.

## Benchmark-план

### 1. Сначала расширить наблюдаемость

В diagnostic-only counters добавить:

- `findCardLocation` calls по непосредственному caller;
- `temporaryControlHandleHits`, legacy/fallback lookups и число controls, просмотренных `getControlledCards`;
- target zone, hit/miss и cards examined для streaming locator;
- повторные lookup одной уже разрешённой карты внутри одной операции;
- реальные attach/detach/inter-zone transitions отдельно от reorder/shuffle;
- только для индексных прототипов: builds, cards indexed, fork binds, COW copied bytes, overlay depth/compactions.

Существующие action/branch/location counters и `physicalLocationChanges` сохранить; они уже разделяются по enumeration/ranking/evaluation policy ([`AnalyzerDiagnosticsSession`](../../src/engine/best-move-analysis.ts#L128-L217), [`measurePhysicalCardLocationChanges`](../../src/engine/best-move-analysis.ts#L973-L994)). Для clean run counters выключены, поэтому измерительная логика не должна попадать в основное время.

### 2. Сравнить кандидатов на одном workload

Собирать отдельные commits/ветки от одной базы, не переключать реализации runtime-флагом внутри hot loop:

1. `A0` — текущая реализация;
2. `A1` — allocation-free streaming scan;
3. `A2` — direct `TemporaryCardControl.card` + streaming residual lookup;
4. `A3` — `A2` + устранение повторных `find -> remove/reorder` через resolved handles;
5. `A4` — `A3` + dense `cardsBySlot`, только если residual lookup остаётся hotspot;
6. `A5` — `A3` + shared/COW zone membership и one-zone scan;
7. `A6` — полный maintained `Map` как контроль максимальной скорости произвольного lookup.

Persistent overlays и DFS undo-log не входят в первый тур. Они получают отдельный прототип только если `A4/A5/A6` измеренно упираются в fork или retained memory.

### 3. Correctness gate до измерений

Обязательные проверки:

- control-handle после grant указывает на exact object из физической зоны;
- source/child/two siblings имеют разные `control.card`, но в каждом state это тот же object, что лежит в его зоне;
- move, reorder, shuffle и Defense rollback сохраняют валидность handle;
- detach/destroy удаляет temporary control до следующего controlled-object read;
- attack-chain recurrence key и Analyzer result fingerprint совпадают с A0;
- oracle-test: allocation-free locator после каждого Ledger move/remove/reorder/insert совпадает с `listPhysicalCardLocations`;
- поочерёдно выполнить `descriptor.replace` для каждой из `6P+9` зон; существующий suite уже перечисляет и заменяет все descriptors ([`control-ledger-zones.test.ts`](../../tests/control-ledger-zones.test.ts#L30-L108));
- end-turn cleanup, draw без reshuffle, refill+shuffle, market refill, Mayhem batch transfer;
- same-zone reorder и shuffle: zone lookup неизменен, exact list indexes соответствуют массиву;
- detached remove/restore и missing ID;
- source/child/sibling forks возвращают разные cloned card objects и не видят чужих moves;
- индексные кандидаты отдельно проходят first-read/first-write/rollback/COW isolation cases;
- обычный и instrumented Analyzer дают одинаковые lines; такой контракт уже проверяется ([`analyzer-diagnostics.test.ts`](../../tests/analyzer-diagnostics.test.ts#L104-L142));
- все reference profiles дают тот же `resultFingerprint`, workload volume, line/action/branch/choice counts и не меняют RNG-dependent результаты.

### 4. Microbench для объяснения результата

В отдельном процессе на фиксированном двух-player state измерить:

- `getControlledCards` с `C = 0, 1, 4, 16`: текущий ID lookup, direct handle и малый memo;
- 1 млн повторов: hit в early zone, hit в `playedThisTurn`, hit в late common zone, miss;
- серия `100 reads : 1 move`, `10 reads : 1 move`, `1 read : 1 move`;
- batch end-turn и market flow;
- 10 тыс. forks с `C = 0/1/4`, без lookup, с одним lookup и с 10 lookups;
- сохранение 10 тыс. terminal-like states и peak RSS после GC boundary;
- shuffle/reorder большой deck без membership updates.

Microbench не заменяет Analyzer: он нужен, чтобы отделить lookup, mutation, fork и memory costs. Для retained memory записывать `rss`, `heapUsed`, `external`, `arrayBuffers` и V8 heap spaces; Node документирует `v8.getHeapSpaceStatistics()` как раздельную статистику `new_space`, `old_space` и других heap spaces ([Node.js v22 API](https://github.com/nodejs/node/blob/v22.17.0/doc/api/v8.md)). Heap snapshot запускать отдельно: он блокирует event loop и требует около удвоенного размера heap.

### 5. Analyzer measurement

Порядок соответствует репозиторному benchmark-контракту: один прогрев, три измерения, отдельные clean/diagnostic/CPU/allocation процессы; clean timing сравнивать только при одинаковых workload/environment fingerprints и одном pair ID ([`docs/benchmarks/README.md`](../../docs/benchmarks/README.md#L36-L67), [`docs/benchmarks.md`](../../docs/benchmarks.md#L31-L57)).

Этапы:

1. `light` — отсеять semantic ошибки и явные регрессии;
2. `typical` — проверить общий выигрыш;
3. `heavy` — основной выбор A2/A3 против лучшего индексного кандидата;
4. не менее 10 свежепроцессных matched AB/BA-пар для двух финалистов на одной машине; официальную E1 baseline не переписывать;
5. для победителя — штатный PR performance gate на всех профилях и simulation benchmark.

### 6. Критерии выбора

Кандидат принимается, если одновременно:

- `resultFingerprint` и deterministic behavior совпадают с базой;
- line/ranked-line/action/branch/choice volumes совпадают;
- heavy clean median — лучший из корректных кандидатов в парных запусках;
- `listPhysicalCardLocations` исчезает из верхних CPU hotspots point-read path;
- production `getControlledCards` показывает handle-hit без global lookup;
- location-records от point lookup становятся нулевыми; полные lists остаются только у реальных enumeration consumers;
- GC и sampled project allocations существенно снижаются, а не перемещаются в clone/index build;
- peak RSS не ухудшается materially на heavy и terminal-state stress;
- light/typical/simulation не имеют подтверждённой регрессии по действующему E1 контракту.

Победитель выбирается по whole-run heavy time. При статистически неразличимом времени tie-break: меньший retained-memory slope, затем меньший GC/allocation cost, затем менее stateful решение. Поэтому direct handle выигрывает ничью у dense/COW/Map.

## Сложность и риски

### Оценка

- Direct control-handle, fingerprint projection и focused fork/rollback tests: 1–2 рабочих дня.
- Allocation-free streaming locator, raw traversal и устранение соседних double-lookups: 1–2 дня.
- Call-site counters и парные benchmark/profiling: 1–2 дня машинного времени и анализа.
- Dense/COW прототип, только если нужен после re-profile: ещё 2–4 дня.

Итого для основного handle+streaming варианта: примерно 3–5 инженерных дней. Полный индекс не входит в обязательную реализацию. Persistent overlay/undo-log — отдельная исследовательская ветка, а не скрытая часть задачи.

### Обязательные условия реализации

Первые три пункта — не открытые архитектурные риски, а проверяемые требования к готовому изменению:

1. `TemporaryCardControl` хранит одну ссылку `card`, а stable ID всегда берётся как `card.instanceId`; дублирующего ID и дополнительной ссылки нет.
2. Source, child и sibling используют разные cloned `CardInstance`, но внутри каждой ветки control и физическая зона указывают на один exact object.
3. Fingerprints и recurrence keys получают только stable ID карты и controller ID; live object не входит в сериализацию.
4. При окончательном destroy/release запись контроля удаляется. Внутренний detach допустим только внутри операции, которая не вызывает controlled reads до commit/rollback.
5. Invariant проверяет одновременно ID, физическое membership и object identity control-handle.

Остаются только измерительные вопросы: достаточно ли handle+streaming на других workloads и не появляется ли следующий hotspot. Они проверяются call-site counters и `light`/`typical`/`heavy`/simulation profile. Dense/COW/Map разрешаются только по доказанному остатку. Proxies, WeakRef, parsing `card-N`, HAMT/overlays и DFS-global index исключаются без отдельного измеренного основания.

## Итоговая рекомендация

Не начинать с поддерживаемого индекса членства. Фактический профиль показывает более дешёвое решение: **прямая branch-local ссылка в `TemporaryCardControl` плюс allocation-free streaming locator для остаточных запросов**. Это устраняет главный hotspot, не создавая таблицу на каждую ветку и практически не увеличивая состояние: ссылка заменяет уже хранимый ID, а fork перепривязывает её в существующем clone graph.

Параллельно убрать очевидные повторные разрешения уже известной карты. После этого повторно снять `heavy` profile. Только если произвольный residual lookup остаётся существенным, сравнивать dense `cardsBySlot` и COW membership+one-zone scan с полным `Map`.

Иными словами, «магический» способ здесь есть не как трюк TypeScript, а как более точная модель данных: **не терять уже известный объект и не восстанавливать его по ID сотни тысяч раз**. Это даёт максимальный шанс получить ускорение без постоянной цены каждой ветки.
