import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  buildControlledObjectView,
  calculateEffectivePlayerMaxLife,
  initializeGame,
  listLegalActions,
  loadCurrentRuntimeDataPack,
  runMarketFlow,
  scoreGame,
  type CardInstance,
  type CardDefinition,
  type GameState,
  type LoadedDataPack,
  type PlayerState,
  type RuntimeEffect,
  type StatusInstance,
  type TokenDefinition,
} from "../src/index.js";
import { executeMayhemEffects } from "../src/engine/effect-runtime.js";
import type { EffectSourceContext } from "../src/engine/effect-runtime-registry.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import { replacePostSetupWizardPropertyFixture } from "./helpers/fixture-tokens.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("Кондуктор Жми-На-Тормоза is a one-copy familiar that draws, matches every controlled card type, and redirects an avoided attack", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const familiarDefinition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_005"
  );
  assert.ok(familiarDefinition);
  assert.deepEqual(currentRuntimeDataPack.decks.familiarPool?.entries, [
    { cardId: "esw2_dbg__familiar_005", count: 1 },
  ]);

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [familiarDefinition.cardId, familiarDefinition],
  ]);
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const foe = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(foe);
  const familiar = activePlayer.unboughtFamiliar;
  assert.ok(familiar);
  familiar.definitionId = markCardDefinitionId(familiarDefinition.cardId);

  state.turn.power = 6;
  const buyAction = listLegalActions(state).find(
    (action) =>
      action.type === "buyMarketCard" &&
      action.source === "familiar" &&
      action.cardInstanceId === familiar.instanceId
  );
  assert.ok(buyAction);
  assert.equal(applyAction(state, buyAction).ok, true);
  assert.equal(activePlayer.discard.includes(familiar), true);

  moveCardToHand(activePlayer, familiar);
  const handBeforePlay = activePlayer.hand.length;
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }).ok,
    true
  );
  assert.equal(activePlayer.hand.length, handBeforePlay + 1);

  const conditionalCardId = addFixtureCardToActiveHand(state, {
    effectId: "add_power",
    timing: "onPlay",
    amount: 1,
    condition: {
      conditionId: "control_count",
      cardTypes: ["spell"],
      minimumCount: 1,
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: conditionalCardId })
      .ok,
    true
  );
  assert.equal(state.turn.power, 1);

  const playedIndex = activePlayer.playedThisTurn.findIndex(
    (card) => card.instanceId === familiar.instanceId
  );
  if (playedIndex >= 0) {
    activePlayer.playedThisTurn.splice(playedIndex, 1);
  }
  activePlayer.hand.push(familiar);
  state.activePlayerId = foe.playerId;
  activePlayer.life.current = 1;
  activePlayer.chips = 1;
  foe.chips = 2;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "avoid_attack"
      ? choices.find(
          (choice) =>
            choice.choiceKind === "defense" && choice.card === familiar
        )
      : undefined
  );
  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 2,
    target: { selector: "opponentPlayer" },
    onDamageDealt: [{ effectId: "gain_chips_equal_damage_dealt" }],
  });
  const activeHandBeforeDefense = activePlayer.hand.length;
  const activeLifeBeforeDefense = activePlayer.life.current;
  const foeLifeBeforeRedirect = foe.life.current;

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: attackCardId }).ok,
    true
  );
  assert.equal(activePlayer.hand.length, activeHandBeforeDefense);
  assert.equal(activePlayer.discard.includes(familiar), true);
  assert.equal(activePlayer.life.current, activeLifeBeforeDefense);
  assert.equal(foe.life.current, foeLifeBeforeRedirect - 2);
  assert.equal(activePlayer.chips, 3);
  assert.equal(foe.chips, 0);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackTargetStarted" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === foe.playerId &&
        event.effectId === "attack_damage" &&
        event.cardInstanceId === attackCardId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsChanged" && event.playerId === foe.playerId
    ),
    false
  );
});

test("redirected foreign Wand does not inherit the redirecting player's wizard property", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const attackingPlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(attackingPlayer);
  const redirectingPlayer = state.players.find(
    (player) => player.playerId !== attackingPlayer.playerId
  );
  assert.ok(redirectingPlayer);
  attackingPlayer.wizardProperties = [];
  replaceFirstWizardProperty(
    state,
    redirectingPlayer,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  const wand = addRuntimeCardToHand(
    state,
    attackingPlayer,
    "esw2_dbg__starter_004"
  );
  addFixtureDefenseCardToHand(state, redirectingPlayer, "discardSelf", {
    redirectAttack: true,
  });
  const returnDefense = addFixtureDefenseCardToHand(
    state,
    attackingPlayer,
    "discardSelf"
  );
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "attack_damage") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === redirectingPlayer.playerId
    );
  });
  const attackingLifeBefore = attackingPlayer.life.current;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(attackingPlayer.life.current, attackingLifeBefore);
  assert.equal(attackingPlayer.discard.includes(returnDefense), true);
  const redirectedAttack = state.eventLog.find(
    (event) =>
      event.type === "attackTargetStarted" &&
      event.playerId === redirectingPlayer.playerId &&
      event.targetPlayerId === attackingPlayer.playerId
  );
  assert.ok(redirectedAttack);
  assert.equal(redirectedAttack.cardInstanceId, wand.instanceId);
  assert.equal(redirectedAttack.amount, 1);
});

test("Chipsychosis Arena doubles a redirected attack for the redirecting attacker", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const originalAttacker = mustGetPlayer(state, markPlayerId("player-1"));
  const redirector = mustGetPlayer(state, markPlayerId("player-2"));
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  state.activePlayerId = redirector.playerId;
  const arena = addRuntimeCardToHand(state, redirector, "esw2_dbg__legend_008");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: arena.instanceId })
      .ok,
    true
  );
  addFixtureDefenseCardToHand(state, redirector, "discardSelf", {
    redirectAttack: true,
  });
  state.activePlayerId = originalAttacker.playerId;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === redirector.playerId)
      : undefined
  );
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 2,
    targetSelector: "chosenFoe",
  });

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: attack }).ok,
    true
  );
  assert.equal(redirector.life.current, 20);
  assert.equal(originalAttacker.life.current, 16);
});

test("Chipsychosis Arena of the original attacker does not double a redirected leg", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const originalAttacker = mustGetPlayer(state, markPlayerId("player-1"));
  const redirector = mustGetPlayer(state, markPlayerId("player-2"));
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  state.activePlayerId = originalAttacker.playerId;
  const arena = addRuntimeCardToHand(
    state,
    originalAttacker,
    "esw2_dbg__legend_008"
  );
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: arena.instanceId })
      .ok,
    true
  );
  addFixtureDefenseCardToHand(state, redirector, "discardSelf", {
    redirectAttack: true,
  });
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === redirector.playerId)
      : undefined
  );
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 2,
    targetSelector: "chosenFoe",
  });

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: attack }).ok,
    true
  );
  assert.equal(redirector.life.current, 20);
  assert.equal(originalAttacker.life.current, 18);
});

test("Chipsychosis Arena doubles source-owner Wand modifiers only against foes", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const attacker = mustGetPlayer(state, markPlayerId("player-2"));
  const foe = mustGetPlayer(state, markPlayerId("player-1"));
  attacker.wizardProperties = [];
  foe.wizardProperties = [];
  state.activePlayerId = attacker.playerId;
  const modifier = addRuntimeCardToHand(state, attacker, "esw2_dbg__main_009");
  const arena = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_008");
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: modifier.instanceId,
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: arena.instanceId })
      .ok,
    true
  );
  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__starter_003");

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: wand.instanceId })
      .ok,
    true
  );
  assert.equal(foe.life.current, 14);
});

test("Chipsychosis Arena does not double a self-targeted attack", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const attacker = mustGetPlayer(state, markPlayerId("player-2"));
  attacker.wizardProperties = [];
  state.activePlayerId = attacker.playerId;
  const arena = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_008");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: arena.instanceId })
      .ok,
    true
  );
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === attacker.playerId)
      : undefined
  );
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 2,
    targetSelector: "chosenPlayer",
  });

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: attack }).ok,
    true
  );
  assert.equal(attacker.life.current, 18);
});

test("Chipsychosis Arena follows the current controller of a foreign attack card", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const owner = mustGetPlayer(state, markPlayerId("player-1"));
  const controller = mustGetPlayer(state, markPlayerId("player-2"));
  const target = mustGetPlayer(state, markPlayerId("player-3"));
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  state.activePlayerId = controller.playerId;
  const arena = addRuntimeCardToHand(state, controller, "esw2_dbg__legend_008");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: arena.instanceId })
      .ok,
    true
  );
  const foreignAttack = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-foreign-arena-attack", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ])
  );
  foreignAttack.ownerId = owner.playerId;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined
  );

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: foreignAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(target.life.current, 16);

  const ownerArena = addRuntimeCardToHand(state, owner, "esw2_dbg__legend_008");
  state.activePlayerId = owner.playerId;
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: ownerArena.instanceId,
    }).ok,
    true
  );
  state.activePlayerId = target.playerId;
  const ownerAttack = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-owner-arena-attack", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        targetSelector: "chosenFoe",
      },
    ])
  );
  ownerAttack.ownerId = owner.playerId;
  controller.life.current = 20;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === controller.playerId)
      : undefined
  );

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: ownerAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(controller.life.current, 18);
});

test("redirect defense avoids an ownerless Mayhem attack and still executes its branch", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const sourcePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(sourcePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== sourcePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.hand.splice(0);
  const defense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf",
    {
      redirectAttack: true,
      branchEffects: [
        { effectId: "draw_cards", timing: "onDefense", amount: 1 },
      ],
    }
  );
  chooseFirstFixtureDefense(state);
  const drawnCard = targetPlayer.deck[0];
  assert.ok(drawnCard);
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-ownerless-mayhem-attack",
    [
      {
        effectId: "mayhem_attack",
        timing: "onMayhemResolve",
        amount: 4,
        target: { selector: "allPlayers" },
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-ownerless-mayhem-attack-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.destroyedMayhem.push(mayhem);
  const lifeBefore = targetPlayer.life.current;

  const result = executeMayhemEffects(state, sourcePlayer, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: sourcePlayer.playerId,
    cardInstanceId: mayhem.instanceId,
    definitionId: mayhem.definitionId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore);
  assert.equal(targetPlayer.discard.includes(defense), true);
  assert.equal(targetPlayer.hand.includes(drawnCard), true);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.playerId === targetPlayer.playerId
    ),
    false
  );
});

test("active player can play a card from hand through the action loop", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  const playableCard = activePlayer.hand.find(
    (card) => card.definitionId === "esw2_dbg__starter_001"
  );
  assert.ok(playableCard);

  const legalActions = listLegalActions(state);
  assert.ok(
    legalActions.some(
      (action) =>
        action.type === "playCard" &&
        action.cardInstanceId === playableCard.instanceId
    )
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: playableCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(playableCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(playableCard), true);
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "cardMoved" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === playableCard.instanceId &&
        event.sourceZone === `${activePlayer.playerId}.hand` &&
        event.destinationZone === `${activePlayer.playerId}.playedThisTurn` &&
        event.ownerBefore === activePlayer.playerId &&
        event.ownerAfter === activePlayer.playerId
      );
    })
  );
  assert.equal(state.eventLog.at(-1)?.type, "cardPlayed");
});

test("playing an add-power card records an immediate effect consequence", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  const playableCard = activePlayer.hand.find(
    (card) => card.definitionId === "esw2_dbg__starter_001"
  );
  assert.ok(playableCard);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: playableCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  const powerEvent = state.eventLog.find((event) => {
    return (
      event.type === "effectAddPowerApplied" &&
      event.playerId === activePlayer.playerId &&
      event.cardInstanceId === playableCard.instanceId &&
      event.definitionId === playableCard.definitionId
    );
  });
  assert.ok(powerEvent);
  assert.equal(powerEvent.powerBefore, 0);
  assert.equal(powerEvent.powerAfter, 1);
});

test("simple-baseline current runtime cards execute printed baseline play behavior", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const expectedPowerByCardId = new Map([
    ["esw2_dbg__starter_001", 1],
    ["esw2_dbg__main_002", 5],
    ["esw2_dbg__main_035", 4],
    ["esw2_dbg__main_038", 3],
  ]);

  for (const [definitionId, expectedPower] of expectedPowerByCardId) {
    state.turn.power = 0;
    const card = addRuntimeCardToHand(state, activePlayer, definitionId);
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(state.turn.power, expectedPower);
    assert.ok(
      state.eventLog.some((event) => {
        return (
          event.type === "effectAddPowerApplied" &&
          event.cardInstanceId === card.instanceId &&
          event.definitionId === definitionId &&
          event.powerBefore === 0 &&
          event.powerAfter === expectedPower
        );
      })
    );
  }

  const drawCard = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_004"
  );
  activePlayer.deck.unshift(
    {
      instanceId: markCardInstanceId("simple-baseline-draw-target-1"),
      definitionId: markCardDefinitionId("esw2_dbg__starter_002"),
      ownerId: activePlayer.playerId,
      marketChips: 0,
    },
    {
      instanceId: markCardInstanceId("simple-baseline-draw-target-2"),
      definitionId: markCardDefinitionId("esw2_dbg__starter_002"),
      ownerId: activePlayer.playerId,
      marketChips: 0,
    }
  );
  const drawHandSizeBefore = activePlayer.hand.length;
  const drawDeckSizeBefore = activePlayer.deck.length;
  const drawResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: drawCard.instanceId,
  });

  assert.equal(drawResult.ok, true);
  assert.equal(activePlayer.deck.length, drawDeckSizeBefore - 2);
  assert.equal(activePlayer.hand.length, drawHandSizeBefore + 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDrawCardsApplied" &&
        event.cardInstanceId === drawCard.instanceId &&
        event.definitionId === "esw2_dbg__main_004" &&
        event.amount === 2
      );
    })
  );

  for (const definitionId of [
    "esw2_dbg__starter_002",
    "esw2_dbg__legend_009",
  ]) {
    state.turn.power = 0;
    const card = addRuntimeCardToHand(state, activePlayer, definitionId);
    const eventCountBefore = state.eventLog.length;
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(state.turn.power, 0);
    assert.equal(
      state.eventLog
        .slice(eventCountBefore)
        .some((event) => event.type.startsWith("effect")),
      false
    );
  }
});

test("controlled-object current runtime cards resolve printed power behavior", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);

  state.turn.power = 0;
  const sadOrc = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_016"
  );
  let result = applyAction(state, {
    type: "playCard",
    cardInstanceId: sadOrc.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);

  state.turn.power = 0;
  activePlayer.hand.splice(0);
  const controlledCreature = createRuntimeCardInstance(
    activePlayer,
    "esw2_dbg__main_035",
    "controlled-creature"
  );
  activePlayer.permanents.push(controlledCreature);
  const sadOrcWithCreature = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_016"
  );
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: sadOrcWithCreature.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 4);

  state.turn.power = 0;
  activePlayer.hand.splice(0);
  activePlayer.deck.push(
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "drawn")
  );
  activePlayer.deadWizardTokens.push({
    instanceId: markTokenInstanceId("controlled-dwt"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_001"),
    ownerId: activePlayer.playerId,
  });
  activePlayer.trophyLikeObjects.push({
    instanceId: markCardInstanceId("controlled-basic-trophy"),
    trophyId: "controlled-basic-trophy",
    ownerId: activePlayer.playerId,
    effects: [],
  });
  const gift = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_056");
  activePlayer.permanents.push(
    createRuntimeCardInstance(activePlayer, "esw2_dbg__main_040", "gift-helper")
  );
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: gift.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 8);
  assert.equal(activePlayer.hand.length, 1);
});

test("controlled-object attack cards use controlled card costs", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);

  activePlayer.hand.splice(0);
  activePlayer.permanents.push(
    createRuntimeCardInstance(activePlayer, "esw2_dbg__main_040", "cost-five"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__legend_004", "cost-ten")
  );
  const slippers = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_020"
  );
  let lifeBefore = targetPlayer.life.current;
  let result = applyAction(state, {
    type: "playCard",
    cardInstanceId: slippers.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore - 10);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.definitionId === "esw2_dbg__main_020" &&
        event.amount === 10
      );
    })
  );

  activePlayer.hand.splice(0);
  activePlayer.playedThisTurn.splice(0);
  activePlayer.permanents.splice(0);
  const selfCountedSlippers = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_020"
  );
  targetPlayer.life.current = 20;
  lifeBefore = targetPlayer.life.current;
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: selfCountedSlippers.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore - 6);
  assert.equal(activePlayer.playedThisTurn.includes(selfCountedSlippers), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.cardInstanceId === selfCountedSlippers.instanceId &&
        event.definitionId === "esw2_dbg__main_020" &&
        event.amount === 6
      );
    })
  );

  activePlayer.hand.splice(0);
  activePlayer.playedThisTurn.splice(0);
  activePlayer.permanents.splice(0);
  const playedThisTurnDefinition = createFixtureCardDefinition(
    "fixture-played-this-turn-cost-seven",
    []
  );
  playedThisTurnDefinition.engine.cost = 7;
  playedThisTurnDefinition.visible.cost = 7;
  const alreadyPlayedCard = addFixtureDefinitionToActiveHand(
    state,
    playedThisTurnDefinition,
    {
      instanceId: markCardInstanceId(
        "fixture-played-this-turn-cost-seven-instance"
      ),
    }
  );
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: alreadyPlayedCard.instanceId,
  });
  assert.equal(result.ok, true);
  assert.equal(activePlayer.playedThisTurn.includes(alreadyPlayedCard), true);
  const playedThisTurnSlippers = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_020"
  );
  targetPlayer.life.current = 20;
  lifeBefore = targetPlayer.life.current;
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: playedThisTurnSlippers.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore - 7);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.cardInstanceId === playedThisTurnSlippers.instanceId &&
        event.definitionId === "esw2_dbg__main_020" &&
        event.amount === 7
      );
    })
  );

  activePlayer.hand.splice(0);
  activePlayer.playedThisTurn.splice(0);
  activePlayer.permanents.splice(0);
  activePlayer.permanents.push(
    createRuntimeCardInstance(activePlayer, "esw2_dbg__main_040", "chosen-five")
  );
  const throne = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_011"
  );
  activePlayer.permanents.push(throne);
  lifeBefore = targetPlayer.life.current;
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: throne.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore - 5);
  assert.ok(
    state.eventLog.some((event) => {
      const eventRecord = event as unknown as Record<string, unknown>;
      const targetCardInstanceIds = eventRecord["targetCardInstanceIds"];
      return (
        event.type === "effectChoiceSelected" &&
        event.definitionId === "esw2_dbg__legend_011" &&
        Array.isArray(targetCardInstanceIds) &&
        targetCardInstanceIds.includes("fixture-runtime-chosen-five")
      );
    })
  );
});

test("illegal actions are rejected without changing game state", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const before = snapshotActionState(state);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: "missing-card-instance",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(snapshotActionState(state), before);
});

test("active player can buy an affordable market card into discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  for (const card of [...activePlayer.hand]) {
    applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });
  }

  const buyAction = listLegalActions(state).find(
    (action) => action.type === "buyMarketCard"
  );
  assert.ok(buyAction);

  const marketCard = state.common.market.find(
    (card) => card.instanceId === buyAction.cardInstanceId
  );
  assert.ok(marketCard);
  const powerBeforeBuy = state.turn.power;
  const cost = state.cardDefinitions.get(marketCard.definitionId)?.engine.cost;
  assert.equal(typeof cost, "number");
  assert.ok(cost !== undefined);

  const result = applyAction(state, buyAction);

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(marketCard), false);
  assert.equal(activePlayer.discard.includes(marketCard), true);
  assert.equal(marketCard.ownerId, activePlayer.playerId);
  assert.equal(state.turn.power, powerBeforeBuy - cost);
  assert.equal(state.eventLog.at(-1)?.type, "cardBought");
});

test("market chip marker adds chips to every marked card in that market during Market Flow", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const markedInMarket: CardInstance = {
    instanceId: markCardInstanceId("fixture-marked-in-market"),
    definitionId: markCardDefinitionId("esw2_dbg__main_012"),
    ownerId: "common",
    marketChips: 0,
  };
  const markedMarketFlowCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-marked-market-flow"),
    definitionId: markCardDefinitionId("esw2_dbg__main_012"),
    ownerId: "common",
    marketChips: 0,
  };
  const fillerCards = state.common.market
    .filter(
      (card) =>
        state.cardDefinitions.get(card.definitionId)?.engine
          .marketChipMarker !== true
    )
    .slice(0, 3);
  assert.equal(fillerCards.length, 3);
  state.common.market.splice(
    0,
    state.common.market.length,
    markedInMarket,
    ...fillerCards
  );
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    markedMarketFlowCard
  );

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(markedMarketFlowCard), true);
  assert.equal(markedInMarket.marketChips, 1);
  assert.equal(markedMarketFlowCard.marketChips, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "marketChipAdded" &&
        event.cardInstanceId === markedInMarket.instanceId &&
        event.amount === 1
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "marketChipAdded" &&
        event.cardInstanceId === markedMarketFlowCard.instanceId &&
        event.amount === 1
      );
    })
  );
});

test("turn-start Market Flow adds a normal main-deck card to the main market", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const marketFlowCard = state.common.market.find((card) => {
    return (
      state.cardDefinitions.get(card.definitionId)?.engine.cardKind === "normal"
    );
  });
  assert.ok(marketFlowCard);
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, marketFlowCard);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(marketFlowCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "marketFlowCardAdded" &&
        event.cardInstanceId === marketFlowCard.instanceId
      );
    })
  );
});

