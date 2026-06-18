Status: ready-for-agent

# Единый gain/buy movement с чипсами рынка

## What to build

Сделать общий movement path для покупки и `gain_card`: карта становится owned получателем, попадает в правильный destination, чипсы рынка переходят игроку, а `onGainCard`-свойства колдуна применяются одинаково.

## Acceptance criteria

- [ ] Покупка карты и `gain_card` используют один общий путь перемещения gained card.
- [ ] Чипсы на карте рынка переходят игроку и очищаются с card instance в обоих путях.
- [ ] `onGainCard`-свойства колдуна применяются одинаково для покупки и gain effect.
- [ ] Existing tests pass, добавлен focused test, сравнивающий movement guarantees покупки и `gain_card`.

## Blocked by

- `.scratch/architecture-canon-alignment/issues/03-canonical-destroy-destination.md`
