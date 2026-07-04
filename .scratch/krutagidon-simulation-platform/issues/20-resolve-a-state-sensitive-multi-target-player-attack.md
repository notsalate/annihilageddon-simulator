# Resolve a state-sensitive multi-target player attack

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add normal player-controlled multi-target attack resolution where each target is handled one at a time and state changes from earlier targets can affect later targets.

This slice should execute a fixture attack that affects multiple targets in seating order. For each target, the engine should open the defense window, resolve defense if chosen, apply the attack result if not avoided, and immediately resolve death/DWT before moving to the next target.

## Acceptance criteria

- [ ] A fixture attack can affect multiple targets.
- [ ] Normal player-controlled attack targets resolve one target at a time in seating order.
- [ ] Each target receives its own defense window immediately before that target's attack result.
- [ ] If a target does not avoid the attack, damage/death/DWT resolution completes before the next target is processed.
- [ ] State changes caused by target 1 can affect target 2's defense choices or attack result.
- [ ] The implementation does not snapshot all target outcomes before resolving the attack.
- [ ] Typed event logs show target order, defense decisions, attack results, deaths, and DWT effects in order.
- [ ] Tests cover multi-target order, target 1 death before target 2 resolution, and state-sensitive behavior between targets.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/16-kill-a-player-with-a-simple-targeted-damage-card.md`
- `.scratch/krutagidon-simulation-platform/issues/18-avoid-a-single-target-attack-with-a-basic-hand-defense.md`
- `.scratch/krutagidon-simulation-platform/issues/19-pay-defense-costs-and-run-defense-branch-effects.md`
