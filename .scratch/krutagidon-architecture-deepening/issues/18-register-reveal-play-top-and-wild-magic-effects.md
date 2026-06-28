Status: Done
Label: ready-for-agent
Type: AFK

# Перенести reveal/play-top и Wild Magic effects в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести Runtime Effect ID `reveal_top_card`, `play_top_card`, `play_top_card_from_foe_deck` и `wild_magic_choice` в Effect Runtime Catalog.

Срез должен сохранить top-deck reveal/play behavior, ownerId/destination для временно сыгранной чужой карты, Empty Choice Skip для пустых колод и текущий выбор первой legal Wild Magic option. Wild Magic остается конкретным supported choice effect, а не новым generic choice engine.

## Acceptance criteria

- [x] `reveal_top_card`, `play_top_card`, `play_top_card_from_foe_deck` и `wild_magic_choice` проходят validation через Effect Runtime Catalog.
- [x] Validation отклоняет неподдержанные reveal/play sources, play destinations и foe-deck target selectors.
- [x] Wild Magic options валидируются через общий catalog path для вложенных supported effects.
- [x] `play_top_card_from_foe_deck` сохраняет ownerId и cleanup destination для borrowed card.
- [x] Empty deck / no legal Wild Magic option behavior остается skip, а не failure.
- [x] Focused tests покрывают reveal, play own top deck, play foe top deck, Wild Magic choice и invalid nested option.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
