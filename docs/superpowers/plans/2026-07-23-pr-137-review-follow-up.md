# PR #137 Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть подтверждённые findings повторных ревью PR #137 без изменения правил карт, сохранив draft-статус PR.

**Architecture:** `actions.ts` остаётся публичной action boundary и выполняет read-only `endTurn` modifier preflight; `actions-core.ts` владеет mutating action lifecycle после успешного preflight. `attack-resolution.ts` владеет полным lifecycle обычной player-controlled атаки: target resolution, attack creation, ordered targets, state-sensitive amount, Defense/redirect recursion, damage/death boundary, immediate consequences, outcome branches, attribution, attack events и after-attack hooks. `attack-defense.ts` остаётся transactional submodule для legality, immutable payment plan, payment/movement/branch commit, redirect callback и полного rollback. `effect-runtime-registry.ts` только нормализует concrete typed attack payload в intent, а `effect-runtime.ts` предоставляет узкие adapters и shared primitives. Control Ledger предоставляет отдельный ongoing-card view для passive/replacement consumers и владеет единым descriptor inventory всех физических card locations, включая singleton-зоны, а также lookup/removal. Trigger Dispatch владеет discovery, timing-aware ongoing policy, source identity, Effect Runtime Catalog resolution, exact validation, operation-specific applicability, execution и aggregation; callers передают только state, controller и typed operation. Mayhem/Mega Mayhem остаются отдельными двухфазными domain flows; terminal карты до возврата game end переходят в соответствующий destroyed stack.

**Tech Stack:** TypeScript 5.8, Node.js 22, `node:test`, GitHub Actions.

## Global Constraints

- Ветка: `agent/architecture-deepening-findings`; PR #137 остаётся draft.
- Не включать auto-merge и не объединять с `master`.
- Не добавлять новые прямые зависимости и не менять package manager; изолированный transitive lockfile security bump допускается только для устранения подтверждённой supply-chain уязвимости.
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
- [x] Сделать единый descriptor inventory всех физических card locations, включая array- и singleton-зоны, единственным внутри Control Ledger.
- [x] Перевести Effect Runtime move helpers на location/removal seam.

### Task 7: Align architecture documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-engine-architecture-deepening-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-pr-137-review-follow-up.md`
- Modify: `src/engine/AGENTS.md`
- Modify: `tests/AGENTS.md`

- [x] Зафиксировать полное владение ordinary player-controlled lifecycle в `attack-resolution.ts`, отдельный transactional submodule `attack-defense.ts` и узкие adapters в `effect-runtime.ts`.
- [x] Зафиксировать target resolution до `attackCreated` и отсутствие phantom instrumentation для empty/error paths.
- [x] Зафиксировать catalog-owned Trigger Dispatch с typed operations, stop-on-error/game-end и end-turn aggregate без raw effect contexts.
- [x] Зафиксировать descriptor-inventory, physical location/removal и singleton-zone ownership Control Ledger.
- [x] Зафиксировать публичный `actions.ts` preflight boundary и mutating `actions-core.ts` после успешной проверки.
- [x] Зафиксировать behavior-named focused regression suites вместо общего review file.

### Task 8: Migrate focused scenarios to the shared helper

**Files:**
- Modify: `tests/helpers/game-scenario.ts`
- Modify: `tests/helpers/game-scenario.test.ts`
- Modify: `tests/controlled-power-ongoing.test.ts`
- Modify: `tests/attack-replacement-ongoing.test.ts`
- Modify: `tests/trigger-dispatch-ongoing.test.ts`
- Modify: `tests/trigger-dispatch.test.ts`
- Modify: `tests/AGENTS.md`

- [x] Добавить `tags?: string[]` в generated-definition branch и defensive copy в `definition.engine.tags`.
- [x] Добавить `givenTemporaryControl()` как thin adapter к production Control Ledger без перемещения карты или изменения owner.
- [x] Добавить `choosePlayerTargetForEffect()` с exact target ID только для указанного effect ID и безопасным `undefined` fallback для остальных effects.
- [x] Мигрировать три ongoing suites и `trigger-dispatch.test.ts` на общий scenario seam.
- [x] Удалить локальные runtime-card builders и manual branded ID assembly из четырёх migrated suites.
- [x] Добавить helper self-tests и structural regression; legacy `tests/action-loop.test.ts` не мигрировать массово.

### Task 9: Close final review regressions and publication gate

- [x] Разрешать target plan до `attackCreated`; empty/error target paths не оставляют phantom attack instrumentation.
- [x] Сохранить порядок typed choice event → `attackCreated` → target lifecycle.
- [x] Останавливать directional chain по результату запрошенной цели: смерть redirected target не продолжает цепь, если исходный defender выжил.
- [x] Делегировать malformed end-turn error semantics самой catalog operation и удалить дублирующую prevalidation из Trigger Dispatch.
- [x] Возвращать malformed end-turn controlled-card payload как catalog error вместо `notApplicable` и останавливать дальнейшую aggregation.
- [x] Выполнять end-turn modifier preflight до первой мутации; публичный `applyAction({ type: "endTurn" })` возвращает typed error и сохраняет player/common state, event log и seeded RNG position.
- [x] Оставить legacy `runtime-regression.test.ts` единым suite и обновить его устаревший malformed end-turn contract; новые regressions вынести в отдельные behavior-named suites.
- [x] На предыдущем полном code snapshot успешно выполнены `npm ci --ignore-scripts`, `npm audit`, `npm run check`, `npm run report:card-runtime-clusters`, `git diff --check origin/master...HEAD` и `git diff --check`; `npm run check` подтвердил 573/573 tests.
- [x] Для текущего final delta выполнены RED→GREEN harness атомарного `endTurn`, strict TypeScript stub-checks публичного wrapper и regression suite, а также focused `git diff --check`.
- [x] GitHub SAST текущего head: чистый runner выполнил `npm ci` и ESLint.
- [x] GitHub `security`, `supply-chain` (OSV) и `codeql-optional` текущего head завершились успешно.
- [x] Выполнить единый `npm run check` на final tree в чистом полном checkout с `assets/`.
- [x] Выполнить `npm audit`, `npm run report:card-runtime-clusters`, `git diff --check origin/master...HEAD`, `git diff --check` и проверку чистого worktree на final tree.
- [x] Повторный Standards review: публичный action API сохранён, malformed operations не скрывают catalog errors, preflight не мутирует state, Trigger Dispatch не возвращает caller-supplied seams, package/lock/workflows не изменены.
- [x] Повторный Spec review: подтверждены target-before-event Attack lifecycle, Control Ledger inventory с singleton, catalog-owned Trigger Dispatch, scenario assembly ownership, exhaustive Decoder/Catalog, immutable Defense payment plan и атомарный end-turn error path.
- [x] PR body синхронизирован с фактическим final head и результатами exact final gate.

**Verification evidence (2026-07-27):** два новых defects сначала воспроизведены отдельными RED jobs: build прошёл, а `directional-chain-redirect` и direct catalog end-turn tests упали на прежней реализации. После минимальных production fixes оба tests стали GREEN; локально прошли strictest TypeScript, ESLint, все engine guards, 44 non-asset suites и runtime-cluster report. Финальный publish gate на чистом GitHub checkout с `assets/` применил только checklist-правку, затем успешно выполнил `npm ci --ignore-scripts`, `npm audit`, единый `npm run check`, cluster report, обе `git diff --check` и проверку чистого worktree; проверенный commit опубликован в ветке PR. PR сохраняет draft-статус.
