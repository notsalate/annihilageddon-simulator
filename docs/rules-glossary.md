# Rules Glossary

Primary source: `Pravila_Krutagidon_2.pdf`. English correspondences are included only where the English rulebook section was used as a direct cross-check.

## Core Terms

| Russian term | Engine term | Confirmed English term | Notes | Source |
| --- | --- | --- | --- | --- |
| колдун | `player` | Wizard / player | A participant in the game. | RU p. 8; EN p. 9 |
| жизни | `life` / `hp` | Hit Points / HP | Default `currentLife = 20`; default `maxLife = 25` as the healing/effect cap. | RU pp. 4, 16; EN pp. 4, 17 |
| мощь | `power` | Power | Turn-local buying resource. | RU pp. 8-9; EN p. 20 |
| победные очки / ПО | `victoryPoints` | Victory Points / VP | End-game score. | RU pp. 5, 9; EN p. 20 |
| карта легенды / легенда | `legend` | Legend | Legend is a type marker and tie-breaker category. | RU pp. 6, 9, 11; EN pp. 6, 9 |
| основная колода | `mainDeck` | main deck | Shared deck for non-Legend cards and Mayhems. | RU p. 6; EN p. 6 |
| колода легенд | `legendDeck` | Legend deck | Shared deck for Legends and Mega Mayhems. | RU p. 6; EN p. 6 |
| барахолка | `market` | Line-Up | 5-card main market. | RU pp. 6, 8; EN p. 6 |
| барахолка легенд | `legendMarket` | Legendary Line-Up | 3-card Legend market. | RU pp. 6, 8; EN p. 6 |
| стопка сброса | `discard` | discard pile | Public player discard. | RU pp. 8-9; EN p. 20 |
| стопка уничтоженных карт | `destroyedPile` | destroyed pile | Public out-of-play destroyed area. Used Mayhems preserve order. | RU pp. 12-13; EN pp. 13-14 |
| жетон дохлого колдуна / ЖДК | `deadWizardToken` | Dead Wizard Token / DWT | Death token, base -3 VP. | RU pp. 6, 14; EN p. 15 |
| главный приз Крутагидона | `trophy` | Trophy Standee | Ongoing trophy awarded for killing a foe. | RU p. 14; EN p. 15 |
| лошара | `dingler` | Dingler | Status token: max 15 life and -5 VP if still active. | RU p. 14; EN p. 15 |
| чипсина | `chip` | XTREME Nacho Chip | Spendable token with no VP value. | RU p. 15; EN p. 16 |
| общий запас жетонов | `chipSupply` | token supply | Shared chip supply if modeled as finite; chip gains/movements can fail if empty. | RU p. 15 |

## Card Kinds, Types, and Markers

| Russian term | Engine term | Confirmed English term | Notes | Source |
| --- | --- | --- | --- | --- |
| карты-затравки | `starter` | Starter Cards | Starter category: Signs, Cheez Wand, Fizzles. | RU pp. 4-5; EN pp. 4-5 |
| знак | `sign` | Glyph | Starter card. | RU p. 4; EN p. 4 |
| сырная палочка | `cheezWand` | Cheez Wand | Starter card; also a Wand-style attack in clarifications. | RU pp. 4, 17; EN pp. 4, 17 |
| пшик | `fizzle` | Fizzle | Starter junk card. | RU p. 4; EN p. 4 |
| волшебник | `wizardCard` | Wizard | Main card type; distinct from the player/wizard identity stored in game state. | RU pp. 5-6; EN p. 5 |
| тварь | `creature` | Creature | Main card type. | RU pp. 5-6; EN p. 5 |
| заклинание | `spell` | Spell | Main card type. | RU pp. 5-6; EN p. 5 |
| сокровище | `treasure` | Treasure | Main card type. | RU pp. 5-6; EN p. 5 |
| место | `location` | Location | Main card type; often Ongoing. | RU pp. 5, 11; EN pp. 5, 12 |
| фамильяр | `familiar` | Familiar | Card kind/type for personal buyable Familiar cards; not one of the main card types unless card data explicitly adds another type. | RU pp. 4, 10; EN pp. 4, 10 |
| беспредел | `mayhem` | Mayhem | Event card in main deck. | RU pp. 6, 13; EN p. 14 |
| мегабеспредел | `megaMayhem` | Mega Mayhem | Event card in Legend deck. | RU pp. 6, 13; EN p. 14 |
| шальная магия | `wildMagic` | Wild Magic | Card kind/type for the buyable stack, cost 3. It has no main card type. | RU p. 12; EN p. 13 |
| вялая палочка | `limpWand` | Limp Wand | Card kind/type for the stack-gained junk card, -1 VP. It has no main card type. | RU p. 13; EN p. 14 |
| Постоянка | `ongoing` | ONGOING | Card/object attribute that makes it stay in play under control, usually in `permanents`. | RU p. 11; EN p. 12 |
| атака | `attack` | ATTACK | Avoidable hostile effect. | RU p. 10; EN p. 10 |
| защита | `defense` | DEFENSE | One defense use/card per attack instance per defending player. If one card creates several attacks, each attack is defended separately. Mapped defense branch controls whether that card remains available for later attacks. | RU p. 10; EN p. 10 |
| перенаправить атаку | `redirectAttack` | redirect attack | Defense effect branch that makes the attacker suffer the defended attack effect. | RU p. 17 |
| символ активации | `activate` | Activate | Card property: the before-activation part resolves on play; the activation part can be used once per turn while the card is controlled. | RU pp. 8, 16; EN p. 17 |
| символ чипсины | `marketChipMarker` | XTREME Nacho Chips | Card property that moves chips onto matching market cards; chips can reduce purchases of cards of `карта легенды`. | RU p. 15; EN p. 16 |

