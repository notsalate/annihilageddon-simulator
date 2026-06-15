# PRD: Крутагидон 2 Simulation Platform

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

Пользователю нужен локальный deterministic-симулятор настольной игры "Эпичные схватки боевых магов: Крутагидон 2", чтобы прогонять десятки тысяч партий и исследовать закономерности игры. Важны стратегии, качество решений ботов, влияние стартовой барахолки, состав колод, значение Легенд, дохлых колдунов и других игровых факторов.

Работать напрямую по PDF-правилам неудобно: буклет шумный, в нем есть обучающий и художественный текст, а в правилах встречаются специфичные термины и потенциальные неоднозначности. Полная оцифровка 100+ карт тоже не должна блокировать первый работающий движок.

## Solution

Сделать headless TypeScript-платформу для симуляции: сначала оформить технический canon правил и контракты данных, затем реализовать строго типизированное deterministic-ядро v0 на минимальном импортированном наборе русских карт. Полный импорт карт из изображений должен идти отдельным пайплайном и подключаться к движку постепенно.

Пользователь должен получить воспроизводимые партии по seed, краткие summaries для массовых прогонов и подробные event logs для отладки отдельных партий.

## User Stories

1. As a simulation researcher, I want to run thousands of reproducible games, so that I can compare strategies statistically.
2. As a simulation researcher, I want each game to have a seed, so that I can replay suspicious or interesting outcomes.
3. As a simulation researcher, I want mass runs to store compact summaries, so that large experiments do not waste memory or disk.
4. As a simulation researcher, I want single-game debug runs to produce detailed event logs, so that I can inspect rule execution.
5. As a simulation researcher, I want the engine to enforce legal actions, so that bot mistakes do not corrupt game state.
6. As a strategy author, I want bots to choose only from legal actions, so that strategies are comparable.
7. As a strategy author, I want simple baseline bots, so that future strategies can be measured against a known floor.
8. As a strategy author, I want strategy interfaces to be stable, so that I can add stronger bots later.
9. As a rules implementer, I want a technical rules canon, so that code is based on implementation-ready rules rather than noisy PDF text.
10. As a rules implementer, I want each extracted rule to reference its source, so that unclear behavior can be traced back to the rulebook.
11. As a rules implementer, I want open rules questions documented, so that assumptions do not hide inside code.
12. As a rules implementer, I want v0 simplifications documented, so that early simulation results are interpreted correctly.
13. As a rules implementer, I want full global mechanics digitized separately from v0 scope, so that future engine work does not need to reread the rulebook.
14. As a data maintainer, I want one JSON file per unique card, so that cards can be reviewed and fixed independently.
15. As a data maintainer, I want duplicate card copies represented as deck counts, so that card definitions do not multiply needlessly.
16. As a data maintainer, I want stable card IDs independent from OCR card names, so that simulation results can refer to cards consistently.
17. As a data maintainer, I want card text stored separately from engine effects, so that visible text remains auditable.
18. As a data maintainer, I want OCR output to be captured before JSON conversion, so that extraction errors can be reviewed.
19. As a data maintainer, I want OCR agents to avoid English names and translations initially, so that early import stays focused on visible Russian card data.
20. As a data maintainer, I want uncertain OCR fields marked explicitly, so that later agents do not treat guesses as facts.
21. As an engine developer, I want card behavior represented by typed handlers, so that runtime does not parse natural language card text.
22. As an engine developer, I want a seeded RNG abstraction, so that all randomness is injectable and reproducible.
23. As an engine developer, I want `Math.random()` banned from the engine, so that deterministic replay is not accidentally broken.
24. As an engine developer, I want card definitions separated from card instances, so that each physical copy can move independently during a game.
25. As an engine developer, I want player zones modeled explicitly, so that hand, deck, discard, played cards, and permanents behave differently.
26. As an engine developer, I want the market, main deck, Legend deck, and dead wizard tokens modeled explicitly, so that real end conditions can be implemented.
27. As an engine developer, I want v0 to run on the first mapped Russian card batch, so that the engine can be validated before full card import is complete.
28. As an analyst, I want summaries to include winner, end reason, turn count, purchases, and key counters, so that early results are useful.
29. As an analyst, I want scoring to include all relevant player zones, so that winner calculation matches the game rules.
30. As an analyst, I want tie breakers to follow the known order, so that win rates are not distorted.
31. As a future UI developer, I want the engine independent from UI, so that any later interface can reuse it without moving domain logic.

