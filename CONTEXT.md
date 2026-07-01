# Krutagidon Simulation Context

Shared domain language for the local deterministic simulator of "Эпичные схватки боевых магов: Крутагидон 2".

## Language

**Neutral Dead Wizard Token**:
A temporary DWT definition used in normal early simulations before real DWT faces are imported. It counts as a controlled DWT with the base -3 VP penalty and has no token-specific effects.
_Avoid_: fake DWT, real DWT substitute

**Fixture Dead Wizard Token**:
An artificial DWT definition used only in tests to exercise DWT effect classes such as immediate effects, Ongoing effects, modifiers, discard, destroy, and chip interactions.
_Avoid_: fake DWT, simulation DWT

**Token Definition**:
A unique description of a non-card game object such as a Dead Wizard Token, Trophy, Dingler status, or chip-related token behavior. Token definitions are separate from card definitions.
_Avoid_: card definition for tokens, pseudo-card

**Wizard Property Definition**:
A token definition for a wizard property assigned during setup. Wizard properties are not card definitions, even when their effects refer to real cards.
_Avoid_: wizard property card, property draft as runtime data

**Token Kind**:
The category of a token definition, such as `deadWizardToken`, `trophy`, or `dingler`, used to distinguish token lifecycles without modeling tokens as cards.
_Avoid_: card kind for tokens

**Import Data**:
Raw or intermediate local card, token, OCR, or draft data used while preparing runtime definitions. Import data is not an engine input.
_Avoid_: runtime import data, executable draft

**Source Text**:
A human-readable markdown transcription of a card, token, or wizard property source image used as the first import-layer text artifact. Source text does not imply OCR and is referenced through `source.text`.
_Avoid_: ocrText, OCR text

**Draft Data**:
Structured intermediate JSON created from raw import text before behavior is mapped for the engine. Draft data records visible/source facts and uncertainties, but excludes executable effects and runtime playability decisions.
_Avoid_: runtime JSON, implemented card

**Full Draft Import**:
The project phase that regenerates canonical draft JSON from all local source text for cards and tokens, including main cards, Legend cards, starters, familiars, special cards, wizard properties, and Dead Wizard Tokens. Full Draft Import does not create runtime behavior or engine effects.
_Avoid_: full card implementation, runtime mapping

**Canonical Draft**:
The single current draft JSON for one card or token in the expected `data/import/**/drafts/` location. During Full Draft Import, old draft bodies are overwritten or replaced rather than kept beside the canonical draft.
_Avoid_: parallel legacy draft, duplicate current draft

**Source-Text-Only Drafting**:
The rule that Full Draft Import creates draft JSON only from local source text and known file metadata. If an agent must inspect the source image to fill a required field, it must skip that object and report a draft blocker instead of guessing.
_Avoid_: image-assisted draft, inferred draft fact

**Import Inventory**:
A generated or one-off diagnostic view over import files that helps compare source images, source text, draft JSON, and stale index files. Import inventories are reports, not canonical data sources.
_Avoid_: hand-maintained import index

**Draft Blocker**:
A missing or ambiguous source-text fact that prevents a canonical draft from being created without inspecting the source image. Draft blockers are reported for human/source-text cleanup before runtime mapping.
_Avoid_: silent guess, image fallback

**Derived Draft Fact**:
A draft field that can be filled from explicit source text, source folder, or file identity without inspecting the source image, such as card kind from source group and visible type, card types from visible type, or markers from explicit words like "Атака", "Защита", or an activation icon. Derived draft facts must remain source-text-only and must not infer runtime behavior.
_Avoid_: guessed rule behavior, image-derived fact

**Mapping Note**:
A non-executable draft note copied from source-text clarifications to help a later runtime mapping agent interpret mechanics and edge cases. Mapping notes are guidance for mapping, not visible card facts and not engine behavior.
_Avoid_: ignored clarification, executable note

**Composition Quantity**:
The number of copies of a card or token definition included in a deck, stack, or pool. Composition quantity belongs to import/runtime composition data rather than visible card or token facts.
_Avoid_: visible quantity, card property

**Dead Wizard Token Quantity Rule**:
The import rule that `esw2_dbg__dead_wizard_token_003` has two copies in the Dead Wizard Token stack, while the other imported Dead Wizard Token definitions are unique unless source text later says otherwise.
_Avoid_: inferring DWT duplicates from image inspection

**Dead Wizard Token Visible VP Penalty**:
The visible negative VP number printed in a Dead Wizard Token's source text, such as `-5`, represents an additional visible penalty/effect to map later and is separate from the base DWT penalty. Draft data records the visible number without treating it as the final total DWT score.
_Avoid_: final DWT VP total in draft

