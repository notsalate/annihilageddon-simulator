# Design single-game debug trace

Status: ready-for-human
Label: ready-for-human
Type: HITL

## What to build

Design the human-readable trace format for inspecting one deterministic game by seed. This issue is only for agreeing on the format and examples before implementation.

The trace should help debug full runtime mapping by showing what happened in game terms: turn, player, card, effect, choice, target, zone movement, death, DWT, Trophy movement, and relevant before/after state.

## Acceptance criteria

- [ ] A proposed trace format is documented with at least one realistic turn example.
- [ ] The example includes card play, effect resolution, target choice, zone movement, death or defense if applicable, and Trophy behavior if applicable.
- [ ] The format is readable for the project owner without reading raw event logs.
- [ ] The format identifies which data is required from event logs and which data may require additional instrumentation.
- [ ] A follow-up AFK implementation issue can be written from the agreed format.

## Blocked by

None - can start immediately
