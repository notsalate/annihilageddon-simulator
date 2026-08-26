# Technical Rules Canon

Source: `Pravila_Krutagidon_2.pdf`, rules version 1.0. Page references are PDF page numbers from the visible rulebook pages. `ESW2-DBG-Rulebook-low_res.pdf` was used only to cross-check end-game tie-breaker wording in the earlier v0 pass.

This document is for engine implementation. It intentionally omits tutorial, flavor, marketing text, examples that do not add rules, and card-specific behavior that must come from card data or token data.

Current status: full global mechanics canon where the Russian rulebook gives source rules. Earlier runnable slices covered a smaller subset, but this file describes the executable global systems future engine and card-mapping agents should target. Card-specific effects and individual token faces are recorded as data dependencies instead of inferred behavior.

Runtime representation: the simulator is headless and bot-driven. During a game, the engine reads only mapped card/token/deck data and bot choices. It must not inspect OCR output, source layout, or natural-language card text. Source notation and wording are import evidence only; runtime behavior must already be represented as explicit kinds, types, effects, target selectors, attack instances, defense branches, activation effects, and market chip markers.

## Scope Markers

| Marker                 | Meaning                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `executable`           | Global rule is specified enough for engine implementation.                                                   |
| `data-required`        | Global algorithm is known, but exact branches/effects require imported card, token, deck, or component data. |
| `project-decision`     | Rulebook omits a final detail; project scope provides the implementation decision.                           |
| `runtime-fix-required` | Canon is specified, but current runtime behavior is known to differ and must not be treated as conforming.   |
| `v0-slice`             | Required for the first runnable simulator slice.                                                             |

These markers describe specification readiness. Except for the explicit `runtime-fix-required` warning, current implementation coverage is tracked only in [Mechanics Coverage](mechanics-coverage.md).

## Game Entities

| Entity                       | Canon rule                                                                                                                                                                                                                                                                                                                                                                                      | Status                                            | Source                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| Колдун                       | Each participant is a player wizard. Turn order proceeds clockwise from a random first player.                                                                                                                                                                                                                                                                                                  | `executable`                                      | p. 8                               |
| Life / lives                 | By default each player starts at `currentLife = 20` and `maxLife = 25`. The 25 value is only the healing/effect cap, not current life. Setup/token data may change starting life or max life. Dingler max is 15.                                                                                                                                                                                | `executable`                                      | pp. 4, 14, 16                      |
| Power / мощь                 | Turn-local currency produced by cards. Power can be spent across multiple purchases and is not lost until cleanup. Unspent power is lost during end-of-turn cleanup.                                                                                                                                                                                                                            | `executable`                                      | pp. 8-9, 20                        |
| Чипсины                      | Spendable tokens with no VP value. Chips reduce the power needed to buy cards of `карта легенды` at 1 chip = 1 power. They can also be spent only by mapped effects that explicitly spend chips. Spent chips move back to supply.                                                                                                                                                               | `executable`                                      | p. 15                              |
| Жетоны дохлых колдунов / ЖДК | Shuffled token stack with hidden/random draw order. Setup uses 4 tokens per player. Death, DWT gain/replacement, respawn/reset, and ordinary DWT text are distinct stages. Attack-caused death defers ordinary DWT text to the end of that Attack Instance; direct gain and non-ATTACK death use immediate nested resolution. Each token has at least -3 VP unless token data modifies scoring. | `runtime-fix-required`; faces are `data-required` | pp. 6, 14, 18; [report](report.md) |
| Главный приз                 | The player-controlled source that kills a foe gains control of the trophy. At the end of each controller turn, the trophy grants 1 chip. Self-kill, DWT kill, and unresolved market Mayhem/Mega Mayhem kill do not award the trophy.                                                                                                                                                            | `executable`                                      | p. 14                              |
| Лошара                       | Status represented by a token. A player can have at most one token, max life becomes 15, and the player has -5 VP at game end unless the status is removed.                                                                                                                                                                                                                                     | `executable`                                      | p. 14                              |

## Card Kinds and Decks

| Card kind / pile           | Canon rule                                                                                                                                                                                                                                                                                                                                             | Status                                           | Source           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------- |
| Starter deck               | Each player starts with 6 `Знак`, 1 `Сырная палочка`, and 3 `Пшик` cards. Each player's starter cards are separate card instances.                                                                                                                                                                                                                     | `executable`, `v0-slice`                         | p. 4             |
| Основная колода            | 114 cards: карты волшебников, тварей, заклинаний, сокровищ, мест и беспределов. It must not contain карты легенд or мегабеспределы. Exact card IDs/counts come from deck data.                                                                                                                                                                         | `executable`; composition is `data-required`     | p. 6             |
| Колода легенд              | 33 карты легенд plus 7 мегабеспределов in the Russian rulebook. Each карта легенды may also have another Russian type: волшебник, заклинание, место, сокровище, or тварь. Exact card IDs/counts come from deck data.                                                                                                                                   | `executable`; composition is `data-required`     | pp. 6, 11        |
| Барахолка                  | Main market contains 5 public non-беспредел cards. Market Flow restores it from main deck. Беспределы are resolved and destroyed instead of staying in the market.                                                                                                                                                                                     | `executable`                                     | pp. 6, 8, 13, 20 |
| Барахолка легенд           | Legend market contains 3 public non-мегабеспредел cards. Market Flow restores it from Legend deck. Мегабеспределы are resolved and destroyed instead of staying in the market.                                                                                                                                                                         | `executable`                                     | pp. 6, 8, 13, 20 |
| Шальная магия              | Separate stack of 15 cards, always buyable on a player's turn while available. Cost is 3 power. Its engine `cardKind` is `wildMagic`, but it has no main card type such as место/сокровище/тварь/заклинание/волшебник/фамильяр. On play, bot/action choice selects +2 power or playing the top card of a foe deck. Destroyed cards move to this stack. | `executable`                                     | pp. 6, 12        |
| Вялая палочка              | Separate stack of 15 cards. Never bought; only gained by effects. Its engine `cardKind` is `limpWand`, but it has no main card type such as место/сокровище/тварь/заклинание/волшебник/фамильяр. No play effect. Each owned card from this stack is -1 VP at game end. Destroyed cards move to this stack.                                             | `executable`                                     | pp. 6, 13        |
| Фамильяр                   | Each player has a personal unbought фамильяр slot. Its engine `cardKind` and card type is `familiar`. Only that player may buy it, for 6 power. While unbought, its effects and VP are inactive. Once bought, it moves to discard and behaves as a normal owned card.                                                                                  | `executable`; effects are `data-required`        | pp. 4, 10        |
| Жетон колдунского свойства | Setup grants each player a selected visible ability token. It grants the player a strategic effect from token data.                                                                                                                                                                                                                                    | setup is `executable`; faces are `data-required` | pp. 4, 18        |
| Стопка уничтоженных карт   | Destroyed cards move to a public out-of-play destroyed zone. Destroyed беспределы/мегабеспределы must preserve order because mapped effects can refer to them. Шальная магия and вялая палочка move to their stacks instead of staying destroyed.                                                                                                      | `executable`                                     | pp. 12-13        |

