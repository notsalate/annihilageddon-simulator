# OCR first uploaded card image batch

Status: ready-for-agent
Label: ready-for-agent
Type: HITL/AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Convert the first user-uploaded batch of 10-20 card images from `assets/cards/raw/*.{webp,png,jpg,jpeg}` into one markdown extraction file per card.

The output is only an OCR/extraction layer. It must capture visible Russian card data and uncertainty. It must not translate, search for English names, infer runtime effects, or rewrite card text from memory.

Use this issue's acceptance criteria as the authority for what the Card OCR Agent may and may not extract.

## Acceptance criteria

- [ ] `assets/cards/raw/` contains the uploaded card source images before OCR starts.
- [ ] `data/import/card-texts/` exists.
- [ ] Each processed source image has a matching `data/import/card-texts/<card-id>.md`.
- [ ] `data/import/card-texts/index.json` maps source image paths to extraction files.
- [ ] Each markdown file records source image path, Russian name if visible, cost/ПО if visible, type if visible, Russian rules text, visible properties/icons/keywords, and uncertainty notes.
- [ ] English names and English text are not searched for, guessed, or translated.
- [ ] Runtime engine effects are not assigned in this issue.
- [ ] Low-confidence or unreadable fields are explicitly marked.

## Blocked by

None - can start immediately. The first image batch is present in `assets/cards/raw/`.
