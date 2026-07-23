# PR #137 Review Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть подтверждённые findings повторного ревью PR #137 без изменения правил карт, сохранив draft-статус PR.

**Architecture:** Control Ledger получает отдельный ongoing-card view для passive/replacement consumers; Trigger Dispatch отфильтровывает non-ongoing controlled cards. Defense test fixtures получают устойчивую identity и явные fixture-only selectors. Defense snapshot создаётся только после выбора реальной карты и непосредственно перед первой мутацией. Design/plan описывают Attack Resolution как составную подсистему из amount и defense modules.

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

- [ ] Добавить отрицательные и положительные сценарии ongoing attack replacement и after-attack trigger.
- [ ] Добавить selector regression с production defense перед fixture defense.
- [ ] Добавить regression уникальности fixture IDs после перемещения первой карты из руки.
- [ ] Добавить regression, что decline не вызывает `rng.fork()` и не создаёт rollback snapshot.
- [ ] Включить suite в общий runner и подтвердить RED на текущей реализации.

### Task 2: Add ongoing controlled-card boundary

**Files:**
- Modify: `src/engine/control-ledger.ts`
- Modify: `src/engine/attack-resolution.ts`
- Modify: `src/engine/controlled-power.ts`
- Modify: `src/engine/trigger-dispatch.ts`

- [ ] Добавить `getControlledOngoingCards(state, player)`.
- [ ] Перевести attack replacement и passive controlled power на ongoing view.
- [ ] Не допускать non-ongoing definitions в controlled trigger discovery.
- [ ] Запустить review-findings и затронутые focused suites.

### Task 3: Harden defense fixtures

**Files:**
- Modify: `tests/helpers/defense-fixtures.ts`

- [ ] Заменить `player.hand.length` на state-wide monotonic unique sequence.
- [ ] Сделать `selectFirstFixtureDefense` действительно fixture-only.
- [ ] Добавить `selectFixtureDefenseByInstanceId(instanceId)` для точного выбора.
- [ ] Запустить review-findings, defense-choice, attack-defense и attack-resolution suites.

### Task 4: Defer defense snapshot

**Files:**
- Modify: `src/engine/attack-defense.ts`

- [ ] Перенести `createDefenseMutationSnapshot` после identity validation выбранной defense card и до `defenseChoiceSelected`/cost mutation.
- [ ] Подтвердить, что decline не вызывает `rng.fork()`, а rollback tests остаются зелёными.

### Task 5: Align architecture documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-engine-architecture-deepening-design.md`
- Modify: `docs/superpowers/plans/2026-07-20-engine-architecture-deepening.md`
- Modify: `src/engine/AGENTS.md`

- [ ] Описать Attack Resolution как подсистему из `attack-resolution.ts` и `attack-defense.ts`.
- [ ] Зафиксировать, что amount components принадлежат `attack-resolution.ts`, а defense/redirect transaction — `attack-defense.ts`.
- [ ] Уточнить A2: callers передают named amount state; reconstruction совместимости остаётся adapter responsibility.

### Task 6: Final gate and publication

- [ ] `npm run check`.
- [ ] `npm run report:card-runtime-clusters`.
- [ ] `git diff --check origin/master...HEAD`.
- [ ] Обновить PR body и опубликовать отчёт о выполненных исправлениях.
