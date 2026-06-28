Status: Done
Label: done
Type: AFK

# Перенести Mayhem discard-top-deck destroy effect в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести Runtime Effect ID `mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none` в Effect Runtime Catalog.

Срез должен сохранить текущую раннюю модель выбора: каждый игрок в active-player order сбрасывает верхние карты колоды, а выбранные discarded cards уничтожаются через общий destroy destination path.

## Acceptance criteria

- [x] `mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none` регистрируется в Effect Runtime Catalog.
- [x] Validation отклоняет invalid amount, timing и targetSelector.
- [x] Effect сохраняет active-player order.
- [x] Discarded cards уничтожаются через текущий destroy destination path.
- [x] Event log сохраняет текущий Mayhem discard/destroy event.
- [x] Focused tests покрывают successful discard/destroy path и invalid amount.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
