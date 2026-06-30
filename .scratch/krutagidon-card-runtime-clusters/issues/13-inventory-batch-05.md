Status: Ready
Label: ready-for-agent
Type: AFK

# Инвентаризировать mechanics batch 05

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Провести черновую mechanics inventory для пятого batch карт из текущего card runtime backlog.

Для каждой карты из списка нужно прочитать draft/source text, выписать candidate primary mechanics, secondary mechanics и явные blockers. Это не финальная кластеризация: одна карта может попасть в несколько candidate buckets, а финальный `clusterId` в `card-cluster-decisions.json` в этом issue не назначается.

## Card IDs

- `esw2_dbg__main_066`
- `esw2_dbg__main_067`
- `esw2_dbg__main_068`
- `esw2_dbg__main_069`
- `esw2_dbg__main_070`
- `esw2_dbg__main_071`
- `esw2_dbg__main_072`
- `esw2_dbg__main_073`
- `esw2_dbg__main_074`
- `esw2_dbg__main_075`
- `esw2_dbg__main_076`
- `esw2_dbg__main_077`
- `esw2_dbg__main_078`
- `esw2_dbg__mega_mayhem_001`
- `esw2_dbg__mega_mayhem_002`
- `esw2_dbg__mega_mayhem_003`
- `esw2_dbg__mega_mayhem_004`
- `esw2_dbg__mega_mayhem_005`
- `esw2_dbg__mega_mayhem_006`
- `esw2_dbg__mega_mayhem_007`
- `esw2_dbg__starter_001`
- `esw2_dbg__starter_002`
- `esw2_dbg__starter_003`
- `esw2_dbg__starter_004`
- `esw2_dbg__wild_magic`

## User stories covered

- 14. Generated runtime cards based on import drafts/source text.
- 15. Block C card implementation deferred until Block A and Block B are finished.

## Acceptance criteria

- [ ] Создан или обновлён `.scratch/krutagidon-card-runtime-clusters/inventory/05.md`.
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
