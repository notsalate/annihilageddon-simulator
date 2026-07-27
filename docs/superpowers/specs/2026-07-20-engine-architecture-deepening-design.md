# Углубление runtime-модулей движка

## Цель

Закрыть находки ревью PR #136 и последовательно углубить пять архитектурных кандидатов, не меняя печатные правила карт и не объединяя ветку с `master` без отдельного разрешения владельца репозитория.

## Обязательные ограничения

- Работа ведётся только в ветке `agent/architecture-deepening-findings` и отдельном draft PR.
- PR нельзя переводить в ready, включать auto-merge или объединять с `master` без явного разрешения пользователя.
- Каждый finding получает собственный логический commit.
- Каждый архитектурный кандидат разбивается на independently reviewable части; один commit не должен одновременно завершать весь кандидат.
- Изменения поведения выполняются через TDD: сначала воспроизводящий тест, затем минимальная реализация, затем рефакторинг на зелёном наборе тестов.
- Mayhem и Mega Mayhem остаются отдельным domain flow и не сворачиваются в обычную player-controlled attack.
- Внешних зависимостей, изменений package manager и широких CI/CD-изменений нет.

## Findings

### F1. Добровольная защита проходит через typed choice policy

Текущий `findFirstLegalDefense` автоматически выбирает первую оплачиваемую карту. Новый путь должен:

- построить стабильный список legal defense choices;
- добавить явный вариант отказа;
- вызвать общий `effectChoiceStrategy` через typed choice hook;
- проверить identity выбранной option;
- сохранить существующий детерминированный fallback, но fallback для добровольной защиты должен быть `decline`, а не первая карта;
- записывать `defenseChoiceSelected` только после реального выбора карты.

### F2. Разрешение защиты атомарно

Defense costs, перемещение defense card и branch effects образуют одну транзакцию игрового правила. При ошибке ветки состояние не должно оставаться частично изменённым. Реализация использует предварительную проверку и локальный snapshot затрагиваемых mutable collections/values с rollback до возврата ошибки. Snapshot создаётся только после выбора и identity validation реальной defense card, непосредственно перед первой мутацией; `decline` не форкает RNG и не копирует состояние. Успешная защита по-прежнему сохраняет порядок событий и перенаправление.

### F3. Reusable defense fixtures принадлежат `tests/helpers/`

Конфигурируемый builder защиты переносится из `tests/action-loop.test.ts` в отдельный helper с typed options. Тестовый файл использует публичный helper и больше не владеет созданием runtime definition/instance защиты. Helper выдаёт state-wide unique fixture IDs, `selectFirstFixtureDefense` пропускает production-карты, а сценарии с конкретной defense используют selector по ожидаемому `instanceId`.

## Архитектурный кандидат 1: глубокий модуль Attack Resolution

`attack-resolution.ts` владеет полным lifecycle обычной player-controlled атаки через единый public seam `resolvePlayerControlledAttack(intent, adapters)`. Он разрешает target plan, не создавая attack instrumentation для пустого или ошибочного результата, затем создаёт общий context и `attackCreated`, полностью разрешает каждую цель, управляет Defense/redirect recursion, выбирает момент damage/death boundary, выполняет outcome branches, собирает attribution, пишет остальные attack events и запускает after-attack hooks. Следующая цель не начинается до завершения текущей; первая ошибка или `gameEnd` останавливает оставшийся lifecycle.

`attack-defense.ts` остаётся transactional submodule: legality, immutable payment plan, payment/movement/branch commit, redirect callback внутри snapshot boundary и полный rollback. Redirect resolver передаётся только владельцем lifecycle — Attack Resolution.

`effect-runtime-registry.ts` переводит concrete typed attack payload в intent и не владеет target loop, Defense, damage/death, branches, attribution или after-attack sequencing. `effect-runtime.ts` предоставляет узкие adapters к selector, generic damage/death primitive, Defense transaction, catalog branch execution и Trigger Dispatch.

Mayhem и Mega Mayhem сохраняют отдельный двухфазный domain flow и не используют ordinary player-controlled resolver.

### A1. Единый lifecycle context

Top-level context хранит original attacker/source, общий per-attack Defense usage и завершённые target resolutions. Для каждой цели создаётся current context с current attacker/source и amount state; redirect меняет current identity, но сохраняет original source и общий usage.

