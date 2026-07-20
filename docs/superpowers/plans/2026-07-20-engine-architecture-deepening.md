# Engine Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть findings ревью PR #136 и углубить Attack Resolution, Control Ledger, Trigger Dispatch, test scenarios и typed Effect Decoder/Catalog в одном draft PR с отдельными reviewable commits.

**Architecture:** Поведенческие исправления выполняются первыми. Затем orchestration постепенно переносится из больших runtime-файлов в глубокие domain modules; старые exports остаются тонкими adapters до завершения каждого этапа. Каждый task имеет собственный RED/GREEN цикл и commit.

**Tech Stack:** TypeScript 5.8, Node.js 22, `node:test`, JSON runtime data, GitHub draft PR.

## Global Constraints

- Ветка: `agent/architecture-deepening-findings`; base: `master`.
- Никогда не merge, не включать auto-merge и не переводить PR в ready без явного разрешения пользователя.
- Не добавлять зависимости и не менять package manager/lockfile.
- Mayhem/Mega Mayhem остаются отдельным flow.
- Соблюдать root, `src/engine`, `tests` и `docs` AGENTS.md.
- Каждый task завершается отдельным commit; commits не squash-ить.

---

### Task 1: F1 — typed voluntary defense choice

**Files:**
- Modify: `src/engine/setup.ts`
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/action-loop.test.ts`

**Interfaces:**
- Produces: `RuntimeEffectChoice` variant `{ choiceKind: "defense"; choiceId: string; card: CardInstance | undefined }`.
- Produces: legal choices with first entry `decline` and stable hand-order card entries.

- [ ] Add a failing test where a player with a legal defense declines and takes damage; assert no defense events or costs.
- [ ] Run the focused compiled test and confirm it fails because the first defense is auto-selected.
- [ ] Add the defense choice variant and route `resolveDefenseWindow` through `chooseEffectChoice`; validate returned identity with `choices.includes`.
- [ ] Run the focused test and existing redirect tests; confirm they pass.
- [ ] Commit `fix(defense): направить выбор защиты через стратегию`.

### Task 2: F2 — atomic defense resolution

**Files:**
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/action-loop.test.ts`

**Interfaces:**
- Produces: local `DefenseMutationSnapshot` that restores player hand/deck/discard, chips, life, event-log length and defense-usage sets.

- [ ] Add a failing fixture defense whose branch returns an execution error after a payable cost; assert attack state and all paid resources are unchanged.
- [ ] Run the focused test and confirm partial mutations remain.
- [ ] Snapshot only state touched by defense, execute payment/movement/branch, and rollback on any error before returning it.
- [ ] Re-run atomicity and successful redirect tests.
- [ ] Commit `fix(defense): сделать разрешение защиты атомарным`.

### Task 3: F3 — reusable defense fixture helper

**Files:**
- Create: `tests/helpers/defense-fixtures.ts`
- Modify: `tests/action-loop.test.ts`
- Modify: `tests/AGENTS.md`

**Interfaces:**
- Produces: `addFixtureDefenseCardToHand(state, player, destination, options): CardInstance`.

- [ ] Move the existing builder and its typed options unchanged into `tests/helpers/defense-fixtures.ts`.
- [ ] Import it from action-loop tests and delete the local duplicate.
- [ ] Run TypeScript and the affected tests.
- [ ] Update the tests DOX index/guidance to name the shared scenario helpers.
- [ ] Commit `test(helpers): вынести builder защитных карт`.

### Task 4: A1 — attack lifecycle context

**Files:**
- Modify: `src/engine/effect-runtime-registry.ts`
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/effect-runtime-applicability.test.ts`

**Interfaces:**
- Produces: `AttackIntent`, `AttackAmountState`, `AttackInstanceState`.
- Changes: `resolveAttackTarget(state, intent, targetPlayer): AttackResolution`.

- [ ] Add a compile-time usage test/fixture that constructs one named intent and resolves it.
- [ ] Replace positional arguments with typed context objects without changing behavior.
- [ ] Run typecheck and attack-focused tests.
- [ ] Commit `refactor(attacks): сгруппировать контекст разрешения`.

### Task 5: A2 — attack amount module

**Files:**
- Create: `src/engine/attack-resolution.ts`
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/attack-resolution.test.ts`

