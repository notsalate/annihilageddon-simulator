import assert from "node:assert/strict";
import test from "node:test";

import { initializeGame, type CardInstance } from "../src/index.js";
import {
  createAttackAmountState,
  createAttackDefenseUsage,
  resolveAttackAmount,
  summarizeAttackDamage,
  type DefenseAttackContext,
} from "../src/engine/attack-resolution.js";
import {
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
} from "../src/domain/types.js";

import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import {
  chooseEffect,
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("attack amount combines base and source-owner bonus", () => {
  const state = initializeGame({ rootDir, seed: 42001 });
  const attacker = mustGetPlayer(state, "player-1");
  const target = mustGetPlayer(state, "player-2");
  attacker.permanents = [];

  const resolved = resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 5);
  assert.deepEqual(resolved.components, {
    unresolvedBaseAmount: 3,
    sourceOwnerModifierAmount: 2,
    currentAttackerTargetModifierAmount: 0,
  });
});

test("Chipsychosis Arena doubles the current attacker's amount against a foe", () => {
  const state = initializeGame({ rootDir, seed: 42002 });
  const attacker = mustGetPlayer(state, "player-1");
  const target = mustGetPlayer(state, "player-2");
  attacker.permanents.push(createArena(attacker.playerId));

  const resolved = resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 10);
  assert.equal(resolved.components.currentAttackerTargetModifierAmount, 5);
});

test("Chipsychosis Arena does not double a self-targeted attack", () => {
  const state = initializeGame({ rootDir, seed: 42003 });
  const attacker = mustGetPlayer(state, "player-1");
  attacker.permanents.push(createArena(attacker.playerId));

  const resolved = resolveAttackAmount(
    state,
    attacker,
    attacker,
    createAttackAmountState(3, 2)
  );

  assert.equal(resolved.total, 5);
  assert.equal(resolved.components.currentAttackerTargetModifierAmount, 0);
});

test("redirect recalculates only the current-attacker modifier", () => {
  const state = initializeGame({ rootDir, seed: 42004 });
  const originalAttacker = mustGetPlayer(state, "player-1");
  const redirectingAttacker = mustGetPlayer(state, "player-2");
  redirectingAttacker.permanents.push(
    createArena(redirectingAttacker.playerId)
  );
  const carriedAmount = createAttackAmountState(2, 1);

  const resolved = resolveAttackAmount(
    state,
    redirectingAttacker,
    originalAttacker,
    carriedAmount
  );

  assert.equal(resolved.total, 6);
  assert.deepEqual(resolved.components, {
    unresolvedBaseAmount: 2,
    sourceOwnerModifierAmount: 1,
    currentAttackerTargetModifierAmount: 3,
  });
});

test("damage attribution aggregates multi-target results by current attacker and source", () => {
  const state = initializeGame({ rootDir, seed: 42005 });
  const attacker = mustGetPlayer(state, "player-1");
  const source = {
    sourceType: "card" as const,
    runtimeMode: "fixture" as const,
    playerId: attacker.playerId,
    cardInstanceId: "fixture-multi-source",
    definitionId: "fixture-multi-source",
  };

  const attributions = summarizeAttackDamage([
    {
      currentAttackerId: attacker.playerId,
      attackingPlayer: attacker,
      damageDealt: 2,
      source,
    },
    {
      currentAttackerId: attacker.playerId,
      attackingPlayer: attacker,
      damageDealt: 3,
      source,
    },
  ]);

  assert.deepEqual(attributions, [
    { attackingPlayer: attacker, damageDealt: 5, source },
  ]);
});

test("damage attribution keeps redirected current attackers separate", () => {
  const state = initializeGame({ rootDir, seed: 42006 });
  const originalAttacker = mustGetPlayer(state, "player-1");
  const redirectingAttacker = mustGetPlayer(state, "player-2");
  const source = {
    sourceType: "card" as const,
    runtimeMode: "fixture" as const,
    playerId: originalAttacker.playerId,
    cardInstanceId: "fixture-redirect-source",
    definitionId: "fixture-redirect-source",
  };
  const redirectedSource = {
    ...source,
    playerId: redirectingAttacker.playerId,
  };

  const attributions = summarizeAttackDamage([
    {
      currentAttackerId: originalAttacker.playerId,
      attackingPlayer: originalAttacker,
      damageDealt: 1,
      source,
    },
    {
      currentAttackerId: redirectingAttacker.playerId,
      attackingPlayer: redirectingAttacker,
      damageDealt: 4,
      source: redirectedSource,
    },
  ]);

  assert.deepEqual(attributions, [
    { attackingPlayer: originalAttacker, damageDealt: 1, source },
    {
      attackingPlayer: redirectingAttacker,
      damageDealt: 4,
      source: redirectedSource,
    },
  ]);
});

