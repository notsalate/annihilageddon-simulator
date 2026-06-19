# Validate new import ID style

Status: done
Label: done
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Add draft validation for the new set-prefixed ID style used by new imports. The validator should help new card, wizard property, and Dead Wizard Token drafts use stable IDs like `esw2_dbg__main_001`, `esw2_dbg__wizard_property_001`, and `esw2_dbg__dead_wizard_token_001`.

This issue must not rename existing runtime IDs. Historical runtime ID migration is a separate risky data migration.

## Acceptance criteria

- [x] The validator checks new draft IDs against the documented `esw2_dbg__<category>_<number>` style.
- [x] Allowed categories cover main cards, Legend cards, starter cards, familiars, wizard properties, Dead Wizard Tokens, Wild Magic, and Limp Wand as documented.
- [x] ID/category mismatches produce clear validation output.
- [x] Historical runtime IDs are not renamed or modified in this issue.
- [x] Tests cover valid IDs for every draft kind and invalid IDs with clear errors or warnings.
- [x] The import pipeline guide documents how historical IDs differ from new-import IDs.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/02-add-card-draft-validation-command.md`
- `.scratch/krutagidon-import-pipeline/issues/03-add-wizard-property-draft-validation-and-cleanup.md`
- `.scratch/krutagidon-import-pipeline/issues/04-add-dead-wizard-token-draft-validation.md`
