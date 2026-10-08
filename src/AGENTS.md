# AGENTS.md

## Purpose

This folder contains TypeScript source for the simulator, import tooling, CLI entrypoints, and public module exports.

## Local Contracts

- Follow [CODING_STANDARDS.md](../CODING_STANDARDS.md) for shared engineering rules and verification.
- Put cross-layer domain type contracts in `src/domain/` when they are shared by engine, import tooling, tests, and exports.
- Keep exports in `src/index.ts` aligned with real public use.

## Child DOX Index

- `src/domain/AGENTS.md` - shared domain type contracts.
- `src/engine/AGENTS.md` - deterministic game engine and runtime mechanics.
- `src/import/AGENTS.md` - import validation, generation, and reports.
- `src/cli/AGENTS.md` - command-line wrappers.
