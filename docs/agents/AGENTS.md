# AGENTS.md

## Purpose

This folder contains local agent workflow documentation.

## Ownership

- Owns `domain.md`, `issue-tracker.md`, and `triage-labels.md`.
- Does not own game rules, card behavior, runtime layout, or import schemas.

## Local Contracts

- Keep these docs about agent process only.
- If process guidance conflicts with root `AGENTS.md`, root controls repo-wide behavior and this folder should be corrected.
- Do not use these files as source-of-truth for simulator behavior.

## Work Guidance

- Keep issue tracker guidance aligned with the actual split: GitHub Issues as the main tracker, `.scratch/` as the local working area.
- Keep triage labels aligned with the configured GitHub labels.
- Keep domain-doc consumption guidance pointed at actual durable domain docs.

## Verification

- For docs-only edits, run `git diff --check`.
- If process docs mention file paths, confirm the paths exist.

## Child DOX Index

None.
