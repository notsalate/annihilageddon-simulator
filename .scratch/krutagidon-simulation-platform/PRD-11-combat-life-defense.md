# PRD: Combat, Life, Defense, Death, DWT, and Trophy Layer

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

Current v0 simulation can complete games, but it does not model the main interactive pressure of the game: attacks, defense choices, life changes, death, DWT gain, resurrection, and Trophy control. This makes strategy results heavily distorted because players can buy and score cards, but cannot meaningfully threaten, defend, die, or recover.

The project needs the common combat and life mechanics before importing the full deck. Many cards have unique behaviors, but those unique behaviors should be built on top of shared attack, defense, life, death, token, target, choice, and modifier mechanics rather than one-off handlers.

## Solution

Implement the first combat/life layer on top of the shared mechanics platform:

- life, damage, healing, and max-life clamping;
- immediate death resolution when life drops below 1;
- neutral DWT gain and resurrection;
- DWT exhaustion as a real end condition;
- basic Trophy credit for normal attack kills;
- attack instances with affected target resolution;
- normal player-controlled attacks resolved target-by-target;
- Mayhem and Mega Mayhem attack ordering preserved for later event work;
- minimal defense window from hand;
- defense branch execution through the shared effect runtime;
- defense costs, including card movement, chip spending, and nonlethal life cost;
- redirect intentionally deferred to a later combat slice.

This PRD should make combat executable and testable without requiring full card import or full DWT face import.

## User Stories

1. As a simulation researcher, I want attacks to affect life totals, so that game outcomes reflect combat pressure.
2. As a simulation researcher, I want death to happen immediately, so that DWT effects and resurrection can affect the rest of the current sequence.
3. As a simulation researcher, I want excess damage to stop at death, so that resurrection starts from the correct state.
4. As a simulation researcher, I want neutral DWTs before real DWT faces are imported, so that death and scoring can be represented honestly as a simplification.
5. As a simulation researcher, I want DWT exhaustion to end games through the documented timing, so that mass summaries distinguish real game ends from max-turn stops.
6. As a simulation researcher, I want Trophy control to change on normal attack kills, so that chip economy can begin reflecting kill credit.
7. As a strategy author, I want defense choices to be legal choices, so that bots do not defend with unavailable or unpaid defenses.
8. As a strategy author, I want baseline defense choices to be deterministic, so that combat games replay exactly.
9. As a strategy author, I want ordinary multi-target player attacks to resolve target-by-target, so that earlier deaths and DWT effects can affect later targets.
10. As a strategy author, I want Mayhem attack ordering kept distinct, so that later mayhem work does not inherit normal attack assumptions.
11. As a rules implementer, I want defense branches to execute through the shared effect runtime, so that defense is not a special avoid-only shortcut.
12. As a rules implementer, I want defense costs to be checked before options are legal, so that a bot cannot choose an unaffordable defense.
13. As a rules implementer, I want life costs to be nonlethal, so that players cannot pay life into death unless a future explicit mapping says otherwise.
14. As a rules implementer, I want attack modifiers from controlled objects to apply through effective value calculation, so that source-specific modifiers work without mutating card data.
15. As a rules implementer, I want redirect deferred, so that the first combat slice stays implementable while keeping source/credit concepts ready for redirect.
16. As an engine developer, I want attack source and kill credit represented explicitly, so that Trophy and future redirect behavior can be implemented correctly.
17. As an engine developer, I want death/DWT/resurrection to run atomically before continuing unresolved effect steps, so that state-dependent later targets see the current state.
18. As an engine developer, I want normal attack order to be state-sensitive, so that target 2 can see modifiers, deaths, DWTs, and card movements caused by target 1.
19. As an engine developer, I want healing and damage to use common helpers, so that event logs and death checks are consistent.
20. As an engine developer, I want defense card destinations to be mapped data, so that discard-self and topdeck-self defenses can both be represented.
21. As an analyst, I want combat events in the event log, so that a single-game debug view can later explain kills, defenses, DWTs, and Trophy movement.
22. As an analyst, I want mass summaries to remain compact, so that combat support does not force storing full logs for every game.

## Implementation Decisions