**Interfaces:**
- Produces: `createAttackAmountState(baseAmount, sourceOwnerBonus)` and `resolveAttackAmount(state, attacker, target, amountState)`.

- [ ] Add failing focused tests for normal, doubled, self-targeted and redirected amounts.
- [ ] Move amount component calculation and summation into the new module.
- [ ] Keep `effect-runtime.ts` as adapter and rerun tests.
- [ ] Commit `refactor(attacks): вынести расчёт силы атаки`.

### Task 6: A3 — defense and redirect module

**Files:**
- Modify: `src/engine/attack-resolution.ts`
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/attack-resolution.test.ts`

**Interfaces:**
- Produces: `resolveAttackInstance(context): AttackResolution` with injected choice, effect execution, damage and event adapters.

- [ ] Add tests for decline, one defense per player, redirect back, ownerless nonredirectable attack and branch rollback.
- [ ] Move legal defense discovery, atomic mutation and redirect recursion behind the module seam.
- [ ] Run focused and action-loop tests.
- [ ] Commit `refactor(attacks): углубить защиту и перенаправление`.

### Task 7: A4 — normalized attribution

**Files:**
- Modify: `src/engine/attack-resolution.ts`
- Modify: `src/engine/effect-runtime-registry.ts`
- Test: `tests/attack-resolution.test.ts`

**Interfaces:**
- Produces: `summarizeAttackDamage(results): AttackDamageAttribution[]`.

- [ ] Add failing aggregation tests for multi-target and redirected attacks.
- [ ] Move grouping by current attacker/source into Attack Resolution.
- [ ] Route after-attack triggers through normalized attributions.
- [ ] Commit `refactor(attacks): централизовать attribution урона`.

### Task 8: C1 — Control Ledger queries

**Files:**
- Create: `src/engine/control-ledger.ts`
- Modify: `src/engine/effective-values.ts`
- Test: `tests/control-ledger.test.ts`

**Interfaces:**
- Produces: `getControlledCards`, `findCardLocation`, `buildControlledObjectView` adapter.

- [ ] Add tests for permanent, played and owner-discard temporary control plus stale references.
- [ ] Move zone scan/query logic into Control Ledger.
- [ ] Re-export the existing query from its old location temporarily.
- [ ] Commit `refactor(control): добавить единый реестр контроля`.

### Task 9: C2 — temporary-control lifecycle

**Files:**
- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/actions.ts`
- Modify: `src/engine/effect-runtime.ts`
- Modify: `src/engine/game-state-fork.ts`
- Test: `tests/control-ledger.test.ts`

**Interfaces:**
- Produces: `grantTemporaryControl`, `releaseTemporaryControls`, `cloneTemporaryControls`.

- [ ] Add failing lifecycle/fork tests.
- [ ] Replace direct array mutation with ledger operations.
- [ ] Run control, fork and Wild Magic tests.
- [ ] Commit `refactor(control): централизовать временный контроль`.

### Task 10: C3 — move control consumers

**Files:**
- Modify: `src/engine/actions.ts`
- Modify: `src/engine/controlled-power.ts`
- Modify: `src/engine/effect-runtime.ts`
- Modify: `src/engine/effect-runtime-registry.ts`
- Test: `tests/control-ledger.test.ts`

- [ ] Add matrix tests showing every consumer sees the same cards.
- [ ] Route activation, conditions, costs, passive power and end-turn effects through Control Ledger.
- [ ] Commit `refactor(control): перевести consumers на Control Ledger`.

### Task 11: T1 — controlled trigger dispatcher

**Files:**
- Create: `src/engine/trigger-dispatch.ts`
- Test: `tests/trigger-dispatch.test.ts`

**Interfaces:**
- Produces: `dispatchControlledCardEffects({ state, player, timing, predicate, execute }): EffectExecutionResult`.

- [ ] Add ordering, source attribution and stop-on-error tests.
- [ ] Implement the minimal dispatcher over Control Ledger.
- [ ] Commit `refactor(triggers): добавить dispatcher контролируемых карт`.

### Task 12: T2 — on-play and after-attack dispatch

