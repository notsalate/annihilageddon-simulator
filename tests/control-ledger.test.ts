import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  forkGameState,
  getPhysicalCardLedger,
  initializeGame,
  listLegalActions,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  assertGameStateInvariants,
} from "../src/index.js";
import {
  buildControlledObjectView,
  cloneTemporaryControls,
  getControlledCards,
  grantTemporaryControl,
  releaseTemporaryControls,
} from "../src/engine/control-ledger.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
} from "../src/domain/types.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";
import {
  calculateEndTurnDrawCount,
  executeControlledCardOnPlayCardEffects,
  executeEffect,
} from "../src/engine/effect-runtime.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

import {
  chooseEffect,
  createGameScenario,
  endTurn,
  play,
  toChoiceSelection,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("PhysicalCardLedger keeps live branch-local card identity for known-card operations", () => {
  const state = initializeGame({ rootDir, seed: 22000 });
  const sourceCard = state.players[0]?.hand[0];
  assert.ok(sourceCard);

  const ledger = getPhysicalCardLedger(state);
  assert.equal(ledger.locateCard(sourceCard)?.card, sourceCard);
  assert.equal(
    ledger.resolveCardLocation(sourceCard.instanceId)?.card,
    sourceCard
  );

  const removed = ledger.removeCard(
    sourceCard,
    `${state.players[0]!.playerId}.hand`
  );
  assert.equal(removed.ok, true);
  assert.equal(ledger.locateCard(sourceCard), undefined);

  const restored = ledger.insertDetachedCard(
    sourceCard,
    `${state.players[0]!.playerId}.hand`,
    "front"
  );
  assert.equal(restored.ok, true);
  assert.equal(ledger.locateCard(sourceCard)?.card, sourceCard);

  const fork = forkGameState(state);
  const forkCard = fork.players[0]?.hand[0];
  assert.ok(forkCard);
  assert.notEqual(forkCard, sourceCard);
  assert.equal(
    getPhysicalCardLedger(fork).locateCard(forkCard)?.card,
    forkCard
  );
  assert.equal(getPhysicalCardLedger(fork).locateCard(sourceCard), undefined);
});

test("Control Ledger resolves controlled cards across permanent, played, and owner discard zones", () => {
  const state = initializeGame({ rootDir, seed: 22001 });
  const controller = state.players[0];
  const owner = state.players[1];
  assert.ok(controller);
  assert.ok(owner);

  const permanent = controller.hand.shift();
  const played = controller.hand.shift();
  const ownerDiscard = owner.hand.shift();
  assert.ok(permanent);
  assert.ok(played);
  assert.ok(ownerDiscard);
  const staleControlCard: CardInstance = {
    ...played,
    instanceId: markCardInstanceId("stale-control-reference"),
  };
  const ledger = getPhysicalCardLedger(state);

  controller.permanents.push(permanent);
  controller.playedThisTurn.push(played);
  owner.discard.push(ownerDiscard);
  state.turn.temporaryCardControls.push(
    {
      card: played,
      controllerId: controller.playerId,
    },
    {
      card: ownerDiscard,
      controllerId: controller.playerId,
    },
    {
      card: staleControlCard,
      controllerId: controller.playerId,
    }
  );

  assert.deepEqual(
    getControlledCards(state, controller).map((card) => card.instanceId),
    [permanent.instanceId, played.instanceId, ownerDiscard.instanceId]
  );
  assert.equal(
    ledger.locateCard(permanent)?.zoneName,
    `${controller.playerId}.permanents`
  );
  assert.equal(
    ledger.locateCard(played)?.zoneName,
    `${controller.playerId}.playedThisTurn`
  );
  assert.equal(
    ledger.locateCard(ownerDiscard)?.zoneName,
    `${owner.playerId}.discard`
  );
  assert.equal(
    ledger.resolveCardLocation(markCardInstanceId("missing-card")),
    undefined
  );

  const view = buildControlledObjectView(state, controller.playerId);
  assert.deepEqual(
    view.cards.map(({ card }) => card.instanceId),
    [permanent.instanceId, played.instanceId, ownerDiscard.instanceId]
  );
  assert.deepEqual(
    view.cards.map(({ definition }) => definition.cardId),
    [permanent.definitionId, played.definitionId, ownerDiscard.definitionId]
  );
});

test("Control Ledger locates player singleton and common card zones", () => {
  const state = initializeGame({ rootDir, seed: 22002 });
  const player = state.players[0];
  assert.ok(player);
  const familiar = player.hand.shift();
  const marketCard = state.common.market[0];
  assert.ok(familiar);
  player.unboughtFamiliars = [familiar];
  assert.ok(marketCard);

  assert.equal(
    getPhysicalCardLedger(state).locateCard(familiar)?.zoneName,
    `${player.playerId}.unboughtFamiliars`
  );
  assert.equal(
    getPhysicalCardLedger(state).locateCard(marketCard)?.zoneName,
    "mainMarket"
  );
});

test("Control Ledger reads a player's played cards without traversing other zones", () => {
  const state = initializeGame({ rootDir, seed: 22008 });
  const player = state.players[0];
  const otherPlayer = state.players[1];
  assert.ok(player);
  assert.ok(otherPlayer);
  const playedCard = player.hand.shift();
  const otherPlayedCard = otherPlayer.hand.shift();
  assert.ok(playedCard);
  assert.ok(otherPlayedCard);
  player.playedThisTurn.push(playedCard);
  otherPlayer.playedThisTurn.push(otherPlayedCard);

  assert.deepEqual(
    getPhysicalCardLedger(state).readZone(`${player.playerId}.playedThisTurn`),
    [playedCard]
  );
  assert.equal(
    getPhysicalCardLedger(state).findCardInZone(
      `${player.playerId}.playedThisTurn`,
      playedCard.instanceId
    ),
    playedCard
  );
  assert.equal(
    getPhysicalCardLedger(state).findCardInZone(
      `${player.playerId}.playedThisTurn`,
      otherPlayedCard.instanceId
    ),
    undefined
  );
});

test("game-state invariants reject an unknown owner in a flexible physical card zone", () => {
  const state = initializeGame({ rootDir, seed: 22006 });
  const card = state.players[0]?.hand.shift();
  assert.ok(card);
  card.ownerId = markPlayerId("player-99");
  state.common.destroyedPile.push(card);

  assert.throws(
    () => assertGameStateInvariants(state),
    new RegExp(
      `${card.instanceId} in destroyedPile must be owned by a player or common`
    )
  );
});

test("game-state invariants allow a player-owned card in a flexible physical card zone", () => {
  const state = initializeGame({ rootDir, seed: 22007 });
  const card = state.players[1]?.hand.shift();
  assert.ok(card);
  state.common.destroyedPile.push(card);

  assert.doesNotThrow(() => assertGameStateInvariants(state));
});

test("temporary control lifecycle is idempotent, transferable, releasable, and fork-safe", () => {
  const state = initializeGame({ rootDir, seed: 22003 });
  const firstController = state.players[0];
  const secondController = state.players[1];
  assert.ok(firstController);
  assert.ok(secondController);
  const card = firstController.hand.shift();
  assert.ok(card);
  firstController.playedThisTurn.push(card);

  grantTemporaryControl(state, card, firstController.playerId);
  grantTemporaryControl(state, card, firstController.playerId);
  assert.deepEqual(state.turn.temporaryCardControls, [
    {
      card,
      controllerId: firstController.playerId,
    },
  ]);

  grantTemporaryControl(state, card, secondController.playerId);
  assert.deepEqual(state.turn.temporaryCardControls, [
    {
      card,
      controllerId: secondController.playerId,
    },
  ]);
  assert.equal(
    getControlledCards(state, firstController).includes(card),
    false
  );
  assert.equal(
    getControlledCards(state, secondController).includes(card),
    true
  );

  const clonedControls = cloneTemporaryControls(
    state.turn.temporaryCardControls
  );
  clonedControls[0]!.controllerId = firstController.playerId;
  assert.equal(
    state.turn.temporaryCardControls[0]!.controllerId,
    secondController.playerId
  );

  const fork = forkGameState(state);
  releaseTemporaryControls(fork);
  assert.equal(fork.turn.temporaryCardControls.length, 0);
  assert.equal(state.turn.temporaryCardControls.length, 1);

  releaseTemporaryControls(state);
  assert.equal(state.turn.temporaryCardControls.length, 0);
  assert.equal(
    getControlledCards(state, secondController).includes(card),
    false
  );
});

test("Control Ledger gives activation, costs, passive power, and end-turn rules one controlled-card view", () => {
  const state = initializeGame({ rootDir, seed: 22004 });
  const controller = state.players[0];
  const owner = state.players[1];
  assert.ok(controller);
  assert.ok(owner);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  owner.wizardProperties = [];

  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-control-ledger-consumer",
    source: { image: "assets/cards/fixtures/control-ledger.png" },
    visible: {
      nameRu: "Fixture Control Ledger consumer",
      cost: 7,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: ["treasure"],
      markers: ["ongoing"],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: ["treasure"],
      cost: 7,
      victoryPoints: 0,
      isOngoing: true,
      marketChipMarker: false,
      effects: [
        verifiedTestRuntimeEffect({
          effectId: "ongoing_add_power",
          timing: "whileControlled",
          amount: 1,
        }),
        verifiedTestRuntimeEffect({
          effectId: "ongoing_hand_refill_bonus",
          timing: "endTurn",
          amount: 1,
        }),
        verifiedTestRuntimeEffect({
          effectId: "add_power",
          timing: "activation",
          amount: 2,
        }),
      ],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const controlledCard = addTemporarilyControlledCard(
    state,
    controller,
    owner,
    definition.cardId,
    "consumer"
  );

  const controlledPowerResult = dispatchControlledCardOperation(
    state,
    controller,
    { kind: "recalculateControlledPower" }
  );
  assert.deepEqual(controlledPowerResult, { ok: true });
  assert.equal(state.turn.power, 1);
  assert.equal(calculateEndTurnDrawCount(state, controller), 6);
  assert.equal(
    listLegalActions(state).some(
      (action) =>
        action.type === "activatePermanent" &&
        action.cardInstanceId === controlledCard.instanceId
    ),
    true
  );

  const activationResult = applyAction(state, {
    type: "activatePermanent",
    cardInstanceId: controlledCard.instanceId,
  });
  assert.deepEqual(activationResult, { ok: true });
  assert.equal(state.turn.power, 3);

  const target = state.players[1];
  assert.ok(target);
  target.hand = [];
  const lifeBefore = target.life.current;
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage_equal_to_controlled_card_cost"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === target.playerId)
        )
      : undefined;
  const costAttackResult = executeEffect(
    state,
    controller,
    verifiedTestRuntimeEffect({
      effectId: "attack_damage_equal_to_controlled_card_cost",
      timing: "onPlay",
      costMode: "highest",
      targetSelector: "chosenFoe",
    }),
    fixtureSource(controller, "fixture-controlled-cost")
  );
  assert.deepEqual(costAttackResult, { ok: true });
  assert.equal(target.life.current, lifeBefore - 7);

  const conditionedDefinition: CardDefinition = {
    schemaVersion: 1,
    cardId: "fixture-control-ledger-conditioned-play",
    source: { image: "assets/cards/fixtures/control-ledger-conditioned.png" },
    visible: {
      nameRu: "Fixture controlled-card condition",
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [
        verifiedTestRuntimeEffect({
          effectId: "add_power",
          timing: "onPlay",
          amount: 4,
          condition: {
            conditionId: "control_count",
            cardTypes: ["treasure"],
            minimumCount: 1,
          },
        }),
      ],
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [conditionedDefinition.cardId, conditionedDefinition],
  ]);
  const conditionedCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-control-ledger-conditioned-play"),
    definitionId: markCardDefinitionId(conditionedDefinition.cardId),
    ownerId: controller.playerId,
    marketChips: 0,
  };
  controller.hand.push(conditionedCard);

  const conditionedPlay = applyAction(state, {
    type: "playCard",
    cardInstanceId: conditionedCard.instanceId,
  });
  assert.deepEqual(conditionedPlay, { ok: true });
  assert.equal(state.turn.power, 7);
});

