# AGENTS.md

## Purpose

This folder contains the deterministic game engine: setup, actions, effect runtime, market flow, simulation, scoring, RNG, event recording, and debug traces.

## Ownership

- Owns runtime behavior under `src/engine/**`.
- Attack Resolution uses focused modules with explicit ownership: `attack-resolution.ts` owns attack amount components, current-attacker modifiers and damage attribution; `attack-defense.ts` owns voluntary Defense, payment/movement transaction, rollback and redirect chains. `effect-runtime.ts` remains the adapter and owns per-target lifecycle orchestration, attack events and final damage application; Mayhem and Mega Mayhem remain separate domain flows.
- `control-ledger.ts` owns the controller-to-object relation, temporary-control lifecycle, physical card-location lookup and removal, and the distinction between all controlled cards and controlled ongoing cards; consumers must not reconstruct control or enumerate physical zones independently.
- `trigger-dispatch.ts` owns timing-aware controlled-card trigger discovery, stable ordering, source attribution, and stop-on-error/game-end behavior. Callers supply the catalog-aware executor through the generic dispatch seam.
- `runtime-effect.ts` owns `RuntimeEffectPayloadMap`; `effect-runtime-registry.ts` validates raw data and returns the corresponding concrete payload before execution.
- Runtime data comes from `data/`; import drafts under `data/import/` are outside executable engine input.
- CLI orchestration lives in `src/cli/`.

## Local Contracts

- Preserve deterministic behavior through seeded RNG.
- Do not add filesystem, terminal, or UI concerns to engine modules except the existing data-loading boundary in `data.ts`.
- Keep card behavior in explicit typed runtime effects and handlers.
- Keep `StatusInstance.effects` and `TrophyLikeInstance.effects` as decoded `RuntimeEffect[]`; do not reintroduce raw records after the data boundary.
- Model runtime effect choices as a discriminated union; record selected typed targets in the event log.
- Route all legal runtime effect choices, including card/player targets, through one typed choice hook; preserve stable order, identity validation, and event compatibility.
- Send closed `GameEventDraft` objects through `event-recorder`; direct `eventLog.push` is confined to that module.
- Keep the typed effect-handler catalog as the source of truth; derive lookup maps from it.
- The effect runtime catalog owns effect ID, source kind, runtime mode, and handler-shape validation at the executable-data boundary.
- Preserve the executable source kind at that boundary: card, wizardProperty, and deadWizardToken are distinct catalog inputs.
- Effect execution resolves every effect through the Effect Runtime Catalog before invoking its handler; Mayhem execution does not use a separate catalog lookup.
- A successful effect may return a typed `playerDefeated` game end with its winner; regular card and activation actions propagate it without adding a card-specific shortcut.
- Passive power and attack replacements read only controlled ongoing cards through `getControlledOngoingCards`.
- Trigger Dispatch requires an ongoing card for `onPlayCard` and `afterFirstAttackDamageEachTurn`; end-turn discovery preserves temporary-control semantics for cards that remain controlled through cleanup.
- Keep `Best-Move Analyzer` modules outside `BotStrategy`: analysis may receive complete `GameState`, inspect hidden information, fork seeded RNG, and enumerate current-turn legal lines through `endTurn` using a caller-supplied evaluation policy; simulation strategies must not depend on the analysis API or future RNG/hidden opponent state.
- The analyzer has no hidden default score: a line becomes “best” only after the caller supplies a named evaluation policy.
- Evaluation policies return a finite `score` and optional finite components; `rankTurnLines` orders strictly by descending score, then stable enumeration order. Terminal `winnerPlayerId` remains metadata and does not affect ranking.
- Give effect handlers concrete typed inputs after the validation boundary; keep raw record access at that boundary.
- Declare each catalog entry's supported runtime modes as a non-empty typed set.
- Add runtime effect IDs only through `effect-runtime-registry.ts`; executable data must not reference IDs outside the Effect Runtime Catalog.
- Do not use localized display names as primary identifiers.
- Preserve existing tested behavior unless the issue explicitly requires a rules change.
- Thread execution/validation mode explicitly instead of adding hidden global assumptions.
- Analysis forks use `forkGameState` to copy mutable state and the current RNG position via `RandomSource.fork()`; immutable definition maps may be shared by reference, while the fork keeps its own event context and continues event/action sequences.
- Runtime decoder сохраняет `source.image` как presentation metadata для API и у runtime-карт, и у runtime-жетонов; gameplay logic не ветвится по path и не читает image files.
- Семантика setup-only effects принадлежит `executeSetup` в каталоге runtime-эффектов; `setup.ts` только задаёт порядок, передаёт контекст и собирает типизированные directives.
- Успешный setup executor может вернуть только типизированную directive с устойчивым идентификатором; отсутствие executor для валидного setup effect является ошибкой конфигурации.
- Контексты setup execution передают `TokenInstanceId`, `TokenDefinitionId` и `CardDefinitionId`; не ослаблять их до обычных строк.

## Work Guidance

- Start mechanics bugs from the narrow module named by the behavior: `actions.ts`, `effect-runtime.ts`, `effect-runtime-registry.ts`, `market-flow.ts`, `setup.ts`, or `data.ts`.
- Prefer deterministic fixtures over broad random simulation for tests.
- Keep event/debug instrumentation additive and stable enough for tests.
- При изменении runtime source metadata проверять, что decoder сохраняет image path без чтения файлов и без ветвления правил по нему.
- `best-move-analysis.ts` получает действия только через публичный `listLegalActions`, создаёт `forkGameState` на каждую ветку и не зависит от `BotStrategy`.
- `best-move-analysis.ts` воспроизводит каждый путь выбора через новый fork исходного состояния; порядок action/choice стабилен, а `AnalysisLimits` завершают переполненный поиск типизированной ошибкой без частичного результата.
- Первый Analyzer scope заканчивается на текущем `endTurn`: переход к следующему игроку не анализируется; game-end от обычного действия также завершает линию.
- `enumerateTurnLines` захватывает `activePlayerId` и `turn.number` исходного состояния до обхода; каждый обычный action обязан сохранить их до terminal line.
- Обход — детерминированный DFS: сначала точный порядок `listLegalActions`, затем точный порядок ветвей `enumerateActionBranches`; terminal line добавляется сразу при `endTurn` или `gameEndReason`.

## Verification

- Run focused tests for the touched behavior, then `npm test` when the blast radius crosses modules.
- Run `npm run typecheck` after TypeScript edits.
- Run `npm run simulate:single` or `npm run simulate:mass` only when simulation-level behavior needs manual confirmation.

## Child DOX Index

None.
