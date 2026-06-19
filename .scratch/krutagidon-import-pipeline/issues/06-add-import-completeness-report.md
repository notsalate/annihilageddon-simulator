# Add import completeness report

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-import-pipeline/PRD.md`

## What to build

Add a local report that summarizes import completeness across raw markdown, draft JSON, and runtime JSON. The report should help the project owner see what exists, what is missing, and what still has validation errors or warnings before runtime mapping begins.

The report should be useful after the user's external scan pipeline creates new markdown and draft JSON files.

## Acceptance criteria

- [ ] A command or documented mode prints completeness counts for cards, wizard properties, and DWTs.
- [ ] The report distinguishes raw markdown files, draft JSON files, and runtime JSON files.
- [ ] The report includes validation error and warning counts from draft validation.
- [ ] The report identifies missing draft files for existing markdown files where possible.
- [ ] The report identifies runtime files that exist without a corresponding valid draft where possible.
- [ ] Output is concise enough to read after a full import batch.
- [ ] Focused tests cover representative complete, missing-draft, missing-runtime, and validation-error cases.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/02-add-card-draft-validation-command.md`
- `.scratch/krutagidon-import-pipeline/issues/03-add-wizard-property-draft-validation-and-cleanup.md`
- `.scratch/krutagidon-import-pipeline/issues/04-add-dead-wizard-token-draft-validation.md`
