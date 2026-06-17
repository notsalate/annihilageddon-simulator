# Run Single Game From Russian Menu

Status: ready-for-agent
Label: ready-for-agent

## Parent

`.scratch/krutagidon-user-simulation-menu/PRD.md`

## What to build

Add the first user-facing `npm run simulate` path: a Russian interactive menu that can run one completed game and show a concise Russian summary. This slice should be demoable end-to-end from the npm script, through menu input, to the single-game result and return-to-menu prompt.

The menu should be a thin shell over the existing simulation API. It should not change game rules, scoring, action selection, data loading, or seeded engine behavior. Existing scriptable commands for one game and mass simulation must keep working.

The first menu should show:

- `Крутагидон 2: симулятор`
- `1. Одна партия`
- `2. Массовый прогон`
- `0. Выход`

Only the `Одна партия` path must be implemented in this slice. The mass-simulation menu option may be visible but can clearly say it is not implemented yet until the next issue.

For one game, prompt with `Seed партии [случайный]:`. Empty input generates a random positive safe integer seed. Numeric input uses the provided seed. The user-facing summary should be in Russian and should include seed, turns, end reason, winner or tie, and each player's score using `ПО` and `ЖДК`. After the summary, show `Нажмите Enter, чтобы вернуться в меню` and return to the menu.

Update user-facing README instructions for this single-game menu path while keeping scriptable commands documented for agents/developers.

## Acceptance criteria

- [ ] `npm run simulate` opens a Russian interactive menu.
- [ ] The menu includes `Одна партия`, `Массовый прогон`, and `Выход`.
- [ ] Choosing `Одна партия` prompts `Seed партии [случайный]:`.
- [ ] Empty seed input generates and uses a random positive safe integer seed.
- [ ] Numeric seed input uses that exact seed.
- [ ] Invalid menu input does not crash the program and prompts the user again in Russian.
- [ ] The single-game summary is Russian, not JSON.
- [ ] The single-game summary includes seed, turns, end reason, winner or tie, and player scores.
- [ ] Player scores use `ПО` and `ЖДК`.
- [ ] After the summary, Enter returns to the menu.
- [ ] Existing scriptable single-game and mass-simulation commands still work.
- [ ] README documents `npm run simulate` for a normal user and preserves scriptable CLI commands for agents/developers.
- [ ] Focused tests cover single-game summary formatting and menu input/default behavior where practical.
- [ ] Repository typecheck and relevant tests pass.

## Blocked by

None - can start immediately.
