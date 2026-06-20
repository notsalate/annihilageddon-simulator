# Крутагидон 2 Simulation Codex

Локальный headless-проект для разработки детерминированного симулятора настольной игры "Эпичные схватки боевых магов: Крутагидон 2".

Цель проекта - прогонять партии, изучать закономерности игры, сравнивать стратегии, проверять правила и отлаживать поведение ботов на воспроизводимых seed.

## Текущий статус

Сделана первая runnable v0-версия симулятора.

Она умеет:

- загружать v0 data pack из runtime-данных: `data/packs/`, `data/cards/`, `data/tokens/`, `data/decks/`, `data/stacks/` и `data/pools/`;
- валидировать executable data pack и запрещать runtime-ссылки на `data/import/**`;
- создавать детерминированное начальное состояние по seed;
- создавать отдельные card instances для игроков и общих колод;
- вести базовый action loop для 2 игроков;
- перечислять legal actions и применять выбранное действие;
- играть карты из руки;
- покупать карты из main market, Legend market и wild magic stack;
- активировать поддержанные permanents и wizard properties;
- завершать ход с cleanup, добором и переходом активного игрока;
- учитывать permanents как отдельную зону;
- исполнять mapped runtime effects для power, chips, draw, gain/discard/destroy, reveal/play top deck, Wild Magic choice и play-top-card-from-foe-deck;
- исполнять combat/effect-пути: damage, healing, set life, defense window, multi-target attack и Mayhem-style two-phase ordering;
- обрабатывать смерть игрока, выдачу DWT, resurrection и Basic Trophy credit для player-caused kills;
- применять market chip markers;
- применять supported wizard property setup, activation, on-play-card, on-gain-card, end-turn и modifier effects;
- считать effective values для стоимости карт, VP карт, VP токенов и max life игрока;
- завершать игру по v0 end conditions;
- считать winner/tie по VP, Legend count и DWT count;
- запускать одиночную партию;
- запускать массовые партии с compact summary и aggregate analytics;
- форматировать первичный human-readable debug trace одной партии из event log.

Это v0-симулятор, а не полная реализация всех правил и карт.

## Что умеет baseline bot

`baselineBot` намеренно простой. Он каждый ход выбирает первое доступное действие по приоритету:

1. сыграть первую legal карту из руки;
2. купить самую дорогую доступную карту из main market, Legend market или wild magic stack;
3. завершить ход.

Legal action layer уже умеет показывать activation actions для permanents и wizard properties, но текущий baseline bot сам их не выбирает. Для анализа стратегий это отдельная следующая задача: бот должен научиться оценивать activation actions, защиту, покупку, порядок розыгрыша и состояние партии.

## Реализованные механики v0

### Setup и данные

- загрузка runtime card definitions из `data/cards/`;
- загрузка runtime token definitions из `data/tokens/dead-wizard/` и `data/tokens/wizard-property/`;
- загрузка deck, stack и pool compositions из `data/decks/`, `data/stacks/` и `data/pools/`;
- отдельные runtime JSON и import-сырье: `data/import/**` не является входом движка;
- deterministic seeded shuffle;
- starter decks, main market, Legend market, wild magic stack, limp wand stack;
- neutral DWT stack;
- стартовая раздача wizard properties;
- setup effects wizard properties: замена стартовой карты, стартовый Basic Trophy, forced starting player, starting life override.

### Action loop

- `playCard`;
- `buyMarketCard` из main market, Legend market и wild magic stack;
- `activatePermanent`;
- `activateWizardProperty`;
- `endTurn`;
- cleanup non-permanents в сброс владельца;
- добор руки с shuffle discard into deck;
- run Market Flow for main/Legend markets.

### Effects и карты

- `add_power`;
- `gain_chips`;
- `draw_cards`;
- `gain_card`;
- `discard_card`;
- `destroy_card`;
- `reveal_top_card`;
- `play_top_card`;
- `wild_magic_choice`;
- `play_top_card_from_foe_deck`;
- `modify_effective_value`;
- market chip marker.

