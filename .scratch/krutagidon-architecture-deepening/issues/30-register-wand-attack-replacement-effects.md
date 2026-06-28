Status: Done
Label: done
Type: AFK

# Перенести Wand Attack replacement effects в Effect Runtime Catalog

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Перенести wizard-property Runtime Effect ID `modify_owned_wand_attack_damage` и `prevent_defense_against_owned_wand_attacks` в Effect Runtime Catalog.

Срез должен сохранить Wand Attack Card replacement path: effects применяются только к owned wand attacks, добавляют damage bonus и/или делают attack unavoidable. Borrowed wands и non-wand attacks не должны получать эти modifiers.

## Acceptance criteria

- [x] `modify_owned_wand_attack_damage` и `prevent_defense_against_owned_wand_attacks` валидируются через Effect Runtime Catalog.
- [x] Validation отклоняет invalid amount, timing, cardDefinitionIds/cardTags и unsupported target fields.
- [x] Owned Wand Attack Card получает текущий damage bonus и unavoidable behavior.
- [x] Borrowed wand и non-wand attack не получают wizard-property replacement.
- [x] Existing Wand Attack Card tests продолжают проходить.
- [x] Focused tests покрывают owner-only success path и invalid replacement shape.

## Evidence

- Добавлены catalog handlers для `modify_owned_wand_attack_damage` и `prevent_defense_against_owned_wand_attacks`.
- Оба ID удалены из legacy compatibility allowlist в `src/engine/data.ts`.
- Добавлен focused validation тест на supported/invalid Wand Attack replacement shapes.
- Existing behavior покрыт текущими `tests/action-loop.test.ts` тестами:
  - `wizard property owned wand attacks gain damage and cannot be avoided`
  - `wizard property does not affect borrowed wands or non-wand attacks`

## Checks

- `npm test -- tests/validation.test.ts`
- `npm test -- tests/action-loop.test.ts`
- `npm run typecheck`
- `npm test`

## Blocked by

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`