**Draft Kind**:
The required discriminator that tells import tooling which draft schema applies, such as `cardDraft`, `wizardPropertyDraft`, or `deadWizardTokenDraft`.
_Avoid_: infer draft type from folder only, runtime kind

**Runtime Data**:
Tracked engine-readable card and token definitions used by simulations. Runtime data contains explicit stable IDs and mapped effects instead of relying on OCR text or draft files.
_Avoid_: raw import, card draft, OCR source

**Runtime Mapping Review Needed**:
A coverage status for old v0 runtime definitions that must be rechecked against canonical draft data and current engine capabilities before they are treated as reliable v0.5 behavior. Existing v0 runtime JSON is review-needed by default unless focused tests already cover the mapped behavior.
_Avoid_: trusted legacy runtime, automatically supported v0 card

**v0.5 Runtime Coverage**:
The post-v0 phase that expands playable runtime data from canonical drafts while auditing old v0 mappings. v0.5 adds cards and tokens by mechanics coverage: universal mechanics can unlock many definitions, while specific mechanics remain partial or blocked until the engine supports them.
_Avoid_: full rules completion, v0 first batch

**v0 Legacy Runtime Fields**:
Old runtime metadata such as `runtimeSchema = "krutagidon.cardDefinition.v0"` and `playableInV0`. During v0.5 work these fields may remain in existing JSON for compatibility, but they are legacy indicators rather than the source of truth for current coverage.
_Avoid_: deleting v0 metadata as first step, treating playableInV0 as current coverage

**v0.5 Coverage Status**:
The current audit/mapping status for runtime definitions in the v0.5 phase. It should distinguish fully playable objects from partial, blocked, placeholder, and review-needed runtime data without relying on old v0 playability fields.
_Avoid_: v0 playable flag, draft validation status

**Runtime Coverage Audit Report**:
A separate generated or maintained inventory report that classifies draft/runtime/composition coverage during v0.5 before statuses are moved into individual runtime JSON files. The first v0.5 step should use this report to avoid broad runtime JSON churn while making missing, review-needed, partial, blocked, placeholder, and fully playable objects visible.
_Avoid_: runtime card template, mass-editing every runtime JSON as the first audit step

**Fully Playable Runtime Definition**:
A card or token definition that is considered added to the game. It has runtime JSON, is included in the appropriate deck, stack, or pool composition, and all mechanics required by that object are implemented and working in the engine.
_Avoid_: JSON-only card, partial runtime card, draft-only import

**Focused Runtime Coverage Test**:
A small deterministic test that proves either a universal mechanic, a concrete runtime mapping's effect parameters, or a narrow integration path for a card or token. v0.5 coverage should prefer focused tests over full-game tests for every individual card, while still using integration smoke tests for complex mechanic combinations.
_Avoid_: one huge game test per card, untested runtime mapping

**Runtime Card Source Group**:
The runtime folder group for card definitions based on the game source or stack that owns the card, such as `main`, `legend`, `starter`, `familiar`, or `special`. Card source groups are separate from visible card types such as spell, creature, treasure, wizard card, or location.
_Avoid_: grouping runtime card files by visible type

**Singleton Special Card ID**:
A stable non-numbered ID for a unique special card stack object whose identity is clearer than a source-group number, such as `esw2_dbg__limp_wand` or `esw2_dbg__wild_magic`.
_Avoid_: numbered special ID for named singleton stacks

**Source-Group Card ID**:
A card ID that follows the card's source deck, stack, or pool rather than its visible card kind. Mayhem cards in the main deck use `main` IDs, and Mega Mayhem cards in the Legend deck use `legend` IDs.
_Avoid_: mayhem category ID, mega-mayhem category ID

**Deck Composition**:
A runtime file that lists card definition IDs and counts for a true card deck, such as the main deck, Legend deck, or starter deck.
_Avoid_: token stack, card definition folder

**Stack Composition**:
A runtime file that lists card or token definition IDs and counts for a shuffled stack, such as Wild Magic, Limp Wand, Dead Wizard Tokens, or wizard properties.
_Avoid_: deck for tokens, pool

**Pool Composition**:
A runtime file that lists object definition IDs and counts for a selectable or shared pool rather than a draw deck or shuffled stack, such as familiars if they are modeled as a pool.
_Avoid_: deck, shuffled stack

**Effect Runtime**:
The shared execution model for mapped effects from cards, tokens, statuses, and event-like objects. It uses one effect language regardless of the source object.
_Avoid_: card-only effect runtime, token mini-runtime

