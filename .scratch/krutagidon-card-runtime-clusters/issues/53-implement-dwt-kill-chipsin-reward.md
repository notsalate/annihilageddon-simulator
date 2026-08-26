Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #304. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Реализовать награду убийце от ЖДК 017

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Довести `esw2_dbg__dead_wizard_token_017` до `crossSourceComplete` через общий chipsin handler и typed death attribution.

## Acceptance criteria

- [ ] При смерти от игрока этот игрок получает 2 чипсины из лица DWT 017 после полного завершения вызвавшей смерть атаки/эффекта и до следующей отдельной атаки той же карты.
- [ ] При player-attributed самоубийстве игрок получает 2 чипсины, хотя главный приз не перемещается.
- [ ] Смерть от ЖДК, обычного Market Flow event или другого ownerless источника не даёт награду.
- [ ] Прямая, вложенная, переданная или обменённая выдача DWT 017 не наследует прежнего убийцу.
- [ ] Используется raw kill attribution из общего DWT acquisition context, а не состояние главного приза.
- [ ] Реальное определение и focused tests добавлены в тот же PR, что issue 52.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
- `50-fix-death-dwt-resolution-order.md`
- `51-implement-cross-source-scoring-runtime.md`

## Delivery

Один PR `chipsin-economy` follow-up вместе с issue 52; внутри PR выполняется после базовых chipsin faces.