test("megaMayhem revealed during Market Flow executes its mapped onMayhemResolve effect", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  for (const player of state.players) {
    player.life.current = 20;
  }
  const megaMayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mega-mayhem-set-life"),
    definitionId: markCardDefinitionId("esw2_dbg__legend_003"),
    ownerId: "common",
    marketChips: 0,
  };
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
  assert.equal(
    state.players.every((player) => player.life.current === 5),
    true
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "mayhemResolved" &&
        event.cardInstanceId === megaMayhem.instanceId
      );
    })
  );
});

test("megaMayhem Dingler toggle resolves for each player in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.life.current = 20;
  secondPlayer.life.current = 20;
  thirdPlayer.life.current = 20;
  activePlayer.statuses.push({
    instanceId: markCardInstanceId("fixture-active-dingler-status"),
    statusId: "dingler",
    ownerId: activePlayer.playerId,
    effects: [],
  });

  const megaMayhemDefinition = createFixtureCardDefinition(
    "fixture-mega-mayhem-toggle-dingler",
    [
      {
        effectId: "mega_mayhem_each_player_toggle_dingler",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
      },
    ],
    { cardKind: "megaMayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [megaMayhemDefinition.cardId, megaMayhemDefinition],
  ]);
  const megaMayhem: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-mega-mayhem-toggle-dingler-instance"
    ),
    definitionId: markCardDefinitionId(megaMayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(activePlayer.life.current, 20);
  for (const targetPlayer of [secondPlayer, thirdPlayer]) {
    assert.equal(
      targetPlayer.statuses.filter((status) => status.statusId === "dingler")
        .length,
      1
    );
    assert.equal(targetPlayer.life.current, 15);
  }
  assertEventOrder(state, [
    (event) =>
      event.type === "dinglerStatusRemoved" &&
      event.playerId === activePlayer.playerId,
    (event) =>
      event.type === "dinglerStatusGained" &&
      event.playerId === secondPlayer.playerId,
    (event) =>
      event.type === "dinglerStatusGained" &&
      event.playerId === thirdPlayer.playerId,
  ]);
});

test("megaMayhem destroys top main deck cards in active-player order and kills players when Mayhem is destroyed", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mega-mayhem-destroy-top-mayhem",
    [],
    { cardKind: "mayhem" }
  );
  const normalDefinition = createFixtureCardDefinition(
    "fixture-mega-mayhem-destroy-top-normal",
    []
  );
  const megaMayhemDefinition = createFixtureCardDefinition(
    "fixture-mega-mayhem-destroy-top-main-deck",
    [
      {
        effectId:
          "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        deathCondition: {
          effectId: "destroyed_card_kind_is",
          cardKind: "mayhem",
        },
        destroyedCardSource: "mainDeck",
      },
    ],
    { cardKind: "megaMayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [normalDefinition.cardId, normalDefinition],
    [megaMayhemDefinition.cardId, megaMayhemDefinition],
  ]);

  const mayhemCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-destroy-top-mayhem"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const activeNormalCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-destroy-top-active-normal"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  const thirdNormalCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-destroy-top-third-normal"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: thirdPlayer.playerId,
    marketChips: 0,
  };
  const megaMayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mega-mayhem-destroy-top-instance"),
    definitionId: markCardDefinitionId(megaMayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    activeNormalCard,
    mayhemCard,
    thirdNormalCard
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "effectTopMainDeckCardDestroyed")
      .map((event) => ({
        playerId: event.playerId,
        targetCardInstanceId: event.targetCardInstanceId,
      })),
    [
      {
        playerId: activePlayer.playerId,
        targetCardInstanceId: activeNormalCard.instanceId,
      },
      {
        playerId: secondPlayer.playerId,
        targetCardInstanceId: mayhemCard.instanceId,
      },
      {
        playerId: thirdPlayer.playerId,
        targetCardInstanceId: thirdNormalCard.instanceId,
      },
    ]
  );
  assert.equal(state.common.destroyedPile.includes(activeNormalCard), true);
  assert.equal(state.common.destroyedMayhem.includes(mayhemCard), true);
  assert.equal(state.common.destroyedPile.includes(thirdNormalCard), true);
  assert.equal(activeNormalCard.ownerId, activePlayer.playerId);
  assert.equal(thirdNormalCard.ownerId, thirdPlayer.playerId);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === secondPlayer.playerId
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "playerResurrected" &&
        event.playerId === secondPlayer.playerId
    )
  );
});

test("Mayhem discards top deck cards and destroys them in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-mayhem-discard-top-normal",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-discard-top-deck-destroy",
    [
      {
        effectId:
          "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        choice: "destroyBothOrDestroyNone",
        amount: 1,
        sourceZone: "deck",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [normalDefinition.cardId, normalDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);

  const activeTopDeckCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-discard-active-top"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  const secondTopDeckCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-discard-second-top"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: secondPlayer.playerId,
    marketChips: 0,
  };
  const thirdTopDeckCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-discard-third-top"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: thirdPlayer.playerId,
    marketChips: 0,
  };
  activePlayer.deck.splice(0, activePlayer.deck.length, activeTopDeckCard);
  secondPlayer.deck.splice(0, secondPlayer.deck.length, secondTopDeckCard);
  thirdPlayer.deck.splice(0, thirdPlayer.deck.length, thirdTopDeckCard);

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-discard-top-deck-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemDiscardedTopDeckCardsDestroyed")
      .map((event) => ({
        playerId: event.playerId,
        amount: event.amount,
      })),
    [
      { playerId: activePlayer.playerId, amount: 1 },
      { playerId: secondPlayer.playerId, amount: 1 },
      { playerId: thirdPlayer.playerId, amount: 1 },
    ]
  );
  assert.deepEqual(
    state.common.destroyedPile.map((card) => card.instanceId),
    [
      activeTopDeckCard.instanceId,
      secondTopDeckCard.instanceId,
      thirdTopDeckCard.instanceId,
    ]
  );
  assert.equal(activeTopDeckCard.ownerId, activePlayer.playerId);
  assert.equal(secondTopDeckCard.ownerId, secondPlayer.playerId);
  assert.equal(thirdTopDeckCard.ownerId, thirdPlayer.playerId);
});

test("Mayhem discards each deck and destroys the first discard in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-mayhem-discard-deck-normal",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-discard-deck-destroy",
    [
      {
        effectId: "mayhem_each_player_discard_deck_then_destroy_from_discard",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        destroyAmount: 1,
        destroySourceZone: "discard",
        discardSourceZone: "deck",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [normalDefinition.cardId, normalDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);

  const players = [activePlayer, secondPlayer, thirdPlayer];
  const deckCards = players.map((player) => {
    return [0, 1].map((cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-discard-deck-${player.playerId}-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });

  for (const [playerIndex, player] of players.entries()) {
    const cards = deckCards[playerIndex];
    assert.ok(cards);
    player.deck.splice(0, player.deck.length, ...cards);
    player.discard.splice(0, player.discard.length);
  }

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-discard-deck-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) => event.type === "mayhemDeckDiscardedThenDiscardCardDestroyed"
      )
      .map((event) => ({
        playerId: event.playerId,
        amount: event.amount,
        targetCardInstanceId: event.targetCardInstanceId,
      })),
    [
      {
        playerId: activePlayer.playerId,
        amount: 2,
        targetCardInstanceId: deckCards[0]?.[0]?.instanceId,
      },
      {
        playerId: secondPlayer.playerId,
        amount: 2,
        targetCardInstanceId: deckCards[1]?.[0]?.instanceId,
      },
      {
        playerId: thirdPlayer.playerId,
        amount: 2,
        targetCardInstanceId: deckCards[2]?.[0]?.instanceId,
      },
    ]
  );
  assert.deepEqual(
    state.common.destroyedPile.map((card) => card.instanceId),
    [
      deckCards[0]?.[0]?.instanceId,
      deckCards[1]?.[0]?.instanceId,
      deckCards[2]?.[0]?.instanceId,
    ]
  );

  for (const [playerIndex, player] of players.entries()) {
    const cards = deckCards[playerIndex];
    assert.ok(cards);
    assert.deepEqual(player.deck, []);
    assert.deepEqual(
      player.discard.map((card) => card.instanceId),
      [cards[1]?.instanceId]
    );
    assert.equal(cards[0]?.ownerId, player.playerId);
    assert.equal(cards[1]?.ownerId, player.playerId);
  }
});

test("Mayhem hand-redraw choice discards hands and draws in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-mayhem-hand-redraw-normal",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-hand-redraw",
    [
      {
        effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        options: [
          {
            effectId: "discard_hand_then_draw_cards",
            drawAmount: 5,
          },
          {
            effectId: "take_damage",
            amount: 5,
          },
        ],
        chooser: "affectedPlayer",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [normalDefinition.cardId, normalDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);

  const players = [activePlayer, secondPlayer, thirdPlayer];
  const discardedHandCards = players.map((player) => {
    return [0, 1].map((cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-hand-redraw-${player.playerId}-hand-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });
  const drawnDeckCards = players.map((player) => {
    return Array.from({ length: 5 }, (_value, cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-hand-redraw-${player.playerId}-deck-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });

  for (const [playerIndex, player] of players.entries()) {
    const handCards = discardedHandCards[playerIndex];
    const deckCards = drawnDeckCards[playerIndex];
    assert.ok(handCards);
    assert.ok(deckCards);
    player.hand.splice(0, player.hand.length, ...handCards);
    player.deck.splice(0, player.deck.length, ...deckCards);
    player.discard.splice(0, player.discard.length);
  }

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-hand-redraw-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemHandDiscardedAndRedrawn")
      .map((event) => ({
        playerId: event.playerId,
        amount: event.amount,
      })),
    [
      { playerId: activePlayer.playerId, amount: 7 },
      { playerId: secondPlayer.playerId, amount: 7 },
      { playerId: thirdPlayer.playerId, amount: 7 },
    ]
  );
  for (const [playerIndex, player] of players.entries()) {
    const handCards = discardedHandCards[playerIndex];
    const deckCards = drawnDeckCards[playerIndex];
    assert.ok(handCards);
    assert.ok(deckCards);
    assert.deepEqual(
      player.hand.map((card) => card.instanceId),
      deckCards.map((card) => card.instanceId)
    );
    assert.deepEqual(
      player.discard.map((card) => card.instanceId),
      handCards.map((card) => card.instanceId)
    );
    assert.deepEqual(player.deck, []);
  }
});

test("Mayhem battle keeps highest-cost participants and discards losing hands in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const lowCostDefinition = createFixtureCardDefinition(
    "fixture-mayhem-battle-low-cost",
    []
  );
  lowCostDefinition.engine.cost = 2;
  lowCostDefinition.visible.cost = 2;
  const highCostDefinition = createFixtureCardDefinition(
    "fixture-mayhem-battle-high-cost",
    []
  );
  highCostDefinition.engine.cost = 8;
  highCostDefinition.visible.cost = 8;
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-battle",
    [
      {
        effectId: "mayhem_each_player_battle_highest_hand_cost",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        winnerDrawAmount: 2,
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [lowCostDefinition.cardId, lowCostDefinition],
    [highCostDefinition.cardId, highCostDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);

  const activeHand = createFixtureCardInstances(
    lowCostDefinition.cardId,
    activePlayer.playerId,
    2
  );
  const secondHand = createFixtureCardInstances(
    highCostDefinition.cardId,
    secondPlayer.playerId,
    1
  );
  const thirdHand = createFixtureCardInstances(
    highCostDefinition.cardId,
    thirdPlayer.playerId,
    1
  );
  const winnerDrawCards = [secondPlayer, thirdPlayer].map((player) =>
    createFixtureCardInstances(lowCostDefinition.cardId, player.playerId, 2)
  );
  const secondDrawCards = winnerDrawCards[0];
  const thirdDrawCards = winnerDrawCards[1];
  assert.ok(secondDrawCards);
  assert.ok(thirdDrawCards);
  activePlayer.hand.splice(0, activePlayer.hand.length, ...activeHand);
  secondPlayer.hand.splice(0, secondPlayer.hand.length, ...secondHand);
  thirdPlayer.hand.splice(0, thirdPlayer.hand.length, ...thirdHand);
  activePlayer.discard.splice(0, activePlayer.discard.length);
  secondPlayer.discard.splice(0, secondPlayer.discard.length);
  thirdPlayer.discard.splice(0, thirdPlayer.discard.length);
  secondPlayer.deck.splice(0, secondPlayer.deck.length, ...secondDrawCards);
  thirdPlayer.deck.splice(0, thirdPlayer.deck.length, ...thirdDrawCards);

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-battle-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemBattleParticipationSelected")
      .map((event) => event.playerId),
    [activePlayer.playerId, secondPlayer.playerId, thirdPlayer.playerId]
  );
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemBattleResolved")
      .map((event) => {
        const eventRecord = event as unknown as Record<string, unknown>;
        return {
          playerId: event.playerId,
          amount: event.amount,
          winnerPlayerIds: eventRecord["winnerPlayerIds"],
        };
      }),
    [
      {
        playerId: activePlayer.playerId,
        amount: 8,
        winnerPlayerIds: [secondPlayer.playerId, thirdPlayer.playerId],
      },
    ]
  );
  assert.deepEqual(
    activePlayer.discard.map((card) => card.instanceId),
    activeHand.map((card) => card.instanceId)
  );
  assert.deepEqual(
    secondPlayer.hand.map((card) => card.instanceId),
    [...secondHand, ...secondDrawCards].map((card) => card.instanceId)
  );
  assert.deepEqual(
    thirdPlayer.hand.map((card) => card.instanceId),
    [...thirdHand, ...thirdDrawCards].map((card) => card.instanceId)
  );
});

test("Mayhem vote makes the top-voted player Dingler after affected-player votes", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  for (const player of [activePlayer, secondPlayer, thirdPlayer]) {
    player.life.current = 20;
  }

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-vote-dingler",
    [
      {
        effectId: "mayhem_each_player_vote_dingler",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        voteTargetSelector: "anyPlayer",
        statusId: "dingler",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-vote-dingler-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemVoteRecorded")
      .map((event) => ({
        playerId: event.playerId,
        targetPlayerId: event.targetPlayerId,
      })),
    [
      {
        playerId: activePlayer.playerId,
        targetPlayerId: activePlayer.playerId,
      },
      {
        playerId: secondPlayer.playerId,
        targetPlayerId: activePlayer.playerId,
      },
      { playerId: thirdPlayer.playerId, targetPlayerId: activePlayer.playerId },
    ]
  );
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(activePlayer.life.current, 15);
  assert.equal(
    secondPlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(
    thirdPlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      const eventRecord = event as unknown as Record<string, unknown>;
      const winnerPlayerIds = eventRecord["winnerPlayerIds"];
      return (
        event.type === "mayhemVoteResolved" &&
        Array.isArray(winnerPlayerIds) &&
        winnerPlayerIds.length === 1 &&
        winnerPlayerIds[0] === activePlayer.playerId
      );
    })
  );
});

test("Mayhem vote can use a non-first affected-player choice", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  for (const player of [activePlayer, secondPlayer, thirdPlayer]) {
    player.life.current = 20;
  }
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "mayhem_each_player_vote_dingler") {
      return undefined;
    }
    return choices.find(
      (choice) => choice.choiceId === `vote-${secondPlayer.playerId}`
    );
  });

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-vote-dingler-non-first-choice",
    [
      {
        effectId: "mayhem_each_player_vote_dingler",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        voteTargetSelector: "anyPlayer",
        statusId: "dingler",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-mayhem-vote-dingler-non-first-choice-instance"
    ),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemVoteRecorded")
      .map((event) => event.targetPlayerId),
    [secondPlayer.playerId, secondPlayer.playerId, secondPlayer.playerId]
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "mayhem_each_player_vote_dingler" &&
        event.choiceId === `vote-${secondPlayer.playerId}`
    ).length,
    3
  );
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "mayhem_each_player_vote_dingler"
      )
      .map((event) => event.targetPlayerIds),
    [[secondPlayer.playerId], [secondPlayer.playerId], [secondPlayer.playerId]]
  );
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(
    secondPlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(
    thirdPlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
});

test("Mayhem Dingler recovery lets each Dingler pay life or chips to become normal", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, chipPlayer, blockedPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(chipPlayer);
  assert.ok(blockedPlayer);

  activePlayer.life.current = 6;
  chipPlayer.life.current = 5;
  chipPlayer.chips = 1;
  blockedPlayer.life.current = 5;
  for (const player of [activePlayer, chipPlayer, blockedPlayer]) {
    player.statuses.push({
      instanceId: markCardInstanceId(
        `fixture-${player.playerId}-dingler-status`
      ),
      statusId: "dingler",
      ownerId: player.playerId,
      effects: [],
    });
  }

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-dingler-recovery",
    [
      {
        effectId:
          "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        statusId: "dingler",
        lifeCost: 5,
        chipCost: 1,
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-dingler-recovery-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(activePlayer.life.current, 1);
  assert.equal(
    chipPlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(chipPlayer.chips, 0);
  assert.equal(
    blockedPlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(blockedPlayer.life.current, 5);
  assertEventOrder(state, [
    (event) =>
      event.type === "effectCostPaid" &&
      event.playerId === activePlayer.playerId &&
      event.effectId ===
        "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status" &&
      event.costId === "pay_life" &&
      event.amount === 5,
    (event) =>
      event.type === "dinglerStatusRemoved" &&
      event.playerId === activePlayer.playerId,
    (event) =>
      event.type === "effectCostPaid" &&
      event.playerId === chipPlayer.playerId &&
      event.effectId ===
        "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status" &&
      event.costId === "spend_chips" &&
      event.amount === 1,
    (event) =>
      event.type === "dinglerStatusRemoved" &&
      event.playerId === chipPlayer.playerId,
  ]);
});

test("Mayhem Dingler recovery can choose a non-first legal chip cost", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, chipPlayer, blockedPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(chipPlayer);
  assert.ok(blockedPlayer);

  activePlayer.life.current = 6;
  activePlayer.chips = 1;
  chipPlayer.life.current = 5;
  chipPlayer.chips = 1;
  blockedPlayer.life.current = 5;
  for (const player of [activePlayer, chipPlayer, blockedPlayer]) {
    player.statuses.push({
      instanceId: markCardInstanceId(
        `fixture-${player.playerId}-non-first-dingler-status`
      ),
      statusId: "dingler",
      ownerId: player.playerId,
      effects: [],
    });
  }
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (
        effectId !==
        "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status"
      ) {
        return undefined;
      }
      if (player.playerId !== activePlayer.playerId) {
        return undefined;
      }
      return choices.find((choice) => choice.choiceId === "spend_chips");
    }
  );

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-dingler-recovery-non-first-cost",
    [
      {
        effectId:
          "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        chooser: "affectedPlayer",
        statusId: "dingler",
        lifeCost: 5,
        chipCost: 1,
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-mayhem-dingler-recovery-non-first-cost-instance"
    ),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 6);
  assert.equal(activePlayer.chips, 0);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.effectId ===
          "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status" &&
        event.choiceId === "spend_chips" &&
        event.choiceIds?.includes("pay_life") === true
      );
    })
  );
});

test("Dingler count power effect adds one power per Dingler player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const firstFoe = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(firstFoe);
  for (const player of [activePlayer, firstFoe]) {
    player.statuses.push({
      instanceId: markCardInstanceId(
        `fixture-${player.playerId}-dingler-status`
      ),
      statusId: "dingler",
      ownerId: player.playerId,
      effects: [],
    });
  }
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "add_power_per_player_with_status",
    timing: "onPlay",
    statusId: "dingler",
    amountPerPlayer: 1,
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectAddPowerApplied" &&
        event.effectId === "add_power_per_player_with_status" &&
        event.amount === 2
      );
    })
  );
});

test("Tsirk bratiev loshashnykh grants passive power to a Dingler controller", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({
    dataPack,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  activePlayer.statuses.push(createDinglerStatus(activePlayer));
  const circus = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_027"
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: circus.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(circus), true);
  assert.equal(state.turn.power, 2);

  const firstEndTurnResult = applyAction(state, {
    type: "endTurn",
  });
  assert.equal(firstEndTurnResult.ok, true);

  const secondEndTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(secondEndTurnResult.ok, true);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(state.turn.power, 2);
});

test("Zhelatinovyi sisyak grants persistent power for each controlled copy", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({
    dataPack,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const sisyak = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_011"
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: sisyak.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(sisyak), true);
  assert.equal(state.turn.power, 1);

  const neutralCard = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__starter_002"
  );
  const neutralPlayResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: neutralCard.instanceId,
  });
  assert.equal(neutralPlayResult.ok, true);
  assert.equal(state.turn.power, 1);

  const firstEndTurnResult = applyAction(state, {
    type: "endTurn",
  });
  assert.equal(firstEndTurnResult.ok, true);
  const secondEndTurnResult = applyAction(state, {
    type: "endTurn",
  });
  assert.equal(secondEndTurnResult.ok, true);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(state.turn.power, 1);

  const secondSisyak = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_011"
  );
  const secondPlayResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: secondSisyak.instanceId,
  });

  assert.equal(secondPlayResult.ok, true);
  assert.equal(activePlayer.permanents.includes(secondSisyak), true);
  assert.equal(state.turn.power, 2);
});

