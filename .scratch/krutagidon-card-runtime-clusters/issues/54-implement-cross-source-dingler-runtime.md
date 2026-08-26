Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #305. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Реализовать dingler-status для свойства и ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Закрыть cross-source follow-up `dingler-status` для:

- `esw2_dbg__wizard_property_001`;
- `esw2_dbg__dead_wizard_token_007`;
- `esw2_dbg__dead_wizard_token_026`;
- `esw2_dbg__dead_wizard_token_027`;
- `esw2_dbg__dead_wizard_token_028`.

## Acceptance criteria

- [ ] Свойство 001 после получения Волшебника даёт 1 чипсину и только лошаре предлагает typed выбор снять статус.
- [ ] DWT 007 предлагает убийце-лошаре снять собственный статус; без смерти или убийцы эффект ничего не делает.
- [ ] DWT 007 переиспользует typed death attribution из chipsin follow-up, не выводит убийцу из состояния главного приза.
- [ ] DWT 026 делает получателя лошарой и удваивает только активный вклад статуса при scoring: `-5 → -10`, после инверсии `+5 → +10`.
- [ ] DWT 027 проверяет исходный статус: нормальный становится лошарой, лошара получает и полностью разрешает ещё один ЖДК без новой смерти/воскрешения.
- [ ] DWT 028 становится лошарой из нормального состояния и снимает статус с уже бывшего лошарой.
- [ ] Все status mutations используют общий typed module; DWT acquisition adapter только передаёт контекст.
- [ ] Тесты покрывают apply/decline, отсутствие killer context, пустую DWT stack, recursion и scoring после снятия статуса.

## Blocked by

- `53-implement-dwt-kill-chipsin-reward.md`
- `51-implement-cross-source-scoring-runtime.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Один PR `dingler-status` follow-up.