test("обычная защита фиксирует оплату и перемещение до терминальной ветви", () => {
  const state = initializeGame({ rootDir, seed: 42008 });
  const attacker = mustGetPlayer(state, "player-1");
  const defender = mustGetPlayer(state, "player-2");
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  defender.chips = 1;
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
    branchEffects: [{ effectId: "add_power", timing: "onDefense", amount: 1 }],
  });
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: attacker.playerId,
    cardInstanceId: "fixture-attack-source-42008",
    definitionId: "fixture-attack-source-42008",
  };
  const attack: DefenseAttackContext = {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2),
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage: createAttackDefenseUsage(),
  };
  const gameEnd = {
    reason: "playerDefeated" as const,
    winnerPlayerId: defender.playerId,
  };
  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find((choice) => choice.choiceId === defense.instanceId);
    },
    executeDefenseEffects(_branchState, player) {
      assert.equal(player.chips, 0);
      assert.equal(player.discard.includes(defense), true);
      return { ok: true, gameEnd };
    },
  };

  const result = resolveDefenseWindow(state, defender, attack, services);

  assert.deepEqual(result, { ok: true, avoided: true, gameEnd });
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.hand.includes(defense), false);
});

test("redirect-защита откатывает оплату, перемещение, события, RNG и usage после ошибки ветви", () => {
  const state = initializeGame({ rootDir, seed: 42009 });
  const attacker = mustGetPlayer(state, "player-1");
  const defender = mustGetPlayer(state, "player-2");
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  defender.chips = 2;
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    redirectAttack: true,
    costs: [{ costId: "spend_chips", amount: 2 }],
    branchEffects: [{ effectId: "draw_cards", timing: "onDefense", amount: 1 }],
  });
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: attacker.playerId,
    cardInstanceId: "fixture-attack-source-42009",
    definitionId: "fixture-attack-source-42009",
  };
  const attack: DefenseAttackContext = {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2),
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage: createAttackDefenseUsage(),
  };
  const eventLogBefore = structuredClone(state.eventLog);
  const expectedRng = state.rng.fork();
  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find((choice) => choice.choiceId === defense.instanceId);
    },
    executeDefenseEffects(branchState, player) {
      assert.equal(player.discard.includes(defense), true);
      branchState.rng.next();
      player.chips += 5;
      return { ok: false, error: "fixture redirect branch failure" };
    },
  };

  const result = resolveDefenseWindow(state, defender, attack, services);

  assert.deepEqual(result, {
    ok: false,
    error: "fixture redirect branch failure",
  });
  assert.equal(defender.chips, 2);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.deepEqual(state.eventLog, eventLogBefore);
  assert.equal(state.rng.next(), expectedRng.next());
  assert.deepEqual([...attack.defenseUsage.defendedPlayerIds], []);
  assert.deepEqual([...attack.defenseUsage.usedDefenseCardInstanceIds], []);
});

function mustGetPlayer(
  state: ReturnType<typeof initializeGame>,
  playerId: "player-1" | "player-2"
) {
  const player = state.players.find(
    (candidate) => candidate.playerId === markPlayerId(playerId)
  );
  assert.ok(player);
  return player;
}

function createArena(ownerId: CardInstance["ownerId"]): CardInstance {
  return {
    instanceId: markCardInstanceId(`fixture-arena-${ownerId}`),
    definitionId: markCardDefinitionId("esw2_dbg__legend_008"),
    ownerId,
    marketChips: 0,
  };
}

test("chooseEffect preserves undefined so optional defense declines", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
    seed: 60615,
  });
  const defender = scenario.foes[0];
  assert.ok(defender);
  defender.hand = [];
  defender.discard = [];
  const defense = addFixtureDefenseCardToHand(
    scenario.state,
    defender,
    "discardSelf"
  );
  chooseEffect(scenario, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === defender.playerId)
      : undefined
  );
  const lifeBefore = defender.life.current;
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 4,
        targetSelector: "chosenFoe",
      },
    ],
  });

  const result = play(scenario, attack);

  assert.equal(result.ok, true);
  assert.equal(defender.life.current, lifeBefore - 4);
  assert.equal(defender.hand.includes(defense), true);
  assert.equal(defender.discard.includes(defense), false);
  assert.equal(
    scenario.state.eventLog.some(
      (event) => event.type === "defenseChoiceSelected"
    ),
    false
  );
});

