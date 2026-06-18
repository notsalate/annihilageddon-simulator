Status: ready-for-agent

# Единый play path для `play_top_card`

## What to build

Сделать так, чтобы эффект `play_top_card` разыгрывал карту через тот же канонический путь, что и обычный `playCard` из руки. Срез должен покрыть перемещение карты в правильную controlled zone, выполнение `onPlay`, вторичные триггеры свойств колдуна и cleanup.

## Acceptance criteria

- [ ] Карта, сыгранная эффектом `play_top_card`, проходит через общий play path, а не отдельную неполную реализацию.
- [ ] `onPlayCard`-триггер свойства колдуна срабатывает для карты, сыгранной с верха колоды.
- [ ] Non-Ongoing карта после cleanup попадает в discard владельца.
- [ ] Existing tests pass, добавлен focused regression test на `play_top_card` + wizard property trigger.

## Blocked by

None - can start immediately
