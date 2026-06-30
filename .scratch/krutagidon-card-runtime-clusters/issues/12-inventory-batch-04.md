Status: Ready
Label: ready-for-agent
Type: AFK

# Инвентаризировать mechanics batch 04

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Провести черновую mechanics inventory для четвёртого batch карт из текущего card runtime backlog.

Для каждой карты из списка нужно прочитать draft/source text, выписать candidate primary mechanics, secondary mechanics и явные blockers. Это не финальная кластеризация: одна карта может попасть в несколько candidate buckets, а финальный `clusterId` в `card-cluster-decisions.json` в этом issue не назначается.

## Card IDs

- `esw2_dbg__main_041`
- `esw2_dbg__main_042`
- `esw2_dbg__main_043`
- `esw2_dbg__main_044`
- `esw2_dbg__main_045`
- `esw2_dbg__main_046`
- `esw2_dbg__main_047`
- `esw2_dbg__main_048`
- `esw2_dbg__main_049`
- `esw2_dbg__main_050`
- `esw2_dbg__main_051`
- `esw2_dbg__main_052`
- `esw2_dbg__main_053`
- `esw2_dbg__main_054`
- `esw2_dbg__main_055`
- `esw2_dbg__main_056`
- `esw2_dbg__main_057`
- `esw2_dbg__main_058`
- `esw2_dbg__main_059`
- `esw2_dbg__main_060`
- `esw2_dbg__main_061`
- `esw2_dbg__main_062`
- `esw2_dbg__main_063`
- `esw2_dbg__main_064`
- `esw2_dbg__main_065`

## User stories covered

- 14. Generated runtime cards based on import drafts/source text.
- 15. Block C card implementation deferred until Block A and Block B are finished.

## Acceptance criteria

- [ ] Создан или обновлён `.scratch/krutagidon-card-runtime-clusters/inventory/04.md`.
- [ ] Inventory file перечисляет все cardId из этого issue.
- [ ] Для каждой карты указаны candidate primary mechanics.
- [ ] Для каждой карты указаны secondary mechanics, если они видны из текста.
- [ ] Для каждой карты указаны blockers или `none`.
- [ ] Для каждой карты указано, какие related runtime surfaces стоит проверить позже: wizard properties, Dead Wizard Tokens, special cards, engine gaps или `none/unknown`.
- [ ] Inventory явно помечает ambiguous/mixed cards, где главную механику нельзя выбрать без дальнейшего решения.
- [ ] Не редактировать `card-cluster-decisions.json`.
- [ ] Не редактировать `mechanic-clusters.md`, кроме случаев, когда issue 08 уже задал обязательный inventory reference формат.
- [ ] Не реализовывать новые runtime cards.
- [ ] `git diff --check` проходит.

## Blocked by

- `.scratch/krutagidon-card-runtime-clusters/issues/08-create-mechanic-cluster-map-guardrails.md`

## Notes

- Candidate mechanic из inventory не является cluster decision.
- В inventory одна карта может быть в нескольких candidate buckets.
- В финальном `card-cluster-decisions.json` у карты позже должен остаться ровно один основной `clusterId`.