test("Pokhotlivyi maiachok recalculates its controller power from controlled DWTs", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  assert.equal(
    dataPack.decks.legendDeck.entries.some(
      (entry) => entry.cardId === "esw2_dbg__legend_025" && entry.count === 1
    ),
    true
  );
  const state = initializeGame({
    dataPack,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const beacon = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_025"
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: beacon.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(state.turn.power, 0);

  for (const expectedPower of [1, 2]) {
    activePlayer.life.current = 1;
    const selfDamage = addFixtureCardToActiveHand(state, {
      effectId: "deal_damage",
      timing: "onPlay",
      amount: 1,
      target: {
        selector: "activePlayer",
      },
    });

    const damageResult = applyAction(state, {
      type: "playCard",
      cardInstanceId: selfDamage,
    });

    assert.equal(damageResult.ok, true);
    assert.equal(activePlayer.deadWizardTokens.length, expectedPower);
    assert.equal(state.turn.power, expectedPower);
  }
});

test("Tsirk bratiev loshashnykh does not grant passive power without Dingler status", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const state = initializeGame({
    dataPack,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const circus = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_027"
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: circus.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(circus), true);
  assert.equal(state.turn.power, 0);

  const firstEndTurnResult = applyAction(state, {
    type: "endTurn",
  });
  assert.equal(firstEndTurnResult.ok, true);

  const secondEndTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(secondEndTurnResult.ok, true);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(state.turn.power, 0);
});

test("Mayhem lowest-life Dingler effect normalizes tied players to Dingler max life", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, tiedPlayer, highLifePlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(tiedPlayer);
  assert.ok(highLifePlayer);
  activePlayer.life.current = 3;
  tiedPlayer.life.current = 3;
  highLifePlayer.life.current = 8;

  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-lowest-life-dingler",
    [
      {
        effectId: "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
        timing: "onMayhemResolve",
        statusId: "dingler",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-mayhem-lowest-life-dingler-instance"
    ),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  for (const player of [activePlayer, tiedPlayer]) {
    assert.equal(
      player.statuses.some((status) => status.statusId === "dingler"),
      true
    );
    assert.equal(player.life.current, 15);
  }
  assert.equal(
    highLifePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(highLifePlayer.life.current, 8);
});

test("Avada Loshavra attack-marked Dingler assignment can be avoided by defense", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  for (const player of state.players) {
    player.wizardProperties = [];
    player.statuses = [];
  }
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "attack_gain_status") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === targetPlayer.playerId
    );
  });
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  const card = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_014"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(targetPlayer), false);
  assert.equal(state.turn.power, 0);
  assert.equal(targetPlayer.hand.includes(defenseCard), false);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.playerId === targetPlayer.playerId &&
        event.definitionId === "esw2_dbg__legend_014"
    )
  );
});

test("Avada Loshavra makes an undefended target Dingler and counts it for power", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  for (const player of state.players) {
    player.wizardProperties = [];
    player.statuses = [];
  }
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "attack_gain_status") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === targetPlayer.playerId
    );
  });
  const card = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_014"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(targetPlayer), true);
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "dinglerStatusGained" &&
        event.playerId === targetPlayer.playerId &&
        event.effectId === "attack_gain_status"
    )
  );
});

test("tagged Wand status attack inherits its owner's defense prevention without dealing damage", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  for (const player of state.players) {
    player.statuses = [];
  }
  replaceFirstWizardProperty(
    state,
    activePlayer,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  const wandOfSuffering = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_009"
  );
  activePlayer.hand = activePlayer.hand.filter(
    (card) => card.instanceId !== wandOfSuffering.instanceId
  );
  activePlayer.permanents.push(wandOfSuffering);
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "attack_gain_status") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === targetPlayer.playerId
    );
  });
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  targetPlayer.life.current = 10;
  const attackCardId = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition(
      "fixture-wand-status-attack",
      [
        {
          effectId: "attack_gain_status",
          timing: "onPlay",
          statusId: "dingler",
          target: { selector: "opponentPlayer" },
        },
      ],
      { tags: ["wandAttackCard"] }
    )
  ).instanceId;
  const targetLifeBefore = targetPlayer.life.current;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(targetPlayer), true);
  assert.equal(targetPlayer.hand.includes(defenseCard), true);
  assert.equal(targetPlayer.life.current, targetLifeBefore);
});

test("untagged status attack still allows defense despite its owner's Wand profile", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  for (const player of state.players) {
    player.statuses = [];
  }
  replaceFirstWizardProperty(
    state,
    activePlayer,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const attackCardId = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-untagged-status-attack", [
      {
        effectId: "attack_gain_status",
        timing: "onPlay",
        statusId: "dingler",
        target: { selector: "opponentPlayer" },
      },
    ])
  ).instanceId;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(targetPlayer), false);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
});

test("2F skips a defended lowest-life player and still applies Dingler max-life normalization to an undefended tie", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, tiedPlayer, highLifePlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(tiedPlayer);
  assert.ok(highLifePlayer);
  activePlayer.life.current = 3;
  tiedPlayer.life.current = 3;
  highLifePlayer.life.current = 8;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    activePlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_074");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(activePlayer), false);
  assert.equal(activePlayer.life.current, 3);
  assert.equal(activePlayer.discard.includes(defenseCard), true);
  assert.equal(hasDinglerStatus(tiedPlayer), true);
  assert.equal(tiedPlayer.life.current, 15);
  assert.equal(hasDinglerStatus(highLifePlayer), false);
  assert.equal(highLifePlayer.life.current, 8);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.playerId === activePlayer.playerId &&
        event.definitionId === "esw2_dbg__main_074"
    )
  );
});

test("MegaMayhem MD skips a defended player and still toggles undefended players", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.statuses.push(createDinglerStatus(activePlayer));
  thirdPlayer.statuses.push(createDinglerStatus(thirdPlayer));
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    activePlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const megaMayhem = createCommonRuntimeCard("esw2_dbg__mega_mayhem_004");
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(hasDinglerStatus(activePlayer), true);
  assert.equal(activePlayer.discard.includes(defenseCard), true);
  assert.equal(hasDinglerStatus(secondPlayer), true);
  assert.equal(hasDinglerStatus(thirdPlayer), false);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.playerId === activePlayer.playerId &&
        event.definitionId === "esw2_dbg__mega_mayhem_004"
    )
  );
});

test("dingler-status current runtime cards load with mapped Dingler effects", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  const expectedEffectsByCardId = new Map([
    [
      "esw2_dbg__legend_014",
      ["draw_cards", "attack_gain_status", "add_power_per_player_with_status"],
    ],
    ["esw2_dbg__main_030", ["add_power", "attack_damage"]],
    [
      "esw2_dbg__main_066",
      ["mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status"],
    ],
    [
      "esw2_dbg__main_074",
      ["mayhem_lowest_life_players_gain_dingler_and_set_to_max_life"],
    ],
    ["esw2_dbg__mega_mayhem_004", ["mega_mayhem_each_player_toggle_dingler"]],
  ]);

  for (const [definitionId, effectIds] of expectedEffectsByCardId) {
    const definition = state.cardDefinitions.get(definitionId);
    assert.ok(definition, `${definitionId} should be loaded`);
    assert.deepEqual(
      definition.engine.effects.map((effect) => effect.effectId),
      effectIds
    );
  }
});

test("current runtime mayhem-events cards resolve their mapped event effects", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
    playerCount: 3,
  });
  const runtimeMayhemIds = [
    "esw2_dbg__main_059",
    "esw2_dbg__main_064",
    "esw2_dbg__main_071",
  ];

  for (const definitionId of runtimeMayhemIds) {
    const definition = state.cardDefinitions.get(definitionId);
    assert.ok(definition, `${definitionId} should be loaded`);
    assert.equal(definition.engine.cardKind, "mayhem");
    assert.ok(
      [
        ...state.common.mainDeck,
        ...state.common.destroyedMayhem,
        ...state.common.destroyedMegaMayhem,
      ].some((card) => card.definitionId === definitionId),
      `${definitionId} should be in the current main deck or resolved setup event pile`
    );
  }

  const eventTypesByCardId = new Map([
    ["esw2_dbg__main_059", "mayhemHandDiscardedAndRedrawn"],
    ["esw2_dbg__main_064", "mayhemBattleResolved"],
    ["esw2_dbg__main_071", "mayhemVoteResolved"],
  ]);

  for (const [definitionId, expectedEventType] of eventTypesByCardId) {
    const cardState = initializeGame({
      rootDir,
      seed: 60615,
      playerCount: 3,
    });
    const mayhem: CardInstance = {
      instanceId: markCardInstanceId(`fixture-runtime-${definitionId}`),
      definitionId: markCardDefinitionId(definitionId),
      ownerId: "common",
      marketChips: 0,
    };
    const legendFiller = cardState.common.legendMarket[0];
    assert.ok(legendFiller);
    cardState.common.legendMarket.push({
      ...legendFiller,
      instanceId: markCardInstanceId(
        `fixture-runtime-${definitionId}-legend-filler`
      ),
    });
    cardState.common.market.splice(
      0,
      cardState.common.market.length,
      ...cardState.common.market.slice(0, 4)
    );
    cardState.common.mainDeck.splice(
      0,
      cardState.common.mainDeck.length,
      mayhem
    );
    const eventCountBefore = cardState.eventLog.length;

    const result = runMarketFlow(cardState, { mode: "turn" });

    assert.equal(result.ok, true);
    assert.ok(
      cardState.eventLog
        .slice(eventCountBefore)
        .some((event) => event.type === expectedEventType),
      `${definitionId} should emit ${expectedEventType}`
    );
  }
});

test("mayhem revealed during Market Flow resolves and Market Flow continues with the next normal card", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-market-flow-mayhem-add-power",
    [{ effectId: "add_power", timing: "onMayhemResolve", amount: 2 }],
    { cardKind: "mayhem" }
  );
  const normalDefinition = createFixtureCardDefinition(
    "fixture-market-flow-normal-card",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [normalDefinition.cardId, normalDefinition],
  ]);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-market-flow-mayhem-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const normalCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-market-flow-normal-instance"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    mayhem,
    normalCard
  );

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(state.common.market.includes(mayhem), false);
  assert.equal(state.common.market.includes(normalCard), true);
  assert.equal(state.common.destroyedMayhem.at(-1), mayhem);
  assertEventOrder(state, [
    (event) =>
      event.type === "mayhemResolved" &&
      event.cardInstanceId === mayhem.instanceId,
    (event) =>
      event.type === "mayhemDestroyed" &&
      event.cardInstanceId === mayhem.instanceId,
    (event) =>
      event.type === "marketFlowCardAdded" &&
      event.cardInstanceId === normalCard.instanceId,
  ]);
});

test("Market Flow interface keeps setup Mayhem passive and turn Mayhem active", () => {
  const setupState = createMarketFlowModeFixture();
  const setupMayhem = setupState.common.mainDeck[0];
  const setupNormal = setupState.common.mainDeck[1];
  assert.ok(setupMayhem);
  assert.ok(setupNormal);

  const setupResult = runMarketFlow(setupState, { mode: "setup" });

  assert.equal(setupResult.ok, true);
  assert.equal(setupState.turn.power, 0);
  assert.equal(setupState.common.destroyedMayhem.at(-1), setupMayhem);
  assert.equal(setupState.common.market.includes(setupNormal), true);
  assert.equal(
    setupState.eventLog.some(
      (event) =>
        event.type === "mayhemResolved" &&
        event.cardInstanceId === setupMayhem.instanceId
    ),
    false
  );

  const turnState = createMarketFlowModeFixture();
  const turnMayhem = turnState.common.mainDeck[0];
  const turnNormal = turnState.common.mainDeck[1];
  assert.ok(turnMayhem);
  assert.ok(turnNormal);

  const turnResult = runMarketFlow(turnState, { mode: "turn" });

  assert.equal(turnResult.ok, true);
  assert.equal(turnState.turn.power, 2);
  assert.equal(turnState.common.destroyedMayhem.at(-1), turnMayhem);
  assert.equal(turnState.common.market.includes(turnNormal), true);
  assertEventOrder(turnState, [
    (event) =>
      event.type === "mayhemResolved" &&
      event.cardInstanceId === turnMayhem.instanceId,
    (event) =>
      event.type === "mayhemDestroyed" &&
      event.cardInstanceId === turnMayhem.instanceId,
    (event) =>
      event.type === "marketFlowCardAdded" &&
      event.cardInstanceId === turnNormal.instanceId,
  ]);
});

test("Market Flow reports main deck exhaustion without starting the next turn", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(0);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "mainDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    state.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("Market Flow reports legend deck exhaustion without starting the next turn", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.legendMarket.splice(0, 1);
  state.common.legendDeck.splice(0);

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "legendDeckExhausted");
  assert.equal(state.eventLog.at(-1)?.type, "marketFlowFailed");
  assert.equal(
    state.eventLog.some((event) => event.type === "turnStarted"),
    false
  );
});

test("unsupported Mayhem effect fails during Market Flow instead of becoming a silent no-op", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const unsupportedMayhemDefinition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-unsupported-mayhem",
    source: { image: "assets/cards/fixtures/fixture-unsupported-mayhem.png" },
    visible: {
      nameRu: "Unsupported Mayhem",
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "mayhem",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "mayhem",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [
        {
          effectId: "unsupported_mayhem_runtime_effect",
          timing: "onMayhemResolve",
        },
      ] as unknown as RuntimeEffect[],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [unsupportedMayhemDefinition.cardId, unsupportedMayhemDefinition],
  ]);
  const unsupportedMayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-unsupported-mayhem-instance"),
    definitionId: markCardDefinitionId(unsupportedMayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(0, 1);
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    unsupportedMayhem
  );

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, false);
  assert.match(
    result.error,
    /Unsupported effect id unsupported_mayhem_runtime_effect/
  );
  assert.equal(state.common.destroyedMayhem.includes(unsupportedMayhem), false);
});

test("active player can buy wild magic from its stack into discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  for (const card of [...activePlayer.hand]) {
    applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });
  }

  const wildMagicAction = listLegalActions(state).find((action) => {
    return (
      action.type === "buyMarketCard" && action.source === "wildMagicStack"
    );
  });
  assert.ok(wildMagicAction);

  const wildMagicCard = state.common.wildMagicStack.at(0);
  assert.ok(wildMagicCard);
  const result = applyAction(state, wildMagicAction);

  assert.equal(result.ok, true);
  assert.equal(activePlayer.discard.includes(wildMagicCard), true);
  assert.equal(wildMagicCard.ownerId, activePlayer.playerId);
});

test("active player can buy and play their setup familiar", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const foe = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(foe);
  const familiar = activePlayer.unboughtFamiliar;
  assert.ok(familiar);

  assert.equal(familiar.definitionId, "esw2_dbg__familiar_001");
  assert.equal(familiar.ownerId, activePlayer.playerId);
  assert.equal(findOwnedCard(activePlayer, familiar.definitionId), undefined);
  assert.equal(foe.unboughtFamiliar?.instanceId === familiar.instanceId, false);
  assert.equal(
    scoreGame(state).find((score) => score.playerId === activePlayer.playerId)
      ?.victoryPoints,
    0
  );

  state.turn.power = 5;
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "buyMarketCard" && action.source === "familiar"
    ),
    false
  );

  state.turn.power = 6;
  const buyAction = listLegalActions(state).find((action) => {
    return (
      action.type === "buyMarketCard" &&
      action.source === "familiar" &&
      action.cardInstanceId === familiar.instanceId
    );
  });
  assert.ok(buyAction);

  const buyResult = applyAction(state, buyAction);
  assert.equal(buyResult.ok, true);
  assert.equal(activePlayer.unboughtFamiliar, undefined);
  assert.equal(activePlayer.discard.includes(familiar), true);
  assert.equal(
    scoreGame(state).find((score) => score.playerId === activePlayer.playerId)
      ?.victoryPoints,
    2
  );

  moveCardToHand(activePlayer, familiar);
  state.turn.power = 0;
  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: familiar.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(state.turn.power, 3);
});

test("bought familiar can discard another hand card to avoid an attack", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const targetPlayer = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(targetPlayer);
  const familiar = targetPlayer.unboughtFamiliar;
  assert.ok(familiar);
  const paidDiscard = targetPlayer.hand[0];
  assert.ok(paidDiscard);
  targetPlayer.unboughtFamiliar = undefined;
  familiar.ownerId = targetPlayer.playerId;
  targetPlayer.hand.push(familiar);
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "avoid_attack"
      ? choices.find(
          (choice) =>
            choice.choiceKind === "defense" && choice.card === familiar
        )
      : undefined
  );
  targetPlayer.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(familiar), false);
  assert.equal(targetPlayer.discard.includes(familiar), true);
  assert.equal(targetPlayer.hand.includes(paidDiscard), false);
  assert.equal(targetPlayer.discard.includes(paidDiscard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseChoiceSelected" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === familiar.instanceId &&
        event.definitionId === familiar.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === familiar.instanceId &&
        event.targetCardInstanceId === paidDiscard.instanceId &&
        event.effectId === "discard_other_hand_card"
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackAvoided" &&
        event.targetPlayerId === targetPlayer.playerId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId
    ),
    false
  );
});

test("bought familiar cannot defend when no other hand card can pay its discard cost", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const targetPlayer = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(targetPlayer);
  const familiar = targetPlayer.unboughtFamiliar;
  assert.ok(familiar);
  targetPlayer.hand.splice(0);
  targetPlayer.unboughtFamiliar = undefined;
  familiar.ownerId = targetPlayer.playerId;
  targetPlayer.hand.push(familiar);
  targetPlayer.life.current = 10;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 6);
  assert.equal(targetPlayer.hand.includes(familiar), true);
  assert.equal(targetPlayer.discard.includes(familiar), false);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId
      );
    })
  );
});

test("playing wild magic uses the first legal choice and gains 2 power", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const wildMagic = state.common.wildMagicStack.shift();
  assert.ok(wildMagic);
  wildMagic.ownerId = activePlayer.playerId;
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.playedThisTurn.includes(wildMagic), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "wildMagicChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === wildMagic.instanceId &&
        event.effectId === "add_power"
      );
    })
  );
});

test("wild magic can choose to play the top card of a foe deck when that option is first legal", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const foe = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(foe);
  const foeTopCardDefinition = createFixtureCardDefinition(
    "fixture-foe-top-add-power",
    [
      {
        effectId: "add_power",
        timing: "onPlay",
        amount: 1,
      },
    ]
  );
  const wildMagicDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-first",
    [
      {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          {
            targetSelector: "chosenFoe",
            effectId: "play_top_card_from_foe_deck",
          },
          {
            effectId: "add_power",
            amount: 2,
          },
        ],
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-foe-top-card"),
    definitionId: markCardDefinitionId(foeTopCardDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: markCardInstanceId("fixture-wild-magic-card"),
    definitionId: markCardDefinitionId(wildMagicDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(foe.deck.includes(foeTopCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
  assert.equal(foeTopCard.ownerId, foe.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "wildMagicChoiceSelected" &&
        event.cardInstanceId === wildMagic.instanceId &&
        event.effectId === "play_top_card_from_foe_deck"
      );
    })
  );

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), false);
  assert.equal(activePlayer.discard.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
});

test("wild magic foe-deck play triggers wizard property on-play effects for non-ongoing cards", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const foe = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(foe);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createOnPlayTypeChipWizardProperty("fixture-wild-magic-spell-property", [
      "spell",
    ])
  );
  const foeTopCardDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-spell",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { cardTypes: ["spell"] }
  );
  const wildMagicDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-spell-first",
    [
      {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          {
            targetSelector: "chosenFoe",
            effectId: "play_top_card_from_foe_deck",
          },
        ],
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-wild-magic-foe-spell-card"),
    definitionId: markCardDefinitionId(foeTopCardDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: markCardInstanceId("fixture-wild-magic-foe-spell-card-source"),
    definitionId: markCardDefinitionId(wildMagicDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(activePlayer.chips, 1);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
  assert.equal(foeTopCard.ownerId, foe.playerId);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(foe.discard.includes(foeTopCard), true);
});

test("wild magic foe-deck play takes ownership of ongoing cards and keeps them controlled", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const foe = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(foe);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createOnPlayOngoingChipWizardProperty("fixture-wild-magic-ongoing-property")
  );
  const foeTopCardDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-ongoing",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { isOngoing: true }
  );
  const wildMagicDefinition = createFixtureCardDefinition(
    "fixture-wild-magic-foe-ongoing-first",
    [
      {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          {
            targetSelector: "chosenFoe",
            effectId: "play_top_card_from_foe_deck",
          },
        ],
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foeTopCardDefinition.cardId, foeTopCardDefinition],
    [wildMagicDefinition.cardId, wildMagicDefinition],
  ]);
  const foeTopCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-wild-magic-foe-ongoing-card"),
    definitionId: markCardDefinitionId(foeTopCardDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const wildMagic: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-wild-magic-foe-ongoing-card-source"
    ),
    definitionId: markCardDefinitionId(wildMagicDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  foe.deck.unshift(foeTopCard);
  activePlayer.hand.push(wildMagic);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(activePlayer.chips, 1);
  assert.equal(foeTopCard.ownerId, activePlayer.playerId);
  assert.equal(activePlayer.permanents.includes(foeTopCard), true);
  assert.equal(foe.permanents.includes(foeTopCard), false);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.permanents.includes(foeTopCard), true);
  assert.equal(activePlayer.discard.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), false);
});

