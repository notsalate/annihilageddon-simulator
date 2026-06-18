Status: ready-for-agent

# Setup: ЖДК по канону

## What to build

Привести setup ЖДК к канону: перемешать доступные Dead Wizard Tokens seeded RNG, взять ровно `4 * playerCount` в draw stack, а остальные оставить вне игры/неиспользованными.

## Acceptance criteria

- [ ] Для 2 игроков DWT draw stack содержит ровно 8 жетонов.
- [ ] Для 3 игроков DWT draw stack содержит ровно 12 жетонов.
- [ ] Порядок DWT draw stack воспроизводим для одинакового seed.
- [ ] Остальные DWT не участвуют в партии и не скорятся.
- [ ] Existing tests pass, добавлены setup tests на размер и воспроизводимость DWT stack.

## Blocked by

None - can start immediately
