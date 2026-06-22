Status: ready-for-agent

# Implement Wand Attack Card Runtime Cluster

## Parent

- 01-build-runtime-coverage-inventory-and-mechanic-clusters.md

## What to build

Implement the full v0.5 `Wand Attack Card` mechanic cluster as a complete runtime-mapping slice. A completed slice should make every current Wand Attack Card candidate fully playable: each card has runtime JSON aligned with its canonical draft, is included in the appropriate composition path, uses implemented engine mechanics, and has focused tests proving the shared wand-attack behavior and the card-specific effects.

This issue must treat old v0 runtime data as review-needed legacy input, not as current truth. In particular, verify starter runtime IDs against canonical starter drafts before relying on existing runtime files.

Current Wand Attack Card candidates from the v0.5 inventory:

- `esw2_dbg__starter_003` - Сырная палочка
- `esw2_dbg__starter_004` - Палочка-хреналочка
- `esw2_dbg__main_015` - Палочка-шлепалочка
- `esw2_dbg__main_030` - Палочка-Лошарочка
- `esw2_dbg__main_041` - Палочка-Чипсалочка
- `esw2_dbg__legend_015` - Бузящая палочка Гарика Потного

Negative/reference objects:

- `esw2_dbg__limp_wand` must not qualify as a Wand Attack Card.
- Passive or non-attack cards must not qualify just because their Russian name contains `палочка`.
- `esw2_dbg__wizard_property_009` must apply only to qualifying owned wand attacks, not borrowed or non-wand attacks.

## Acceptance criteria

- [ ] Define or reuse a runtime representation for Wand Attack Card qualification that does not rely on name-only matching and does not rely on `cardTypes` alone.
- [ ] Align starter runtime definitions with canonical starter drafts: `starter_001` is `Знак`, `starter_002` is `Пшик`, `starter_003` is `Сырная палочка`, and `starter_004` is `Палочка-хреналочка`.
- [ ] Keep the normal starter deck composition correct: 6 `Знак`, 1 `Сырная палочка`, and 3 `Пшик` per player.
- [ ] Keep `Палочка-хреналочка` out of the normal starter deck while preserving its wizard-property replacement path.
- [ ] `esw2_dbg__starter_003` is fully playable from its draft: +1 power, chosen-player attack for 1 damage, and gain 3 chips if that attack kills the target.
- [ ] `esw2_dbg__starter_004` is fully playable from its draft: +1 power, chosen-player attack for 1 damage, and if that attack kills the target, the attacker may return up to 2 cards from their discard pile to hand.
- [ ] `esw2_dbg__main_015` is fully playable from its draft: +2 power, chosen-foe attack for 2 damage, and steal or gain chips equal to the actual damage dealt by that attack.
- [ ] `esw2_dbg__main_030` is fully playable from its draft: +3 power, chosen-player attack for 5 damage, and if the target dies from that attack, the target becomes a Dingler/лошара. Self-targeting must follow the draft note.
- [ ] `esw2_dbg__main_041` is fully playable from its draft: +2 power and optional 1-chip spend to make a chosen-player attack for 10 damage. Self-targeting must follow the draft note.
- [ ] `esw2_dbg__legend_015` is fully playable from its draft: +3 power, attack left or right foe for 10 damage, and continue in the same direction after a kill without attacking the same foe more than once.
- [ ] Add all newly implemented main/legend Wand Attack Cards to the appropriate runtime composition, respecting each draft's composition quantity.
- [ ] Recheck `esw2_dbg__wizard_property_009` so its owned-wand damage bonus and defense-prevention behavior applies to all qualifying Wand Attack Cards from this issue.
- [ ] Prove that `esw2_dbg__limp_wand` does not qualify as a Wand Attack Card and does not receive the owned-wand attack modifier.
- [ ] Prove that borrowed or opponent-owned Wand Attack Cards do not receive `wizard_property_009` benefits for the player who merely plays or resolves them.
- [ ] Add focused runtime tests for the shared qualification rule, the `wizard_property_009` interaction, and each card-specific mechanic introduced or changed by this issue.
- [ ] If a required effect handler or selector is missing, implement it in this issue rather than leaving any candidate partial.
- [ ] Do not opportunistically rewrite unrelated runtime cards outside this Wand Attack Card cluster.
- [ ] Regenerate `docs/runtime-coverage-v05-inventory.md` after implementation.
- [ ] `npm run report:runtime-coverage -- --write docs/runtime-coverage-v05-inventory.md` shows this cluster no longer blocked by missing runtime mappings or review-needed legacy starter data.
- [ ] `npm run validate:drafts` passes.
- [ ] `npm run report:import` still reports draft validation with `0` errors and `0` warnings; remaining missing runtime outside this cluster is acceptable.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.

## Blocked by

- 01-build-runtime-coverage-inventory-and-mechanic-clusters.md

## Notes for the agent

- Do not delete old v0 metadata fields as a first step. They may remain for compatibility but are legacy facts, not v0.5 truth.
- Use canonical draft JSON and source notes as the behavior source. Existing runtime JSON can be reused only after review.
- The current runtime for starter cards may not match canonical starter draft IDs; verify before editing.
- Keep this issue complete: if one of the six candidate Wand Attack Cards cannot be made fully playable, report the blocker and do not mark the issue done.
