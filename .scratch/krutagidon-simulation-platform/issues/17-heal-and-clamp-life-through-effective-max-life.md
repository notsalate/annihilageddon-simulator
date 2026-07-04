# Heal and clamp life through effective max life

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add the first healing path that uses effective max life from controlled-object modifiers without mutating base player or card data.

This slice should execute a fixture healing effect, calculate the player's effective max life, clamp healing to that max, and prove that modifier sources such as fixture controlled objects can change the cap for the current player only.

## Acceptance criteria

- [ ] A fixture effect can heal a player through the shared Effect Runtime.
- [ ] Healing can occur when a player is below max life.
- [ ] Healing cannot raise life above the player's effective max life.
- [ ] Effective max life is calculated from base player state plus active controlled-object modifiers.
- [ ] A fixture controlled object can lower or change the effective max life for one player.
- [ ] If effective max life decreases below current life, current life is clamped according to the supported rule path.
- [ ] Base player/card/token definitions are not mutated by effective max life calculation.
- [ ] Typed event log entries record healing and max-life clamping where applicable.
- [ ] Tests cover healing below max, healing at cap, modified max life, and data immutability.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
- `.scratch/krutagidon-simulation-platform/issues/13-apply-controlled-object-modifiers-through-effective-values.md`
- `.scratch/krutagidon-simulation-platform/issues/16-kill-a-player-with-a-simple-targeted-damage-card.md`