### A2. Последовательное разрешение целей

Attack Resolution сначала получает стабильный ordered target plan. Ошибка или пустой target set завершаются без `attackCreated`; после успешного непустого target resolution typed choice event уже записан, и только затем создаётся `attackCreated`. Далее модуль полностью завершает Defense, redirect, impact, immediate death/DWT consequences и outcome branches текущей цели до `attackTargetStarted` следующей. Amount вычисляется заново из актуального state для каждой цели. Условие продолжения цепной атаки относится к запрошенной цели: redirect сохраняет attribution и результат перенаправленной ноги, но не считается смертью исходного защищавшегося игрока.

### A3. Transactional Defense и redirect

Defense module атомарно применяет payment, movement и branch effects. Redirect рекурсивно возвращается в Attack Resolution через callback, созданный владельцем lifecycle; ошибка redirected path откатывает snapshot, RNG, events и usage sets исходной Defense transaction.

### A4. Attribution и after-attack boundary

После всех целей Attack Resolution агрегирует только положительный фактически нанесённый damage по current attacker/source и последовательно вызывает after-attack adapters. Fully avoided, no-damage и non-damage attacks не потребляют eligibility первого damaging attack.

## Архитектурный кандидат 2: глубокий module Control Ledger

### C1. Единые queries контроля и физический inventory

`src/engine/control-ledger.ts` владеет controller-to-object relation и единым descriptor inventory всех физических card locations, включая array- и singleton-зоны. Lookup, inventory traversal и removal используют этот inventory; `effective-values.ts`, Effect Runtime и snapshot consumers не сканируют и не реконструируют зоны самостоятельно.

### C2. Lifecycle временного контроля

Grant/release temporary control проходят только через Control Ledger. End-turn cleanup и fork используют его публичные данные/операции.

### C3. Перевести consumers

Actions, conditions, activation и controlled-cost selection используют общий all-controlled query. Passive power и attack replacements используют отдельный ongoing-controlled query. Trigger discovery применяет timing-aware policy: `onPlayCard` и after-attack reactions требуют ongoing card, а end-turn discovery сохраняет временный контроль до cleanup. Ownership и control остаются разными понятиями.

## Архитектурный кандидат 3: глубокий module Trigger Dispatch

### T1. Catalog-owned controlled-card dispatcher

`src/engine/trigger-dispatch.ts` принимает только `GameState`, controller и discriminated typed operation. Внутри одной границы он строит `ControlledObjectView`, читает runtime mode из state, выбирает timing, применяет ongoing policy, создаёт card source identity, разрешает Effect Runtime Catalog entry и вызывает operation-specific method. Raw effect, predicate, executor callback и готовый controlled view не выходят к caller.

### T2. On-play и after-attack operations

`onPlayCard` и `afterPlayerAttackDamage` проходят через catalog-owned dispatcher. Applicability, включая Wand tag, принадлежит concrete catalog hook. Stable Control Ledger order и существующая source attribution сохраняются; non-ongoing definitions не исполняют эти ongoing reactions. Первая ошибка или `gameEnd` немедленно прекращает дальнейшие handlers, а eligibility первой damaging attack отмечается только после полного успешного dispatch.

### T3. End-turn aggregate

`collectEndTurnDrawModifier` использует тот же internal discovery/catalog pipeline и видит карты, которые остаются под временным контролем до cleanup. Catalog hooks применяют refill и max-life contracts последовательно, а caller получает typed aggregate `drawCount`, не список raw effects и не catalog-specific arithmetic switch. Сама catalog operation отвечает за source/mode checks и exact decode: ошибка decoder или catalog validation возвращается как typed error, не маскируется как `notApplicable` и останавливает aggregation до изменения draw count или game state. Trigger Dispatch не дублирует эту prevalidation.

### T4. Action-boundary preflight

`actions.ts` остаётся публичной action boundary и до делегирования `endTurn` выполняет read-only modifier preflight. `actions-core.ts` владеет последующей mutating-реализацией action. Если controlled modifier не проходит decoder/catalog validation, публичный `applyAction` возвращает `ActionResult` error до начисления Trophy chip, cleanup, событий, draw, RNG или смены активного игрока.

## Архитектурный кандидат 4: глубокий test scenario module

### S1. Единый primitive сборки focused scenarios

