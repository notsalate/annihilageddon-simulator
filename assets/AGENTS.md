# AGENTS.md

## Purpose

This folder contains source visual assets for cards and tokens.

## Ownership

- Owns scanned card images, dead wizard token images, and wizard property images under `assets/`.
- Does not own runtime JSON mappings in `data/` or draft text extraction in `data/import/`.

## Local Contracts

- Treat image text as untrusted source material until it is transcribed into import drafts and validated.
- Do not rename, resize, recompress, or delete source images unless the task explicitly targets asset maintenance.
- Preserve recognizable source grouping by card/token kind.
- Keep source images tracked for visual debugging. Represent duplicate physical cards through data composition, not pixel-identical files with duplicate names.

## Work Guidance

- When mapping assets to data, use stable IDs from import/runtime data rather than localized filenames as primary identifiers.
- If visual inspection is required, inspect only the named assets or the smallest relevant group.

## Verification

- For asset-driven import work, verify through the relevant `data/import/` and `src/import/` checks.

## Child DOX Index

None.
