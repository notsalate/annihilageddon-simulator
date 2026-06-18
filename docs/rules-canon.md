# Technical Rules Canon

Source: `Pravila_Krutagidon_2.pdf`, rules version 1.0. Page references are PDF page numbers from the visible rulebook pages. `ESW2-DBG-Rulebook-low_res.pdf` was used only to cross-check end-game tie-breaker wording in the earlier v0 pass.

This document is for engine implementation. It intentionally omits tutorial, flavor, marketing text, examples that do not add rules, and card-specific behavior that must come from card data or token data.

Current status: full global mechanics canon where the Russian rulebook gives source rules. v0 remains a smaller implementation slice in `docs/simulation-scope.md`, but this file describes the executable global systems future engine and card-mapping agents should target. Card-specific effects and individual token faces are recorded as data dependencies instead of inferred behavior.

Runtime representation: the simulator is headless and bot-driven. During a game, the engine reads only mapped card/token/deck data and bot choices. It must not inspect OCR output, source layout, or natural-language card text. Source notation and wording are import evidence only; runtime behavior must already be represented as explicit kinds, types, effects, target selectors, attack instances, defense branches, activation effects, and market chip markers.

## Scope Markers

| Marker | Meaning |
| --- | --- |
| `executable` | Global rule is specified enough for engine implementation. |
| `data-required` | Global algorithm is known, but exact branches/effects require imported card, token, deck, or component data. |
| `project-decision` | Rulebook omits a final detail; project scope provides the implementation decision. |
| `v0-slice` | Required for the first runnable simulator described in `docs/simulation-scope.md`. |

## Game Entities

| Entity | Canon rule | Status | Source |
| --- | --- | --- | --- |
| Колдун | Each participant is a player wizard. Turn order proceeds clockwise from a random first player. | `executable` | p. 8 |
| Life / lives | By default each player starts at `currentLife = 20` and `maxLife = 25`. The 25 value is only the healing/effect cap, not current life. Setup/token data may change starting life or max life. Dingler max is 15. | `executable` | pp. 4, 14, 16 |
| Power / мощь | Turn-local currency produced by cards. Power can be spent across multiple purchases and is not lost until cleanup. Unspent power is lost during end-of-turn cleanup. | `executable` | pp. 8-9, 20 |
| Чипсины | Spendable tokens with no VP value. Chips reduce the power needed to buy cards of `карта легенды` at 1 chip = 1 power. They can also be spent only by mapped effects that explicitly spend chips. Spent chips move back to supply. | `executable` | p. 15 |
| Жетоны дохлых колдунов / ЖДК | Shuffled token stack with hidden/random draw order. Setup uses 4 tokens per player. A dying player gains the next/random token, controls it, reveals it for effects/logging, then resurrects. Each token has at least -3 VP unless token data modifies scoring. | `executable`; faces are `data-required` | pp. 6, 14, 18 |
| Главный приз | The player who kills a foe gains control of the trophy. At the end of each controller turn, the trophy grants 1 chip. No trophy is awarded for self-kill, беспредел kill, or kill by an unowned market card. | `executable` | p. 14 |
| Лошара | Status represented by a token. A player can have at most one token, max life becomes 15, and the player has -5 VP at game end unless the status is removed. | `executable` | p. 14 |

## Card Kinds and Decks