`tests/helpers/game-scenario.ts` владеет deterministic setup и runtime-card definition/instance assembly для новых focused integration suites. Generated-definition branch сохраняет defensive copy `engine.tags`; существующая definition branch не принимает parallel definition fields.

### S2. Узкие arrangement adapters

`givenTemporaryControl()` делегирует только production `grantTemporaryControl()` и не скрывает owner или физическую зону. `choosePlayerTargetForEffect()` выбирает exact `choiceId === target.playerId` только для указанного `RuntimeEffectId`, возвращая `undefined` для остальных effects и сохраняя безопасный fallback.

### S3. Focused suites используют общий seam

`controlled-power-ongoing.test.ts`, `attack-replacement-ongoing.test.ts`, `trigger-dispatch-ongoing.test.ts` и `trigger-dispatch.test.ts` не объявляют локальные runtime-card builders, manual branded IDs или параллельные definition/instance literals. Ownership, physical zone и temporary controller остаются явно видны в setup; helper не превращается в универсальный DSL и не требует массовой миграции legacy `action-loop.test.ts`.

## Архитектурный кандидат 5: глубокий typed Effect Decoder/Catalog seam

### D1. Исчерпывающая карта concrete payload variants

`runtime-effect.ts` объявляет explicit `RuntimeEffectPayloadMap` без index signature, conditional fallback и общего bag полей. Шесть групп payload покрывают каждый зарегистрированный `RuntimeEffectId`; `RuntimeEffectForId<Id>` и общий discriminated union выводятся только из этой карты.

### D2. Exact decoder на data boundary

`runtime-effect-decoder.ts` содержит concrete decoder для каждого зарегистрированного ID, включая честно unsupported effects. Каждый decoder проверяет literal `effectId`, допустимый timing, точный набор верхнеуровневых полей и concrete nested shapes для targets, conditions, costs, options и branches. Лишние поля и неверные значения отклоняются до попадания в runtime state.

### D3. Typed catalog closure до handler boundary

`effect-runtime-registry.ts` связывает decoder, concrete handler, runtime modes и source kinds через generic entry factory. Публичная catalog operation принимает raw `unknown`, выполняет decode и передаёт handler-у concrete payload внутри одной closure; caller не получает расширенную пару из общего handler и общего payload и не соединяет их assertions. Setup, обычное выполнение, on-play, after-attack и end-turn modifiers используют тот же безопасный seam.

### D4. Завершённая граница

Registered effects не используют `RuntimeEffectFields`, payload fallback, partial exact-field map или assertions `as RuntimeEffectPayload`/`as RuntimeEffectForId` между decode и handler. Compile-time exhaustiveness, deletion tests, validation runtime suites и `check:engine-typed-access` закрепляют эту границу.

## Error handling

- Некорректный choice identity отклоняется и использует безопасный deterministic fallback.
- Отказ от защиты не мутирует состояние, не пишет событие использования карты и не создаёт rollback snapshot.
- Ошибка defense branch откатывает costs, zones, usage sets и связанные turn/player values, затем возвращается вызывающему effect path.
- Attack redirect не меняет original source identity и не создаёт attacker для ownerless Mayhem.
- Ошибка target resolution обычной атаки и пустой target set не оставляют `attackCreated` или частичную attack instrumentation.
- Malformed end-turn controlled modifier возвращает typed catalog/action error до первой мутации и сохраняет physical zones, resources, turn fields, event log и seeded RNG position.
- Control Ledger игнорирует stale temporary-control references при query, но debug/test guards должны обнаруживать их при валидации состояния.
- Terminal Mayhem/Mega Mayhem сохраняет terminal result, но раскрытая карта до возврата переносится в соответствующую destroyed stack; terminal event log по-прежнему останавливается на game end.

## Проверка

Минимальный gate каждого commit:

1. точечный тест изменяемого поведения;
2. `npm run typecheck` для TypeScript changes;
3. `git diff --check`;
4. после каждой архитектурной части — затронутые focused suites;
5. перед публикацией итогового состояния — `npm run check` и `npm run report:card-runtime-clusters`.

## Коммитная стратегия

Порядок фиксирован: F1 → F2 → F3 → A1–A4 → C1–C3 → T1–T4 → S1–S3 → D1–D3. Коммиты не squash-ятся в ветке: история является review surface этого PR.
