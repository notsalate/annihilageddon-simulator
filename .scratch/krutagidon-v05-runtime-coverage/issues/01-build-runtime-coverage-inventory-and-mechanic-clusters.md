Status: Done

# Build Runtime Coverage Inventory and Mechanic Clusters

## What to build

Create the first v0.5 runtime coverage planning slice after Full Draft Import. This issue should produce an automatically generated inventory report that compares canonical draft data, current runtime data, and composition membership, then proposes mechanic clusters for the next runtime-mapping issues.

The goal is to make the next issue selection evidence-based. Do not add, delete, or rewrite runtime card/token JSON in this issue.

Use the current glossary language from `CONTEXT.md`, especially:

- Runtime Mapping Review Needed
- v0.5 Runtime Coverage
- v0 Legacy Runtime Fields
- Runtime Coverage Audit Report
- Fully Playable Runtime Definition
- Focused Runtime Coverage Test
- Mechanic Cluster
- Wand Attack Card

## Acceptance criteria

- [x] Add a repository command or script that generates a v0.5 runtime coverage inventory from existing local files.
- [x] The inventory includes all canonical card drafts, wizard property drafts, and Dead Wizard Token drafts.
- [x] For each inventory item, report at least: stable ID, object kind, source group/token kind, draft presence, runtime presence, composition membership, old v0 fields when present, and a starting coverage status.
- [x] Starting coverage status distinguishes at least `missingRuntime`, `reviewNeeded`, `partial`, `placeholder`, and `fullyPlayableCandidate`.
- [x] Existing old v0 runtime definitions are classified as `reviewNeeded` by default unless the implementation can point to focused tests that prove the mapped behavior.
- [x] Old `runtimeSchema = "krutagidon.cardDefinition.v0"` and `playableInV0` values are reported as legacy facts, not treated as current coverage truth.
- [x] The inventory detects current missing runtime gaps reported by `npm run report:import` for cards and Dead Wizard Tokens.
- [x] The inventory also flags runtime definitions that exist but are not included in an appropriate deck, stack, or pool composition.
- [x] Add a generated or checked-in summary that groups draft/runtime items into proposed Mechanic Clusters for future issues.
- [x] Mechanic cluster proposals include the relevant card/token/property IDs, the shared mechanic surface, suspected blockers, and suggested focused test coverage.
- [x] Include an explicit Wand Attack Card cluster or candidate cluster if the source data supports it, using the glossary rule instead of name-only or `cardTypes`-only matching.
- [x] Do not create new runtime card JSON, token JSON, deck/stack/pool composition entries, or engine behavior in this issue.
- [x] Do not delete existing runtime files, old v0 metadata fields, or import files in this issue.
- [x] Document the recommended next issue order after the inventory is generated.
- [x] `npm run validate:drafts` still passes.
- [x] `npm run report:import` still reports draft validation with `0` errors and `0` warnings; remaining missing runtime should be reported as expected inventory input, not a failure of this issue.
- [x] Run a focused check for the new inventory command/script and report its output summary.
- [x] Run `git diff --check`.

## Blocked by

- None - can start immediately after Full Draft Import is complete.

## Notes for the agent

- Full Draft Import is complete: all five issues under `.scratch/krutagidon-full-draft-import/issues/` are `Done`.
- The latest Full Draft Import handoff before this issue was `C:\Users\SALATE\AppData\Local\Temp\krutagidon-full-draft-import-issue-05-handoff.md`.
- Current draft layer baseline from the handoff: cards raw/drafts `128/128`, wizard properties `10/10`, Dead Wizard Tokens `29/29`, draft validation `0` errors and `0` warnings.
- Current runtime baseline from the handoff: cards runtime `41`, wizard properties runtime `10`, Dead Wizard Tokens runtime `1`; many cards and DWTs are still missing runtime mappings.
- Treat existing runtime files as useful legacy input, not as authoritative v0.5 coverage.
- Keep this issue scoped to planning diagnostics. The next issue should be chosen from the generated mechanic cluster proposals.
