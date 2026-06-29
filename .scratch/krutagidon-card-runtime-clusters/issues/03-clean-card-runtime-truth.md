Status: Ready
Label: ready-for-agent
Type: AFK

# Очистить card runtime truth и проверить special cards

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Удалить старые runtime card JSON как источник истины для нового card-runtime workflow, очистить current card compositions от ссылок на удалённые card IDs и отдельно проверить две special cards.

После этого `data/cards/**` не должен содержать старые main/legend/starter/familiar mappings. Симуляция остаётся runnable через incomplete current runtime pack, а большинство card drafts ожидаемо становятся missing runtime backlog.

## User stories covered

- 2. Old runtime card JSON removed from runtime truth.
- 4. Missing card runtime is normal backlog.
- 5. Blocked cards kept out of runtime JSON.
- 7. Special cards reviewed explicitly.
- 13. Invalid runtime/composition references are detected.
- 14. Future generated runtime cards are based on drafts/source text.

## Acceptance criteria

- [ ] Старые runtime card JSON удалены из `data/cards/main`, `data/cards/legend`, `data/cards/starter`, `data/cards/familiar`.
- [ ] Старые runtime JSON не перенесены как источник будущего mapping.
- [ ] Current main, legend, starter, familiar, Wild Magic и Limp Wand compositions не ссылаются на удалённые card IDs.
- [ ] `esw2_dbg__wild_magic` review выполнен против draft/source/current behavior; card оставлена только если соответствует full standard.
- [ ] `esw2_dbg__limp_wand` review выполнен против draft/source/current behavior; card оставлена только если соответствует full standard.
- [ ] Если special card не проходит review, её runtime JSON удалён, а соответствующий stack очищен.
- [ ] Current runtime pack загружается без missing card definition errors.
- [ ] Initialization/simulation smoke работает с неполным или пустым card pack.
- [ ] Runtime coverage/reporting может показывать удалённые cards как missing runtime; это описано как ожидаемый baseline.
- [ ] `git diff --check` проходит.
- [ ] `npm run typecheck` проходит.
- [ ] Focused setup/data-pack tests проходят.

## Blocked by

- `.scratch/krutagidon-card-runtime-clusters/issues/01-rebaseline-default-runtime-pack.md`
- `.scratch/krutagidon-card-runtime-clusters/issues/02-support-incomplete-full-only-setup.md`

## Notes

- Старые supported и partial runtime card JSON не различать как разные категории. Для нового процесса они одинаково не являются source of truth.
- Не реализовывать новые карты в этом issue.
