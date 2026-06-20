Status: wontfix
Label: wontfix
Category: enhancement
Type: HITL

# Вернуться к in-memory Runtime Data Adapter при появлении production consumer

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/10-decide-in-memory-runtime-data-adapter.md`

## What to build

Не начинать production in-memory Runtime Data Adapter без реального production consumer.

Вернуться к архитектурному решению, когда появится второй runtime data source вне тестов: UI/editor, sandbox, strategy runner, DB/API-backed runtime data или другой сценарий, который должен создавать/provide runtime data без filesystem loader.

## Acceptance criteria

- [x] Назван конкретный production consumer вне tests. N/A: такого consumer сейчас нет.
- [x] Описано, почему `initializeGame({ dataPack })` недостаточно для этого consumer. N/A: consumer не найден.
- [x] Описан контракт adapter: вход, выход, ownership validation/errors. N/A: adapter сейчас не нужен.
- [x] Решено, должен ли adapter жить в production code, tests helpers или отдельном runtime-data module. N/A: не добавлять adapter.
- [x] Если adapter нужен, создан AFK follow-up с узким vertical slice. N/A: adapter сейчас не нужен.

## Blocked by

- Нужен конкретный production consumer вне tests.

## Decision

Закрыть как `wontfix` сейчас.

Production in-memory Runtime Data Adapter не реализовывать, пока нет конкретного production consumer вне tests. Возможные будущие consumer: UI/editor, sandbox, strategy runner, DB/API-backed runtime data, import preview или балансировочный инструмент. Сейчас ни один из них не является активной задачей.

Если такой consumer появится, сначала нужно описать его сценарий и проверить, хватает ли прямой сборки `LoadedDataPack` с передачей в `initializeGame({ dataPack })`. Adapter стоит проектировать только если этого интерфейса реально недостаточно.

## Triage Notes

- Issue 10 уже зафиксировал основное решение: production adapter сейчас не нужен.
- Issues 11-13 закрыли текущие test ergonomics через tests-only helpers и setup-sensitive `LoadedDataPack`.
- Делать production consumer только ради оправдания adapter не нужно.
- Новый follow-up стоит создавать только от конкретного user-facing или runtime сценария.
