# Add wizard property draft validation and cleanup

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Extend draft validation to support `wizardPropertyDraft` and convert the current wizard property draft files from runtime-like copies into clean non-executable draft passports.

This issue should leave runtime wizard property JSON intact. Only import draft files should be cleaned up.

## Acceptance criteria

- [ ] The draft validator supports `wizardPropertyDraft`.
- [ ] `wizardPropertyDraft` requires `schemaVersion`, `draftKind`, `tokenId`, `kind: wizardProperty`, source text, visible source label, visible text, and uncertainty list.
- [ ] Card-only fields such as cost, card types, and card kind are not required for wizard property drafts.
- [ ] Runtime-only fields such as `engine`, `runtimeSchema`, `playableInV0`, and `mappingStatus` produce errors in wizard property drafts.
- [ ] Existing files under `data/import/wizard-property-drafts/` are converted to clean draft format.
- [ ] Runtime files under `data/tokens/wizard-properties/` remain executable and are not degraded into draft files.
- [ ] Focused tests cover valid wizard property drafts, forbidden runtime fields, missing text, and the fact that card-only fields are not required.
- [ ] `npm run validate:drafts` reports the cleaned wizard property drafts without errors.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/02-add-card-draft-validation-command.md`
