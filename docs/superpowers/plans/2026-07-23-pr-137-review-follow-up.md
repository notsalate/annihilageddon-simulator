# PR #137 Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть подтверждённые findings повторных ревью PR #137 без изменения правил карт, сохранив draft-статус PR.

**Architecture:** `attack-resolution.ts` владеет полным lifecycle обычной player-controlled атаки: attack creation, ordered targets, state-sensitive amount, Defense/redirect recursion, damage/death boundary, immediate consequences, outcome branches, attribution, attack events и after-attack hooks. `attack-defense.ts` остаётся transactional submodule для legality, immutable payment plan, payment/movement/branch commit, redirect callback и полного rollback. `effect-runtime-registry.ts` только нормализует concrete typed attack payload в intent, а `effect-runtime.ts` предоставляет узкие adapters и shared primitives. Control Ledger предоставляет отдельный ongoing-card view для passive/replacement consumers и владеет физическим поиском/удалением карт. Trigger Dispatch применяет ongoing guard к `onPlayCard` и after-attack reactions, сохраняя generic caller-supplied executor seam; Effect Runtime Catalog остаётся у вызывающего пути. Mayhem/Mega Mayhem остаются отдельными двухфазными domain flows; terminal карты до возврата game end переходят в соответствующий destroyed stack.

**Tech Stack:** TypeScript 5.8, Node.js 22, `node:test`, GitHub Actions.

## Global Constraints

- Ветка: `agent/architecture-deepening-findings`; PR #137 остаётся draft.
- Не включать auto-merge и не объединять с `master`.
- Не добавлять зависимости и не менять package manager/lockfile.
- Mayhem/Mega Mayhem остаются отдельными domain flows.
- Каждый behavioral fix проходит RED→GREEN, когда доступна исполняемая рабочая копия.

---

### Task 1: Reproduce original review findings

**Files:**
- Create: `tests/trigger-dispatch-ongoing.test.ts`
- Create: `tests/attack-replacement-ongoing.test.ts`
- Create: `tests/controlled-power-ongoing.test.ts`
- Create: `tests/defense-fixtures.test.ts`
- Create: `tests/attack-defense-snapshot.test.ts`
- Delete: `tests/review-findings.test.ts`
- Modify: `tests/run-tests.ts`

- [x] Добавить отрицательные и положительные сценарии ongoing attack replacement и after-attack trigger.
- [x] Добавить отрицательный и положительный сценарий `onPlayCard` ongoing policy.
- [x] Добавить selector regression с production defense перед fixture defense и direct typed exact selector import.
- [x] Добавить regression уникальности fixture IDs после перемещения первой карты из руки.
- [x] Дополнить decline snapshot regression наблюдаемыми гарантиями состояния, событий и продолжения seeded RNG.
- [x] Разнести regressions по behavior-named suites и удалить общий `tests/review-findings.test.ts`.

### Task 2: Add ongoing controlled-card boundary

**Files:**
- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/attack-resolution.ts`
- Modify: `src/engine/controlled-power.ts`
- Modify: `src/engine/trigger-dispatch.ts`
- Modify: `src/engine/effect-runtime.ts`

- [x] Добавить `getControlledOngoingCards(state, player)`.
- [x] Перевести attack amount replacement, owned-Wand attack profile и passive controlled power на ongoing view.
- [x] Запретить non-ongoing definitions для `onPlayCard` и after-attack reactions, сохранив end-turn temporary-control semantics.

### Task 3: Harden defense fixtures

**Files:**
- Modify: `tests/helpers/defense-fixtures.ts`

- [x] Заменить `player.hand.length` на state-wide monotonic unique sequence.
- [x] Сделать `selectFirstFixtureDefense` действительно fixture-only.
- [x] Добавить `selectFixtureDefenseByInstanceId(instanceId)` для точного выбора.

### Task 4: Defer defense snapshot

**Files:**
- Modify: `src/engine/attack-defense.ts`

- [x] Перенести `createDefenseMutationSnapshot` после identity validation выбранной defense card и до `defenseChoiceSelected`/cost mutation.
- [x] Сохранить pre-choice event-log length, чтобы branch failure откатывал typed choice event.
- [x] Зафиксировать decline без snapshot через отсутствие `rng.fork()` и наблюдаемую неизменность состояния/RNG.

### Task 5: Preserve terminal Market Flow state

**Files:**
- Modify: `src/engine/market-flow.ts`
- Create: `tests/market-flow-terminal.test.ts`

- [x] Не терять раскрытую Mayhem/Mega Mayhem карту при terminal result.
- [x] До возврата terminal result перемещать карту в `destroyedMayhem`/`destroyedMegaMayhem`, сохраняя текущий terminal event-log short circuit.
- [x] Не продолжать заполнение рынка и не писать `mayhemResolved` для незавершённого terminal effect path.

### Task 6: Centralize physical card zones

**Files:**
- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/effect-runtime.ts`
- Create: `tests/control-ledger-zones.test.ts`

- [x] Добавить `removeCardFromLocation(state, instanceId)` рядом с `findCardLocation`.
- [x] Сделать перечень физических зон единственным внутри Control Ledger.
- [x] Перевести Effect Runtime move helpers на location/removal seam.

### Task 7: Align architecture documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-engine-architecture-deepening-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-pr-137-review-follow-up.md`
- Modify: `src/engine/AGENTS.md`
- Modify: `tests/AGENTS.md`

- [x] Зафиксировать полное владение ordinary player-controlled lifecycle в `attack-resolution.ts`, отдельный transactional submodule `attack-defense.ts` и узкие adapters в `effect-runtime.ts`.
- [x] Зафиксировать generic Trigger Dispatch executor seam и catalog ownership у caller.
- [x] Зафиксировать физический location/removal ownership Control Ledger.
- [x] Зафиксировать behavior-named focused regression suites вместо общего review file.

### Task 8: Final gate and publication

- [ ] Точечные тесты затронутого поведения.
- [ ] `npm run check`.
- [ ] `npm run report:card-runtime-clusters`.
- [ ] `git diff --check origin/master...HEAD`.
- [ ] Повторное Standards/Spec review текущего head.
- [ ] Обновить PR body итоговым head и результатами проверок.
