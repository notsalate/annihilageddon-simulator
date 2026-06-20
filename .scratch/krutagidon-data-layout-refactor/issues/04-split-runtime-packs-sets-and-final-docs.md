Status: ready-for-agent

# Split Runtime Packs, Sets, and Final Docs

## What to build

Finish the runtime layout migration by separating packs, true decks, shuffled stacks, pools, and token definitions into their own locations. The v0 first-batch pack should remain a runnable regression pack, while `full-import.json` should exist as the future full import manifest without pretending all cards are playable. After the structure is real, trim stale project documentation so it points at the new layout without weakening agent workflow rules.

## Acceptance criteria

- [ ] Move runtime manifests into `data/packs`, including the existing v0 first-batch pack.
- [ ] Add `data/packs/full-import.json` as a future full import manifest that can include incomplete/non-playable runtime mappings explicitly.
- [ ] Keep true card decks under `data/decks`, such as main, Legend, and starter decks.
- [ ] Move shuffled card stacks under `data/stacks/cards`, including Wild Magic and Limp Wand.
- [ ] Move shuffled token stacks under `data/stacks/tokens`, including Dead Wizard Tokens and wizard properties.
- [ ] Move familiar pool composition under `data/pools`.
- [ ] Split token definitions into `data/tokens/dead-wizard` and `data/tokens/wizard-property`.
- [ ] Update manifest schema/types and loader code so packs reference explicit card definition paths, token definition paths, decks, stacks, and pools.
- [ ] Preserve a runnable `v0-first-batch` regression path and verify it with focused tests.
- [ ] Update README to describe the current project status, commands, and final data layout without duplicating full rule/import documentation.
- [ ] Update AGENTS.md only by removing stale duplicate documentation and old paths; preserve safety, Windows/PowerShell, RTK, tests/checks, reporting, workflow, and card simulation conventions.
- [ ] Preserve `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md`.
- [ ] Remove or collapse `docs/simulation-scope.md` once unique current content has been moved to active docs.
- [ ] Keep `docs/single-game-debug-trace.md` as the trace specification, but remove the embedded issue-draft section.
- [ ] Verify there are no stale references to `ocrText`, `data/import/card-texts`, `data/import/card-drafts`, old universal `data/decks`, or old asset `raw` paths in active docs/code/tests/data.

## Blocked by

- 03-migrate-runtime-cards-and-ids.md
