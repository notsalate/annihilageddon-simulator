Status: Done
Label: done
Type: AFK

# Перенести Mega Mayhem destroy-top-main-deck effect в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести Runtime Effect ID `mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem` в Effect Runtime Catalog.

Срез должен сохранить active-player order, уничтожение верхней карты main deck, destroy destination и смерть игрока, если уничтоженная карта является Mayhem. Это отдельный slice от других Mayhem effects, потому что он пересекает composition, card movement и death.

## Acceptance criteria

- [x] `mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem` регистрируется в Effect Runtime Catalog.
- [x] Validation отклоняет неподдержанные timing и targetSelector.
- [x] Effect сохраняет active-player order.
- [x] Destroyed card попадает в текущий destroy destination без потери ownerId semantics.
- [x] Если destroyed card является Mayhem, сохраняется текущий death/resurrection behavior.
- [x] Focused tests покрывают successful destroy/death path и invalid shape.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
