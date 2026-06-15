# Rules Open Questions

Source baseline: `Pravila_Krutagidon_2.pdf`, plus current project constraints in `docs/simulation-scope.md` and the executable canon in `docs/rules-canon.md`.

This file now contains only unresolved issues after the full global mechanics pass. Resolved global systems are specified in `docs/rules-canon.md`; remaining items are data, policy, or component dependencies.

## Must Resolve Before Full Engine

No unresolved policy questions remain here. Current blockers are data dependencies and explicitly scoped v0 simplifications.

## Data Dependencies

| ID | Missing data | Why it matters | Current handling |
| --- | --- | --- | --- |
| RD-001 | Full main deck composition by exact card IDs and counts. | Rules give category counts, but engine needs exact definitions and copies. | Use imported/mapped deck composition files when available. |
| RD-002 | Full колода легенд composition by exact card IDs and counts. | End conditions, Legend tie-breakers, and мегабеспределы require actual Legend deck data. | Use imported/mapped deck composition files when available. |
| RD-003 | Starter card definitions for `Знак`, `Сырная палочка`, `Пшик`, and optional `Палочка-хреналочка`. | v0 setup, power, attack behavior, scoring, and token effects need explicit card definitions. | Must be created as local data before engine setup issue. |
| RD-004 | ЖДК faces and effects. | Death, scoring modifiers, Ongoing DWT effects, Dingler effects, and token-specific clarifications need token data. | Global DWT lifecycle is specified; individual faces remain mapping work. |
| RD-005 | Жетон колдунского свойства faces and effects. | Setup grants these, and some effects alter starter cards, hand refill, фамильяры, or played cards from foe decks. | Global setup and token-control rules are specified; individual faces remain mapping work. |
| RD-006 | Фамильяр card definitions and any referenced wizard identities/names. | Setup and personal фамильяр purchase are global, but attacks/defenses/scoring require card data. No separate wizard-board object is required by the simulator. | Global lifecycle is specified; individual фамильяр effects remain mapping work. |
| RD-007 | Card notation, keyword, and effect mapping from local sources. | Attack, defense, Ongoing, activation, market chip marker, card type, cost, and VP must become explicit card data/effect ids before simulation. | Covered by later card-data mapping issues. |
| RD-008 | Беспредел and мегабеспредел effect mappings. | Reveal/refill/defense/destruction algorithms are global, but each event still needs mapped target/effect branches. | Event lifecycle is specified; individual event effects remain mapping work. |

## v0 Simplifications to Keep Explicit

| ID | Simplification | Risk |
| --- | --- | --- |
| VS-001 | 2 players only. | Rules support more; clockwise order and multi-target effects must not be overfit to 2 players if later expanded. |
| VS-002 | No UI and no manual player prompts. | Setup choices, target choices, defense choices, and tie choices require bot/config decisions. |
| VS-003 | Incomplete card effects allowed only when represented as unsupported mechanics. | Silent no-op effects would distort simulations. |
| VS-004 | `maxTurns` is a technical stop, not a game end condition. | Summaries must distinguish this from real wins. |
| VS-005 | If беспредел/мегабеспредел effects are unsupported, v0 decks should avoid them or fail validation. | Destroying or resolving them without mapped effects would change deck depletion and game balance. |
| VS-006 | If DWT effects are unsupported, v0 results should disclose that only base DWT count/scoring is modeled. | Death penalties and ongoing modifiers may be materially wrong. |

## Resolved By Canon / Project Decision

| Former issue | Resolution |
| --- | --- |
| Automated setup choice between 2 жетоны колдунских свойств and 2 фамильяры | Project decision: early bots enumerate all legal setup choices and effect-order choices to evaluate outcomes. Future strategy bots may replace exhaustive enumeration with heuristic or random policy. If exhaustive branching is disabled for a test/smoke fixture, use a documented deterministic fallback. |
| Ordering multiple simultaneous same-window effects controlled by one player when the rulebook gives no order | Project decision: the bot choice model includes all legal ordering choices. Early bots enumerate those choices when order can affect outcome. If exhaustive branching is disabled for a test/smoke fixture, use a documented deterministic fallback. |
| Tie after VP, Legend count, and DWT count | `docs/simulation-scope.md` defines true tie; Russian PDF does not state another breaker. |
| Беспредел/мегабеспредел lifecycle | Refill pause, defense order, resolution order, destroyed pile ordering, replacement, and gain-from-deck edge cases are specified in `docs/rules-canon.md`. Individual event effects remain data. |
| Ownership/control for cards played from another player's deck by шальная магия | Specified in `docs/rules-canon.md`: non-Ongoing moves to owner discard; Ongoing changes ownership to the acting player and moves to that player's `permanents`. |
| Chip supply handling | Specified in `docs/rules-canon.md`: finite modeled supply can run out; spent chips move back to supply; shortage is logged. |

## Rulebook Extraction Notes

- Page 1 has no extractable text through `pypdf`.
- Pages 2-3 are flavor/marketing and were not used as executable rules.
- Page 5 is mostly diagram labels; card field names were extracted only as glossary/card-data hints.
- Pages 16-18 contain card-specific and token-specific clarifications. They should be applied only when those specific cards/tokens are imported and mapped.
- The Russian rulebook lists 15 cards of `шальная магия` and 15 cards of `вялая палочка`, while the optional English cross-check text uses 16 in its component list. Use the Russian PDF for this project unless local card data proves otherwise.
