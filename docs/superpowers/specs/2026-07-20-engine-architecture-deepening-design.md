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

`attack-resolution.ts` владеет полным lifecycle обычной player-controlled атаки через единый public seam `resolvePlayerControlledAttack(intent, adapters)`. Он создаёт общий context, получает ordered targets, полностью разрешает каждую цель, управляет Defense/redirect recursion, выбирает момент damage/death boundary, выполняет outcome branches, собирает attribution, пишет attack events и запускает after-attack hooks. Следующая цель не начинается до завершения текущей; первая ошибка или `gameEnd` останавливает оставшийся lifecycle.

`attack-defense.ts` остаётся transactional submodule: legality, immutable payment plan, payment/movement/branch commit, redirect callback внутри snapshot boundary и полный rollback. Redirect resolver передаётся только владельцем lifecycle — Attack Resolution.

`effect-runtime-registry.ts` переводит concrete typed attack payload в intent и не владеет target loop, Defense, damage/death, branches, attribution или after-attack sequencing. `effect-runtime.ts` предоставляет узкие adapters к selector, generic damage/death primitive, Defense transaction, catalog branch execution и Trigger Dispatch.

Mayhem и Mega Mayhem сохраняют отдельный двухфазный domain flow и не используют ordinary player-controlled resolver.

### A1. Единый lifecycle context

Top-level context хранит original attacker/source, общий per-attack Defense usage и завершённые target resolutions. Для каждой цели создаётся current context с current attacker/source и amount state; redirect меняет current identity, но сохраняет original source и общий usage.

### A2. Последовательное разрешение целей

Attack Resolution записывает создание атаки, получает стабильный ordered target plan и полностью завершает Defense, redirect, impact, immediate death/DWT consequences и outcome branches текущей цели до `attackTargetStarted` следующей. Amount вычисляется заново из актуального state для каждой цели.

### A3. Transactional Defense и redirect

Defense module атомарно применяет payment, movement и branch effects. Redirect рекурсивно возвращается в Attack Resolution через callback, созданный владельцем lifecycle; ошибка redirected path откатывает snapshot, RNG, events и usage sets исходной Defense transaction.

### A4. Attribution и after-attack boundary

После всех целей Attack Resolution агрегирует только положительный фактически нанесённый damage по current attacker/source и последовательно вызывает after-attack adapters. Fully avoided, no-damage и non-damage attacks не потребляют eligibility первого damaging attack.

## Архитектурный кандидат 2: глубокий module Control Ledger

### C1. Единые queries контроля

Новый `src/engine/control-ledger.ts` владеет поиском контролируемых карт, физическим поиском card location и удалением карты из найденной зоны. `effective-values.ts` и Effect Runtime больше не сканируют зоны самостоятельно.

### C2. Lifecycle временного контроля

Grant/release temporary control проходят только через Control Ledger. End-turn cleanup и fork используют его публичные данные/операции.

### C3. Перевести consumers

Actions, conditions, activation и controlled-cost selection используют общий all-controlled query. Passive power и attack replacements используют отдельный ongoing-controlled query. Trigger discovery применяет timing-aware policy: `onPlayCard` и after-attack reactions требуют ongoing card, а end-turn discovery сохраняет временный контроль до cleanup. Ownership и control остаются разными понятиями.

## Архитектурный кандидат 3: глубокий module Trigger Dispatch

### T1. Общий controlled-card dispatcher

Новый `src/engine/trigger-dispatch.ts` получает timing, `ControlledObjectView`, runtime mode, optional predicate и caller-supplied executor. Он стабильно фильтрует эффекты, применяет timing-aware ongoing guard, строит source identity и останавливается на error/game-end. Effect Runtime Catalog намеренно остаётся у caller: generic executor seam позволяет on-play и after-attack paths выполнять разные catalog operations без дублирования discovery policy.

### T2. Перевести on-play и after-attack triggers

`onPlayCard` и `afterFirstAttackDamageEachTurn` проходят через dispatcher. Ordering и существующие event payload сохраняются; non-ongoing сыгранные карты не могут исполнять эти ongoing reactions.

### T3. Перевести end-turn controlled effects

Расчёт hand refill/max-life modifiers использует общий discovery seam и видит карты, которые остаются под временным контролем до cleanup; арифметика effective values остаётся в owning modules.

## Архитектурный кандидат 4: глубокий test scenario module

### S1. Базовый deterministic scenario builder

Создать helper, который скрывает ручную сборку игроков, runtime cards, target/option strategy и common attack arrangements.

### S2. Отдельный suite Attack Resolution

Новые и затронутые regression tests перенести в focused test file, оставляя assertions на externally relevant outcomes/events.

### S3. Отдельный suite Control/Trigger lifecycle

Сценарии temporary control, activation, end-turn release и trigger ordering вынести из гигантского action-loop suite.

## Архитектурный кандидат 5: глубокий typed Effect Decoder/Catalog seam

### D1. Карта concrete payload variants

`runtime-effect.ts` объявляет effect-id-to-payload map для затронутых runtime effects и выводит `RuntimeEffectForId` из неё.

### D2. Narrowing на data boundary

Decoder/catalog проверяет concrete shapes для defense и ongoing modifier effects. После успешной проверки handler не читает raw `unknown` fields.

### D3. Typed handlers

Handlers для `avoid_attack`, `ongoing_add_power`, `ongoing_hand_refill_bonus`, Wand trigger, DWT power и first-attack trigger получают concrete payload types. Остальные effects сохраняют текущий совместимый путь до отдельной миграции.

## Error handling

- Некорректный choice identity отклоняется и использует безопасный deterministic fallback.
- Отказ от защиты не мутирует состояние, не пишет событие использования карты и не создаёт rollback snapshot.
- Ошибка defense branch откатывает costs, zones, usage sets и связанные turn/player values, затем возвращается вызывающему effect path.
- Attack redirect не меняет original source identity и не создаёт attacker для ownerless Mayhem.
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

Порядок фиксирован: F1 → F2 → F3 → A1–A4 → C1–C3 → T1–T3 → S1–S3 → D1–D3. Коммиты не squash-ятся в ветке: история является review surface этого PR.
