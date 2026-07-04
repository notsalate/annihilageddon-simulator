# Execute existing play effects through shared Effect Runtime

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Route the existing executable play effects through a shared Effect Runtime without changing current visible game behavior.

This slice should make the current `add_power` and `draw_cards` behavior execute through a common effect dispatch path with explicit effect source context and typed event logging. It should preserve current deterministic single-game and mass-simulation behavior while creating the path future card, token, status, and event-like effects will share.

## Acceptance criteria

- [ ] Existing playable cards that add power still add the same power when played.
- [ ] Existing playable cards that draw cards still draw the same number of cards when played.
- [ ] The existing play-card path uses the shared Effect Runtime rather than bespoke inline effect handling.
- [ ] Effect execution receives an explicit source context that can represent at least card-sourced effects now and can be extended to tokens/statuses later.
- [ ] Effect helpers apply state changes immediately and record typed event log entries for the applied effect consequences.
- [ ] Event logs remain diagnostic output only; they do not drive effect execution.
- [ ] Existing deterministic simulation tests still pass.
- [ ] Focused tests cover `add_power` and `draw_cards` through the shared runtime path.

## Blocked by

None - can start immediately
