# AGENTS.md

## Purpose

This folder stores durable design specifications and implementation plans created for multi-step agent work.

## Ownership

- `specs/` owns approved design specifications.
- `plans/` owns executable task plans.

## Local Contracts

- Record only verified repository and issue facts.
- Plans must preserve task boundaries, tests, and completion evidence.
- These records describe execution; engine behavior remains owned by focused runtime docs and source.

## Work Guidance

- Keep one specification and one plan per coherent delivery.
- Update a plan when the accepted issue scope changes.

## Verification

- Run `git diff --check` after documentation edits.

## Child DOX Index

- `specs/AGENTS.md` - approved design specifications.
- `plans/AGENTS.md` - executable implementation plans.
