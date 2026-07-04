# Kill a player with a simple targeted damage card

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add the first end-to-end lethal damage path from a mapped card effect to immediate death, neutral DWT gain, resurrection, scoring, and event logging.

This slice should use a simple fixture card effect that chooses a target, deals enough damage to kill that target, resolves death immediately, gives the dead player a neutral DWT, resurrects that player to 20 life, and records the important combat events. It should prove the engine can execute the kill path before adding full attack/defense workflow.

## Acceptance criteria

- [ ] A fixture card effect can choose a target and deal damage through the shared Effect Runtime.
- [ ] Damage can reduce a player's life below 1.
- [ ] Life below 1 immediately triggers death resolution.
- [ ] Death resolution gives the player a neutral DWT when one is available.
- [ ] The dead player resurrects to 20 life after receiving the neutral DWT.
- [ ] Excess damage has no additional effect after death.
- [ ] Scoring includes the neutral DWT penalty through token data.
- [ ] Typed event log entries record damage, death, DWT gain, and resurrection.
- [ ] Existing deterministic single-game behavior remains reproducible.
- [ ] Focused tests cover lethal damage, immediate death, neutral DWT gain, resurrection, event logging, and scoring.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
- `.scratch/krutagidon-simulation-platform/issues/11-add-token-definitions-with-neutral-dwt-scoring-path.md`
- `.scratch/krutagidon-simulation-platform/issues/12-resolve-first-legal-choices-for-a-targeted-fixture-effect.md`
- `.scratch/krutagidon-simulation-platform/issues/13-apply-controlled-object-modifiers-through-effective-values.md`
