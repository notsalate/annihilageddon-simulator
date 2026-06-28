Status: Done
Label: done
Type: AFK

# Перенести modify_effective_value в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести wizard-property modifier Runtime Effect ID `modify_effective_value` в Effect Runtime Catalog.

Срез должен сохранить Effective Value behavior для card cost, card VP, token VP, player max life и player VP. Этот effect может исполняться не через обычный on-play `executeEffect`, но его validation и supported-effect registration должны жить в том же catalog.

## Acceptance criteria

- [x] `modify_effective_value` валидируется через Effect Runtime Catalog.
- [x] `modify_effective_value` сохраняет текущий Effective Value behavior для card cost, VP, token VP и player max life/VP.
- [x] Validation отклоняет неподдержанные valueKind, operation, target и invalid amount.
- [x] Неподдержанные wizard-property modifier effects не становятся playable случайно.
- [x] Existing effective-values tests продолжают проходить без массовой правки runtime JSON.
- [x] Focused tests покрывают successful Effective Value modifier и invalid shape.

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
