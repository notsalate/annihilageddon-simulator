import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  applyAction,
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  runMarketFlow,
  scoreGame,
  type CardDefinition,
  type CardInstance,
  type PlayerState,
} from "../src/index.js";
import { gainDeadWizardToken } from "../src/engine/effect-runtime.js";
import {
  readCrossSourceCoveragePlan,
  type CrossSourceSemanticMapping,
  type CrossSourceRuntimeRef,
} from "../src/import/cross-source-runtime-coverage.js";
import {
  createGameScenario,
  clearPhysicalCardZone,
  endTurn,
  givenRuntimeCard,
  chooseEffect,
  moveCardToCommonZone,
  resolveMayhemThroughMarket,
  type GameScenario,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

function runCardSemanticEvidence(definitionId: string, seed: number): void {
  const scenario = createGameScenario({ rootDir, seed });
  const card = givenRuntimeCard(scenario, {
    definitionId,
    instanceId: definitionId,
  });
  const beforePlaySnapshot = snapshotExternallyObservableState(scenario, card);
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
  assertCardRuntimeEvidence(scenario, card, definitionId, beforePlaySnapshot);
}

function assertCardRuntimeEvidence(
  scenario: GameScenario,
  card: CardInstance,
  definitionId: string,
  beforePlaySnapshot: string
): void {
  const definition = scenario.state.cardDefinitions.get(definitionId);
  assert.ok(definition, `runtime definition is missing for ${definitionId}`);
  assert.equal(card.definitionId, definitionId);
  assert.ok(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "cardPlayed" &&
        event.cardInstanceId === card.instanceId &&
        event.definitionId === definitionId
    ),
    `public play action did not record ${definitionId} as cardPlayed`
  );

  const planEntry = readCrossSourceCoveragePlan(rootDir).get(definitionId);
  assert.ok(planEntry, `coverage plan is missing for ${definitionId}`);
  assert.equal(planEntry.objectKind, "card");
  assert.ok(planEntry.semanticMappings.length > 0);

  const observedEffectKeys = assertCardRuntimeExecutionEvidence(
    scenario,
    card,
    definition,
    beforePlaySnapshot
  );

  for (const mapping of planEntry.semanticMappings) {
    assertCardRuntimeMappingEvidence(
      definition,
      definitionId,
      mapping,
      observedEffectKeys
    );
  }
}

function assertCardRuntimeMappingEvidence(
  definition: CardDefinition,
  definitionId: string,
  mapping: CrossSourceSemanticMapping,
  observedEffectKeys: ReadonlySet<string>
): void {
  assert.ok(
    mapping.runtimeRefs.length > 0,
    `mapping ${mapping.draftPoint.path} has no runtime references`
  );

  for (const runtimeRef of mapping.runtimeRefs) {
    assertCardRuntimeReference(
      definition,
      runtimeRef,
      definitionId,
      mapping.draftPoint.path
    );
    if (runtimeRef.kind !== "effect") {
      continue;
    }

    const effectKey = runtimeEffectKey(runtimeRef);
    assert.ok(
      observedEffectKeys.has(effectKey),
      `${definitionId} ${mapping.draftPoint.path} has no mapping-specific external observation for ${effectKey}`
    );
    if (effectKey === "add_power@onPlay") {
      assertMappedAddPowerOutcome(definition, mapping, mapping.draftPoint.path);
    }
  }
}

function runtimeEffectKey(effect: {
  effectId: string;
  timing: string;
}): string {
  return `${effect.effectId}@${effect.timing}`;
}

function assertMappedAddPowerOutcome(
  definition: CardDefinition,
  mapping: CrossSourceSemanticMapping,
  draftPointPath: string
): void {
  const expectedAmounts = mapping.runtimeRefs
    .filter(
      (
        runtimeRef
      ): runtimeRef is Extract<CrossSourceRuntimeRef, { kind: "effect" }> =>
        runtimeRef.kind === "effect" &&
        runtimeRef.effectId === "add_power" &&
        runtimeRef.timing === "onPlay"
    )
    .map((runtimeRef) => runtimeRef.fields["amount"]);
  assert.ok(
    expectedAmounts.every((amount) => typeof amount === "number"),
    `${definition.cardId} ${draftPointPath} add_power mapping has a non-numeric amount`
  );
  const expectedTotal = expectedAmounts.reduce(
    (total, amount) => total + Number(amount),
    0
  );
  const addPowerEffects = definition.engine.effects.filter(
    (effect) => effect.effectId === "add_power" && effect.timing === "onPlay"
  );
  const isolatedScenario = createGameScenario({
    rootDir,
    seed: 389000 + definition.cardId.length,
  });
  const isolatedCard = givenRuntimeCard(isolatedScenario, {
    cardId: `${definition.cardId}__mapped-add-power`,
    effects: addPowerEffects,
    cardKind: definition.engine.cardKind,
    cardTypes: definition.engine.cardTypes,
  });
  if (
    addPowerEffects.some(
      (effect) => "condition" in effect && effect.condition !== undefined
    )
  ) {
    for (let index = 0; index < 2; index += 1) {
      givenRuntimeCard(isolatedScenario, {
        player: isolatedScenario.activePlayer,
        zone: "permanents",
        definitionId: definition.cardId,
      });
    }
  }
  const beforePower = isolatedScenario.state.turn.power;
  assert.deepEqual(play(isolatedScenario, isolatedCard), { ok: true });
  assert.equal(
    isolatedScenario.state.turn.power - beforePower,
    expectedTotal,
    `${definition.cardId} ${draftPointPath} did not apply mapped add_power amount ${String(expectedTotal)}`
  );
}

