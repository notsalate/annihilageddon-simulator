# AGENTS.md

## Purpose

This folder contains the durable architecture decisions that govern the simulator and its performance baselines.

## Ownership

- Owns ADR documents, the ADR index, and the lifecycle/format guide in this folder.
- `scripts/validate-adr.mjs` owns structural validation of these documents; it does not judge whether a code change deserves an ADR.

## Local Contracts

- Keep one numbered Markdown document per ADR.
- Preserve superseded ADR documents; connect replacements through both metadata links and the index.
- Use `proposed`, `accepted`, or `superseded` for status values.
- Mark restored decisions with `origin: restored` and `decision_date: unknown`; never invent a historical decision date.
- Keep benchmark and performance-epoch terminology aligned with the current ADR model.

## Work Guidance

- Update `index.md` in the same change as an ADR document.
- Run `npm run validate:adr` after changing an ADR or the index.
- Add an ADR only when the change is difficult to reverse, non-obvious, or carries a substantial long-term trade-off.

## Verification

- `npm run validate:adr`
- `git diff --check`

## Child DOX Index

None.
