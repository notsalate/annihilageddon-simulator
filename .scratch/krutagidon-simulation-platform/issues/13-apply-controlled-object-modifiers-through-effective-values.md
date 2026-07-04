# Apply controlled-object modifiers through effective values

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Add the first modifier path where a controlled object changes an effective value without mutating base card or token data.

This slice should gather separately stored controlled cards, tokens, statuses, and trophy-like objects through a read-only Controlled Object View, then calculate an effective value from immutable base data plus active modifiers. The slice should prove that removing or omitting the controlled object naturally removes the modifier.

## Acceptance criteria

- [ ] Controlled cards, controlled tokens, and status/trophy-like objects can remain stored in separate lifecycle-specific state.
- [ ] A read-only Controlled Object View can gather current modifier sources for a player.
- [ ] A fixture controlled object can modify an effective value through mapped effect data.
- [ ] Effective value calculation does not mutate Card Definitions or Token Definitions.
- [ ] Removing or omitting the controlled object removes the modifier from the effective value calculation.
- [ ] The implementation does not introduce detached player modifier lists as the source of truth.
- [ ] Tests prove base data remains unchanged after effective value calculation.
- [ ] Tests cover modifier presence and absence through the Controlled Object View.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
- `.scratch/krutagidon-simulation-platform/issues/11-add-token-definitions-with-neutral-dwt-scoring-path.md`