test("nested foreign Wild Magic keeps the acting player in control through activation from the owner's discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  const foe = state.players.find(
    (player) => player.playerId !== state.activePlayerId
  );
  assert.ok(activePlayer);
  assert.ok(foe);
  const controlCountProperty = replaceFirstWizardProperty(
    state,
    activePlayer,
    createChipActivationWizardProperty(
      "fixture-temporary-control-count-property",
      ["spell"],
      1
    )
  );
  const ordinaryPermanent = addControlledFixturePermanentWithCost(
    state,
    activePlayer,
    "fixture-ordinary-controlled-permanent",
    ["creature"],
    1
  );

  const foreignWildMagicDefinition = createFixtureCardDefinition(
    "fixture-nested-foreign-wild-magic",
    [
      {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          {
            targetSelector: "chosenFoe",
            effectId: "play_top_card_from_foe_deck",
          },
        ],
      },
    ]
  );
  const activatedTopCardDefinition = createFixtureCardDefinition(
    "fixture-foreign-activated-top-card",
    [
      { effectId: "add_power", timing: "onPlay", amount: 2 },
      {
        effectId: "add_power",
        timing: "activation",
        amount: 3,
      },
      {
        effectId: "attack_damage_equal_to_controlled_card_cost",
        timing: "activation",
        costMode: "highest",
        target: { selector: "opponentPlayer" },
      },
      {
        effectId: "increase_hand_limit_at_max_life",
        timing: "endTurn",
        amount: 2,
      },
    ],
    { cardTypes: ["spell"] }
  );
  activatedTopCardDefinition.engine.cost = 4;
  activatedTopCardDefinition.visible.cost = 4;
  const drivingWildMagicDefinition = createFixtureCardDefinition(
    "fixture-driving-wild-magic",
    [
      {
        effectId: "wild_magic_choice",
        timing: "onPlay",
        options: [
          {
            targetSelector: "chosenFoe",
            effectId: "play_top_card_from_foe_deck",
          },
        ],
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foreignWildMagicDefinition.cardId, foreignWildMagicDefinition],
    [activatedTopCardDefinition.cardId, activatedTopCardDefinition],
    [drivingWildMagicDefinition.cardId, drivingWildMagicDefinition],
  ]);
  const drivingWildMagic: CardInstance = {
    instanceId: markCardInstanceId("fixture-driving-wild-magic-card"),
    definitionId: markCardDefinitionId(drivingWildMagicDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  const foreignWildMagic: CardInstance = {
    instanceId: markCardInstanceId("fixture-nested-foreign-wild-magic-card"),
    definitionId: markCardDefinitionId(foreignWildMagicDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  const activatedTopCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-foreign-activated-top-card"),
    definitionId: markCardDefinitionId(activatedTopCardDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  activePlayer.hand.push(drivingWildMagic);
  foe.hand = [];
  foe.deck = [foreignWildMagic, activatedTopCard];
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "wild_magic_choice" ? choices[0] : undefined
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: drivingWildMagic.instanceId,
  });

  assert.equal(playResult.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(foreignWildMagic.ownerId, foe.playerId);
  assert.equal(activatedTopCard.ownerId, foe.playerId);
  assert.equal(activePlayer.playedThisTurn.includes(foreignWildMagic), false);
  assert.equal(activePlayer.playedThisTurn.includes(activatedTopCard), false);
  assert.equal(foe.discard.includes(foreignWildMagic), true);
  assert.equal(foe.discard.includes(activatedTopCard), true);
  assert.ok(
    buildControlledObjectView(state, activePlayer.playerId).cards.some(
      ({ card }) => card.instanceId === foreignWildMagic.instanceId
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" &&
        event.cardInstanceId === activatedTopCard.instanceId &&
        event.sourceZone === `${activePlayer.playerId}.playedThisTurn` &&
        event.destinationZone === `${foe.playerId}.discard` &&
        event.ownerBefore === foe.playerId &&
        event.ownerAfter === foe.playerId
    )
  );

  const activation = listLegalActions(state).find(
    (action) =>
      action.type === "activatePermanent" &&
      action.cardInstanceId === activatedTopCard.instanceId
  );
  assert.ok(activation);
  assert.ok(
    buildControlledObjectView(state, activePlayer.playerId).cards.some(
      ({ card }) => card.instanceId === activatedTopCard.instanceId
    )
  );
  for (const card of [ordinaryPermanent, drivingWildMagic, activatedTopCard]) {
    assert.equal(
      buildControlledObjectView(state, activePlayer.playerId).cards.filter(
        (object) => object.card.instanceId === card.instanceId
      ).length,
      1
    );
  }
  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === controlCountProperty.instanceId
    )
  );

  const activationResult = applyAction(state, activation);
  assert.equal(activationResult.ok, true);
  assert.equal(state.turn.power, 5);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.amount === 4
    )
  );

  activePlayer.life.current = calculateEffectivePlayerMaxLife(
    state,
    activePlayer.playerId
  );
  const endTurnResult = applyAction(state, { type: "endTurn" });
  assert.equal(endTurnResult.ok, true);
  const activePlayerHandDrawn = state.eventLog.find(
    (event) =>
      event.type === "handDrawn" && event.playerId === activePlayer.playerId
  );
  assert.ok(activePlayerHandDrawn?.type === "handDrawn");
  assert.equal(activePlayerHandDrawn.amount, 7);
  assert.equal(foe.discard.includes(activatedTopCard), true);
  assert.equal(
    buildControlledObjectView(state, activePlayer.playerId).cards.some(
      ({ card }) => card.instanceId === activatedTopCard.instanceId
    ),
    false
  );
  assert.equal(
    buildControlledObjectView(state, foe.playerId).cards.some(
      ({ card }) => card.instanceId === activatedTopCard.instanceId
    ),
    false
  );
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activatePermanent" &&
        action.cardInstanceId === activatedTopCard.instanceId
    ),
    false
  );
  const foeEndTurnResult = applyAction(state, { type: "endTurn" });
  assert.equal(foeEndTurnResult.ok, true);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === controlCountProperty.instanceId
    ),
    false
  );
});

test("ending a turn cleans up non-permanents, draws a new hand, and advances active player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const startingActivePlayerId = state.activePlayerId;
  const activePlayer = state.players.find(
    (player) => player.playerId === startingActivePlayerId
  );
  assert.ok(activePlayer);

  const playedCard = activePlayer.hand.find(
    (card) => card.definitionId === "esw2_dbg__starter_002"
  );
  assert.ok(playedCard);
  const unplayedCardIds = activePlayer.hand
    .filter((card) => card.instanceId !== playedCard.instanceId)
    .map((card) => card.instanceId);

  applyAction(state, {
    type: "playCard",
    cardInstanceId: playedCard.instanceId,
  });

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.length, 5);
  assert.equal(activePlayer.playedThisTurn.length, 0);
  assert.equal(
    activePlayer.discard.some(
      (card) => card.instanceId === playedCard.instanceId
    ),
    true
  );
  for (const cardId of unplayedCardIds) {
    assert.equal(
      activePlayer.discard.some((card) => card.instanceId === cardId),
      true
    );
  }
  assert.equal(state.turn.power, 0);
  assert.equal(state.turn.number, 2);
  assert.notEqual(state.activePlayerId, startingActivePlayerId);
  assert.equal(state.eventLog.at(-1)?.type, "turnStarted");
});

test("Basic Trophy grants a chip at the end of its controller's turn", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.trophyLikeObjects.push(createBasicTrophy(activePlayer.playerId));

  const result = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "trophyChipGranted" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "basicTrophy"
      );
    })
  );
});

test("played permanents stay in the controlled permanent zone after cleanup", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  const ongoingCard = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_006"
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: ongoingCard.instanceId,
  });
  assert.equal(playResult.ok, true);
  assert.equal(activePlayer.permanents.includes(ongoingCard), true);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.permanents.includes(ongoingCard), true);
  assert.equal(activePlayer.discard.includes(ongoingCard), false);
});

test("active player can activate a controlled permanent once per turn", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const permanent = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "activation",
      amount: 2,
      activationLimit: "oncePerTurnWhileControlled",
    },
    { isOngoing: true }
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: permanent,
  });
  assert.equal(playResult.ok, true);
  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "activatePermanent" &&
        action.cardInstanceId === permanent
    )
  );

  const activationResult = applyAction(state, {
    type: "activatePermanent",
    cardInstanceId: permanent,
  });

  assert.equal(activationResult.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activatePermanent" &&
        action.cardInstanceId === permanent
    ),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "cardActivated" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === permanent
      );
    })
  );
});

test("active player can activate a wizard property only when its control-count condition is met", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const property = replaceFirstWizardProperty(
    state,
    activePlayer,
    createChipActivationWizardProperty(
      "fixture-chip-property",
      ["treasure", "creature"],
      2
    )
  );
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === property.instanceId
    ),
    false
  );
  addControlledFixturePermanent(
    state,
    activePlayer,
    "fixture-controlled-treasure",
    ["treasure"]
  );
  addControlledFixturePermanent(
    state,
    activePlayer,
    "fixture-controlled-creature",
    ["creature"]
  );

  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === property.instanceId
    )
  );
  const result = applyAction(state, {
    type: "activateWizardProperty",
    tokenInstanceId: property.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  const chipEvent = state.eventLog.find(
    (event) =>
      event.type === "effectChipsGained" &&
      event.playerId === activePlayer.playerId
  );
  assert.ok(chipEvent);
  assert.equal(chipEvent.chipsBefore, 0);
  assert.equal(chipEvent.chipsAfter, 1);
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activateWizardProperty" &&
        action.tokenInstanceId === property.instanceId
    ),
    false
  );
});

test("wizard property activation decodes before timing applicability", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const definition = createChipActivationWizardProperty(
    "fixture-malformed-activation-property",
    ["treasure"],
    1
  );
  assert.equal(definition.kind, "wizardProperty");
  if (definition.kind !== "wizardProperty") return;
  assert.ok(definition.engine);
  definition.engine.effects = [
    {
      effectId: "gain_chips",
      timing: "onPlay",
      amount: "invalid",
    } as unknown as RuntimeEffect,
  ];
  const property = replaceFirstWizardProperty(state, activePlayer, definition);
  const chipsBefore = activePlayer.chips;
  const eventCountBefore = state.eventLog.length;

  const result = applyAction(state, {
    type: "activateWizardProperty",
    tokenInstanceId: property.instanceId,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
  assert.equal(activePlayer.chips, chipsBefore);
  assert.equal(state.eventLog.length, eventCountBefore);
});

test("wizard property on-play trigger grants chips only for matching ongoing cards", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createOnPlayOngoingChipWizardProperty("fixture-ongoing-play-property")
  );
  const ongoingCardId = addFixtureCardToActiveHand(
    state,
    { effectId: "add_power", timing: "onPlay", amount: 1 },
    {
      isOngoing: true,
    }
  );
  const normalCardId = addFixtureCardToActiveHand(state, {
    effectId: "add_power",
    timing: "onPlay",
    amount: 1,
  });

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: normalCardId }).ok,
    true
  );
  assert.equal(activePlayer.chips, 0);
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: ongoingCardId }).ok,
    true
  );
  assert.equal(activePlayer.chips, 1);
});

test("wizard property optional topdeck for gained cards runs before normal discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createTopdeckOnGainWizardProperty("fixture-topdeck-creature-property", [
      "creature",
    ])
  );
  const creature = addFixtureMarketCard(
    state,
    "fixture-gained-creature",
    ["creature"],
    0
  );
  const spell = addFixtureMarketCard(
    state,
    "fixture-gained-spell",
    ["spell"],
    0
  );

  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: creature.instanceId,
      source: "mainMarket",
    }).ok,
    true
  );
  assert.equal(activePlayer.deck[0], creature);
  assert.equal(activePlayer.discard.includes(creature), false);

  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: spell.instanceId,
      source: "mainMarket",
    }).ok,
    true
  );
  assert.equal(activePlayer.discard.includes(spell), true);
});

test("wizard property on-gain decodes before timing applicability", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const malformedDefinition = createTopdeckOnGainWizardProperty(
    "fixture-malformed-on-gain-property",
    ["creature"]
  );
  assert.equal(malformedDefinition.kind, "wizardProperty");
  if (malformedDefinition.kind !== "wizardProperty") return;
  assert.ok(malformedDefinition.engine);
  malformedDefinition.engine.effects = [
    {
      effectId: "topdeck_gained_card",
      timing: "onPlayCard",
      optional: true,
      cardTypes: ["creature"],
    } as unknown as RuntimeEffect,
  ];
  replaceFirstWizardProperty(state, activePlayer, malformedDefinition);
  const creature = addFixtureMarketCard(
    state,
    "fixture-malformed-on-gain-creature",
    ["creature"],
    0
  );

  const result = applyAction(state, {
    type: "buyMarketCard",
    cardInstanceId: creature.instanceId,
    source: "mainMarket",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timing must be onGainCard/);
});

test("temporary hand limit modifier counts cards gained this turn and resets after drawing", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createTemporaryHandLimitWizardProperty(
      "fixture-spell-hand-limit-property",
      ["spell"]
    )
  );
  activePlayer.hand.splice(0);
  activePlayer.deck.splice(
    0,
    activePlayer.deck.length,
    ...createFixtureCardInstances("fixture-filler", activePlayer.playerId, 7)
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [
      createFixtureCardDefinition("fixture-filler", []).cardId,
      createFixtureCardDefinition("fixture-filler", []),
    ],
  ]);
  const firstSpell = addFixtureMarketCard(
    state,
    "fixture-gained-spell-1",
    ["spell"],
    0
  );
  const secondSpell = addFixtureMarketCard(
    state,
    "fixture-gained-spell-2",
    ["spell"],
    0
  );
  const creature = addFixtureMarketCard(
    state,
    "fixture-gained-creature-1",
    ["creature"],
    0
  );

  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: firstSpell.instanceId,
      source: "mainMarket",
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: secondSpell.instanceId,
      source: "mainMarket",
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: creature.instanceId,
      source: "mainMarket",
    }).ok,
    true
  );
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);

  assert.equal(activePlayer.hand.length, 7);
  assert.deepEqual(state.turn.gainedCardDefinitionIds, []);
});

test("temporary hand limit modifier returns a decoder error before end-turn mutation", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createTemporaryHandLimitWizardProperty(
      "fixture-invalid-hand-limit-property",
      ["spell"],
      -1
    )
  );
  activePlayer.hand.splice(0);
  activePlayer.deck.splice(
    0,
    activePlayer.deck.length,
    ...createFixtureCardInstances("fixture-filler", activePlayer.playerId, 5)
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [
      createFixtureCardDefinition("fixture-filler", []).cardId,
      createFixtureCardDefinition("fixture-filler", []),
    ],
  ]);
  const spell = addFixtureMarketCard(
    state,
    "fixture-invalid-limit-gained-spell",
    ["spell"],
    0
  );
  state.turn.gainedCardDefinitionIds.push(spell.definitionId);
  const handBefore = [...activePlayer.hand];
  const deckBefore = [...activePlayer.deck];
  const discardBefore = [...activePlayer.discard];
  const turnNumberBefore = state.turn.number;
  const activePlayerIdBefore = state.activePlayerId;
  const eventCountBefore = state.eventLog.length;

  const result = applyAction(state, { type: "endTurn" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be a positive integer/);
  assert.deepEqual(activePlayer.hand, handBefore);
  assert.deepEqual(activePlayer.deck, deckBefore);
  assert.deepEqual(activePlayer.discard, discardBefore);
  assert.equal(state.turn.number, turnNumberBefore);
  assert.equal(state.activePlayerId, activePlayerIdBefore);
  assert.equal(state.eventLog.length, eventCountBefore);
});

test("playing a v0 draw card draws from the active player's deck", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);

  const drawCardId = addFixtureCardToActiveHand(state, {
    effectId: "draw_cards",
    timing: "onPlay",
    amount: 1,
  });
  const drawCard = activePlayer.hand.find(
    (card) => card.instanceId === drawCardId
  );
  assert.ok(drawCard);

  const deckSizeBefore = activePlayer.deck.length;
  const handSizeBefore = activePlayer.hand.length;
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: drawCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.length, deckSizeBefore - 1);
  assert.equal(activePlayer.hand.length, handSizeBefore);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDrawCardsApplied" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === drawCard.instanceId &&
        event.definitionId === drawCard.definitionId &&
        event.amount === 1
      );
    })
  );
});

test("targeted fixture effect chooses the first legal market target deterministically", () => {
  const first = playTargetedFixtureEffect(60615, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });
  const second = playTargetedFixtureEffect(60615, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });

  assert.equal(first.result.ok, true);
  assert.equal(second.result.ok, true);
  assert.equal(first.selectedTargetId, first.firstMarketCard.instanceId);
  assert.equal(second.selectedTargetId, second.firstMarketCard.instanceId);
  assert.equal(first.selectedTargetId, second.selectedTargetId);
  assert.equal(first.state.turn.power, first.firstMarketCardCost);
  assert.equal(second.state.turn.power, second.firstMarketCardCost);
});

test("gain_card moves the first legal market card into the active player's discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const gainedCard = state.common.market[0];
  assert.ok(gainedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.includes(gainedCard), false);
  assert.equal(activePlayer.discard.includes(gainedCard), true);
  assert.equal(gainedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardGained" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "gain_card" &&
        event.targetCardInstanceId === gainedCard.instanceId &&
        event.targetDefinitionId === gainedCard.definitionId
      );
    })
  );
});

test("buying and gain_card share gained-card movement guarantees", () => {
  const buyState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const gainState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const bought = prepareGainedMovementFixture(
    buyState,
    "fixture-shared-buy-card"
  );
  const gained = prepareGainedMovementFixture(
    gainState,
    "fixture-shared-gain-card"
  );

  const buyResult = applyAction(buyState, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: bought.card.instanceId,
  });
  const gainCardId = addFixtureCardToActiveHand(gainState, {
    effectId: "gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });
  const gainResult = applyAction(gainState, {
    type: "playCard",
    cardInstanceId: gainCardId,
  });

  assert.equal(buyResult.ok, true);
  assert.equal(gainResult.ok, true);
  assertGainedMovementGuarantees(
    buyState,
    bought.player,
    bought.card,
    "cardBought"
  );
  assertGainedMovementGuarantees(
    gainState,
    gained.player,
    gained.card,
    "effectCardGained"
  );
});

test("discard_card moves the first legal hand card into the active player's discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const discardedCard = activePlayer.hand[0];
  assert.ok(discardedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "discard_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(discardedCard), false);
  assert.equal(activePlayer.discard.includes(discardedCard), true);
  assert.equal(discardedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardDiscarded" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "discard_card" &&
        event.targetCardInstanceId === discardedCard.instanceId &&
        event.targetDefinitionId === discardedCard.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "cardMoved" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === discardedCard.instanceId &&
        event.sourceZone === `${activePlayer.playerId}.hand` &&
        event.destinationZone === `${activePlayer.playerId}.discard` &&
        event.ownerBefore === activePlayer.playerId &&
        event.ownerAfter === activePlayer.playerId &&
        event.effectId === "discard_card"
      );
    })
  );
});

test("destroy_card moves a normal card to the destroyed zone and preserves ownership", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const destroyedCard = activePlayer.hand[0];
  assert.ok(destroyedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(destroyedCard), false);
  assert.equal(activePlayer.discard.includes(destroyedCard), false);
  assert.equal(state.common.destroyedPile.includes(destroyedCard), true);
  assert.equal(state.common.destroyedMayhem.includes(destroyedCard), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(destroyedCard), false);
  assert.equal(destroyedCard.ownerId, activePlayer.playerId);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardDestroyed" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "destroy_card" &&
        event.targetCardInstanceId === destroyedCard.instanceId &&
        event.targetDefinitionId === destroyedCard.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "cardMoved" &&
        event.playerId === activePlayer.playerId &&
        event.cardInstanceId === destroyedCard.instanceId &&
        event.sourceZone === `${activePlayer.playerId}.hand` &&
        event.destinationZone === "destroyedPile" &&
        event.ownerBefore === activePlayer.playerId &&
        event.ownerAfter === activePlayer.playerId &&
        event.effectId === "destroy_card"
      );
    })
  );
});

test("destroy_card routes wild magic and limp wand cards back to their stacks", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const wildMagic = state.common.wildMagicStack.shift();
  const limpWand = state.common.limpWandStack.shift();
  assert.ok(wildMagic);
  assert.ok(limpWand);
  wildMagic.ownerId = activePlayer.playerId;
  limpWand.ownerId = activePlayer.playerId;
  activePlayer.hand.unshift(wildMagic, limpWand);
  const wildMagicStackSize = state.common.wildMagicStack.length;
  const limpWandStackSize = state.common.limpWandStack.length;
  const destroyWildMagicCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const wildMagicResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyWildMagicCardId,
  });

  assert.equal(wildMagicResult.ok, true);
  assert.equal(activePlayer.hand.includes(wildMagic), false);
  assert.equal(state.common.wildMagicStack.includes(wildMagic), true);
  assert.equal(state.common.wildMagicStack.length, wildMagicStackSize + 1);
  assert.equal(state.common.limpWandStack.length, limpWandStackSize);
  assert.equal(state.common.destroyedPile.includes(wildMagic), false);
  assert.equal(state.common.destroyedMayhem.includes(wildMagic), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(wildMagic), false);
  const destroyLimpWandCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const limpWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyLimpWandCardId,
  });

  assert.equal(limpWandResult.ok, true);
  assert.equal(activePlayer.hand.includes(limpWand), false);
  assert.equal(state.common.limpWandStack.includes(limpWand), true);
  assert.equal(state.common.limpWandStack.length, limpWandStackSize + 1);
  assert.equal(state.common.destroyedPile.includes(limpWand), false);
  assert.equal(state.common.destroyedMayhem.includes(limpWand), false);
  assert.equal(state.common.destroyedMegaMayhem.includes(limpWand), false);
});

