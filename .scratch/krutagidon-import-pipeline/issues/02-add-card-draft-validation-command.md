# Add card draft validation command

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Add the first vertical slice of draft validation: a local command that validates `cardDraft` files end to end. The command should read draft JSON files, validate card-specific visible/source fields, reject runtime-only fields, return errors and warnings, and be covered by focused tests.

This slice should establish the reusable validator shape, but only `cardDraft` needs to be supported here.

## Acceptance criteria

- [ ] A scriptable command such as `npm run validate:drafts` exists.
- [ ] The command validates card draft JSON files and prints concise errors and warnings.
- [ ] `cardDraft` requires `schemaVersion`, `draftKind`, `cardId`, source text, visible text, and card-specific visible fields.
- [ ] `cardDraft` validates allowed `cardKind`, `cardTypes`, and `markers`.
- [ ] Runtime-only fields such as `engine`, `runtimeSchema`, `playableInV0`, and `mappingStatus` produce errors.
- [ ] Drafts with validation errors are reported as not ready for runtime mapping.
- [ ] Uncertainty entries and missing optional source image produce warnings, not errors.
- [ ] Focused tests cover valid card drafts, missing required fields, forbidden runtime fields, invalid card types/markers, and warning output.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/01-replace-card-guide-with-import-pipeline-guide.md`