test("fixture defense builder does not install a global choice strategy", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
    seed: 60615,
  });
  const defender = scenario.foes[0];
  assert.ok(defender);
  delete scenario.state.effectChoiceStrategy;

  addFixtureDefenseCardToHand(scenario.state, defender, "discardSelf");

  assert.equal(scenario.state.effectChoiceStrategy, undefined);
});

test("Defense executes onDefense draw and discard shuffle through a terminating redirect chain", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
    seed: 60615,
  });
  const attackingPlayer = scenario.activePlayer;
  const targetPlayer = scenario.foes[0];
  assert.ok(targetPlayer);
  targetPlayer.hand = [];
  targetPlayer.discard = [];
  const shuffledCards = targetPlayer.deck.splice(0);
  assert.equal(shuffledCards.length, 5);
  targetPlayer.discard.push(...shuffledCards);
  const firstTargetDefense = addFixtureDefenseCardToHand(
    scenario.state,
    targetPlayer,
    "discardSelf",
    {
      redirectAttack: true,
      branchEffects: [
        {
          effectId: "draw_cards",
          timing: "onDefense",
          amount: 1,
        },
      ],
    }
  );
  const unusedTargetDefense = addFixtureDefenseCardToHand(
    scenario.state,
    targetPlayer,
    "discardSelf",
    { redirectAttack: true }
  );
  const attackerDefense = addFixtureDefenseCardToHand(
    scenario.state,
    attackingPlayer,
    "discardSelf",
    { redirectAttack: true }
  );
  chooseEffect(scenario, selectFirstFixtureDefense);
  const targetLifeBefore = targetPlayer.life.current;
  const expectedRng = scenario.state.rng.fork();
  expectedRng.nextInt(6);
  expectedRng.nextInt(5);
  expectedRng.nextInt(4);
  expectedRng.nextInt(3);
  expectedRng.nextInt(2);
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        target: { selector: "opponentPlayer" },
      },
    ],
  });

  const result = play(scenario, attack);

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, targetLifeBefore - 2);
  assert.equal(targetPlayer.hand.length, 2);
  assert.equal(targetPlayer.deck.length, 5);
  assert.deepEqual(targetPlayer.discard, []);
  assert.deepEqual(
    [
      ...targetPlayer.hand,
      ...targetPlayer.deck,
      ...targetPlayer.discard,
    ]
      .map((card) => card.instanceId)
      .sort(),
    [...shuffledCards, firstTargetDefense, unusedTargetDefense]
      .map((card) => card.instanceId)
      .sort()
  );
  assert.equal(attackingPlayer.discard.includes(attackerDefense), true);
  assert.equal(targetPlayer.hand.includes(unusedTargetDefense), true);
  assert.equal(scenario.state.rng.next(), expectedRng.next());
  const defenseChoiceEvents = scenario.state.eventLog.filter(
    (event) => event.type === "defenseChoiceSelected"
  );
  assert.deepEqual(
    defenseChoiceEvents.map((event) => event.cardInstanceId),
    [firstTargetDefense.instanceId, attackerDefense.instanceId]
  );
  const targetDefenseMovedIndex = scenario.state.eventLog.findIndex(
    (event) =>
      event.type === "defenseCardMoved" &&
      event.cardInstanceId === firstTargetDefense.instanceId
  );
  const shuffleIndex = scenario.state.eventLog.findIndex(
    (event) =>
      event.type === "discardShuffledIntoDeck" &&
      event.playerId === targetPlayer.playerId
  );
  const drawIndex = scenario.state.eventLog.findIndex(
    (event) =>
      event.type === "effectDrawCardsApplied" &&
      event.playerId === targetPlayer.playerId &&
      event.cardInstanceId === firstTargetDefense.instanceId &&
      event.amount === 1
  );
  assert.ok(targetDefenseMovedIndex >= 0);
  assert.ok(shuffleIndex > targetDefenseMovedIndex);
  assert.ok(drawIndex > shuffleIndex);
});