function assertCardRuntimeExecutionEvidence(
  scenario: GameScenario,
  card: CardInstance,
  definition: CardDefinition,
  beforePlaySnapshot: string
): Set<string> {
  const observedEffectKeys = new Set<string>();
  const effects = definition.engine.effects;
  const onPlayEffects = effects.filter(
    (candidate) => candidate.timing === "onPlay"
  );
  if (onPlayEffects.length > 0) {
    assert.notEqual(
      beforePlaySnapshot,
      snapshotExternallyObservableState(scenario, card),
      `${definition.cardId} did not change an externally observable result when played`
    );
    for (const effect of onPlayEffects) {
      if (!hasSourceEffectEvent(scenario, card, effect.effectId)) {
        assertOnPlayEffectEvidence(definition.cardId, effect.effectId);
      }
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }

  if (effects.some((effect) => effect.timing === "onDefense")) {
    assertDefenseEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "onDefense"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "activation")) {
    assertActivationEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "activation"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "onGain")) {
    assertOnGainEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "onGain"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "onGainCard")) {
    assertOnGainCardEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "onGainCard"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "onPlayCard")) {
    assertOnPlayCardEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "onPlayCard"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "attackReplacement")) {
    assertAttackReplacementEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "attackReplacement"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "afterDamageDealt")) {
    assertAfterDamageEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "afterDamageDealt"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (
    effects.some((effect) => effect.timing === "afterFirstAttackDamageEachTurn")
  ) {
    assertFirstAttackEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "afterFirstAttackDamageEachTurn"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "endTurn")) {
    assertEndTurnEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "endTurn"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "startOfControllerTurn")) {
    assertStartOfTurnEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "startOfControllerTurn"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "afterControllerPlaysCard")) {
    assertAfterControllerPlaysCardEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "afterControllerPlaysCard"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "whileControlled")) {
    assertWhileControlledEffectEvidence(scenario, definition);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "whileControlled"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "whileScoring")) {
    assertWhileScoringEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "whileScoring"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "scoring")) {
    assertScoringEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "scoring"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  if (effects.some((effect) => effect.timing === "onMayhemResolve")) {
    assertMayhemEffectEvidence(definition.cardId);
    for (const effect of effects.filter(
      (candidate) => candidate.timing === "onMayhemResolve"
    )) {
      observedEffectKeys.add(runtimeEffectKey(effect));
    }
  }
  return observedEffectKeys;
}

function hasSourceEffectEvent(
  scenario: GameScenario,
  source: CardInstance,
  effectId: string
): boolean {
  return scenario.state.eventLog.some(
    (event) =>
      event.effectId === effectId &&
      event.cardInstanceId === source.instanceId &&
      event.definitionId === source.definitionId
  );
}

function snapshotExternallyObservableState(
  scenario: GameScenario,
  source: CardInstance
): string {
  const snapshot = JSON.stringify(scenario.state, (key, value: unknown) => {
    if (
      key === "eventLog" ||
      key === "rng" ||
      key === "cardDefinitions" ||
      key === "tokenDefinitions" ||
      key === "effectChoiceStrategy"
    ) {
      return undefined;
    }
    if (isSourceCardSnapshot(value, source)) {
      return undefined;
    }
    return value;
  });
  assert.ok(snapshot !== undefined);
  return snapshot;
}

function isSourceCardSnapshot(value: unknown, source: CardInstance): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record["instanceId"] === source.instanceId &&
    record["definitionId"] === source.definitionId &&
    "marketChips" in record
  );
}

function assertSourceEffectEvent(
  scenario: GameScenario,
  source: CardInstance,
  effectId: string
): void {
  assert.ok(
    hasSourceEffectEvent(scenario, source, effectId),
    `${source.definitionId} did not produce an observable ${effectId} result`
  );
}

function createCardEvidenceScenario(
  definitionId: string,
  seed: number
): { scenario: GameScenario; card: CardInstance } {
  const scenario = createGameScenario({ rootDir, seed, playerCount: 2 });
  const card = givenRuntimeCard(scenario, {
    definitionId,
    instanceId: `${definitionId}-${seed}`,
  });
  return { scenario, card };
}

function chooseFoeTarget(scenario: GameScenario): void {
  const foe = scenario.foes[0];
  assert.ok(foe);
  chooseEffect(scenario, (request) => {
    if (request.requestKind !== "effect") {
      return undefined;
    }
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "playerTarget" &&
        candidate.targetPlayerIds.includes(foe.playerId)
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  });
}

function chooseCardTarget(
  scenario: GameScenario,
  effectId: string,
  targetInstanceId?: string
): void {
  chooseEffect(scenario, (request) => {
    if (request.requestKind !== "effect" || request.effectId !== effectId) {
      return undefined;
    }
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "cardTarget" &&
        (targetInstanceId === undefined ||
          candidate.targetCardInstanceIds.includes(targetInstanceId))
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  });
}

function addDinglerStatus(player: PlayerState, seed: number): void {
  player.statuses.push({
    instanceId: `card-runtime-evidence-dingler-${seed}-${player.playerId}`,
    statusId: "dingler",
    ownerId: player.playerId,
    effects: [],
  });
}

function addDeadWizardToken(scenario: GameScenario, player: PlayerState): void {
  const result = gainDeadWizardToken(scenario.state, player);
  assert.equal(result.ok, true);
}

