# Add Dead Wizard Token draft validation

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Extend draft validation to support `deadWizardTokenDraft`. DWT drafts should capture visible/source facts for real Dead Wizard Token faces without pretending to be executable token runtime data.

This issue does not need to convert every DWT markdown file into draft JSON. It should establish the schema, validator support, and representative test coverage.

## Acceptance criteria

- [ ] The draft validator supports `deadWizardTokenDraft`.
- [ ] `deadWizardTokenDraft` requires `schemaVersion`, `draftKind`, `tokenId`, `kind: deadWizardToken`, source text, visible source label, visible text, and uncertainty list.
- [ ] Visible VP may be present or null, but base DWT scoring is not automatically injected into draft data as runtime behavior.
- [ ] Card-only fields such as cost, card types, and card kind are not required for DWT drafts.
- [ ] Runtime-only fields such as `effects`, `runtimeSchema`, `playableInV0`, and `mappingStatus` produce errors in DWT drafts.
- [ ] Focused tests cover valid DWT drafts, forbidden runtime fields, missing text, optional visible VP, and missing optional source image warning behavior.
- [ ] `npm run validate:drafts` can validate DWT draft fixtures or real DWT drafts when present.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/02-add-card-draft-validation-command.md`
