# Mechanic Clusters

This file defines what each final card runtime `clusterId` means.

Validated format:

- each final cluster is introduced by a `## cluster-id` heading;
- `cluster-id` uses lower kebab case, for example `attack-cards`;
- text inside each section is free-form and may describe primary mechanic, related runtime surfaces, blockers, and implementation notes.

Do not duplicate the card list here. Card-to-cluster assignment stays in `card-cluster-decisions.json`, and the generated matrix reports which cards currently reference each `clusterId`.

## dwt-interactions

Cards whose primary runtime mechanic is Dead Wizard Token ownership, counting, transfer, exchange, gain/removal, or token effect execution.

Dingler status is not part of this cluster unless the card's main mechanic is actually DWT ownership or token movement.

## dingler-status

Cards whose primary runtime mechanic is Dingler status: becoming Dingler, ceasing to be Dingler, checking Dingler state, status-gated choices, or Dingler maximum-life normalization.

Dead Wizard Token movement is not part of this cluster unless DWT ownership or token exchange is the card's main mechanic.

## mayhem-events

Mayhem and Mega-Mayhem cards whose primary runtime mechanic is the event frame itself: table-wide resolution order, per-player choices, voting, repeated global decisions, or other rules where the shared Mayhem/Mega-Mayhem resolution structure is the main implementation work.

Do not assign all Mayhem or Mega-Mayhem cards here by default. If the main work is damage, market destruction/refill, chipsins, Dingler status, card movement, reveal loops, or another concrete mechanic, assign that mechanic and keep Mayhem/Mega-Mayhem as an implementation note.

## chipsin-economy

Cards whose primary runtime mechanic is chipsin as a resource economy: chipsin costs, gains, rewards, transfers, market chips, or repeatable chipsin loops.

Cards do not belong here merely because chipsins appear as a payload. If attack, defense, Mayhem, or another larger runtime surface determines how the card works, assign that larger surface and keep chipsins as an implementation note.

## attack-effects

Cards whose primary runtime mechanic is attack resolution: target selection, single-target or multi-target damage, positional attacks, variable damage, attack restrictions, unavoidable attacks, defense lockout, attack sequencing, or on-hit/on-kill attack payloads.

Do not split this cluster by single-target, multi-target, variable damage, or on-kill variants. Keep those as implementation notes unless another surface such as DWT, Dingler, chipsins, market mutation, or special-card play is clearly the card's main mechanic.

## defense-effects

Cards whose primary runtime mechanic is a defense branch: defense availability, defense costs, self-discard or retain behavior, random discard costs, life/chipsin costs, redirect, counter-damage, draw/gain follow-up, or discard recovery during defense.

Do not assign a card here merely because it can defend. If defense is only the channel for another larger surface such as DWT exchange, Dingler status, special-card movement, or market mutation, assign that larger surface.

## ongoing-modifiers

Cards whose primary runtime mechanic is a passive or persistent modifier from a controlled object: type overrides, cost or destination overrides, hand limits, damage modifiers, power modifiers, trigger-like ongoing effects, or other stateful controlled-object rules.

Do not assign a card here merely because it is an ongoing card. If the card's main behavior is an explicit player-triggered action, use `activation-effects`.

## activation-effects

Cards whose primary runtime mechanic is an explicit controlled-card action: once-per-turn activation, self-destroy activation, activated attack, activated card destruction, activated power gain, or another player-triggered effect from a controlled object.

Passive modifiers on the same card stay as implementation notes unless they are the card's primary runtime mechanic.

## card-movement

Cards whose primary runtime mechanic is revealing, inspecting, destroying, trashing, gaining, returning, reordering, discarding, or playing cards across zones such as deck, hand, discard, market, or special stacks.

Do not split this cluster by zone. Zone names, choice rules, random selection, and destination details stay as implementation notes unless another surface such as attack, defense, Mayhem, or DWT is clearly the card's main mechanic.

## special-card-stack

Cards whose primary runtime mechanic is special-card stack behavior such as Limp Wand distribution, Wild Magic resolution, special stack exhaustion, play-from-opponent-deck, or ownership/control split for special-card play.

Do not assign a card here merely because it mentions a special card. If special-card gain or play is only a small payload inside attack, defense, Mayhem, or another larger surface, assign that larger surface.

## market-effects

Cards whose primary runtime mechanic is the card market or Legend market: market cost changes, market destruction, market refill, chipsins on market cards, destination changes for gained market cards, or market-card cost/count queries.

Mayhem and Mega-Mayhem cards can belong here when market mutation is the main mechanic. If market state is only used as an input for attack damage or another larger surface, assign that larger surface and keep the market detail as an implementation note.

## scoring-effects

Cards whose primary runtime mechanic is end-game scoring: VP modifiers, bonus points for owned cards or controlled objects, score changes based on Limp Wands, Dead Wizard Tokens, Dingler/loser state, card types in deck, or other final scoring conditions.

Do not assign a card here merely because it has a printed VP value. Use this cluster when the card changes or calculates scoring beyond its normal printed VP.

## simple-baseline

Cards whose primary runtime mechanic is already covered by simple baseline behavior: fixed power, simple draw, no executable effect, or normal printed VP without extra scoring rules.

Do not assign a card here merely because it includes a small fixed power or draw payload. If another mechanic gives the card its playable identity, assign that mechanic instead.

## life-total-effects

Cards whose primary runtime mechanic is direct life-total manipulation: healing, setting life to a value, swapping life totals, paying life as a cost, changing effective maximum life, or converting damage into healing.

Do not assign ordinary attack damage here. If life changes are only the damage result of an attack, use `attack-effects`.

## controlled-object-conditions

Cards whose primary runtime mechanic is checking, counting, or scaling from controlled cards or controlled objects: controlling another creature, counting controlled creatures or ongoing cards, checking card types, or calculating effects from controlled-object costs or types.

Persistent type, cost, damage, hand-limit, or destination changes from a controlled object belong in `ongoing-modifiers` unless the card's main mechanic is the condition/count itself.
