# Migrate historical runtime IDs to set-prefixed style

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## What to build

Rename historical runtime IDs for wizard properties and DWT-related data to the new set-prefixed style used by future imports, then update all references consistently.

This is a data migration. Keep it separate from draft validation work and make the diff easy to review.

## Acceptance criteria

- [ ] Current wizard property runtime IDs such as `wizard-property-001` are migrated to the agreed set-prefixed style.
- [ ] DWT-related IDs and references are migrated where real runtime DWT IDs exist.
- [ ] Deck/token stack references are updated consistently.
- [ ] Tests and docs that reference the old IDs are updated.
- [ ] No runtime behavior changes beyond ID/reference updates.
- [ ] Relevant validation, typecheck, and focused tests pass.
- [ ] The final diff is reviewed for accidental data loss or unrelated changes.

## Blocked by

- `.scratch/krutagidon-import-pipeline/issues/05-validate-new-import-id-style.md`
