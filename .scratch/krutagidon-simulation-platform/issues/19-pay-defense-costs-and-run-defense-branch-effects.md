# Pay defense costs and run defense branch effects

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Extend the defense window so legal defense options account for mapped costs and selected defenses can run additional supported defense branch effects.

This slice should make defense legality depend on payable costs such as discarding another card, spending chips, and paying nonlethal life. When a defense is selected, the engine should pay the cost, avoid the attack, and execute additional supported branch effects through the shared Effect Runtime.

## Acceptance criteria

- [ ] Defense options with unpaid costs are not legal.
- [ ] A defense can require discarding another card from hand.
- [ ] A defense can require spending chips if the player has enough chips.
- [ ] A defense can require paying life if the payment would not reduce life below 1.
- [ ] A life cost that would reduce the player below 1 is not a legal defense option.
- [ ] Paid defense costs are reflected in game state and typed event logs.
- [ ] A defense branch can execute additional supported effects after the cost is paid.
- [ ] Additional defense branch effects use the shared Effect Runtime rather than bespoke defense-only handlers.
- [ ] Redirect defense effects remain unsupported or validation-failing rather than silently no-oping.
- [ ] Tests cover payable and unpayable defense costs, nonlethal life cost, branch effect execution, and redirect unsupported behavior.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/14-add-generic-gain-discard-destroy-movement-effects.md`
- `.scratch/krutagidon-simulation-platform/issues/15-add-reveal-and-play-top-deck-interactions-with-validation.md`
- `.scratch/krutagidon-simulation-platform/issues/18-avoid-a-single-target-attack-with-a-basic-hand-defense.md`
