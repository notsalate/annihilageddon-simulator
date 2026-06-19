# PRD: Import Pipeline and Draft Validation Before Full Card Import

Status: ready-for-agent
Label: ready-for-agent

## Problem Statement

The project is preparing to import all remaining Крутагидон cards, familiars, Legend deck cards, Mayhems, Mega Mayhems, wizard properties, and Dead Wizard Tokens from local scan/OCR output.

The current repo already has raw markdown import files, card draft JSON files, runtime card JSON files, and runtime wizard property JSON files. However, the boundary between draft data and runtime data is not clean enough. Some current wizard property draft files are structurally identical to runtime JSON, while card drafts are closer to a visible-text passport. This makes it hard for the user and agents to know whether a file is only imported source data or already executable engine data.

Before broad runtime mapping, the project needs a clear import pipeline, a common draft format, a validator that catches bad draft files early, and reports that show import completeness. Without this, full import risks mixing OCR mistakes, draft structure mistakes, runtime mapping mistakes, unsupported mechanics, and historical ID inconsistencies into one expensive debugging problem.

## Solution

Create a clear import pipeline for local data:

- raw markdown is the human-readable OCR/source extraction;
- draft JSON is a structured passport of visible/source facts and uncertainties;
- runtime JSON is executable data for the engine.

The draft layer must be intentionally non-executable. It must not contain runtime effect mappings, playability flags, runtime schemas, or mapping statuses.

Add a shared import guide for the whole pipeline, define draft schemas for cards, wizard properties, and Dead Wizard Tokens, add a draft validator with errors and warnings, and add import completeness reporting. New imports should use a consistent ID style with the set prefix. Existing historical runtime IDs should be migrated later in a separate small data migration.

The user's external scan pipeline is out of scope for agents. Agents should support the files produced by that pipeline, not implement the scanner itself.

## User Stories

1. As the project owner, I want a simple explanation of `.md -> draft JSON -> runtime JSON`, so that I can decide what stage each imported object is in.
2. As the project owner, I want draft JSON to be only a visible/source passport, so that draft files do not pretend to be implemented mechanics.
3. As the project owner, I want runtime JSON to be the only executable layer, so that the engine never depends on OCR text or draft files.
4. As the project owner, I want a single import guide, so that I do not need to remember separate rules for cards, wizard properties, and Dead Wizard Tokens.
5. As the project owner, I want draft validation errors and warnings separated, so that bad files block mapping while OCR doubts stay visible but manageable.
6. As the project owner, I want a quick import completeness report, so that I can see how many objects exist as markdown, draft JSON, and runtime JSON.
7. As the project owner, I want new imports to use consistent IDs, so that cards, wizard properties, and Dead Wizard Tokens sort and validate predictably.
8. As a data maintainer, I want each draft file to declare its draft kind, so that tooling can validate the right shape without guessing from folder names.
9. As a data maintainer, I want card drafts to validate card-specific fields, so that card type, cost, VP, markers, and text are structured before mapping.
10. As a data maintainer, I want wizard property drafts to validate property-specific fields, so that properties are not forced into card fields they do not have.
11. As a data maintainer, I want Dead Wizard Token drafts to validate token-specific fields, so that DWT text and visible/source facts are captured before runtime effects.
12. As a data maintainer, I want draft files to reject runtime fields, so that executable decisions do not leak into import data.
13. As a data maintainer, I want the current wizard property draft files cleaned up, so that the import directory no longer contains runtime copies under a draft name.
14. As a data maintainer, I want stable IDs to avoid Russian display names, so that renames and OCR corrections do not break references.
15. As a future mapper, I want runtime mapping to start only from valid draft files, so that mapping work is not polluted by basic import mistakes.
16. As a future mapper, I want unsupported mechanics recorded at runtime mapping time, so that incomplete mechanics do not become silent no-ops.
17. As a future mapper, I want draft validation to be separate from runtime validation, so that visible-text correctness and executable behavior are checked independently.
18. As an engine developer, I want the validator to be dependency-light and scriptable, so that it can run locally on Windows without changing the project toolchain.
19. As an engine developer, I want validation output to be concise, so that batch import reports are readable.
20. As an agent, I want a clear source-of-truth guide, so that future import work follows the same rules without re-litigating the format.

