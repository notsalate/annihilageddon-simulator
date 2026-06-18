Status: ready-for-agent

# v0-фамильяр: setup -> покупка -> розыгрыш `+3 power`

## What to build

Добавить user-provided placeholder familiar для v0: стоимость 6, VP 2, эффект при розыгрыше `+3 power`. Во время setup игрок получает 2 seeded кандидата фамильяра, baseline setup policy выбирает первого, выбранный фамильяр попадает в unbought familiar slot, затем может быть куплен своим игроком за 6, попасть в discard, скориться после покупки и играться как owned карта.

## Acceptance criteria

- [ ] Runtime data содержит placeholder familiar, явно помеченный как v0/user-provided placeholder.
- [ ] Setup создаёт unbought familiar slot и выбирает фамильяра через тот же setup choice policy.
- [ ] Unbought familiar не находится в deck/hand/discard и не скорится.
- [ ] Legal buy action появляется только для собственного unbought familiar при достаточной power.
- [ ] После покупки familiar попадает в discard, становится owned игроком и даёт VP 2 при scoring.
- [ ] При розыгрыше placeholder familiar даёт `+3 power`.
- [ ] Existing tests pass, добавлен end-to-end setup -> buy -> play regression test.

## Blocked by

None - can start immediately
