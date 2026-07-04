# AGENTS.md

## Purpose

This folder contains TypeScript source for the simulator, import tooling, CLI entrypoints, and public module exports.

## Ownership

- Owns `src/index.ts` and cross-cutting TypeScript source rules.
- `src/domain/AGENTS.md` owns shared domain type contracts.
- `src/engine/AGENTS.md` owns deterministic simulation and runtime mechanics.
- `src/import/AGENTS.md` owns draft validation, generation, and reporting.
- `src/cli/AGENTS.md` owns command-line entrypoints.

## Local Contracts

- Keep TypeScript strict and deterministic.
- Put cross-layer domain type contracts in `src/domain/` when they are shared by engine, import tooling, tests, and exports.
- Use stable IDs for cards, effects, actions, strategies, events, and data objects.
- Keep engine/domain behavior out of CLI wrappers.
- Runtime engine code must not read `data/import/**` as executable input.
- Prefer explicit typed handlers and structured data over natural-language parsing.

## Work Guidance

- Use CodeGraph first for structural source questions when `.codegraph/` exists.
- Add or update focused tests when source behavior changes.
- Keep exports in `src/index.ts` aligned with real public use.

## Verification

- Run `npm run typecheck` after source edits.
- Run focused tests or `npm test` for behavior changes.
- Run `npm run build` when CLI output or generated JS entrypoints matter.

## Child DOX Index

- `src/domain/AGENTS.md` - shared domain type contracts.
- `src/engine/AGENTS.md` - deterministic game engine and runtime mechanics.
- `src/import/AGENTS.md` - import validation, generation, and reports.
- `src/cli/AGENTS.md` - command-line wrappers.
