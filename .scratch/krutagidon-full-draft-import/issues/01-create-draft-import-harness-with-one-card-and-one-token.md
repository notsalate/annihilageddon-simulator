Status: Done

# Create Draft Import Harness With One Card and One Token

## What to build

Create the minimal repeatable harness for Full Draft Import and prove it on one card source text and one token source text. The harness must parse source text only, generate canonical draft JSON, and report blockers when source text is insufficient. It must not inspect source images or create runtime behavior.

This issue should establish enough structure that later import-group issues can add dialect support and generate their group drafts without reinventing the workflow.

## Acceptance criteria

- [x] Add or update local draft templates in each relevant `drafts/` area, using `_template` filenames that validation/reporting ignore.
- [x] Add a source-text-only preflight/generator path that can read one card markdown and one token markdown and emit canonical draft JSON.
- [x] The harness writes a blocker report when a required draft field cannot be filled from source text, path, filename, or agreed project rules.
- [x] Generated drafts use canonical `source.text`, current `source.image`, canonical IDs, `notes` for mapping notes, and `composition.quantity` where available.
- [x] The harness does not inspect image files and does not create `engine`, `runtimeSchema`, `playableInV0`, runtime `mappingStatus`, or runtime effects.
- [x] Include focused tests or fixtures proving one card draft and one token draft can be generated and validated.
- [x] `npm run validate:drafts` behavior remains understandable: any failures after this issue must be from not-yet-imported groups, not from the harness itself.

## Blocked by

None - can start immediately