function assertOnPlayEffectEvidence(
  definitionId: string,
  effectId: string
): void {
  const { scenario, card } = createCardEvidenceScenario(
    definitionId,
    373000 + definitionId.length
  );
  const active = scenario.activePlayer;
  const foe = scenario.foes[0];
  assert.ok(foe);

  switch (effectId) {
    case "arm_next_attack_unavoidable":
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.equal(
        scenario.state.turn.nextAttackUnavoidablePlayerId,
        active.playerId
      );
      return;
    case "add_power_per_controlled_dead_wizard_token": {
      addDeadWizardToken(scenario, active);
      const beforePower = scenario.state.turn.power;
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(scenario.state.turn.power > beforePower);
      return;
    }
    case "distributed_attack_damage": {
      foe.hand = [];
      givenRuntimeCard(scenario, {
        player: active,
        zone: "permanents",
        definitionId: "esw2_dbg__legend_005",
      });
      const beforeLife = foe.life.current;
      chooseFoeTarget(scenario);
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(foe.life.current < beforeLife);
      return;
    }
    case "attack_damage_equal_to_controlled_card_cost": {
      givenRuntimeCard(scenario, {
        player: active,
        zone: "permanents",
        definitionId: "esw2_dbg__legend_005",
      });
      const beforeLife = foe.life.current;
      chooseFoeTarget(scenario);
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(foe.life.current < beforeLife);
      return;
    }
    case "destroy_own_cards": {
      const target = givenRuntimeCard(scenario, {
        player: active,
        zone: "discard",
        definitionId: "esw2_dbg__main_002",
      });
      chooseCardTarget(scenario, effectId, target.instanceId);
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(!hasCardInPlayerZones(active, target.instanceId));
      return;
    }
    case "optional_gain_market_cards_to_hand_this_turn": {
      assert.deepEqual(play(scenario, card), { ok: true });
      const gained = givenRuntimeCard(scenario, {
        player: active,
        definitionId: "esw2_dbg__main_002",
      });
      moveCardToCommonZone(scenario, gained, "mainMarket");
      scenario.state.turn.power = 100;
      assert.deepEqual(
        applyAction(scenario.state, {
          type: "buyMarketCard",
          cardInstanceId: gained.instanceId,
          source: "mainMarket",
        }),
        { ok: true }
      );
      assert.ok(
        active.hand.some(
          (candidate) => candidate.instanceId === gained.instanceId
        )
      );
      return;
    }
    case "attack_damage_per_controlled_dead_wizard_token": {
      addDeadWizardToken(scenario, active);
      const beforeLife = foe.life.current;
      chooseFoeTarget(scenario);
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(foe.life.current < beforeLife);
      return;
    }
    case "arm_dead_wizard_token_kill_replacement":
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.equal(
        scenario.state.turn.deadWizardTokenKillReplacement?.cardInstanceId,
        card.instanceId
      );
      return;
    case "optional_spend_chip_destroy_own_cards": {
      scenario.activePlayer.chips = 10;
      const target = givenRuntimeCard(scenario, {
        player: active,
        zone: "discard",
        definitionId: "esw2_dbg__main_002",
      });
      const beforeChips = active.chips;
      chooseCardTarget(scenario, effectId, target.instanceId);
      assert.deepEqual(play(scenario, card), { ok: true });
      assert.ok(active.chips < beforeChips);
      assert.ok(!hasCardInPlayerZones(active, target.instanceId));
      return;
    }
    default:
      throw new Error(
        `${definitionId} has no positive execution witness for onPlay effect ${effectId}`
      );
  }
}

function hasCardInPlayerZones(
  player: PlayerState,
  instanceId: CardInstance["instanceId"]
): boolean {
  return [
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...player.playedThisTurn,
    ...player.permanents,
  ].some((card) => card.instanceId === instanceId);
}

function assertDefenseEffectEvidence(definitionId: string): void {
  const { scenario, card: defense } = createCardEvidenceScenario(
    definitionId,
    374000 + definitionId.length
  );
  const attacker = scenario.activePlayer;
  const defender = scenario.foes[0];
  assert.ok(defender);
  attacker.hand = [];
  defense.ownerId = defender.playerId;
  defender.hand = [defense];
  defender.chips = 20;
  defender.life.current = Math.max(defender.life.current, 20);
  givenRuntimeCard(scenario, {
    player: defender,
    definitionId: "esw2_dbg__main_002",
  });
  if (definitionId.endsWith("familiar_008")) {
    givenRuntimeCard(scenario, {
      player: defender,
      zone: "discard",
      definitionId: "esw2_dbg__starter_003",
    });
  }
  if (definitionId.endsWith("main_043")) {
    givenRuntimeCard(scenario, {
      player: defender,
      zone: "discard",
      definitionId: "esw2_dbg__legend_005",
    });
  }
  chooseEffect(scenario, (request) => {
    if (request.requestKind !== "effect") {
      return undefined;
    }
    if (request.effectId === "avoid_attack") {
      const choice = request.choices.find(
        (candidate) =>
          candidate.choiceKind === "defense" &&
          candidate.targetCardInstanceId === defense.instanceId
      );
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "playerTarget" &&
        candidate.targetPlayerIds.includes(defender.playerId)
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  });
  const attack = givenRuntimeCard(scenario, {
    player: attacker,
    definitionId: "esw2_dbg__starter_003",
  });
  assert.deepEqual(play(scenario, attack), { ok: true });
  assertSourceEffectEvent(scenario, defense, "avoid_attack");
  assert.ok(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.targetPlayerId === defender.playerId
    ),
    `${definitionId} did not produce an observable avoided attack`
  );
}

