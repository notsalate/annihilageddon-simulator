Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать card-movement получения и передачи карт

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Добавить в PR `card-movement`:

- `esw2_dbg__wizard_property_006`;
- `esw2_dbg__dead_wizard_token_006`;
- `esw2_dbg__dead_wizard_token_010`.

## Acceptance criteria

- [ ] Свойство 006 после получения Твари или effective Legend-Creature предлагает оставить обычное назначение либо положить карту на верх своей колоды.
- [ ] Обязательное fixed-discard назначение нельзя перенаправить свойством.
- [ ] DWT 006 сначала выбирает врага, затем через seeded RNG переносит случайную карту из собственного сброса в сброс врага со сменой владельца; пустой источник не расходует RNG.
- [ ] DWT 010 в порядке рассадки даёт каждому врагу отдельный optional выбор Знака из собственной руки или сброса и переносит выбранную карту в руку получателя со сменой владельца.
- [ ] Пустая зона не создаёт невозможного выбора, а choice events принадлежат фактическому выбирающему игроку.
- [ ] Все переходы используют общий gain/movement pipeline и Control Ledger.
- [ ] Тесты загружают реальные определения и покрывают decline, fixed-discard, empty source, ownership и порядок нескольких врагов.

## Blocked by

- `55-implement-wizard-property-familiar-types.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Этот issue входит в один PR `card-movement` вместе с GitHub issues #280-286 и issues 63-64; внутри PR выполняется первым из cross-source срезов.
