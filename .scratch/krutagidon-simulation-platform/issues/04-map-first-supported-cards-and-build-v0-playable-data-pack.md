# Map first supported cards and build v0 playable data pack

Status: done
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Turn the first card JSON drafts into a minimal playable data pack for engine v0.

This slice should map only effects and mechanics that are supported by the rules canon and clear enough to execute deterministically. Cards with unclear or unsupported behavior should remain explicit as unsupported rather than guessed.

The output should include final card definitions and deck compositions sufficient for the first runnable simulation.

Use `docs/card-json-guide.md` for card kind/type conventions and `docs/rules-canon.md` only for executable engine behavior.

## Acceptance criteria

- [x] `data/cards/` contains final JSON files for the supported first-batch cards.
- [x] Each final card keeps visible/reference fields separate from engine/runtime fields.
- [x] Each supported card has numeric victory points.
- [x] Each supported card has engine fields needed by v0.
- [x] Unsupported or unclear cards are listed with reasons instead of silently mapped.
- [x] `data/decks/` contains v0 deck composition files using `cardId + count`.
- [x] The v0 playable data pack includes enough supported cards to initialize the first simulation.
- [x] No runtime behavior is inferred from natural-language parsing during gameplay.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/01-extract-technical-rules-canon.md`
- `.scratch/krutagidon-simulation-platform/issues/03-convert-first-ocr-batch-to-card-json-drafts.md`
