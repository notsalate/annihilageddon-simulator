# Крутагидон 2 Simulation Codex

Детерминированный headless-симулятор настольной игры "Эпичные схватки боевых магов: Крутагидон 2".

Проект запускает партии по seed, проверяет правила, сравнивает простые стратегии и постепенно переносит карточную логику в typed runtime-модель на TypeScript.

> [!NOTE]
> Сейчас это `v0`: симулятор уже умеет запускать партии и покрывает часть механик, но ещё не является полной rules-accurate реализацией всей игры.

## Требования

- Node.js 22 LTS или новее
- npm
- Git

Проект не публикуется как npm-пакет. Установка идёт из GitHub-репозитория.

## Установка

```powershell
git clone https://github.com/notsalate/annihilageddon-simulator.git
cd annihilageddon-simulator
npm ci
```

Проверить, что проект собрался и тесты проходят:

```powershell
npm run build
npm test
```

## Быстрый запуск

Открыть меню симулятора:

```powershell
npm run simulate
```

Запустить одну воспроизводимую партию:

```powershell
npm run simulate:single -- --seed 60615 --maxTurns 200
```

Запустить серию партий:

```powershell
npm run simulate:mass -- --firstSeed 9000 --games 100 --maxTurns 200
```

При одинаковых данных, коде и seed результат должен повторяться.

## Основные команды

| Команда                                | Что делает                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| `npm run build`                        | Собирает TypeScript в `dist/`                                       |
| `npm run check`                        | Запускает strictest typecheck, lint, guard и полный набор тестов    |
| `npm run lint`                         | Запускает type-aware ESLint для `src/**/*.ts` и `tests/**/*.ts`     |
| `npm run typecheck`                    | Проверяет типы без сборки                                           |
| `npm run typecheck:strictest`          | Запускает максимально строгую проверку TypeScript без сборки        |
| `npm test`                             | Собирает проект и запускает тесты                                   |
| `npm run simulate`                     | Открывает CLI-меню симулятора                                       |
| `npm run simulate:single`              | Запускает одну партию                                               |
| `npm run simulate:mass`                | Запускает массовую симуляцию                                        |
| `npm run validate:drafts`              | Проверяет draft JSON импорта                                        |
| `npm run report:import`                | Показывает полноту import pipeline                                  |
| `npm run report:card-runtime-clusters` | Строит актуальный planning report и matrix по card runtime clusters |
| `npm run report:runtime-coverage`      | Запускает dynamic audit runtime coverage без committed snapshot     |

Посмотреть все доступные scripts:

```powershell
npm run
```

## Что уже есть

- deterministic engine с seeded RNG;
- strict TypeScript-модель для runtime-данных;
- базовый action loop для двух игроков: play, buy, activation, end turn;
- одиночные и массовые симуляции через CLI;
- baseline bot для воспроизводимых прогонов;
- human-readable debug trace одной партии;
- валидация runtime-данных и draft JSON импорта.

### Стратегии и анализ ходов

`baselineBot` — временная простая `BotStrategy`: он разыгрывает первую допустимую карту, иначе покупает самую дорогую допустимую карту рынка, иначе завершает ход. Он не оптимизирует линию. Будущие aggressive/defensive стратегии будут моделировать решения игрока с ограниченным наблюдением.

`Best-Move Analyzer` — отдельный инструмент анализа текущего хода. Запуск: `npm run analyze:best-move -- --seed 60615 --criterion victory-points --top 3`. Он перебирает линии до `endTurn` и печатает JSON; `victory-points` — один исследовательский критерий эффективных победных очков root-игрока, а не универсальное определение лучшего хода. Ограничения `--maxChoiceDepth`, `--maxBranchesPerAction`, `--maxActionsPerLine`, `--maxTurnLines` защищают от combinatorial роста. Analyzer не является стратегией игрока и не заменяет `simulate:single`.

## Структура проекта

```text
src/       TypeScript engine, CLI и import-логика
data/      runtime-данные, manifests, колоды, стаки, токены и import-сырьё
docs/      правила, runtime layout, import pipeline и технические заметки
tests/     тесты движка и CLI
assets/    карточные изображения и другие исходные материалы
```

> [!IMPORTANT]
> Runtime engine читает только mapped runtime-данные. `data/import/**` относится к import pipeline и не должен использоваться как исполняемый вход движка.

## Как устроена модель

- Симулятор остаётся headless: основной интерфейс сейчас CLI и TypeScript API.
- Поведение карт описывается explicit typed handlers, а не runtime-парсингом текста карт.
- Карты, эффекты, действия, стратегии и события используют stable IDs.
- Проект разделяет `Card definition`, `Deck composition` и `Card instance`.
- Победитель в `v0` определяется по VP, затем по количеству карт Легенд, затем по количеству DWT.

## Документация

- [Сводка механик](docs/mechanics-coverage.md)
- [Канон правил для реализации](docs/rules-canon.md)
- [Runtime layout](docs/runtime-layout.md)
- [Import pipeline](docs/import-pipeline.md)
- [Single-game debug trace](docs/single-game-debug-trace.md)
- [Глоссарий правил](docs/rules-glossary.md)
- [Открытые вопросы правил](docs/rules-open-questions.md)

Локальный агентский workflow описан отдельно в [AGENTS.md](AGENTS.md).

Для card runtime planning актуальным источником остаются dynamic report и generated matrix из `.scratch/krutagidon-card-runtime-clusters/`. Старый committed snapshot runtime coverage в `docs/` больше не используется как planning artifact.

## Ограничения v0

- rules coverage пока частичный;
- поддержаны не все typed effect handlers;
- `baselineBot` играет просто и не оптимизирует порядок действий;
- debug trace ещё не даёт полного before/after state view;
- familiar lifecycle и часть DWT/Mayhem/Mega Mayhem-логики реализованы не полностью.

## Следующие направления

- расширять typed effect handlers;
- улучшать combat, death, DWT и Mayhem/Mega Mayhem resolution;
- довести debug trace до более полного пошагового режима;
- улучшать baseline bot и добавлять отдельные player strategies;
- расширять runtime coverage без смешивания runtime и import-слоёв.
