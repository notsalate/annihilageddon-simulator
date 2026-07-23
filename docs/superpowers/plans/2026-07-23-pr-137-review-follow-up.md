# PR #137 Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть подтверждённые findings повторного ревью PR #137 без изменения правил карт, сохранив draft-статус PR.

**Architecture:** Control Ledger предоставляет отдельный ongoing-card view для passive/replacement consumers; Trigger Dispatch применяет ongoing guard к `onPlayCard` и after-attack reactions, сохраняя временный контроль для end-turn discovery до cleanup. Defense test fixtures получают устойчивую identity и явные fixture-only selectors. Defense snapshot создаётся только после выбора реальной карты, но хранит pre-choice границу event log для полного rollback. Design и этот follow-up plan описывают Attack Resolution как составную подсистему из amount и defense modules.

**Tech Stack:** TypeScript 5.8, Node.js 22, `node:test`, GitHub Actions.

## Global Constraints

- Ветка: `agent/architecture-deepening-findings`; PR #137 остаётся draft.
- Не включать auto-merge и не объединять с `master`.
- Не добавлять зависимости и не менять package manager/lockfile.
- Mayhem/Mega Mayhem остаются отдельными domain flows.
- Каждый behavioral fix проходит RED→GREEN.

---

### Task 1: Reproduce review findings

**Files:**
- Create: `tests/review-findings.test.ts`
- Modify: `tests/run-tests.ts`

- [x] Добавить отрицательные и положительные сценарии ongoing attack replacement и after-attack trigger.
- [x] Добавить selector regression с production defense перед fixture defense.
- [x] Добавить regression уникальности fixture IDs после перемещения первой карты из руки.
- [x] Добавить regression, что decline не вызывает `rng.fork()` и не создаёт rollback snapshot.
- [x] Включить suite в общий runner и подтвердить RED на текущей реализации.

### Task 2: Add ongoing controlled-card boundary

**Files:**
- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/attack-resolution.ts`
- Modify: `src/engine/controlled-power.ts`
- Modify: `src/engine/trigger-dispatch.ts`

- [x] Добавить `getControlledOngoingCards(state, player)`.
- [x] Перевести attack replacement и passive controlled power на ongoing view.
- [x] Запретить non-ongoing definitions для `onPlayCard` и after-attack reactions, сохранив end-turn temporary-control semantics.
- [x] Запустить review-findings и затронутые focused suites.

### Task 3: Harden defense fixtures

**Files:**
- Modify: `tests/helpers/defense-fixtures.ts`

- [x] Заменить `player.hand.length` на state-wide monotonic unique sequence.
- [x] Сделать `selectFirstFixtureDefense` действительно fixture-only.
- [x] Добавить `selectFixtureDefenseByInstanceId(instanceId)` для точного выбора.
- [x] Запустить review-findings, defense-choice, attack-defense и attack-resolution suites.

### Task 4: Defer defense snapshot

**Files:**
- Modify: `src/engine/attack-defense.ts`

- [x] Перенести `createDefenseMutationSnapshot` после identity validation выбранной defense card и до `defenseChoiceSelected`/cost mutation.
- [x] Сохранить pre-choice event-log length, чтобы branch failure откатывал typed choice event.
- [x] Подтвердить, что decline не вызывает `rng.fork()`, а rollback tests остаются зелёными.

### Task 5: Align architecture documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-engine-architecture-deepening-design.md`
- Create: `docs/superpowers/plans/2026-07-23-pr-137-review-follow-up.md`
- Modify: `src/engine/AGENTS.md`
- Modify: `tests/AGENTS.md`

- [x] Описать Attack Resolution как подсистему из `attack-resolution.ts` и `attack-defense.ts`.
- [x] Зафиксировать, что amount components принадлежат `attack-resolution.ts`, а defense/redirect transaction — `attack-defense.ts`.
- [x] Уточнить A2: callers передают named amount state; reconstruction совместимости остаётся adapter responsibility.
- [x] Зафиксировать timing-aware Trigger Dispatch и exact defense selector contract.

### Task 6: Final gate and publication

- [x] `npm run check`.
- [x] `npm run report:card-runtime-clusters`.
- [x] `git diff --check origin/master...HEAD`.
- [x] Удалить временный verification workflow.
- [x] Обновить PR body и опубликовать отчёт о выполненных исправлениях.
