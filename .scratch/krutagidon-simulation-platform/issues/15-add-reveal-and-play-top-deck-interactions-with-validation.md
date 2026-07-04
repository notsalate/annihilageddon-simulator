# Add reveal and play-top deck interactions with validation

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Add generic reveal-from-deck and play-top-card interactions through the shared Effect Runtime, then enforce executable mechanics validation so unsupported effects do not silently no-op.

This slice should let fixture effects reveal cards from decks, play top cards through the normal play/effect path, handle shuffle and empty-deck edge cases, and validate executable data packs against the supported effect set.

## Acceptance criteria

- [ ] A fixture reveal effect can reveal a card from the expected deck source.
- [ ] Reveal behavior handles empty deck and discard-shuffle edge cases consistently with existing draw behavior.
- [ ] A fixture play-top effect can play the top card through the normal play/effect path.
- [ ] Play-top behavior applies supported on-play effects through the shared Effect Runtime.
- [ ] Play-top behavior sends the played card to the correct destination according to ownership/control and mapped destination rules.
- [ ] Unsupported reveal or play-top destinations are explicit validation failures rather than silent no-ops.
- [ ] Executable data-pack validation distinguishes supported executable effects from unsupported mechanics.
- [ ] Validation rejects unsupported effect ids or unsupported mechanics in data intended to execute.
- [ ] Existing single-game and mass-simulation behavior remains deterministic.
- [ ] Focused tests cover reveal, play-top, shuffle/empty edge cases, destination behavior, and validation failures.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
- `.scratch/krutagidon-simulation-platform/issues/12-resolve-first-legal-choices-for-a-targeted-fixture-effect.md`
- `.scratch/krutagidon-simulation-platform/issues/14-add-generic-gain-discard-destroy-movement-effects.md`
