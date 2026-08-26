Status: Todo
Label: ready-for-agent
Type: AFK

# Реализовать activation-effects для свойства и ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Расширить PR `activation-effects` для:

- `esw2_dbg__wizard_property_005`;
- `esw2_dbg__dead_wizard_token_005`.

## Acceptance criteria

- [ ] Свойство 005 активируется не чаще одного раза за собственный ход и только при контроле как минимум двух карт, которые для игрока являются Сокровищами и/или Тварями.
- [ ] Успешная активация свойства выдаёт ровно 1 чипсину; невозможная активация не меняет состояние.
- [ ] DWT 005 даёт optional собственное действие: заплатить ровно 5 чипсин и уничтожить этот жетон.
- [ ] Действие DWT недоступно без 5 чипсин, при чужом контроле и после удаления жетона; preflight не списывает ресурс частично.
- [ ] Уничтожение DWT очищает ownership/control state через общий token lifecycle и убирает его из итогового scoring.
- [ ] Пока DWT 005 контролируется, его полный итоговый вклад равен `victoryPoints: -8`.
- [ ] Property и DWT actions используют Catalog и общие legal-action/resource seams, не маскируя ЖДК под карту.
- [ ] Тесты загружают реальные определения и покрывают once-per-turn, mixed effective types, недостаток ресурса и успешное самоуничтожение.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
- `51-implement-cross-source-scoring-runtime.md`
- `50-fix-death-dwt-resolution-order.md`

## Delivery

Этот issue входит в один PR `activation-effects` вместе с GitHub issues #264-267.
