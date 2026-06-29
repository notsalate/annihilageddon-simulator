Status: Done
Label: done
Type: AFK

# Удалить legacy compatibility path Effect Runtime после миграции effects

## Parent

- `.scratch/krutagidon-architecture-deepening/issues/15-consolidate-effect-runtime-catalog.md`

## What to build

Удалить legacy compatibility path для supported Runtime Effect ID после того, как предыдущие slices перенесли все текущие supported effects в Effect Runtime Catalog.

Срез должен оставить один source of truth: supported-effect detection, combat/fixture mode checks, shape validation и runtime execution идут через catalog. Если какие-то effect IDs намеренно остаются unsupported или fixture-only, это должно быть явно выражено в catalog, а не в отдельном whitelist.

## Acceptance criteria

- [x] В executable data-pack validation нет отдельного supported-effect whitelist, дублирующего Effect Runtime Catalog.
- [x] В runtime execution нет silent no-op для неизвестного supported effect: unsupported effect дает явную ошибку в правильном месте.
- [x] Combat/fixture mode checks живут в catalog или рядом с ним как часть того же interface.
- [x] Все текущие playable runtime data проходят validation через catalog.
- [x] Unsupported/partial runtime definitions по-прежнему не становятся playable случайно.
- [x] `npm run typecheck`, `npm test`, `npm run validate:drafts`, `npm run report:runtime-coverage` проходят или известные import/runtime coverage gaps явно описаны.
- [x] Issue notes фиксируют новый contributor rule: Runtime Effect ID нельзя добавлять мимо Effect Runtime Catalog.

## Related follow-up slices

- `.scratch/krutagidon-architecture-deepening/issues/16-register-defense-branch-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/17-register-economy-and-draw-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/18-register-reveal-play-top-and-wild-magic-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/19-register-life-and-dingler-status-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/20-register-mayhem-event-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/21-register-wizard-property-setup-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/22-register-wizard-property-modifier-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/24-register-mega-mayhem-destroy-top-main-deck-effect.md`
- `.scratch/krutagidon-architecture-deepening/issues/25-register-mayhem-discard-top-deck-destroy-effects.md`
- `.scratch/krutagidon-architecture-deepening/issues/26-register-mayhem-hand-redraw-choice-effect.md`
- `.scratch/krutagidon-architecture-deepening/issues/27-register-mayhem-discard-deck-destroy-effect.md`
- `.scratch/krutagidon-architecture-deepening/issues/28-register-topdeck-gained-card-effect.md`
- `.scratch/krutagidon-architecture-deepening/issues/29-register-temporary-hand-limit-effect.md`
- `.scratch/krutagidon-architecture-deepening/issues/30-register-wand-attack-replacement-effects.md`

Эти slices описывают более широкий хвост catalog migration. Этот issue закрывает сам legacy compatibility path; оставшиеся card/mechanic gaps остаются видимыми как partial или missing runtime coverage, а не исполняются через fallback path.

## Notes

- `src/engine/data.ts` больше не содержит legacy supported-effect whitelist; validation берет handler, mode support и shape validation из Effect Runtime Catalog.
- Catalog entry теперь хранит `supportedModes`; обычные handlers доступны в `combat` и `fixture`, fixture-only entries доступны только в `fixture`.
- Через catalog зарегистрированы `modify_effective_value`, `fixture_modify_effective_value` и fixture-only executable `fixture_add_power_equal_to_target_cost`.
- `src/engine/effect-runtime.ts` больше не делает silent no-op для неизвестного `effectId`: runtime возвращает явную ошибку `Unsupported effect id ...`.
- После удаления silent no-op карточки с не перенесенными runtime IDs помечены partial/non-playable и убраны из first-batch deck composition, чтобы unsupported definitions не становились playable случайно. Это не реализует их механику; эти gaps остаются в runtime coverage inventory.
- Contributor rule зафиксирован в `src/engine/AGENTS.md`: Runtime Effect ID нельзя добавлять в executable data мимо Effect Runtime Catalog.
- Review-субагент указал на риск mode-gating только на validation; runtime dispatch после этого тоже получил явный `runtimeMode` check.

## Verification

- `npm test -- tests/validation.test.ts` - passed, 197/197.
- `npm test -- tests/action-loop.test.ts` - passed, 197/197.
- `npm test -- tests/effective-values.test.ts` - passed, 197/197.
- `npm run typecheck` - passed.
- `npm test` - passed, 197/197.
- `npm run validate:drafts` - passed, 167 file(s), 0 error(s), 0 warning(s).
- `npm run report:runtime-coverage` - passed; remaining coverage gaps are reported by the inventory.
