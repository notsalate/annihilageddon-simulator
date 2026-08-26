Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать Ongoing-модификаторы ЖДК 016 и 020

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Довести до `crossSourceComplete`:

- `esw2_dbg__dead_wizard_token_016`;
- `esw2_dbg__dead_wizard_token_020`.

## Acceptance criteria

- [ ] Ongoing discovery находит эффекты контролируемых DWT через Catalog, не маскируя жетоны под карты.
- [ ] DWT 016 добавляет 4 урона к наносящей урон карте с `wandAttackCard`, сыгранной текущим контроллером жетона, включая чужую палочку.
- [ ] Модификатор пересчитывается для redirect leg и не зависит от локализованного имени карты.
- [ ] DWT 016 хранит полный итог `victoryPoints: -7`.
- [ ] DWT 020 подавляет end-turn chipsin за главный приз через общий modifier-aware trophy payout seam.
- [ ] DWT 020 не отключает владение, передачу или другие свойства главного приза.
- [ ] Реальные определения, композиция и focused tests покрывают foreign Wand, redirect и смену контролёра приза.

## Blocked by

- `50-fix-death-dwt-resolution-order.md`
- `51-implement-cross-source-scoring-runtime.md`

## Delivery

Один PR `ongoing-modifiers` follow-up вместе с issues 55-56; внутри PR выполняется последним.