test("temporarily controlled ongoing attack modifiers and triggers work outside permanents", () => {
  const state = initializeGame({ rootDir, seed: 22005 });
  const controller = state.players[0];
  const owner = state.players[1];
  assert.ok(controller);
  assert.ok(owner);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  owner.wizardProperties = [];
  owner.hand = [];

  addTemporarilyControlledCard(
    state,
    controller,
    owner,
    "esw2_dbg__main_009",
    "greasy-stick"
  );
  addTemporarilyControlledCard(
    state,
    controller,
    owner,
    "esw2_dbg__legend_008",
    "arena"
  );
  addTemporarilyControlledCard(
    state,
    controller,
    owner,
    "esw2_dbg__legend_012",
    "tornado"
  );
  const wand = addCardToZone(
    state,
    controller,
    "esw2_dbg__starter_003",
    "wand",
    controller.playedThisTurn
  );
  grantTemporaryControl(state, wand, controller.playerId);

  state.turn.power = 0;
  const playTriggerResult = executeControlledCardOnPlayCardEffects(
    state,
    controller,
    wand
  );
  assert.deepEqual(playTriggerResult, { ok: true });
  assert.equal(state.turn.power, 1);

  state.turn.power = 0;
  const lifeBefore = owner.life.current;
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === owner.playerId)
        )
      : undefined;
  const attackResult = executeEffect(
    state,
    controller,
    verifiedTestRuntimeEffect({
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 2,
      targetSelector: "chosenFoe",
    }),
    {
      sourceType: "card",
      runtimeMode: "combat",
      playerId: controller.playerId,
      cardInstanceId: wand.instanceId,
      definitionId: wand.definitionId,
    }
  );

  assert.deepEqual(attackResult, { ok: true });
  assert.equal(owner.life.current, lifeBefore - 8);
  assert.equal(state.turn.power, 8);
});