function assertActivationEffectEvidence(definitionId: string): void {
  const { scenario, card } = createCardEvidenceScenario(
    definitionId,
    375000 + definitionId.length
  );
  const active = scenario.activePlayer;
  if (definitionId.endsWith("main_006")) {
    addDinglerStatus(active, scenario.seed);
    active.life.current = 10;
  }
  if (
    ["main_012", "main_014", "main_034", "main_048", "main_055"].some(
      (suffix) => definitionId.endsWith(suffix)
    )
  ) {
    givenRuntimeCard(scenario, {
      player: active,
      zone: "permanents",
      definitionId: "esw2_dbg__legend_005",
    });
  }
  if (definitionId.endsWith("legend_018")) {
    for (let index = 0; index < 11; index += 1) {
      givenRuntimeCard(scenario, {
        player: active,
        zone: "permanents",
        definitionId: "esw2_dbg__legend_005",
      });
    }
  }
  if (definitionId.endsWith("main_014")) {
    givenRuntimeCard(scenario, {
      player: active,
      definitionId: "esw2_dbg__main_002",
    });
  }
  chooseFoeTarget(scenario);
  chooseCardTarget(scenario, "conditional_activation_destroy_own_cards");
  assert.deepEqual(play(scenario, card), { ok: true });
  const result = applyAction(scenario.state, {
    type: "activatePermanent",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
  for (const effect of getCardDefinition(scenario, definitionId).engine
    .effects) {
    if (effect.timing === "activation") {
      assertSourceEffectEvent(scenario, card, effect.effectId);
    }
  }
}

function assertOnGainEffectEvidence(definitionId: string): void {
  const { scenario, card } = createCardEvidenceScenario(
    definitionId,
    376000 + definitionId.length
  );
  const active = scenario.activePlayer;
  moveCardToCommonZone(scenario, card, "mainMarket");
  scenario.state.turn.power = 100;
  assert.deepEqual(
    applyAction(scenario.state, {
      type: "buyMarketCard",
      cardInstanceId: card.instanceId,
      source: "mainMarket",
    }),
    { ok: true }
  );
  assertSourceEffectEvent(scenario, card, "on_gain_self_gain_limp_wands");
  assert.ok(
    active.discard.filter(
      (candidate) => candidate.definitionId === "esw2_dbg__limp_wand"
    ).length >= 2
  );
}

function assertOnGainCardEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    377000 + definitionId.length
  );
  const active = scenario.activePlayer;
  assert.deepEqual(play(scenario, source), { ok: true });
  const gained = givenRuntimeCard(scenario, {
    player: active,
    definitionId: "esw2_dbg__legend_005",
  });
  moveCardToCommonZone(scenario, gained, "legendMarket");
  active.chips = 100;
  assert.deepEqual(
    applyAction(scenario.state, {
      type: "buyMarketCard",
      cardInstanceId: gained.instanceId,
      source: "legendMarket",
    }),
    { ok: true }
  );
  assert.equal(active.deck[0]?.instanceId, gained.instanceId);
  assert.equal(active.permanents[0]?.instanceId, source.instanceId);
}

function assertOnPlayCardEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    378000 + definitionId.length
  );
  assert.deepEqual(play(scenario, source), { ok: true });
  chooseFoeTarget(scenario);
  const wand = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_003",
  });
  assert.deepEqual(play(scenario, wand), { ok: true });
  assertSourceEffectEvent(
    scenario,
    source,
    "ongoing_add_power_when_playing_wand"
  );
}

function assertAttackReplacementEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    379000 + definitionId.length
  );
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.life.current = 20;
  assert.deepEqual(play(scenario, source), { ok: true });
  chooseFoeTarget(scenario);
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 1,
        targetSelector: "chosenFoe",
        attackSemantics: {
          resolver: "playerControlled",
          instanceMode: "single",
          defenseWindowMode: "PER_TARGET",
          targetApplications: "single",
          attackText: "perTarget",
          continuation: "none",
        },
      },
    ],
    tags: ["wandAttackCard"],
  });
  assert.deepEqual(play(scenario, attack), { ok: true });
  const damage = 20 - foe.life.current;
  assert.equal(
    damage,
    definitionId.endsWith("legend_008") ? 2 : 4,
    `${definitionId} did not change the real attack result`
  );
}

function assertAfterDamageEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    380000 + definitionId.length
  );
  const active = scenario.activePlayer;
  const foe = scenario.foes[0];
  assert.ok(foe);
  active.life.current = 10;
  foe.life.current = 20;
  assert.deepEqual(play(scenario, source), { ok: true });
  chooseFoeTarget(scenario);
  const attack = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_003",
  });
  assert.deepEqual(play(scenario, attack), { ok: true });
  assertSourceEffectEvent(
    scenario,
    source,
    "heal_equal_damage_dealt_on_own_turn"
  );
  assert.equal(active.life.current, 12);
}

function assertFirstAttackEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    381000 + definitionId.length
  );
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.life.current = 20;
  assert.deepEqual(play(scenario, source), { ok: true });
  chooseFoeTarget(scenario);
  const attack = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_003",
  });
  assert.deepEqual(play(scenario, attack), { ok: true });
  assertSourceEffectEvent(
    scenario,
    source,
    "ongoing_first_attack_damage_add_power"
  );
  assert.ok(scenario.state.turn.power > 1);
}

