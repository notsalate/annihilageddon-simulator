Status: ready-for-agent

# Normalize Source Assets and Import Data

## What to build

Normalize the source layer so assets and import files have a single predictable structure. Source images should not sit under redundant `raw` folders, import card text should live under `data/import/cards/<source-group>/texts`, and draft JSON should live under the matching `drafts` folder. This slice should update source-image and source-text references so import tooling can validate the new layout.

This issue owns source-layer cleanup only. It should not rename runtime card IDs or split runtime card definitions into their final folders.

## Acceptance criteria

- [ ] Remove redundant `raw` path segments from asset layout and update references to the new image paths.
- [ ] Use clear kebab-case asset groups where applicable, including `dead-wizard-token`, `wizard-property`, `mega-mayhem`, and `wizard-card`.
- [ ] Normalize card import paths to `data/import/cards/<source-group>/texts` and `data/import/cards/<source-group>/drafts`.
- [ ] Rename `data/import/cards/legeng` to `data/import/cards/legend`.
- [ ] Move direct source files in `special` and `starter` into the appropriate `texts` or `drafts` folder.
- [ ] Remove `.cache` and backup artifacts from the canonical import tree, or move them out of canonical paths if they must be retained.
- [ ] Remove deprecated `data/import/card-texts` and `data/import/card-drafts` only after all references have been migrated.
- [ ] Remove `processed marker` lines and `status: processed` from canonical source markdown/index data.
- [ ] Update import validation and import completeness reporting to read the normalized source structure.
- [ ] Update focused tests for import validation/reporting.

## Blocked by

- 01-lock-new-data-contract.md
