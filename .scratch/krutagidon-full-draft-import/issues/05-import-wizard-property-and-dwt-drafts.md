Status: Done

# Import Wizard Property and DWT Drafts

## What to build

Regenerate canonical drafts for wizard properties and Dead Wizard Tokens from source text. Existing old-shaped drafts should be overwritten or replaced with canonical drafts rather than kept beside them. The generated token drafts must preserve mapping notes, composition quantities, and visible DWT VP penalties without creating runtime behavior.

## Acceptance criteria

- [x] Rewrite wizard property drafts with canonical filenames and `tokenId` values such as `esw2_dbg__wizard_property_001`.
- [x] Generate `composition.quantity = 1` for each wizard property draft.
- [x] Preserve wizard-property clarifications as mapping notes in `notes`.
- [x] Generate canonical Dead Wizard Token drafts with IDs such as `esw2_dbg__dead_wizard_token_001`.
- [x] Apply the DWT quantity rule: token 003 has quantity 2; other imported DWT definitions have quantity 1 unless source text says otherwise.
- [x] Extract visible DWT VP penalty numbers into `visible.victoryPoints` when explicitly present in source text.
- [x] Record DWT VP-penalty clarifications in `notes`; do not treat visible DWT VP penalty as the final total DWT score in draft data.
- [x] Do not inspect source images or infer token behavior beyond source-text-visible facts and agreed import rules.
- [x] Update generator/parser tests for wizard-property and DWT source-text dialects.
- [x] `npm run validate:drafts` passes without errors after this issue.
- [x] `npm run report:import` reports the draft layer completeness expected for Full Draft Import.

## Blocked by

- 01-create-draft-import-harness-with-one-card-and-one-token.md
