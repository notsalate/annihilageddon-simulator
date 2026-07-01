Status: Done
Label: ready-for-agent
Type: AFK

# Назначить mechanic clusters для первой половины карт

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Назначить финальный `clusterId` для первой половины карт из `card-cluster-decisions.json` в текущем порядке.

Это planning slice: нужно глубоко разобрать каждую карту из списка, выбрать ровно один основной кластер по `mechanic-clusters.md` и правилам `.scratch/krutagidon-card-runtime-clusters/AGENTS.md`, либо оставить `needsClusterDecision` с короткой причиной в `notes`, если текущие кластеры не подходят.

Перед назначениями использовать synthesis artifact `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md`. Он подтверждает текущий two-batch split, перечисляет normalized candidate mechanics, secondary-only mechanics и ambiguous/mixed cards.

Не полагаться только на summary buckets или название карты. Для каждой карты нужно сверить её inventory entry, canonical draft/source text и зафиксированные blockers/ambiguity.

## Card IDs

- `esw2_dbg__familiar_001`
- `esw2_dbg__familiar_002`
- `esw2_dbg__familiar_003`
- `esw2_dbg__familiar_004`
- `esw2_dbg__familiar_005`
- `esw2_dbg__familiar_006`
- `esw2_dbg__familiar_007`
- `esw2_dbg__familiar_008`
- `esw2_dbg__familiar_009`
- `esw2_dbg__familiar_010`
- `esw2_dbg__legend_001`
- `esw2_dbg__legend_002`
- `esw2_dbg__legend_003`
- `esw2_dbg__legend_004`
- `esw2_dbg__legend_005`
- `esw2_dbg__legend_006`
- `esw2_dbg__legend_007`
- `esw2_dbg__legend_008`
- `esw2_dbg__legend_009`
- `esw2_dbg__legend_010`
- `esw2_dbg__legend_011`
- `esw2_dbg__legend_012`
- `esw2_dbg__legend_013`
- `esw2_dbg__legend_014`
- `esw2_dbg__legend_015`
- `esw2_dbg__legend_016`
- `esw2_dbg__legend_017`
- `esw2_dbg__legend_018`
- `esw2_dbg__legend_019`
- `esw2_dbg__legend_020`
- `esw2_dbg__legend_027`
- `esw2_dbg__legend_028`
- `esw2_dbg__legend_029`
- `esw2_dbg__legend_030`
- `esw2_dbg__legend_031`
- `esw2_dbg__legend_032`
- `esw2_dbg__legend_033`
- `esw2_dbg__limp_wand`
- `esw2_dbg__main_001`
- `esw2_dbg__main_002`
- `esw2_dbg__main_003`
- `esw2_dbg__main_004`
- `esw2_dbg__main_005`
- `esw2_dbg__main_006`
- `esw2_dbg__main_007`
- `esw2_dbg__main_008`
- `esw2_dbg__main_009`
- `esw2_dbg__main_010`
- `esw2_dbg__main_011`
- `esw2_dbg__main_012`
- `esw2_dbg__main_013`
- `esw2_dbg__main_014`
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

## Acceptance criteria

- [x] Для каждой карты из списка прочитана её точная запись в `inventory/01.md`-`inventory/05.md`.
- [x] Прочитан `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md`, включая `Ambiguous Or Mixed Cards` и `Follow-Up Notes For Issues 15 And 16`.
- [x] Для каждой карты из списка сверены canonical draft/source text; summary buckets не используются как единственный источник решения.
- [x] Для каждой ambiguous/mixed карты решение явно учитывает competing mechanics из inventory entry.
- [x] Для каждой карты выбран ровно один основной `clusterId`, если текущая taxonomy подходит.
- [x] Если ни один текущий кластер не подходит, карта остаётся или переводится в `status: "needsClusterDecision"` с коротким `notes`, где названа причина.
- [x] Для спорного, но назначенного случая `notes` кратко объясняет, почему выбран именно этот кластер.
- [x] Не добавлять новые кластеры без явного follow-up notes; если найден реальный taxonomy gap, оставить карту `needsClusterDecision` и описать gap.
- [x] Не назначать clusterId картам вне списка этого issue.
- [x] Не реализовывать runtime cards.
- [x] `card-cluster-decisions.json` остаётся валидным JSON.
- [x] `git diff --check` проходит.

## Blocked by

Нет — issue 14 закрыт.

## Notes

- Полный `npm run report:card-runtime-clusters` может оставаться красным после этого slice, если часть final cluster headings ещё не используется до batch 02. Финальную report-проверку делает issue 16.
- Issue 16 продолжает со второй половиной списка и закрывает полную валидацию.
- Issue 14 создал `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md` и подтвердил явный `cardId` batch для этого issue.
- Подтверждение: в `.scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json` назначены ровно 64 карты из issue; все карты вне issue 15 остались `needsClusterDecision`.
- Проверка: JSON parse прошёл; focused issue-15 decision invariant прошёл; `git diff --check` прошёл.
- Не запускалось: `npm run report:card-runtime-clusters` — финальный report gate относится к issue 16, а issue 15 намеренно оставляет batch 02 без назначений.
