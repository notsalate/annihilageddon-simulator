Status: ready-for-agent

# Market Flow: беспредел при обновлении барахолки

## What to build

Расширить Market Flow для turn-start поведения: если при обновлении барахолки раскрыт беспредел или мегабеспредел, он не попадает на рынок, а разыгрывается, уходит в соответствующий event pile, и Market Flow продолжает раскрывать карты до целевого размера рынка.

## Acceptance criteria

- [ ] При turn-start Market Flow раскрытый беспредел разыгрывает mapped effect.
- [ ] Беспредел после resolution попадает в соответствующий event pile с сохранением порядка.
- [ ] Market Flow продолжает обновление и кладёт следующую обычную карту в рынок.
- [ ] Setup mode по-прежнему уничтожает event cards без resolution.
- [ ] Existing tests pass, добавлен focused test “беспредел сверху, обычная карта следом”.

## Blocked by

- `.scratch/architecture-canon-alignment/issues/09-market-flow-rename-and-normal-refresh.md`
