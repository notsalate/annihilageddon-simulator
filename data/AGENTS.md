# AGENTS.md

## Purpose

This folder contains runtime data consumed by the simulator and source import data under `data/import/`.

## Ownership

- Owns runtime JSON under `data/cards/`, `data/tokens/`, `data/decks/`, `data/stacks/`, `data/pools/`, and `data/packs/`.
- Runtime layout contracts are documented in `docs/runtime-layout.md`.

## Local Contracts

- Follow [CODING_STANDARDS.md](../CODING_STANDARDS.md) for shared runtime/import rules and verification. Runtime JSON is executable simulator input; keep its structure explicit and aligned with the schema.
- Update deck, stack, pool, and pack composition when a runtime object must become playable. A card reachable only through an explicit `replace_starting_card` setup effect is the exception: do not duplicate it in the canonical starter template; keep the replacement token/runtime path and focused coverage aligned.
- Every runtime card, dead wizard token, and wizard property definition must include `source.image`, a non-empty path to an existing asset under `assets/`. Token image metadata is canonical only in `source.image`; `visible.sourceImage` is forbidden.

## Work Guidance

- Prefer editing the smallest JSON object set needed for the issue.
- Use templates from `docs/templates/` when adding new runtime object shapes.

## Child DOX Index

- `data/import/AGENTS.md` - import source texts and draft JSON.
