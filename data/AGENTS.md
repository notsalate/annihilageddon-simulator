# AGENTS.md

## Purpose

This folder contains runtime data consumed by the simulator and source import data under `data/import/`.

## Ownership

- Owns runtime JSON under `data/cards/`, `data/tokens/`, `data/decks/`, `data/stacks/`, `data/pools/`, and `data/packs/`.
- `data/import/AGENTS.md` owns import drafts, extracted text, and source-oriented import material.
- Runtime layout contracts are documented in `docs/runtime-layout.md`.

## Local Contracts

- Runtime data is executable simulator input; keep it deterministic, explicit, and schema-like.
- Use stable IDs as primary identifiers. Localized names are display/source fields only.
- Keep runtime mappings separate from import drafts and extracted text.
- Runtime card and token behavior must point at explicit typed handlers/effects, not natural-language parsing.
- Update deck, stack, pool, and pack composition when a runtime object must become playable.
- Every runtime card, dead wizard token, and wizard property definition must include `source.image`, a non-empty path to an existing asset under `assets/`. Token image metadata is canonical only in `source.image`; `visible.sourceImage` is forbidden.

## Work Guidance

- Prefer editing the smallest JSON object set needed for the issue.
- Keep `data/cards` and `data/tokens` aligned with composition files when playability changes.
- Use templates from `docs/templates/` when adding new runtime object shapes.

## Verification

- Run `npm run build` after runtime data shape changes.
- Run focused tests or `npm test` when runtime data affects behavior.
- Run `npm run report:runtime-coverage` when runtime coverage status or playable mappings change.

## Child DOX Index

- `data/import/AGENTS.md` - import source texts and draft JSON.
