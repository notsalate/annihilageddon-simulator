# Replace card guide with import pipeline guide

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Replace the card-only JSON guide with a single import pipeline guide that explains the whole `.md -> draft JSON -> runtime JSON` flow. The old card guide should be removed, not kept as a second source of truth.

The new guide should describe draft data as a non-executable visible/source passport, runtime data as executable engine input, the required `draftKind` discriminator, validator errors and warnings, and the new set-prefixed ID style for future imports.

## Acceptance criteria

- [ ] `docs/import-pipeline.md` exists and is the source of truth for import stages.
- [ ] The guide explains raw markdown, draft JSON, runtime JSON, and the boundary between them in user-readable language.
- [ ] The guide states that draft JSON must not contain `engine`, `runtimeSchema`, `playableInV0`, or `mappingStatus`.
- [ ] The guide lists `cardDraft`, `wizardPropertyDraft`, and `deadWizardTokenDraft`.
- [ ] The guide documents `error` vs `warning` draft validation results.
- [ ] The guide documents the new ID style for new imports: `esw2_dbg__<category>_<number>`.
- [ ] The old `docs/card-json-guide.md` is removed so it cannot diverge from the new guide.
- [ ] Existing docs that referenced the old guide are updated to reference the new guide.

## Blocked by

None - can start immediately
