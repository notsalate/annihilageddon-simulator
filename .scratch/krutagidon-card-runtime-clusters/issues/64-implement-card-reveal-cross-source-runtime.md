Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #315. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Реализовать card-movement раскрытия и уничтожения от ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Добавить `esw2_dbg__dead_wizard_token_024` в PR `card-movement` через общий reveal/destroy pipeline.

## Acceptance criteria

- [ ] Получатель раскрывает верхнюю карту собственной колоды; при необходимости колода сначала пополняется из сброса через seeded RNG.
- [ ] Typed optional choice позволяет уничтожить именно раскрытую карту или отказаться.
- [ ] Отказ оставляет ту же карту наверху; согласие перемещает её в каноническое destroy destination с сохранением provenance владельца.
- [ ] Видимость раскрытой карты заканчивается в обеих ветках и не требует отдельного постоянного face-up state.
- [ ] Пустые колода и сброс дают полный no-op без невозможного выбора.
- [ ] Реальное определение, composition и focused tests покрывают accept, decline, refill и empty source.

## Blocked by

- `50-fix-death-dwt-resolution-order.md`

## Delivery

Этот issue входит в один PR `card-movement` вместе с GitHub issues #280-286 и issues 62-63; внутри PR выполняется после issue 62.