**Single-Game Debug Trace**:
A human-readable projection over one deterministic game's event log. It explains game terms such as card play, target choice, zone movement, death, DWT, and Trophy movement without requiring the reader to inspect raw event objects. Current trace output is incomplete where event logs lack turn numbers or before/after state.
_Avoid_: raw event log, full replay file

**Effect Helper**:
A shared engine operation that applies an effect consequence immediately and records the resulting typed events. Effects are resolved sequentially through helpers rather than by building a separate pending-event queue.
_Avoid_: pending effect queue, event-only effect execution

**Effective Value**:
A context-specific value calculated from immutable base data plus active modifiers, such as the cost a specific player must pay for a card. Effective values do not mutate card definitions.
_Avoid_: modified card cost, rewritten card data

**Controlled Object**:
A card, token, status, or trophy-like object currently controlled by a player, including a card that has entered play and is still resolving. A defense card used from hand is not a controlled object unless an effect explicitly moves it into play. Ongoing modifiers are derived from controlled objects instead of being copied into a separate player modifier list.
_Avoid_: detached player modifier

**Controlled Object View**:
A read-only helper view that gathers separately stored controlled cards, tokens, statuses, and trophy-like objects for modifier calculations. It is not a single storage zone in game state.
_Avoid_: unified controlled objects zone

**Choice Policy**:
The deterministic decision hook used when an effect or rule requires a legal choice. The early baseline policy chooses the first legal option and is not intended to model strong player strategy.
_Avoid_: hidden handler choice, random default choice

**Strategy**:
The player decision model used during a simulated game. A strategy is separate from the player's starting build and from seating position.
_Avoid_: starting build, player identity, seed

**Full Comparison Mode**:
A user-facing analysis mode that compares strategies or starting builds across many simulated games. Full comparison modes require implemented strategies, starting builds, and a result surface for comparison; simple baseline simulation runs are not full comparison modes.
_Avoid_: smoke simulation, baseline run, single mass summary

**Best-Move Strategy**:
A strategy that evaluates the legal options available during a player's turn and chooses the best available line according to its configured evaluation policy.
_Avoid_: starting build analysis, first move analysis

**Starting Build**:
The initial combination of wizard properties and familiar assigned to a player before the game begins. Starting builds are compared separately from strategies.
_Avoid_: strategy, bot policy, player position

**Universal Mechanic**:
A rules-engine capability that can be implemented and tested with fixtures before real card, token, wizard property, or familiar data is imported. Universal mechanics are separate from concrete card mapping work; full real-card import should not run ahead of the universal mechanics needed to represent those cards, but small coverage imports are allowed when they validate a promoted or universal mechanic.
_Avoid_: imported card behavior, data import, real card coverage

**Mechanics Coverage Set**:
The short pre-import set of promoted and universal mechanics needed before broad real-card import: healing, damage, attacks and defense windows, gain/discard/destroy movement, reveal/play-top-deck effects, set-life effects, activations, wild magic, market chip markers, executable Mayhem hooks, basic token effects, and familiar lifecycle/effects.
_Avoid_: full card import, complete card database

**Mechanic Cluster**:
A planning group of cards, tokens, properties, and engine rules that must be implemented together because they depend on the same mechanic or modifier surface. v0.5 runtime mapping issues should be cut by mechanic clusters, not by incidental file location or by fixing old runtime JSON opportunistically.
_Avoid_: drive-by runtime fixes, one-card issue for a shared mechanic

**Primary Runtime Mechanic**:
The main mechanic or modifier surface that best explains why a card belongs in a mechanic cluster. A card can use several action windows or payloads, but its primary runtime mechanic is the larger surface that gives the card its playable identity.
_Avoid_: hardest sub-effect, every secondary payload, action window by default

**Fixture Mechanic**:
A temporary test-only mechanic or effect ID used to prove a rules-engine slice before it is promoted to normal runtime data language. Fixture mechanics must not be used as the canonical IDs for real playable card data; promoted mechanics are tested through their normal runtime IDs before fixture IDs are removed.
_Avoid_: production mechanic, real card effect ID

**Promoted Mechanic**:
A former fixture mechanic that has been checked against the rules canon, completed within its agreed scope, exposed through a normal runtime effect ID, and tested through that normal ID. Promotion is not just renaming.
_Avoid_: renamed fixture, unchecked runtime mechanic

**Implemented Coverage**:
The minimal runtime behavior currently executed by the engine for a card, token, or mechanic. Implemented coverage can be partial and does not imply full rule accuracy unless the documented coverage status says so.
_Avoid_: complete implementation, full rules support

**Runtime Effect ID**:
The stable machine-readable English identifier used by runtime data to invoke a typed effect handler. Runtime effect IDs are separate from Russian display terms and must not depend on localized card text.
_Avoid_: Russian display term as key, card text parsing

