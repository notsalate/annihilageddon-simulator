# AGENTS.md

## Purpose

This folder contains the deterministic game engine: setup, actions, effect runtime, market flow, simulation, scoring, RNG, event recording, and debug traces.

## Ownership

- Owns runtime behavior under `src/engine/**`.
- `actions.ts` owns the public action boundary and the read-only `endTurn` modifier preflight. `actions-core.ts` owns the mutating action implementations after that preflight succeeds; callers continue to import the public API only from `actions.ts`.
- `attack-resolution.ts` owns the complete ordinary player-controlled attack lifecycle: attack creation, ordered target resolution, state-sensitive amount calculation, Defense/redirect recursion, damage/death boundary, per-target outcome branches, attribution, attack events, short-circuiting and after-attack dispatch. Chain continuation is evaluated against the requested target; a redirected leg may contribute attribution but cannot report the original defender as killed. `attack-defense.ts` is the transactional submodule for voluntary Defense, immutable payment plans, payment/movement/branch commit and rollback. `effect-runtime-registry.ts` only normalizes typed attack payloads into intents, while `effect-runtime.ts` supplies narrow adapters and shared primitives. Mayhem and Mega Mayhem remain separate two-phase domain flows.
- `control-ledger.ts` owns the controller-to-object relation, temporary-control lifecycle and the physical-card descriptor/traversal seam: array and singleton zones, owner metadata, lookup/removal and card inventory traversal for snapshots. Consumers must not reconstruct control, enumerate physical zones or define parallel inventory helpers.
- `control-ledger.ts` также определяет источники добровольной Defense: обычную руку игрока и зарегистрированные extension-зоны. Перемещение такой карты, создание полного снимка физических зон и их восстановление выполняются только через операции Ledger. Контракт extension-зоны ограничен `read`/`replace`: `read` может возвращать свежую копию, а восстановление обязано вызывать `replace` и проверять результат через descriptor, актуальный на момент rollback. Устойчивый изменяемый массив допустим только как запасной путь, если `replace` выбрасывает исключение и актуальный descriptor всё ещё читает именно этот массив; Defense всегда получает типизированный результат отката.
- `trigger-dispatch.ts` owns controlled-card discovery, timing-aware ongoing policy, source identity, Effect Runtime Catalog resolution, operation-specific applicability, execution, aggregation, stable ordering and stop-on-error/game-end behavior. It also owns `recalculateControlledPower`, including the idempotent turn-power delta. Callers pass only state, controller and a typed operation.
- `runtime-effect.ts` owns the exhaustive `RuntimeEffectPayloadMap`; `runtime-effect-decoder.ts` owns exact decoders for every registered ID; `effect-runtime-registry.ts` binds each decoder to its concrete handler through a typed catalog closure.
- `combat/attack` owns attack and damage effects with `activation`/`onPlay` timing (fixed `attack_gain_status` remains `onPlay` only); `combat/defense` owns `avoid_attack` and defense payloads; `combat/attack-replacement` owns Wand replacement effects with `attackReplacement` timing. These IDs must not return to the transitional handler map.
- `activation` owns the four card activation payloads; `ongoing/passive` owns the five non-Controlled-Power ongoing payloads, with each ID declaring its exact timing and card-only source policy. Controlled-Power IDs remain owned by `values/controlled-power`; all migrated IDs must stay out of the transitional handler map.
- `effective-values.ts` owns Effective Value discovery, stable modifier order, target matching, arithmetic, self-scoring, and specialized calculators; `effective-value-catalog.ts` owns the modifier-family decoder and applicability policy used by the runtime Catalog.
- `effective-value-runtime.ts` binds the public specialized calculators to the registered Effect Runtime Catalog through an explicit dispatcher; Effective Value calculation must not depend on module-load registration or hidden global state.
- Runtime data comes from `data/`; import drafts under `data/import/` are outside executable engine input.
- `benchmark-support.ts` owns benchmark clocks, environment fingerprints, commit identity and shared measurement helpers. `performance-epoch.ts` owns E0 baseline entries, 20-pair calibration, workload comparison and verdicts; it must not silently adopt current results as reference.
- `adjudication.ts` owns player score calculation, the VP → legends → DWT comparison order, and the complete winner list. Simulation, mass simulation, and Best-Move Analyzer consume this shared adjudication contract rather than implementing parallel scoring or winner logic.
- `deck-lifecycle.ts` owns generic seeded shuffle, discard-to-deck refill, and draw primitives. Callers own card placement, transaction boundaries, and event recording; setup, `endTurn`, and Effect Runtime must not define parallel deck helpers.
- `action-transaction.ts` owns the public action rollback contract: failed results and technical exceptions restore engine state, physical zones, mutable object identity, event log and RNG position; successful terminal results commit. `attack-defense.ts` remains the nested sequential Defense savepoint.
- `card-play-resolution.ts` owns the shared placement, ownership, on-play order and final cleanup for normal `playCard`, `play_top_card`, and `play_top_card_from_foe_deck`. After successful ongoing placement it requests the controlled-power operation from Trigger Dispatch. Callers own source-card search/removal, outer transactions, and effect-specific events; they must not reimplement the resolver lifecycle.
- `cards/ownership/choice` owns `reveal_top_card`, `play_top_card`, `play_top_card_from_foe_deck`, and `wild_magic_choice`; these IDs must not return to the transitional handler map. The family allows only card `onPlay`, card `onPlay`/wizard-property `activation` where the payload requires it, and nested Wild Magic effects inherit `onPlay` before Catalog dispatch.
- `events/mayhem` owns all Mayhem and Mega Mayhem effect IDs. `mayhem_attack` accepts the existing `onPlay` fixture path and `onMayhemResolve`; the remaining IDs are Mayhem-resolution effects and all migrated IDs must stay out of the transitional handler map.
- `runtime-data-intake.ts` is the only supported Runtime Data boundary: it accepts filesystem or preloaded sources, distinguishes source/decode/validation failures, and returns one verified immutable pack. `data.ts` decode/validation functions are internal intake building blocks and must not be re-exported through `src/index.ts`.
- CLI orchestration lives in `src/cli/`.

