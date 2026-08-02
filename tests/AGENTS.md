# AGENTS.md

## Purpose

This folder contains TypeScript tests, deterministic fixtures, and test helpers.

## Ownership

- Owns `tests/*.test.ts`, `tests/run-tests.ts`, `tests/helpers/**`, and `tests/fixtures/**`.
- Source behavior remains owned by `src/`; data behavior remains owned by `data/`.

## Local Contracts

- Prefer deterministic focused tests over broad random simulations.
- Keep fixtures small and explicit.
- Do not mutate shared fixture definitions in ways that leak between tests.
- When behavior changes, test the externally relevant result, not only implementation internals.
- Use stable IDs in test data and assertions.
- Register every compiled test suite exactly once in `tests/run-tests.ts`; `npm test` clears `dist` before compilation, then the runner validates the recursive `dist/tests/**/*.test.js` inventory before execution.
- Keep `tests/run-tests.ts` as a closed executable registry: its three runtime imports are followed only by the top-level `testSuites` and `compiledTestsRoot` declarations, the direct completeness call, and one top-level `for...of`. The loop must launch the current suite through `spawnSync`, throw `result.error`, and exit nonzero for a failed status. Do not alias, mutate, conditionally replace, skip, precede, or swallow failures from that registry.
- When `current-runtime` is intentionally incomplete, keep broad behavior suites on explicit test-only runtime packs under `tests/fixtures/` instead of silently depending on the live baseline.
- Test-only runtime packs that include fixture or partial card definitions must use manifest `mappingStatus: "fixture"`, not `supported`.

## Work Guidance

- Put reusable test builders in `tests/helpers/`.
- `tests/helpers/defense-fixtures.ts` owns reusable defense-card construction, state-wide unique fixture identities, a fixture-only first selector, and an exact instance selector; builders must not mutate the global choice strategy.
- Prefer `selectFixtureDefenseByInstanceId` when a scenario depends on one specific defense card. Use `selectFirstFixtureDefense` only when the first fixture defense is itself the behavior under test.
- `tests/helpers/game-scenario.ts` owns deterministic game setup, runtime-card definition/instance assembly including defensive tag copies, temporary-control arrangement through the production Control Ledger, and thin deterministic choice/play/turn adapters for new focused integration suites.
- `controlled-power-ongoing.test.ts`, `attack-replacement-ongoing.test.ts`, `trigger-dispatch-ongoing.test.ts`, and `trigger-dispatch.test.ts` must use that shared scenario seam instead of declaring local runtime-card builders or manual branded IDs.
- Put static JSON fixtures in `tests/fixtures/`.
- Keep issue-specific regression tests close to the existing test file for that behavior.
- Do not create cross-domain `review-findings` suites. Use behavior-named focused suites such as `trigger-dispatch-ongoing.test.ts`, `attack-replacement-ongoing.test.ts`, `control-ledger-zones.test.ts`, `market-flow-terminal.test.ts`, and `attack-defense-snapshot.test.ts`.

## Verification

- Run focused tests when possible.
- Run `npm test` before reporting broad behavior changes.
- Run `npm run typecheck` when helper or fixture typing changes.

## Child DOX Index

None.