**Wand Attack Card**:
A card that qualifies for effects referring to "Палочки" when its visible Russian name contains "палочка" and its implemented behavior deals damage through an attack. A card does not qualify just because its name contains "палочка" if it is a permanent/location-style card without attack damage, and the normal `limpWand` special card does not qualify. A Legend card such as "ТА САМАЯ Вялая палочка" can qualify when it has attack damage behavior.
_Avoid_: name-only wand match, cardTypes-only wand match, treating all limpWand cards as attack wands

**Healing**:
A life-increase effect that lets a player накручивать lives up to the player's current maximum life. In current card coverage, normal healing effects heal the acting player rather than another chosen player.
_Avoid_: set life, damage prevention

**Set Life**:
An effect that directly changes a player's current life to a specified value, such as a Mayhem or Mega Mayhem setting lives to 10 or 13. Set Life is separate from Healing because it can lower or overwrite current life instead of adding lives.
_Avoid_: healing, damage

**Empty Choice Skip**:
The default behavior when an effect asks for a legal choice but no legal options exist. The effect is skipped unless its mapped effect data explicitly marks the empty choice as an error.
_Avoid_: default empty-choice failure

**Target Resolution**:
The shared rule layer that turns target descriptions such as self, all foes, chosen foe, left foe, right foe, strongest player, or weakest player into concrete player targets before an effect is applied.
_Avoid_: target logic inside each effect handler

**Immediate Death Resolution**:
The rule that a player dies as soon as their life drops below 1. Death, DWT gain, resurrection, and DWT immediate effects are resolved before continuing the remaining effect sequence.
_Avoid_: end-of-turn death check, delayed death

**Sequential Target Resolution**:
The rule that multi-target effects resolve one target at a time in seating order, with death and DWT effects fully resolved after each affected target before moving to the next target. Normal effects start from the applying player; Mayhem and Mega Mayhem effects start from the active player.
_Avoid_: batch target resolution

**Sequential Player Attack Resolution**:
The rule that normal player-controlled attacks resolve target by target: each affected target decides whether to defend, then that target's attack result is immediately resolved before moving to the next target.
_Avoid_: collect-all-defenses for normal attacks

**State-Sensitive Attack Order**:
The rule that state changes from one target of a normal player-controlled attack can affect later targets of the same attack, including later defense choices, modifiers, death, and DWT effects.
_Avoid_: snapshotting normal attack state

**Two-Phase Mayhem Attack Resolution**:
The rule that Mayhem and Mega Mayhem attacks first collect defense decisions from affected players in seating order, then resolve the attack in seating order against targets that did not avoid it.
_Avoid_: defend-and-resolve-per-target for Mayhem attacks

**Minimal Defense Window**:
The early supported defense workflow for attack resolution: an affected target may choose one legal defense from hand to avoid that attack instance, and the defense card moves according to mapped defense branch data. Redirects and complex extra defense effects can be added separately.
_Avoid_: attacks without defense support

**Defense Branch**:
The mapped effect sequence used when a defense card or defense-capable object is chosen during a defense window. A defense branch can both avoid the attack and perform additional supported effects through the shared effect runtime.
_Avoid_: avoid-only defense model

**Player-Caused Death**:
A foe death whose immediate cause is a player-controlled card, defense branch, effect, or other player-controlled object. Player-caused deaths can award Trophy credit even when the damage is not an attack.
_Avoid_: attack-only kill credit, damage-type trophy rule

**Defense Cost**:
The required payment or movement needed to use a defense branch, such as discarding the defense card, discarding another card, spending chips, or paying life. A defense option is legal only when its cost can be paid.
_Avoid_: free defense assumption

**Nonlethal Life Cost**:
The project rule that a player cannot pay a life cost if that payment would reduce their life below 1. Such a defense or effect option is not legal unless mapped data explicitly says otherwise.
_Avoid_: paying life into death

**Redirected Attack Source**:
The rule that a redirected attack becomes an attack from the defending player who redirected it. That player receives attack credit, can receive Trophy credit for a resulting kill, and their attack modifiers can apply to the redirected attack.
_Avoid_: redirect as target-only change

**Deferred Redirect Support**:
The decision to exclude redirect defenses from the first combat slice while keeping attack source, credit, and modifier concepts explicit enough to add redirect behavior later.
_Avoid_: redirect in first combat slice

**Basic Trophy Credit**:
The rule that a player gains control of the Trophy when that player causes a foe to die. Self-kills, source-less deaths, DWT-caused deaths, and unowned Mayhem/Mega Mayhem deaths do not move the Trophy.
_Avoid_: no trophy until full combat
