Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать familiar setup и effective types свойства 003

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Довести `esw2_dbg__wizard_property_003` до `crossSourceComplete` внутри `ongoing-modifiers`.

## Acceptance criteria

- [ ] Setup сохраняет обоих фамильяров игрока и даёт выбрать третьего из ничейных.
- [ ] Состояние, legal actions, Control Ledger и scoring поддерживают несколько принадлежащих игроку фамильяров.
- [ ] Каждый принадлежащий фамильяр независимо может считаться также Легендой и позже перестать ею считаться.
- [ ] Effective type используется покупкой, скидками, подсчётами, раскрытием, scoring и будущими эффектами ЖДК через один player-aware module.
- [ ] Реальные тесты свойства 003 подтверждают, что тот же resolver независимо возвращает effective Legend status для каждого собственного Фамильяра; потребители, включая DWT 001, не получают отдельной логики.
- [ ] Нельзя включать или отзывать тип у чужого фамильяра.
- [ ] Тесты покрывают выбор третьего, независимые комбинации типов и сохранение владельца.

## Blocked by

- `54-implement-cross-source-dingler-runtime.md`

## Delivery

Этот issue входит в один PR `ongoing-modifiers` follow-up вместе с issues 56-57; внутри PR реализуется первым.
