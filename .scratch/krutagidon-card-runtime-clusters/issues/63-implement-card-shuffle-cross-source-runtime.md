Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать card-movement массовых выборов и замешивания

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Добавить в PR `card-movement`:

- `esw2_dbg__dead_wizard_token_008`;
- `esw2_dbg__dead_wizard_token_009`;
- `esw2_dbg__dead_wizard_token_011`.

## Acceptance criteria

- [ ] DWT 008 сначала разрешает per-Familiar effective Legend choices, переносит все выбранные Легенды из руки в собственную колоду и один раз перемешивает итоговую колоду через seeded RNG.
- [ ] Пустой выбор DWT 008 не расходует RNG.
- [ ] DWT 009 переносит в колоду только активные Постоянки, которыми получатель одновременно владеет и управляет; чужие временно контролируемые карты не перемещаются.
- [ ] После DWT 009 control metadata очищена, владелец сохранён, итоговая колода один раз перемешана.
- [ ] DWT 011 сначала собирает решения врагов в порядке рассадки, затем получатель обязательно выбирает `min(yesCount, handSize)` карт для сброса.
- [ ] Пустые зоны не создают невозможных выборов; решение каждого врага записано за этим врагом.
- [ ] Реальные определения и focused tests покрывают mixed Familiar choices, чужую Постоянку, пустые зоны и стабильный RNG.

## Blocked by

- `55-implement-wizard-property-familiar-types.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Этот issue входит в один PR `card-movement` вместе с GitHub issues #280-286 и issues 62, 64; внутри PR выполняется после issue 62.
