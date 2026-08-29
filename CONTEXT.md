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

**Visual Step**:
A single advance in a visual game review that presents one coherent game effect, including ordered automatic transitions needed to finish it, such as refilling the deck during a draw. Revealing a new card may end the current step, while playing and resolving that card begins the next step.
_Avoid_: raw event, animation frame, player action

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
The deterministic decision hook used when an effect or rule requires a legal choice. The current fallback chooses the first legal option; it is not a strong player strategy and never searches for a strong line. `baselineBot` is a separate `BotStrategy` with its own action priority.
_Avoid_: hidden handler choice, random default choice, Analyzer

**Strategy**:
The player decision model used during a simulated game. A strategy chooses legal actions for one participant, may be aggressive, defensive, or another player goal, and must not read future RNG outcomes or hidden opponent information. A strategy is separate from the player's starting build, seating position, and analysis tooling.
_Avoid_: starting build, player identity, seed, Analyzer, analysis policy

**Full Comparison Mode**:
A user-facing mode that compares implemented player strategies or starting builds across many simulated games. It is distinct from per-turn line analysis; a full comparison mode requires strategies, starting builds, and a result surface for comparison. Simple baseline simulation runs are not full comparison modes.
_Avoid_: smoke simulation, baseline run, single mass summary

**Best-Move Analyzer** (short: **Analyzer**):
An analysis component outside `BotStrategy` that receives complete engine state, including hidden information, and may fork seeded RNG to replay future branches reproducibly. It enumerates legal lines and ranks them only with an evaluation policy supplied by its caller; it does not act as a player, choose a universal definition of “best”, or alter effect resolution. The first implementation slice covers complete lines of the current turn through `endTurn`; multi-turn lookahead is a future extension.
_Avoid_: Best-Move Strategy, BestStrategy, BestBot, starting build analysis, first move analysis

**First-Place Analysis Policy**:
An Analyzer evaluation objective that treats finishing first as the only successful game outcome. Lower finishing places have no independent value, so the policy may accept a worse likely placement when that preserves a chance to win.
_Avoid_: rational policy, universal best-move policy, guaranteed-placement policy

**Best-Finish Analysis Policy**:
An Analyzer evaluation objective that values improvements in final placement as well as victory. It may prefer a reliable higher non-winning place over a small chance to win with a much worse likely finish.
_Avoid_: rational policy, universal best-move policy, first-place policy

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

**End-of-Turn Game Check**:
The game-ending checkpoint after the current player has completed the turn and immediately before control would pass clockwise. Empty DWT ends the game at the current turn's checkpoint. Market-deck insufficiency is recorded only when this player's start-of-turn Market Flow actually fails after event replacements, so a failed refill after the previous player's purchases ends the game at the end of this player's turn. The official rules establish end-of-turn timing; this explicit discovery/checkpoint model is the deterministic project ruling.
_Avoid_: immediate game end, predicting hidden Market Flow, empty-deck check without a failed refill

**ATTACK Ability**:
The card ability introduced by the printed `ATTACK:` marker. Its complete ATTACK text can span several sentences and can create one or more separate Attack Instances.
_Avoid_: treating every sentence as a separate ATTACK, treating the whole card as ATTACK text

**ATTACK Text**:
All instructions that belong to one ATTACK ability until the card moves to a separate ability. Conditions such as "if that Wizard dies" remain ATTACK text even when `ATTACK:` is not repeated.
_Avoid_: sentence-level ATTACK parsing, card-wide ATTACK text

**Attack Instance**:
One separately started ATTACK with one identity and one Defense quota per affected player. An Attack Instance may have several targets; an instruction to ATTACK again or ATTACK the next foe starts another instance after the current instance and its deferred DWT text finish.
_Avoid_: card resolution, target branch, one attack per target

**Attack Application**:
The target-local branch of a multi-target Attack Instance. Redirect can change the current controller, attacker, and target of one application without transferring the other applications or creating a new Attack Instance.
_Avoid_: separate redirected attack, global control transfer

**Attack Chain**:
A card-driven sequence in which the result of one completed Attack Instance starts another. The chain has no implicit once-per-target or once-per-round cap; each next instance uses current state and continues while its printed condition remains true. Empty DWT does not globally disable the chain or other ATTACKs; only a separately proven non-terminating continuation may receive the project's explicit cycle outcome.
_Avoid_: one multi-target Attack Instance, visited-target suppression, empty-DWT ATTACK lock

**Attack-Bound Consequence**:
An effect triggered by the event or outcome of a specific Attack Instance, such as an on-damage, on-kill, or after-this-attack consequence. The instance closes only after its ATTACK text and attack-bound consequences finish.
_Avoid_: independent card ability, card-wide aftermath

**Independent Card Ability**:
A card ability that is neither ATTACK text nor a consequence of a specific Attack Instance. Deferred DWT text from the preceding lethal ATTACK resolves before a later independent ability of the same card.
_Avoid_: attack-bound consequence

**Defense Window Mode**:
The explicit ordering policy for a multi-target Attack Instance. `PER_TARGET` completes Defense and ATTACK text target by target; `COLLECT_ALL_FIRST` completes every Defense window before resolving one shared interactive ATTACK text.
_Avoid_: inferring defense order from target count

