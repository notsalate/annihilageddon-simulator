# Convert first OCR batch into card JSON drafts

Status: done
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Convert the first OCR markdown batch into structured card JSON drafts.

The drafts should preserve visible card data in a structured shape and prepare cards for later engine mapping. They should not claim that card effects are implemented.

Use the ID convention from `docs/simulation-scope.md`: stable `cardId` values with the `esw2_dbg__` prefix that do not depend on OCR card names.

Use `docs/card-json-guide.md` for compact card kind/type guidance. Do not read the full rules canon for this issue unless a draft field cannot be resolved from the guide and glossary.

## Acceptance criteria

- [x] `data/import/card-drafts/` exists.
- [x] Each OCR markdown file has a corresponding draft JSON file unless the OCR file is explicitly marked unusable.
- [x] Each draft has a stable `cardId` in the `esw2_dbg__stable_catalog_id` format.
- [x] Visible fields are separated from engine fields.
- [x] `cardKind`, `cardTypes`, visible markers, cost, and victory points follow `docs/card-json-guide.md`.
- [x] Russian card text is preserved as visible/reference data.
- [x] English names and English text remain absent or null unless explicitly provided by a future source.
- [x] Engine fields clearly indicate that effect mapping is still needed.
- [x] Duplicate physical copies are not created as duplicate card definitions.
- [x] A validation or review note identifies missing required visible fields.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/02-ocr-first-card-image-batch.md`