## Local Contracts

- Preserve deterministic behavior through seeded RNG.
- Do not add filesystem, terminal, or UI concerns to engine modules except the Runtime Data loading boundaries in `data.ts` and `runtime-data-intake.ts`.
- Keep card behavior in explicit typed runtime effects and handlers.
- Keep `StatusInstance.effects` and `TrophyLikeInstance.effects` as decoded `RuntimeEffect[]`; do not reintroduce raw records after the data boundary.
- Model runtime effect choices as a discriminated union; record selected typed targets in the event log.
- Route all legal runtime effect choices, including card/player targets, through one typed choice hook; preserve stable order, identity validation, and event compatibility.
- Keep the public effect-choice boundary in `choice-policy.ts`: `ChoiceRequest` exposes only the minimal `ChoicePlayerView` and ID-based `ChoiceView` values, while `ChoicePolicy` returns a stable `choiceId`. Resolve the selected live card/player only inside the engine; the Analyzer may attach private replay index metadata to an ID selection without exposing live objects.
- General runtime effect choices preserve the deterministic first-option fallback for an absent or invalid strategy selection.
- `mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none` is two-phase: resolve every affected player's non-empty typed choice before recording events or moving cards. An absent or invalid selection uses the deterministic first-option fallback; no card, event-log, or RNG mutation occurs before all choices are resolved.
- Send closed `GameEventDraft` objects through `event-recorder`; direct `eventLog.push` is confined to that module.
- Keep the typed effect catalog as the source of truth; every registered ID has one exact decoder and one concrete handler entry, including unsupported IDs.
- Family registration binds a concrete payload ID to its exact decoder, allowed timing/source/mode set, and handler; duplicate IDs fail during catalog assembly. The existing map/switch path remains a transitional adapter only for families not yet migrated.
- `resources/draw` owns `gain_chips`, `gain_chips_per_player_with_status` and `draw_cards`; `life/status` owns `heal`, `set_life`, `gain_status`, `remove_status` and `toggle_status`. These IDs must not return to the transitional handler map and accept only the interactive execution timings declared by their family.
- `optional_spend_chip_attack_damage` accepts `chipCost` as its only payment field and is always optional; its decoder rejects `costs` and `optional`.
- The effect runtime catalog owns effect ID, source kind, runtime mode, exact payload decoding, decoder diagnostics, and concrete handler dispatch at the executable-data boundary; operation consumers must not duplicate catalog prevalidation or convert decoder errors into `notApplicable`.
- Preserve the executable source kind at that boundary: card, wizardProperty, and deadWizardToken are distinct catalog inputs.
- `deadWizardToken` may declare only `modify_effective_value` and `fixture_modify_effective_value`: the regular DWT consumer applies only effective-value modifiers.
- Effect execution resolves every raw effect through a catalog operation that decodes and invokes its concrete handler inside one typed closure; callers must not receive or reconnect a general handler/payload pair. Mayhem execution does not use a separate catalog lookup.
- A successful effect may return a typed `playerDefeated` game end with its winner; regular card and activation actions propagate it without adding a card-specific shortcut.
- Passive power and attack replacements read only controlled ongoing cards through `getControlledOngoingCards`.
- Trigger Dispatch exposes typed `onPlayCard`, `afterPlayerAttackDamage`, `afterDamageDealt`, `collectEndTurnDrawModifier` and `recalculateControlledPower` operations. The first three require an ongoing controlled card; end-turn discovery preserves temporary-control semantics, while controlled-power discovery returns a typed aggregate and applies only its calculated delta instead of exposing raw effects.
- `endTurn` must complete controlled modifier decoding, catalog validation and draw-count calculation before its first mutation. A malformed modifier returns an `ActionResult` error while preserving state, event log and seeded RNG position.
- Keep `Best-Move Analyzer` modules outside `BotStrategy`: analysis may receive complete `GameState`, inspect hidden information, fork seeded RNG, and enumerate current-turn legal lines through `endTurn` using a caller-supplied evaluation policy; simulation strategies must not depend on the analysis API or future RNG/hidden opponent state.
- `BotStrategy` receives an isolated active-player view and public legal actions only; each legal market purchase includes its effective open cost so baseline selection remains deterministic without reading `GameState`. Its `chooseEffectChoice` callback uses `ChoicePolicy`: choice requests expose opaque candidate IDs and minimal player facts, never `GameState`, `PlayerState` or `CardInstance` objects. `PlayerDecisionView` remains limited to the separate action context.
- `RunSingleGameOptions.botFactory` creates one `BotStrategy` for each `PlayerId`; strategy objects and their `chooseAction`/`chooseEffectChoice` callbacks must not serve multiple players. Simulation reads both callback properties once when binding the strategy, validates those exact values and invokes only the captured callbacks with their original strategy receiver. `bot: baselineBot` remains a deterministic compatibility path, and `botFactory` takes priority when both are present. Any other legacy `bot` value fails before setup, even when paired with `botFactory`, and must be removed in favor of the factory.
- The analyzer has no hidden default score: a line becomes “best” only after the caller supplies a named evaluation policy.
- Evaluation policies return a finite `score` and optional finite components; `rankTurnLines` orders strictly by descending score, then stable enumeration order. Terminal `winnerPlayerId` remains metadata and does not affect ranking.
- Give effect handlers concrete typed inputs after the validation boundary; keep raw record access at that boundary and never reintroduce a registered-effect fallback, optional `unknown` field bag, or handler-boundary payload assertion.
- `multi_target_attack` accepts only `target: { selector: "opponentPlayers" }`, and `mayhem_attack` only `target: { selector: "allPlayers" }`; their decoders reject direct `targetSelector` and foreign nested selectors before handlers run.
- Decoder отклоняет effect payload, если одновременно заданы `target` и `targetSelector`; две формы цели не имеют порядка приоритета.
- Declare each catalog entry's supported runtime modes as a non-empty typed set.
- Add runtime effect IDs only through `effect-runtime-registry.ts`; executable data must not reference IDs outside the Effect Runtime Catalog.
- Do not use localized display names as primary identifiers.
- Preserve existing tested behavior unless the issue explicitly requires a rules change.
- Thread execution/validation mode explicitly instead of adding hidden global assumptions.
- Benchmark workload fingerprints exclude the `reference`/`current` role; comparisons require the same epoch, workload volume, one warmup, three measurements, two players and a calibrated environment. Workload changes and uncalibrated environments are non-blocking reports. A fresh 20-pair calibration may supply tolerances for the immediate PR `base`/`head` pair without replacing the immutable E0 calibration.
- Analysis forks use `forkGameState` to copy mutable state and the current RNG position via `RandomSource.fork()`; immutable definition maps may be shared by reference, while the fork keeps its own event context and continues event/action sequences.
- Runtime decoder сохраняет `source.image` как presentation metadata для API и у runtime-карт, и у runtime-жетонов; gameplay logic не ветвится по path и не читает image files.
- `topdeck_gained_card` предлагает выбор `apply`/`decline` только при `optional: true`; отсутствующий флаг и `optional: false` обязательно кладут полученную карту наверх колоды без выбора.
- Семантика setup-only effects принадлежит `executeSetup` в каталоге runtime-эффектов; `setup.ts` только задаёт порядок, передаёт контекст и собирает типизированные directives.
- Успешный setup executor может вернуть только типизированную directive с устойчивым идентификатором; отсутствие executor для валидного setup effect является ошибкой конфигурации.
- Контексты setup execution передают `TokenInstanceId`, `TokenDefinitionId` и `CardDefinitionId`; не ослаблять их до обычных строк.

## Work Guidance

- Start mechanics bugs from the narrow module named by the behavior: `actions.ts` for action-boundary validation, `actions-core.ts` for post-validation mutation, `effect-runtime.ts`, `effect-runtime-registry.ts`, `market-flow.ts`, `setup.ts`, or `data.ts`.
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
