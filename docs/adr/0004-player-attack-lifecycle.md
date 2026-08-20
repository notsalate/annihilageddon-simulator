---
id: ADR-0004
title: Жизненный цикл обычной атаки
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0004: Жизненный цикл обычной атаки

## Контекст

Обычная player-controlled атака затрагивает target resolution, defense, redirect, damage, immediate death consequences, attribution, outcome branches и after-attack triggers. Ошибка или частично применённая защита не должны оставлять половину правила в состоянии игры. Mayhem и Mega Mayhem имеют отдельный двухфазный flow.

## Решение

`Attack Resolution` владеет полным lifecycle обычной атаки через единый intent seam. Он строит стабильный target plan, создаёт attack instrumentation только после успешного непустого target resolution, затем последовательно завершает каждую цель: Defense/redirect, impact, damage/death, branches и attribution. После всех целей он запускает after-attack operations и возвращает typed execution result.

`attack-defense.ts` остаётся transactional submodule. Он рассчитывает immutable payment plan, применяет payment/movement/branch effects внутри snapshot boundary и откатывает costs, zones, usage sets, events и RNG при ошибке. Redirect возвращается в `Attack Resolution` через callback lifecycle-owner. Mayhem и Mega Mayhem не сворачиваются в ordinary player-controlled resolver.

## Альтернативы

- Оставить target loop и attribution распределёнными по effect runtime и handler-ам. Текущая структура и guards показывают, что сейчас используется единый lifecycle-owner; обсуждался ли иной вариант исторически, неизвестно.
- Разрешать Defense payment, movement и branch effects отдельными мутациями без rollback. Тесты snapshot подтверждают текущую атомарную границу; исходная история выбора неизвестна.
- Использовать ordinary attack lifecycle для Mayhem и Mega Mayhem. Rules Canon и текущие flow разделяют их; неизвестно, рассматривался ли вариант при принятии решения.

## Причины выбора

Единый владелец lifecycle сохраняет порядок событий и текущий attacker/source через redirect, а transactional Defense не допускает частичного применения branch. Раздельный Mayhem flow не заставляет одну модель одновременно описывать два разных доменных процесса.

## Последствия

### Положительные

- Порядок `attackCreated`, target lifecycle, damage/death и after-attack observable и проверяем.
- Ошибка Defense возвращает состояние к границе до первой мутации.
- Новые обычные attack effects подключаются через intent и узкие adapters, не забирая target loop из lifecycle-owner.

### Отрицательные

- Attack changes требуют согласовывать несколько typed contexts и snapshot contracts.
- Mayhem и ordinary attack нельзя бездумно объединять ради повторного использования кода.
- Сложные redirect и multi-target сценарии требуют точечных тестов на порядок и attribution.

## Доказательства

- [Attack Resolution](../../src/engine/attack-resolution.ts) владеет target lifecycle и after-attack aggregation.
- [Defense transaction](../../src/engine/attack-defense.ts) владеет payment, movement и rollback.
- [Attack tests](../../tests/attack-resolution.test.ts), [ordering tests](../../tests/attack-resolution-ordering.test.ts) и [snapshot tests](../../tests/attack-defense-snapshot.test.ts) проверяют границы.
- [Rules Canon](../rules-canon.md) отделяет обычную атаку, Defense и Mayhem flow.
- [Архитектурная спецификация](../superpowers/specs/2026-07-20-engine-architecture-deepening-design.md) описывает lifecycle как отдельный кандидат, а не как исторический мотив.
- [Передача полного lifecycle в Attack Resolution](https://github.com/notsalate/annihilageddon-simulator/commit/63cc11b) и [атомарное разрешение Defense](https://github.com/notsalate/annihilageddon-simulator/commit/9f051e4) подтверждают действующие seams.