## Setup Algorithm

Source: pp. 4, 6, 8.

1. Select each player's жетон колдунского свойства:
   - Sample 2 random candidate tokens.
   - Choose 1 candidate; baseline deterministic fallback uses the first legal candidate in stable engine order.
   - Selected token enters the player's setup token zone and is public.
   - Unselected token moves to unused/out-of-game setup components.
2. Select each player's фамильяр:
   - Sample 2 random candidate фамильяр cards.
   - Choose 1 candidate; baseline deterministic fallback uses the first legal candidate in stable engine order.
   - Selected фамильяр enters that player's unbought familiar slot.
   - Unselected фамильяр moves to unused/out-of-game setup components.
   - If familiar data references a specific wizard identity/name, store that identifier in player state; the simulator does not need a separate wizard-board object.
3. Initialize each player's life state: default `currentLife = 20` and `maxLife = 25`. Setup/token data may change either value.
4. Create and shuffle all decks:
   - each player's personal starter deck: 6 `Знак`, 1 `Сырная палочка`, 3 `Пшик`;
   - main deck;
   - колода легенд.
5. Fill the main market from the already shuffled main deck until it has 5 non-беспредел cards:
   - Reveal top main-deck card.
   - If it is беспредел during initial setup, move it to the destroyed беспредел pile and reveal another card.
   - Otherwise move it to the market and apply chip marker movement if mapped card data has the market chip marker.
6. Fill the барахолка легенд from the already shuffled колода легенд until it has 3 non-мегабеспредел cards:
   - Reveal top card from колода легенд.
   - If it is мегабеспредел during initial setup, move it to the destroyed мегабеспредел pile and reveal another card.
   - Otherwise move it to the барахолка легенд and apply chip marker movement if mapped card data has the market chip marker.
7. Initialize `wildMagicStack` and `limpWandStack`. They are not part of either market.
8. Shuffle ЖДК once, take `4 * playerCount` as the hidden DWT draw stack, and move the rest to unused/out-of-game setup components.
9. Select first player using the seeded RNG.
10. Each player draws 5 cards.

## Deterministic Choice and Ordering Policy

These are project decisions for places where the rulebook requires a legal choice but does not define a smart player decision:

1. Baseline deterministic fallback:
   - Use the first legal option in stable engine order.
   - This applies to setup picks, target ties, and similar required choices unless a `Strategy` or `Choice Policy` explicitly injects another chooser.
2. Best-move/exhaustive branching is analysis-only:
   - The `Best-Move Analyzer` is outside `BotStrategy`; it may receive complete/hidden state, fork seeded RNG, and enumerate reproducible legal outcomes.
   - The caller supplies the evaluation policy. Analysis enumerates legal outcomes but never changes `listLegalActions`, effect choices, or the canon of effect resolution.
   - The first implementation scope is one current turn through `endTurn`; multi-turn lookahead remains future work.
3. Same-window ordering owned by one player:
   - If the rulebook does not specify an order, baseline resolution uses the first legal ordering in stable engine order.
   - `Best-Move Analyzer` may explore alternative legal orderings separately, without rewriting the canonical resolution order. A future player-observation contract will constrain the information available to a `Strategy`; it is not implemented yet.

## Player Zones and Ownership

| Zone               | Canon rule                                                                                                                                                                                                                                                                                                                   | Status                                  | Source         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------- |
| `deck`             | Facedown personal deck. Shuffle discard into deck only when a card must be drawn, played, discarded, or revealed from an empty deck.                                                                                                                                                                                         | `executable`                            | pp. 11, 20     |
| `hand`             | Cards available for play, discard, defense, and reveal-by-effect. End of turn discards all remaining hand cards.                                                                                                                                                                                                             | `executable`                            | pp. 8-11       |
| `discard`          | Public pile for purchased, gained, discarded, and most played cards unless mapped effect/component data changes the destination.                                                                                                                                                                                             | `executable`                            | pp. 8-9, 11-12 |
| `playedThisTurn`   | Non-Ongoing cards being played or already played and controlled by this player during the current turn. It can temporarily contain cards owned by another player if an effect plays them under this player's control. Default cleanup destination is the card owner's discard unless play context or mapped data changes it. | `executable`                            | pp. 9, 11-12   |
| `permanents`       | Ongoing objects in the player's persistent controlled zone, including cards or non-card components whose rule makes them Ongoing. They remain in play until an effect moves/removes them.                                                                                                                                    | `executable`                            | pp. 11, 14     |
| `deadWizardTokens` | Controlled DWTs in `deadWizardTokens`. Count for scoring and may have immediate, Ongoing, end-game, or other token-data effects.                                                                                                                                                                                             | `executable`; faces are `data-required` | pp. 14, 18     |
| `chips`            | Player's chip count. Bounded by the modeled token supply if supply is finite.                                                                                                                                                                                                                                                | `executable`                            | p. 15          |
| `dinglerStatus`    | Boolean/status token. Max life and VP penalty are derived from it.                                                                                                                                                                                                                                                           | `executable`                            | p. 14          |

Ownership/control rules:

