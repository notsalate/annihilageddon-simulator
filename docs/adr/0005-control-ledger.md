---
id: ADR-0005
title: Control Ledger для контроля и физических зон
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0005: Control Ledger для контроля и физических зон

## Контекст

Контроль объекта, ownership и физическое расположение карточной instance — разные свойства. Объекты находятся и в array-зонах, и в singleton-зонах, а временный контроль может пережить один этап действия. Consumers, scoring и state fork должны видеть один и тот же inventory.

## Решение

`Control Ledger` владеет relation controller-to-object и descriptor inventory всех физических card locations. Queries, lookup, removal, cloning и temporary-control lifecycle проходят через Ledger. Consumers не перечисляют зоны вручную и не создают параллельные inventories.

Ownership остаётся отдельным от control. Control не является игровой зоной: объект физически находится ровно в одной зоне, а controller определяется отдельно. `Control Ledger` хранит и очищает временный контроль, учитывая timing policy вызывающего operation.

## Альтернативы

- Пусть каждый consumer сканирует нужные поля `GameState`. Текущие guards и history показывают отсутствие параллельных inventories; обсуждался ли такой вариант исторически, неизвестно.
- Представить control как ещё одну физическую zone. Текущая модель и Rules Canon разделяют relation и location; дата и исходная мотивация неизвестны.
- Хранить отдельный общий массив всех controlled objects. Ledger использует descriptors поверх реальных зон; неизвестно, рассматривался ли такой вариант исторически.

## Причины выбора

Descriptor inventory даёт единую точку для array/singleton зон и позволяет сохранить физическое расположение при cloning и removal. Разделение ownership и control отражает правила игры и не заставляет временный контроль менять владельца объекта.

## Последствия

### Положительные

- Scoring, fork, trigger discovery и modifier queries используют одинаковое множество объектов и порядок.
- Новая физическая зона требует одного descriptor и соответствующих Ledger checks, а не ручной миграции всех consumers.
- Stale temporary-control references можно обработать в одном месте.

### Отрицательные

- Любой новый consumer должен знать Ledger seam вместо чтения удобного массива напрямую.
- Descriptor registry и guards требуют поддерживать список физических зон.
- Смешение ownership и control становится недопустимым даже в простых fixtures.

## Доказательства

- [Control Ledger](../../src/engine/control-ledger.ts) владеет descriptors, queries и temporary control.
- [Ledger tests](../../tests/control-ledger.test.ts) и [zone tests](../../tests/control-ledger-zones.test.ts) проверяют relation и физические зоны.
- [Engine typed-access guard](../../scripts/check-engine-typed-access.mjs) проверяет Ledger ownership и запрещает ручной inventory обход.
- [Game state fork](../../src/engine/game-state-fork.ts) использует Ledger для cloning physical card zones.
- [Rules Canon](../rules-canon.md) отделяет ownership, control и zone.
- [Введение единого реестра контроля](https://github.com/notsalate/annihilageddon-simulator/commit/7338c3a), [перевод consumers](https://github.com/notsalate/annihilageddon-simulator/commit/3ee639a) и [удаление параллельных inventories](https://github.com/notsalate/annihilageddon-simulator/commit/933c349) подтверждают правило.
