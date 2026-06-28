Status: Done
Label: done
Type: AFK

# Перенести Mayhem hand-redraw choice effect в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести Runtime Effect ID `mayhem_each_player_choose_discard_hand_draw_or_take_damage` в Effect Runtime Catalog.

Срез должен сохранить текущую поддержанную модель: каждый игрок в active-player order сбрасывает руку и добирает карты по существующему behavior. Если runtime data содержит альтернативную ветку damage, она должна валидироваться или явно оставаться unsupported в рамках текущего поддержанного среза.

## Acceptance criteria

- [x] `mayhem_each_player_choose_discard_hand_draw_or_take_damage` регистрируется в Effect Runtime Catalog.
- [x] Validation описывает текущий supported shape и не принимает неподдержанные варианты молча.
- [x] Effect сохраняет active-player order.
- [x] Hand discard и draw behavior сохраняют текущие zones и event log.
- [x] Unsupported branch shape дает понятную validation/runtime ошибку, а не silent no-op.
- [x] Focused tests покрывают supported hand-redraw path и invalid/unsupported branch shape.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## Evidence

- `mayhem_each_player_choose_discard_hand_draw_or_take_damage` перенесен в `Effect Runtime Catalog`.
- Legacy runtime branch и legacy compatibility validation entry для этого ID удалены.
- Supported shape зафиксирован по текущей runtime data: `onMayhemResolve`, `eachPlayerClockwiseFromActive`, `chooser: affectedPlayer`, options `discard_hand_then_draw_cards` на 5 и `take_damage` на 5.
- Поведение redraw сохраняет active-player order, сброс руки, добор 5 карт и event `mayhemHandDiscardedAndRedrawn`.

## Checks

- `npm test -- tests/validation.test.ts`
- `npm test -- tests/action-loop.test.ts`
- `npm run typecheck`
- `npm test`
