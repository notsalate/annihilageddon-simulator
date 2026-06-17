# Run Mass Simulation From Russian Menu

Status: ready-for-agent
Label: ready-for-agent

## Parent

`.scratch/krutagidon-user-simulation-menu/PRD.md`

## What to build

Complete the `Массовый прогон` path in the Russian user menu. This slice should be demoable end-to-end from `npm run simulate`, through choosing mass simulation, to a Russian aggregate summary and return-to-menu prompt.

Mass simulation should prompt for game count with a default of 10000. Empty input uses 10000. Numeric input uses the provided count. The run should generate a random starting seed by default and show the used seed range in the summary as a compact range, such as `Seed: 12345-22344`.

The mass summary should be Russian and should include the number of games, seed range, win/tie percentages rounded to one decimal place, average game length, average `ПО`, average `ЖДК`, end reasons, execution time in seconds, and a visible warning if any games ended by the technical turn limit. This is still an outcome summary, not a strategy-analysis report.

Update README instructions for the mass-simulation menu path while keeping scriptable CLI commands documented.

## Acceptance criteria

- [ ] Choosing `Массовый прогон` from `npm run simulate` runs a mass simulation path.
- [ ] The prompt for game count defaults to 10000 on empty input.
- [ ] Numeric game count input is accepted.
- [ ] Invalid game count input does not crash the program and prompts the user again in Russian.
- [ ] The mass run uses a random starting seed by default.
- [ ] The summary shows the seed range in compact form, such as `Seed: 12345-22344`.
- [ ] The summary shows the number of games.
- [ ] The summary shows player win percentages and tie percentage with one digit after the decimal point.
- [ ] The summary shows average turns, average `ПО`, and average `ЖДК`.
- [ ] The summary shows end reasons.
- [ ] The summary shows execution time in seconds, such as `18.4 сек.`.
- [ ] If any games hit the turn limit, the summary shows a visible warning.
- [ ] After the summary, Enter returns to the menu.
- [ ] Existing scriptable mass-simulation command still works.
- [ ] README documents the mass-simulation menu path.
- [ ] Focused tests cover mass-summary formatting, percentages, seed range display, and turn-limit warning behavior.
- [ ] Repository typecheck and relevant tests pass.

## Blocked by

- `.scratch/krutagidon-user-simulation-menu/issues/01-run-single-game-from-russian-menu.md`
