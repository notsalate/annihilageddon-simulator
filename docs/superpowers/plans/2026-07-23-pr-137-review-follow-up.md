# PR #137 Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть подтверждённые findings повторных ревью PR #137 без изменения правил карт, сохранив draft-статус PR.

**Architecture:** `attack-resolution.ts` владеет полным lifecycle обычной player-controlled атаки: attack creation, ordered targets, state-sensitive amount, Defense/redirect recursion, damage/death boundary, immediate consequences, outcome branches, attribution, attack events и after-attack hooks. `attack-defense.ts` остаётся transactional submodule для legality, immutable payment plan, payment/movement/branch commit, redirect callback и полного rollback. `effect-runtime-registry.ts` только нормализует concrete typed attack payload в intent, а `effect-runtime.ts` предоставляет узкие adapters и shared primitives. Control Ledger предоставляет отдельный ongoing-card view для passive/replacement consumers и владеет единым descriptor inventory всех физических card locations, включая singleton-зоны, а также lookup/removal. Trigger Dispatch владеет discovery, timing-aware ongoing policy, source identity, Effect Runtime Catalog resolution, operation-specific applicability, execution и aggregation; callers передают только state, controller и typed operation. Mayhem/Mega Mayhem остаются отдельными двухфазными domain flows; terminal карты до возврата game end переходят в соответствующий destroyed stack.

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
- [x] Зафиксировать catalog-owned Trigger Dispatch с typed operations, stop-on-error/game-end и end-turn aggregate без raw effect contexts.
- [x] Зафиксировать descriptor-inventory, physical location/removal и singleton-zone ownership Control Ledger.
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

### Task 9: Final gate and publication

- [x] `npm run build -- --pretty false` на восстановленном source snapshot.
- [x] 19 точечных scenario/ongoing/Trigger Dispatch тестов.
- [x] `npm run typecheck:strictest`.
- [x] Все engine guards (`ts-suppressions`, `unknown-arrays`, `event-recording`, `typed-access`, `json-parse-assertions`).
- [x] `npm run report:card-runtime-clusters`.
- [x] GitHub SAST на текущем code/docs head: чистый runner выполнил `npm ci` и `npm run lint`.
- [x] GitHub `security`, `supply-chain` (OSV) и `codeql-optional`.
- [x] Полный test matrix выполнен по обе стороны `runtime-image-metadata`: все suites зелёные; в compact export единственный ожидаемый failure — existence check каталога `assets/`, намеренно исключённого export workflow.
- [ ] `npm audit` точной командой на runner с registry-доступом.
- [ ] `npm run check` одним процессом в полном checkout с `assets/`.
- [ ] `git diff --check origin/master...HEAD` в checkout с Git history.
- [x] Повторный Standards review текущего final code: helper остаётся thin, дублирующие builders/ID assembly отсутствуют, Trigger Dispatch не возвращает caller-supplied seams, package/lock/workflows и legacy `action-loop.test.ts` не затронуты.
- [x] Повторный Spec review текущего final code: подтверждены полный Attack lifecycle, Control Ledger inventory с singleton, catalog-owned Trigger Dispatch, scenario assembly ownership, exhaustive Decoder/Catalog и единый immutable Defense payment plan; блокирующих findings нет.
- [x] Обновить PR body точным final head, фактическими результатами и незакрытыми exact-gate командами.

**Verification evidence (2026-07-27):** source snapshot текущей ветки восстановлен существующим read-only export workflow без изменений CI. Build, strictest typecheck, focused suites, guards, runtime-cluster report и все non-asset test suites прошли. Штатный SAST подтвердил `npm ci` и ESLint на чистом GitHub runner; security, OSV supply-chain и CodeQL также зелёные. `runtime-image-metadata` подтвердил 9 из 10 contracts и остановился только на отсутствующем файле из намеренно исключённого каталога `assets/`; эта проверка не считается полным `npm run check`. Отдельные Standards/Spec проходы не обнаружили блокирующих архитектурных расхождений. Publication gate остаётся открытым только для трёх явно незакрытых exact-команд выше.