## Implementation Decisions

- Build a headless TypeScript project with strict compiler settings from the start.
- Treat the simulation engine as the central deep module. It should expose a small interface for creating games, listing legal actions, applying actions, stepping turns, and producing results.
- Add a seeded RNG module and inject it everywhere randomness is needed.
- Keep game state as typed data, with explicit zones for player deck, hand, discard, played-this-turn cards, and permanents.
- Represent card definitions, deck compositions, and card instances as separate concepts.
- Store one unique card definition per JSON file.
- Store deck composition as `cardId + count`, including starter decks, main deck, and Legend deck.
- Use card instances during a game so that identical copies can move independently.
- Keep visible card fields separate from engine fields.
- Store victory points as a numeric field on each card definition.
- Use typed effect handlers for card behavior. Do not parse card text during runtime.
- Allow unsupported or unmapped card mechanics to remain explicit rather than guessed.
- Implement bots as strategy modules that receive legal actions and return a selected action.
- Implement mass simulation as a separate runner around the engine, not as logic inside card effects or bots.
- Use real game end conditions: dead wizard tokens exhausted, main deck exhausted, or Legend deck exhausted.
- Use `maxTurns` only as technical protection and mark it as non-game termination.
- Determine winner by victory points, then Legend count, then fewer dead wizards, then true tie.
- Treat the current rules canon as a v0-oriented draft until the full global mechanics canon issue is completed.
- Extract full global mechanics into implementation-ready rules before implementing full rules.
- Keep card OCR, card JSON conversion, and engine mapping as separate agent stages.

## Testing Decisions

- Test engine behavior through public operations: initialize game, list legal actions, apply action, advance turn, finish game, score game.
- Do not test private implementation details such as internal helper ordering unless externally observable behavior depends on them.
- Test seeded RNG determinism with fixed seeds and expected sequences or stable outcomes.
- Test deck instantiation to ensure each player receives independent card instances from the same starter composition.
- Test shuffle and draw behavior with deterministic RNG.
- Test end conditions independently: dead wizard tokens, main deck, Legend deck, and technical max-turn timeout.
- Test scoring across all counted zones: hand, deck, discard, played-this-turn, and permanents.
- Test tie breakers in order: victory points, Legend count, dead wizard count, true tie.
- Test bot integration by verifying that bots cannot mutate state directly and can only submit legal actions.
- Test card data validation separately from engine execution.
- Use small deterministic fixtures rather than large random state snapshots.
- Add broader mass-run smoke checks only after the engine can complete single deterministic games.

## Out of Scope

- Full UI or web application.
- Full card database as a prerequisite for v0.
- English card names and English card text during first import.
- Automatic translation of card text.
- Runtime natural-language parsing of card text.
- Full support for every unique card effect in the first engine version.
- Advanced strategy bots before baseline simulation is stable.
- Database storage.
- Publishing or importing copyrighted card databases from external sources.
- Dependency installation or scaffold decisions not yet approved in the repo.

## Further Notes

The current `docs/rules-canon.md` is a v0-oriented draft. The next useful rules artifact is the full global mechanics expansion tracked by `.scratch/krutagidon-simulation-platform/issues/10-expand-full-rules-mechanics-canon.md`.

The first runnable simulation should use a small mapped Russian card batch. Full image-based card import can proceed in parallel and should not block the engine.

Existing planning documents:

- `docs/simulation-scope.md`
