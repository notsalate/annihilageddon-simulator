# PRD: Русское пользовательское меню симулятора

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

Сейчас симулятор уже умеет запускать одну партию и массовые прогоны, но основной интерфейс остается техническим: длинные npm-команды с флагами и JSON-вывод. Это подходит агенту или разработчику, но неудобно обычному русскоязычному пользователю, который хочет быстро запускать партии, видеть понятный итог и возвращаться в меню для следующего запуска.

Продуктовая цель проекта - прогонять много партий для будущего поиска закономерностей, сравнения стратегий и стартовых сборок. Первый пользовательский интерфейс должен не пытаться решать все аналитические задачи сразу, а дать простой русский вход в уже существующие возможности: одна партия, массовый прогон и понятный summary после завершения.

## Solution

Добавить команду `npm run simulate`, которая открывает русское интерактивное меню:

- `Одна партия`;
- `Массовый прогон`;
- `Выход`.

Одна партия спрашивает seed, где Enter означает случайный seed. Массовый прогон спрашивает количество партий, где Enter означает 10000 партий. `maxTurns` не спрашивается в пользовательском меню и остается дефолтным.

После запуска пользователь видит русский summary, а не JSON и не пошаговый trace. После summary программа возвращается в меню. Успешные результаты не сохраняются автоматически. Если симуляция падает с ошибкой, пользователь видит короткое русское сообщение, а подробный технический отчет сохраняется в локальный error log.

Существующие scriptable CLI-команды остаются для агентов, разработчиков и автоматизации.

## User Stories

1. As a Russian-speaking player, I want to run `npm run simulate`, so that I can use the simulator without remembering technical flags.
2. As a Russian-speaking player, I want the menu to be fully in Russian, so that it feels like a product interface rather than a developer tool.
3. As a Russian-speaking player, I want to choose "Одна партия", so that I can quickly inspect the result of one simulated game.
4. As a Russian-speaking player, I want to enter a seed for one game, so that I can reproduce a known game when needed.
5. As a Russian-speaking player, I want pressing Enter at the seed prompt to generate a random seed, so that I can start a fresh game without thinking about seed values.
6. As a Russian-speaking player, I want the single-game summary to show the seed, so that I can repeat or report the same game later.
7. As a Russian-speaking player, I want the single-game summary to show the winner, so that I can understand the result immediately.
8. As a Russian-speaking player, I want the single-game summary to show each player's score, so that I can compare the final outcome.
9. As a Russian-speaking player, I want the score to use game terms such as `ПО` and `ЖДК`, so that the output matches the Russian game language.
10. As a Russian-speaking player, I want the summary to show the number of turns, so that I can understand the length of the game.
11. As a Russian-speaking player, I want the summary to show the reason the game ended, so that I can distinguish real game endings from technical stops.
12. As a Russian-speaking player, I want technical `maxTurns` stops to be called out, so that I do not mistake them for real game conclusions.
13. As a Russian-speaking player, I want to choose "Массовый прогон", so that I can run many games from the same simple menu.
14. As a Russian-speaking player, I want mass simulation to default to 10000 games, so that the menu supports the intended high-volume workflow.
15. As a Russian-speaking player, I want to enter a different game count, so that I can run smaller or larger experiments when needed.
16. As a Russian-speaking player, I want mass simulation to use a random starting seed by default, so that repeated menu runs explore different seed ranges.
17. As a Russian-speaking player, I want the mass summary to show the seed range, so that I can reproduce the same run later.
18. As a Russian-speaking player, I want the mass summary to show win percentages, so that I can understand the high-level result quickly.
19. As a Russian-speaking player, I want percentages to be rounded consistently, so that the output is easy to scan.
20. As a Russian-speaking player, I want the mass summary to show ties separately, so that ties are not hidden inside player wins.
21. As a Russian-speaking player, I want the mass summary to show average game length, so that I can see whether games are ending at a reasonable pace.
22. As a Russian-speaking player, I want the mass summary to show average `ПО`, so that I can get a rough result overview.
23. As a Russian-speaking player, I want the mass summary to show average `ЖДК`, so that I can see how deadly the current simulation is.
24. As a Russian-speaking player, I want the mass summary to show end reasons, so that I can see which end condition dominates.
25. As a Russian-speaking player, I want the mass summary to warn me when any games hit the turn limit, so that I know the statistics may be distorted.
26. As a Russian-speaking player, I want the mass summary to show execution time, so that I can judge simulator performance.
27. As a Russian-speaking player, I want to press Enter after a result and return to the menu, so that I can run another simulation without restarting the command.
28. As a Russian-speaking player, I want invalid menu input to produce a clear Russian prompt, so that I can recover without reading a stack trace.
29. As a Russian-speaking player, I want simulation errors to be summarized briefly, so that the menu does not dump technical details onto the screen.
30. As a developer, I want detailed error reports saved locally, so that I can debug failures from user-reported runs.
31. As a developer, I want error reports to include launch mode and seed information, so that failures are reproducible.
32. As a developer, I want existing scriptable commands to remain available, so that agents and automation can keep using explicit flags.
33. As a developer, I want the user-facing summary formatting to be separated from simulation logic, so that it can be tested and extended without changing engine behavior.
34. As a developer, I want the menu to reuse existing simulation APIs, so that this feature does not alter rules behavior.
35. As a future analyst, I want the first menu to avoid pretending to solve strategy analysis, so that later strategy and starting build modes can be added deliberately.
36. As a future analyst, I want player labels to leave room for strategy names, so that later summaries can show which strategy each player used.
37. As a future analyst, I want the first summary to avoid step-by-step events, so that turn-by-turn replay can be built as a separate mode later.

