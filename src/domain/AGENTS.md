# AGENTS.md

## Purpose

This folder contains shared domain type contracts that can be imported by engine, import tooling, tests, and public exports.

## Ownership

- Owns cross-layer TypeScript-only domain types.
- Runtime behavior remains owned by `src/engine/`.
- Import parsing and reporting remain owned by `src/import/`.

## Local Contracts

- Keep shared domain types behavior-free unless a narrow boundary helper is needed to type existing runtime data.
- Prefer stable, machine-readable identifiers over localized display text.
- Branded identifiers must stay assignable to `string` for existing JSON/runtime interop, but different id categories must not be assignable to each other.
- Keep validated `create...Id` helpers separate from `mark...Id` helpers for values already checked at another boundary.

## Work Guidance

- Keep staged migrations small; do not force unrelated modules to change just because a new domain type exists.
- Export shared types through `src/index.ts` when they are part of the public package surface.

## Verification

- Run `npm run typecheck` after changes.
- Run focused tests when helpers gain runtime behavior.

## Child DOX Index

None.
