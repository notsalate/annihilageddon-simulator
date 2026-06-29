Status: Done
Label: done
Type: AFK

# Проверить special runtime cards и special stacks

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Проверить две existing special runtime cards как отдельный end-to-end срез: `esw2_dbg__wild_magic` и `esw2_dbg__limp_wand`.

Срез должен решить, остаются ли эти special cards в current runtime baseline. Если card соответствует full standard, её runtime JSON и stack entry остаются. Если нет, runtime JSON удаляется, а соответствующий stack очищается. Current runtime pack после решения должен загружаться и инициализироваться без missing reference errors.

## User stories covered

- 4. Missing card runtime is normal backlog.
- 5. Blocked cards kept out of runtime JSON.
- 7. Special cards reviewed explicitly.
- 13. Invalid runtime/composition references are detected.

## Acceptance criteria

- [x] `esw2_dbg__wild_magic` review выполнен против canonical draft/source text и current handler behavior.
- [x] `esw2_dbg__wild_magic` оставлена в `data/cards/special` и `wild-magic-stack` только если соответствует full standard.
- [x] Если `esw2_dbg__wild_magic` не соответствует full standard, её runtime JSON удалён, а `wild-magic-stack` очищен.
- [x] `esw2_dbg__limp_wand` review выполнен против canonical draft/source text и current handler behavior.
- [x] `esw2_dbg__limp_wand` оставлена в `data/cards/special` и `limp-wand-stack` только если соответствует full standard.
- [x] Если `esw2_dbg__limp_wand` не соответствует full standard, её runtime JSON удалён, а `limp-wand-stack` очищен.
- [x] Special stack entries не ссылаются на отсутствующие card definitions.
- [x] Current runtime pack загружается без missing card definition errors.
- [x] Initialization/simulation smoke работает после special decision.
- [x] `npm run typecheck` проходит.
- [x] Focused setup/data-pack tests проходят.
- [x] `git diff --check` проходит.

## Blocked by

- `.scratch/krutagidon-card-runtime-clusters/issues/03-clean-card-runtime-truth.md`

## Notes

- Не реализовывать новые special behavior в этом issue. Если special card не full, удалить её из runtime truth и оставить будущей matrix/cluster workflow.
- Этот issue не создаёт decisions/matrix generator.

## Implementation notes

- По review обе special cards оставлены в `current-runtime`: `esw2_dbg__wild_magic` уже имеет catalog-backed handler и покрытие в `tests/action-loop.test.ts` / `tests/validation.test.ts`, а `esw2_dbg__limp_wand` допустима как полная no-effect карта с `effects: []` и `-1 VP`.
- `data/cards/special/esw2_dbg__wild_magic.json` и `data/cards/special/esw2_dbg__limp_wand.json` приведены к canonical visible contract из draft/source text: заполнен `visible.typeRu`, убрана устаревшая uncertainty про "невидимый тип", у Wild Magic выровнен `textRu`.
- `tests/setup.test.ts` получил focused regression на reviewed special cards и их stack entries, чтобы future cleanup не возвращал старое special-only исключение с пустым `typeRu`.

## Verification

- `npm test -- tests/setup.test.ts`
- `npm test -- tests/validation.test.ts`
- `npm test -- tests/action-loop.test.ts`
- `npm run typecheck`
- `npm test`
- `git diff --check`
