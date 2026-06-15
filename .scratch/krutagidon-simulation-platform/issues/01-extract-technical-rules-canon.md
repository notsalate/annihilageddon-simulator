# Extract v0-oriented technical rules canon from the rulebook

Status: done
Label: done
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Extract a v0-oriented implementation-ready technical rules canon from `Pravila_Krutagidon_2.pdf` for the Крутагидон 2 simulation engine. Use `ESW2-DBG-Rulebook-low_res.pdf` only as an optional cross-check if needed.

This is not a free-form rulebook summary. The output must separate executable game rules from tutorial, marketing, example, and flavor text. The result should let an engine agent implement game setup, turn structure, zones, resources, end conditions, scoring, card types, and mechanics without reading the PDF directly.

Use `docs/simulation-scope.md` and this issue's acceptance criteria as the current project constraints.

This issue is considered complete as a v0 canon draft. It is not the full executable mechanics canon for every rulebook system. Full global mechanics digitization is tracked separately in `10-expand-full-rules-mechanics-canon.md`.

## Acceptance criteria

- [x] `docs/rules-canon.md` exists and describes implementation-ready game rules with source references to PDF pages or sections.
- [x] `docs/rules-glossary.md` exists and captures known Russian terms plus any confirmed cross-language correspondences without guessing missing translations.
- [x] `docs/rules-open-questions.md` exists and lists ambiguous, missing, or unresolved rules.
- [x] The canon clearly separates v0 rules from future/full-rules behavior.
- [x] The canon includes game zones, setup, turn flow, resource handling, card acquisition, end conditions, scoring, and tie breakers.
- [x] Any extracted mechanics or keywords that can be represented safely are listed in a machine-oriented form or a clear markdown table.
- [x] No card behavior is invented beyond what the source and existing scope support.

## Blocked by

None - can start immediately.

## Follow-up

- `.scratch/krutagidon-simulation-platform/issues/10-expand-full-rules-mechanics-canon.md`
