Status: Todo
Label: ready-for-agent
Type: AFK

# Закончить Ongoing-триггеры свойств 007 и 008

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Довести до `crossSourceComplete`:

- `esw2_dbg__wizard_property_007`;
- `esw2_dbg__wizard_property_008`.

## Acceptance criteria

- [ ] История получения карты хранит получателя и позволяет свойству 007 считать только Заклинания, полученные этим игроком в текущий ход.
- [ ] Проверка типа использует player-aware effective types, включая Легенды-Заклинания.
- [ ] Увеличение руки действует только на ближайший end-turn draw и не переносится дальше.
- [ ] Свойство 008 даёт 1 чипсину только при первом розыгрыше Постоянки, не при её последующих активациях.
- [ ] Optional topdeck свойства 008 работает для обычного gain, но не отменяет обязательное fixed-discard назначение.
- [ ] Тесты загружают реальные свойства и покрывают gain другого игрока, повторную активацию и fixed-discard gain.

## Delivery

Один PR `ongoing-modifiers` follow-up вместе с issues 55 и 57; внутри PR выполняется после issue 55.

## Blocked by

None — can start immediately.
