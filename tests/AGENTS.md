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
- When `current-runtime` is intentionally incomplete, keep broad behavior suites on explicit test-only runtime packs under `tests/fixtures/` instead of silently depending on the live baseline.
- Test-only runtime packs that include fixture or partial card definitions must use manifest `mappingStatus: "fixture"`, not `supported`.

## Work Guidance

- Put reusable test builders in `tests/helpers/`.
- `tests/helpers/defense-fixtures.ts` owns reusable defense-card construction and the default fixture defense selection policy.
- Put static JSON fixtures in `tests/fixtures/`.
- Keep issue-specific regression tests close to the existing test file for that behavior.

## Verification

- Run focused tests when possible.
- Run `npm test` before reporting broad behavior changes.
- Run `npm run typecheck` when helper or fixture typing changes.

## Child DOX Index

None.
