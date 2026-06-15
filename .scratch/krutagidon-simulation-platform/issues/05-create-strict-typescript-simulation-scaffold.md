# Create strict TypeScript simulation scaffold

Status: done
Label: done
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Create the initial headless TypeScript scaffold for the simulation project.

The scaffold should establish strict TypeScript settings, repository scripts, test support, and a small project structure suitable for a console-only deterministic simulation engine. It should not implement game rules beyond any minimal smoke path required to verify the scaffold.

## Acceptance criteria

- [x] A TypeScript project scaffold exists with strict compiler settings.
- [x] `package.json` contains clear scripts for type checking and tests.
- [x] The project has a minimal source/test structure for a headless engine.
- [x] The test command runs successfully with at least one meaningful smoke test.
- [x] The type-check command runs successfully.
- [x] The scaffold does not introduce UI, database, web framework, or unrelated dependencies.
- [x] README command documentation is updated to reflect the new scripts.

## Blocked by

None - can start immediately.