| Card kind / pile | Canon rule | Status | Source |
| --- | --- | --- | --- |
| Starter deck | Each player starts with 6 `Знак`, 1 `Сырная палочка`, and 3 `Пшик` cards. Each player's starter cards are separate card instances. | `executable`, `v0-slice` | p. 4 |
| Основная колода | 114 cards: карты волшебников, тварей, заклинаний, сокровищ, мест и беспределов. It must not contain карты легенд or мегабеспределы. Exact card IDs/counts come from deck data. | `executable`; composition is `data-required` | p. 6 |
| Колода легенд | 33 карты легенд plus 7 мегабеспределов in the Russian rulebook. Each карта легенды may also have another Russian type: волшебник, заклинание, место, сокровище, or тварь. Exact card IDs/counts come from deck data. | `executable`; composition is `data-required` | pp. 6, 11 |
| Барахолка | Main market contains 5 public non-беспредел cards. Market Flow restores it from main deck. Беспределы are resolved and destroyed instead of staying in the market. | `executable` | pp. 6, 8, 13, 20 |
| Барахолка легенд | Legend market contains 3 public non-мегабеспредел cards. Market Flow restores it from Legend deck. Мегабеспределы are resolved and destroyed instead of staying in the market. | `executable` | pp. 6, 8, 13, 20 |
| Шальная магия | Separate stack of 15 cards, always buyable on a player's turn while available. Cost is 3 power. Its engine `cardKind` is `wildMagic`, but it has no main card type such as место/сокровище/тварь/заклинание/волшебник/фамильяр. On play, bot/action choice selects +2 power or playing the top card of a foe deck. Destroyed cards move to this stack. | `executable` | pp. 6, 12 |
| Вялая палочка | Separate stack of 15 cards. Never bought; only gained by effects. Its engine `cardKind` is `limpWand`, but it has no main card type such as место/сокровище/тварь/заклинание/волшебник/фамильяр. No play effect. Each owned card from this stack is -1 VP at game end. Destroyed cards move to this stack. | `executable` | pp. 6, 13 |
| Фамильяр | Each player has a personal unbought фамильяр slot. Its engine `cardKind` and card type is `familiar`. Only that player may buy it, for 6 power. While unbought, its effects and VP are inactive. Once bought, it moves to discard and behaves as a normal owned card. | `executable`; effects are `data-required` | pp. 4, 10 |
| Жетон колдунского свойства | Setup grants each player a selected visible ability token. It grants the player a strategic effect from token data. | setup is `executable`; faces are `data-required` | pp. 4, 18 |
| Стопка уничтоженных карт | Destroyed cards move to a public out-of-play destroyed zone. Destroyed беспределы/мегабеспределы must preserve order because mapped effects can refer to them. Шальная магия and вялая палочка move to their stacks instead of staying destroyed. | `executable` | pp. 12-13 |

## Setup Algorithm

Source: pp. 4, 6, 8.

1. Select each player's жетон колдунского свойства:
   - Sample 2 random candidate tokens.
   - Bot/setup config selects 1 candidate.
   - Selected token enters the player's setup token zone and is public.
   - Unselected token moves to unused/out-of-game setup components.
2. Select each player's фамильяр:
   - Sample 2 random candidate фамильяр cards.
   - Bot/setup config selects 1 candidate.
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
8. Shuffle ЖДК, select `4 * playerCount` as the hidden/random DWT draw stack, and move the rest to unused/out-of-game setup components.
9. Select first player using the seeded RNG.
10. Each player draws 5 cards.

## Player Zones and Ownership

| Zone | Canon rule | Status | Source |
| --- | --- | --- | --- |
| `deck` | Facedown personal deck. Shuffle discard into deck only when a card must be drawn, played, discarded, or revealed from an empty deck. | `executable` | pp. 11, 20 |
| `hand` | Cards available for play, discard, defense, and reveal-by-effect. End of turn discards all remaining hand cards. | `executable` | pp. 8-11 |
| `discard` | Public pile for purchased, gained, discarded, and most played cards unless mapped effect/component data changes the destination. | `executable` | pp. 8-9, 11-12 |
| `playedThisTurn` | Non-Ongoing cards played and controlled by this player during the current turn. It can temporarily contain cards owned by another player if an effect plays them under this player's control. Default cleanup destination is the card owner's discard unless play context or mapped data changes it. | `executable` | pp. 9, 11-12 |
| `permanents` | Ongoing objects in the player's persistent controlled zone, including cards or non-card components whose rule makes them Ongoing. They remain in play until an effect moves/removes them. | `executable` | pp. 11, 14 |
| `deadWizardTokens` | Controlled DWTs in `deadWizardTokens`. Count for scoring and may have immediate, Ongoing, end-game, or other token-data effects. | `executable`; faces are `data-required` | pp. 14, 18 |
| `chips` | Player's chip count. Bounded by the modeled token supply if supply is finite. | `executable` | p. 15 |
| `dinglerStatus` | Boolean/status token. Max life and VP penalty are derived from it. | `executable` | p. 14 |