test("destroy_card keeps mayhem and megaMayhem cards in ordered event piles", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const existingMayhem = state.common.destroyedMayhem.at(-1);
  const existingMegaMayhem = state.common.destroyedMegaMayhem.at(-1);
  const mayhem = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "onMayhemResolve",
      amount: 1,
    },
    { cardKind: "mayhem" }
  );
  moveHandCardToFront(activePlayer, mayhem);
  const destroyMayhemCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const mayhemResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyMayhemCardId,
  });

  assert.equal(mayhemResult.ok, true);
  assert.equal(state.common.destroyedMayhem.at(-1)?.instanceId, mayhem);
  assert.equal(
    existingMayhem === undefined ||
      state.common.destroyedMayhem.includes(existingMayhem),
    true
  );
  assert.equal(
    state.common.destroyedPile.some((card) => card.instanceId === mayhem),
    false
  );

  const megaMayhem = addFixtureCardToActiveHand(
    state,
    {
      effectId: "add_power",
      timing: "onMayhemResolve",
      amount: 1,
    },
    { cardKind: "megaMayhem" }
  );
  moveHandCardToFront(activePlayer, megaMayhem);
  const destroyMegaMayhemCardId = addFixtureCardToActiveHand(state, {
    effectId: "destroy_card",
    timing: "onPlay",
    target: {
      selector: "activePlayerHandCard",
    },
  });

  const megaMayhemResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: destroyMegaMayhemCardId,
  });

  assert.equal(megaMayhemResult.ok, true);
  assert.equal(state.common.destroyedMegaMayhem.at(-1)?.instanceId, megaMayhem);
  assert.equal(
    existingMegaMayhem === undefined ||
      state.common.destroyedMegaMayhem.includes(existingMegaMayhem),
    true
  );
  assert.equal(
    state.common.destroyedPile.some((card) => card.instanceId === megaMayhem),
    false
  );
});

test("card movement effects skip by default when no legal card choice exists", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.market.length, 0);
  assert.ok(
    state.eventLog.some((event) => event.type === "effectChoiceSkipped")
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "effectCardGained"),
    false
  );
});

test("reveal_top_card reveals the active player's top deck card without moving it", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const topCard = activePlayer.deck[0];
  assert.ok(topCard);
  const deckSizeBefore = activePlayer.deck.length;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.length, deckSizeBefore);
  assert.equal(activePlayer.deck[0], topCard);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardRevealed" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "reveal_top_card" &&
        event.targetCardInstanceId === topCard.instanceId &&
        event.targetDefinitionId === topCard.definitionId
      );
    })
  );
});

test("reveal_top_card shuffles discard into an empty deck before revealing", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const revealedCard = activePlayer.deck[0];
  assert.ok(revealedCard);
  activePlayer.deck.splice(0);
  activePlayer.discard.push(revealedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.discard.includes(revealedCard), false);
  assert.equal(activePlayer.deck[0], revealedCard);
  assert.ok(
    state.eventLog.some((event) => event.type === "discardShuffledIntoDeck")
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardRevealed" &&
        event.targetCardInstanceId === revealedCard.instanceId
      );
    })
  );
});

test("play_top_card plays the active player's top deck card through on-play effects", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const topPlayedCardIndex = activePlayer.hand.findIndex(
    (card) => card.definitionId === "esw2_dbg__starter_001"
  );
  assert.notEqual(topPlayedCardIndex, -1);
  const topPlayedCard = activePlayer.hand.splice(topPlayedCardIndex, 1).at(0);
  assert.ok(topPlayedCard);
  activePlayer.deck.unshift(topPlayedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "play_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    destination: "play",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.deck.includes(topPlayedCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), true);
  assert.equal(topPlayedCard.ownerId, activePlayer.playerId);
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectCardPlayedFromDeck" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "play_top_card" &&
        event.targetCardInstanceId === topPlayedCard.instanceId &&
        event.targetDefinitionId === topPlayedCard.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectAddPowerApplied" &&
        event.cardInstanceId === topPlayedCard.instanceId
      );
    })
  );
});

test("play_top_card triggers wizard property on-play effects and cleans up to owner discard", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  replaceFirstWizardProperty(
    state,
    activePlayer,
    createOnPlayTypeChipWizardProperty("fixture-play-top-property", ["spell"])
  );
  const topPlayedDefinition = createFixtureCardDefinition(
    "fixture-play-top-spell",
    [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
    { cardTypes: ["spell"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [topPlayedDefinition.cardId, topPlayedDefinition],
  ]);
  const topPlayedCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-play-top-spell-instance"),
    definitionId: markCardDefinitionId(topPlayedDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  activePlayer.deck.unshift(topPlayedCard);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "play_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    destination: "play",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), true);

  const endTurnResult = applyAction(state, {
    type: "endTurn",
  });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.playedThisTurn.includes(topPlayedCard), false);
  assert.equal(activePlayer.discard.includes(topPlayedCard), true);
});

test("deal_damage can kill an opponent, give a neutral DWT, resurrect, and affect scoring", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  assert.equal(state.common.deadWizardTokens.status, "available");
  const neutralDwt = state.common.deadWizardTokens.drawStack[0];
  assert.ok(neutralDwt);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 999,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.deadWizardTokens.length, 1);
  assert.equal(targetPlayer.deadWizardTokens[0], neutralDwt);
  assert.equal(neutralDwt.ownerId, targetPlayer.playerId);
  assert.equal(
    state.common.deadWizardTokens.drawStack.includes(neutralDwt),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "deal_damage" &&
        event.amount === 20
      );
    })
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === targetPlayer.playerId
    )
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "deadWizardTokenGained" &&
        event.playerId === targetPlayer.playerId &&
        event.tokenInstanceId === neutralDwt.instanceId &&
        event.tokenDefinitionId === neutralDwt.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "playerResurrected" &&
        event.playerId === targetPlayer.playerId &&
        event.amount === 20
      );
    })
  );

  const targetScore = scoreGame(state).find(
    (score) => score.playerId === targetPlayer.playerId
  );
  const expectedCardScore = [
    ...targetPlayer.hand,
    ...targetPlayer.deck,
    ...targetPlayer.discard,
  ].reduce((total, card) => {
    return (
      total + state.cardDefinitions.get(card.definitionId)!.engine.victoryPoints
    );
  }, 0);
  const neutralDwtDefinition = state.tokenDefinitions.get(
    neutralDwt.definitionId
  );
  assert.equal(neutralDwtDefinition?.kind, "deadWizardToken");
  const expectedTokenScore = neutralDwtDefinition.victoryPoints;
  assert.ok(targetScore);
  assert.equal(targetScore.deadWizardTokenCount, 1);
  assert.equal(
    targetScore.victoryPoints,
    expectedCardScore + expectedTokenScore
  );
});

test("wizard property resurrection life override respects loser-status exception", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const propertyOwner = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(propertyOwner);
  propertyOwner.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-wizard-property-010"),
      definitionId: markTokenDefinitionId("esw2_dbg__wizard_property_010"),
      ownerId: propertyOwner.playerId,
    },
  ];
  propertyOwner.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 1,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(propertyOwner.life.current, 25);

  propertyOwner.statuses.push({
    instanceId: markCardInstanceId("fixture-loser-status"),
    statusId: "loser",
    ownerId: propertyOwner.playerId,
    effects: [],
  });
  propertyOwner.life.current = 1;
  const secondFixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 1,
    target: {
      selector: "opponentPlayer",
    },
  });

  const secondResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: secondFixtureCardId,
  });

  assert.equal(secondResult.ok, true);
  assert.equal(propertyOwner.life.current, 20);
});

test("heal uses effective max life and logs clamping without mutating base max life", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const baseMaxLife = activePlayer.life.max;
  activePlayer.statuses.push(
    createMaxLifeModifierStatus(activePlayer.playerId, -8)
  );
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "heal",
    timing: "onPlay",
    amount: 20,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.max, baseMaxLife);
  assert.equal(activePlayer.life.current, 17);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectLifeHealed" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === activePlayer.playerId &&
        event.effectId === "heal" &&
        event.amount === 7
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "playerLifeClamped" &&
        event.playerId === activePlayer.playerId &&
        event.amount === 17
      );
    })
  );
});

test("heal below effective max life does not clamp", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "heal",
    timing: "onPlay",
    amount: 3,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 13);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectLifeHealed" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "heal" &&
        event.amount === 3
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "playerLifeClamped" &&
        event.playerId === activePlayer.playerId
    ),
    false
  );
});

test("set_life sets the target player's current life without using healing clamp", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 10;
  const baseMaxLife = activePlayer.life.max;
  activePlayer.statuses.push(
    createMaxLifeModifierStatus(activePlayer.playerId, -8)
  );
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "set_life",
    timing: "onPlay",
    lifeTotal: 30,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 30);
  assert.equal(activePlayer.life.max, baseMaxLife);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectLifeSet" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === activePlayer.playerId &&
        event.effectId === "set_life" &&
        event.amount === 30
      );
    })
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "effectLifeHealed"),
    false
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "playerLifeClamped"),
    false
  );
});

test("set_life uses Dingler max life as a cap", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 20;
  const gainCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainCardId }).ok,
    true
  );
  activePlayer.life.current = 5;
  const setLifeCardId = addFixtureCardToActiveHand(state, {
    effectId: "set_life",
    timing: "onPlay",
    lifeTotal: 20,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: setLifeCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 15);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "playerLifeClamped" &&
        event.playerId === activePlayer.playerId &&
        event.amount === 15
      );
    })
  );
});

test("attack_damage damages the first opponent when no defense is available", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 16);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 4
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 4
      );
    })
  );
});

test("attack_damage_equal_to_controlled_card_cost reuses attack branches when no defense is available", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 4;
  addControlledFixturePermanentWithCost(
    state,
    activePlayer,
    "fixture-variable-attack-source",
    ["wand"],
    4
  );
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage_equal_to_controlled_card_cost",
    timing: "onPlay",
    costMode: "highest",
    target: {
      selector: "opponentPlayer",
    },
    onKill: [
      {
        effectId: "gain_chips",
        amount: 2,
      },
    ],
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 2);
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "trophyControlChanged" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost"
    )
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.amount === 4
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.amount === 4
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChipsChanged" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "gain_chips" &&
        event.chipsAfter === 2
      );
    })
  );
});

test("attack_damage_equal_to_controlled_card_cost can be avoided after choosing a non-first controlled-card amount", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 6;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  const firstControlled = addControlledFixturePermanentWithCost(
    state,
    activePlayer,
    "fixture-variable-attack-low",
    ["wand"],
    2
  );
  const secondControlled = addControlledFixturePermanentWithCost(
    state,
    activePlayer,
    "fixture-variable-attack-high",
    ["wand"],
    5
  );
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (effectId !== "attack_damage_equal_to_controlled_card_cost") {
        return undefined;
      }
      if (player.playerId !== activePlayer.playerId) {
        return undefined;
      }
      return choices.find(
        (choice) => choice.choiceId === secondControlled.instanceId
      );
    }
  );
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage_equal_to_controlled_card_cost",
    timing: "onPlay",
    costMode: "chosen",
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 6);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.choiceId === secondControlled.instanceId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.amount === 5
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackAvoided" &&
        event.targetPlayerId === targetPlayer.playerId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId
    ),
    false
  );
  assert.equal(
    firstControlled.instanceId === secondControlled.instanceId,
    false
  );
});

test("wizard property owned wand attacks gain damage and cannot be avoided", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const propertyOwner = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = propertyOwner.playerId;
  replaceFirstWizardProperty(
    state,
    propertyOwner,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  const wand = addRuntimeCardToHand(
    state,
    propertyOwner,
    "esw2_dbg__starter_004"
  );
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 18);
  assert.equal(targetPlayer.hand.includes(defenseCard), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

test("wizard property applies to its owner's Wand through foreign control but not to unrelated attacks", () => {
  const dataPack = createWizardPropertySetupEntriesDataPack(
    createExpandedDeadWizardTokenSetupDataPack(
      loadCurrentRuntimeDataPack(rootDir, playableRuntimeDataPackPath),
      40
    ),
    [
      { tokenId: "esw2_dbg__wizard_property_009", count: 2 },
      { tokenId: "esw2_dbg__wizard_property_001", count: 4 },
    ]
  );
  const state = initializeGame({
    dataPack,
    seed: 60615,
    playerCount: 3,
  });
  const propertyOwner = state.players.find((player) => {
    return player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_009"
    );
  });
  assert.ok(propertyOwner);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== propertyOwner.playerId
  );
  assert.ok(targetPlayer);
  state.activePlayerId = propertyOwner.playerId;
  const borrowedWand = findOwnedCard(propertyOwner, "esw2_dbg__starter_004");
  assert.ok(borrowedWand);
  borrowedWand.ownerId = targetPlayer.playerId;
  moveCardToHand(propertyOwner, borrowedWand);
  const borrowedWandDefense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);

  const borrowedWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: borrowedWand.instanceId,
  });

  assert.equal(borrowedWandResult.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(borrowedWandDefense), true);

  state.activePlayerId = propertyOwner.playerId;
  targetPlayer.life.current = 20;
  const nonWandCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
  });
  const nonWandDefense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);

  const nonWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: nonWandCardId,
  });

  assert.equal(nonWandResult.ok, true);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(nonWandDefense), true);

  const activeBorrower = state.players.find((player) => {
    return (
      player.playerId !== propertyOwner.playerId &&
      player.playerId !== markPlayerId("player-1")
    );
  });
  assert.ok(activeBorrower);
  const ownerPropertyWandTarget = mustGetPlayer(
    state,
    markPlayerId("player-1")
  );
  activeBorrower.wizardProperties = [];
  state.activePlayerId = activeBorrower.playerId;
  ownerPropertyWandTarget.life.current = 20;
  const ownerPropertyWand = addRuntimeCardToHand(
    state,
    propertyOwner,
    "esw2_dbg__starter_004"
  );
  propertyOwner.hand = propertyOwner.hand.filter(
    (card) => card.instanceId !== ownerPropertyWand.instanceId
  );
  activeBorrower.hand.unshift(ownerPropertyWand);
  const ownerPropertyWandDefense = addFixtureDefenseCardToHand(
    state,
    ownerPropertyWandTarget,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);

  const ownerPropertyWandResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: ownerPropertyWand.instanceId,
  });

  assert.equal(ownerPropertyWandResult.ok, true);
  assert.equal(ownerPropertyWandTarget.life.current, 18);
  assert.equal(
    ownerPropertyWandTarget.hand.includes(ownerPropertyWandDefense),
    true
  );
});

test("Lubricating Dirty Stick permanently buffs each owned Wand attack and gains power once per Wand play", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 20;

  const firstModifier = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_009"
  );
  const secondModifier = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_009"
  );
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__starter_003"
  );

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: firstModifier.instanceId,
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: secondModifier.instanceId,
    }).ok,
    true
  );
  assert.equal(activePlayer.permanents.length, 2);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 15);
  assert.equal(state.turn.power, 3);
});

test("Lubricating Dirty Stick does not affect a foe's Wand attack", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const modifierOwner = mustGetPlayer(state, markPlayerId("player-2"));
  const foe = mustGetPlayer(state, markPlayerId("player-1"));
  modifierOwner.wizardProperties = [];
  foe.wizardProperties = [];
  const modifier = addRuntimeCardToHand(
    state,
    modifierOwner,
    "esw2_dbg__main_009"
  );
  state.activePlayerId = modifierOwner.playerId;
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: modifier.instanceId,
    }).ok,
    true
  );

  state.activePlayerId = foe.playerId;
  state.turn.power = 0;
  modifierOwner.life.current = 20;
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (effectId !== "attack_damage" || player.playerId !== foe.playerId) {
        return undefined;
      }
      return choices.find(
        (choice) => choice.choiceId === modifierOwner.playerId
      );
    }
  );
  const foeWand = addRuntimeCardToHand(state, foe, "esw2_dbg__starter_003");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: foeWand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(modifierOwner.life.current, 19);
  assert.equal(state.turn.power, 1);
});

test("Lubricating Dirty Stick gains power when its owner plays a non-attacking Wand", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];

  const modifier = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_009"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: modifier.instanceId,
    }).ok,
    true
  );

  const nonAttackingWand = createFixtureCardDefinition(
    "fixture-non-attacking-wand",
    [],
    { tags: ["wandCard"] }
  );
  const wand = addFixtureDefinitionToActiveHand(state, nonAttackingWand);
  state.turn.power = 0;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
});

test("Lubricating Dirty Stick gains power when its owner plays a foe's Wand", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const foe = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  foe.wizardProperties = [];

  const modifier = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_009"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: modifier.instanceId,
    }).ok,
    true
  );

  const foreignWand = createRuntimeCardInstance(
    foe,
    "esw2_dbg__starter_003",
    "foreign-wand"
  );
  foe.deck.splice(0, foe.deck.length, foreignWand);
  const wildMagic = state.common.wildMagicStack.shift();
  assert.ok(wildMagic);
  wildMagic.ownerId = activePlayer.playerId;
  activePlayer.hand.push(wildMagic);
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    return effectId === "wild_magic_choice" ? choices.at(-1) : undefined;
  });
  state.turn.power = 0;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  assert.equal(activePlayer.playedThisTurn.includes(foreignWand), false);
  assert.equal(foe.discard.includes(foreignWand), true);
  assert.equal(
    buildControlledObjectView(state, activePlayer.playerId).cards.some(
      ({ card }) => card.instanceId === foreignWand.instanceId
    ),
    true
  );
  assert.equal(foreignWand.ownerId, foe.playerId);
  assert.equal(state.turn.power, 2);
});

test("Lubricating Dirty Stick buffs its owner's Wand played through Wild Magic", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const wandOwner = mustGetPlayer(state, markPlayerId("player-1"));
  const playController = mustGetPlayer(state, markPlayerId("player-2"));
  wandOwner.wizardProperties = [];
  playController.wizardProperties = [];
  state.activePlayerId = wandOwner.playerId;

  const modifier = addRuntimeCardToHand(state, wandOwner, "esw2_dbg__main_009");
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: modifier.instanceId,
    }).ok,
    true
  );

  const foreignWand = createRuntimeCardInstance(
    wandOwner,
    "esw2_dbg__starter_003",
    "owner-wand-played-by-foe"
  );
  wandOwner.deck.splice(0, wandOwner.deck.length, foreignWand);
  const wildMagic = state.common.wildMagicStack.shift();
  assert.ok(wildMagic);
  wildMagic.ownerId = playController.playerId;
  playController.hand.push(wildMagic);
  state.activePlayerId = playController.playerId;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId === "wild_magic_choice") {
      return choices.at(-1);
    }
    if (effectId === "attack_damage") {
      return choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === wandOwner.playerId
      );
    }
    return undefined;
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wildMagic.instanceId,
  });

  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  assert.equal(playController.playedThisTurn.includes(foreignWand), false);
  assert.equal(wandOwner.discard.includes(foreignWand), true);
  assert.equal(
    buildControlledObjectView(state, playController.playerId).cards.some(
      ({ card }) => card.instanceId === foreignWand.instanceId
    ),
    true
  );
  assert.equal(foreignWand.ownerId, wandOwner.playerId);
  assert.equal(wandOwner.life.current, 17);
});

test("Cheese Wand gains power, attacks a chosen player, and gains chips on kill", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  activePlayer.chips = 0;
  targetPlayer.life.current = 1;
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__starter_003"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 1);
  assert.equal(activePlayer.chips, 3);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 1
    )
  );
});

test("Hrenalocka Wand returns up to two discard cards to hand when its attack kills", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 1;
  const firstDiscard = activePlayer.hand[0];
  const secondDiscard = activePlayer.hand[1];
  assert.ok(firstDiscard);
  assert.ok(secondDiscard);
  activePlayer.hand.splice(0, 2);
  activePlayer.discard.push(firstDiscard, secondDiscard);
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__starter_004"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.hand.includes(firstDiscard), true);
  assert.equal(activePlayer.hand.includes(secondDiscard), true);
  assert.equal(activePlayer.discard.includes(firstDiscard), false);
  assert.equal(activePlayer.discard.includes(secondDiscard), false);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.effectId === "return_discard_to_hand" &&
        event.choiceId === "return_2" &&
        event.choiceIds?.includes("return_0") === true &&
        event.choiceIds?.includes("return_1") === true &&
        event.choiceIds?.includes("return_2") === true &&
        event.targetCardInstanceIds?.includes(firstDiscard.instanceId) ===
          true &&
        event.targetCardInstanceIds?.includes(secondDiscard.instanceId) === true
      );
    })
  );
});

test("Slapalocka Wand steals or gains chips equal to actual attack damage dealt", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  activePlayer.chips = 0;
  targetPlayer.chips = 1;
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_015");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(targetPlayer.life.current, 18);
  assert.equal(targetPlayer.chips, 0);
  assert.equal(activePlayer.chips, 2);
});

test("Ultimate Tronado adds power equal to the total actual damage from the first multi-target attack", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    playerCount: 3,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
  }

  const tronadoDefinition = createFixtureCardDefinition(
    "esw2_dbg__legend_012",
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
    { isOngoing: true, cardKind: "legend", cardTypes: ["legend", "location"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [tronadoDefinition.cardId, tronadoDefinition],
  ]);
  activePlayer.permanents.push(
    createRuntimeCardInstance(
      activePlayer,
      tronadoDefinition.cardId,
      "ultimate-tronado"
    )
  );
  mustGetPlayer(state, markPlayerId("player-2")).life.current = 1;
  mustGetPlayer(state, markPlayerId("player-3")).life.current = 4;
  const attackId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 3,
    target: { selector: "opponentPlayers" },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 4);
});