**Interactive Multi-Target ATTACK**:
A semantic category whose ATTACK text cannot be resolved independently for one target without knowing which other players remain affected, such as passing cards among players. It uses `COLLECT_ALL_FIRST`; Mayhem uses the same broad phase order through its own special rule.
_Avoid_: every multi-target attack, Mayhem as the generic implementation

**Immediate Death Procedure**:
When life drops below 1, the player is defeated immediately, DWT gain or replacement is processed, and life is reset even if no DWT is received. The timing of the DWT's ordinary text is a separate rule.
_Avoid_: delaying defeat or respawn, treating DWT text as part of respawn

**DWT Respawn Modifier**:
A property of a newly revealed DWT, status, or ability that must be considered to calculate the current life reset. It applies before respawn; ordinary one-shot and Ongoing DWT text use their own timing.
_Avoid_: activating all DWT text before respawn

**Attack-Deferred DWT Text**:
Ordinary one-shot and Ongoing text of a DWT gained because its recipient was defeated by an ATTACK. Gain, reveal, and respawn happen immediately, but this ordinary text waits for the complete Attack Instance, including all target applications, redirect chains, shared ATTACK text, and attack-bound consequences. After closure, deferred tokens begin in turn order; multiple tokens of the same player retain gain order.
_Avoid_: waiting for the whole card, resolving between targets of one ATTACK

**DWT Respawn Context**:
The death and reset event attached to a DWT gained by its defeated recipient. A contextual one-shot can use this captured current context when deferred by an Attack Instance; direct gain without a current death/respawn does not create future eligibility.
_Avoid_: registering one-shot DWT text as a future trigger

**Direct DWT Resolution**:
A DWT gained without the recipient's death applies its gain-time statuses/permanent rules, resolves applicable one-shot text, and activates ordinary Ongoing text immediately at gain, even inside an Attack Instance. It creates no respawn; a Dingler effect immediately changes and clamps the actual recipient's current state and affects future respawns. A one-shot whose current death or respawn prerequisite is absent fizzles permanently rather than becoming a future trigger.
_Avoid_: attack-death defer for direct gain, future trigger registration

**Nested DWT Resolution**:
The depth-first rule for a non-ATTACK effect that causes death: gain, respawn, and applicable immediate DWT text resolve before returning to the interrupted effect. Only deaths caused by a concrete Attack Instance create its ordered deferred DWT queue.
_Avoid_: one global FIFO DWT queue, outermost-source boundary

**DWT Interception**:
A replacement of who actually gains a DWT during another player's death. The actual recipient handles it as direct gain before the defeated victim resets, including immediate gain-time statuses and nested effects; the victim still respawns, and the intercepted token cannot modify that victim's reset.
_Avoid_: transferring defeat or respawn to the interceptor, applying the intercepted token to the victim

**Two-Phase Mayhem Attack Resolution**:
The special Mayhem and Mega Mayhem rule: one event ATTACK remains one Attack Instance/DWT boundary, but first collects Defense decisions clockwise from the active player and then resolves the event clockwise. A defending player does not participate in ATTACK text, and Defense text that would affect an attacker, including redirect, does nothing.
_Avoid_: generic redirectable COLLECT_ALL_FIRST, defend-and-resolve-per-target Mayhem

**Defense Window**:
The opportunity for one affected player to use at most one legal Defense against one Attack Instance. Ordinary Defense costs and non-ATTACK effects resolve inside that window; redirect changes the actual ATTACK through the Attack Instance lifecycle.
_Avoid_: attacks without defense support, one defense per card resolution

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

**Redirected Attack Control**:
The rule that the defender who redirects an Attack Application becomes that application's current controller and attacker. Controller-sensitive modifiers and kill credit can move with that application, while the original card play, other target applications, and card-specific damage source remain separate facts.
_Avoid_: redirect as target-only change, global ownership transfer

**Redirect Identity**:
Redirect preserves the Attack Instance identity and changes one application's route. Defense quota is tracked by player and Attack Instance, so redirecting the same attack back to a player does not grant that player a second Defense.
_Avoid_: new ATTACK per redirect, reset defense quota

**Control Epoch**:
One uninterrupted period in which a player controls a redirected Attack Application. Controller-sensitive modifiers apply once per new control epoch to the carried current value; returning control can therefore apply the same physical modifier in a later epoch.
_Avoid_: recalculating from base after redirect, applying modifiers repeatedly without a control change

**Redirect Boundaries**:
Redirect requires a current attacker and affects only the defended application of a multi-target ATTACK. Against Mayhem or another explicitly ownerless nonredirectable attack, Defense still pays its costs, avoids the attack, and resolves ordinary branches, but attacker-facing text including redirect does nothing.
_Avoid_: inventing an attacker for ownerless attacks, redirecting every target application

**Basic Trophy Credit**:
The rule that a player gains control of the Trophy when that player causes a foe to die. Self-kills, source-less deaths, DWT-caused deaths, and unowned Mayhem/Mega Mayhem deaths do not move the Trophy.
_Avoid_: no trophy until full combat
