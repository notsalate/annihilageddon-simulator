Status: ready-for-agent

# Канонический destroy destination

## What to build

Сделать единое правило назначения для `destroyCard`: обычные карты уходят в общий `destroyedPile`, `wildMagic` возвращается в `wildMagicStack`, `limpWand` возвращается в `limpWandStack`, беспределы/мегабеспределы сохраняют порядок в event piles.

## Acceptance criteria

- [ ] Уничтожение обычной не-event карты больше не зависит от `destroyedMayhem` как универсальной зоны.
- [ ] `wildMagic` при уничтожении возвращается в `wildMagicStack`.
- [ ] `limpWand` при уничтожении возвращается в `limpWandStack`.
- [ ] Беспределы и мегабеспределы продолжают попадать в соответствующие event piles с сохранением порядка.
- [ ] Existing tests pass, добавлены или обновлены focused tests на destination rules.

## Blocked by

None - can start immediately
