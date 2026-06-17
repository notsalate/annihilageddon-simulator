# PRD: Universal Mechanics Before Full Card Import

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

The simulator already has a runnable v0 engine and several working mechanics, but some of the executable effect language still uses temporary `fixture_*` IDs. These fixture mechanics are useful for proving rules-engine slices, but they should not become the canonical language for real playable card data.

The project should not start broad real-card import while core runtime mechanics are still incomplete or named as fixtures. Otherwise imported cards, tokens, wizard properties, and familiars would be mapped onto temporary IDs or partial behavior, making later cleanup risky and distorting simulation results.

The immediate need is to promote existing fixture mechanics into normal runtime mechanics one by one, then add the remaining universal mechanics that can be implemented before full import. Small coverage imports are allowed only when they validate a promoted or universal mechanic.

## Solution

Build a post-menu engine package for the Mechanics Coverage Set. This package promotes existing fixture mechanics into real Runtime Effect IDs, verifies each promoted mechanic against `docs/rules-canon.md`, and removes obsolete fixture IDs after tests are migrated.

After promotion begins, new universal mechanics should be added with normal English Runtime Effect IDs from the start. The first promoted mechanic should be Healing, exposed as `heal`, because its canon behavior is narrow and low-risk: the acting player increases current life up to the current effective maximum. Set Life remains a separate mechanic.

The package is implemented after the Russian user simulation menu. It does not include full real-card import, full strategy comparison, starting-build comparison, or a user-facing analysis surface.

## User Stories

1. As a rules-engine maintainer, I want fixture mechanics promoted one at a time, so that each mechanic can be checked against the rules canon without broad churn.
2. As a rules-engine maintainer, I want promotion to mean more than renaming, so that normal Runtime Effect IDs only exist for behavior that matches the agreed rules scope.
3. As a data maintainer, I want real card data to use normal Runtime Effect IDs, so that imported data does not depend on temporary fixture names.
4. As a data maintainer, I want `fixture_*` effects rejected for normal data packs, so that test-only mechanics do not leak into playable card data.
5. As a test author, I want fixtures available only for unpromoted mechanics, so that unfinished engine slices can still be explored safely.
6. As a test author, I want promoted mechanics tested through their normal Runtime Effect IDs, so that tests prove the production data language.
7. As a simulation researcher, I want full card import delayed until universal mechanics are ready, so that mass results are not based on temporary handlers.
8. As a simulation researcher, I want small coverage imports allowed, so that real ЖДК, wizard properties, or familiars can validate specific mechanics without committing to full import.
9. As a future card mapper, I want a clear Mechanics Coverage Set, so that I know which engine capabilities are safe to target.
10. As a future card mapper, I want English machine IDs separated from Russian display terms, so that runtime data does not parse or depend on localized card text.
11. As a developer, I want Healing promoted first, so that the project establishes a low-risk promotion pattern before tackling damage, death, attacks, and defense.
12. As a developer, I want `heal` to remain separate from `set_life`, so that additive healing and direct life setting are not mixed.
13. As a developer, I want damage promoted separately after healing, so that death, ЖДК, resurrection, and Trophy credit can be checked deliberately.
14. As a developer, I want each promoted mechanic to keep changes focused, so that failures identify a single behavior surface.
15. As a developer, I want unsupported effects to fail explicitly, so that incomplete mappings do not silently distort simulations.
16. As a developer, I want legal choices to use the current deterministic first-legal Choice Policy, so that mechanics work before advanced strategies exist.
17. As a future analyst, I want full strategy and starting-build comparison delayed, so that comparison modes are not built before strategies, starting builds, and result surfaces exist.
18. As a future user, I want the Russian menu completed first, so that there is a usable entry point before deeper engine work resumes.

## Implementation Decisions