test("Ultimate Tronado does not credit redirected damage to the original attacker", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const originalAttacker = mustGetPlayer(state, markPlayerId("player-1"));
  const redirector = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = originalAttacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
  }
  const tronadoDefinition = createFixtureCardDefinition(
    "fixture-redirected-ultimate-tronado",
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
    { isOngoing: true, cardKind: "legend", cardTypes: ["legend", "location"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [tronadoDefinition.cardId, tronadoDefinition],
  ]);
  originalAttacker.permanents.push(
    createRuntimeCardInstance(
      originalAttacker,
      tronadoDefinition.cardId,
      "redirected-ultimate-tronado"
    )
  );
  addFixtureDefenseCardToHand(state, redirector, "discardSelf", {
    redirectAttack: true,
  });
  chooseFirstFixtureDefense(state);
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 2,
    target: { selector: "opponentPlayer" },
  });

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: attack }).ok,
    true
  );
  assert.equal(originalAttacker.life.current, 18);
  assert.equal(state.turn.power, 0);
  assert.deepEqual(state.turn.damagingAttackPlayerIds, []);
});

test("Ultimate Tronado ignores avoided attacks, triggers once, and resets on its owner's next turn", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    playerCount: 2,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
  }
  const tronadoDefinition = createFixtureCardDefinition(
    "esw2_dbg__legend_012",
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
    { isOngoing: true, cardKind: "legend", cardTypes: ["legend", "location"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [tronadoDefinition.cardId, tronadoDefinition],
  ]);
  activePlayer.permanents.push(
    createRuntimeCardInstance(
      activePlayer,
      tronadoDefinition.cardId,
      "ultimate-tronado"
    )
  );

  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf");
  chooseFirstFixtureDefense(state);
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: addFixtureCardToActiveHand(state, {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 3,
        target: { selector: "opponentPlayer" },
      }),
    }).ok,
    true
  );
  assert.equal(state.turn.power, 0);

  for (const amount of [3, 2]) {
    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: addFixtureCardToActiveHand(state, {
          effectId: "attack_damage",
          timing: "onPlay",
          amount,
          target: { selector: "opponentPlayer" },
        }),
      }).ok,
      true
    );
  }
  assert.equal(state.turn.power, 3);

  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: addFixtureCardToActiveHand(state, {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 4,
        target: { selector: "opponentPlayer" },
      }),
    }).ok,
    true
  );
  assert.equal(state.turn.power, 4);
});

test("Ultimate Tronado does not treat a later attack as first after it enters play", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    playerCount: 2,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
  }

  for (const amount of [2, 3]) {
    if (amount === 3) {
      const definition = loadCurrentRuntimeDataPack(
        rootDir
      ).cardDefinitions.get("esw2_dbg__legend_012");
      assert.ok(definition);
      state.cardDefinitions = new Map([
        ...state.cardDefinitions,
        [definition.cardId, definition],
      ]);
      activePlayer.permanents.push(
        createRuntimeCardInstance(
          activePlayer,
          definition.cardId,
          "ultimate-tronado"
        )
      );
    }
    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: addFixtureCardToActiveHand(state, {
          effectId: "attack_damage",
          timing: "onPlay",
          amount,
          target: { selector: "opponentPlayer" },
        }),
      }).ok,
      true
    );
  }

  assert.equal(state.turn.power, 0);
});

test("Losharocka Wand can self-target and makes the killed target a Dingler", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  activePlayer.life.current = 5;
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_030");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 3);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
});

test("Palochka-Shlepalocka steals chips equal to actual damage from a chosen non-first foe", () => {
  const { state, activePlayer, targetPlayer, wand } = setupShlepalockaTestState(
    { playerCount: 3 }
  );
  const firstFoe = mustGetPlayer(state, markPlayerId("player-3"));
  activePlayer.chips = 1;
  targetPlayer.chips = 5;
  targetPlayer.life.current = 20;
  firstFoe.life.current = 20;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "attack_damage") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === targetPlayer.playerId
    );
  });
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(firstFoe.life.current, 20);
  assert.equal(targetPlayer.life.current, 18);
  assert.equal(activePlayer.chips, 3);
  assert.equal(targetPlayer.chips, 3);
  assert.equal(
    state.players.reduce((total, player) => total + player.chips, 0),
    6
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "attack_damage" &&
        event.targetPlayerId === targetPlayer.playerId
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "attack_damage" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 2
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsChanged" &&
        event.effectId === "gain_chips_equal_damage_dealt" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 2
    )
  );
});

test("Palochka-Shlepalocka gains no chips when its attack is defended", () => {
  const { state, activePlayer, targetPlayer, wand } =
    setupShlepalockaTestState();
  activePlayer.chips = 1;
  targetPlayer.chips = 5;
  targetPlayer.life.current = 20;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(activePlayer.chips, 1);
  assert.equal(targetPlayer.chips, 5);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.definitionId === "esw2_dbg__main_015" &&
        event.targetPlayerId === targetPlayer.playerId
    )
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsChanged" &&
        event.effectId === "gain_chips_equal_damage_dealt" &&
        event.cardInstanceId === wand.instanceId
    ),
    false
  );
});

test("Palochka-Shlepalocka uses life-limited actual damage for its chip transfer", () => {
  const { state, activePlayer, targetPlayer, wand } =
    setupShlepalockaTestState();
  targetPlayer.life.current = 1;
  targetPlayer.chips = 5;
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(targetPlayer.chips, 4);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.definitionId === "esw2_dbg__main_015" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 1
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsChanged" &&
        event.effectId === "gain_chips_equal_damage_dealt" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 1
    )
  );
});

test("Palochka-Shlepalocka attack bonus scales chips and fills target shortfall from supply", () => {
  const { state, activePlayer, targetPlayer, wand } = setupShlepalockaTestState(
    { preserveActiveWizardProperty: true }
  );
  replaceFirstWizardProperty(
    state,
    activePlayer,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  targetPlayer.life.current = 20;
  targetPlayer.chips = 1;
  const playerChipsBefore = state.players.reduce(
    (total, player) => total + player.chips,
    0
  );
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 17);
  assert.equal(activePlayer.chips, 3);
  assert.equal(targetPlayer.chips, 0);
  assert.equal(
    state.players.reduce((total, player) => total + player.chips, 0),
    playerChipsBefore + 2
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.definitionId === "esw2_dbg__main_015" &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 3
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsChanged" &&
        event.effectId === "gain_chips_equal_damage_dealt" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.amount === 3
    )
  );
});

test("Palochka-Chipsalocka can spend one chip to attack its controller", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  activePlayer.chips = 1;
  activePlayer.life.current = 20;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "optional_spend_chip_attack_damage") {
      return undefined;
    }
    return choices.find(
      (choice) =>
        choice.choiceId === "pay_optional_cost" ||
        choice.choiceId === activePlayer.playerId
    );
  });
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_041");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.chips, 0);
  assert.equal(activePlayer.life.current, 10);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.cardInstanceId === wand.instanceId &&
        event.effectId === "optional_spend_chip_attack_damage" &&
        event.targetPlayerId === activePlayer.playerId &&
        event.amount === 10
      );
    })
  );
});

test("Palochka-Chipsalocka can decline its optional attack", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  activePlayer.chips = 1;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId !== "optional_spend_chip_attack_damage") {
      return undefined;
    }
    return choices.find((choice) => choice.choiceId === "skip_optional_cost");
  });
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_041");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.chips, 1);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.cardInstanceId === wand.instanceId
    ),
    false
  );
});

test("Palochka-Chipsalocka cannot attack without a chip", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  activePlayer.chips = 0;
  targetPlayer.life.current = 20;
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_041");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.chips, 0);
  assert.equal(targetPlayer.life.current, 20);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.effectId === "optional_spend_chip_attack_damage" &&
        event.choiceId === "skip_optional_cost"
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.cardInstanceId === wand.instanceId
    ),
    false
  );
});

test("Potny's Buzzing Wand chooses left or right and chains in the chosen direction", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 4,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const leftFoe = mustGetPlayer(state, markPlayerId("player-2"));
  const nextLeftFoe = mustGetPlayer(state, markPlayerId("player-3"));
  const rightFoe = mustGetPlayer(state, markPlayerId("player-4"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  leftFoe.wizardProperties = [];
  nextLeftFoe.wizardProperties = [];
  rightFoe.wizardProperties = [];
  leftFoe.life.current = 1;
  nextLeftFoe.life.current = 20;
  rightFoe.life.current = 20;
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_015"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 3);
  assert.equal(leftFoe.life.current, 20);
  assert.equal(nextLeftFoe.life.current, 10);
  assert.equal(rightFoe.life.current, 20);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.effectId === "directional_chain_attack" &&
        event.choiceId === "left" &&
        event.choiceIds?.includes("right") === true &&
        event.legalChoiceCount === 2
      );
    })
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.definitionId === "esw2_dbg__legend_015"
    ).length,
    2
  );
});

test("Ultimate Tronado gains the actual total from a directional chain attack only once", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 4,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const leftFoe = mustGetPlayer(state, markPlayerId("player-2"));
  const nextLeftFoe = mustGetPlayer(state, markPlayerId("player-3"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  leftFoe.life.current = 1;
  nextLeftFoe.life.current = 20;
  const tronadoDefinition = createFixtureCardDefinition(
    "esw2_dbg__legend_012",
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
    { isOngoing: true, cardKind: "legend", cardTypes: ["legend", "location"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [tronadoDefinition.cardId, tronadoDefinition],
  ]);
  activePlayer.permanents.push(
    createRuntimeCardInstance(
      activePlayer,
      tronadoDefinition.cardId,
      "ultimate-tronado"
    )
  );
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_015"
  );

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: wand.instanceId })
      .ok,
    true
  );

  assert.equal(state.turn.power, 14);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectAddPowerApplied" &&
        event.effectId === "ongoing_first_attack_damage_add_power"
    ).length,
    1
  );
});

test("Sweet Smurfinier heals only actual attack damage dealt", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.hand = [];
  activePlayer.life.current = 10;
  targetPlayer.life.current = 1;
  const card = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_046");

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(activePlayer.life.current, 11);
  assert.equal(targetPlayer.life.current, 20);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectLifeHealed" &&
        event.definitionId === "esw2_dbg__main_046" &&
        event.amount === 1
    )
  );
});

test("Venerina Magolovka supports pass, life-only, Dingler-only, and full exchange branches", () => {
  const cases = [
    {
      selectedChoiceId: "pass",
      expectedActiveLife: 7,
      expectedTargetLife: 13,
      expectedActiveDingler: true,
      expectedTargetDingler: false,
    },
    {
      selectedChoiceId: "exchange_life_only",
      expectedActiveLife: 13,
      expectedTargetLife: 7,
      expectedActiveDingler: true,
      expectedTargetDingler: false,
    },
    {
      selectedChoiceId: "exchange_dingler_status_only",
      expectedActiveLife: 7,
      expectedTargetLife: 13,
      expectedActiveDingler: false,
      expectedTargetDingler: true,
    },
    {
      selectedChoiceId: "exchange_life_and_dingler_status",
      expectedActiveLife: 13,
      expectedTargetLife: 7,
      expectedActiveDingler: false,
      expectedTargetDingler: true,
    },
  ] as const;

  for (const testCase of cases) {
    const state = initializeGame({ rootDir, seed: 60615 });
    const activePlayer = mustGetPlayer(state, state.activePlayerId);
    const targetPlayer = state.players.find(
      (player) => player.playerId !== activePlayer.playerId
    );
    assert.ok(targetPlayer);
    activePlayer.wizardProperties = [];
    targetPlayer.wizardProperties = [];
    activePlayer.life.current = 7;
    targetPlayer.life.current = 13;
    activePlayer.statuses.push(createDinglerStatus(activePlayer));
    chooseEffectChoiceWithFirstFixtureDefense(
      state,
      ({ effectId, definitionId, choices }) => {
        if (
          effectId !== "exchange_life_and_dingler_status" ||
          definitionId !== "esw2_dbg__legend_002"
        ) {
          return undefined;
        }

        return choices.find(
          (choice) => choice.choiceId === testCase.selectedChoiceId
        );
      }
    );
    const card = addRuntimeCardToHand(
      state,
      activePlayer,
      "esw2_dbg__legend_002"
    );

    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(state.turn.power, 4);
    assert.equal(activePlayer.life.current, testCase.expectedActiveLife);
    assert.equal(targetPlayer.life.current, testCase.expectedTargetLife);
    assert.equal(
      hasDinglerStatus(activePlayer),
      testCase.expectedActiveDingler
    );
    assert.equal(
      hasDinglerStatus(targetPlayer),
      testCase.expectedTargetDingler
    );
    assert.ok(
      state.eventLog.some((event) => {
        return (
          event.type === "effectChoiceSelected" &&
          event.effectId === "exchange_life_and_dingler_status" &&
          event.choiceId === testCase.selectedChoiceId &&
          event.choiceIds?.includes("pass") === true &&
          event.choiceIds?.includes("exchange_life_only") === true &&
          event.choiceIds?.includes("exchange_dingler_status_only") === true &&
          event.choiceIds?.includes("exchange_life_and_dingler_status") ===
            true &&
          event.legalChoiceCount === 4
        );
      })
    );
  }
});

test("2H grants one chip to each non-Dingler in active-player order", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, dinglerPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(dinglerPlayer);
  assert.ok(thirdPlayer);
  dinglerPlayer.statuses.push(createDinglerStatus(dinglerPlayer));
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_072");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 1);
  assert.equal(dinglerPlayer.chips, 0);
  assert.equal(thirdPlayer.chips, 1);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChipsGained" &&
          event.definitionId === "esw2_dbg__main_072"
      )
      .map((event) => event.playerId),
    [activePlayer.playerId, thirdPlayer.playerId]
  );
  assert.equal(state.common.destroyedMayhem.includes(mayhem), true);
});

test("2M grants every player two chips before attacking for their current chips", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, defendedPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(defendedPlayer);
  assert.ok(thirdPlayer);
  activePlayer.chips = 1;
  defendedPlayer.chips = 3;
  thirdPlayer.chips = 0;
  activePlayer.life.current = 10;
  defendedPlayer.life.current = 10;
  thirdPlayer.life.current = 10;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    defendedPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_062");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    [activePlayer.chips, defendedPlayer.chips, thirdPlayer.chips],
    [3, 5, 2]
  );
  assert.deepEqual(
    [
      activePlayer.life.current,
      defendedPlayer.life.current,
      thirdPlayer.life.current,
    ],
    [7, 10, 8]
  );
  assert.equal(defendedPlayer.discard.includes(defenseCard), true);

  const cardEvents = state.eventLog.filter(
    (event) => event.definitionId === "esw2_dbg__main_062"
  );
  const chipEvents = cardEvents.filter(
    (event) => event.type === "effectChipsGained"
  );
  const attackEvents = cardEvents.filter(
    (event) => event.type === "attackTargetStarted"
  );
  const decisionEvents = cardEvents.filter(
    (event) => event.type === "mayhemDecisionStarted"
  );
  const damageEvents = cardEvents.filter(
    (event) => event.type === "effectDamageDealt"
  );
  assert.deepEqual(
    chipEvents.map((event) => event.playerId),
    [activePlayer.playerId, defendedPlayer.playerId, thirdPlayer.playerId]
  );
  assert.deepEqual(
    attackEvents.map((event) => [event.targetPlayerId, event.amount]),
    [
      [activePlayer.playerId, 3],
      [thirdPlayer.playerId, 2],
    ]
  );
  assert.deepEqual(
    decisionEvents.map((event) => [event.targetPlayerId, event.amount]),
    [
      [activePlayer.playerId, 3],
      [defendedPlayer.playerId, 5],
      [thirdPlayer.playerId, 2],
    ]
  );
  assert.deepEqual(
    damageEvents.map((event) => [event.targetPlayerId, event.amount]),
    [
      [activePlayer.playerId, 3],
      [thirdPlayer.playerId, 2],
    ]
  );
  const decisionPhaseEvent = cardEvents.find(
    (event) => event.type === "mayhemDecisionPhaseStarted"
  );
  const resolutionPhaseEvent = cardEvents.find(
    (event) => event.type === "mayhemResolutionPhaseStarted"
  );
  assert.ok(decisionPhaseEvent);
  assert.ok(resolutionPhaseEvent);
  assert.equal(decisionPhaseEvent.amount, undefined);
  assert.equal(resolutionPhaseEvent.amount, undefined);
  assertEventOrder(state, [
    (event) =>
      event.type === "mayhemDecisionPhaseStarted" &&
      event.definitionId === "esw2_dbg__main_062",
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.definitionId === "esw2_dbg__main_062" &&
      event.targetPlayerId === activePlayer.playerId,
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.definitionId === "esw2_dbg__main_062" &&
      event.targetPlayerId === defendedPlayer.playerId,
    (event) =>
      event.type === "defenseChoiceSelected" &&
      event.playerId === defendedPlayer.playerId,
    (event) =>
      event.type === "attackAvoided" &&
      event.definitionId === "esw2_dbg__main_062" &&
      event.targetPlayerId === defendedPlayer.playerId,
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.definitionId === "esw2_dbg__main_062" &&
      event.targetPlayerId === thirdPlayer.playerId,
    (event) =>
      event.type === "mayhemResolutionPhaseStarted" &&
      event.definitionId === "esw2_dbg__main_062",
    (event) =>
      event.type === "effectDamageDealt" &&
      event.definitionId === "esw2_dbg__main_062" &&
      event.targetPlayerId === activePlayer.playerId,
  ]);
  assert.ok(chipEvents.length > 0);
  assert.ok(attackEvents.length > 0);
  assert.ok(
    state.eventLog.indexOf(chipEvents[chipEvents.length - 1]!) <
      state.eventLog.indexOf(attackEvents[0]!)
  );
  assert.equal(state.common.destroyedMayhem.includes(mayhem), true);
});

test("2D lets each player choose a foe who gains one chip in active-player order", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  const targetsByPlayer = new Map([
    [activePlayer.playerId, secondPlayer.playerId],
    [secondPlayer.playerId, thirdPlayer.playerId],
    [thirdPlayer.playerId, secondPlayer.playerId],
  ]);
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (String(effectId) !== "mayhem_each_player_choose_foe_gain_chips") {
        return undefined;
      }
      const targetPlayerId = targetsByPlayer.get(player.playerId);
      return choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === targetPlayerId
      );
    }
  );
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_075");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 0);
  assert.equal(secondPlayer.chips, 2);
  assert.equal(thirdPlayer.chips, 1);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          String(event.effectId) === "mayhem_each_player_choose_foe_gain_chips"
      )
      .map((event) => ({
        playerId: event.playerId,
        targetPlayerId: event.targetPlayerId,
      })),
    [
      {
        playerId: activePlayer.playerId,
        targetPlayerId: secondPlayer.playerId,
      },
      {
        playerId: secondPlayer.playerId,
        targetPlayerId: thirdPlayer.playerId,
      },
      {
        playerId: thirdPlayer.playerId,
        targetPlayerId: secondPlayer.playerId,
      },
    ]
  );
  assert.equal(state.common.destroyedMayhem.includes(mayhem), true);
});

test("2D excludes self and falls back to the first foe in seating order", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  const chooserOrder: string[] = [];
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (String(effectId) !== "mayhem_each_player_choose_foe_gain_chips") {
        return undefined;
      }
      chooserOrder.push(player.playerId);
      assert.equal(
        choices.some(
          (choice) =>
            choice.choiceKind === "playerTarget" &&
            choice.players.some(
              (candidate) => candidate.playerId === player.playerId
            )
        ),
        false
      );
      return undefined;
    }
  );
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_075");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    chooserOrder,
    orderedPlayers.map((player) => player.playerId)
  );
  assert.equal(activePlayer.chips, 1);
  assert.equal(secondPlayer.chips, 1);
  assert.equal(thirdPlayer.chips, 1);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          String(event.effectId) === "mayhem_each_player_choose_foe_gain_chips"
      )
      .map((event) => ({
        playerId: event.playerId,
        targetPlayerId: event.targetPlayerId,
        includesSelf: event.choiceIds?.includes(event.playerId) ?? false,
      })),
    [
      {
        playerId: activePlayer.playerId,
        targetPlayerId: secondPlayer.playerId,
        includesSelf: false,
      },
      {
        playerId: secondPlayer.playerId,
        targetPlayerId: thirdPlayer.playerId,
        includesSelf: false,
      },
      {
        playerId: thirdPlayer.playerId,
        targetPlayerId: activePlayer.playerId,
        includesSelf: false,
      },
    ]
  );
  assert.equal(state.common.destroyedMayhem.includes(mayhem), true);
});

test("2Q lets players above 10 reduce life to gain one chip", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.life.current = 12;
  secondPlayer.life.current = 10;
  thirdPlayer.life.current = 7;
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_060");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 10);
  assert.equal(activePlayer.chips, 1);
  assert.equal(secondPlayer.life.current, 10);
  assert.equal(secondPlayer.chips, 0);
  assert.equal(thirdPlayer.life.current, 7);
  assert.equal(thirdPlayer.chips, 0);
  assert.equal(state.common.destroyedMayhem.includes(mayhem), true);
});

test("2Q can skip its optional life-for-chips choice when a custom chooser passes", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.life.current = 12;
  secondPlayer.life.current = 10;
  thirdPlayer.life.current = 7;
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (effectId !== "mayhem_each_player_reduce_life_to_gain_chips") {
        return undefined;
      }
      if (player.playerId !== activePlayer.playerId) {
        return undefined;
      }
      return choices.find((choice) => choice.choiceId === "pass");
    }
  );
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_060");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 12);
  assert.equal(activePlayer.chips, 0);
  assert.equal(secondPlayer.life.current, 10);
  assert.equal(secondPlayer.chips, 0);
  assert.equal(thirdPlayer.life.current, 7);
  assert.equal(thirdPlayer.chips, 0);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "mayhem_each_player_reduce_life_to_gain_chips" &&
        event.choiceId === "pass" &&
        event.choiceIds?.includes("reduce_life_gain_chips") === true
      );
    })
  );
});

