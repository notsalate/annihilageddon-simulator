# DOX workflow

## Purpose

DOX keeps repository instructions aligned with the directory structure and current working contracts.

Read this document when creating, moving, deleting, or substantially changing an `AGENTS.md`, or when a task changes durable ownership, workflow, constraints, or repository structure.

## Instruction Chain

1. Identify every path the task may change.
2. Start with the root `AGENTS.md`.
3. Walk from the repository root to each target path.
4. Read every `AGENTS.md` found on that route.
5. Use the closest file for local details while preserving higher-priority user, system, and developer instructions.
6. Do not scan unrelated instruction trees.

Codex discovers project instructions from the project root to the current working directory. When a task edits a deeper path from a root session, read the applicable chain explicitly before editing.

## Updating Instructions

An implementation change does not automatically require an `AGENTS.md` edit.

Update the closest owning instruction file when the change affects:

- purpose, scope, ownership, or responsibilities;
- durable structure, contracts, or workflow;
- required inputs, outputs, permissions, constraints, side effects, or artifacts;
- an explicitly requested project-specific durable preference;
- an `AGENTS.md` path, name, or child index.

Update the parent when its direct-child map or repository-wide contract changes. Update a child when the parent change alters that child’s local guidance.

Remove stale or contradictory rules instead of appending historical explanations.

## Child Files

Create a child `AGENTS.md` only for a durable directory boundary with its own responsibilities, rules, checks, or exceptions.

Use this section order when it helps; omit empty sections:

1. Purpose
2. Ownership
3. Local Contracts
4. Work Guidance
5. Verification
6. Child DOX Index

Keep broad rules in the parent and concrete local rules in the child. Do not duplicate a parent rule unless the local version adds necessary detail.

Each parent index lists direct child `AGENTS.md` files and their responsibility. It does not need to repeat each child’s descendants.

## Closeout

1. Re-check changed paths against the applicable instruction chain.
2. Update only the instruction documents affected by a real contract or structure change.
3. Refresh affected direct-child indexes.
4. Remove stale or contradictory text.
5. Run the existing verification relevant to the changed files.
6. Report any required instruction update that remains incomplete.
