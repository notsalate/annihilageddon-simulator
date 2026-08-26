Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать life-total-effects свойства и ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Закрыть cross-source follow-up `life-total-effects` для:

- `esw2_dbg__wizard_property_010`;
- `esw2_dbg__dead_wizard_token_013`;
- `esw2_dbg__dead_wizard_token_014`;
- `esw2_dbg__dead_wizard_token_019`;
- `esw2_dbg__dead_wizard_token_025`.

## Acceptance criteria

- [ ] Свойство 010 даёт главный приз, первый ход и 25 стартовых/воскресительных жизней, но лошара остаётся ограничен 15.
- [ ] DWT 013 после воскрешения и полного завершения вызвавшей смерть атаки/эффекта наносит ownerless урон, равный числу чипсин получателя.
- [ ] DWT 014 наносит `4 ×` число выбранных effective Legends в собственном сбросе.
- [ ] DWT 019 после воскрешения и полного завершения вызвавшей смерть атаки/эффекта требует выбрать другого игрока и меняет текущие жизни; pass/self запрещены, равные значения допустимы.
- [ ] DWT 025 раскрывает руку и наносит ownerless урон по наибольшей effective cost; пустая рука даёт 0.
- [ ] Лица DWT 013/014/019/025 запускаются общей очередью после вызвавшей выдачу атаки/эффекта и до продолжения внешней карты.
- [ ] DWT damage не перемещает главный приз, а повторная смерть запускает новый DWT cycle.
- [ ] Тесты покрывают Dingler cap, property 003 type choices, empty hand и рекурсивную смерть.

## Blocked by

- `54-implement-cross-source-dingler-runtime.md`
- `55-implement-wizard-property-familiar-types.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Один PR `life-total-effects` follow-up.
