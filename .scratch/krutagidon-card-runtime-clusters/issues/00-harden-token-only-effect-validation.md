Status: Done
Label: done
Type: AFK

# Ужесточить validation для token-only runtime effects

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Перед первым Block C card implementation cluster закрыть мелкие validation gaps вокруг эффекта `temporary_hand_limit_by_gained_card_type`.

Срез должен гарантировать, что runtime effect, который реально применяется только из `wizardProperty`, не может пройти executable validation внутри обычной карты, а фильтры по типам карт не принимают опечатки вроде `spel`.

Дополнительно runtime-расчёт end-turn hand limit должен быть устойчив к невалидному `amount`, даже если некорректный эффект попал в state в обход validation.

## User stories covered

- 6. No new partial runtime cards.
- 13. Invalid runtime/composition references detected.
- 15. Block C card implementation deferred until Block A and Block B are finished.

## Acceptance criteria

- [x] `temporary_hand_limit_by_gained_card_type` проходит validation для playable `wizardProperty` token с `timing: "endTurn"`, положительным integer `amount` и каноническими `cardTypes`.
- [x] Обычная `CardDefinition` с `temporary_hand_limit_by_gained_card_type` отклоняется executable validation с понятной ошибкой.
- [x] Focused validation test покрывает запрет `temporary_hand_limit_by_gained_card_type` внутри обычной карты.
- [x] Validation для `temporary_hand_limit_by_gained_card_type.cardTypes` принимает только канонические runtime card types и отклоняет typo вроде `spel`.
- [x] Focused validation test покрывает unknown/typo `cardTypes`.
- [x] `calculateEndTurnDrawCount` не увеличивает draw count для non-positive или нецелого `amount`, если такой эффект попал в runtime state в обход validation.
- [x] Focused behavior test покрывает runtime hardening для invalid `amount`.
- [x] Изменение не назначает card clusters, не редактирует `card-cluster-decisions.json` и не реализует новые runtime cards.
- [x] `npm run typecheck` проходит.
- [x] Focused tests для validation/action-loop проходят.
- [x] `git diff --check` проходит.

## Blocked by

None - can start immediately

## Notes

- Предпочтительно сделать validation source-aware через явный context/source kind, если это ложится в текущий `validateRuntimeEffectDefinition` без широкого refactor.
- Если source-aware catalog metadata получается слишком широким для этого issue, допустим точечный guardrail для `temporary_hand_limit_by_gained_card_type` в card/token validation path.
- `cardTypes` для executable runtime считаются закрытым словарём. Import/draft noise не должен проходить в runtime effects как валидная строка.
- Не расширять scope до выбора или реализации Block C card clusters.

## Evidence

- Добавлен source-aware guardrail: `temporary_hand_limit_by_gained_card_type` разрешён для playable `wizardProperty`, но отклоняется в обычной `CardDefinition`.
- `temporary_hand_limit_by_gained_card_type.cardTypes` теперь проверяет закрытый runtime-словарь и отклоняет `spel`.
- `calculateEndTurnDrawCount` игнорирует non-positive `amount` как defense-in-depth.
- Не изменялись `card-cluster-decisions.json`, cluster matrix и runtime cards.

## Checks

- `npm run build -- --pretty false`
- `node --test dist\tests\validation.test.js`
- `node --test dist\tests\action-loop.test.js`
- `npm run typecheck`
- `npm test`
- `git diff --check`