## Verbs and Rules Language

| Russian term | Engine operation | Confirmed English term | Notes | Source |
| --- | --- | --- | --- | --- |
| купить карту | `buyCard` | buy | Pay cost; gained card usually goes to discard. | RU p. 8; EN p. 20 |
| получить карту | `gainCard` | gain | Take without paying unless specified; usually to discard. | RU p. 12; EN p. 13 |
| сыграть карту | `playCard` | play | Resolve mapped play effects; non-Ongoing card enters `playedThisTurn`, Ongoing card enters `permanents`; play context carries owner/controller/destination details. | RU p. 8; EN p. 20 |
| сбросить карту | `discardCard` | discard | Default source is hand unless another place is specified. | RU p. 11; EN p. 12 |
| уничтожить карту | `destroyCard` | destroy | Remove from normal game flow; some stack cards move back to their stack. | RU p. 12; EN p. 12 |
| раскрыть карту | `revealCard` | reveal | Show card from deck or other source for an effect. | RU pp. 11-13; EN pp. 12-14 |
| разыграть верхнюю карту | `playTopCard` | play top card | Used by Wild Magic and some effects. Destination may depend on card and owner. | RU p. 12; EN p. 13 |
| выбрать врага/колдуна | `chooseTarget` | target foe/player | "Враг" excludes self; "колдун" can include self. | RU p. 16; EN p. 17 |
| левый враг / правый враг | `leftFoe` / `rightFoe` | left/right foe | Seating-relative targets; in 2-player game, left+right foe attack hits the one opponent once. | RU p. 10 |
| самый могучий / самый хилый | `strongestTarget` / `weakestTarget` | strongest/weakest | Selects by current life; ties are resolved by the player applying the effect, or by the active player for беспредел/мегабеспредел. | RU pp. 10, 13 |
| могучее тебя / хилее тебя | `strongerThanYou` / `weakerThanYou` | stronger/weaker than you | Strict life comparison; equal life does not qualify. | RU p. 10 |
| колдун(ы) | `oneOrMorePlayers` | player(s) | Mayhem wording that can target one or more tied players by the named parameter. | RU p. 11 |
| под контролем | `control` | control | Current controller relationship, not a zone. Usually cards in `playedThisTurn`, Ongoing objects in `permanents`, and controlled tokens/objects. Excludes hand, deck, discard, and markets; separate from ownership. | RU p. 12; EN p. 13 |
| владеть | `own` | own | Bought or gained cards, regardless of current zone. | RU p. 12; EN p. 13 |
| подохнуть | `die` | die | Life below 1; gain DWT and reset life. | RU p. 14; EN p. 15 |
| накручивать жизни | `heal` | heal | Gain life; max 25 unless Dingler max 15 applies. | RU p. 16; EN p. 17 |
| не участвовать в беспределе | `notParticipateInMayhem` | skip Mayhem participation | Player avoids the attack if any and performs no Mayhem interactions. | RU p. 13 |

## Project-Specific Naming

| Concept | Preferred code/data name | Notes |
| --- | --- | --- |
| Card definition | `CardDefinition` | Unique data record, one per card definition. |
| Deck composition | `DeckComposition` | `cardId + count`, not physical instances. |
| Card instance | `CardInstance` | Per-game physical copy with stable instance id. |
| Card kind | `cardKind` | Structural kind such as `wildMagic`, `limpWand`, `familiar`, `mayhem`, or normal deck card category. |
| Main card types | `cardTypes` | Set of main types used by type-based effects: `wizardCard`, `creature`, `spell`, `treasure`, `location`, and any explicitly mapped extra type. |
| Player zones | `deck`, `hand`, `discard`, `playedThisTurn`, `permanents` | Matches `docs/simulation-scope.md`. |
| Main market | `market` | Russian source term is `барахолка`; English source says `Line-Up`. |
| Legend market | `legendMarket` | Russian source term is `барахолка легенд`; English source says `Legendary Line-Up`. |
| Dead Wizard Token count for tie-breaker | `deadWizardTokenCount` | Include DWT-like cards only if card/token data explicitly says they count as DWTs. |