test("2N current runtime honors pass and participate branches for Mayhem battle", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  activePlayer.hand = createFixtureCardInstances(
    "esw2_dbg__starter_001",
    activePlayer.playerId,
    1
  );
  secondPlayer.hand = createFixtureCardInstances(
    "esw2_dbg__main_056",
    secondPlayer.playerId,
    1
  );
  thirdPlayer.hand = createFixtureCardInstances(
    "esw2_dbg__starter_002",
    thirdPlayer.playerId,
    1
  );
  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (effectId !== "mayhem_each_player_battle_highest_hand_cost") {
        return undefined;
      }
      if (player.playerId === secondPlayer.playerId) {
        return choices.find((choice) => choice.choiceId === "pass");
      }
      return choices.find((choice) => choice.choiceId === "participate");
    }
  );

  const mayhem = createCommonRuntimeCard("esw2_dbg__main_064");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(secondPlayer.hand.length, 1);
  assert.equal(secondPlayer.discard.length, 0);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.playerId === secondPlayer.playerId &&
        event.effectId === "mayhem_each_player_battle_highest_hand_cost" &&
        event.choiceId === "pass" &&
        event.choiceIds?.includes("participate") === true
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "mayhemBattleParticipationSelected" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "mayhem_each_player_battle_highest_hand_cost"
    )
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "mayhemBattleParticipationSelected" &&
        event.playerId === thirdPlayer.playerId &&
        event.effectId === "mayhem_each_player_battle_highest_hand_cost"
    )
  );
  assert.ok(
    state.eventLog.some((event) => event.type === "mayhemBattleResolved")
  );
});

test("2R current runtime supports non-first vote targets and Dingler ties", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 4 });
  state.activePlayerId = markPlayerId("player-2");
  const [activePlayer, secondPlayer, thirdPlayer, fourthPlayer] =
    getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  assert.ok(fourthPlayer);
  for (const player of [
    activePlayer,
    secondPlayer,
    thirdPlayer,
    fourthPlayer,
  ]) {
    player.life.current = 20;
  }

  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (effectId !== "mayhem_each_player_vote_dingler") {
        return undefined;
      }
      if (
        player.playerId === activePlayer.playerId ||
        player.playerId === secondPlayer.playerId
      ) {
        return choices.find(
          (choice) => choice.choiceId === `vote-${secondPlayer.playerId}`
        );
      }
      return choices.find(
        (choice) => choice.choiceId === `vote-${thirdPlayer.playerId}`
      );
    }
  );

  const mayhem = createCommonRuntimeCard("esw2_dbg__main_071");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(
    secondPlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(
    thirdPlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(
    fourthPlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.playerId === activePlayer.playerId &&
        event.effectId === "mayhem_each_player_vote_dingler" &&
        event.choiceId === `vote-${secondPlayer.playerId}` &&
        event.choiceIds?.includes(`vote-${thirdPlayer.playerId}`) === true
    )
  );
  assert.ok(
    state.eventLog.some((event) => {
      const eventRecord = event as unknown as Record<string, unknown>;
      const winnerPlayerIds = eventRecord["winnerPlayerIds"];
      return (
        event.type === "mayhemVoteResolved" &&
        Array.isArray(winnerPlayerIds) &&
        winnerPlayerIds.length === 2 &&
        winnerPlayerIds.includes(secondPlayer.playerId) &&
        winnerPlayerIds.includes(thirdPlayer.playerId)
      );
    })
  );
});

test("2P current runtime supports life payment, chip payment, and skip branches", () => {
  const cases = [
    {
      selectedChoiceId: "pay_life",
      life: 6,
      chips: 1,
      expectedLife: 1,
      expectedChips: 1,
      expectRemoved: true,
    },
    {
      selectedChoiceId: "spend_chips",
      life: 6,
      chips: 1,
      expectedLife: 6,
      expectedChips: 0,
      expectRemoved: true,
    },
    {
      selectedChoiceId: "skip",
      life: 6,
      chips: 1,
      expectedLife: 6,
      expectedChips: 1,
      expectRemoved: false,
    },
  ] as const;

  for (const testCase of cases) {
    const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
    state.activePlayerId = markPlayerId("player-2");
    const [activePlayer, secondPlayer, thirdPlayer] =
      getPlayersInActiveOrder(state);
    assert.ok(activePlayer);
    assert.ok(secondPlayer);
    assert.ok(thirdPlayer);

    activePlayer.life.current = testCase.life;
    activePlayer.chips = testCase.chips;
    secondPlayer.life.current = 20;
    thirdPlayer.life.current = 20;
    activePlayer.statuses.push(createDinglerStatus(activePlayer));

    chooseEffectChoiceWithFirstFixtureDefense(
      state,
      ({ effectId, player, choices }) => {
        if (
          effectId !==
            "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status" ||
          player.playerId !== activePlayer.playerId
        ) {
          return undefined;
        }
        return choices.find(
          (choice) => choice.choiceId === testCase.selectedChoiceId
        );
      }
    );

    const mayhem = createCommonRuntimeCard("esw2_dbg__main_066");
    state.common.market.splice(0, state.common.market.length);
    state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

    const result = runMarketFlow(state, { mode: "turn" });

    assert.equal(result.ok, true);
    assert.equal(activePlayer.life.current, testCase.expectedLife);
    assert.equal(activePlayer.chips, testCase.expectedChips);
    assert.equal(
      activePlayer.statuses.some((status) => status.statusId === "dingler"),
      !testCase.expectRemoved
    );
    assert.ok(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.playerId === activePlayer.playerId &&
          event.effectId ===
            "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status" &&
          event.choiceId === testCase.selectedChoiceId &&
          event.choiceIds?.includes("pay_life") === true &&
          event.choiceIds?.includes("spend_chips") === true &&
          event.choiceIds?.includes("skip") === true
      )
    );
  }
});

test("2O can use its discard-and-draw branch as the default reachable choice", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const normalDefinition = createFixtureCardDefinition("fixture-2o-normal", []);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [normalDefinition.cardId, normalDefinition],
  ]);

  const players = [activePlayer, secondPlayer, thirdPlayer];
  const discardedHandCards = players.map((player) => {
    return [0, 1].map((cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-2o-${player.playerId}-hand-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });
  const drawnDeckCards = players.map((player) => {
    return Array.from({ length: 5 }, (_value, cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-2o-${player.playerId}-deck-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });

  for (const [playerIndex, player] of players.entries()) {
    const handCards = discardedHandCards[playerIndex];
    const deckCards = drawnDeckCards[playerIndex];
    assert.ok(handCards);
    assert.ok(deckCards);
    player.hand.splice(0, player.hand.length, ...handCards);
    player.deck.splice(0, player.deck.length, ...deckCards);
    player.discard.splice(0, player.discard.length);
    player.life.current = 20;
  }

  const mayhem = createCommonRuntimeCard("esw2_dbg__main_059");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "mayhemHandDiscardedAndRedrawn")
      .map((event) => ({
        playerId: event.playerId,
        amount: event.amount,
      })),
    [
      { playerId: activePlayer.playerId, amount: 7 },
      { playerId: secondPlayer.playerId, amount: 7 },
      { playerId: thirdPlayer.playerId, amount: 7 },
    ]
  );
  for (const [playerIndex, player] of players.entries()) {
    const handCards = discardedHandCards[playerIndex];
    const deckCards = drawnDeckCards[playerIndex];
    assert.ok(handCards);
    assert.ok(deckCards);
    assert.equal(player.life.current, 20);
    assert.deepEqual(
      player.hand.map((card) => card.instanceId),
      deckCards.map((card) => card.instanceId)
    );
    assert.deepEqual(
      player.discard.map((card) => card.instanceId),
      handCards.map((card) => card.instanceId)
    );
    assert.deepEqual(player.deck, []);
  }
});

test("2O can reach its take-damage branch for an affected player", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-2o-mixed-normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [normalDefinition.cardId, normalDefinition],
  ]);

  const players = [activePlayer, secondPlayer, thirdPlayer];
  const discardedHandCards = players.map((player) => {
    return [0, 1].map((cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-2o-mixed-${player.playerId}-hand-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });
  const drawnDeckCards = players.map((player) => {
    return Array.from({ length: 5 }, (_value, cardIndex) => {
      return {
        instanceId: markCardInstanceId(
          `fixture-2o-mixed-${player.playerId}-deck-${cardIndex}`
        ),
        definitionId: markCardDefinitionId(normalDefinition.cardId),
        ownerId: player.playerId,
        marketChips: 0,
      } satisfies CardInstance;
    });
  });

  for (const [playerIndex, player] of players.entries()) {
    const handCards = discardedHandCards[playerIndex];
    const deckCards = drawnDeckCards[playerIndex];
    assert.ok(handCards);
    assert.ok(deckCards);
    player.hand.splice(0, player.hand.length, ...handCards);
    player.deck.splice(0, player.deck.length, ...deckCards);
    player.discard.splice(0, player.discard.length);
    player.life.current = 20;
  }

  chooseEffectChoiceWithFirstFixtureDefense(
    state,
    ({ effectId, player, choices }) => {
      if (
        effectId !==
        "mayhem_each_player_choose_discard_hand_draw_or_take_damage"
      ) {
        return undefined;
      }
      if (player.playerId !== secondPlayer.playerId) {
        return undefined;
      }
      return choices.find((choice) => choice.choiceId === "take_damage");
    }
  );

  const mayhem = createCommonRuntimeCard("esw2_dbg__main_059");
  state.common.market.splice(0, state.common.market.length);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem);

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 20);
  assert.equal(secondPlayer.life.current, 15);
  assert.equal(thirdPlayer.life.current, 20);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === secondPlayer.playerId &&
        event.effectId ===
          "mayhem_each_player_choose_discard_hand_draw_or_take_damage" &&
        event.choiceId === "take_damage" &&
        event.choiceIds?.includes("discard_hand_then_draw_cards") === true
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectDamageDealt" &&
        event.playerId === secondPlayer.playerId &&
        event.targetPlayerId === secondPlayer.playerId &&
        event.definitionId === "esw2_dbg__main_059" &&
        event.effectId ===
          "mayhem_each_player_choose_discard_hand_draw_or_take_damage" &&
        event.amount === 5
      );
    })
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "mayhemHandDiscardedAndRedrawn" &&
        event.playerId === secondPlayer.playerId
    ).length,
    0
  );
  assert.deepEqual(
    secondPlayer.hand.map((card) => card.instanceId),
    discardedHandCards[1]?.map((card) => card.instanceId)
  );
  assert.deepEqual(
    secondPlayer.discard.map((card) => card.instanceId),
    []
  );
  assert.deepEqual(
    activePlayer.hand.map((card) => card.instanceId),
    drawnDeckCards[0]?.map((card) => card.instanceId)
  );
  assert.deepEqual(
    thirdPlayer.hand.map((card) => card.instanceId),
    drawnDeckCards[2]?.map((card) => card.instanceId)
  );
});

test("Park Vurdalaktionov heals damage dealt on its controller's turn and adds hand limit at max life", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.hand = [];
  activePlayer.life.current = 16;
  targetPlayer.life.current = 20;
  const park = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_010"
  );

  const playParkResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: park.instanceId,
  });
  assert.equal(playParkResult.ok, true);
  assert.equal(activePlayer.permanents.includes(park), true);

  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 3,
    target: {
      selector: "opponentPlayer",
    },
  });
  const attackResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(attackResult.ok, true);
  assert.equal(activePlayer.life.current, 19);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectLifeHealed" &&
        event.definitionId === "esw2_dbg__legend_010" &&
        event.amount === 3
    )
  );

  activePlayer.life.current = calculateEffectivePlayerMaxLife(
    state,
    activePlayer.playerId
  );
  activePlayer.hand = [];
  activePlayer.deck = [
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-1"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-2"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-3"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-4"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-5"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-6"),
    createRuntimeCardInstance(activePlayer, "esw2_dbg__starter_001", "park-7"),
  ];

  const endTurnResult = applyAction(state, { type: "endTurn" });

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.hand.length, 7);
});

test("Mega Mayhem ME sets every wizard life to 5", () => {
  const state = initializeGame({ rootDir, seed: 60615, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  for (const player of state.players) {
    player.life.current = 17;
  }
  const megaMayhem = createCommonRuntimeCard("esw2_dbg__mega_mayhem_005");
  const legendFiller = state.common.legendMarket[0];
  assert.ok(legendFiller);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...state.common.legendMarket.slice(0, 2)
  );
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    legendFiller
  );

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(
    state.players.every((player) => player.life.current === 5),
    true
  );
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
});

test("attack_damage kill awards Basic Trophy to the attacker", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.ok(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    )
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "trophyControlChanged" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "attack_damage"
      );
    })
  );
});

test("attack_damage kill transfers Basic Trophy from its previous controller", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.trophyLikeObjects.filter(
      (trophy) => trophy.trophyId === "basicTrophy"
    ).length,
    1
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
});

test("deal_damage self-kill does not move Basic Trophy", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const trophyController = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(trophyController);
  activePlayer.life.current = 1;
  trophyController.trophyLikeObjects.push(
    createBasicTrophy(trophyController.playerId)
  );
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.equal(
    trophyController.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "trophyControlChanged"),
    false
  );
});

test("player-caused deal_damage kill awards Basic Trophy to the source player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "trophyControlChanged" &&
        event.playerId === activePlayer.playerId &&
        event.targetPlayerId === targetPlayer.playerId &&
        event.effectId === "deal_damage" &&
        event.sourceType === "card"
      );
    })
  );
});

test("attack_damage can be avoided by the first discard-self defense card in hand", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(defenseCard), false);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseChoiceSelected" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.definitionId === defenseCard.definitionId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCardMoved" &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.destination === "discard"
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackAvoided" &&
        event.playerId === targetPlayer.playerId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId
    ),
    false
  );
});

test("attack_damage can be avoided by a topdeck-self defense card in hand", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  const previousTopDeckCard = targetPlayer.deck[0];
  assert.ok(previousTopDeckCard);
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "topdeckSelf"
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.deadWizardTokens.length, 0);
  assert.equal(targetPlayer.hand.includes(defenseCard), false);
  assert.equal(targetPlayer.deck[0], defenseCard);
  assert.equal(targetPlayer.deck[1], previousTopDeckCard);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCardMoved" &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.destination === "deckTop"
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackAvoided" &&
        event.playerId === targetPlayer.playerId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === targetPlayer.playerId
    ),
    false
  );
});

test("avoid_attack defense with an unpayable discard-other-card cost is not legal", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.hand.splice(0);
  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "discard_other_hand_card", amount: 1 }],
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 16);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

test("avoid_attack defense pays discard, chip, and nonlethal life costs before avoiding an attack", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.chips = 3;
  targetPlayer.life.current = 5;
  const paidDiscard = targetPlayer.hand[0];
  assert.ok(paidDiscard);
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf",
    {
      costs: [
        { costId: "discard_other_hand_card", amount: 1 },
        { costId: "spend_chips", amount: 2 },
        { costId: "pay_life", amount: 4 },
      ],
    }
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 1);
  assert.equal(targetPlayer.chips, 1);
  assert.equal(targetPlayer.hand.includes(paidDiscard), false);
  assert.equal(targetPlayer.discard.includes(paidDiscard), true);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.targetCardInstanceId === paidDiscard.instanceId &&
        event.effectId === "discard_other_hand_card"
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.effectId === "spend_chips" &&
        event.amount === 2
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseCostPaid" &&
        event.playerId === targetPlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.effectId === "pay_life" &&
        event.amount === 4
      );
    })
  );
  assert.ok(state.eventLog.some((event) => event.type === "attackAvoided"));
});

test("avoid_attack defense with a lethal life cost is skipped for the next legal defense option", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.life.current = 5;
  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    costs: [{ costId: "pay_life", amount: 5 }],
  });
  const legalDefense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 5);
  assert.equal(targetPlayer.discard.includes(legalDefense), true);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === legalDefense.instanceId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseCostPaid" && event.effectId === "pay_life"
    ),
    false
  );
});

test("avoid_attack defense runs supported branch effects through the shared effect runtime after costs are paid", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  targetPlayer.chips = 1;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf",
    {
      costs: [{ costId: "spend_chips", amount: 1 }],
      branchEffects: [
        {
          effectId: "add_power",
          timing: "onDefense",
          amount: 2,
        },
      ],
    }
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.chips, 0);
  assert.equal(state.turn.power, 2);
  const costEventIndex = state.eventLog.findIndex((event) => {
    return (
      event.type === "defenseCostPaid" &&
      event.cardInstanceId === defenseCard.instanceId
    );
  });
  const branchEventIndex = state.eventLog.findIndex((event) => {
    return (
      event.type === "effectAddPowerApplied" &&
      event.playerId === targetPlayer.playerId &&
      event.cardInstanceId === defenseCard.instanceId &&
      event.definitionId === defenseCard.definitionId &&
      event.effectId === "add_power" &&
      event.amount === 2
    );
  });
  assert.ok(costEventIndex >= 0);
  assert.ok(branchEventIndex > costEventIndex);
});

test("defense branch damage kill awards Basic Trophy to the defending player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targetPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(targetPlayer);
  activePlayer.life.current = 1;
  activePlayer.trophyLikeObjects.push(createBasicTrophy(activePlayer.playerId));
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf",
    {
      branchEffects: [
        {
          effectId: "deal_damage",
          timing: "onDefense",
          amount: 1,
          target: {
            selector: "opponentPlayer",
          },
        },
      ],
    }
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "trophyControlChanged" &&
        event.playerId === targetPlayer.playerId &&
        event.targetPlayerId === activePlayer.playerId &&
        event.cardInstanceId === defenseCard.instanceId &&
        event.definitionId === defenseCard.definitionId &&
        event.effectId === "deal_damage" &&
        event.sourceType === "card"
      );
    })
  );
});

test("multi_target_attack resolves each opponent in seating order before moving to the next target", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const targets = getOpponentsInSeatingOrder(state, activePlayer);
  assert.equal(targets.length, 2);
  const [firstTarget, secondTarget] = targets;
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  firstTarget.life.current = 1;
  secondTarget.life.current = 1;
  state.common.deadWizardTokens.drawStack.splice(1);
  const onlyDwt = state.common.deadWizardTokens.drawStack[0];
  assert.ok(onlyDwt);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstTarget.life.current, 20);
  assert.equal(secondTarget.life.current, 20);
  assert.equal(firstTarget.deadWizardTokens.length, 1);
  assert.equal(firstTarget.deadWizardTokens[0], onlyDwt);
  assert.equal(secondTarget.deadWizardTokens.length, 0);
  assertEventOrder(state, [
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === firstTarget.playerId,
    (event) =>
      event.type === "effectDamageDealt" &&
      event.targetPlayerId === firstTarget.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === firstTarget.playerId,
    (event) =>
      event.type === "playerResurrected" &&
      event.playerId === firstTarget.playerId,
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === secondTarget.playerId,
    (event) =>
      event.type === "effectDamageDealt" &&
      event.targetPlayerId === secondTarget.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === secondTarget.playerId,
  ]);
});

test("multi_target_attack opens a separate defense window for each target", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const [firstTarget, secondTarget] = getOpponentsInSeatingOrder(
    state,
    activePlayer
  );
  assert.ok(firstTarget);
  assert.ok(secondTarget);
  firstTarget.life.current = 1;
  secondTarget.life.current = 10;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    firstTarget,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "opponentPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstTarget.life.current, 1);
  assert.equal(firstTarget.deadWizardTokens.length, 0);
  assert.equal(firstTarget.discard.includes(defenseCard), true);
  assert.equal(secondTarget.life.current, 6);
  assertEventOrder(state, [
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === firstTarget.playerId,
    (event) =>
      event.type === "defenseChoiceSelected" &&
      event.playerId === firstTarget.playerId,
    (event) =>
      event.type === "attackAvoided" &&
      event.targetPlayerId === firstTarget.playerId,
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === secondTarget.playerId,
    (event) =>
      event.type === "effectDamageDealt" &&
      event.targetPlayerId === secondTarget.playerId,
  ]);
});

test("mayhem_attack collects decisions for all players before resolving damage in active-player order", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const orderedPlayers = getPlayersInActiveOrder(state);
  assert.equal(orderedPlayers[0], activePlayer);
  const secondPlayer = orderedPlayers[1];
  const thirdPlayer = orderedPlayers[2];
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  activePlayer.life.current = 10;
  secondPlayer.life.current = 1;
  thirdPlayer.life.current = 1;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    secondPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "mayhem_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "allPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 6);
  assert.equal(secondPlayer.life.current, 1);
  assert.equal(thirdPlayer.life.current, 20);
  assert.equal(secondPlayer.discard.includes(defenseCard), true);
  assertEventOrder(state, [
    (event) => event.type === "mayhemDecisionPhaseStarted",
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.targetPlayerId === activePlayer.playerId,
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.targetPlayerId === secondPlayer.playerId,
    (event) =>
      event.type === "defenseChoiceSelected" &&
      event.playerId === secondPlayer.playerId,
    (event) =>
      event.type === "mayhemDecisionStarted" &&
      event.targetPlayerId === thirdPlayer.playerId,
    (event) => event.type === "mayhemResolutionPhaseStarted",
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === activePlayer.playerId,
    (event) =>
      event.type === "effectDamageDealt" &&
      event.targetPlayerId === activePlayer.playerId,
    (event) =>
      event.type === "mayhemTargetSkipped" &&
      event.targetPlayerId === secondPlayer.playerId,
    (event) =>
      event.type === "attackTargetStarted" &&
      event.targetPlayerId === thirdPlayer.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === thirdPlayer.playerId,
  ]);
});

