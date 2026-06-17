# Крутагидон 2 Simulation Codex

Локальный headless-проект для разработки детерминированного симулятора настольной игры "Эпичные схватки боевых магов: Крутагидон 2".

Цель проекта - прогонять партии, изучать закономерности игры, сравнивать стратегии, проверять правила и отлаживать поведение ботов на воспроизводимых seed.

## Текущий статус

Сделана первая runnable v0-версия симулятора.

Она умеет:

- загружать v0 card/deck data pack из `data/cards/` и `data/decks/`;
- создавать детерминированное начальное состояние по seed;
- создавать отдельные card instances для игроков и общих колод;
- вести базовый action loop для 2 игроков;
- перечислять legal actions и применять выбранное действие;
- играть карты из руки;
- покупать карты из main market, Legend market и wild magic stack;
- завершать ход с cleanup, добором и переходом активного игрока;
- учитывать permanents как отдельную зону;
- исполнять часть fixture combat/effect-путей: damage, healing, defense window, multi-target attack и Mayhem-style two-phase ordering;
- обрабатывать смерть игрока, выдачу DWT, resurrection и Basic Trophy credit для normal attack kill в текущем fixture-срезе;
- завершать игру по v0 end conditions;
- считать winner/tie по VP, Legend count и DWT count;
- запускать одиночную партию;
- запускать массовые партии с compact summary и aggregate analytics.

Это v0-симулятор, а не полная реализация всех правил и карт.

## Ограничения v0

Пока не реализованы полностью:

- полный rules-accurate attack/defense flow за пределами fixture-срезов;
- полноценные DWT faces/effects;
- полный lifecycle беспределов и мегабеспределов: market refill, destroy-event pile и replacement;
- свойства колдунов;
- фамильяры;
- Trophy за пределами Basic Trophy credit/chip behavior;
- Dingler;
- все typed effect handlers для полного набора карт;
- удобный пошаговый debug-view партии.

Некоторые mapped effects в данных уже есть, но runtime v0 исполняет только небольшой набор поддержанных эффектов.

## Основные решения

- Симулятор headless: UI не является целью.
- Основной интерфейс - консольные команды и TypeScript API.
- Ядро написано на TypeScript в strict mode.
- Симуляции воспроизводимы через seeded RNG.
- `Math.random()` в engine-коде запрещен.
- Карты хранятся как JSON-данные.
- Поведение карт должно реализовываться через явные typed handlers, а не через парсинг текста карты во время партии.
- Боты выбирают только из legal actions, правила применяет engine.
- Одиночная партия может возвращать event log для отладки.
- Массовые прогоны по умолчанию используют compact summaries, а не полный debug log.

## Команды

Посмотреть доступные npm scripts:

```powershell
npm run
```

Проверить типы:

```powershell
npm run typecheck
```

Запустить тесты:

```powershell
npm test
```

Собрать TypeScript:

```powershell
npm run build
```

Запустить одну партию:

```powershell
npm run simulate:single -- --seed 60615 --maxTurns 200
```

Запустить массовый прогон:

```powershell
npm run simulate:mass -- --firstSeed 9000 --games 100 --maxTurns 200
```

При одинаковых seed, данных и коде результат должен повторяться.

## Текущая структура

```text
data/
  cards/      runtime card definitions
  decks/      runtime deck compositions and v0 data pack manifest
  import/     OCR/import intermediate data
docs/
  rules-canon.md
  simulation-scope.md
  card-json-guide.md
src/
  cli/        console runners
  engine/     deterministic simulation engine
tests/        node:test coverage for engine behavior
.scratch/     local issues, PRD, handoffs
```

## Runtime modules

- `src/engine/data.ts` - загрузка v0 data pack.
- `src/engine/setup.ts` - deterministic game initialization.
- `src/engine/actions.ts` - legal actions and action application.
- `src/engine/effect-runtime.ts` - supported typed effect handlers and fixture combat resolution.
- `src/engine/effective-values.ts` - effective card/token/player value modifiers from controlled objects.
- `src/engine/simulation.ts` - single-game runner, scoring, baseline bot.
- `src/engine/mass-simulation.ts` - mass runner and aggregate analytics.
- `src/cli/run-single-game.ts` - CLI для одной партии.
- `src/cli/run-mass-simulation.ts` - CLI для массового прогона.

## Документы

- `docs/rules-canon.md` - технический канон правил для engine implementation.
- `docs/simulation-scope.md` - scope симуляции и v0-границы.
- `docs/card-json-guide.md` - справочник для OCR -> JSON и базовой типизации карт.
- `docs/rules-glossary.md` - глоссарий терминов.
- `docs/rules-open-questions.md` - неоднозначности и открытые вопросы.
- `.scratch/krutagidon-simulation-platform/PRD.md` - PRD для разработки симулятора и пайплайна данных.
- `AGENTS.md` - рабочие правила для Codex в этом репозитории.
- `Pravila_Krutagidon_2.pdf` - основной русский источник правил.
- `ESW2-DBG-Rulebook-low_res.pdf` - дополнительный справочник для сверки.

## Условия конца партии в v0

Партия заканчивается, если:

- основная колода не может пополнить main market;
- колода Легенд не может пополнить Legend market;
- DWT stack пуст, если он доступен в состоянии.

`maxTurns` используется только как техническая защита от бага или вечного цикла и помечается как non-game termination.

## Определение победителя

Победитель определяется так:

1. Больше всего VP.
2. Если ничья - больше всего карт Легенд.
3. Если снова ничья - меньше DWT.
4. Если снова ничья - настоящая ничья.

При scoring учитываются карты игрока:

- в руке;
- в колоде;
- в сбросе;
- в `playedThisTurn`;
- в owned `permanents`.

Чипсы не дают VP.

## Модель карт

Проект различает три сущности:

- Card definition - уникальное описание карты.
- Deck composition - сколько копий каких карт входит в колоду.
- Card instance - конкретная копия карты в конкретной партии.

Один JSON-файл описывает одну уникальную карту. Количество копий хранится отдельно в составе колоды.

`cardId` не должен зависеть от OCR-названия карты. Русское название хранится отдельно как видимое поле.

## Импорт карт

Полный импорт карт идет отдельным пайплайном:

1. Пользователь добавляет изображения карт в `assets/cards/raw/*.{webp,png,jpg,jpeg}`.
2. OCR agent создает `data/import/card-texts/<card-id>.md`.
3. Card JSON agent создает `data/import/card-drafts/<card-id>.json`.
4. Engine Mapping agent создает финальные runtime-поля для `data/cards/<card-id>.json`.

Runtime engine читает mapped JSON data. Он не должен читать OCR markdown и не должен парсить natural-language card text во время партии.

## Ближайшие направления

- Добавить debug/trace режим для пошагового просмотра партии.
- Расширять typed effect handlers.
- Расширять mayhem/mega-mayhem resolution за пределы fixture ordering.
- Расширять combat/death/DWT workflow до полного rules model.
- Улучшать baseline bots и добавлять стратегии для сравнения.
