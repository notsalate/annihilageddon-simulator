Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #312. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Реализовать вложенные лица ЖДК 022 и 023

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Добавить в PR `dwt-interactions` полные runtime-эффекты:

- `esw2_dbg__dead_wizard_token_022`;
- `esw2_dbg__dead_wizard_token_023`.

## Acceptance criteria

- [ ] DWT 022 смотрит верхнюю карту Main Deck без Market Flow, уничтожения, замены или изменения порядка и получает ещё один ЖДК только если это Беспредел.
- [ ] DWT 023 при необходимости пополняет личную колоду из сброса, смотрит её верхнюю карту без перемещения и получает ещё один ЖДК только если она считается Легендой.
- [ ] Для Фамильяра DWT 023 использует typed effective-type choice владельца.
- [ ] Вложенно полученный ЖДК прикрепляется сразу, но его лицо выполняется после завершения текущего лица по общей FIFO-очереди.
- [ ] Вложенное получение не вызывает смерть или воскрешение и не наследует death/kill context.
- [ ] Пустая DWT stack прекращает выдачу, но завершает игру только на следующей start-of-turn проверке.
- [ ] Runtime composition и focused tests используют реальные определения и покрывают обе ветки каждого лица, refill и stack exhaustion.

## Blocked by

- `50-fix-death-dwt-resolution-order.md`
- `55-implement-wizard-property-familiar-types.md`

## Delivery

Этот issue входит в один PR `dwt-interactions` вместе с GitHub issues #274-279.
