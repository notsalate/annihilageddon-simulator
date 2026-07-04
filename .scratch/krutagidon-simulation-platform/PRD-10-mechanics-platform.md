# PRD: Mechanics Platform for Effects, Tokens, Choices, and Movement

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

Current v0 simulation can run deterministic games and produce JSON summaries, but its executable mechanics are still too narrow for implementing most global rules. The engine currently handles basic play, buy, draw, cleanup, scoring, and a small set of effects, but does not yet have a shared execution model for card effects, token effects, choices, targets, modifiers, or generic card movement.

Before importing the full deck, the project needs a reusable mechanics platform. Without it, each new card or token behavior would either be hardcoded, silently skipped, or implemented with incompatible local conventions.

## Solution

Build the shared mechanics layer that future card, token, combat, and event behavior can use:

- token definitions separate from card definitions;
- neutral DWTs for normal early simulations;
- fixture DWTs for tests;
- one shared effect runtime for cards, tokens, statuses, trophy-like objects, and event-like objects;
- effect helpers that apply consequences immediately and record typed events;
- effective value calculations from immutable base data plus controlled-object modifiers;
- a minimal choice policy for deterministic bot-driven choices;
- shared target resolution;
- generic movement effects for gain, destroy, discard, reveal, and play-from-top workflows;
- validation that unsupported mechanics do not silently distort results.

This PRD should not implement combat itself. It prepares the reusable substrate needed by combat, DWT effects, defense branches, mayhems, activations, chips, and later card imports.

## User Stories

1. As a simulation researcher, I want unsupported mechanics to be explicit, so that early simulation results are not mistaken for full game results.
2. As a simulation researcher, I want deterministic choices, so that a suspicious game can be replayed exactly by seed.
3. As a rules implementer, I want one shared effect runtime, so that card effects and token effects use the same language.
4. As a rules implementer, I want effect helpers to record typed events, so that effect execution can be inspected without making event logs drive execution.
5. As a rules implementer, I want token definitions separate from card definitions, so that DWTs, Trophy, and Dingler are not forced through card zones.
6. As a rules implementer, I want neutral DWTs in normal early simulations, so that death and scoring can work before real DWT faces are imported.
7. As a rules implementer, I want fixture DWTs in tests, so that immediate, ongoing, modifier, discard, destroy, and chip-like token effects can be verified.
8. As a data maintainer, I want token kinds, so that different token lifecycles can be represented without modeling tokens as cards.
9. As a data maintainer, I want card definitions to stay immutable, so that modifiers do not rewrite source card data.
10. As a strategy author, I want effective costs and effective values to be calculated per context, so that player-specific modifiers are applied correctly.
11. As a strategy author, I want legal choices to be generated explicitly, so that bots choose from valid options rather than handlers making hidden decisions.
12. As an engine developer, I want a baseline choice policy that picks the first legal option, so that effect choices can run before stronger bots exist.
13. As an engine developer, I want empty choice sets to skip by default, so that effects like "discard a card" do nothing when no legal card exists.
14. As an engine developer, I want effect data to opt into failure on empty choices, so that validation-sensitive effects can fail loudly.
15. As an engine developer, I want shared target resolution, so that `self`, `allFoes`, `chosenFoe`, `leftFoe`, `rightFoe`, strongest, and weakest selectors behave consistently.
16. As an engine developer, I want controlled-object modifiers to be derived from actual controlled objects, so that removing a source naturally removes its modifier.
17. As an engine developer, I want a read-only controlled object view, so that cards, tokens, statuses, and trophy-like objects can stay in separate lifecycle-specific state.
18. As an engine developer, I want generic gain behavior, so that cards and effects can gain cards without bespoke handlers.
19. As an engine developer, I want generic destroy behavior, so that destroyed cards leave normal game flow consistently.
20. As an engine developer, I want generic discard behavior, so that hand discard and effect-driven discard are reproducible.
21. As an engine developer, I want generic reveal behavior, so that deck reveal effects can share shuffle/draw edge cases.
22. As an engine developer, I want generic play-from-top behavior, so that Wild Magic and future card effects can reuse the same operation.
23. As an analyst, I want event logs for applied helpers, so that later debug views can explain why summaries changed.
24. As an analyst, I want validation to reject unsupported mechanics in a data pack intended for execution, so that mass simulation does not silently no-op important effects.