### Combat, death, Trophy

- `deal_damage`;
- `attack_damage`;
- `multi_target_attack`;
- `mayhem_attack`;
- `avoid_attack`;
- defense destinations: discard self и topdeck self;
- defense costs: discard other hand card, spend chips, pay nonlethal life;
- immediate death resolution;
- DWT gain and resurrection;
- resurrection life replacement from wizard property;
- Basic Trophy credit for supported player-caused kills;
- Basic Trophy chip at end of controller turn.

### Wizard properties

Runtime JSON лежит в `data/tokens/wizard-property/`.

- `esw2_dbg__wizard_property_001`, `002`, `004`-`010` executable в v0;
- `esw2_dbg__wizard_property_003` есть как runtime token definition, но `playableInV0: false`, потому что нет familiar lifecycle и dynamic "familiar counts as legend";
- supported property surfaces: setup, activation, on-play-card trigger, on-gain-card destination replacement, end-turn draw count modifier, effective value modifier, owned-wand attack replacement.

## Ограничения v0

Пока не реализованы полностью:

- полный rules-accurate attack/defense flow за пределами fixture-срезов;
- полноценные DWT faces/effects;
- полный lifecycle беспределов и мегабеспределов: Market Flow, destroy-event pile и replacement;
- фамильяры;
- `esw2_dbg__wizard_property_003` и любые эффекты, завязанные на familiar lifecycle;
- Trophy за пределами Basic Trophy credit/chip behavior;
- все typed effect handlers для полного набора карт;
- стратегия baseline bot за пределами play/buy/end-turn;
- полноценный пошаговый debug-view партии с turn numbers, before/after state и CLI-флагом.

Некоторые mapped effects в данных уже есть, но runtime v0 исполняет только небольшой набор поддержанных эффектов.

## Как искать ошибки в механиках

Для багов класса "данные лежат не в том слое", "карта ушла не в ту зону", "эффект сработал не от того владельца" проверяй путь сверху вниз.

1. Runtime manifest:
   - `data/packs/v0-first-batch.json`;
   - runtime manifest не должен ссылаться на `data/import/**`;
   - `git ls-files data/import` должен быть пустым для новых import-файлов.

2. Runtime data:
   - карты: `data/cards/**/*.json`;
   - токены и свойства: `data/tokens/**/*.json`;
   - pack manifests: `data/packs/*.json`;
   - настоящие колоды: `data/decks/*.json`;
   - card/token stacks: `data/stacks/**/*.json`;
   - pools: `data/pools/*.json`;
   - executable объект должен иметь stable ID, `runtimeSchema`, mapped `engine.effects`, а не только OCR/draft text.

3. Setup:
   - `src/engine/setup.ts`;
   - проверяй instance creation, `ownerId`, стартовые зоны, wizard property setup effects, forced starting player.

4. Legal actions:
   - `src/engine/actions.ts`;
   - проверяй, что действие появляется только когда оно legal, и что `applyAction` не меняет состояние при illegal action.

5. Effect runtime:
   - `src/engine/effect-runtime.ts`;
   - проверяй source player, target player, `ownerId`, destination zone, event log;
   - для багов владения особенно смотри helpers движения карт: gain, discard, destroy, play resolved card, cleanup.

6. Effective values:
   - `src/engine/effective-values.ts`;
   - проверяй, что modifiers читаются из controlled object view и не мутируют base definitions.

7. Tests:
   - `tests/setup.test.ts` - setup, стартовые свойства, reproducibility;
   - `tests/action-loop.test.ts` - play/buy/end-turn/effects/combat/card movement;
   - `tests/effective-values.test.ts` - modifiers и controlled objects;
   - `tests/debug-trace.test.ts` - readable trace format для одной партии;
   - `tests/validation.test.ts` - запреты на unsupported effects, draft executable и import-only runtime paths;
   - `tests/simulation.test.ts` - end conditions, scoring, reproducibility;
   - `tests/simulation-menu.test.ts` - CLI/menu behavior.