function assertEndTurnEffectEvidence(definitionId: string): void {
  const baseline = createGameScenario({
    rootDir,
    seed: 382000 + definitionId.length,
    playerCount: 2,
  });
  const baselinePlayerId = baseline.activePlayer.playerId;
  assert.deepEqual(endTurn(baseline), { ok: true });
  const baselineDraw = getDrawAmount(baseline, baselinePlayerId);

  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    382000 + definitionId.length
  );
  const sourcePlayerId = scenario.activePlayer.playerId;
  if (definitionId.endsWith("legend_010")) {
    scenario.activePlayer.life.current = scenario.activePlayer.life.max;
  }
  assert.deepEqual(play(scenario, source), { ok: true });
  assert.deepEqual(endTurn(scenario), { ok: true });
  const draw = getDrawAmount(scenario, sourcePlayerId);
  assert.equal(
    draw,
    baselineDraw + (definitionId.endsWith("legend_010") ? 2 : 1),
    `${definitionId} did not change the real end-turn draw result`
  );
}

function getDrawAmount(scenario: GameScenario, playerId: string): number {
  const event = [...scenario.state.eventLog]
    .reverse()
    .find(
      (candidate) =>
        candidate.type === "handDrawn" && candidate.playerId === playerId
    );
  assert.ok(event);
  if (event.amount === undefined) {
    throw new Error(`handDrawn event for ${playerId} has no amount`);
  }
  return event.amount;
}

function assertStartOfTurnEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    383000 + definitionId.length
  );
  assert.deepEqual(play(scenario, source), { ok: true });
  chooseEffect(scenario, (request) => {
    if (
      request.requestKind === "effect" &&
      request.effectId === "ongoing_start_turn_optional_gain_limp_wand_to_hand"
    ) {
      const choice = request.choices[0];
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    return undefined;
  });
  assert.deepEqual(endTurn(scenario), { ok: true });
  assert.deepEqual(endTurn(scenario), { ok: true });
  assertSourceEffectEvent(
    scenario,
    source,
    "ongoing_start_turn_optional_gain_limp_wand_to_hand"
  );
  const limpWand = scenario.activePlayer.hand.find(
    (candidate) => candidate.definitionId === "esw2_dbg__limp_wand"
  );
  assert.ok(limpWand);
  assert.deepEqual(play(scenario, limpWand), { ok: true });
  assertSourceEffectEvent(
    scenario,
    source,
    "ongoing_add_power_when_playing_limp_wand"
  );
}

function assertAfterControllerPlaysCardEffectEvidence(
  definitionId: string
): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    383500 + definitionId.length
  );
  assert.deepEqual(play(scenario, source), { ok: true });
  const beforePower = scenario.state.turn.power;
  const limpWand = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__limp_wand",
  });
  assert.deepEqual(play(scenario, limpWand), { ok: true });
  assert.equal(
    scenario.state.turn.power,
    beforePower + 3,
    `${definitionId} did not apply the mapped power bonus after playing a limp wand`
  );
}

function assertWhileControlledEffectEvidence(
  scenario: GameScenario,
  definition: CardDefinition
): void {
  if (
    definition.cardId.endsWith("familiar_007") ||
    definition.cardId.endsWith("main_044")
  ) {
    const target = givenRuntimeCard(scenario, {
      definitionId: "esw2_dbg__legend_005",
    });
    const targetDefinition = getCardDefinition(
      scenario,
      "esw2_dbg__legend_005"
    );
    assert.equal(
      calculateEffectiveCardCost(
        scenario.state,
        scenario.activePlayer.playerId,
        targetDefinition,
        target
      ),
      targetDefinition.engine.cost - 2
    );
    return;
  }

  if (definition.cardId.endsWith("main_005")) {
    assert.equal(scenario.state.turn.controlledPowerBonus, 1);
    return;
  }
  if (definition.cardId.endsWith("main_011")) {
    assert.equal(scenario.state.turn.controlledPowerBonus, 1);
    return;
  }

  const { scenario: witness, card } = createCardEvidenceScenario(
    definition.cardId,
    384000 + definition.cardId.length
  );
  if (definition.cardId.endsWith("main_027")) {
    addDinglerStatus(witness.activePlayer, witness.seed);
  }
  if (definition.cardId.endsWith("legend_025")) {
    addDeadWizardToken(witness, witness.activePlayer);
  }
  assert.deepEqual(play(witness, card), { ok: true });
  assert.equal(
    witness.state.turn.controlledPowerBonus,
    definition.cardId.endsWith("main_027") ? 2 : 1
  );
}

function assertWhileScoringEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    385000 + definitionId.length
  );
  if (definitionId.endsWith("legend_004")) {
    givenRuntimeCard(scenario, {
      zone: "permanents",
      definitionId: "esw2_dbg__legend_005",
    });
  }
  if (definitionId.endsWith("main_040")) {
    givenRuntimeCard(scenario, {
      zone: "permanents",
      definitionId: "esw2_dbg__legend_005",
    });
  }
  if (definitionId.endsWith("main_027")) {
    addDinglerStatus(scenario.activePlayer, scenario.seed);
  }
  assert.deepEqual(play(scenario, source), { ok: true });
  if (definitionId.endsWith("main_027")) {
    assert.equal(
      calculateEffectivePlayerVictoryPoints(
        scenario.state,
        scenario.activePlayer.playerId,
        -3
      ),
      3
    );
    return;
  }
  const sourceDefinition = getCardDefinition(scenario, definitionId);
  const effective = calculateEffectiveCardVictoryPoints(
    scenario.state,
    scenario.activePlayer.playerId,
    sourceDefinition,
    source
  );
  assert.ok(effective > sourceDefinition.engine.victoryPoints);
}

