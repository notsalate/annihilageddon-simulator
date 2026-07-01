Status: Done
Label: ready-for-agent
Type: AFK

# Назначить mechanic clusters для второй половины карт

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Назначить финальный `clusterId` для второй половины карт из `card-cluster-decisions.json` в текущем порядке и довести всю cluster taxonomy до проверяемого состояния.

Это planning slice: нужно глубоко разобрать каждую карту из списка, выбрать ровно один основной кластер по `mechanic-clusters.md` и правилам `.scratch/krutagidon-card-runtime-clusters/AGENTS.md`, либо оставить `needsClusterDecision` с короткой причиной в `notes`, если текущие кластеры не подходят.

Перед назначениями использовать synthesis artifact `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md`. Он подтверждает текущий two-batch split, перечисляет normalized candidate mechanics, secondary-only mechanics и ambiguous/mixed cards.

Не полагаться только на summary buckets или название карты. Для каждой карты нужно сверить её inventory entry, canonical draft/source text и зафиксированные blockers/ambiguity.

## Card IDs

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

## Acceptance criteria

- [x] Для каждой карты из списка прочитана её точная запись в `inventory/01.md`-`inventory/05.md`.
- [x] Прочитан `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md`, включая `Ambiguous Or Mixed Cards` и `Follow-Up Notes For Issues 15 And 16`.
- [x] Для каждой карты из списка сверены canonical draft/source text; summary buckets не используются как единственный источник решения.
- [x] Для каждой ambiguous/mixed карты решение явно учитывает competing mechanics из inventory entry.
- [x] Для каждой карты выбран ровно один основной `clusterId`, если текущая taxonomy подходит.
- [x] Если ни один текущий кластер не подходит, карта остаётся или переводится в `status: "needsClusterDecision"` с коротким `notes`, где названа причина.
- [x] Для спорного, но назначенного случая `notes` кратко объясняет, почему выбран именно этот кластер.
- [x] Не добавлять новые кластеры без явного follow-up notes; если найден реальный taxonomy gap, оставить карту `needsClusterDecision` и описать gap.
- [x] Не назначать clusterId картам вне списка этого issue, кроме точечных исправлений явных ошибок из issue 15 с notes.
- [x] После batch 02 финальный набор `mechanic-clusters.md` и `card-cluster-decisions.json` согласован: нет использованных `clusterId` без heading и нет лишних unused headings.
- [x] Не реализовывать runtime cards.
- [x] `npm run report:card-runtime-clusters` проходит.
- [x] Если matrix должна обновиться после решений, выполнен `npm run report:card-runtime-clusters -- --write`.
- [x] `git diff --check` проходит.

## Blocked by

Нет — issue 15 закрыт.

## Notes

- Issue 14 created `.scratch/krutagidon-card-runtime-clusters/inventory/merged.md` and confirmed this issue's explicit `cardId` batch.
- Mayhem/Mega-Mayhem не являются автоматическим кластером. Если главная механика карты — рынок, атака, Dingler, chipsins, card movement или другая конкретная поверхность, выбирать её, а Mayhem/Mega-Mayhem оставлять implementation note.
- Выбор и random не являются отдельными кластерами; они остаются notes внутри главной механики.
- Подтверждение: в `.scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json` назначены все 64 карты issue 16; `needsClusterDecision` стал `0`.
- Matrix обновлена командой `npm run report:card-runtime-clusters -- --write`.
- Проверки: `npm run report:card-runtime-clusters` прошёл; `npm run report:card-runtime-clusters -- --write` прошёл; `npm test` прошёл; `git diff --check` прошёл.