import { recordGameEvent } from "../src/engine/event-recorder.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import type {
  AttackOutcomeBranch,
  RuntimeEffectPayload,
} from "../src/engine/runtime-effect.js";
import type { GameState, PlayerState } from "../src/engine/setup.js";
import {
  resolvePlayerControlledAttack,
  type AttackDamageAttribution,
  type PlayerControlledAttackAdapters,
  type PlayerControlledAttackIntent,
} from "../src/engine/attack-resolution.js";

test("player-controlled attack owns the single-target lifecycle through after-attack", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43001,
    2
  );
  const [target] = targets;
  assert.ok(target);
  const lifeBefore = target.life.current;
  const afterAttack: AttackDamageAttribution<EffectSourceContext>[] = [];
  const adapters = createAttackAdapters({
    applyAfterAttackDamage(_state, attribution) {
      afterAttack.push(attribution);
      recordGameEvent(state, {
        type: "effectAddPowerApplied",
        playerId: attribution.attackingPlayer.playerId,
        cardInstanceId: attribution.source.cardInstanceId,
        definitionId: attribution.source.definitionId,
        effectId: "add_power",
        amount: attribution.damageDealt,
        powerBefore: state.turn.power,
        powerAfter: state.turn.power + attribution.damageDealt,
        sourceType: attribution.source.sourceType,
      });
      state.turn.power += attribution.damageDealt;
      return { ok: true };
    },
  });

  const result = resolvePlayerControlledAttack(
    damageAttackIntent(state, attacker, source, [target], 4),
    adapters
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(target.life.current, lifeBefore - 4);
  assert.equal(afterAttack.length, 1);
  assert.equal(afterAttack[0]?.damageDealt, 4);
  assert.deepEqual(attackLifecycleEventTypes(state), [
    "attackCreated",
    "attackTargetStarted",
    "effectDamageDealt",
    "effectAddPowerApplied",
  ]);
});

test("normal multi-target attack finishes the first Defense result before starting the second target", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43002,
    3
  );
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  const firstLife = firstTarget.life.current;
  const secondLife = secondTarget.life.current;
  const adapters = createAttackAdapters({
    resolveDefenseWindow(_state, defendingPlayer) {
      return defendingPlayer.playerId === firstTarget.playerId
        ? { ok: true, avoided: true }
        : { ok: true, avoided: false };
    },
  });

  const result = resolvePlayerControlledAttack(
    damageAttackIntent(state, attacker, source, [firstTarget, secondTarget], 3),
    adapters
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(firstTarget.life.current, firstLife);
  assert.equal(secondTarget.life.current, secondLife - 3);
  assert.deepEqual(attackLifecycleEventTypes(state), [
    "attackCreated",
    "attackTargetStarted",
    "attackAvoided",
    "attackTargetStarted",
    "effectDamageDealt",
    "effectAddPowerApplied",
  ]);
});

test("attack amount is recomputed after the previous target mutates current attacker state", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43003,
    3
  );
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  firstTarget.life.current = 1;
  const dealtAmounts: number[] = [];
  const adapters = createAttackAdapters({
    dealAttackDamage(
      currentState,
      attackingPlayer,
      targetPlayer,
      amount,
      effectId,
      attackSource
    ) {
      dealtAmounts.push(amount);
      const result = dealHarnessAttackDamage(
        currentState,
        attackingPlayer,
        targetPlayer,
        amount,
        effectId,
        attackSource
      );
      if (targetPlayer.playerId === firstTarget.playerId) {
        attackingPlayer.permanents.push(createArena(attackingPlayer.playerId));
      }
      return result;
    },
  });

  const result = resolvePlayerControlledAttack(
    damageAttackIntent(state, attacker, source, [firstTarget, secondTarget], 2),
    adapters
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(dealtAmounts, [2, 4]);
});

