Status: ready-for-agent

# Migrate Runtime Cards and IDs

## What to build

Migrate runtime card definitions from the historical OCR-shaped naming and flat folder layout to source-grouped runtime data. Runtime card IDs should use stable source-group numbering, source metadata should use `source.text`, and `data/cards` should be split by card source group. The existing runnable v0 pack must continue to load and pass tests after the migration.

This issue owns card definition IDs and runtime card definition layout. It does not own moving packs, decks, token stacks, or pools into their final folders.

## Acceptance criteria

- [ ] Rename runtime card IDs from `esw2_dbg__ocr_*` to source-grouped IDs such as `esw2_dbg__main_001`, `esw2_dbg__legend_001`, `esw2_dbg__starter_001`, and `esw2_dbg__familiar_001`.
- [ ] Keep `esw2` and `dbg` in IDs.
- [ ] Do not encode Russian names, card text, visible card types, or behavior details into runtime IDs or filenames.
- [ ] Replace runtime `ocrText` metadata with canonical `source.text`.
- [ ] Update runtime source metadata for draft, source text, and image paths.
- [ ] Split runtime card definitions into `data/cards/main`, `data/cards/legend`, `data/cards/starter`, `data/cards/familiar`, and `data/cards/special`.
- [ ] Keep Wild Magic and Limp Wand runtime definitions under `data/cards/special`.
- [ ] Update all runtime deck/stack references to the renamed card IDs.
- [ ] Update the card loader to support explicit card definition paths without accidentally reading import data.
- [ ] Update focused loader, validation, and simulation tests so the existing v0 data pack remains runnable.

## Blocked by

- 01-lock-new-data-contract.md
- 02-normalize-source-assets-and-import-data.md