function assertScoringEffectEvidence(definitionId: string): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    386000 + definitionId.length
  );
  assert.deepEqual(play(scenario, source), { ok: true });
  const limpWand = givenRuntimeCard(scenario, {
    zone: "discard",
    definitionId: "esw2_dbg__limp_wand",
  });
  const limpDefinition = getCardDefinition(scenario, "esw2_dbg__limp_wand");
  assert.ok(
    calculateEffectiveCardVictoryPoints(
      scenario.state,
      scenario.activePlayer.playerId,
      limpDefinition,
      limpWand
    ) > limpDefinition.engine.victoryPoints
  );
  const score = scoreGame(scenario.state).find(
    (candidate) => candidate.playerId === scenario.activePlayer.playerId
  );
  assert.ok(score);
}

function assertMayhemEffectEvidence(definitionId: string): void {
  if (definitionId.endsWith("main_063")) {
    assertMayhemMarketChipEvidence();
    return;
  }
  const { scenario, card: source } = createCardEvidenceScenario(
    definitionId,
    387000 + definitionId.length
  );
  const active = scenario.activePlayer;
  if (definitionId.endsWith("main_066")) {
    for (const player of scenario.state.players) {
      addDinglerStatus(player, scenario.seed);
      player.life.current = 20;
      player.chips = 10;
    }
  }
  if (definitionId.endsWith("main_076")) {
    active.chips = 10;
    givenRuntimeCard(scenario, {
      player: active,
      definitionId: "esw2_dbg__main_002",
    });
    chooseCardTarget(
      scenario,
      "mayhem_each_player_optional_destroy_own_card_for_half_chips"
    );
  }
  if (definitionId.endsWith("mega_mayhem_003")) {
    for (const player of scenario.state.players) {
      addDeadWizardToken(scenario, player);
    }
  }
  assert.deepEqual(play(scenario, source), { ok: true });
  const deck = definitionId.includes("mega_mayhem") ? "legendDeck" : "mainDeck";
  const result = resolveMayhemThroughMarket(scenario, source, deck);
  assert.equal(result.ok, true);
  const effect = getCardDefinition(scenario, definitionId).engine.effects.find(
    (candidate) => candidate.timing === "onMayhemResolve"
  );
  assert.ok(effect);
  assertSourceEffectEvent(scenario, source, effect.effectId);
}

function assertMayhemMarketChipEvidence(): void {
  const { scenario, card: source } = createCardEvidenceScenario(
    "esw2_dbg__main_063",
    388063
  );
  assert.deepEqual(play(scenario, source), { ok: true });
  clearPhysicalCardZone(scenario, "mainDeck");
  clearPhysicalCardZone(scenario, "mainMarket");
  const target = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_002",
  });
  moveCardToCommonZone(scenario, target, "mainMarket");
  moveCardToCommonZone(scenario, source, "mainDeck", "front");
  const before = target.marketChips;
  const result = runMarketFlow(scenario.state, { mode: "turn" });
  assert.equal(result.ok, true);
  assert.equal(target.marketChips, before + 1);
}

function getCardDefinition(
  scenario: GameScenario,
  definitionId: string
): CardDefinition {
  const definition = scenario.state.cardDefinitions.get(definitionId);
  assert.ok(definition);
  return definition;
}

function assertCardRuntimeReference(
  definition: CardDefinition,
  runtimeRef: CrossSourceRuntimeRef,
  definitionId: string,
  draftPointPath: string
): void {
  if (runtimeRef.kind === "field") {
    assert.deepEqual(
      readRuntimeField(definition, runtimeRef.path),
      normalizeRuntimeFieldValue(runtimeRef.path, runtimeRef.value),
      `${definitionId} ${draftPointPath} does not match ${runtimeRef.path}`
    );
    return;
  }

  const matchingEffects = definition.engine.effects.filter(
    (effect) =>
      effect.effectId === runtimeRef.effectId &&
      effect.timing === runtimeRef.timing
  );
  assert.ok(
    matchingEffects.some((effect) =>
      isDeepStrictEqual(runtimeEffectPayload(effect), runtimeRef.fields)
    ),
    `${definitionId} ${draftPointPath} does not match ${runtimeRef.effectId}@${runtimeRef.timing}`
  );
}

function normalizeRuntimeFieldValue(
  fieldPath: string,
  value: unknown
): unknown {
  // The runtime intake represents a card with no printed cost as cost 0.
  return fieldPath === "engine.cost" && value === null ? 0 : value;
}

function readRuntimeField(
  definition: CardDefinition,
  fieldPath: string
): unknown {
  return fieldPath.split(".").reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, definition);
}

function runtimeEffectPayload(
  effect: CardDefinition["engine"]["effects"][number]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(effect).filter(
      ([fieldName]) => fieldName !== "effectId" && fieldName !== "timing"
    )
  );
}

