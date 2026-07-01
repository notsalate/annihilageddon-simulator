Status: Done
Label: ready-for-agent
Type: AFK

# Инвентаризировать mechanics batch 03

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Провести черновую mechanics inventory для третьего batch карт из текущего card runtime backlog.

Для каждой карты из списка нужно прочитать draft/source text, выписать candidate primary mechanics, secondary mechanics и явные blockers. Это не финальная кластеризация: одна карта может попасть в несколько candidate buckets, а финальный `clusterId` в `card-cluster-decisions.json` в этом issue не назначается.

## Card IDs

- `esw2_dbg__main_015`
- `esw2_dbg__main_016`
- `esw2_dbg__main_017`
- `esw2_dbg__main_018`
- `esw2_dbg__main_019`
- `esw2_dbg__main_020`
- `esw2_dbg__main_021`
- `esw2_dbg__main_022`
- `esw2_dbg__main_023`
- `esw2_dbg__main_024`
- `esw2_dbg__main_025`
- `esw2_dbg__main_026`
- `esw2_dbg__main_027`
- `esw2_dbg__main_028`
- `esw2_dbg__main_029`
- `esw2_dbg__main_030`
- `esw2_dbg__main_031`
- `esw2_dbg__main_032`
- `esw2_dbg__main_033`
- `esw2_dbg__main_034`
- `esw2_dbg__main_035`
- `esw2_dbg__main_036`
- `esw2_dbg__main_037`
- `esw2_dbg__main_038`
- `esw2_dbg__main_039`
- `esw2_dbg__main_040`

## User stories covered

- 14. Generated runtime cards based on import drafts/source text.
- 15. Block C card implementation deferred until Block A and Block B are finished.

## Acceptance criteria

- [x] Создан или обновлён `.scratch/krutagidon-card-runtime-clusters/inventory/03.md`.
- [x] Inventory file перечисляет все cardId из этого issue.
- [x] Для каждой карты указаны candidate primary mechanics.
- [x] Для каждой карты указаны secondary mechanics, если они видны из текста.
- [x] Для каждой карты указаны blockers или `none`.
- [x] Для каждой карты указано, какие related runtime surfaces стоит проверить позже: wizard properties, Dead Wizard Tokens, special cards, engine gaps или `none/unknown`.
- [x] Inventory явно помечает ambiguous/mixed cards, где главную механику нельзя выбрать без дальнейшего решения.
- [x] Не редактировать `card-cluster-decisions.json`.
- [x] Не редактировать `mechanic-clusters.md`, кроме случаев, когда issue 08 уже задал обязательный inventory reference формат.
- [x] Не реализовывать новые runtime cards.
- [x] `git diff --check` проходит.

## Blocked by

- `.scratch/krutagidon-card-runtime-clusters/issues/08-create-mechanic-cluster-map-guardrails.md`

## Notes

- Candidate mechanic из inventory не является cluster decision.
- В inventory одна карта может быть в нескольких candidate buckets.
- В финальном `card-cluster-decisions.json` у карты позже должен остаться ровно один основной `clusterId`.
