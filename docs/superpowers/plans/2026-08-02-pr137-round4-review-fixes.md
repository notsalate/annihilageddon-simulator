# PR #137 Round 4 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development`. Parallel workers own disjoint worktrees and file groups; the integrator reviews and cherry-picks each accepted range.

**Goal:** Закрыть 12 тикетов round4, повторить полный gate на одном точном удалённом HEAD и убрать ложные completion claims.

**Architecture:** Один отдельный субагент реализует один тикет в изолированном worktree от базы `6d3696c1e8b36d1f59fe581f56118ebd0cec960f`. Изменения в общих файлах остаются независимыми до переноса коммитов; интегратор разрешает конфликты по смыслу. После интеграции выполняются стыковое ревью, тикет 12 и новый точный gate.

**Tech Stack:** TypeScript, Node.js test runner, seeded RNG, Effect Runtime Catalog, Control Ledger, PowerShell, Git worktrees.

## Global Constraints

- Не удалять и не перемещать `.scratch/pr137-review-fixes/`, `.scratch/pr137-review-round3/` и `.scratch/pr137-review-round4/` до переноса нужных материалов. Старые worktree round3 удалены по прямому указанию пользователя.
- Не менять зависимости, lockfile, CI/CD, импортные данные и правила игры вне 12 тикетов.
- Для каждого изменения поведения сначала добавить регрессию и увидеть ожидаемый FAIL.
- Каждый worker отвечает ровно за один тикет и коммитит только его изменения в собственной ветке; интегратор переносит принятые коммиты через `cherry-pick`.
- Не отмечать тикет завершённым до чистого Spec/Standards review его diff.
- Финальный gate включает `npm run check`, `npm run report:runtime-coverage`, требуемый кластерный отчёт, обе диапазонные `git diff --check` и GitHub checks на точном удалённом HEAD.

---

### Task 1: Изолировать stateful BotStrategy между игроками

**Issue:** `.scratch/pr137-review-round4/issues/09-isolate-stateful-bot-strategies-per-player.md`

**Files:**

- Modify: `src/engine/simulation.ts`
- Modify: `src/index.ts` only if the public type export changes
- Test: `tests/simulation.test.ts` or a new behavior-named simulation suite
- Modify: `tests/run-tests.ts` only if a new suite is created

**Interfaces:**

- Consumes: `PlayerId`, `BotStrategy`, `PlayerDecisionView`.
- Produces: player-scoped strategy creation through `botFactory(playerId)`; one strategy instance must never serve two player IDs.

- [ ] Add a stateful regression that fails because one strategy instance observes two players.
- [ ] Run the focused compiled suite and record the expected privacy failure.
- [ ] Add the minimal player-scoped lifecycle while preserving `baselineBot` determinism and Analyzer separation.
- [ ] Run the focused suite, `npm run typecheck`, and review the public API diff.
- [ ] Create one AIC commit and write the worker report.

### Task 2: Unify Defense movement and preserve descriptor storage

**Issues:**

- `.scratch/pr137-review-round4/issues/01-route-defense-movement-through-control-ledger.md`
- `.scratch/pr137-review-round4/issues/02-cover-real-defense-draw-shuffle.md`
- `.scratch/pr137-review-round4/issues/06-preserve-ledger-descriptor-storage-in-fork.md`
- `.scratch/pr137-review-round4/issues/11-remove-double-card-clone-in-analyzer-fork.md`

**Files:**

- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/attack-defense.ts`
- Modify: `src/engine/game-state-fork.ts`
- Test: `tests/attack-defense-snapshot.test.ts`
- Test: `tests/control-ledger-zones.test.ts`
- Test: `tests/game-state-fork.test.ts`
- Test: `tests/attack-resolution.test.ts`

**Interfaces:**

- Consumes: `PhysicalCardZoneDescriptor`, `forkGameState`, Defense payment/rollback contracts.
- Produces: Ledger-owned lookup/removal/movement; descriptor-aware clone contract preserving `Map`; one clone per physical card.

- [ ] Add failing extension-zone Defense commit/rollback tests.
- [ ] Add a failing real `draw_cards` plus discard-shuffle Defense regression.
- [ ] Add a failing target-state `Map` descriptor fork test.
- [ ] Route Defense movement through Ledger and preserve typed rollback errors.
- [ ] Preserve declared collection storage and remove the duplicate physical-card clone pass.
- [ ] Run all four focused suites and `npm run typecheck`.
- [ ] Create separate AIC commits for Defense movement/tests and fork/clone behavior.

### Task 3: Canonicalize payloads and execute declared Mayhem choices

**Issues:**

- `.scratch/pr137-review-round4/issues/03-reject-conflicting-target-representations.md`
- `.scratch/pr137-review-round4/issues/04-align-dead-wizard-token-source-policy.md`
- `.scratch/pr137-review-round4/issues/05-honor-mayhem-destroy-choice.md`

**Files:**

- Modify: `src/engine/runtime-effect-decoder.ts`
- Modify: `src/engine/effect-runtime-registry.ts`
- Modify: `src/engine/effect-runtime.ts` or `src/engine/market-flow.ts` only where the current handler lives
- Test: `tests/validation.test.ts`
- Test: `tests/effect-runtime-applicability.test.ts`
- Test: `tests/action-loop.test.ts`

**Interfaces:**

- Consumes: exhaustive Catalog entries, source-kind policy, typed choice hook.
- Produces: one canonical target form; DWT IDs accepted only when reachable; `destroyBothOrDestroyNone` routed through the normal typed choice seam.

- [ ] Add failing attack/status payload conflict regressions.
- [ ] Add a failing DWT `double_owned_attack_damage` validation regression.
- [ ] Add a failing Mayhem `destroy none` behavior and event regression.
- [ ] Implement the minimal decoder, source policy, and Mayhem choice corrections.
- [ ] Run the three focused suites, `npm run check:engine-typed-access`, and `npm run typecheck`.
- [ ] Create one AIC commit per independently reviewable issue group.

### Task 4: Close trusted-adapter aliases and Windows CLI discovery

**Issues:**

- `.scratch/pr137-review-round4/issues/07-trace-trusted-adapter-alias-origin.md`
- `.scratch/pr137-review-round4/issues/10-discover-windows-cli-script-paths.md`

**Files:**

- Modify: `scripts/lib/check-protected-public-entrypoints.mjs`
- Modify: `scripts/check-engine-typed-access.mjs`
- Modify: matching `.d.mts` declarations if signatures change
- Test: `tests/public-entrypoint-guard.test.ts`
- Test: `tests/engine-guards.test.ts`

**Interfaces:**

- Consumes: canonical traced value origin, closed trusted-adapter allow-list, package script discovery.
- Produces: policy checks against canonical origin; slash-normalized production CLI entrypoints.

- [ ] Add failing local-alias and Windows-separator fixtures.
- [ ] Run the two focused compiled suites and record both expected failures.
- [ ] Apply allow-list decisions to canonical origins and normalize extracted command paths.
- [ ] Run the focused suites and `npm run check:engine-typed-access`.
- [ ] Create separate AIC commits for alias policy and CLI discovery.

### Task 5: Replace effective-value source regex with a behavioral oracle

**Issue:** `.scratch/pr137-review-round4/issues/08-replace-source-regex-with-behavioral-oracle.md`

**Files:**

- Modify: `tests/effective-values.test.ts`
- Modify: `src/engine/effective-values.ts` only if a narrow existing-operation injection seam is required
- Modify: `src/engine/effect-runtime-registry.ts` only after coordination with Task 3

**Interfaces:**

- Consumes: public effective-value calculation entrypoints and Catalog operation result.
- Produces: behavior-level proof that every entrypoint observes an independently distinguishable Catalog result.

- [ ] Add the behavioral mutation oracle before removing the regex assertion.
- [ ] Run the focused suite and verify the oracle fails under the existing bypass challenge.
- [ ] Remove the source-text regex and add only the minimal seam needed by the public behavior test.
- [ ] Run `tests/effective-values.test.ts` and `npm run typecheck`.
- [ ] Create one AIC commit and write the worker report.

### Task 6: Integrate and review code fixes

**Files:**

- Modify only conflict resolutions in files already owned by Tasks 1–5.
- Update round4 issue statuses under `.scratch/pr137-review-round4/issues/` without staging them.

- [ ] Review each worker report and exact commit range.
- [ ] Run one Spec and one Standards review for each accepted domain.
- [ ] Cherry-pick accepted commits in dependency order: Task 1; Task 2 through issue 06; Task 3; Task 4; Task 5; Task 2 issue 11.
- [ ] Resolve only semantic integration conflicts and re-run affected focused suites.
- [ ] Mark issues 01–11 complete only after their reviews are clean.

### Task 7: Reconcile completion claims and run the final gate

**Issue:** `.scratch/pr137-review-round4/issues/12-reconcile-completion-claims-with-active-criteria.md`

**Files:**

- Modify: `docs/superpowers/plans/2026-07-29-pr137-issues-152-176.md`
- Modify: `docs/superpowers/specs/2026-07-29-pr137-issues-152-176-design.md`
- Modify: this plan
- Add: `scripts/check-completion-reconciliation.mjs`
- Add: `tests/completion-reconciliation.test.ts`
- Modify: `tests/run-tests.ts`
- Add: `tests/fixtures/pr137-round4-completion-reconciliation.json`
- Add: `tests/fixtures/completion-reconciliation-unresolved.json`
- Add: `tests/fixtures/completion-reconciliation-closing-claim.json`
- Add: `tests/fixtures/completion-reconciliation-invalid-*.json`
- Add: `tests/fixtures/completion-reconciliation-test-after-code-sha.json`
- Add: `tests/fixtures/completion-reconciliation-missing-active-requirements.json`
- Update: PR #137 body after push

- [x] Add an evidence reconciliation table mapping active requirements, counterexamples, fixes, tests, reviews, and exact code SHA.
- [x] Add machine-checked fixtures for unresolved and alternative closing verdicts; register `completion-reconciliation.test.ts` in `tests/run-tests.ts`.
- [x] Run `node scripts/check-completion-reconciliation.mjs tests/fixtures/pr137-round4-completion-reconciliation.json`.
- [x] Leave `REQ-R3-09-AC03` unresolved and remove conflicting closing claims.
- [x] Run final Spec and Standards review over `62777c389c014ea87b35d0facc7bcaa093795e30...ffe1580fbae94558251c9a585de507e9cbf2c7b5`: обе оси без замечаний.
- [x] На `ffe1580fbae94558251c9a585de507e9cbf2c7b5` прошли `npm run check`, `git diff --check` и `git diff --check 62777c389c014ea87b35d0facc7bcaa093795e30...HEAD`.
- [x] Commit documentation separately, push `2d2356231440e388adbbd9402db13b37108253c2`, wait for its GitHub checks, and synchronize the PR body.
- [ ] Mark issue 12 and the round4 queue complete only after the round5 checker bypasses are fixed and both review axes approve the new remote HEAD.

## Task 7: reconciliation evidence

`scripts/check-completion-reconciliation.mjs` проверяет machine-visible
свидетельства: CODE SHA и fix commits должны быть Git commits в заданном
диапазоне, а test references — существующими suite из `tests/run-tests.ts`
именно в дереве CODE SHA. Checker требует точный frozen-набор active REQ:
`REQ-176-AC01`, `REQ-R3-09-AC02`, `REQ-R3-09-AC03`.
Manifest находится в `tests/fixtures/pr137-round4-completion-reconciliation.json`.
An `unresolved` REQ разрешён только при verdict «есть открытые требования».

Spec и Standards остаются external attestation: manifest содержит их запись,
но validator не проверяет содержание ручного review.

| Active REQ       | Контрпример / finding                                                     | Исправления в интеграции                                  | Тесты                                                                                      | Spec / Standards                        | CODE SHA                                   | Статус     |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------ | ---------- |
| `REQ-176-AC01`   | `FIND-009`: `FIND-003/004/006/007` опровергали закрытие                   | `c117414`, `9381b4a`, `81a5408`, `c3559e9` и их регрессии | `validation`, `effect-runtime-applicability`, `game-state-fork`, `public-entrypoint-guard` | round4 APPROVED; round5 REQUEST CHANGES | `2d2356231440e388adbbd9402db13b37108253c2` | resolved   |
| `REQ-R3-09-AC02` | те же `FIND-003/004/006/007`                                              | те же интеграционные commits                              | те же точечные suites и final gate                                                         | round4 APPROVED; round5 REQUEST CHANGES | `2d2356231440e388adbbd9402db13b37108253c2` | resolved   |
| `REQ-R3-09-AC03` | checker принимал тесты из текущего checkout и позволял удалить active REQ | round5 checker fixes; новый PR body — после push          | `completion-reconciliation.test.ts`, final diff checks                                     | round5 review pending                   | `2d2356231440e388adbbd9402db13b37108253c2` | unresolved |

Пока любая строка unresolved, общий verdict — «есть открытые требования»;
формулировка «без замечаний» запрещена.
