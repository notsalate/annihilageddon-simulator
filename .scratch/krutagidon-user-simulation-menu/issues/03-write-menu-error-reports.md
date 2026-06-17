# Write Menu Error Reports

Status: ready-for-agent
Label: ready-for-agent

## Parent

`.scratch/krutagidon-user-simulation-menu/PRD.md`

## What to build

Harden the Russian user menu so unexpected simulation or menu failures produce a short Russian user-facing message and a detailed local technical report. This slice should cover both single-game and mass-simulation menu paths.

Successful summaries should still only print to the screen and should not be saved automatically. Error details should be written under `.scratch/runs/errors/`. The user should see that the simulation stopped because of an error and where the technical report was saved. After handling the error, the menu should return to the main menu when possible instead of dumping a raw stack trace to the user.

The technical report should include enough context to reproduce and debug the failure: menu mode, seed or seed range when known, game count when relevant, default settings such as max turn limit, timestamp, error message, and stack trace when available. It must not expose secrets or unrelated local private data.

## Acceptance criteria

- [ ] Unexpected failures in the one-game menu path show a short Russian error message instead of a raw stack trace.
- [ ] Unexpected failures in the mass-simulation menu path show a short Russian error message instead of a raw stack trace.
- [ ] A detailed technical error report is written under `.scratch/runs/errors/`.
- [ ] The user-facing error message includes the path to the saved technical report.
- [ ] The technical report includes menu mode and relevant run parameters.
- [ ] The technical report includes seed or seed range when known.
- [ ] The technical report includes error message and stack trace when available.
- [ ] Successful runs do not create success summary files.
- [ ] After an error, the menu returns to the main menu when practical.
- [ ] Error report writing is covered by focused tests using a temporary output location or equivalent test seam.
- [ ] Repository typecheck and relevant tests pass.

## Blocked by

- `.scratch/krutagidon-user-simulation-menu/issues/01-run-single-game-from-russian-menu.md`
- `.scratch/krutagidon-user-simulation-menu/issues/02-run-mass-simulation-from-russian-menu.md`