- Implement damage and healing through shared helpers.
- Damage can reduce life below 1; death resolution starts immediately once life drops below 1.
- Healing cannot exceed the current effective max life.
- Effective max life comes from base player state plus active modifiers such as future Dingler support.
- Death resolution is immediate and atomic: DWT gain, resurrection, and DWT immediate effects complete before the remaining effect sequence continues.
- Neutral DWTs are used in normal early simulations: base -3 VP, no token-specific effects.
- Real DWT faces remain data-dependent and out of scope for this PRD.
- A player resurrects to 20 life unless DWT data later changes resurrection life.
- If death consumes the last DWT, the current turn continues; the DWT-empty game end check happens at the documented start-of-turn timing.
- Basic Trophy credit is included in the first combat slice.
- A player gains control of the Trophy when their normal attack kills a foe.
- Self-kills, Mayhem kills, and source-less deaths do not move the Trophy in this slice.
- Trophy gives its basic end-of-controller-turn chip behavior if the chip helper exists in the mechanics platform; otherwise Trophy control should be represented and the chip grant left explicit as unsupported.
- Represent attack instances explicitly enough to carry source, affected targets, attack payload, defense decisions, damage, kill credit, and future redirect metadata.
- Normal player-controlled multi-target attacks resolve target-by-target.
- For each target of a normal player-controlled attack: the target chooses defense, the defense branch resolves if chosen, then the attack resolves immediately if not avoided.
- State changes from one target of a normal attack can affect later targets of the same attack.
- Mayhem and Mega Mayhem attacks use two-phase ordering: collect defense/participation decisions first, then resolve in seating order.
- Full Mayhem and Mega Mayhem lifecycle remains out of scope except for preserving the distinct attack-order model.
- Minimal defense support includes hand defense cards.
- Controlled-object defense reactions are not required in this slice, but the model should not block them later.
- Defense branches are mapped effect sequences that can avoid the attack and run additional supported effects.
- Defense costs must be legal before the defense option is offered.
- Supported defense costs for this slice include discard self, topdeck self, discard another card, spend chips, and pay life.
- Life costs cannot be paid if they would reduce the player below 1 life.
- Empty choice behavior follows the mechanics platform rule: skip by default unless effect data marks failure.
- Redirect is deferred to a later combat slice.
- The attack model must still keep source and credit concepts explicit enough to add redirected attack source behavior later.

## Testing Decisions

- Test combat through public engine operations and deterministic fixtures.
- Add tests for damage reducing life and triggering immediate death.
- Add tests for healing and max-life clamping.
- Add tests for neutral DWT gain, base -3 VP scoring, and resurrection to 20.
- Add tests for death during an effect sequence before later steps continue.
- Add tests for normal multi-target player attack order: target 1 death/DWT effects can affect target 2.
- Add tests for basic defense from hand avoiding an attack.
- Add tests for defense costs: discard self, topdeck self, discard another card, spend chips, and pay life where supported.
- Add tests proving lethal life costs are not legal defense options.
- Add tests for defense branch additional effects using supported effect ids.
- Add tests for basic Trophy control on normal attack kill.
- Add tests proving self-kill, source-less death, and Mayhem kill do not move Trophy in this slice.
- Add tests for DWT exhaustion timing if DWT stack support is present.
- Add tests that redirect remains unsupported/validated rather than silently no-oping.
- Keep tests small and deterministic; avoid broad random simulations as primary verification.

## Out of Scope

- Redirect defenses.
- Redirected attack source, redirected attack modifiers, and redirect kill credit.
- Full DWT faces and token-specific DWT effects beyond neutral DWT and fixture tests.
- Full Dingler behavior except any max-life hooks needed by generic helpers.
- Full chip system unless already provided by the mechanics platform.
- Full Mayhem and Mega Mayhem lifecycle.
- Full activation system.
- Controlled-object defense reactions from permanents, familiars, DWTs, or statuses.
- Advanced bot defense strategy beyond deterministic first legal choice.
- Full card deck import.
- UI, TUI, or manual prompts.

## Further Notes

This PRD depends on the mechanics platform PRD. Combat should not introduce a second effect language, hidden target logic, or detached modifier storage.

The key gameplay decision from discussion is that ordinary player attacks and Mayhem attacks use different ordering:

- normal player attack: target decides defense, that target resolves, then the next target;
- Mayhem/Mega Mayhem attack: collect defense/participation decisions first, then resolve.

Redirect is intentionally deferred, but the domain decision is already recorded: when implemented later, a redirected attack becomes an attack from the defending player for source, Trophy credit, and attack modifiers.
