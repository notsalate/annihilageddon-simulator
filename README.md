# Крутагидон 2 Simulation Codex

Локальный headless-проект для разработки детерминированного симулятора настольной игры "Эпичные схватки боевых магов: Крутагидон 2".

Проект нужен для воспроизводимых прогонов партий по seed, проверки правил, сравнения стратегий и постепенного переноса карточной логики в typed runtime-модель на TypeScript.

> [!NOTE]
> Это рабочая `v0`-версия симулятора. Она уже запускает партии и покрывает заметную часть механик, но ещё не является полной rules-accurate реализацией всей игры.

## Что уже есть в v0

- deterministic engine с seeded RNG и strict TypeScript;
- runtime data pack на основе `data/cards/`, `data/tokens/`, `data/decks/`, `data/stacks/`, `data/pools/`, `data/packs/`;
- базовый action loop для 2 игроков: play, buy, activation, end turn;
- одиночные и массовые симуляции через CLI;
- начальный human-readable debug trace одной партии;
- baseline bot для воспроизводимых прогонов;
- валидация runtime-данных и запрет на использование `data/import/**` как входа движка.

## Быстрый старт

Требования:

- Node.js
- npm

Посмотреть доступные npm scripts:

```powershell
npm run
```

Собрать проект:

```powershell
npm run build
```

Проверить типы:

```powershell
npm run typecheck
```

Запустить тесты:

```powershell
npm test
```

Проверить draft JSON импорта:

```powershell
npm run validate:drafts
```

Запустить интерактивное меню симулятора:

```powershell
npm run simulate
```

Примеры прямого запуска:

```powershell
npm run simulate:single -- --seed 60615 --maxTurns 200
npm run simulate:mass -- --firstSeed 9000 --games 100 --maxTurns 200
```

> [!IMPORTANT]
> Runtime engine читает только mapped runtime-данные. `data/import/**` используется для import pipeline и не должно выступать исполняемым входом движка.

## Структура репозитория

```text
src/        TypeScript engine, CLI и import-логика
data/       runtime-данные, manifests, колоды, стаки, токены и import-сырьё
docs/       правила, layout, import pipeline и технические пояснения
tests/      node:test покрытие для движка и CLI
.scratch/   локальные issue-файлы, PRD и handoff-артефакты
```

## Ключевые идеи модели

- Симулятор остаётся headless: основной интерфейс проекта сейчас CLI и TypeScript API.
- Поведение карт должно жить в explicit typed handlers, а не в runtime-парсинге natural-language текста.
- `cardId` и другие сущности используют stable IDs, а не локализованные имена.
- Проект различает `Card definition`, `Deck composition` и `Card instance`.
- При одинаковых seed, данных и коде результат симуляции должен повторяться.

Победитель в `v0` определяется по VP, затем по количеству карт Легенд, затем по количеству DWT. Чипсы VP не дают.

Партия в `v0` заканчивается, если не удаётся пополнить main market, не удаётся пополнить Legend market, либо исчерпан DWT stack, если он присутствует в состоянии. `maxTurns` используется только как технический safeguard.

## Документация

Подробные технические материалы уже вынесены в `docs/*`:

- [`docs/mechanics-coverage.md`](docs/mechanics-coverage.md) - краткая сводка реализованных и частичных механик
- [`docs/rules-canon.md`](docs/rules-canon.md) - технический канон правил для engine implementation
- [`docs/runtime-layout.md`](docs/runtime-layout.md) - текущий контракт runtime/import layout
- [`docs/import-pipeline.md`](docs/import-pipeline.md) - путь от исходников к draft JSON и runtime JSON
- [`docs/single-game-debug-trace.md`](docs/single-game-debug-trace.md) - формат текущего debug trace
- [`docs/rules-glossary.md`](docs/rules-glossary.md) - словарь терминов проекта
- [`docs/rules-open-questions.md`](docs/rules-open-questions.md) - открытые вопросы и неоднозначности

Если нужен локальный агентский workflow, используй [`AGENTS.md`](AGENTS.md). README отвечает за обзор проекта и навигацию, а не за правила поведения агента.

## Ограничения v0

Сейчас проект ещё не покрывает весь rules surface игры. В частности:

- rules coverage остаётся частичным;
- поддержаны не все typed effect handlers;
- `baselineBot` пока слабый и не умеет полноценно оценивать порядок действий;
- debug instrumentation ещё неполная и не даёт полного before/after state view;
- familiar lifecycle не реализован, поэтому часть свойств и эффектов остаётся вне `v0`.

## Ближайшие направления

- расширять typed effect handlers;
- улучшать combat, death, DWT и mayhem/mega-mayhem resolution;
- довести debug/trace instrumentation до более полного пошагового режима;
- улучшать baseline bot и добавлять более сильные стратегии;
- расширять runtime coverage без смешивания runtime и import-слоёв.
