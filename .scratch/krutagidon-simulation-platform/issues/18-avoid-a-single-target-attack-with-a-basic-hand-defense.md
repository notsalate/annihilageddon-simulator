# Avoid a single-target attack with a basic hand defense

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-11-combat-life-defense.md`

## What to build

Add the first single-target attack workflow with a minimal defense window from hand.

This slice should execute a fixture attack instance against one target, let that target choose one legal defense card from hand through the baseline Choice Policy, move the defense card according to mapped defense branch data, mark the attack as avoided, and prove that avoided attack damage/death does not occur.

## Acceptance criteria

- [ ] A fixture card can produce a single-target attack instance.
- [ ] The attack uses Target Resolution to identify the affected target.
- [ ] The affected target receives a defense window before the attack result is applied.
- [ ] A legal defense card in hand is offered as a defense option.
- [ ] The baseline Choice Policy chooses the first legal defense option deterministically.
- [ ] A discard-self defense branch moves the defense card to discard and avoids the attack.
- [ ] A topdeck-self defense branch moves the defense card to the top of the player's deck and avoids the attack.
- [ ] Avoided attack damage and death do not occur for the defending player.
- [ ] Typed event log entries record defense choice, defense card movement, and attack avoidance.
- [ ] Tests cover attack without defense, attack with discard-self defense, and attack with topdeck-self defense.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/12-resolve-first-legal-choices-for-a-targeted-fixture-effect.md`
- `.scratch/krutagidon-simulation-platform/issues/14-add-generic-gain-discard-destroy-movement-effects.md`
- `.scratch/krutagidon-simulation-platform/issues/16-kill-a-player-with-a-simple-targeted-damage-card.md`