- Each `CardInstance` is in exactly one zone at a time.
- Control is not a zone. It is represented by current controller. A player controls cards/objects whose current `controller` is that player.
- A card becomes controlled by a player when it enters play for resolution, before its mapped play effects finish resolving.
- Non-Ongoing cards in play are normally controlled only during the controller's active turn while they remain in `playedThisTurn`.
- Persistent controlled objects, such as Ongoing cards, trophy, DWTs, statuses, and setup tokens, can remain controlled outside their controller's active turn.
- Normally, cards in a player's `playedThisTurn` and `permanents` are controlled by that player.
- Hand, deck, discard, and market cards are not controlled.
- Control is separate from ownership: a player owns cards they bought or gained, regardless of current zone.
- Шальная магия can change ownership of an Ongoing card played from a foe deck; see [Шальная Магия](#шальная-магия).
- Trophy and some tokens are controlled Ongoing objects even though they are not normal cards.

Source: pp. 11-12, 14.

## Turn Flow

Source: pp. 8-9, 20.

1. Run Market Flow for the main market to restore it to 5 cards.
2. Run Market Flow for the Legend market to restore it to 3 cards.
3. Resolve effects labeled "at the start of turn" for the active player, using card/token data.
4. Main action loop: in any order while legal, active player may:
   - play a card from hand;
   - buy a card;
   - use an unused activation ability on a controlled card.
     Effects may also play cards from sources other than hand as part of resolving an action or card effect.
5. Active player declares end of turn. No more voluntary main-loop actions may be taken.
6. Discard all remaining hand cards to the player's discard.
7. Resolve effects labeled "at the end of turn":
   - Include controlled Ongoing cards/tokens such as the trophy.
   - If the rulebook does not specify an order for multiple same-window effects controlled by the same player, use the baseline deterministic fallback from [Deterministic Choice and Ordering Policy](#deterministic-choice-and-ordering-policy).
8. Move played non-Ongoing cards from `playedThisTurn` to their cleanup destinations. Default destination is the owner's discard. Ongoing cards remain in play. Unspent power is lost.
9. Draw 5 cards, modified by effects if card/token data changes hand refill.
10. Check the end conditions from [End Conditions and Scoring](#end-conditions-and-scoring). If this turn's Market Flow recorded a failed refill or the DWT stack is empty, end the game and score; otherwise pass turn clockwise to the next player, who starts again at step 1.

## Market Flow Algorithm

Source: pp. 6, 8, 13, 15, 20.

Use this algorithm for both setup market fill and turn-start Market Flow. During setup, беспредел/мегабеспредел cards are destroyed without resolving effects. During normal play, they resolve.

1. While market size is below target size:
   - Main market target is 5; source deck is main deck; event card is беспредел.
   - Барахолка легенд target is 3; source deck is колода легенд; event card is мегабеспредел.
2. If source deck has no card available when a market card is needed:
   - During setup, this is invalid setup/deck data.
   - During normal Market Flow, leave the market incomplete, stop refilling that market, and record the matching end condition for this active player's end-of-turn check. Continue the remaining turn sequence. The active player still takes and completes this turn; the game ends during that player's end-of-turn procedure before the turn can pass.
3. Reveal the top source-deck card.
4. If card is беспредел/мегабеспредел:
   - Pause Market Flow.
   - During setup: move it to the matching public destroyed event pile preserving order, then continue step 1.
   - During play: resolve `resolveMayhem(card, activePlayer, matchingMarket)`, move it to the matching public destroyed event pile preserving order, then continue step 1.
5. Otherwise move the card into the matching market.
6. If mapped card data has the market chip marker, immediately apply chip movement before revealing any further market cards:
   - For every card currently in that same market with the market chip marker, move 1 chip from supply onto that card.
   - This includes the newly moved market card.
   - Cards can accumulate multiple chips.
   - If supply is empty, move as many chips as available and log the shortage.

## Legal Actions in the Main Action Loop

| Action              | Preconditions                                                                                                                                                                 | Effects                                                                                                                                                                                                                                                                                             | Source            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Play card from hand | Active player has the card in hand.                                                                                                                                           | Move non-Ongoing cards to `playedThisTurn` or Ongoing cards to `permanents`. Set current controller to the active player. Apply mapped immediate effects, including the activation `onPlay` effect if present. Mapped activation effects can be activated later while the player controls the card. | pp. 8, 11, 16     |
| Play card by effect | Resolving effect explicitly plays a card from a specified source, such as a foe deck.                                                                                         | Use the same play procedure, but source, owner, controller, and cleanup destination come from effect/card data.                                                                                                                                                                                     | pp. 11-12, 16     |
| Buy market card     | Active player can pay total cost using power and allowed chips/discounts. Card is available in main market, барахолка легенд, шальная магия stack, or personal фамильяр slot. | Pay cost, move gained card to active player's discard unless mapped effect data changes the destination, and immediately gain any chips on the market card. Market Flow waits until the next turn-start Market Flow step.                                                                           | pp. 8, 10, 12, 15 |
| Use activation      | Active player controls a card with mapped activation effect, has not used that card's activation this turn, and can pay any costs.                                            | Resolve the mapped activation effect once for this turn. Unused activation rights do not carry to later turns.                                                                                                                                                                                      | pp. 8, 16         |
| End turn            | Always legal for active player.                                                                                                                                               | Enter end-turn sequence.                                                                                                                                                                                                                                                                            | p. 9              |

## Draw, Reveal, Play From Deck, and Shuffle

Source: pp. 11, 20.

- When a player must draw, play, discard, or reveal a card from their deck and the deck is empty, immediately shuffle that player's discard pile to form a new deck.
- Do not shuffle just because the deck is empty.
- If deck and discard are both empty, no card is available unless mapped effect/component data explicitly provides one.
- Revealed cards remain in the destination specified by the resolving effect. If source wording omits destination, card mapping must specify it; do not infer a default for arbitrary reveal behavior.
- A card discarded from the top of the deck counts as discarded.

## Playing Cards and Triggered Effects

Source: pp. 8, 11-12, 16.

Play context:

- Playing a card creates a temporary play context with at least `card`, `owner`, `controller`, `sourceZone`, and destination data for after play resolution or end-of-turn cleanup.
- The play context is not a zone. The card itself still moves to exactly one zone: `playedThisTurn` for non-Ongoing cards or `permanents` for Ongoing cards.
- After that move, the card is controlled while its play effects are still resolving.
- Moving an Ongoing card to `permanents` completes that play. Later attacks, activations, or Ongoing effects from that card are uses/effects of a controlled card, not playing the card again.
- Context decides where the card moves after resolution or cleanup. Zones do not infer ownership or destination by themselves.
- A card can be played from hand by a player action or from another specified source by an effect. The source changes the play context, not the core play procedure.

1. Move the played card from its source to the correct controlled zone:
   - From hand: `playedThisTurn` unless Ongoing, then `permanents`; owner and controller are normally the active player.
   - From a foe deck by шальная магия: see [Шальная Магия](#шальная-магия); owner may differ from current controller.
2. Resolve all mapped effects on the played card that are immediate for this play:
   - For cards with mapped activation, resolve the `onPlay` / before-activation part now.
   - The mapped activation effect is not resolved on play; it is available while the card remains controlled.
3. If playing the card triggers other controlled effects, resolve the played card completely first.
4. Resolve secondary triggered effects after the played card is complete. If multiple simultaneous secondary triggers are controlled by the same player and card/token data does not specify order, use the baseline deterministic fallback from [Deterministic Choice and Ordering Policy](#deterministic-choice-and-ordering-policy).
5. At end-of-turn cleanup, move non-Ongoing cards in `playedThisTurn` to their play-context destination unless an effect moved them earlier. Default destination is the owner's discard.

Cards played from another player's hand by an effect:

- The player instructed to play the card becomes its temporary controller for its complete resolution; the card keeps its original owner.
- This permission is limited to the instructed card. It does not grant normal turn actions, purchases, or permission to play other cards.
- An ATTACK on that card creates a separate nested Attack Instance with its own `AttackId` and Defense quotas. Finish that instance and its deferred DWT text before returning to the interrupted effect.
- An explicit destination in the surrounding effect or on the played card takes priority. If neither names a destination, return the card to its owner's hand after resolution.
- Ongoing does not transfer ownership by itself. Without an explicit Wild Magic-like ownership rule, the temporary controller does not keep the card as a permanent.
- Power gained outside that player's turn exists during resolution but does not grant normal actions. Unspent Power is lost at the end of the current turn unless another effect explicitly allows it to be spent earlier.

These rules are distinct from the printed Wild Magic ownership exception and are supported by the card-play clarifications collected in [the research report](report.md).

Dual attack/defense cards:

- If played by the active player on their turn, resolve the card's normal play/onPlay effects: power, draw, attack, and any other mapped play effects. The defense branch does not resolve.
- If used by an attacked target as a defense, resolve only the defense branch. This can happen on any player's turn, including the defending player's own turn if they legally attacked themselves. The defense card is not played, does not enter `playedThisTurn` or `permanents`, and is not controlled unless mapped data explicitly moves it into play. Normal play/onPlay effects such as power, draw, or attack do not resolve.
- If the defense branch says to discard the defense card to avoid the attack, the card moves to discard and is not under any player's control while it is there.
- If a defense use does not discard the card, it can still be played later on its controller's turn; that later play resolves the normal play/onPlay effects and not the defense branch.

Source: p. 11.

## Buying and Gaining

Source: pp. 8, 10, 12-13, 15.

| Rule                                                                                                                                                                                                                                                           | Status       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| A player may buy any number of available cards in a turn as long as total paid cost does not exceed available power plus allowed alternative payments.                                                                                                         | `executable` |
| Buying шальная магия is legal while its stack is non-empty and the active player can pay 3 power.                                                                                                                                                              | `executable` |
| Buying a personal фамильяр is legal only for its owner, costs 6 power, and moves it into that player's discard.                                                                                                                                                | `executable` |
| Bought or gained cards go to the gaining player's discard unless mapped effect data changes the destination.                                                                                                                                                   | `executable` |
| Gaining by effect does not require paying cost unless mapped effect data requires a cost.                                                                                                                                                                      | `executable` |
| If an effect asks to gain a card by name, type, or cost and no eligible card exists, no card is gained.                                                                                                                                                        | `executable` |
| If an effect gives a вялая палочка and the вялая палочка stack is empty, that part of the effect does nothing; all other effect parts still resolve.                                                                                                           | `executable` |
| Беспредел/мегабеспредел cards cannot be bought or gained into a player's personal deck. If a gain effect selects or reveals one, move that event card to the matching destroyed event pile without resolving it, and do not gain or reveal a replacement card. | `executable` |
| When a player gains a market card that has chips on it, the player immediately gains those chips too.                                                                                                                                                          | `executable` |

## Destroying Cards

Source: pp. 12-13.

1. Destroy removes the card from its current zone and from normal deck flow.
2. Default destination is the public destroyed zone unless a stack-move exception applies.
3. Destroyed cards of шальная магия move to `wildMagicStack`.
4. Destroyed cards of вялая палочка move to `limpWandStack`.
5. Destroyed беспределы/мегабеспределы move to the ordered public destroyed event pile.
6. Destroyed cards are no longer owned/scored by their previous owner unless mapped data explicitly keeps ownership/scoring.

## Attack and Defense Algorithm

Sources: pp. 10-13, 16-17.

Terminology:

- An `ATTACK:` marker starts an ATTACK ability. Its ATTACK text can span several sentences until the card moves to a separate ability.
- One separately started ATTACK creates one `AttackInstance` and one stable `AttackId`. One instance may affect one or many targets.
- `ATTACK again`, `ATTACK the next foe`, or another separately started ATTACK creates a new instance. A new instance is not another target of the old instance.
- An `AttackApplication` is the target-local branch of a multi-target instance. Redirect can change one application without changing the other applications.
- An attack-bound consequence is triggered by the event or result of a concrete Attack Instance, such as on-damage, on-kill, or after-that-attack text. The instance ends only after these consequences finish.
- A later independent ability of the same card is outside the Attack Instance. Deferred DWT text resolves before that later ability.
- Defense decisions and the one-Defense quota are scoped to `AttackId`, not to the whole card or to each redirect.
- `DefenseWindowMode` is explicit mapped data for each Attack Instance: attacks with independently resolvable target text select `PER_TARGET`; interactive attacks select `COLLECT_ALL_FIRST`; Mayhem uses its own special two-phase rule.
- An ATTACK printed by Mayhem/Mega Mayhem still creates one Attack Instance with one `AttackId` and one deferred-DWT boundary. Only its Defense/resolution phase order is special.

[The ATTACK/redirect/DWT research report](report.md) provides the official sources, direct clarifications, and RAW analysis for the core attack/redirect model and DWT boundary. Later project rulings are labeled explicitly in this canon and [ADR-0008](adr/0008-attack-instance-defense-and-dwt-boundary.md). Project terms do not claim to be printed rulebook terminology.

### Target Selection

1. Determine whether the current effect segment is an attack instance by mapped card data.
2. If mapped target selector requires choosing a target, first determine who applies the effect:
   - For a normal played card, the applying player is the card controller.
   - For беспредел/мегабеспредел, the applying player is the active player unless event mapping specifies a different chooser.
3. The applying player chooses from legal candidates each time the effect resolves:
   - `враг` means any player except the effect source player, if one exists.
   - `колдун` can include the effect source player.
   - Therefore, an attack targeting `колдун` can legally target its own source player, while an attack targeting `враг` cannot.
4. Only chosen/affected targets can defend.
5. If mapped target selector targets strongest/weakest:
   - Strongest/weakest is determined by current life.
   - "Самый могучий/хилый враг" means the foe with most/fewest life.
   - Ties among strongest/weakest candidates are broken by the player applying the effect. For беспредел/мегабеспредел, the active player makes that choice unless event mapping specifies a different chooser.
   - "Могучее/хилее тебя" excludes players with equal life.
6. If mapped target selector targets left/right foes:
   - Left and right are seating positions around the table.
   - In a two-player game, an attack against both left and right foes hits the single opponent only once.
7. If беспредел uses `колдун(ы)`, card mapping may produce one or multiple targets tied by the named parameter. The mapped target selector controls whether multiple targets are legal.

### Defense Declaration

1. Each affected player may use at most one Defense against one `AttackId`, even when redirect later returns that same attack to the player.
2. Defense protects only the defending player's Attack Application. It does not cancel applications against other targets.
3. A Defense window fully resolves the choice, costs/card use, ordinary non-ATTACK Defense effects, avoided state, and any redirect before the next scheduled Defense window.
4. A separate non-ATTACK Defense effect that kills a player uses immediate nested DWT resolution. Merely executing inside an active attack does not make that damage part of the ATTACK.
5. `PER_TARGET` completes each target before moving to the next:
   - Defense and any redirect chain;
   - ATTACK text for the final target of that application, in printed/mapped order;
   - if an ATTACK instruction causes death, pause that text for immediate defeat, DWT gain/replacement, and respawn, then resume the remaining ATTACK text;
   - attack-bound consequences;
   - attribution.
     Ordinary one-shot and Ongoing text of a DWT gained because of that ATTACK death remains deferred until the whole Attack Instance ends, so it cannot affect later targets of the same instance.
6. `COLLECT_ALL_FIRST` is used only when shared ATTACK text cannot be resolved independently for one target without knowing which other players remain affected, such as passing cards among affected players:
   - Fully resolve every Defense window first.
   - Mutations from an earlier Defense, including costs, draws, ordinary effects, and nested non-ATTACK death/DWT resolution, are visible when later players choose Defense. Do not freeze or snapshot their hands, prices, or legal options for the whole collection phase.
   - A redirect target's separate Defense window receives immediate priority after the current Defense closes, before continuing to later original targets.
   - Do not execute the shared ATTACK text during Defense collection.
   - After all windows and redirect chains, resolve the shared ATTACK text once against the final participant set.
7. An ordinary multi-target damage ATTACK is not interactive merely because it has several targets; it normally uses `PER_TARGET`.
8. Mayhem and Mega Mayhem always use their printed special collection and resolution order described below, not the generic interactive-attack implementation. Their ATTACK still has one Attack Instance/AttackId and defers ordinary text of DWTs caused by that ATTACK until the complete event ATTACK closes.
9. Avoiding an Attack Instance does not cancel an independent ability on the same card and does not avoid another separately started Attack Instance.
10. Some defenses deal separate non-ATTACK damage to the attacker. This is not redirect; if it kills the attacker, the defending player receives kill credit and Trophy as the immediate source owner.

### Redirected Attacks

Redirect carries the actual ATTACK that would have applied to the defending player. It is a change to one continuing Attack Application, not a new Attack Instance.

1. Preserve `AttackId`, original card/effect identity, and applications against every other original target.
2. For the redirected application, the defender becomes `currentAttackController` and `currentAttacker`; the previous attacker becomes `currentTarget` even when that player was not a legal original target.
3. Carry the complete ATTACK text applicable to the former target, including damage, discard, information, choices, and outcome branches. Preserve target-dependent values already calculated for the former target instead of recalculating them from the new target.
4. Each successful redirect begins a new control epoch for that application. Apply eligible current-controller modifiers once to the carried current value for that epoch. Do not reapply them merely because the same state is inspected twice.
5. The new target receives a Defense window before ATTACK text unless that player already used their one Defense against this `AttackId`. Redirect can continue, but it never refreshes Defense quota.
6. In `PER_TARGET`, complete the redirect chain and final ATTACK text before moving to the next original application. In `COLLECT_ALL_FIRST`, complete the redirect chain's Defense windows immediately, but keep the shared ATTACK text deferred until all original Defense windows finish.
7. Control and kill credit change only for the redirected application. Other target applications remain controlled by their previous controller.
8. `damageSource` is not inferred universally from control or kill credit. A card-specific effect can retain the original damage source when its clarification requires that behavior.
9. `activePlayerId` does not change. A redirected card played outside the redirector's turn does not grant normal turn actions.
10. Against Mayhem/Mega Mayhem, a Defense still pays costs, avoids the event for that player, and resolves ordinary branches, but all attacker-facing text including redirect does nothing.

The accepted project ruling for repeated controller doubling is one application per control epoch to the carried current value. Thus two matching doubling effects across `O → A → O` can produce `5 → 10 → 20 → 40`; this is a project ruling, not a direct designer example.

### Card-Resolution Identity

Every Attack Instance retains the source card and effect identity of the card resolution that created it, separately from each application's current controller, attacker, target, card-specific damage source, and kill credit. Trophy and kill credit use the current controller of the lethal application unless a specific rule says otherwise. Card-level aggregate consequences still see deaths caused by applications of the original card resolution, including redirected applications.

### Resolution Order

1. When order matters, normal effects start clockwise from the applying player; Mayhem/Mega Mayhem start from the active player.
2. A normal non-ATTACK multi-target effect resolves target by target. A non-ATTACK death and its applicable DWT text resolve depth-first before the next target.
3. A `PER_TARGET` Attack Instance resolves each application in order, but ordinary text of DWTs gained because of deaths from that ATTACK remains deferred until the entire instance ends.
4. A `COLLECT_ALL_FIRST` Attack Instance first builds its final participant/application set, then resolves shared ATTACK text once.
5. For a physical instruction such as passing a card to the player on the left, "left" remains the physical seating relation. A player who avoided the ATTACK neither sends nor receives through ATTACK text; a transfer aimed at that player fails rather than skipping to another participant. This is an accepted project ruling for ordinary interactive attacks.
6. Close an Attack Instance only after all its applications, redirect chains, ATTACK text, and attack-bound consequences finish. Then activate/resolve ordinary text of every DWT deferred by deaths from that instance in turn order, regardless of the order in which its target applications produced the deaths. If one player gained more than one deferred DWT from that same instance, keep that player's tokens in gain order.
7. If a deferred DWT item causes a non-ATTACK death, resolve that nested death and its DWT depth-first before returning to the current item and before moving to the next deferred item.
8. Resolve deferred DWT text before a later independent ability of the same card or a separately started next ATTACK.
9. An instruction to start a later ATTACK schedules only that next instance. After current deferred DWT text, create the new instance from current state and recalculate its legal target, damage, modifiers, and defenses; preserve only parameters the card explicitly carries forward, such as direction.
10. A card played while resolving ATTACK text can start a separate nested Attack Instance. Finish that nested instance and its own deferred DWT text before returning to the outer ATTACK.

An ATTACK chain has no implicit limit by round, unique target, or prior visit. If the printed continuation condition remains true, a later instance can revisit and kill the same foe again. Exhausting the DWT stack does not itself stop the current chain or prohibit other ATTACKs: it schedules the game to end during the current player's end-of-turn procedure, while defeated players still reset when no token is available. A state in which every next target necessarily dies and no Defense or other rules-relevant state change can interrupt the chain is therefore non-terminating under the printed rules. The project intends to stop only a proven non-terminating continuation, not deaths or ATTACKs generally; the exact cycle criterion remains tracked in [Rules Open Questions](rules-open-questions.md). Do not use DWT exhaustion as a global ATTACK lock or as an immediate end of the current turn.

## Беспредел and Мегабеспредел

Sources: pp. 6, 8, 12-13, 20.

`resolveMayhem(card, activePlayer, market)`:

1. Determine whether the card is беспредел or мегабеспредел from deck/card data.
2. Pause the Market Flow that revealed it.
3. Resolve the mapped беспредел effect.
4. If it is an attack:
   - Create one Attack Instance/AttackId for the complete Mayhem/Mega Mayhem ATTACK. Use its closure as the deferred-DWT boundary even though the event has a special Defense/resolution phase order.
   - Use the беспредел defense declaration order: active player first, then clockwise.
   - Use the беспредел resolution order: clockwise from active player after all defense decisions.
   - Defense effects that affect an attacker do nothing because there is no attacker.
5. If it is not an attack, it is unavoidable unless mapped effect data explicitly says a player does not participate in беспредел.
6. If mapped effect data says a player does not participate in беспредел:
   - Treat them as automatically avoiding the attack if any.
   - They perform none of the беспредел's actions and are skipped for passing/receiving/discarding/gaining/etc.
7. After the effect is fully resolved, move the беспредел/мегабеспредел to the matching public destroyed event pile, preserving order.
8. Resume Market Flow by revealing a replacement from the same deck.
9. If the replacement is another беспредел/мегабеспредел, repeat this algorithm.
10. If the deck cannot provide enough non-event cards to reach target market size during turn-start Market Flow, record the matching end condition and leave that market incomplete. This can occur even when the deck initially contains as many cards as there are vacancies, because newly revealed Mayhem/Mega Mayhem cards consume replacements. The active player completes the turn; the game ends during that player's end-of-turn procedure.

Gain attempts involving event cards use the buy/gain rule in [Buying and Gaining](#buying-and-gaining).

## Шальная Магия

Source: pp. 6, 12-13.

Stack and purchase:

- Use 15 cards from the Russian rulebook.
- Шальная магия stack is not part of either market.
- Active player may buy any number of cards from шальная магия in a turn while the stack has cards and they can pay 3 power per card.
- Bought шальная магия moves to discard unless mapped effect data changes the destination.
- Шальная магия has `cardKind = wildMagic` and no main card types.
- Destroyed шальная магия moves to the шальная магия stack.

Play algorithm:

1. Player plays шальная магия from hand as a normal card.
2. Bot/action choice selects one option:
   - gain +2 power; or
   - select a foe and play the top card of that foe's deck.
3. If playing from a foe deck:
   - If foe deck is empty, shuffle that foe's discard into their deck if possible.
   - If no card is available, the option produces no played card.
   - Reveal/play the top card by moving it into the acting player's `playedThisTurn` if non-Ongoing or `permanents` if Ongoing.
   - The controller is the player currently resolving the play, not the owner of the шальная магия card. This remains true when a чужая шальная магия is itself played by an effect.
   - The played card keeps its original owner while it is non-Ongoing, but its current controller is the acting player.
   - Resolve it as played by the acting player.
   - Resolve the before-activation / `onPlay` part immediately. Its activation remains available to that controller through the end of the current turn, even if the non-Ongoing card has already moved to its owner's discard.
   - If the played card is non-Ongoing, its default destination after resolution is its owner's discard unless mapped data changes the destination.
   - Temporary control is cleared at end of turn; the card then stays in its owner's discard and cannot be activated through that play.
   - If the played card is Ongoing, the acting player becomes its new owner and it moves to that player's `permanents` as if played from hand.

## Вялая Палочка

Source: pp. 6, 13.

- Вялая палочка stack uses 15 cards from the Russian rulebook.
- Cards from вялая палочка cannot be bought.
- Effects can give вялые палочки to players.
- A gained вялая палочка moves to the gaining player's discard unless mapped effect data changes the destination.
- If the stack is empty, the `gainLimpWand` part of an effect does nothing, but all other effect parts still resolve.
- A player may still use defense against an attack that would give вялые палочки even if the stack is empty.
- Вялые палочки have `cardKind = limpWand` and no main card types.
- They have no play effect; they may be played or left in hand and discarded during cleanup.
- Each вялая палочка in the player's scoring collection is -1 VP.
- Destroyed вялые палочки move to the вялая палочка stack.

## Chips

Source: p. 15.

Chip supply:

- Chips have no VP value.
- A player can hold any number of chips, limited only by modeled supply if finite.
- If supply runs out, later chip gains/movements cannot produce missing chips.
- Spent chips move back to supply.

Chip spending:

- Legend purchase discount: each chip reduces the power needed to buy a card of `карта легенды` by 1.
- If mapped effect data lets a non-Legend card be bought as `карта легенды`, chips can reduce that purchase cost.
- Explicit chip-spend effects: chips can be spent by a card/token effect only if that effect directly says to spend chips.

## Ongoing Cards and Activations

Sources: pp. 8, 11, 14, 16.

Ongoing:

1. Buying/gaining an Ongoing card moves it to discard like any other card.
2. Playing an Ongoing card from hand moves it into `permanents`.
3. It remains in play until an attack/effect moves it elsewhere or game scoring starts.
4. Ongoing cards are controlled by the player whose `permanents` zone contains them.
5. They are "played" only on the turn they enter play.
6. There is no limit on number of controlled Ongoing cards.
7. Ongoing effects remain active while in play. Exact effect hooks come from card/token data.

Activations:

1. When a card with mapped activation is played, immediately resolve its `onPlay` / before-activation part.
2. The mapped activation effect can be used once per turn while the player controls that card.
3. If the card was played this turn, its activation can be used later in that same turn while that temporary control lasts, including after a non-Ongoing card moved to its owner's discard.
4. Activation can be used any time in the active player's main action loop while the card is controlled, has not been activated this turn, and costs can be paid.
5. Track activation use per controlled card per turn. At the end of the turn, unused activation rights expire and are not carried forward.

## Death, Resurrection, Trophy, and Dingler

Sources: pp. 14, 16-18.

Death algorithm:

Death, DWT gain, respawn, and ordinary DWT text are separate stages. Do not represent every DWT through one global FIFO queue.

1. When a player's life drops below 1, mark them defeated immediately. Excess damage has no extra effect.
2. Process DWT gain before life reset:
   - Apply any gain replacement or interception.
   - If a token is available, the actual recipient gains, reveals, and controls the next token from the already shuffled hidden DWT stack.
   - If the actual recipient is not the defeated player, process that recipient's direct gain immediately according to step 6, including nested non-ATTACK deaths, before continuing the victim's reset.
   - If no token is gained, the defeated player still proceeds to reset/respawn.
3. For a token actually gained by the defeated player, inspect only properties needed to calculate this current reset, such as becoming Dingler or another explicit respawn value. Capture any gain-time prerequisite needed by later deferred text; do not reevaluate it after reset. Do not activate all ordinary Ongoing text merely because the token was revealed.
4. Reset the defeated player's life to the applicable resurrection value and record respawn. The default is 20; Dingler is 15; a controlled property may specify another value.
5. For a token gained by the defeated player, determine ordinary DWT timing from the immediate source:
   - If the recipient was defeated by ATTACK text or an attack-bound consequence of a concrete Attack Instance, defer that token's applicable one-shot text and ordinary Ongoing activation until the entire same instance closes.
   - The defer covers every target application, redirect chain, shared ATTACK text, and attack-bound consequence. It does not wait for a later independent ability of the card or a separately started next ATTACK.
   - After the Attack Instance closes, all DWT items deferred by it begin in turn order, regardless of target/death order. Multiple deferred tokens belonging to the same player retain gain order.
   - If one deferred item causes a non-ATTACK death, resolve the new death and its DWT depth-first before returning to the current item and before starting the next deferred item.
   - If death came from a separate non-ATTACK effect, resolve applicable one-shot text and activate ordinary Ongoing text immediately and depth-first before returning to the interrupted effect. This includes separate Defense damage and damage from a DWT face even when an Attack Instance is currently active.
6. Direct DWT gain without the recipient's death never causes respawn. Resolve its currently applicable one-shot text and activate ordinary Ongoing text immediately at gain, including during an Attack Instance.
   - Apply any gain-time status or permanent rule belonging to the token to the actual recipient immediately. A direct-gain Dingler effect immediately gives that recipient Dingler status and clamps current life to 15; it affects future respawns but does not create a respawn now.
7. A contextual one-shot DWT instruction is checked against the gain's current death/respawn context. If its prerequisite is absent, it fizzles permanently and is not registered as a future trigger. A deferred token from attack death retains the context of that death/respawn when its ordinary text later resolves.
8. If a DWT contains only ordinary Ongoing text, attack-caused death defers its activation but creates no one-shot work item. A respawn modifier remains the only token property applied before the current reset.
9. If death resolution consumes the last DWT, continue the current action and the rest of the active player's turn. The game ends during that player's end-of-turn procedure before the turn can pass.

DWT interception is an accepted RAW-favored project ruling because no separate designer ruling establishes this micro-order:

1. Mark the victim defeated.
2. Apply the DWT gain replacement. The interceptor gains/reveals the token as a direct gain and owns its statuses and future effects.
3. Apply the interceptor's gain-time statuses and permanent rules, then resolve applicable immediate text and activate ordinary Ongoing text now. A Dingler token immediately makes the interceptor Dingler and clamps that player's current life; it does not affect the victim's reset. Any non-ATTACK deaths caused here resolve depth-first.
4. Return to the original death procedure and reset/respawn the defeated victim without applying the intercepted token to that victim.

The victim remains defeated and respawns even when the token is intercepted or unavailable. A permanent status on the intercepted DWT affects the interceptor's current state and future respawns, not the victim's current respawn.

Evidence status:

- Immediate defeat, DWT gain/reveal, reset, and delayed ordinary DWT text after a lethal ATTACK come from the official rules and direct clarification collected in [the report](report.md).
- Scoping the defer to the concrete Attack Instance is a strong RAW inference adopted by the project.
- Immediate-source classification, the local deferred queue plus depth-first nesting, contextual one-shot fizzle, ordinary Ongoing timing, and interception micro-order are accepted project rulings.
- Revisit these project rulings if a direct official clarification addresses the same micro-order; do not silently change them from an implementation PR.

Trophy:

- When a player-controlled source causes a foe to die, that player gains control of the trophy.
- Trophy is an Ongoing controlled object.
- At the end of each turn of its controller, the controller gains 1 chip.
- No trophy is awarded when a player kills themselves.
- No trophy is awarded for a death caused by a DWT, a normal market-triggered беспредел/мегабеспредел, or another source not caused by a player.
- A defense branch that deals non-attack damage to the attacker awards the trophy to the defending player if that damage kills the attacker, because the defending player caused the death.
- If a player uses a card effect to play a беспредел/мегабеспредел, that player is the player-controlled source and can gain the trophy for a kill.
- Some mapped effects can count a target as having died even without DWT gain; trophy can still be awarded if mapped effect data says so.

Cause of death for trophy credit:

- Death from a player's card, activated ability, Ongoing effect, or other player-controlled effect gives the trophy to that player.
- Self-kill never moves the trophy.
- Death from a DWT never moves the trophy.
- Death from a normal market-triggered беспредел/мегабеспредел never moves the trophy because there is no player-controlled source.
- Death from defense belongs to the defending player if the defense branch caused the lethal damage/effect.
- Death from a player-triggered беспредел/мегабеспредел belongs to the player who triggered or played that event effect.

Dingler:

- A player can have at most one Dingler token.
- Dingler max life is 15. If a player becomes Dingler above 15 life, reduce current life to 15.
- Dingler status gives -5 VP at game end unless removed.
- Some cards/tokens target Dinglers or remove/swap this status; exact choices are card/token data.

## Healing

Source: p. 16.

- Healing is allowed even if current life is at or above 20.
- Normal max life is 25.
- Dingler max life is 15.
- If max life changes downward, clamp current life to the new max.
- Healing cannot increase life above current max.

## End Conditions and Scoring

Source: pp. 9, 13-14, 20, plus project decision for the final unresolved tie.

The game ends during the current player's end-of-turn procedure, after that player has completed the turn and before the turn passes clockwise, if any of these conditions is true:

| End condition                                                                   | Status                 |
| ------------------------------------------------------------------------------- | ---------------------- |
| This turn's Market Flow attempted but failed to restore the Legend market to 3. | `runtime-fix-required` |
| This turn's Market Flow attempted but failed to restore the main market to 5.   | `runtime-fix-required` |
| DWT stack is empty.                                                             | `executable`           |

Meeting an end condition never interrupts the current action, card, ATTACK, or voluntary action loop. The active player completes the turn, including end-of-turn cleanup and effects, and then the game ends instead of passing to the next player.

The condition list and end-of-current-turn timing are official. The rulebook does not place the check between the individual end-of-turn cleanup steps. The deterministic project checkpoint is after end-of-turn effects, cleanup, and hand refill, immediately before the turn would pass to the next player.

Market-deck insufficiency is discovered only by the actual Market Flow at the start of a turn, after resolving and replacing every revealed Mayhem/Mega Mayhem. Do not predict this condition at the preceding player's end by counting cards or inspecting hidden card identities. If player A creates three market vacancies, player B begins the next turn and attempts the refill. If that attempt fails because the deck has too few cards or its remaining cards are events that consume their own replacements, player B completes the turn and the game ends during B's end-of-turn procedure. An empty market deck is not by itself an end condition while no refill is attempted.

Before scoring:

1. Build each player's scoring collection from all owned scoring zones and controlled owned permanents.
2. Include hand, deck, discard, played non-Ongoing cards if any remain, owned permanents, owned gained cards, вялые палочки, DWTs, Dingler status, and token/card scoring modifiers.
3. Do not score an unbought фамильяр still in the player's unbought familiar slot.
4. Do not score chips.

Scoring order:

| Order | Rule                                                                | Source                                                     |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Highest total VP wins.                                              | p. 9                                                       |
| 2     | If tied, tied player with more owned cards of `карта легенды` wins. | p. 9                                                       |
| 3     | If still tied, tied player with fewer ЖДК wins.                     | p. 9                                                       |
| 4     | If still tied, treat as a true tie.                                 | project decision; PDF does not state an additional breaker |

Known global score modifiers:

| Modifier         | VP                                        | Status                                  | Source     |
| ---------------- | ----------------------------------------- | --------------------------------------- | ---------- |
| ЖДК base penalty | -3 VP each, plus token-specific modifiers | `executable`; faces are `data-required` | pp. 14, 18 |
| Вялая палочка    | -1 VP each                                | `executable`                            | p. 13      |
| Dingler status   | -5 VP if still Dingler at game end        | `executable`                            | p. 14      |

## Machine-Oriented Mechanics Table

| Mechanic id                 | Russian term                | Engine meaning                                                                                                                                                                                                        | Status                                           | Source                          |
| --------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `power`                     | мощь                        | Turn-local buy resource; can accumulate across play/buy actions during the same turn; lost at cleanup.                                                                                                                | `executable`                                     | pp. 8-9                         |
| `victory_points`            | победные очки / ПО          | Numeric end-game score on cards and modifiers.                                                                                                                                                                        | `executable`                                     | pp. 5, 9                        |
| `legend_count`              | количество карт легенд      | Tie-breaker count of owned cards with type `карта легенды` for tied players.                                                                                                                                          | `executable`                                     | p. 9                            |
| `dead_wizard_token`         | жетон дохлого колдуна / ЖДК | Token with separate gain, respawn-modifier, one-shot, Ongoing, and scoring semantics. ATTACK death defers ordinary text to its Attack Instance; direct gain and non-ATTACK death resolve applicable text immediately. | `runtime-fix-required`; faces `data-required`    | pp. 14, 18; [report](report.md) |
| `ongoing`                   | Постоянка                   | Card/object attribute: when played or created in play, it uses the `permanents` zone and stays under control until removed; it is not discarded during normal cleanup.                                                | `executable`                                     | pp. 11, 14                      |
| `activate`                  | активация                   | Mapped activation: the before-activation part resolves on play; the activation effect can be used once per turn while the card is controlled.                                                                         | `executable`                                     | pp. 8, 16                       |
| `attack`                    | атака                       | One separately started Attack Instance with a stable `AttackId`, one or more target applications, and explicit `PER_TARGET` or `COLLECT_ALL_FIRST` Defense-window ordering. One card may start several instances.     | `runtime-fix-required`                           | pp. 10-11; [report](report.md)  |
| `defense`                   | защита                      | One Defense per affected player and `AttackId`. Each Defense window resolves fully; ATTACK text follows the instance's explicit Defense-window mode.                                                                  | `runtime-fix-required`                           | pp. 10-11; [report](report.md)  |
| `redirect_attack`           | перенаправить атаку         | Redirect preserves `AttackId`, changes one target application and its controller, and opens a Defense window for the new target only if that target has unused quota.                                                 | `runtime-fix-required`                           | p. 17; [report](report.md)      |
| `destroy`                   | уничтожить                  | Move card out of game to destroyed area; шальная магия and вялая палочка move to their stacks.                                                                                                                        | `executable`                                     | pp. 12-13                       |
| `gain`                      | получить карту              | Take a specified/eligible card without paying and move it to discard unless mapped effect data changes the destination.                                                                                               | `executable`                                     | p. 12                           |
| `discard`                   | сбросить карту              | Default source is hand unless another source is specified; deck-discard also counts as discard.                                                                                                                       | `executable`                                     | p. 11                           |
| `reveal_from_deck`          | раскрыть карту из колоды    | If deck empty, shuffle discard first; card-specific effect decides destination.                                                                                                                                       | `executable`; destination may be `data-required` | pp. 11, 20                      |
| `wild_magic`                | шальная магия               | Buyable stack card kind, cost 3, no main card type, choice on play between +2 power or playing top card of foe deck.                                                                                                  | `executable`                                     | p. 12                           |
| `limp_wand`                 | вялая палочка               | Stack-gained junk card kind, no main card type, no effect, -1 VP.                                                                                                                                                     | `executable`                                     | p. 13                           |
| `mayhem`                    | беспредел                   | Event card from main deck; resolves during Market Flow, then is destroyed and Market Flow continues. Its ATTACK uses the event-specific phase order but still has one Attack Instance/DWT boundary.                   | `runtime-fix-required`; effect `data-required`   | p. 13                           |
| `mega_mayhem`               | мегабеспредел               | Event card from Legend deck; resolves during Market Flow, then is destroyed and Market Flow continues. Its ATTACK uses the event-specific phase order but still has one Attack Instance/DWT boundary.                 | `runtime-fix-required`; effect `data-required`   | p. 13                           |
| `chip`                      | чипсина                     | Spendable token; reduces power cost 1:1 when buying cards of `карта легенды`, and can be spent by effects that explicitly say to spend chips.                                                                         | `executable`                                     | p. 15                           |
| `market_chip_marker`        | символ чипсины              | When a marked card enters market, move 1 chip from supply onto every marked market card before continuing Market Flow.                                                                                                | `executable`                                     | p. 15                           |
| `dingler`                   | лошара                      | Status: max 15 life, -5 VP at end, only one token.                                                                                                                                                                    | `executable`                                     | p. 14                           |
| `trophy`                    | главный приз Крутагидона    | Controlled Ongoing trophy awarded for killing a foe; grants 1 chip at end of controller's turn.                                                                                                                       | `executable`                                     | p. 14                           |
| `heal`                      | накручивать жизни           | Increase life up to current max; usable even at max.                                                                                                                                                                  | `executable`                                     | p. 16                           |
| `not_participate_in_mayhem` | не участвовать в беспределе | Player skips all беспредел attack/actions and interactions.                                                                                                                                                           | `data-required`                                  | p. 13                           |

## Explicit v0 Implementation Set

The first runnable engine should implement these rules before full card-effect coverage:

- 2-player setup with deterministic seeded choice/shuffle.
- Separate card instances for each player's starter deck and shared decks.
- Starter decks: 6 `Знак`, 1 `Сырная палочка`, 3 `Пшик` per player.
- Explicit setup shuffle for starter decks, main deck, and Legend deck.
- Main deck, Legend deck, main market size 5, Legend market size 3.
- DWT stack size `4 * playerCount`.
- Player zones: deck, hand, discard, playedThisTurn, permanents.
- Draw 5 at game start and end of turn.
- Shuffle discard into deck only on required draw/play/discard/reveal from empty deck.
- Generic play-card movement and power accumulation for mapped cards.
- Generic buy-card action, including gained cards to discard.
- Turn-start Market Flow in order: main market first, then Legend market; main action loop; and end-turn cleanup.
- Ongoing cards remaining in play.
- Real end conditions: main deck cannot restore the main market, Legend deck cannot restore the Legend market, DWT stack empty.
- Scoring: VP, Legend count tie-breaker, DWT count tie-breaker, true tie fallback per project scope.
- Technical `maxTurns` only as a non-game safety stop in simulation summary.

## Retained Data Dependencies

These are not open global rules; they are component/card data needed by implementation:

- Exact main deck card IDs/counts.
- Exact Legend deck card IDs/counts.
- Full card effect mappings for all cards, беспределы, мегабеспределы, фамильяры, and activation/defense/attack branches.
- Full DWT faces and effect mappings.
- Full жетон колдунского свойства faces and effect mappings.
- Bot/setup choice policy for choosing between dealt setup options and player-controlled target choices.