- This PRD is sequenced after the Russian user simulation menu PRD.
- The package is about engine mechanics and runtime data language, not broad real-card import.
- Promotion is defined as checking the mechanic against `docs/rules-canon.md`, completing the agreed behavior scope, exposing a normal Runtime Effect ID, testing through that ID, and removing the obsolete fixture ID when it is no longer needed.
- New Runtime Effect IDs are stable English machine identifiers. Russian user-facing terms remain display language, not runtime keys.
- `fixture_*` IDs are test-only and must not be canonical IDs for playable real card data.
- The data-pack validator should support an explicit validation mode chosen by the caller. Normal data validation rejects fixture effects; test fixture validation may allow them for unpromoted mechanics.
- The first promoted mechanic is Healing.
- Healing uses the normal Runtime Effect ID `heal`.
- Healing means increasing the acting player's current life up to the current effective maximum life.
- Healing does not implement direct life setting. A separate Set Life mechanic covers effects that set current life to a specific value such as 10 or 13.
- After Healing is promoted and verified, mechanics are promoted sequentially rather than as a large rename batch.
- Damage is a likely next promotion target after Healing, but it must be checked with death, ЖДК, resurrection, and Trophy credit rules before promotion.
- Existing non-fixture IDs such as `add_power` and `draw_cards` are already normal runtime IDs and do not need fixture promotion.
- The Mechanics Coverage Set before broad import includes healing, damage, attacks and defense windows, gain/discard/destroy movement, reveal/play-top-deck effects, set-life effects, activations, wild magic, market chip markers, executable Mayhem hooks, basic token effects, and familiar lifecycle/effects.
- Full real-card import must not run ahead of the universal mechanics needed to represent those cards.
- Small coverage imports are allowed when they validate a promoted or universal mechanic, such as a few ЖДК, wizard properties, or familiars.
- Full Comparison Mode for strategies or starting builds is out of scope until strategies, starting builds, and comparison result surfaces exist.
- The current deterministic first-legal Choice Policy remains the default for mechanic choices. This PRD does not introduce stronger bot strategy.
- Unsupported mechanics or effect branches should fail explicitly unless the rules/data explicitly define a legal skip path such as Empty Choice Skip.

## Testing Decisions

- Test promoted mechanics through normal Runtime Effect IDs, not through their old fixture IDs.
- Keep tests focused on externally observable engine behavior: state changes, legal action results, event logs, scoring consequences, and validation errors.
- Do not test private helper structure unless externally observable behavior depends on it.
- For Healing, test that `heal` increases current life and clamps to the current effective maximum.
- For Healing, test that direct life setting remains separate and is not accidentally implemented as healing.
- Test that normal data-pack validation rejects `fixture_*` effects.
- Test that fixture validation can still allow fixture effects for unpromoted mechanics when explicitly requested.
- When removing a fixture ID, run the migrated tests first and remove the old handler only after the normal-ID tests pass.
- Prefer deterministic fixtures over random simulations for mechanic behavior.
- Use existing engine and validation test style as prior art.
- Run the narrow relevant checks after each promoted mechanic, then broader typecheck/test commands when behavior touches shared runtime code.

## Out of Scope

- Implementing the Russian user simulation menu. That is a separate earlier PRD.
- Full real-card import.
- Full ЖДК import.
- Full wizard property import.
- Full familiar import.
- Strategy implementation.
- Starting-build implementation.
- Full Comparison Mode for strategies or starting builds.
- Best-Move Strategy.
- Optimal solver.
- UI or result dashboards.
- Broad refactors unrelated to mechanic promotion.
- Runtime natural-language parsing of card text.
- Renaming all fixture mechanics in one large batch.

## Further Notes

The agreed order is: finish the Russian user simulation menu first, then work on this mechanics package.

This PRD should use the glossary terms in `CONTEXT.md`: Universal Mechanic, Mechanics Coverage Set, Fixture Mechanic, Promoted Mechanic, Runtime Effect ID, Healing, Set Life, Choice Policy, and Full Comparison Mode.

The first implementation slice should be small: promote Healing to `heal`, migrate tests, add explicit fixture-validation mode, and remove `fixture_heal` if it is no longer needed after migration.