## Implementation Decisions

- Add a new user-facing npm script named `simulate`.
- Keep existing single-game and mass-simulation commands as scriptable developer/agent interfaces.
- The menu is a thin user-facing shell over the current simulation capabilities, not a broad rewrite of the simulation model.
- User-facing text in the menu and summaries must be Russian.
- The menu title is `Крутагидон 2: симулятор`.
- The first menu has only three options: `Одна партия`, `Массовый прогон`, and `Выход`.
- After a completed run, the menu shows `Нажмите Enter, чтобы вернуться в меню` and returns to the main menu.
- A single game prompts with `Seed партии [случайный]:`.
- If the single-game seed prompt receives Enter, generate a random positive safe integer seed.
- If the single-game seed prompt receives a number, use that number.
- Mass simulation prompts for game count with a default of 10000.
- Mass simulation generates a random starting seed by default and shows the resulting range as `Seed: 12345-22344`.
- `maxTurns` remains a default internal menu setting and is not prompted in the first user menu.
- Successful summaries are printed to the screen only and are not automatically saved.
- Error details are saved under local run error artifacts; the user sees only a concise Russian failure summary and the error report location.
- Single-game summary is an outcome summary, not a trace.
- Mass summary is an aggregate outcome summary, not a strategy-analysis report.
- Single-game summary should include seed, turns, end reason, winner or tie, and player scores.
- Player scores should include `ПО`, legends, and `ЖДК`.
- Mass summary should include seed range, number of games, win/tie percentages, average turns, average `ПО`, average `ЖДК`, end reasons, warnings for any turn-limit stops, and execution time.
- Percentages are displayed with one digit after the decimal point.
- Execution time is displayed in seconds, such as `18.4 сек.`.
- Strategy and starting-build comparison modes are explicitly deferred until the relevant data and mechanics exist.
- The first implementation should prefer deep, testable presentation modules: one module for Russian single-game summary formatting, one module for Russian mass-summary formatting, and one module for menu orchestration.
- Formatting modules should consume already-computed simulation results and must not encode game rules.
- The menu orchestration should handle prompts, defaults, invalid input, random seed generation, timing, and error report writing.
- The simulation engine remains the authority for legal actions, scoring, game end reasons, and event logs.

## Testing Decisions

- Test user-facing formatting through output strings generated from fixed result objects.
- Test single-game summary formatting without running a full simulation where possible.
- Test mass-summary formatting from deterministic aggregate fixtures.
- Test that technical turn-limit endings produce a visible warning when present.
- Test that percentages and execution time use the agreed display format.
- Test menu parsing/default behavior around empty input, numeric input, and invalid input in isolation from actual terminal I/O where practical.
- Test that existing scriptable CLI behavior remains available.
- Keep tests focused on externally visible behavior: displayed Russian text, defaults, generated summary shape, and error handling.
- Do not test private implementation details of prompt loops.
- Do not introduce broad random simulation tests as the primary verification for menu behavior.
- Continue to run the repository's normal typecheck and test commands after implementation.

## Out of Scope

- Step-by-step turn viewer.
- Human-readable event trace for a full game.
- Saving successful summaries to files.
- JSON or CSV export from the user menu.
- Strategy comparison mode.
- Starting build comparison mode.
- Best-Move Strategy implementation.
- Optimal current-turn solver.
- Mirrored starting-build matches.
- Real Dead Wizard Token import.
- Wizard property import.
- Familiar import.
- New game mechanics or card effect handlers.
- Changes to scoring rules.
- Changes to seeded RNG behavior in the engine.
- Replacing existing scriptable CLI commands.

## Further Notes

The agreed roadmap after this PRD is:

1. Add the Russian user menu and summary output.
2. Import and support a small coverage set of real `deadWizardToken` definitions.
3. Add wizard properties and familiars as starting-build data.
4. Design starting-build comparison modes after the required data exists.

For future starting-build analysis, the discussion resolved these domain decisions:

- A Strategy is separate from a Starting Build.
- A Starting Build is the initial combination of wizard properties and familiar.
- Starting-build comparison should happen after the relevant data is imported.
- Optimal starting-build comparison should eventually use mirrored pairs as matches.
- Equivalent action lines should only be collapsed in safe cases.
- These future solver decisions are not part of this PRD.
