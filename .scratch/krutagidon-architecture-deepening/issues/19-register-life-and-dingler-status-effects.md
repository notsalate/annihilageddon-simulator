Status: Done
Label: ready-for-agent
Type: AFK

# Перенести life и Dingler status effects в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести Runtime Effect ID `heal`, `set_life`, `gain_status`, `remove_status` и `toggle_status` в Effect Runtime Catalog.

Срез должен сохранить различие Healing и Set Life, Target Resolution для player targets, Dingler status gain/remove/toggle behavior, Effective Value последствия Dingler и текущие event log entries. Mega Mayhem variants остаются для отдельной Mayhem-задачи.

## Acceptance criteria

- [x] `heal`, `set_life`, `gain_status`, `remove_status` и `toggle_status` регистрируются в Effect Runtime Catalog.
- [x] Validation отклоняет invalid healing amount, invalid life total, non-player target и неподдержанный status.
- [x] Healing продолжает лечить до текущего max life, не переписывая Effective Value logic.
- [x] Set Life может понижать или повышать current life согласно текущему behavior.
- [x] Dingler gain/remove/toggle сохраняют max life и VP последствия через существующий Effective Value path.
- [x] Focused tests покрывают heal, set life, gain/remove/toggle Dingler и invalid shape.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