## Implementation Decisions

- Replace the card-only draft guide with a general import pipeline guide.
- The import pipeline guide is the source of truth for raw markdown, draft JSON, runtime JSON, draft validation, ID style, and stage boundaries.
- Draft JSON is defined as structured import data, not executable data.
- Runtime JSON is the only layer that contains executable effects, playability decisions, runtime schemas, and mapping statuses.
- Every draft JSON file must include a required draft kind discriminator.
- Supported draft kinds are `cardDraft`, `wizardPropertyDraft`, and `deadWizardTokenDraft`.
- One validator should route by draft kind and apply a different schema per draft kind.
- Card drafts should include card-specific visible fields such as name, cost, VP, visible type, structural kind, card types, markers, text, and uncertainty.
- Wizard property drafts should include property-specific visible fields such as source label, text, uncertainty, and non-executable notes.
- Dead Wizard Token drafts should include token-specific visible fields such as source label, text, optional visible VP, uncertainty, and non-executable notes.
- Draft files must not contain executable runtime fields such as effect mappings, runtime playability flags, runtime schemas, or mapping statuses.
- The validator should produce errors and warnings.
- Errors block runtime mapping.
- Warnings do not block reading the draft but should be included in import reports.
- Typical errors include unreadable JSON, missing draft kind, missing stable ID, missing visible text, forbidden runtime fields, and schema mismatches.
- Typical warnings include missing source image, expected-but-empty cost or VP, uncertainty entries, unusual visible type, and filename/ID mismatch.
- New imports should use a consistent set-prefixed ID style: set prefix, category, and number.
- New cards, wizard properties, and DWTs should use the new ID style from the start.
- Current historical runtime IDs for wizard properties and DWT-related files should not be renamed as part of the validator work. They should be handled by a later small migration.
- Current wizard property draft files should be converted from runtime-like copies into clean draft files.
- Import completeness reporting should compare expected/imported raw markdown, draft JSON, and runtime JSON counts.
- The user's scanner/OCR automation is out of scope for agents. The repo should validate and consume its output.
- Runtime mapping validation remains a separate concern from draft validation.

## Testing Decisions

- Test draft validation through its public command or exported validation function, not private parsing details.
- Add focused tests for each draft kind.
- Add tests that valid card, wizard property, and Dead Wizard Token drafts pass.
- Add tests that forbidden runtime fields fail validation.
- Add tests that missing draft kind fails validation.
- Add tests that missing visible text fails validation.
- Add tests that invalid card types and markers fail validation for card drafts.
- Add tests that card-only fields are not required for wizard property drafts.
- Add tests that card-only fields are not required for Dead Wizard Token drafts.
- Add tests that uncertainty entries produce warnings rather than errors.
- Add tests that missing optional source image produces a warning rather than an error.
- Add tests that filename/ID mismatch produces a warning or error according to the agreed validator mode.
- Add tests for concise aggregate output from validating multiple drafts.
- Use existing TypeScript and node:test style already present in the repo.
- Run the narrow validation tests after implementation, then typecheck or full test suite if shared modules or package scripts change.

## Out of Scope

- Implementing the user's scan/OCR pipeline.
- Downloading, importing, or publishing external copyrighted card databases.
- Runtime mapping for every card.
- Implementing missing game mechanics.
- Fixing Dingler behavior.
- Fixing Trophy source-of-death behavior.
- Building a debug/trace viewer.
- Renaming current historical runtime IDs.
- Changing deck composition files as part of this PRD.
- Changing engine runtime behavior except where needed to keep validation commands wired into the project.
- UI for import management.

## Further Notes

The agreed new import ID style is set-prefixed and category-based, for example main cards, Legend cards, starter cards, familiars, wizard properties, Dead Wizard Tokens, Wild Magic, and Limp Wand all use the same family of stable IDs.

The current wizard property draft files are known to be structurally equal to runtime wizard property files. That cleanup should be a small issue under this PRD.

The current card draft guide already contains several of the new decisions, but the guide name is now misleading. It should become the general import pipeline guide.

After the draft pipeline is solid, the project can safely import all remaining objects as raw markdown and draft JSON even before every runtime mechanic is implemented.