const cardSemanticEvidenceCases = [
  {
    definitionId: "esw2_dbg__familiar_001",
    seed: 372001,
    testName:
      "card esw2_dbg__familiar_001 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_002",
    seed: 372002,
    testName:
      "card esw2_dbg__familiar_002 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_003",
    seed: 372003,
    testName:
      "card esw2_dbg__familiar_003 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_004",
    seed: 372004,
    testName:
      "card esw2_dbg__familiar_004 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_005",
    seed: 372005,
    testName:
      "card esw2_dbg__familiar_005 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_006",
    seed: 372006,
    testName:
      "card esw2_dbg__familiar_006 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_007",
    seed: 372007,
    testName:
      "card esw2_dbg__familiar_007 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_008",
    seed: 372008,
    testName:
      "card esw2_dbg__familiar_008 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_009",
    seed: 372009,
    testName:
      "card esw2_dbg__familiar_009 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__familiar_010",
    seed: 372010,
    testName:
      "card esw2_dbg__familiar_010 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_001",
    seed: 372011,
    testName:
      "card esw2_dbg__legend_001 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_002",
    seed: 372012,
    testName:
      "card esw2_dbg__legend_002 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_003",
    seed: 372013,
    testName:
      "card esw2_dbg__legend_003 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_004",
    seed: 372014,
    testName:
      "card esw2_dbg__legend_004 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_005",
    seed: 372015,
    testName:
      "card esw2_dbg__legend_005 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_006",
    seed: 372016,
    testName:
      "card esw2_dbg__legend_006 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_007",
    seed: 372017,
    testName:
      "card esw2_dbg__legend_007 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_008",
    seed: 372018,
    testName:
      "card esw2_dbg__legend_008 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_009",
    seed: 372019,
    testName:
      "card esw2_dbg__legend_009 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_010",
    seed: 372020,
    testName:
      "card esw2_dbg__legend_010 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_011",
    seed: 372021,
    testName:
      "card esw2_dbg__legend_011 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_012",
    seed: 372022,
    testName:
      "card esw2_dbg__legend_012 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_013",
    seed: 372023,
    testName:
      "card esw2_dbg__legend_013 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_014",
    seed: 372024,
    testName:
      "card esw2_dbg__legend_014 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_015",
    seed: 372025,
    testName:
      "card esw2_dbg__legend_015 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_016",
    seed: 372026,
    testName:
      "card esw2_dbg__legend_016 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_017",
    seed: 372027,
    testName:
      "card esw2_dbg__legend_017 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_018",
    seed: 372028,
    testName:
      "card esw2_dbg__legend_018 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_019",
    seed: 372029,
    testName:
      "card esw2_dbg__legend_019 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_020",
    seed: 372030,
    testName:
      "card esw2_dbg__legend_020 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_021",
    seed: 372031,
    testName:
      "card esw2_dbg__legend_021 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_022",
    seed: 372032,
    testName:
      "card esw2_dbg__legend_022 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_023",
    seed: 372033,
    testName:
      "card esw2_dbg__legend_023 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_024",
    seed: 372034,
    testName:
      "card esw2_dbg__legend_024 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_025",
    seed: 372035,
    testName:
      "card esw2_dbg__legend_025 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_026",
    seed: 372036,
    testName:
      "card esw2_dbg__legend_026 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_027",
    seed: 372037,
    testName:
      "card esw2_dbg__legend_027 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_028",
    seed: 372038,
    testName:
      "card esw2_dbg__legend_028 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_029",
    seed: 372039,
    testName:
      "card esw2_dbg__legend_029 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_030",
    seed: 372040,
    testName:
      "card esw2_dbg__legend_030 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_031",
    seed: 372041,
    testName:
      "card esw2_dbg__legend_031 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_032",
    seed: 372042,
    testName:
      "card esw2_dbg__legend_032 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__legend_033",
    seed: 372043,
    testName:
      "card esw2_dbg__legend_033 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__limp_wand",
    seed: 372044,
    testName:
      "card esw2_dbg__limp_wand executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_001",
    seed: 372045,
    testName: "card esw2_dbg__main_001 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_002",
    seed: 372046,
    testName: "card esw2_dbg__main_002 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_003",
    seed: 372047,
    testName: "card esw2_dbg__main_003 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_004",
    seed: 372048,
    testName: "card esw2_dbg__main_004 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_005",
    seed: 372049,
    testName: "card esw2_dbg__main_005 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_006",
    seed: 372050,
    testName: "card esw2_dbg__main_006 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_007",
    seed: 372051,
    testName: "card esw2_dbg__main_007 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_008",
    seed: 372052,
    testName: "card esw2_dbg__main_008 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_009",
    seed: 372053,
    testName: "card esw2_dbg__main_009 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_010",
    seed: 372054,
    testName: "card esw2_dbg__main_010 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_011",
    seed: 372055,
    testName: "card esw2_dbg__main_011 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_012",
    seed: 372056,
    testName: "card esw2_dbg__main_012 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_013",
    seed: 372057,
    testName: "card esw2_dbg__main_013 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_014",
    seed: 372058,
    testName: "card esw2_dbg__main_014 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_015",
    seed: 372059,
    testName: "card esw2_dbg__main_015 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_016",
    seed: 372060,
    testName: "card esw2_dbg__main_016 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_017",
    seed: 372061,
    testName: "card esw2_dbg__main_017 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_018",
    seed: 372062,
    testName: "card esw2_dbg__main_018 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_019",
    seed: 372063,
    testName: "card esw2_dbg__main_019 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_020",
    seed: 372064,
    testName: "card esw2_dbg__main_020 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_021",
    seed: 372065,
    testName: "card esw2_dbg__main_021 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_022",
    seed: 372066,
    testName: "card esw2_dbg__main_022 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_023",
    seed: 372067,
    testName: "card esw2_dbg__main_023 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_024",
    seed: 372068,
    testName: "card esw2_dbg__main_024 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_025",
    seed: 372069,
    testName: "card esw2_dbg__main_025 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_026",
    seed: 372070,
    testName: "card esw2_dbg__main_026 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_027",
    seed: 372071,
    testName: "card esw2_dbg__main_027 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_028",
    seed: 372072,
    testName: "card esw2_dbg__main_028 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_029",
    seed: 372073,
    testName: "card esw2_dbg__main_029 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_030",
    seed: 372074,
    testName: "card esw2_dbg__main_030 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_031",
    seed: 372075,
    testName: "card esw2_dbg__main_031 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_032",
    seed: 372076,
    testName: "card esw2_dbg__main_032 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_033",
    seed: 372077,
    testName: "card esw2_dbg__main_033 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_034",
    seed: 372078,
    testName: "card esw2_dbg__main_034 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_035",
    seed: 372079,
    testName: "card esw2_dbg__main_035 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_036",
    seed: 372080,
    testName: "card esw2_dbg__main_036 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_037",
    seed: 372081,
    testName: "card esw2_dbg__main_037 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_038",
    seed: 372082,
    testName: "card esw2_dbg__main_038 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_039",
    seed: 372083,
    testName: "card esw2_dbg__main_039 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_040",
    seed: 372084,
    testName: "card esw2_dbg__main_040 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_041",
    seed: 372085,
    testName: "card esw2_dbg__main_041 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_042",
    seed: 372086,
    testName: "card esw2_dbg__main_042 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_043",
    seed: 372087,
    testName: "card esw2_dbg__main_043 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_044",
    seed: 372088,
    testName: "card esw2_dbg__main_044 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_045",
    seed: 372089,
    testName: "card esw2_dbg__main_045 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_046",
    seed: 372090,
    testName: "card esw2_dbg__main_046 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_047",
    seed: 372091,
    testName: "card esw2_dbg__main_047 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_048",
    seed: 372092,
    testName: "card esw2_dbg__main_048 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_049",
    seed: 372093,
    testName: "card esw2_dbg__main_049 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_050",
    seed: 372094,
    testName: "card esw2_dbg__main_050 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_051",
    seed: 372095,
    testName: "card esw2_dbg__main_051 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_052",
    seed: 372096,
    testName: "card esw2_dbg__main_052 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_053",
    seed: 372097,
    testName: "card esw2_dbg__main_053 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_054",
    seed: 372098,
    testName: "card esw2_dbg__main_054 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_055",
    seed: 372099,
    testName: "card esw2_dbg__main_055 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_056",
    seed: 372100,
    testName: "card esw2_dbg__main_056 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_057",
    seed: 372101,
    testName: "card esw2_dbg__main_057 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_058",
    seed: 372102,
    testName: "card esw2_dbg__main_058 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_059",
    seed: 372103,
    testName: "card esw2_dbg__main_059 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_060",
    seed: 372104,
    testName: "card esw2_dbg__main_060 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_061",
    seed: 372105,
    testName: "card esw2_dbg__main_061 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_062",
    seed: 372106,
    testName: "card esw2_dbg__main_062 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_063",
    seed: 372107,
    testName: "card esw2_dbg__main_063 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_064",
    seed: 372108,
    testName: "card esw2_dbg__main_064 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_065",
    seed: 372109,
    testName: "card esw2_dbg__main_065 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_066",
    seed: 372110,
    testName: "card esw2_dbg__main_066 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_067",
    seed: 372111,
    testName: "card esw2_dbg__main_067 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_068",
    seed: 372112,
    testName: "card esw2_dbg__main_068 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_069",
    seed: 372113,
    testName: "card esw2_dbg__main_069 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_070",
    seed: 372114,
    testName: "card esw2_dbg__main_070 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_071",
    seed: 372115,
    testName: "card esw2_dbg__main_071 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_072",
    seed: 372116,
    testName: "card esw2_dbg__main_072 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_073",
    seed: 372117,
    testName: "card esw2_dbg__main_073 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_074",
    seed: 372118,
    testName: "card esw2_dbg__main_074 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_075",
    seed: 372119,
    testName: "card esw2_dbg__main_075 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_076",
    seed: 372120,
    testName: "card esw2_dbg__main_076 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_077",
    seed: 372121,
    testName: "card esw2_dbg__main_077 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__main_078",
    seed: 372122,
    testName: "card esw2_dbg__main_078 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_001",
    seed: 372123,
    testName:
      "card esw2_dbg__mega_mayhem_001 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_002",
    seed: 372124,
    testName:
      "card esw2_dbg__mega_mayhem_002 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_003",
    seed: 372125,
    testName:
      "card esw2_dbg__mega_mayhem_003 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_004",
    seed: 372126,
    testName:
      "card esw2_dbg__mega_mayhem_004 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_005",
    seed: 372127,
    testName:
      "card esw2_dbg__mega_mayhem_005 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_006",
    seed: 372128,
    testName:
      "card esw2_dbg__mega_mayhem_006 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__mega_mayhem_007",
    seed: 372129,
    testName:
      "card esw2_dbg__mega_mayhem_007 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__starter_001",
    seed: 372130,
    testName:
      "card esw2_dbg__starter_001 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__starter_002",
    seed: 372131,
    testName:
      "card esw2_dbg__starter_002 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__starter_003",
    seed: 372132,
    testName:
      "card esw2_dbg__starter_003 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__starter_004",
    seed: 372133,
    testName:
      "card esw2_dbg__starter_004 executes through the public play action",
  },
  {
    definitionId: "esw2_dbg__wild_magic",
    seed: 372134,
    testName:
      "card esw2_dbg__wild_magic executes through the public play action",
  },
] as const;

for (const cardCase of cardSemanticEvidenceCases) {
  test(cardCase.testName, () =>
    runCardSemanticEvidence(cardCase.definitionId, cardCase.seed)
  );
}
