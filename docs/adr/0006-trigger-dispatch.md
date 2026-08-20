---
id: ADR-0006
title: Trigger Dispatch для контролируемых объектов
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0006: Trigger Dispatch для контролируемых объектов

## Контекст

Эффекты контролируемых карт могут срабатывать при разных timing: on-play, after-attack и end-turn. Для них важны порядок Control Ledger, ongoing eligibility, source attribution, runtime mode, error semantics и terminal game result. Если каждый caller собирает discovery самостоятельно, эти условия расходятся.

## Решение

`Trigger Dispatch` принимает `GameState`, controller и discriminated typed operation. Внутри одной границы он строит controlled view через Control Ledger, выбирает timing и policy, создаёт source identity, вызывает Effect Runtime Catalog operation и возвращает typed result.

Applicability и catalog operation не передаются caller-ом как raw predicate/executor. Discovery сохраняет стабильный Ledger order, non-ongoing cards не получают ongoing triggers, а первая ошибка или `gameEnd` останавливает дальнейшую aggregation. End-turn operation возвращает typed aggregate, а не список raw effects.

## Альтернативы

- Дать каждому caller список raw effects и позволить ему выбирать timing/applicability. Текущая ownership boundary исключает этот вариант; первоначальная мотивация неизвестна.
- Дублировать trigger discovery в `effect-runtime.ts`, `actions.ts` и handlers. История показывает консолидацию в dispatcher, но не восстанавливает исходные обсуждения.
- Продолжать aggregation после первой ошибки или terminal result. Тесты требуют остановки; историческая дата выбора неизвестна.

## Причины выбора

Одна operation boundary удерживает discovery, timing, source identity и Catalog call в одном порядке. Caller получает только typed result и не может случайно обойти ongoing policy или скрыть malformed payload под `notApplicable`.

## Последствия

### Положительные

- События и эффекты контролируемых объектов разрешаются в предсказуемом порядке.
- Source attribution и ownership сохраняются через on-play и after-attack operations.
- Error и terminal semantics единообразны для всех dispatcher consumers.

### Отрицательные

- Новая операция требует расширить typed dispatcher и Catalog hook.
- Caller-ам нельзя использовать удобный raw callback для локального исключения из policy.
- Изменение timing policy затрагивает общий pipeline, а не одну карту.

## Доказательства

- [Trigger Dispatch](../../src/engine/trigger-dispatch.ts) владеет controlled-card operations.
- [Основные dispatch tests](../../tests/trigger-dispatch.test.ts), [ongoing tests](../../tests/trigger-dispatch-ongoing.test.ts) и [error tests](../../tests/trigger-dispatch-errors.test.ts) проверяют порядок и typed errors.
- [Engine typed-access guard](../../scripts/check-engine-typed-access.mjs) проверяет Trigger Dispatch ownership.
- [Архитектурная спецификация](../superpowers/specs/2026-07-20-engine-architecture-deepening-design.md) описывает dispatcher candidate и его границы.
- [Введение dispatcher контролируемых карт](https://github.com/notsalate/annihilageddon-simulator/commit/70fe2f5), [централизация end-turn discovery](https://github.com/notsalate/annihilageddon-simulator/commit/82087b8) и [перенос catalog execution](https://github.com/notsalate/annihilageddon-simulator/commit/2b0c860) подтверждают действующее правило.
