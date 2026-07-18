# AGENTS.md

## Purpose

This folder contains durable project documentation for rules, runtime layout, import flow, mechanics coverage, debug traces, process docs, and JSON templates.

## Ownership

- Owns Markdown docs directly under `docs/`.
- `docs/agents/AGENTS.md` owns local agent process docs.
- `docs/templates/AGENTS.md` owns JSON templates.
- Root `README.md`, root `CONTEXT.md`, and root `AGENTS.md` remain owned by root `AGENTS.md`.

## Local Contracts

- Keep docs concise, current, and operational.
- Treat `docs/agents/*` as process guidance, not domain truth.
- For engine rules and data contracts, align docs with `README.md`, `CONTEXT.md`, focused source, tests, and current data.
- Delete stale or contradictory notes instead of adding historical explanations.
- Do not claim a command, status, or behavior unless it exists in the repo or was verified.

## Work Guidance

- Put public overview and dev quickstart in `README.md`; keep long status inventories in focused docs.
- Keep architecture/runtime/import details in the focused docs that already own them.
- When docs describe generated reports, mention the command that regenerates them.

## Verification

- For docs-only edits, run `git diff --check`.
- If a doc changes command behavior, data contracts, or runtime claims, run the narrowest relevant command from the owning source/data area.

## Child DOX Index

- `docs/agents/AGENTS.md` - local process and issue-tracker guidance.
- `docs/templates/AGENTS.md` - JSON templates for draft and runtime data shapes.
