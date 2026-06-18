Status: ready-for-agent

# v0-фамильяр: defense branch

## What to build

Расширить placeholder familiar защитной веткой: игрок может использовать familiar defense, чтобы избежать атаки, оплатив cost “сбрось карту”. Срез должен пройти через существующее attack/defense window, оплату cost, avoided attack и правильные зоны карт.

## Acceptance criteria

- [ ] Placeholder familiar содержит defense branch “discard a card to avoid attack”.
- [ ] Defense option legal только когда cost можно оплатить.
- [ ] При использовании defense attack avoided для защищающегося игрока.
- [ ] Карта, оплаченная как cost, уходит в правильный discard.
- [ ] Existing tests pass, добавлен focused combat regression test.

## Blocked by

- `.scratch/architecture-canon-alignment/issues/07-v0-familiar-setup-buy-play.md`