function addTemporarilyControlledCard(
  state: GameState,
  controller: PlayerState,
  owner: PlayerState,
  definitionId: string,
  suffix: string
): CardInstance {
  const card = addCardToZone(state, owner, definitionId, suffix, owner.discard);
  grantTemporaryControl(state, card, controller.playerId);
  return card;
}

function addCardToZone(
  state: GameState,
  owner: PlayerState,
  definitionId: string,
  suffix: string,
  zone: CardInstance[]
): CardInstance {
  assert.ok(state.cardDefinitions.has(definitionId));
  const card: CardInstance = {
    instanceId: markCardInstanceId(`fixture-control-ledger-${suffix}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: owner.playerId,
    marketChips: 0,
  };
  zone.push(card);
  return card;
}

function fixtureSource(player: PlayerState, suffix: string) {
  return {
    sourceType: "card" as const,
    runtimeMode: "fixture" as const,
    playerId: player.playerId,
    cardInstanceId: `fixture-control-ledger-source-${suffix}`,
    definitionId: `fixture-control-ledger-source-${suffix}`,
  };
}

test("Wild Magic lets the typed choice strategy play a foe's top card", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
    seed: 60615,
  });
  const activePlayer = scenario.activePlayer;
  const foe = scenario.foes[0];
  assert.ok(foe);
  const foeTopCard = foe.deck[0];
  assert.ok(foeTopCard);
  const wildMagic = scenario.state.common.wildMagicStack.shift();
  assert.ok(wildMagic);
  wildMagic.ownerId = activePlayer.playerId;
  activePlayer.hand.push(wildMagic);
  chooseEffect(scenario, ({ definitionId, effectId, choices }) => {
    if (
      definitionId !== "esw2_dbg__wild_magic" ||
      effectId !== "wild_magic_choice"
    ) {
      return undefined;
    }
    return toChoiceSelection(choices.at(-1));
  });

  const result = play(scenario, wildMagic);

  assert.equal(result.ok, true);
  assert.equal(scenario.state.turn.power, 1);
  assert.equal(foe.deck.includes(foeTopCard), false);
  assert.equal(activePlayer.playedThisTurn.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
  assert.equal(foeTopCard.ownerId, foe.playerId);
  assert.ok(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "wildMagicChoiceSelected" &&
        event.cardInstanceId === wildMagic.instanceId &&
        event.effectId === "play_top_card_from_foe_deck"
    )
  );

  const endTurnResult = endTurn(scenario);

  assert.equal(endTurnResult.ok, true);
  assert.equal(activePlayer.discard.includes(foeTopCard), false);
  assert.equal(foe.discard.includes(foeTopCard), true);
});
