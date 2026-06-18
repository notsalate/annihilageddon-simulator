Status: ready-for-agent

# Market Flow: явная причина конца партии

## What to build

Сделать так, чтобы Market Flow возвращал явную причину конца партии там, где реально обнаружил невозможность обновить барахолку: `mainDeckExhausted` или `legendDeckExhausted`. Simulation loop должен получать эту причину напрямую, без позднего вывода через отдельную проверку состояния рынка.

## Acceptance criteria

- [ ] Market Flow возвращает `mainDeckExhausted`, когда main deck не может обновить main market до 5.
- [ ] Market Flow возвращает `legendDeckExhausted`, когда legend deck не может обновить legend market до 3.
- [ ] После невозможного обновления барахолки не логируется новый `turnStarted`.
- [ ] Simulation summary использует явную причину, возвращённую Market Flow.
- [ ] Existing tests pass, добавлены regression tests на обе причины конца партии.

## Blocked by

- `.scratch/architecture-canon-alignment/issues/09-market-flow-rename-and-normal-refresh.md`
