# AGENTS.md

## Purpose

This folder contains durable project documentation for rules, runtime layout, import flow, mechanics coverage, debug traces, process docs, and JSON templates.

## Ownership

- Owns Markdown docs directly under `docs/`.
- Root `README.md`, `CONTEXT.md`, `CODING_STANDARDS.md`, and `AGENTS.md` remain owned by root `AGENTS.md`.

## Local Contracts

- Treat `docs/agents/*` as process guidance, not domain truth.
- For engine rules and data contracts, align docs with `README.md`, `CONTEXT.md`, focused source, tests, and current data.
- Delete stale or contradictory notes instead of adding historical explanations.

## Work Guidance

- Put public overview and dev quickstart in `README.md`; keep long status inventories in focused docs.
- Keep architecture/runtime/import details in the focused docs that already own them.
- When docs describe generated reports, mention the command that regenerates them.

## Verification

- For docs-only edits, run `git diff --check`.
- For changed command behavior, data contracts, or runtime claims, follow [CODING_STANDARDS.md](../CODING_STANDARDS.md) and the owning source/data checks.

## Child DOX Index

- `docs/agents/AGENTS.md` - local process and issue-tracker guidance.
- `docs/adr/AGENTS.md` - architecture decision records, their format, lifecycle, and validation boundary.
- `docs/superpowers/AGENTS.md` - design specifications and implementation plans for multi-step agent work.
- `docs/templates/AGENTS.md` - JSON templates for draft and runtime data shapes.
