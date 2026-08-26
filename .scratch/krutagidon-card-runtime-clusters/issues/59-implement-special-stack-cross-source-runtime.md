Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать special-card-stack для свойства и ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Расширить незапущенный PR `special-card-stack` для:

- `esw2_dbg__wizard_property_002`;
- `esw2_dbg__dead_wizard_token_001`;
- `esw2_dbg__dead_wizard_token_018`.

## Acceptance criteria

- [ ] Свойство 002 активируется не чаще одного раза за собственный ход и только при контроле как минимум двух effective Волшебников и/или Заклинаний; недоступная активация не меняет состояние.
- [ ] Успешная активация свойства 002 позволяет выбрать врага, разыграть верхнюю карту его колоды под временным контролем и после полного разрешения отправить её в сброс владельца, даже если это Постоянка.
- [ ] Пустая колода выбранного врага пополняется из его сброса через seeded RNG; владелец карты не меняется.
- [ ] DWT 001 через общий player-aware resolver выдаёт по одной вялой палочке за каждую effective Легенду в собственном сбросе, но не больше остатка special stack.
- [ ] Тест DWT 001 покрывает обычную и fixture effective Легенду через этот интерфейс; саму семантику свойства 003 и её реальные тесты добавляет issue 55, без изменений DWT 001.
- [ ] Полученные от DWT 001 палочки переходят в собственный сброс.
- [ ] DWT 018 выдаёт одну вялую палочку на верх собственной колоды; пустой special stack даёт полный no-op.
- [ ] Все три источника используют общие transfer/destination и Control Ledger seams без property/token-only копий обработчиков.
- [ ] Runtime composition содержит по одной настоящей копии лиц ЖДК и переиспользует нейтральный наполнитель, введённый scoring follow-up; DWT 001 больше не маскирует весь остаток стопки.
- [ ] Тесты загружают реальные определения и покрывают порог/once-per-turn свойства, чужую Постоянку, refill, обычную/effective Легенду, частично пустой и пустой special stack.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
- `51-implement-cross-source-scoring-runtime.md`

## Delivery

Этот issue входит в один PR `special-card-stack` вместе с GitHub issues #243-246 и issue 50; внутри PR выполняется после общего death/DWT resolution contract.
