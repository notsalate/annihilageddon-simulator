# AGENTS.md

## Purpose

This folder contains the deterministic game engine: setup, actions, effect runtime, market flow, simulation, scoring, RNG, event recording, and debug traces.

## Ownership

- Owns runtime behavior under `src/engine/**`.
- Runtime data comes from `data/`; import drafts under `data/import/` are outside executable engine input.
- CLI orchestration lives in `src/cli/`.

## Local Contracts

- Preserve deterministic behavior through seeded RNG.
- Do not add filesystem, terminal, or UI concerns to engine modules except the existing data-loading boundary in `data.ts`.
- Keep card behavior in explicit typed runtime effects and handlers.
- Add runtime effect IDs only through `effect-runtime-registry.ts`; executable data must not reference IDs outside the Effect Runtime Catalog.
- Do not use localized display names as primary identifiers.
- Preserve existing tested behavior unless the issue explicitly requires a rules change.
- Thread execution/validation mode explicitly instead of adding hidden global assumptions.

## Work Guidance

- Start mechanics bugs from the narrow module named by the behavior: `actions.ts`, `effect-runtime.ts`, `effect-runtime-registry.ts`, `market-flow.ts`, `setup.ts`, or `data.ts`.
- Prefer deterministic fixtures over broad random simulation for tests.
- Keep event/debug instrumentation additive and stable enough for tests.

## Verification

- Run focused tests for the touched behavior, then `npm test` when the blast radius crosses modules.
- Run `npm run typecheck` after TypeScript edits.
- Run `npm run simulate:single` or `npm run simulate:mass` only when simulation-level behavior needs manual confirmation.

## Child DOX Index

None.
