Status: ready-for-agent

# Setup: выбор свойства колдуна из 2 кандидатов

## What to build

Добавить setup choice policy для жетонов колдунского свойства: каждому игроку seeded RNG выдаёт 2 случайных кандидата, текущая baseline policy выбирает первого кандидата, выбранный жетон становится public wizard property игрока, невыбранный не используется.

## Acceptance criteria

- [ ] Каждый игрок получает 2 seeded кандидата свойства колдуна во время setup.
- [ ] Baseline setup policy выбирает первого кандидата из пары.
- [ ] Выбранный жетон попадает в `wizardProperties` игрока.
- [ ] Невыбранный жетон не попадает в controlled zones и не влияет на игру.
- [ ] Existing tests pass, добавлен setup test на deterministic candidate choice.

## Blocked by

None - can start immediately