test("mayhem_attack kill does not move Basic Trophy", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const orderedPlayers = getPlayersInActiveOrder(state);
  const targetPlayer = orderedPlayers[2];
  assert.ok(targetPlayer);
  targetPlayer.life.current = 1;
  targetPlayer.trophyLikeObjects.push(createBasicTrophy(targetPlayer.playerId));
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "mayhem_attack",
    timing: "onPlay",
    amount: 4,
    target: {
      selector: "allPlayers",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.equal(
    targetPlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "trophyControlChanged"),
    false
  );
});

test("unowned Mega Mayhem death does not move Basic Trophy", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
    playerCount: 3,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.trophyLikeObjects.push(createBasicTrophy(activePlayer.playerId));
  const mayhemDefinition = [...state.cardDefinitions.values()].find(
    (definition) => {
      return definition.engine.cardKind === "mayhem";
    }
  );
  assert.ok(mayhemDefinition);
  const mayhemCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-top-main-deck-mayhem"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.mainDeck.unshift(mayhemCard);
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: "combat",
    playerId: activePlayer.playerId,
    cardInstanceId: "fixture-unowned-mega-mayhem",
    definitionId: mayhemDefinition.cardId,
  };
  const result = executeMayhemEffects(
    state,
    activePlayer,
    {
      ...mayhemDefinition,
      engine: {
        ...mayhemDefinition.engine,
        effects: [
          {
            effectId:
              "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
            timing: "onMayhemResolve",
            targetSelector: "eachPlayerClockwiseFromActive",
            deathCondition: {
              effectId: "destroyed_card_kind_is",
              cardKind: "mayhem",
            },
            destroyedCardSource: "mainDeck",
          },
        ],
      },
    },
    source
  );

  assert.equal(result.ok, true);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === activePlayer.playerId
    )
  );
  assert.equal(
    activePlayer.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "trophyControlChanged"),
    false
  );
});

test("gain_status can make the active player Dingler and clamps life to 15", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 20;
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    activePlayer.statuses.filter((status) => status.statusId === "dingler")
      .length,
    1
  );
  assert.equal(activePlayer.life.current, 15);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "dinglerStatusGained" &&
        event.playerId === activePlayer.playerId
      );
    })
  );
});

test("remove_status makes a Dingler player normal without healing current life", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 20;
  const gainCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainCardId }).ok,
    true
  );
  assert.equal(activePlayer.life.current, 15);
  assert.equal(
    calculateEffectivePlayerMaxLife(state, activePlayer.playerId),
    15
  );

  activePlayer.life.current = 7;
  const removeCardId = addFixtureCardToActiveHand(state, {
    effectId: "remove_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  const removeResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: removeCardId,
  });

  assert.equal(removeResult.ok, true);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(activePlayer.life.current, 7);
  assert.equal(
    calculateEffectivePlayerMaxLife(state, activePlayer.playerId),
    25
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "dinglerStatusRemoved" &&
        event.playerId === activePlayer.playerId
      );
    })
  );
});

test("toggle_status alternates Dingler and normal status", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  activePlayer.life.current = 20;
  const toggleEffect = {
    effectId: "toggle_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  };
  const firstToggleCardId = addFixtureCardToActiveHand(state, toggleEffect);
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: firstToggleCardId })
      .ok,
    true
  );
  assert.equal(
    activePlayer.statuses.filter((status) => status.statusId === "dingler")
      .length,
    1
  );
  assert.equal(activePlayer.life.current, 15);

  const secondToggleCardId = addFixtureCardToActiveHand(state, toggleEffect);
  const secondToggleResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: secondToggleCardId,
  });

  assert.equal(secondToggleResult.ok, true);
  assert.equal(
    activePlayer.statuses.some((status) => status.statusId === "dingler"),
    false
  );
  assert.equal(
    calculateEffectivePlayerMaxLife(state, activePlayer.playerId),
    25
  );
});

test("active Dingler status gives a 5 VP scoring penalty until removed", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const scoreBefore = scoreGame(state).find(
    (score) => score.playerId === activePlayer.playerId
  );
  assert.ok(scoreBefore);
  const gainCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainCardId }).ok,
    true
  );

  const dinglerScore = scoreGame(state).find(
    (score) => score.playerId === activePlayer.playerId
  );
  assert.ok(dinglerScore);
  assert.equal(dinglerScore.victoryPoints, scoreBefore.victoryPoints - 5);

  const removeCardId = addFixtureCardToActiveHand(state, {
    effectId: "remove_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: removeCardId }).ok,
    true
  );

  const normalScore = scoreGame(state).find(
    (score) => score.playerId === activePlayer.playerId
  );
  assert.ok(normalScore);
  assert.equal(normalScore.victoryPoints, scoreBefore.victoryPoints);
});

test("Loshashlyk gains one chip per Dingler player", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const gainSelfCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "activePlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainSelfCardId }).ok,
    true
  );
  const gainFoeCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_status",
    timing: "onPlay",
    statusId: "dingler",
    target: {
      selector: "opponentPlayer",
    },
  });
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: gainFoeCardId }).ok,
    true
  );
  activePlayer.chips = 0;
  const loshashlyk: CardInstance = {
    instanceId: markCardInstanceId("fixture-loshashlyk"),
    definitionId: markCardDefinitionId("esw2_dbg__main_008"),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  activePlayer.hand.push(loshashlyk);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: loshashlyk.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 2);
  assert.equal(state.turn.power, 3);
});

test("targeted fixture effect skips when there are no legal choices by default", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      selector: "mainMarketCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 0);
  assert.ok(
    state.eventLog.some((event) => event.type === "effectChoiceSkipped")
  );
});

test("targeted fixture effect can fail when legal choices are empty", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  state.common.market.splice(0);
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    emptyChoice: "fail",
    target: {
      selector: "mainMarketCard",
    },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /No legal choices/);
});

test("targeted fixture effect surfaces unsupported selectors explicitly", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_add_power_equal_to_target_cost",
    timing: "onPlay",
    target: {
      targetType: "player",
    },
    targetSelector: "unsupportedFixtureSelector",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /targetSelector must be one of/);
});

test("runtime execution rejects unsupported effect ids explicitly", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const fixtureCardId = addFixtureCardToActiveHand(state, {
    effectId: "fixture_runtime_effect_not_in_catalog",
    timing: "onPlay",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.error,
    /Unsupported effect id fixture_runtime_effect_not_in_catalog/
  );
});

test("runtime execution rejects fixture-only effects in combat mode", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  state.runtimeMode = "combat";
  const definition = createFixtureCardDefinition(
    "combat-card-with-fixture-only-effect",
    [
      {
        effectId: "fixture_add_power_equal_to_target_cost",
        timing: "onPlay",
        target: {
          selector: "mainMarketCard",
        },
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card = addRuntimeCardToHand(state, activePlayer, definition.cardId);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    "Effect fixture_add_power_equal_to_target_cost is unavailable in combat mode"
  );
});

function snapshotActionState(
  state: ReturnType<typeof initializeGame>
): unknown {
  return {
    activePlayerId: state.activePlayerId,
    turn: state.turn,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      deck: player.deck.map((card) => card.instanceId),
      hand: player.hand.map((card) => card.instanceId),
      discard: player.discard.map((card) => card.instanceId),
      playedThisTurn: player.playedThisTurn.map((card) => card.instanceId),
      permanents: player.permanents.map((card) => card.instanceId),
    })),
    common: {
      market: state.common.market.map((card) => card.instanceId),
      legendMarket: state.common.legendMarket.map((card) => card.instanceId),
      wildMagicStack: state.common.wildMagicStack.map(
        (card) => card.instanceId
      ),
    },
    eventLog: state.eventLog,
  };
}

function prepareGainedMovementFixture(
  state: GameState,
  cardId: string
): {
  player: PlayerState;
  card: CardInstance;
} {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  replaceFirstWizardProperty(
    state,
    player,
    createTopdeckOnGainWizardProperty(`${cardId}-property`, ["treasure"])
  );
  const definition = createFixtureCardDefinition(cardId, [], {
    cardTypes: ["treasure"],
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card: CardInstance = {
    instanceId: markCardInstanceId(`${cardId}-instance`),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: "common",
    marketChips: 2,
  };
  state.common.market.splice(0, state.common.market.length, card);
  return {
    player,
    card,
  };
}

function assertGainedMovementGuarantees(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  completionEventType: "cardBought" | "effectCardGained"
): void {
  assert.equal(state.common.market.includes(card), false);
  assert.equal(player.deck[0], card);
  assert.equal(player.discard.includes(card), false);
  assert.equal(card.ownerId, player.playerId);
  assert.equal(card.marketChips, 0);
  assert.equal(player.chips, 2);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "marketChipsGained" &&
        event.playerId === player.playerId &&
        event.cardInstanceId === card.instanceId &&
        event.amount === 2 &&
        event.chipsBefore === 0 &&
        event.chipsAfter === 2
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "cardMoved" &&
        event.playerId === player.playerId &&
        event.cardInstanceId === card.instanceId &&
        event.sourceZone === "mainMarket" &&
        event.destinationZone === `${player.playerId}.deckTop` &&
        event.ownerBefore === "common" &&
        event.ownerAfter === player.playerId
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.playerId === player.playerId &&
        event.targetCardInstanceId === card.instanceId &&
        event.effectId === "topdeck_gained_card"
      );
    })
  );
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === completionEventType &&
        event.playerId === player.playerId &&
        (event.cardInstanceId === card.instanceId ||
          event.targetCardInstanceId === card.instanceId) &&
        event.destination === "deckTop"
      );
    })
  );
}

function playTargetedFixtureEffect(
  seed: number,
  effect: unknown
): {
  result: ReturnType<typeof applyAction>;
  state: GameState;
  firstMarketCard: NonNullable<GameState["common"]["market"][number]>;
  firstMarketCardCost: number;
  selectedTargetId: string | undefined;
} {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed,
  });
  const firstMarketCard = state.common.market[0];
  assert.ok(firstMarketCard);
  const firstMarketCardCost = state.cardDefinitions.get(
    firstMarketCard.definitionId
  )?.engine.cost;
  assert.ok(firstMarketCardCost !== undefined);
  const fixtureCardId = addFixtureCardToActiveHand(state, effect);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: fixtureCardId,
  });

  const selectedTargetId = state.eventLog.find(
    (event) => event.type === "effectChoiceSelected"
  )?.targetCardInstanceId;

  return {
    result,
    state,
    firstMarketCard,
    firstMarketCardCost,
    selectedTargetId,
  };
}

function getOpponentsInSeatingOrder(
  state: GameState,
  player: PlayerState
): PlayerState[] {
  const playerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === player.playerId
  );
  assert.notEqual(playerIndex, -1);
  return Array.from({ length: state.players.length - 1 }, (_, offset) => {
    return state.players[(playerIndex + offset + 1) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const activePlayerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.notEqual(activePlayerIndex, -1);
  return Array.from({ length: state.players.length }, (_, offset) => {
    return state.players[(activePlayerIndex + offset) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function assertEventOrder(
  state: GameState,
  predicates: Array<(event: GameState["eventLog"][number]) => boolean>
): void {
  let searchFrom = 0;
  for (const predicate of predicates) {
    const eventIndex = state.eventLog.findIndex(
      (event, index) => index >= searchFrom && predicate(event)
    );
    assert.notEqual(eventIndex, -1);
    searchFrom = eventIndex + 1;
  }
}

function chooseEffectChoiceWithFirstFixtureDefense(
  state: GameState,
  selector: NonNullable<GameState["effectChoiceStrategy"]>
): void {
  state.effectChoiceStrategy = (request) =>
    selector(request) ?? selectFirstFixtureDefense(request);
}

function chooseFirstFixtureDefense(state: GameState): void {
  state.effectChoiceStrategy = selectFirstFixtureDefense;
}

function addFixtureCardToActiveHand(
  state: GameState,
  effect: unknown,
  options: {
    isOngoing?: boolean;
    cardTypes?: string[];
    cardKind?: CardDefinition["engine"]["cardKind"];
    tags?: string[];
  } = {}
): string {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  assert.ok(activePlayer);
  const definition = createFixtureCardDefinition(
    `fixture-targeted-effect-card-${activePlayer.hand.length + 1}`,
    [effect as RuntimeEffect],
    options
  );

  return addFixtureDefinitionToActiveHand(state, definition, {
    instanceId: markCardInstanceId(
      `fixture-card-${activePlayer.hand.length + 1}`
    ),
  }).instanceId;
}

function createMarketFlowModeFixture(): GameState {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-market-flow-interface-mayhem",
    [{ effectId: "add_power", timing: "onMayhemResolve", amount: 2 }],
    { cardKind: "mayhem" }
  );
  const normalDefinition = createFixtureCardDefinition(
    "fixture-market-flow-interface-normal",
    []
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [mayhemDefinition.cardId, mayhemDefinition],
    [normalDefinition.cardId, normalDefinition],
  ]);
  state.common.market.splice(
    0,
    state.common.market.length,
    ...state.common.market.slice(0, 4)
  );
  state.common.mainDeck.splice(
    0,
    state.common.mainDeck.length,
    {
      instanceId: markCardInstanceId(
        "fixture-market-flow-interface-mayhem-instance"
      ),
      definitionId: markCardDefinitionId(mayhemDefinition.cardId),
      ownerId: "common",
      marketChips: 0,
    },
    {
      instanceId: markCardInstanceId(
        "fixture-market-flow-interface-normal-instance"
      ),
      definitionId: markCardDefinitionId(normalDefinition.cardId),
      ownerId: "common",
      marketChips: 0,
    }
  );
  return state;
}

function findOwnedCard(
  player: PlayerState,
  definitionId: string
): CardInstance | undefined {
  return [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    ...player.playedThisTurn,
    ...player.permanents,
  ].find((card) => {
    return card.definitionId === definitionId;
  });
}

function mustGetPlayer(
  state: GameState,
  playerId: PlayerState["playerId"]
): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  assert.ok(player);
  return player;
}

function setupShlepalockaTestState(
  options: {
    playerCount?: number;
    preserveActiveWizardProperty?: boolean;
  } = {}
): {
  state: GameState;
  activePlayer: PlayerState;
  targetPlayer: PlayerState;
  wand: CardInstance;
} {
  const state = initializeGame({
    rootDir,
    seed: 60615,
    ...(options.playerCount === undefined
      ? {}
      : { playerCount: options.playerCount }),
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    if (
      options.preserveActiveWizardProperty !== true ||
      player.playerId !== activePlayer.playerId
    ) {
      player.wizardProperties = [];
    }
    player.statuses = [];
    player.chips = 0;
    player.hand = [];
  }
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_015");
  return { state, activePlayer, targetPlayer, wand };
}

function addRuntimeCardToHand(
  state: GameState,
  player: PlayerState,
  definitionId: string
): CardInstance {
  assert.ok(state.cardDefinitions.has(definitionId));
  const card = createRuntimeCardInstance(
    player,
    definitionId,
    `${definitionId}-${player.hand.length + 1}`
  );
  player.hand.push(card);
  return card;
}

function createRuntimeCardInstance(
  player: PlayerState,
  definitionId: string,
  instanceIdSuffix: string
): CardInstance {
  const card: CardInstance = {
    instanceId: markCardInstanceId(`fixture-runtime-${instanceIdSuffix}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  return card;
}

function createCommonRuntimeCard(definitionId: string): CardInstance {
  return {
    instanceId: markCardInstanceId(`fixture-runtime-${definitionId}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
}

function createDinglerStatus(player: PlayerState): StatusInstance {
  return {
    instanceId: markCardInstanceId(`fixture-dingler-${player.playerId}`),
    statusId: "dingler",
    ownerId: player.playerId,
    effects: [],
  };
}

function hasDinglerStatus(player: PlayerState): boolean {
  return player.statuses.some((status) => status.statusId === "dingler");
}

function moveCardToHand(player: PlayerState, card: CardInstance): void {
  for (const zone of [
    player.hand,
    player.deck,
    player.discard,
    player.playedThisTurn,
    player.permanents,
  ]) {
    const cardIndex = zone.findIndex(
      (candidate) => candidate.instanceId === card.instanceId
    );
    if (cardIndex >= 0) {
      zone.splice(cardIndex, 1);
    }
  }

  player.hand.push(card);
}

function moveHandCardToFront(
  player: PlayerState,
  cardInstanceId: string
): void {
  const cardIndex = player.hand.findIndex(
    (card) => card.instanceId === cardInstanceId
  );
  assert.notEqual(cardIndex, -1);
  const [card] = player.hand.splice(cardIndex, 1);
  assert.ok(card);
  player.hand.unshift(card);
}

function createFixtureCardDefinition(
  cardId: string,
  effects: RuntimeEffect[],
  options: {
    isOngoing?: boolean;
    cardTypes?: string[];
    cardKind?: CardDefinition["engine"]["cardKind"];
    tags?: string[];
  } = {}
): CardDefinition {
  const cardKind = options.cardKind ?? "normal";
  return {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind,
      cardTypes: options.cardTypes ?? [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind,
      cardTypes: options.cardTypes ?? [],
      ...(options.tags === undefined ? {} : { tags: options.tags }),
      cost: 0,
      victoryPoints: 0,
      isOngoing: options.isOngoing ?? false,
      marketChipMarker: false,
      effects,
      unsupportedMechanics: [],
    },
  };
}

function addControlledFixturePermanent(
  state: GameState,
  player: PlayerState,
  cardId: string,
  cardTypes: string[]
): CardInstance {
  return addControlledFixturePermanentWithCost(
    state,
    player,
    cardId,
    cardTypes,
    0
  );
}

function addControlledFixturePermanentWithCost(
  state: GameState,
  player: PlayerState,
  cardId: string,
  cardTypes: string[],
  cost: number
): CardInstance {
  const definition = createFixtureCardDefinition(cardId, [], {
    isOngoing: true,
    cardTypes,
  });
  definition.engine.cost = cost;
  definition.visible.cost = cost;
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card: CardInstance = {
    instanceId: markCardInstanceId(`${cardId}-instance`),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.permanents.push(card);
  return card;
}

function addFixtureMarketCard(
  state: GameState,
  cardId: string,
  cardTypes: string[],
  cost: number
): CardInstance {
  const definition = createFixtureCardDefinition(cardId, [], {
    cardTypes,
  });
  definition.engine.cost = cost;
  definition.visible.cost = cost;
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card: CardInstance = {
    instanceId: markCardInstanceId(`${cardId}-instance`),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.push(card);
  return card;
}

function createFixtureCardInstances(
  definitionId: string,
  ownerId: PlayerState["playerId"],
  count: number
): CardInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    instanceId: markCardInstanceId(`${definitionId}-${index + 1}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId,
    marketChips: 0,
  }));
}

function replaceFirstWizardProperty(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition
): PlayerState["wizardProperties"][number] {
  return replacePostSetupWizardPropertyFixture(state, player, definition);
}

function createChipActivationWizardProperty(
  tokenId: string,
  cardTypes: string[],
  minimumCount: number
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "activation",
          amount: 1,
          condition: {
            conditionId: "control_count",
            cardTypes,
            minimumCount,
          },
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createOnPlayOngoingChipWizardProperty(
  tokenId: string
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "onPlayCard",
          isOngoing: true,
          amount: 1,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createOnPlayTypeChipWizardProperty(
  tokenId: string,
  cardTypes: string[]
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "onPlayCard",
          cardTypes,
          amount: 1,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTopdeckOnGainWizardProperty(
  tokenId: string,
  cardTypes: string[]
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "topdeck_gained_card",
          timing: "onGainCard",
          optional: true,
          cardTypes,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTemporaryHandLimitWizardProperty(
  tokenId: string,
  cardTypes: string[],
  amount = 1
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/wizard-property/wp_fixture.png" },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "temporary_hand_limit_by_gained_card_type",
          timing: "endTurn",
          amount,
          cardTypes,
        },
      ],
      unsupportedMechanics: [],
    },
  };
}

function createWizardPropertySetupEntriesDataPack(
  dataPack: LoadedDataPack,
  entries: ReadonlyArray<{ tokenId: string; count: number }>
): LoadedDataPack {
  return {
    ...dataPack,
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: {
        schemaVersion: 1,
        stackId: "fixture-wizard-property-setup-stack",
        runtimeSchema: "krutagidon.tokenStack.v0",
        role: "wizardProperties",
        mappingStatus: "fixture",
        entries: entries.map((entry) => ({
          tokenId: entry.tokenId,
          count: entry.count,
        })),
      },
    },
  };
}

function createExpandedDeadWizardTokenSetupDataPack(
  dataPack: LoadedDataPack,
  count: number
): LoadedDataPack {
  const deadWizardTokens = dataPack.tokenStacks.deadWizardTokens;
  assert.ok(deadWizardTokens);

  return {
    ...dataPack,
    tokenStacks: {
      ...dataPack.tokenStacks,
      deadWizardTokens: {
        ...deadWizardTokens,
        entries: deadWizardTokens.entries.map((entry) => ({
          tokenId: entry.tokenId,
          count,
        })),
      },
    },
  };
}

function createMaxLifeModifierStatus(
  playerId: StatusInstance["ownerId"],
  amount: number
): StatusInstance {
  return {
    instanceId: markCardInstanceId("fixture-max-life-status"),
    statusId: "fixture-max-life-status",
    ownerId: playerId,
    effects: [
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount,
        target: {
          targetType: "player",
        },
      },
    ],
  };
}

function createBasicTrophy(
  ownerId: PlayerState["playerId"]
): PlayerState["trophyLikeObjects"][number] {
  return {
    instanceId: markCardInstanceId("basic-trophy"),
    trophyId: "basicTrophy",
    ownerId,
    effects: [],
  };
}