**Files:**
- Modify: `src/engine/effect-runtime.ts`
- Modify: `src/engine/effect-runtime-registry.ts`
- Test: `tests/trigger-dispatch.test.ts`

- [ ] Add regression tests for Wand on-play and first damaging attack.
- [ ] Replace local loops with Trigger Dispatch adapters.
- [ ] Commit `refactor(triggers): перевести игровые triggers на dispatcher`.

### Task 13: T3 — end-turn dispatch

**Files:**
- Modify: `src/engine/trigger-dispatch.ts`
- Modify: `src/engine/effect-runtime.ts`
- Test: `tests/trigger-dispatch.test.ts`

- [ ] Add combined hand-refill/max-life tests.
- [ ] Use dispatcher for controlled end-turn effect discovery.
- [ ] Commit `refactor(triggers): централизовать end-turn discovery`.

### Task 14: S1 — deterministic scenario builder

**Files:**
- Create: `tests/helpers/game-scenario.ts`
- Modify: `tests/AGENTS.md`
- Test: `tests/helpers/game-scenario.test.ts`

**Interfaces:**
- Produces: `createGameScenario`, `givenRuntimeCard`, `chooseEffect`, `play`, `endTurn`.

- [ ] Add a self-test for deterministic setup and stable IDs.
- [ ] Implement only helpers used by the extracted suites.
- [ ] Commit `test(scenarios): добавить deterministic scenario builder`.

### Task 15: S2 — focused Attack Resolution suite

**Files:**
- Create/Modify: `tests/attack-resolution.test.ts`
- Modify: `tests/action-loop.test.ts`

- [ ] Move attack/defense/redirect regressions without changing assertions.
- [ ] Run both suites and confirm no duplicate test registration.
- [ ] Commit `test(attacks): выделить focused suite разрешения атак`.

### Task 16: S3 — focused control/trigger suites

**Files:**
- Modify: `tests/control-ledger.test.ts`
- Modify: `tests/trigger-dispatch.test.ts`
- Modify: `tests/action-loop.test.ts`

- [ ] Move temporary-control and trigger lifecycle regressions.
- [ ] Run focused suites and full test runner.
- [ ] Commit `test(control): выделить lifecycle suites`.

### Task 17: D1 — concrete payload map

**Files:**
- Modify: `src/engine/runtime-effect.ts`
- Test: `tests/validation.test.ts`

**Interfaces:**
- Produces: `RuntimeEffectPayloadMap` and exported `RuntimeEffectForId<Id>`.

- [ ] Add type-level assignments for touched effect IDs and invalid `@ts-expect-error` cases.
- [ ] Define concrete variants for defense and ongoing modifier effects while keeping a compatible fallback for untouched IDs.
- [ ] Commit `refactor(effects): ввести карту concrete payload variants`.

### Task 18: D2 — decoder/catalog narrowing

**Files:**
- Modify: `src/engine/data.ts`
- Modify: `src/engine/effect-runtime-registry.ts`
- Test: `tests/validation.test.ts`

- [ ] Add failing decode tests for invalid destination, redirect flag, timings, amount and card tags.
- [ ] Make the boundary return concrete touched variants after validation.
- [ ] Commit `refactor(effects): сузить payload на границе данных`.

### Task 19: D3 — typed handlers and DOX closeout

**Files:**
- Modify: `src/engine/effect-runtime-registry.ts`
- Modify: `src/engine/AGENTS.md`
- Modify: `src/index.ts`
- Test: `tests/validation.test.ts`

- [ ] Replace raw indexing in touched handlers with concrete properties.
- [ ] Export only stable public payload types.
- [ ] Update engine DOX with Attack Resolution, Control Ledger and Trigger Dispatch ownership.
- [ ] Run `npm run check`, `npm run report:card-runtime-clusters` and `git diff --check`.
- [ ] Commit `refactor(effects): завершить typed handler seam`.

### Task 20: Publish and review gate

**Files:**
- No code changes unless verification finds a defect.

- [ ] Review commit order against F1–F3, A1–A4, C1–C3, T1–T3, S1–S3, D1–D3.
- [ ] Re-run full verification from a clean checkout.
- [ ] Update the draft PR body with exact checks and known limitations.
- [ ] Keep PR draft; do not merge or enable auto-merge.