## Implementation Decisions

- Create a token data model separate from the card data model.
- Represent token definitions with a `tokenKind` such as `deadWizardToken`, `trophy`, or `dingler`.
- Use neutral DWT definitions in normal early simulation data: base -3 VP, no token-specific effects.
- Use fixture DWT definitions only in tests to exercise token effect classes.
- Replace string-only DWT ownership with controlled token instances or an equivalent explicit token ownership representation.
- Keep card definitions immutable. Do not write effective costs, effective damage, scoring changes, or status-derived values back into card data.
- Add one shared effect runtime for mapped effects from cards, tokens, statuses, trophy-like objects, and event-like objects.
- Resolve effects sequentially and immediately through effect helpers. Do not introduce a separate pending-event queue.
- Effect helpers are responsible for applying state changes and writing typed event log entries.
- Add a shared effect source model so runtime code can distinguish whether an effect came from a card, token, status, trophy-like object, or event-like object.
- Add a controlled object view that gathers separately stored controlled cards, tokens, statuses, and trophy-like objects for modifier calculation.
- Do not store detached player modifier lists as the source of truth.
- Add effective value calculators for player/context-specific values such as cost, damage, max life, and scoring modifiers as needed by supported effects.
- Add a minimal choice policy. The first baseline policy chooses the first legal option deterministically.
- Generate legal choices explicitly for effects that require choices.
- Default empty legal choice sets to skip/no-op unless effect data explicitly marks empty choices as a failure.
- Add target resolution as a shared layer before effect application.
- Support target selectors needed by upcoming mechanics: self, all foes, chosen foe/player, left foe, right foe, strongest, weakest, stronger-than-you, and weaker-than-you as data requires.
- Add generic movement helpers for gain, destroy, discard, reveal, and play-from-top behavior.
- Ensure generic movement helpers preserve ownership/control rules already documented in the rules canon.
- Ensure validation can distinguish "unsupported but explicitly blocked" from "supported and executable".
- Keep UI out of scope; all interactions remain bot-driven and headless.

## Testing Decisions

- Test through public engine operations and data-pack loading behavior, not private helper internals.
- Add focused unit tests for token definition loading and neutral DWT scoring.
- Add fixture DWT tests for immediate effects, ongoing modifiers, and scoring modifiers.
- Add tests proving card definitions are not mutated when effective values are calculated.
- Add tests for controlled object view behavior when cards, tokens, statuses, and trophy-like objects are present or absent.
- Add tests for first-legal choice policy determinism.
- Add tests for empty choice skip behavior.
- Add tests for target resolution with 2 players and at least one multi-player fixture if the state model supports it.
- Add tests for gain, destroy, discard, reveal, and play-from-top helpers using small deterministic fixtures.
- Add validation tests for unsupported effect ids and unsupported mechanics in executable data packs.
- Reuse the existing deterministic seed and engine behavior test style.
- Prefer small fixture states over large game snapshots.

## Out of Scope

- Full combat implementation.
- Attack and defense workflow.
- Death, resurrection, and Trophy behavior beyond data representation needed for later work.
- Redirect defenses.
- Full mayhem and mega-mayhem lifecycle.
- Full chip system.
- Full activation system.
- Importing real DWT faces.
- Importing the full card deck.
- UI, TUI, or interactive manual prompts.
- Advanced bot strategy.

## Further Notes

This PRD depends on the current rules canon and project glossary. It intentionally creates the reusable substrate before adding the combat/life layer.

The most important architectural constraint is that effect behavior must be explicit and typed before runtime. Runtime must not parse natural-language card text.
