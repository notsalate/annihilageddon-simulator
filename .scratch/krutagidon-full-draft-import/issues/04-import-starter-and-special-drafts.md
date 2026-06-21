Status: Done

# Import Starter and Special Drafts

## What to build

Generate canonical drafts for starter cards and special card stacks. Starter source text should use canonical starter IDs, while unique special stack objects should use explicit singleton IDs for clarity.

## Acceptance criteria

- [x] Rename starter source text files to canonical `esw2_dbg__starter_###` names and update headings/source references.
- [x] Generate starter `cardDraft` JSON with `visible.cardKind = "starter"` and source-text-derived visible facts.
- [x] Rename special source text to canonical singleton names where appropriate: `esw2_dbg__limp_wand` and `esw2_dbg__wild_magic`.
- [x] Generate special `cardDraft` JSON for Limp Wand and Wild Magic using singleton special IDs.
- [x] For Limp Wand, generate `visible.cardKind = "limpWand"`, empty `visible.cardTypes`, and visible VP from source text.
- [x] For Wild Magic, generate `visible.cardKind = "wildMagic"`, empty `visible.cardTypes`, and visible cost from source text.
- [x] Preserve clarifications as mapping notes in `notes`.
- [x] Include `composition.quantity` from source text.
- [x] Update generator/parser tests for starter and special source-text dialects.
- [x] Focused draft validation/reporting for starter and special cards passes without group-specific errors.

## Blocked by

- 01-create-draft-import-harness-with-one-card-and-one-token.md
