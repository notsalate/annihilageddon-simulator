# Resolve fixture Mayhem attack with two-phase ordering

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add a fixture Mayhem or Mega Mayhem attack path that preserves the distinct two-phase attack ordering without implementing full Mayhem lifecycle.

This slice should execute an event-like attack fixture where affected players first make defense or participation decisions in seating order, and only after those decisions are collected does the attack resolve in seating order against players who did not avoid or skip participation.

## Acceptance criteria

- [ ] A fixture event-like attack can be identified as Mayhem/Mega Mayhem-style for ordering purposes.
- [ ] Affected players make defense or participation decisions before any attack result resolves.
- [ ] Decisions are collected in seating order starting from the active player.
- [ ] After decisions are collected, the attack resolves in seating order starting from the active player.
- [ ] Players who avoided the attack or did not participate are skipped for the attack result.
- [ ] Death/DWT resolution still happens immediately during the resolution phase before moving to the next unresolved target.
- [ ] This slice does not implement full market refill, destroy-event-pile, or replacement Mayhem lifecycle.
- [ ] Typed event logs make the two phases visible.
- [ ] Tests prove Mayhem ordering differs from normal player-controlled attack ordering.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/18-avoid-a-single-target-attack-with-a-basic-hand-defense.md`
- `.scratch/krutagidon-simulation-platform/issues/19-pay-defense-costs-and-run-defense-branch-effects.md`
- `.scratch/krutagidon-simulation-platform/issues/20-resolve-a-state-sensitive-multi-target-player-attack.md`