test("redirect changes current attacker attribution while preserving original source identity", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43004,
    2
  );
  const [defender] = targets;
  assert.ok(defender);
  const attackerLifeBefore = attacker.life.current;
  const attributions: AttackDamageAttribution<EffectSourceContext>[] = [];
  const adapters = createAttackAdapters({
    resolveDefenseWindow(
      _state,
      defendingPlayer,
      attack,
      resolveRedirectedAttack
    ) {
      if (
        defendingPlayer.playerId !== defender.playerId ||
        attack.kind !== "redirectable"
      ) {
        return { ok: true, avoided: false };
      }
      const redirectedSource = {
        ...attack.source,
        playerId: defender.playerId,
      };
      const redirected = resolveRedirectedAttack({
        attackingPlayer: defender,
        targetPlayer: attacker,
        amountComponents: attack.amountComponents,
        effectId: attack.effectId,
        source: redirectedSource,
        originalSource: attack.originalSource,
        defenseUsage: attack.defenseUsage,
        unavoidable: true,
      });
      if (!redirected.ok) {
        return redirected;
      }
      if (redirected.gameEnd !== undefined) {
        return { ok: true, avoided: true, gameEnd: redirected.gameEnd };
      }
      return { ok: true, avoided: true, resolution: redirected.resolution };
    },
    applyAfterAttackDamage(_state, attribution) {
      attributions.push(attribution);
      return { ok: true };
    },
  });

  const result = resolvePlayerControlledAttack(
    damageAttackIntent(state, attacker, source, [defender], 3),
    adapters
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(attacker.life.current, attackerLifeBefore - 3);
  assert.equal(attributions.length, 1);
  assert.equal(attributions[0]?.attackingPlayer, defender);
  assert.equal(attributions[0]?.source.playerId, defender.playerId);
  assert.equal(attributions[0]?.source.cardInstanceId, source.cardInstanceId);
  assert.equal(attributions[0]?.source.definitionId, source.definitionId);
});

test("per-target outcome branches complete before the next target and after-attack runs last", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43005,
    3
  );
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  const order: string[] = [];
  const adapters = createAttackAdapters({
    dealAttackDamage(
      currentState,
      attackingPlayer,
      targetPlayer,
      amount,
      effectId,
      attackSource
    ) {
      order.push(`damage:${targetPlayer.playerId}`);
      return dealHarnessAttackDamage(
        currentState,
        attackingPlayer,
        targetPlayer,
        amount,
        effectId,
        attackSource
      );
    },
    executeOutcomeBranch(_state, _attacker, targetPlayer) {
      order.push(`branch:${targetPlayer.playerId}`);
      return { ok: true };
    },
    applyAfterAttackDamage() {
      order.push("after");
      return { ok: true };
    },
  });
  const intent = damageAttackIntent(
    state,
    attacker,
    source,
    [firstTarget, secondTarget],
    2,
    [{ effectId: "gain_chips", amount: 1 }]
  );

  const result = resolvePlayerControlledAttack(intent, adapters);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, [
    `damage:${firstTarget.playerId}`,
    `branch:${firstTarget.playerId}`,
    `damage:${secondTarget.playerId}`,
    `branch:${secondTarget.playerId}`,
    "after",
  ]);
});

test("game end from a target branch stops later targets and after-attack hooks", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43006,
    3
  );
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  const secondLife = secondTarget.life.current;
  let afterAttackCalls = 0;
  const gameEnd = {
    reason: "playerDefeated" as const,
    winnerPlayerId: attacker.playerId,
  };
  const adapters = createAttackAdapters({
    executeOutcomeBranch() {
      return { ok: true, gameEnd };
    },
    applyAfterAttackDamage() {
      afterAttackCalls += 1;
      return { ok: true };
    },
  });

  const result = resolvePlayerControlledAttack(
    damageAttackIntent(
      state,
      attacker,
      source,
      [firstTarget, secondTarget],
      2,
      [{ effectId: "gain_chips", amount: 1 }]
    ),
    adapters
  );

  assert.deepEqual(result, { ok: true, gameEnd });
  assert.equal(secondTarget.life.current, secondLife);
  assert.equal(afterAttackCalls, 0);
  assert.equal(
    state.eventLog.filter((event) => event.type === "attackTargetStarted")
      .length,
    1
  );
});