Минимальный регрессионный тест для такого бага должен фиксировать не только event, но и физическую зону карты после действия: у кого карта в руке, колоде, сбросе, `playedThisTurn`, `permanents`, market или destroyed pile. Для ошибок типа шальной магии отдельно проверяй `ownerId` и destination: сыгранная чужая карта после cleanup должна попасть в сброс владельца, а не игрока, который временно её сыграл.

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
- Первичный debug trace форматирует event log в читаемый вид; полная instrumentation для before/after state еще не завершена.
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

Проверить draft JSON импорта:

```powershell
npm run validate:drafts
```

Запустить тесты:

```powershell
npm test
```

Собрать TypeScript:

```powershell
npm run build
```

Запустить русское интерактивное меню симулятора:

```powershell
npm run simulate
```

Меню позволяет выбрать:

- `Одна партия` - запускает одну завершенную партию. Можно ввести seed или нажать Enter для случайного seed.
- `Массовый прогон` - запускает серию партий. Можно ввести количество партий или нажать Enter для значения по умолчанию `10000`.
- `Выход` - закрывает меню.

После завершения меню показывает русскую сводку на экране и возвращается в главное меню по Enter. При неожиданной ошибке меню пишет короткое сообщение и сохраняет технический отчет в `.scratch/runs/errors/`.

Скриптовые команды для агентов и разработчиков:

Запустить одну партию без меню:

```powershell
npm run simulate:single -- --seed 60615 --maxTurns 200
```

Запустить массовый прогон без меню:

```powershell
npm run simulate:mass -- --firstSeed 9000 --games 100 --maxTurns 200
```

При одинаковых seed, данных и коде результат должен повторяться.

## Текущая структура

```text
data/
  cards/      runtime card definitions by source group
  decks/      true card deck compositions
  import/     source text and draft import data, not engine input
  packs/      data pack manifests
  pools/      runtime pool compositions
  stacks/     shuffled card and token stack compositions
  tokens/     runtime token definitions
docs/
  rules-canon.md
  import-pipeline.md
  runtime-layout.md
  single-game-debug-trace.md
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
- `src/engine/debug-trace.ts` - readable trace formatter for single-game event logs.
- `src/cli/run-single-game.ts` - CLI для одной партии.
- `src/cli/run-mass-simulation.ts` - CLI для массового прогона.

## Документы

- `docs/rules-canon.md` - технический канон правил для engine implementation.
- `docs/import-pipeline.md` - справочник для `.md -> draft JSON -> runtime JSON` импорта.
- `docs/runtime-layout.md` - текущий контракт runtime/import layout.
- `docs/mechanics-coverage.md` - краткая сводка реализованных/частичных механик.
- `docs/rules-glossary.md` - глоссарий терминов.
- `docs/rules-open-questions.md` - неоднозначности и открытые вопросы.
- `docs/single-game-debug-trace.md` - формат читаемого trace одной партии и недостающая instrumentation.
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

## Импорт данных

Полный импорт карт, свойств волшебников и жетонов мертвого волшебника идет отдельным пайплайном. Подробности: `docs/import-pipeline.md`.

1. Пользователь добавляет изображения в `assets/**/raw/*.{webp,png,jpg,jpeg}`.
2. OCR/source extraction создает markdown в `data/import/**/*-texts/*.md`.
3. Draft JSON agent создает неисполняемый draft JSON в `data/import/**/*-drafts/*.json`.
4. Engine Mapping agent создает runtime JSON в `data/cards/`, `data/tokens/`, `data/decks/`, `data/stacks/`, `data/pools/` или `data/packs/`.

Runtime engine читает mapped JSON data. Он не должен читать OCR markdown, draft JSON или парсить natural-language text во время партии.

## Ближайшие направления

- Добавить full debug/trace instrumentation и CLI-режим для пошагового просмотра партии.
- Расширять typed effect handlers.
- Расширять mayhem/mega-mayhem resolution за пределы fixture ordering.
- Расширять combat/death/DWT workflow до полного rules model.
- Улучшать baseline bots и добавлять стратегии для сравнения.
