---
id: ADR-0003
title: Воспроизводимость и граница Analyzer
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0003: Воспроизводимость и граница Analyzer

## Контекст

Симулятор должен воспроизводить один и тот же seeded запуск, а анализатор текущего хода должен исследовать варианты, не превращаясь в стратегию игрока. Для этого нужны разные права на RNG, состояние и информацию.

## Решение

Игровой движок использует seeded RNG. `fork()` создаёт независимую ветку с текущей позицией исходного RNG и не продвигает исходную игру. Когда правило оставляет выбор без стратегического решения, baseline выбирает первый legal option в стабильном engine order.

`Strategy` принимает решения только за игрока на основе разрешённых действий и доступной ему информации. `Best-Move Analyzer` остаётся отдельным analysis component: он может получить полное состояние, включая hidden information, fork-нуть seeded RNG, перечислить legal lines текущего хода и применить criterion, переданный caller. Analyzer не меняет effect resolution, `listLegalActions` или универсальное понятие лучшего хода.

## Альтернативы

- Поместить Analyzer внутрь `BotStrategy` и дать ему те же права, что игроку. Действующий код и документация разделяют эти поверхности; исходные мотивы выбора неизвестны.
- Использовать случайный fallback для невыбранного legal choice. Текущий stable order и тесты подтверждают другой контракт; историческая дата решения неизвестна.
- Разрешить Analyzer продвигать общий RNG или изменять effect resolution при переборе. Текущий fork и analysis boundary исключают это; неизвестно, обсуждался ли вариант первоначально.

## Причины выбора

Seeded RNG делает результаты проверяемыми, а fork позволяет исследовать альтернативы без побочных эффектов для исходной партии. Отдельная граница Analyzer не смешивает hidden-state analysis с моделью реального игрока и не заставляет engine выбирать критерий «лучшего» хода.

## Последствия

### Положительные

- Одинаковые seed и входы дают воспроизводимые sequences, tests и simulation reports.
- Analyzer может перебирать варианты, не загрязняя исходное состояние и RNG.
- Стратегии остаются моделями legal player decisions без доступа к будущему RNG и hidden opponent state.

### Отрицательные

- Новые случайные операции должны проходить через seeded RNG и учитывать fork semantics.
- Сравнение Analyzer требует явно переданного evaluation criterion.
- Полная многотуровая аналитика не появляется автоматически из текущей границы одного turn.

## Доказательства

- [CONTEXT.md](../../CONTEXT.md) определяет `Strategy` и `Best-Move Analyzer` как разные компоненты.
- [Rules Canon](../rules-canon.md) фиксирует baseline deterministic choice и ограничение Analyzer.
- [seeded RNG](../../src/engine/rng.ts) предоставляет repeatable sequence и `fork()`.
- [Analyzer](../../src/engine/best-move-analysis.ts) и [analysis policies](../../src/engine/best-move-policies.ts) отделены от player strategies.
- [RNG tests](../../tests/rng.test.ts) и [Analyzer tests](../../tests/best-move-analysis.test.ts) проверяют воспроизводимость и fork boundary.
- [README](../../README.md) описывает `analyze:best-move` как отдельный инструмент анализа текущего хода.