test("non-damage player attack uses the same seam without damage attribution or first-damage eligibility", () => {
  const { state, attacker, targets, source } = createAttackResolutionHarness(
    43007,
    2
  );
  const [target] = targets;
  assert.ok(target);
  let afterAttackCalls = 0;
  const onHitEffect = {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
  } satisfies RuntimeEffectPayload;
  const adapters = createAttackAdapters({
    executeOnHitEffect(_state, _attackingPlayer, targetPlayer) {
      targetPlayer.statuses.push({
        instanceId: `fixture-status-${targetPlayer.playerId}`,
        statusId: "dingler",
        ownerId: targetPlayer.playerId,
        effects: [],
      });
      return { ok: true };
    },
    applyAfterAttackDamage() {
      afterAttackCalls += 1;
      return { ok: true };
    },
  });
  const intent: PlayerControlledAttackIntent = {
    state,
    attackingPlayer: attacker,
    source,
    effectId: "attack_gain_status",
    unavoidable: false,
    targetPlan: { kind: "orderedPlayers", players: [target] },
    impact: { kind: "effects", effects: [onHitEffect] },
  };

  const result = resolvePlayerControlledAttack(intent, adapters);

  assert.deepEqual(result, { ok: true });
  assert.equal(
    target.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(afterAttackCalls, 0);
  assert.deepEqual(state.turn.damagingAttackPlayerIds, []);
  assert.deepEqual(attackLifecycleEventTypes(state), [
    "attackCreated",
    "attackTargetStarted",
  ]);
});

function createAttackResolutionHarness(
  seed: number,
  playerCount: number
): {
  state: GameState;
  attacker: PlayerState;
  targets: PlayerState[];
  source: EffectSourceContext;
} {
  const state = initializeGame({ rootDir, seed, playerCount });
  state.eventLog.length = 0;
  state.turn.damagingAttackPlayerIds.length = 0;
  const [attacker, ...targets] = state.players;
  assert.ok(attacker);
  return {
    state,
    attacker,
    targets,
    source: {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: attacker.playerId,
      cardInstanceId: `fixture-attack-${seed}`,
      definitionId: `fixture-attack-${seed}`,
    },
  };
}

function damageAttackIntent(
  state: GameState,
  attackingPlayer: PlayerState,
  source: EffectSourceContext,
  players: readonly PlayerState[],
  baseAmount: number,
  onDamageDealt: readonly AttackOutcomeBranch[] = []
): PlayerControlledAttackIntent {
  return {
    state,
    attackingPlayer,
    source,
    effectId: "attack_damage",
    unavoidable: false,
    targetPlan: { kind: "orderedPlayers", players },
    impact: {
      kind: "damage",
      baseAmount,
      sourceOwnerModifierAmount: 0,
      onDamageDealt,
      onKill: [],
    },
  };
}

function createAttackAdapters(
  overrides: Partial<PlayerControlledAttackAdapters> = {}
): PlayerControlledAttackAdapters {
  return {
    resolveTargets(intent) {
      return intent.targetPlan.kind === "orderedPlayers"
        ? { ok: true, players: intent.targetPlan.players }
        : {
            ok: false,
            error: "runtime selector is not configured in this test",
          };
    },
    resolveDefenseWindow() {
      return { ok: true, avoided: false };
    },
    dealAttackDamage(
      currentState,
      attackingPlayer,
      targetPlayer,
      amount,
      effectId,
      source
    ) {
      return dealHarnessAttackDamage(
        currentState,
        attackingPlayer,
        targetPlayer,
        amount,
        effectId,
        source
      );
    },
    executeOnHitEffect() {
      return { ok: true };
    },
    executeOutcomeBranch() {
      return { ok: true };
    },
    applyAfterAttackDamage(currentState, attribution) {
      recordGameEvent(currentState, {
        type: "effectAddPowerApplied",
        playerId: attribution.attackingPlayer.playerId,
        cardInstanceId: attribution.source.cardInstanceId,
        definitionId: attribution.source.definitionId,
        effectId: "add_power",
        amount: attribution.damageDealt,
        powerBefore: currentState.turn.power,
        powerAfter: currentState.turn.power,
        sourceType: attribution.source.sourceType,
      });
      return { ok: true };
    },
    ...overrides,
  };
}

function dealHarnessAttackDamage(
  state: GameState,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: PlayerControlledAttackIntent["effectId"],
  source: EffectSourceContext
) {
  const lifeBefore = targetPlayer.life.current;
  targetPlayer.life.current -= amount;
  const damageDealt = Math.max(0, Math.min(lifeBefore, amount));
  recordGameEvent(state, {
    type: "effectDamageDealt",
    playerId: attackingPlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: damageDealt,
    targetLifeBefore: lifeBefore,
    targetLifeAfter: targetPlayer.life.current,
    sourceType: source.sourceType,
  });
  return {
    damageDealt,
    killed: targetPlayer.life.current < 1,
  };
}

function attackLifecycleEventTypes(state: GameState): string[] {
  return state.eventLog
    .map((event) => event.type)
    .filter((type) =>
      [
        "attackCreated",
        "attackTargetStarted",
        "attackAvoided",
        "effectDamageDealt",
        "effectAddPowerApplied",
      ].includes(type)
    );
}