Ownership/control rules:

- Each `CardInstance` is in exactly one zone at a time.
- Control is not a zone. It is represented by current controller. A player controls cards/objects whose current `controller` is that player.
- Normally, cards in a player's `playedThisTurn` and `permanents` are controlled by that player.
- Hand, deck, discard, and market cards are not controlled.
- Control is separate from ownership: a player owns cards they bought or gained, regardless of current zone.
- Шальная магия can change ownership of an Ongoing card played from a foe deck; see [Шальная Магия](#шальная-магия).
- Trophy and some tokens are controlled Ongoing objects even though they are not normal cards.

Source: pp. 11-12, 14.

## Turn Flow

Source: pp. 8-9, 20.

1. Run Market Flow for the Legend market to restore it to 3 cards.
2. Run Market Flow for the main market to restore it to 5 cards.
3. Check the DWT draw stack.
4. If any start-of-turn end condition is true, the game ends immediately before the active player takes start-of-turn effects or main-loop actions. Proceed to [End Conditions and Scoring](#end-conditions-and-scoring).
5. Resolve effects labeled "at the start of turn" for the active player, using card/token data.
6. Main action loop: in any order while legal, active player may:
   - play a card from hand;
   - buy a card;
   - use an unused activation ability on a controlled card.
   Effects may also play cards from sources other than hand as part of resolving an action or card effect.
7. Active player declares end of turn. No more voluntary main-loop actions may be taken.
8. Discard all remaining hand cards to the player's discard.
9. Resolve effects labeled "at the end of turn":
   - Include controlled Ongoing cards/tokens such as the trophy.
   - Use deterministic ordering chosen by engine policy when multiple same-window effects are controlled by the same player and the rulebook does not specify an order.
10. Move played non-Ongoing cards from `playedThisTurn` to their cleanup destinations. Default destination is the owner's discard. Ongoing cards remain in play. Unspent power is lost.
11. Draw 5 cards, modified by effects if card/token data changes hand refill.
12. Pass turn clockwise to the next player, who starts again at step 1.

## Market Flow Algorithm

Source: pp. 6, 8, 13, 15, 20.

Use this algorithm for both setup market fill and turn-start Market Flow. During setup, беспредел/мегабеспредел cards are destroyed without resolving effects. During normal play, they resolve.

1. While market size is below target size:
   - Main market target is 5; source deck is main deck; event card is беспредел.
   - Барахолка легенд target is 3; source deck is колода легенд; event card is мегабеспредел.
2. If source deck has no card available when a market card is needed:
   - During setup, this is invalid setup/deck data.
   - During turn-start Market Flow, the matching start-of-turn end condition is true; stop Market Flow and end the game before the active player takes actions.
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

| Action | Preconditions | Effects | Source |
| --- | --- | --- | --- |
| Play card from hand | Active player has the card in hand. | Move non-Ongoing cards to `playedThisTurn` or Ongoing cards to `permanents`. Set current controller to the active player. Apply mapped immediate effects, including the activation `onPlay` effect if present. Mapped activation effects can be activated later while the player controls the card. | pp. 8, 11, 16 |
| Play card by effect | Resolving effect explicitly plays a card from a specified source, such as a foe deck. | Use the same play procedure, but source, owner, controller, and cleanup destination come from effect/card data. | pp. 11-12, 16 |
| Buy market card | Active player can pay total cost using power and allowed chips/discounts. Card is available in main market, барахолка легенд, шальная магия stack, or personal фамильяр slot. | Pay cost, move gained card to active player's discard unless mapped effect data changes the destination, and immediately gain any chips on the market card. Market Flow waits until the next turn-start Market Flow step. | pp. 8, 10, 12, 15 |
| Use activation | Active player controls a card with mapped activation effect, has not used that card's activation this turn, and can pay any costs. | Resolve the mapped activation effect once for this turn. Unused activation rights do not carry to later turns. | pp. 8, 16 |
| End turn | Always legal for active player. | Enter end-turn sequence. | p. 9 |

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
4. Resolve secondary triggered effects after the played card is complete. Engine policy must define deterministic ordering for multiple simultaneous secondary triggers controlled by the same player unless card/token data specifies order.
5. At end-of-turn cleanup, move non-Ongoing cards in `playedThisTurn` to their play-context destination unless an effect moved them earlier. Default destination is the owner's discard.

Dual attack/defense cards:

- If played by the active player on their turn, resolve the card's normal play/onPlay effects: power, draw, attack, and any other mapped play effects. The defense branch does not resolve.
- If used by an attacked target as a defense, resolve only the defense branch. This can happen on any player's turn, including the defending player's own turn if they legally attacked themselves. Normal play/onPlay effects such as power, draw, or attack do not resolve.
- If a defense use does not discard the card, it can still be played later on its controller's turn; that later play resolves the normal play/onPlay effects and not the defense branch.

Source: p. 11.

## Buying and Gaining

Source: pp. 8, 10, 12-13, 15.

| Rule | Status |
| --- | --- |
| A player may buy any number of available cards in a turn as long as total paid cost does not exceed available power plus allowed alternative payments. | `executable` |
| Buying шальная магия is legal while its stack is non-empty and the active player can pay 3 power. | `executable` |
| Buying a personal фамильяр is legal only for its owner, costs 6 power, and moves it into that player's discard. | `executable` |
| Bought or gained cards go to the gaining player's discard unless mapped effect data changes the destination. | `executable` |
| Gaining by effect does not require paying cost unless mapped effect data requires a cost. | `executable` |
| If an effect asks to gain a card by name, type, or cost and no eligible card exists, no card is gained. | `executable` |
| If an effect gives a вялая палочка and the вялая палочка stack is empty, that part of the effect does nothing; all other effect parts still resolve. | `executable` |
| Беспредел/мегабеспредел cards cannot be bought or gained into a player's personal deck. If a gain effect selects or reveals one, move that event card to the matching destroyed event pile without resolving it, and do not gain or reveal a replacement card. | `executable` |
| When a player gains a market card that has chips on it, the player immediately gains those chips too. | `executable` |

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

- An attack card can contain one attack or several distinct attack instances, depending on mapped effect data.
- Defense decisions are made per attack instance, not once for the whole card.
- Mapped defense branch data controls whether the defense card is discarded, stays in hand, remains usable, or can defend again later.

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

1. Each affected target may use at most 1 defense card/effect from hand for that attack instance, even if the target is also the attacker.
2. Defense protects only the defending player, not other targets.
3. For a normal attack by a player:
   - If the attack has independent effects per target, a target that declines/cannot defend is affected immediately when their defense decision is reached.
   - If the attack requires interaction among multiple players, collect all defense decisions before resolving the attack.
   - Engine can always collect all defense decisions before resolution; this is compatible and easier to log.
4. For a беспредел/мегабеспредел attack:
   - Active player decides first.
   - Continue defense decisions clockwise.
   - Resolve only after every player had the opportunity to defend.
5. Avoiding an attack instance does not cancel non-attack effects on the attacking card, such as power, and does not automatically avoid other attack instances from the same card.
6. Defense effects that target the attacker do not work against беспредел/мегабеспредел because there is no attacker.
7. Some фамильяр defenses redirect attacks to the attacker. This is a card-data effect:
   - The original attacker becomes the target even if the normal target rule would not make them legal.
   - Redirect only the amount/effect that would have hit the defender.
   - The attacker may defend against the redirected attack if a legal defense is available.

### Resolution Order

1. For effects that affect multiple players and where order matters, resolve targets clockwise starting with:
   - the player applying the effect for normal card effects;
   - the active player for беспредел/мегабеспредел effects.
2. Targets who avoided the attack are skipped for the attack effect.
3. For a беспредел attack where a player avoids or does not participate:
   - That player is not affected by the attack effect.
   - They do not perform the беспредел action.
   - They do not pass, receive, discard, gain, or otherwise interact with objects through the беспредел effect.
4. If damage or another effect causes death during resolution, run the rules in [Death, Resurrection, Trophy, and Dingler](#death-resurrection-trophy-and-dingler) immediately, then continue unresolved effect steps unless mapped effect data says the dead player cannot continue paying/finishing the effect.

## Беспредел and Мегабеспредел

Sources: pp. 6, 8, 12-13, 20.

`resolveMayhem(card, activePlayer, market)`:

1. Determine whether the card is беспредел or мегабеспредел from deck/card data.
2. Pause the Market Flow that revealed it.
3. Resolve the mapped беспредел effect.
4. If it is an attack:
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
10. If the deck cannot provide enough non-event cards to reach target market size during turn-start Market Flow, the matching start-of-turn end condition is true; stop Market Flow and end the game before the active player takes actions.

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
   - The played card keeps its original owner while it is non-Ongoing, but its current controller is the acting player.
   - Resolve it as played by the acting player.
   - If the played card is non-Ongoing, its default destination after resolution is its owner's discard unless mapped data changes the destination.
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
3. If the card was played this turn, its activation can be used later in that same turn as long as the card is still controlled.
4. Activation can be used any time in the active player's main action loop while the card is controlled, has not been activated this turn, and costs can be paid.
5. Track activation use per controlled card per turn. At the end of the turn, unused activation rights expire and are not carried forward.

## Death, Resurrection, Trophy, and Dingler

Sources: pp. 14, 16-18.

Death algorithm:

1. When a player's life drops below 1, they die immediately.
2. Excess damage has no extra effect.
3. If a DWT is available, draw/gain the next/random DWT from the hidden DWT draw stack.
4. If no DWT is available during death resolution, no DWT is gained; keep the DWT exhaustion state for the next start-of-turn check.
5. If a DWT was gained, move it to that player's `deadWizardTokens`, mark it public, and mark it controlled by that player.
6. Set player life to 20 unless DWT data changes the resurrection life value.
7. Resolve mapped DWT effects:
   - If the token has Ongoing, its effect persists.
   - If not Ongoing and not an end-game modifier, resolve its immediate effect now.
   - If DWT damage happens after resurrection, apply it after the 20-life reset.
8. If life changes from DWT effects cause another death, repeat the death algorithm.
9. If death resolution consumes the last DWT, continue the current turn; the next player's start-of-turn DWT check ends the game before that player takes actions.

Trophy:

- When a player kills a foe, that player gains control of the trophy.
- Trophy is an Ongoing controlled object.
- At the end of each turn of its controller, the controller gains 1 chip.
- No trophy is awarded when a player kills themselves.
- No trophy is awarded for a death caused by a normal беспредел/мегабеспредел or another unowned market card.
- If a player uses a card effect to play a беспредел/мегабеспредел, that player is the source and can gain the trophy for a kill.
- Some mapped effects can count a target as having died even without DWT gain; trophy can still be awarded if mapped effect data says so.

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

Source: pp. 9, 13-14, 20; tie fallback from `docs/simulation-scope.md`.

The game ends during start-of-turn checks, before the active player resolves start-of-turn effects or main-loop actions, if any of these conditions is true:

| End condition | Status |
| --- | --- |
| Legend deck cannot provide enough non-event cards to restore Legend market to 3 during Market Flow. | `executable` |
| Main deck cannot provide enough non-event cards to restore main market to 5 during Market Flow. | `executable` |
| DWT stack is empty. | `executable` |

Before scoring:

1. Build each player's scoring collection from all owned scoring zones and controlled owned permanents.
2. Include hand, deck, discard, played non-Ongoing cards if any remain, owned permanents, owned gained cards, вялые палочки, DWTs, Dingler status, and token/card scoring modifiers.
3. Do not score an unbought фамильяр still in the player's unbought familiar slot.
4. Do not score chips.

Scoring order:

| Order | Rule | Source |
| --- | --- | --- |
| 1 | Highest total VP wins. | p. 9 |
| 2 | If tied, tied player with more owned cards of `карта легенды` wins. | p. 9 |
| 3 | If still tied, tied player with fewer ЖДК wins. | p. 9 |
| 4 | If still tied, treat as a true tie. | `docs/simulation-scope.md`; PDF does not state an additional breaker |

Known global score modifiers:

| Modifier | VP | Status | Source |
| --- | --- | --- | --- |
| ЖДК base penalty | -3 VP each, plus token-specific modifiers | `executable`; faces are `data-required` | pp. 14, 18 |
| Вялая палочка | -1 VP each | `executable` | p. 13 |
| Dingler status | -5 VP if still Dingler at game end | `executable` | p. 14 |

## Machine-Oriented Mechanics Table

| Mechanic id | Russian term | Engine meaning | Status | Source |
| --- | --- | --- | --- | --- |
| `power` | мощь | Turn-local buy resource; can accumulate across play/buy actions during the same turn; lost at cleanup. | `executable` | pp. 8-9 |
| `victory_points` | победные очки / ПО | Numeric end-game score on cards and modifiers. | `executable` | pp. 5, 9 |
| `legend_count` | количество карт легенд | Tie-breaker count of owned cards with type `карта легенды` for tied players. | `executable` | p. 9 |
| `dead_wizard_token` | жетон дохлого колдуна / ЖДК | Death token, controlled by player, base -3 VP, may have immediate/end/Ongoing effects. | `executable`; faces `data-required` | pp. 14, 18 |
| `ongoing` | Постоянка | Card/object attribute: when played or created in play, it uses the `permanents` zone and stays under control until removed; it is not discarded during normal cleanup. | `executable` | pp. 11, 14 |
| `activate` | активация | Mapped activation: the before-activation part resolves on play; the activation effect can be used once per turn while the card is controlled. | `executable` | pp. 8, 16 |
| `attack` | атака | Attack instance that affected players may avoid with defense. One card may define several attack instances through card mapping. | `executable` | pp. 10-11 |
| `defense` | защита | Hand card/effect that avoids one attack instance for the defending player only. Mapped defense branch data controls whether the same card can defend later attacks. | `executable` | pp. 10-11 |
| `redirect_attack` | перенаправить атаку | Defense effect can redirect attack to attacker even if attacker was not a legal original target. | `data-required` | p. 17 |
| `destroy` | уничтожить | Move card out of game to destroyed area; шальная магия and вялая палочка move to their stacks. | `executable` | pp. 12-13 |
| `gain` | получить карту | Take a specified/eligible card without paying and move it to discard unless mapped effect data changes the destination. | `executable` | p. 12 |
| `discard` | сбросить карту | Default source is hand unless another source is specified; deck-discard also counts as discard. | `executable` | p. 11 |
| `reveal_from_deck` | раскрыть карту из колоды | If deck empty, shuffle discard first; card-specific effect decides destination. | `executable`; destination may be `data-required` | pp. 11, 20 |
| `wild_magic` | шальная магия | Buyable stack card kind, cost 3, no main card type, choice on play between +2 power or playing top card of foe deck. | `executable` | p. 12 |
| `limp_wand` | вялая палочка | Stack-gained junk card kind, no main card type, no effect, -1 VP. | `executable` | p. 13 |
| `mayhem` | беспредел | Event card from main deck; resolves during Market Flow, then is destroyed and Market Flow continues. | `executable`; effect `data-required` | p. 13 |
| `mega_mayhem` | мегабеспредел | Event card from Legend deck; resolves during Market Flow, then is destroyed and Market Flow continues. | `executable`; effect `data-required` | p. 13 |
| `chip` | чипсина | Spendable token; reduces power cost 1:1 when buying cards of `карта легенды`, and can be spent by effects that explicitly say to spend chips. | `executable` | p. 15 |
| `market_chip_marker` | символ чипсины | When a marked card enters market, move 1 chip from supply onto every marked market card before continuing Market Flow. | `executable` | p. 15 |
| `dingler` | лошара | Status: max 15 life, -5 VP at end, only one token. | `executable` | p. 14 |
| `trophy` | главный приз Крутагидона | Controlled Ongoing trophy awarded for killing a foe; grants 1 chip at end of controller's turn. | `executable` | p. 14 |
| `heal` | накручивать жизни | Increase life up to current max; usable even at max. | `executable` | p. 16 |
| `not_participate_in_mayhem` | не участвовать в беспределе | Player skips all беспредел attack/actions and interactions. | `data-required` | p. 13 |

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
- Turn-start Market Flow in order: Legend market first, then main market; main action loop; and end-turn cleanup.
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
