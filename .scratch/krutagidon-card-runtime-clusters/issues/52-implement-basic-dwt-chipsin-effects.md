Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать базовые chipsin-effects ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Реализовать первый конкретный DWT acquisition slice для:

- `esw2_dbg__dead_wizard_token_012`;
- `esw2_dbg__dead_wizard_token_015`;
- `esw2_dbg__dead_wizard_token_021`.

## Acceptance criteria

- [ ] Общий DWT acquisition adapter восстанавливает умершего, прикрепляет и раскрывает жетон, а его mapped face effect запускает после завершения вызвавшей смерть атаки/эффекта и до продолжения внешней карты.
- [ ] Adapter вызывает Effect Runtime Catalog с точной `deadWizardToken` source-kind/timing policy и не содержит `switch` по ID.
- [ ] DWT 012 выдаёт по 1 чипсине каждому врагу в порядке рассадки, исключая получателя.
- [ ] DWT 015 выдаёт 1 чипсину получателю жетона.
- [ ] DWT 021 теряет `Math.ceil(chipsBefore / 2)`; это не optional cost.
- [ ] Вложенная или прямая выдача ЖДК не запускает воскрешение и не наследует старую причину смерти.
- [ ] Несколько полученных ЖДК разрешают лица в порядке получения; лицо вложенного ЖДК ждёт завершения текущего лица.
- [ ] Опустевшая стопка завершает игру только на следующей start-of-turn проверке.
- [ ] Лица добавлены в композицию по одному; тесты используют реальные runtime-определения.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
- `51-implement-cross-source-scoring-runtime.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Этот issue входит в один PR `chipsin-economy` follow-up вместе с issue 53; внутри PR реализуется первым.
