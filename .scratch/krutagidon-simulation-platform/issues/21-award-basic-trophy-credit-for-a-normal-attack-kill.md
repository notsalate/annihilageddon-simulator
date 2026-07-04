# Award Basic Trophy Credit for a normal attack kill

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add Basic Trophy Credit for normal attack kills.

This slice should track attack source and kill credit well enough that when a player's normal attack kills a foe, that player gains control of the Trophy. It should also prove that self-kills, source-less deaths, and Mayhem kills do not move the Trophy in this first combat slice.

## Acceptance criteria

- [ ] The engine tracks attack source and kill credit for normal attack damage.
- [ ] When a normal attack kills a foe, the attacking player gains control of the Trophy.
- [ ] Trophy control changes are recorded in typed event logs.
- [ ] If the Trophy already has a controller, a normal attack kill transfers control to the new killer.
- [ ] A self-kill does not move the Trophy.
- [ ] A source-less death does not move the Trophy.
- [ ] A Mayhem or event-like kill does not move the Trophy in this slice.
- [ ] Trophy end-of-controller-turn chip behavior is implemented if chip helper support exists; otherwise the missing chip grant is explicit and not silently treated as implemented.
- [ ] Tests cover normal attack kill credit, Trophy transfer, self-kill no-op, source-less no-op, and Mayhem/event-like no-op.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/11-add-token-definitions-with-neutral-dwt-scoring-path.md`
- `.scratch/krutagidon-simulation-platform/issues/16-kill-a-player-with-a-simple-targeted-damage-card.md`
- `.scratch/krutagidon-simulation-platform/issues/18-avoid-a-single-target-attack-with-a-basic-hand-defense.md`
