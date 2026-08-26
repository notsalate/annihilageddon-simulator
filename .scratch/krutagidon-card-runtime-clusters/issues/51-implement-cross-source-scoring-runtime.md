Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать scoring-effects для ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Закрыть cross-source follow-up `scoring-effects` для:

- `esw2_dbg__dead_wizard_token_002`;
- `esw2_dbg__dead_wizard_token_003`;
- `esw2_dbg__dead_wizard_token_029`.

В этом же срезе исправить существующую инверсию штрафа лошары: она не должна инвертировать ПО всех ЖДК.

## Acceptance criteria

- [ ] DWT 002 хранит полный итоговый вклад `victoryPoints: -6`.
- [ ] DWT 003 хранит `victoryPoints: -8`; две копии у любых игроков удаляются из scoring snapshot и DWT tie-breaker до подсчёта.
- [ ] DWT 029 сначала получает effective contribution каждой вялой палочки, затем удваивает его: `-1 → -2`, после инверсии `+1 → +2`.
- [ ] Штраф лошары представлен отдельным вкладом и может инвертироваться без изменения ПО ЖДК.
- [ ] Реальные лица добавлены в DWT composition с canonical quantity; нейтральный наполнитель получает отдельный стабильный ID вместо маскировки под DWT 001.
- [ ] Точечные тесты покрывают распределённую пару DWT 003, tie-breaker и оба знака ПО вялой палочки.
- [ ] Не реализуются немедленные, активируемые или Ongoing лица ЖДК.

## Delivery

Один PR `scoring-effects` follow-up.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
