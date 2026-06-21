Status: Done

# Import Main Deck Drafts

## What to build

Normalize and import canonical drafts for all main-deck source text. Main-deck drafts must use source-group IDs, including Mayhem cards as `main` IDs because they belong to the main deck. Legacy source text should be audited before deletion, but `data/import/**/index.json` must not be treated as canonical input.

## Acceptance criteria

- [x] Audit legacy `data/import/card-texts` against canonical main source text and report any unique facts before deletion.
- [x] Remove stale `data/import/**/index.json` only after confirming it does not contain unique source facts that are missing from canonical source text.
- [x] Rename main source text files from historical `ocr_*` names to canonical `esw2_dbg__main_###` names and update headings/source references.
- [x] Keep Mayhem source text in the main source group and generate `cardId` values such as `esw2_dbg__main_059`, with `visible.cardKind = "mayhem"` and empty `visible.cardTypes`.
- [x] Generate canonical `cardDraft` JSON for all main source text from markdown only.
- [x] Drafts include visible facts, derived draft facts, mapping notes, uncertainty, and `composition.quantity`.
- [x] Update generator/parser tests for the main source-text dialect.
- [x] Focused draft validation/reporting for main cards passes without main-specific errors.

## Blocked by

- 01-create-draft-import-harness-with-one-card-and-one-token.md
