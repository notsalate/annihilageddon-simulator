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

## Архитектурный кандидат 1: глубокая подсистема Attack Resolution

Attack Resolution является составной подсистемой из двух глубоких модулей. `attack-resolution.ts` владеет amount state, current-attacker modifiers и damage attribution; `attack-defense.ts` владеет voluntary Defense, atomic transaction, redirect chain и rollback. `effect-runtime.ts` остаётся adapter между effect handlers и этой подсистемой.

### A1. Сгруппировать lifecycle context

Заменить длинные позиционные параметры объектами, именованными по domain concepts: attack identity, amount state и per-instance defense usage. На этом шаге поведение не меняется.

### A2. Вынести расчёт attack amount

`src/engine/attack-resolution.ts` владеет базовым уроном, source-owner modifiers, current-attacker modifiers и суммированием компонентов. Callers передают именованный `AttackAmountState`; совместимый adapter в `effect-runtime.ts` может один раз восстановить state из legacy-пары `amount`/`baseAmount`, но остальной runtime не пересчитывает компоненты самостоятельно.

### A3. Вынести defense/redirect resolution

`src/engine/attack-defense.ts` владеет legal defense choices, cumulative preflight, atomic payment, card movement, branch execution, redirect chain, terminal outcome и защитой от циклов. `effect-runtime.ts` только передаёт services и адаптирует typed result обратно в effect path.

### A4. Централизовать результат и attribution

Подсистема Attack Resolution возвращает typed result для single- и multi-target paths. Агрегация фактического урона и current-attacker attribution выполняется через `attack-resolution.ts`; outcome branches остаются в Effect Runtime Catalog, но получают нормализованный result.

## Архитектурный кандидат 2: глубокий module Control Ledger

### C1. Единые queries контроля

Новый `src/engine/control-ledger.ts` владеет поиском контролируемых карт и card location. `effective-values.ts` больше не сканирует зоны самостоятельно.

### C2. Lifecycle временного контроля

Grant/release temporary control проходят только через Control Ledger. End-turn cleanup и fork используют его публичные данные/операции.

### C3. Перевести consumers

Actions, conditions, activation и controlled-cost selection используют общий all-controlled query. Passive power, attack replacements, end-turn modifiers и trigger discovery используют отдельный ongoing-controlled query/seam. Ownership и control остаются разными понятиями, а `isOngoing` не восстанавливается локальными ad hoc-проверками у каждого consumer.

## Архитектурный кандидат 3: глубокий module Trigger Dispatch

### T1. Общий controlled-card dispatcher

Новый `src/engine/trigger-dispatch.ts` получает timing/context, Controlled Object View и Effect Runtime Catalog. Он стабильно фильтрует эффекты только ongoing controlled cards, строит source identity и останавливается на error/game-end.

### T2. Перевести on-play и after-attack triggers

`onPlayCard` и `afterFirstAttackDamageEachTurn` проходят через dispatcher. Ordering и существующие event payload сохраняются; non-ongoing сыгранные карты не могут исполнять ongoing triggers.

### T3. Перевести end-turn controlled effects

Расчёт hand refill/max-life modifiers использует общий ongoing discovery seam; арифметика effective values остаётся в owning modules.

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

## Проверка

Минимальный gate каждого commit:

1. точечный тест изменяемого поведения;
2. `npm run typecheck` для TypeScript changes;
3. `git diff --check`;
4. после каждой архитектурной части — затронутые focused suites;
5. перед публикацией итогового состояния — `npm run check` и `npm run report:card-runtime-clusters`.

## Коммитная стратегия

Порядок фиксирован: F1 → F2 → F3 → A1–A4 → C1–C3 → T1–T3 → S1–S3 → D1–D3. Коммиты не squash-ятся в ветке: история является review surface этого PR.
