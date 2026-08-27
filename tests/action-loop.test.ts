import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  calculateEffectiveCardCost,
  calculateEffectivePlayerMaxLife,
  forkGameState,
  initializeGame,
  listLegalActions,
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
import {
  loadCurrentRuntimeDataPack,
  validateExecutableDataPack,
} from "../src/engine/data.js";
import {
  executeMayhemEffects,
  gainDeadWizardToken,
  resolveWithinDeadWizardTokenResolutionBoundary,
} from "../src/engine/effect-runtime.js";
import {
  validateRuntimeEffectCatalogPayload,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";
import { addFixtureDefinitionToActiveHand } from "./helpers/fixture-cards.js";
import {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} from "./helpers/defense-fixtures.js";
import { replacePostSetupWizardPropertyFixture } from "./helpers/fixture-tokens.js";
import {
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
  toChoiceSelection,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";
import {
  buildControlledObjectView,
  movePhysicalCard,
  removeCardFromLocation,
} from "../src/engine/control-ledger.js";
import { drawDeckCard, shuffleDeck } from "../src/engine/deck-lifecycle.js";
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

test("late foe-deck cleanup errors stop playing after card placement", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 17101,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.deck.splice(0);
  const resolvedCard = givenRuntimeCard(scenario, {
    player: foe,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
  });
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        nonOngoingCleanupDestination: "ownerDiscard",
      },
    ],
  });

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(state, _player, _effect, source) {
            removeCardFromLocation(state, source.cardInstanceId);
            return { ok: true };
          },
        },
        () => play(scenario, card)
      ),
    new RegExp(`Cannot move resolved card ${resolvedCard.instanceId}`)
  );
  assert.equal(scenario.activePlayer.playedThisTurn.includes(card), true);
});

test("late foe-deck cleanup errors preserve a card moved by the effect", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 17104,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.deck.splice(0);
  const resolvedCard = givenRuntimeCard(scenario, {
    player: foe,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
  });
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        nonOngoingCleanupDestination: "ownerDiscard",
      },
    ],
  });

  assert.throws(
    () =>
      withTemporaryEffectRuntimeOperations(
        "add_power",
        {
          execute(state, _player, _effect, source) {
            const moved = removeCardFromLocation(state, source.cardInstanceId);
            assert.ok(moved);
            foe.deck.push(moved.card);
            return { ok: true };
          },
        },
        () => play(scenario, card)
      ),
    new RegExp(`Cannot move resolved card ${resolvedCard.instanceId}`)
  );
  assert.equal(scenario.activePlayer.playedThisTurn.includes(card), true);
  assert.equal(foe.deck.includes(resolvedCard), true);
  assert.equal(foe.discard.includes(resolvedCard), false);
});

test("play moves a resolved foe-deck card to its owner discard through the Ledger", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 17102,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.deck.splice(0);
  const resolvedCard = givenRuntimeCard(scenario, {
    player: foe,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
  });
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        nonOngoingCleanupDestination: "ownerDiscard",
      },
    ],
  });

  assert.deepEqual(play(scenario, card), { ok: true });
  assert.equal(foe.discard.includes(resolvedCard), true);
  assert.equal(
    scenario.activePlayer.playedThisTurn.includes(resolvedCard),
    false
  );
  const move = scenario.state.eventLog.find(
    (event) =>
      event.type === "cardMoved" &&
      event.cardInstanceId === resolvedCard.instanceId
  );
  assert.ok(move?.type === "cardMoved");
  assert.equal(move.playerId, scenario.activePlayer.playerId);
  assert.equal(move.definitionId, resolvedCard.definitionId);
  assert.equal(
    move.sourceZone,
    `${scenario.activePlayer.playerId}.playedThisTurn`
  );
  assert.equal(move.destinationZone, `${foe.playerId}.discard`);
  assert.equal(move.ownerBefore, foe.playerId);
  assert.equal(move.ownerAfter, foe.playerId);
});

test("play moves a resolved foe-deck card before returning game end", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 17103,
  });
  const foe = scenario.foes[0];
  assert.ok(foe);
  foe.deck.splice(0);
  const resolvedCard = givenRuntimeCard(scenario, {
    player: foe,
    zone: "deck",
    effects: [{ effectId: "add_power", timing: "onPlay", amount: 1 }],
  });
  const card = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        nonOngoingCleanupDestination: "ownerDiscard",
      },
    ],
  });

  const result = withTemporaryEffectRuntimeOperations(
    "add_power",
    {
      execute(_state, player) {
        return {
          ok: true,
          gameEnd: {
            reason: "playerDefeated",
            winnerPlayerId: player.playerId,
          },
        };
      },
    },
    () => play(scenario, card)
  );

  assert.deepEqual(result, {
    ok: true,
    gameEndReason: "playerDefeated",
    winnerPlayerId: scenario.activePlayer.playerId,
  });
  assert.equal(foe.discard.includes(resolvedCard), true);
  assert.equal(
    scenario.activePlayer.playedThisTurn.includes(resolvedCard),
    false
  );
});

test("Кондуктор Жми-На-Тормоза is a one-copy familiar that draws, matches every controlled card type, and redirects an avoided attack", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const familiarDefinition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_005"
  );
  assert.ok(familiarDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.familiarPool?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__familiar_005"
    ),
    { cardId: "esw2_dbg__familiar_005", count: 1 }
  );

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
  const familiar = activePlayer.unboughtFamiliars[0];
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

  const powerBeforeConditionalCard = state.turn.power;
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
  assert.equal(state.turn.power, powerBeforeConditionalCard + 1);

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
      ? toChoiceSelection(
          choices.find(
            (choice) =>
              choice.choiceKind === "defense" &&
              choice.targetCardInstanceId === familiar.instanceId
          )
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

test("redirected foreign Wand uses the redirecting player's DWT016 but not wizard property", () => {
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
  const scoreBeforeDwt = scoreGame(state).find(
    (score) => score.playerId === redirectingPlayer.playerId
  );
  assert.ok(scoreBeforeDwt);
  replaceFirstWizardProperty(
    state,
    redirectingPlayer,
    state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_009"
    ) as TokenDefinition
  );
  redirectingPlayer.deadWizardTokens.push({
    instanceId: markTokenInstanceId("fixture-dwt016-redirect"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_016"),
    ownerId: redirectingPlayer.playerId,
  });
  const wand = addRuntimeCardToHand(
    state,
    attackingPlayer,
    "esw2_dbg__starter_003"
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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === redirectingPlayer.playerId
      )
    );
  });
  const attackingLifeBefore = attackingPlayer.life.current;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.activePlayerId, attackingPlayer.playerId);
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
  assert.equal(redirectedAttack.amount, 5);
  const attackStarts = state.eventLog.filter(
    (event) =>
      event.type === "attackTargetStarted" &&
      event.cardInstanceId === wand.instanceId
  );
  assert.deepEqual(
    attackStarts.map((event) => event.amount),
    [1, 5]
  );
  assert.equal(
    scoreGame(state).find(
      (score) => score.playerId === redirectingPlayer.playerId
    )?.victoryPoints,
    scoreBeforeDwt.victoryPoints - 7
  );
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
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === redirector.playerId)
        )
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

test("Chipsychosis Arena of the original attacker does not reapply on a redirected leg", () => {
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
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === redirector.playerId)
        )
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
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === attacker.playerId)
        )
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
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === target.playerId)
        )
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
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === controller.playerId)
        )
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

  activePlayer.hand.splice(0);
  activePlayer.playedThisTurn.splice(0);
  activePlayer.permanents.splice(0);
  activePlayer.statuses.splice(0);
  activePlayer.permanents.push(
    createRuntimeCardInstance(
      activePlayer,
      "esw2_dbg__main_040",
      "modified-five"
    )
  );
  activePlayer.statuses.push({
    instanceId: markCardInstanceId("fixture-attack-effective-cost-modifier"),
    statusId: "fixture-attack-effective-cost-modifier",
    ownerId: activePlayer.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: 2,
        target: {
          targetType: "card",
          definitionId: "esw2_dbg__main_040",
        },
      }),
    ],
  });
  const modifiedCostSlippers = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_020"
  );
  targetPlayer.life.current = 20;
  lifeBefore = targetPlayer.life.current;
  result = applyAction(state, {
    type: "playCard",
    cardInstanceId: modifiedCostSlippers.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, lifeBefore - 7);
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "attackCreated" &&
        event.cardInstanceId === modifiedCostSlippers.instanceId &&
        event.definitionId === "esw2_dbg__main_020" &&
        event.amount === 7
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
    seed: 60615,
  });
  const markedInMarket: CardInstance = {
    instanceId: markCardInstanceId("fixture-marked-in-market"),
    definitionId: markCardDefinitionId("esw2_dbg__main_028"),
    ownerId: "common",
    marketChips: 0,
  };
  const markedMarketFlowCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-marked-market-flow"),
    definitionId: markCardDefinitionId("esw2_dbg__main_028"),
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

test("#287 fixed attack cards use their printed power and damage", () => {
  const cases = [
    { definitionId: "esw2_dbg__main_023", power: 2, amount: 7 },
    { definitionId: "esw2_dbg__main_028", power: 2, amount: 3 },
    { definitionId: "esw2_dbg__legend_003", power: 0, amount: 20 },
  ] as const;

  for (const testCase of cases) {
    const state = initializeGame({
      rootDir,
      seed: 287001,
      playerCount: 3,
    });
    const attacker = mustGetPlayer(state, markPlayerId("player-1"));
    state.activePlayerId = attacker.playerId;
    for (const player of state.players) {
      player.wizardProperties = [];
      player.life.current = testCase.amount === 20 ? 30 : 20;
    }
    state.turn.power = 0;
    attacker.hand = [];
    const attackCard = addRuntimeCardToHand(
      state,
      attacker,
      testCase.definitionId
    );

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attackCard.instanceId,
      }),
      { ok: true }
    );
    assert.equal(state.turn.power, testCase.power);
    for (const target of state.players.filter(
      (player) => player.playerId !== attacker.playerId
    )) {
      assert.equal(
        target.life.current,
        (testCase.amount === 20 ? 30 : 20) - testCase.amount
      );
    }
    assert.equal(
      state.eventLog.filter(
        (event) =>
          event.type === "attackTargetStarted" &&
          event.cardInstanceId === attackCard.instanceId
      ).length,
      2
    );
  }
});

test("#287 main_070 collects every defense decision before resolving ownerless damage", () => {
  const state = initializeGame({
    rootDir,
    seed: 287002,
    playerCount: 3,
  });
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_070");
  state.common.mainDeck.unshift(mayhem);
  state.common.market.splice(4);
  for (const player of state.players) {
    player.life.current = 20;
    player.wizardProperties = [];
  }

  assert.deepEqual(runMarketFlow(state, { mode: "turn" }), { ok: true });
  assert.equal(
    state.players.every((player) => player.life.current === 15),
    true
  );
  const decisionIndices = state.eventLog
    .map((event, index) =>
      event.type === "mayhemDecisionStarted" ? index : undefined
    )
    .filter((index): index is number => index !== undefined);
  const damageIndices = state.eventLog
    .map((event, index) =>
      event.type === "attackTargetStarted" &&
      event.definitionId === "esw2_dbg__main_070"
        ? index
        : undefined
    )
    .filter((index): index is number => index !== undefined);
  assert.equal(decisionIndices.length, 3);
  assert.equal(damageIndices.length, 3);
  assert.ok(Math.max(...decisionIndices) < Math.min(...damageIndices));
});

test("#293 mega Mayhem attacks for one snapshot of the highest legend market cost", () => {
  const state = initializeGame({ rootDir, seed: 293001, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  assert.equal(orderedPlayers.length, 3);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  for (const player of orderedPlayers) {
    player.life.current = 20;
    player.hand = [];
    player.wizardProperties = [];
  }

  const lowCostDefinition = createFixtureCardDefinition(
    "fixture-mega-market-low-cost",
    []
  );
  lowCostDefinition.engine.cost = 4;
  lowCostDefinition.visible.cost = 4;
  const highCostDefinition = createFixtureCardDefinition(
    "fixture-mega-market-high-cost",
    []
  );
  highCostDefinition.engine.cost = 9;
  highCostDefinition.visible.cost = 9;
  const megaMayhemDefinition = createFixtureCardDefinition(
    "fixture-mega-highest-market-cost",
    [
      {
        effectId: "mayhem_attack_equal_highest_card_cost",
        timing: "onMayhemResolve",
        targetSelector: "allPlayers",
        costSource: "legendMarket",
      },
    ],
    { cardKind: "megaMayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [lowCostDefinition.cardId, lowCostDefinition],
    [highCostDefinition.cardId, highCostDefinition],
    [megaMayhemDefinition.cardId, megaMayhemDefinition],
  ]);
  const lowCostCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mega-market-low"),
    definitionId: markCardDefinitionId(lowCostDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const highCostCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mega-market-high"),
    definitionId: markCardDefinitionId(highCostDefinition.cardId),
    ownerId: "common",
    marketChips: 99,
  };
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    lowCostCard,
    highCostCard
  );
  const megaMayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mega-highest-market-cost-card"),
    definitionId: markCardDefinitionId(megaMayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };

  const result = executeMayhemEffects(
    state,
    activePlayer,
    megaMayhemDefinition,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: megaMayhem.instanceId,
      definitionId: megaMayhem.definitionId,
    }
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    orderedPlayers.map((player) => player.life.current),
    [11, 11, 11]
  );
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "mayhemDecisionStarted" &&
          event.effectId === "mayhem_attack_equal_highest_card_cost" &&
          event.cardInstanceId === megaMayhem.instanceId
      )
      .map((event) => event.amount),
    [9, 9, 9]
  );

  state.common.legendMarket.splice(0);
  for (const player of orderedPlayers) {
    player.life.current = 20;
  }
  const emptyResult = executeMayhemEffects(
    state,
    activePlayer,
    megaMayhemDefinition,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: megaMayhem.instanceId,
      definitionId: megaMayhem.definitionId,
    }
  );

  assert.deepEqual(emptyResult, { ok: true });
  assert.deepEqual(
    orderedPlayers.map((player) => player.life.current),
    [20, 20, 20]
  );
});

test("#293 main Mayhem uses each hand's highest cost and resolves all defenses first", () => {
  const state = initializeGame({ rootDir, seed: 293002, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  assert.equal(orderedPlayers.length, 3);
  const [activePlayer, defendedPlayer, emptyHandPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(defendedPlayer);
  assert.ok(emptyHandPlayer);
  for (const player of orderedPlayers) {
    player.life.current = 20;
    player.hand = [];
    player.wizardProperties = [];
  }

  const lowCostDefinition = createFixtureCardDefinition(
    "fixture-mayhem-hand-low-cost",
    []
  );
  lowCostDefinition.engine.cost = 3;
  lowCostDefinition.visible.cost = 3;
  const highCostDefinition = createFixtureCardDefinition(
    "fixture-mayhem-hand-high-cost",
    []
  );
  highCostDefinition.engine.cost = 8;
  highCostDefinition.visible.cost = 8;
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-highest-hand-cost",
    [
      {
        effectId: "mayhem_attack_equal_highest_card_cost",
        timing: "onMayhemResolve",
        targetSelector: "allPlayers",
        costSource: "targetHand",
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
  activePlayer.hand.push(
    ...createFixtureCardInstances(
      lowCostDefinition.cardId,
      activePlayer.playerId,
      1
    )
  );
  defendedPlayer.hand.push(
    ...createFixtureCardInstances(
      highCostDefinition.cardId,
      defendedPlayer.playerId,
      1
    )
  );
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    defendedPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-highest-hand-cost-card"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };

  const result = executeMayhemEffects(state, activePlayer, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: activePlayer.playerId,
    cardInstanceId: mayhem.instanceId,
    definitionId: mayhem.definitionId,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    orderedPlayers.map((player) => player.life.current),
    [17, 20, 20]
  );
  assert.equal(defendedPlayer.discard.includes(defenseCard), true);
  const cardEvents = state.eventLog.filter(
    (event) =>
      event.effectId === "mayhem_attack_equal_highest_card_cost" &&
      event.cardInstanceId === mayhem.instanceId
  );
  assert.deepEqual(
    cardEvents
      .filter((event) => event.type === "mayhemDecisionStarted")
      .map((event) => [event.targetPlayerId, event.amount]),
    [
      [activePlayer.playerId, 3],
      [defendedPlayer.playerId, 8],
      [emptyHandPlayer.playerId, 0],
    ]
  );
  const decisionIndices = state.eventLog
    .map((event, index) =>
      event.type === "mayhemDecisionStarted" &&
      event.cardInstanceId === mayhem.instanceId
        ? index
        : undefined
    )
    .filter((index): index is number => index !== undefined);
  const damageIndices = state.eventLog
    .map((event, index) =>
      event.type === "attackTargetStarted" &&
      event.cardInstanceId === mayhem.instanceId
        ? index
        : undefined
    )
    .filter((index): index is number => index !== undefined);
  assert.equal(decisionIndices.length, 3);
  assert.equal(damageIndices.length, 2);
  assert.ok(Math.max(...decisionIndices) < Math.min(...damageIndices));
});

test("#293 current runtime cards execute their mapped global card-cost attacks", () => {
  const state = initializeGame({ rootDir, seed: 293003, playerCount: 3 });
  state.activePlayerId = markPlayerId("player-2");
  const orderedPlayers = getPlayersInActiveOrder(state);
  assert.equal(orderedPlayers.length, 3);
  const [activePlayer, secondPlayer, emptyHandPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(emptyHandPlayer);
  for (const player of orderedPlayers) {
    player.life.current = 20;
    player.hand = [];
    player.wizardProperties = [];
  }

  const marketCostDefinition = createFixtureCardDefinition(
    "fixture-runtime-mega-market-cost",
    []
  );
  marketCostDefinition.engine.cost = 7;
  marketCostDefinition.visible.cost = 7;
  const lowHandCostDefinition = createFixtureCardDefinition(
    "fixture-runtime-main-low-hand-cost",
    []
  );
  lowHandCostDefinition.engine.cost = 2;
  lowHandCostDefinition.visible.cost = 2;
  const highHandCostDefinition = createFixtureCardDefinition(
    "fixture-runtime-main-high-hand-cost",
    []
  );
  highHandCostDefinition.engine.cost = 6;
  highHandCostDefinition.visible.cost = 6;
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [marketCostDefinition.cardId, marketCostDefinition],
    [lowHandCostDefinition.cardId, lowHandCostDefinition],
    [highHandCostDefinition.cardId, highHandCostDefinition],
  ]);
  state.common.legendMarket.splice(0, state.common.legendMarket.length, {
    instanceId: markCardInstanceId("fixture-runtime-mega-market-cost-card"),
    definitionId: markCardDefinitionId(marketCostDefinition.cardId),
    ownerId: "common",
    marketChips: 100,
  });

  const megaMayhemDefinition = state.cardDefinitions.get(
    "esw2_dbg__mega_mayhem_001"
  );
  assert.ok(megaMayhemDefinition);
  const megaResult = executeMayhemEffects(
    state,
    activePlayer,
    megaMayhemDefinition,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: "fixture-runtime-mega-mayhem-001",
      definitionId: megaMayhemDefinition.cardId,
    }
  );
  assert.deepEqual(megaResult, { ok: true });
  assert.deepEqual(
    orderedPlayers.map((player) => player.life.current),
    [13, 13, 13]
  );

  for (const player of orderedPlayers) {
    player.life.current = 20;
  }
  activePlayer.hand.push(
    ...createFixtureCardInstances(
      lowHandCostDefinition.cardId,
      activePlayer.playerId,
      1
    )
  );
  secondPlayer.hand.push(
    ...createFixtureCardInstances(
      highHandCostDefinition.cardId,
      secondPlayer.playerId,
      1
    )
  );
  const mainMayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_078");
  assert.ok(mainMayhemDefinition);
  const mainResult = executeMayhemEffects(
    state,
    activePlayer,
    mainMayhemDefinition,
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: "fixture-runtime-main-078",
      definitionId: mainMayhemDefinition.cardId,
    }
  );
  assert.deepEqual(mainResult, { ok: true });
  assert.deepEqual(
    orderedPlayers.map((player) => player.life.current),
    [18, 14, 20]
  );
});

test("#294 legend_017 draws every wizard, randomly discards two cards, and attacks without defense", () => {
  const createScenario = (seed: number) => {
    const scenario = createGameScenario({
      rootDir,
      seed,
      playerCount: 3,
    });
    const state = scenario.state;
    state.activePlayerId = markPlayerId("player-1");
    state.turn.power = 100;
    const orderedPlayers = getPlayersInActiveOrder(state);
    assert.equal(orderedPlayers.length, 3);

    for (const player of orderedPlayers) {
      player.hand = [];
      player.deck = [];
      player.discard = [];
      player.permanents = [];
      player.playedThisTurn = [];
      player.wizardProperties = [];
      player.statuses = [];
      player.life.current = 20;
    }

    const drawDefinition = createFixtureCardDefinition(
      "fixture-294-draw-card",
      []
    );
    const lowCostDefinition = createFixtureCardDefinition(
      "fixture-294-low-cost-card",
      []
    );
    lowCostDefinition.engine.cost = 3;
    lowCostDefinition.visible.cost = 3;
    const highCostDefinition = createFixtureCardDefinition(
      "fixture-294-high-cost-card",
      []
    );
    highCostDefinition.engine.cost = 8;
    highCostDefinition.visible.cost = 8;
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [drawDefinition.cardId, drawDefinition],
      [lowCostDefinition.cardId, lowCostDefinition],
      [highCostDefinition.cardId, highCostDefinition],
    ]);

    const [activePlayer, firstFoe, secondFoe] = orderedPlayers;
    assert.ok(activePlayer);
    assert.ok(firstFoe);
    assert.ok(secondFoe);
    for (const player of orderedPlayers) {
      player.deck.push(
        ...createFixtureCardInstances(drawDefinition.cardId, player.playerId, 2)
      );
    }
    firstFoe.hand.push(
      ...createFixtureCardInstances(
        lowCostDefinition.cardId,
        firstFoe.playerId,
        2
      ),
      ...createFixtureCardInstances(
        highCostDefinition.cardId,
        firstFoe.playerId,
        1
      )
    );
    secondFoe.hand.push(
      ...createFixtureCardInstances(
        highCostDefinition.cardId,
        secondFoe.playerId,
        2
      ),
      ...createFixtureCardInstances(
        lowCostDefinition.cardId,
        secondFoe.playerId,
        1
      )
    );
    addFixtureDefenseCardToHand(state, firstFoe, "discardSelf");

    const attackCard = givenRuntimeCard(scenario, {
      definitionId: "esw2_dbg__legend_017",
    });
    state.effectChoiceStrategy = (request) => {
      assert.notEqual(
        request.effectId,
        "avoid_attack",
        "an unavoidable attack must not open a defense choice"
      );
      return undefined;
    };

    return { scenario, attackCard, orderedPlayers };
  };

  const first = createScenario(294001);
  assert.equal(play(first.scenario, first.attackCard).ok, true);
  const second = createScenario(294001);
  assert.equal(play(second.scenario, second.attackCard).ok, true);

  const firstState = first.scenario.state;
  const secondState = second.scenario.state;
  const firstDrawEvents = firstState.eventLog.filter(
    (event) =>
      event.type === "effectDrawCardsApplied" &&
      event.definitionId === "esw2_dbg__legend_017"
  );
  assert.deepEqual(
    firstDrawEvents.map((event) => [event.playerId, event.amount]),
    first.orderedPlayers.map((player) => [player.playerId, 2])
  );

  const firstDiscardEvents = firstState.eventLog.filter(
    (event) =>
      event.type === "effectCardDiscarded" &&
      event.effectId === "attack_damage_equal_random_discarded_hand_cost" &&
      event.cardInstanceId === first.attackCard.instanceId
  );
  assert.deepEqual(
    firstDiscardEvents.map((event) => event.playerId),
    first.orderedPlayers
      .slice(1)
      .flatMap((player) => [player.playerId, player.playerId])
  );

  const expectedDamageByPlayer = new Map<string, number>();
  for (const event of firstDiscardEvents) {
    assert.ok(event.playerId);
    assert.ok(event.targetDefinitionId);
    const definition = firstState.cardDefinitions.get(event.targetDefinitionId);
    assert.ok(definition);
    expectedDamageByPlayer.set(
      event.playerId,
      (expectedDamageByPlayer.get(event.playerId) ?? 0) + definition.engine.cost
    );
  }
  const firstAttackEvents = firstState.eventLog.filter(
    (event) =>
      event.type === "attackTargetStarted" &&
      event.cardInstanceId === first.attackCard.instanceId
  );
  assert.deepEqual(
    firstAttackEvents.map((event) => event.targetPlayerId),
    first.orderedPlayers.slice(1).map((player) => player.playerId)
  );
  assert.deepEqual(
    firstAttackEvents.map((event) => event.amount),
    first.orderedPlayers
      .slice(1)
      .map((player) => expectedDamageByPlayer.get(player.playerId) ?? 0)
  );
  assert.equal(
    firstState.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === first.attackCard.instanceId
    ),
    false
  );

  const snapshot = (state: GameState, source: CardInstance) => ({
    discarded: state.eventLog
      .filter(
        (event) =>
          event.type === "effectCardDiscarded" &&
          event.effectId === "attack_damage_equal_random_discarded_hand_cost" &&
          event.cardInstanceId === source.instanceId
      )
      .map((event) => [event.playerId, event.targetCardInstanceId]),
    attacks: state.eventLog
      .filter(
        (event) =>
          event.type === "attackTargetStarted" &&
          event.cardInstanceId === source.instanceId
      )
      .map((event) => [event.targetPlayerId, event.amount]),
  });
  assert.deepEqual(
    snapshot(firstState, first.attackCard),
    snapshot(secondState, second.attackCard)
  );
});

test("#294 legend_017 handles empty and incomplete hands and can kill a foe", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 294002,
    playerCount: 2,
  });
  const state = scenario.state;
  state.activePlayerId = markPlayerId("player-1");
  state.turn.power = 100;
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, foe] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(foe);
  for (const player of orderedPlayers) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.permanents = [];
    player.playedThisTurn = [];
    player.wizardProperties = [];
    player.statuses = [];
  }
  activePlayer.life.current = 20;
  foe.life.current = 3;

  const drawDefinition = createFixtureCardDefinition(
    "fixture-294-incomplete-draw-card",
    []
  );
  const lethalDefinition = createFixtureCardDefinition(
    "fixture-294-lethal-discard-card",
    []
  );
  lethalDefinition.engine.cost = 10;
  lethalDefinition.visible.cost = 10;
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [drawDefinition.cardId, drawDefinition],
    [lethalDefinition.cardId, lethalDefinition],
  ]);
  activePlayer.deck.push(
    ...createFixtureCardInstances(
      drawDefinition.cardId,
      activePlayer.playerId,
      2
    )
  );
  foe.hand.push(
    ...createFixtureCardInstances(lethalDefinition.cardId, foe.playerId, 1)
  );
  const attackCard = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_017",
  });
  state.effectChoiceStrategy = (request) => {
    assert.notEqual(request.effectId, "avoid_attack");
    return undefined;
  };

  const result = play(scenario, attackCard);
  assert.equal(result.ok, true);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectDrawCardsApplied" &&
          event.definitionId === "esw2_dbg__legend_017"
      )
      .map((event) => [event.playerId, event.amount]),
    [
      [activePlayer.playerId, 2],
      [foe.playerId, 0],
    ]
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectCardDiscarded" &&
        event.effectId === "attack_damage_equal_random_discarded_hand_cost"
    ).length,
    1
  );
  assert.ok(
    state.eventLog.some(
      (event) => event.type === "playerDied" && event.playerId === foe.playerId
    )
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" &&
        event.cardInstanceId === attackCard.instanceId
    ),
    false
  );
});

test("#295 main_069 collects all defenses before discarding half of controlled permanents", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 295001,
    playerCount: 4,
  });
  const state = scenario.state;
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, defendedPlayer, emptyPlayer, oddPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(defendedPlayer);
  assert.ok(emptyPlayer);
  assert.ok(oddPlayer);
  for (const player of orderedPlayers) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.permanents = [];
    player.playedThisTurn = [];
    player.wizardProperties = [];
    player.statuses = [];
  }

  const addOngoing = (player: PlayerState, cardId: string): CardInstance =>
    givenRuntimeCard(scenario, {
      player,
      zone: "permanents",
      cardId,
      effects: [],
      isOngoing: true,
    });
  addOngoing(activePlayer, "fixture-295-active-permanent-1");
  addOngoing(activePlayer, "fixture-295-active-permanent-2");
  addOngoing(defendedPlayer, "fixture-295-defended-permanent-1");
  addOngoing(defendedPlayer, "fixture-295-defended-permanent-2");
  addOngoing(defendedPlayer, "fixture-295-defended-permanent-3");
  addOngoing(oddPlayer, "fixture-295-odd-permanent-1");
  addOngoing(oddPlayer, "fixture-295-odd-permanent-2");
  addOngoing(oddPlayer, "fixture-295-odd-permanent-3");
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    defendedPlayer,
    "discardSelf"
  );
  const source = givenRuntimeCard(scenario, {
    player: activePlayer,
    zone: "playedThisTurn",
    definitionId: "esw2_dbg__main_069",
  });
  const definition = state.cardDefinitions.get("esw2_dbg__main_069");
  assert.ok(definition);
  const choiceRequests: Array<{
    effectId: string;
    playerId: string;
  }> = [];
  state.effectChoiceStrategy = (request) => {
    if (request.requestKind !== "effect") return undefined;
    choiceRequests.push({
      effectId: request.effectId,
      playerId: request.player.playerId,
    });
    if (
      request.effectId === "avoid_attack" &&
      request.player.playerId === defendedPlayer.playerId
    ) {
      return selectFirstFixtureDefense(request);
    }
    return undefined;
  };

  assert.deepEqual(
    executeMayhemEffects(state, activePlayer, definition, {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: source.instanceId,
      definitionId: source.definitionId,
    }),
    { ok: true }
  );

  assert.equal(activePlayer.permanents.length, 1);
  assert.equal(defendedPlayer.permanents.length, 3);
  assert.equal(emptyPlayer.permanents.length, 0);
  assert.equal(oddPlayer.permanents.length, 1);
  assert.equal(defendedPlayer.discard.includes(defenseCard), true);
  assert.deepEqual(
    choiceRequests
      .filter(
        ({ effectId }) =>
          effectId === "mayhem_each_player_discard_half_controlled_permanents"
      )
      .map(({ playerId }) => playerId),
    [activePlayer.playerId, oddPlayer.playerId]
  );
  const decisionIndices = state.eventLog
    .map((event, index) =>
      event.type === "mayhemDecisionStarted" &&
      event.effectId === "mayhem_each_player_discard_half_controlled_permanents"
        ? index
        : undefined
    )
    .filter((index): index is number => index !== undefined);
  const resolutionIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "mayhemResolutionPhaseStarted" &&
      event.effectId === "mayhem_each_player_discard_half_controlled_permanents"
  );
  const discardIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "effectCardDiscarded" &&
      event.effectId === "mayhem_each_player_discard_half_controlled_permanents"
  );
  assert.equal(decisionIndices.length, 4);
  assert.ok(Math.max(...decisionIndices) < resolutionIndex);
  assert.ok(resolutionIndex < discardIndex);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "mayhemTargetSkipped" &&
        event.targetPlayerId === defendedPlayer.playerId &&
        event.effectId ===
          "mayhem_each_player_discard_half_controlled_permanents"
    ),
    true
  );
});

test("#295 main_069 preserves ownership and releases temporary control", () => {
  const scenario = createGameScenario({
    rootDir,
    seed: 295002,
    playerCount: 2,
  });
  const state = scenario.state;
  const [activePlayer, owner] = getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(owner);
  for (const player of [activePlayer, owner]) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.permanents = [];
    player.playedThisTurn = [];
    player.wizardProperties = [];
    player.statuses = [];
  }
  const temporarilyControlled = givenRuntimeCard(scenario, {
    player: owner,
    zone: "playedThisTurn",
    cardId: "fixture-295-temporary-permanent",
    effects: [
      {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 5,
      },
    ],
    isOngoing: true,
  });
  givenTemporaryControl(scenario, temporarilyControlled, activePlayer);
  state.turn.power = 5;
  state.turn.controlledPowerBonus = 5;
  const source = givenRuntimeCard(scenario, {
    player: activePlayer,
    zone: "playedThisTurn",
    definitionId: "esw2_dbg__main_069",
  });
  const definition = state.cardDefinitions.get("esw2_dbg__main_069");
  assert.ok(definition);
  state.effectChoiceStrategy = (request) => {
    if (
      request.effectId !==
      "mayhem_each_player_discard_half_controlled_permanents"
    ) {
      return undefined;
    }
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "cardTarget" &&
        candidate.targetCardInstanceIds.includes(
          temporarilyControlled.instanceId
        )
    );
    return choice === undefined ? undefined : { choiceId: choice.choiceId };
  };

  assert.deepEqual(
    executeMayhemEffects(state, activePlayer, definition, {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: activePlayer.playerId,
      cardInstanceId: source.instanceId,
      definitionId: source.definitionId,
    }),
    { ok: true }
  );

  assert.equal(owner.discard.includes(temporarilyControlled), true);
  assert.equal(
    state.common.destroyedPile.includes(temporarilyControlled),
    false
  );
  assert.equal(temporarilyControlled.ownerId, owner.playerId);
  assert.equal(state.turn.power, 0);
  assert.equal(state.turn.controlledPowerBonus, 0);
  assert.equal(
    state.turn.temporaryCardControls.some(
      (control) => control.cardInstanceId === temporarilyControlled.instanceId
    ),
    false
  );
  assert.equal(owner.playedThisTurn.includes(temporarilyControlled), false);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectCardDiscarded" &&
        event.effectId ===
          "mayhem_each_player_discard_half_controlled_permanents" &&
        event.targetCardInstanceId === temporarilyControlled.instanceId
    ),
    true
  );
});

test("#287 main_024 can defend by discarding itself and drawing one card", () => {
  const state = initializeGame({ rootDir, seed: 287003 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  const defense = addRuntimeCardToHand(state, defender, "esw2_dbg__main_024");
  const drawnCard = defender.deck[0];
  assert.ok(drawnCard);
  const attackCard = createRuntimeCardInstance(
    attacker,
    "esw2_dbg__main_024",
    "attack-main-024"
  );
  attacker.hand.push(attackCard);
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "attack_damage") {
      return { choiceId: defender.playerId };
    }
    if (effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };
  const lifeBefore = defender.life.current;

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 2);
  assert.equal(defender.life.current, lifeBefore);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.hand.includes(drawnCard), true);
});

test("#287 starter_004 returns discard cards before the gained DWT face", () => {
  const dataPack = createWizardPropertySetupEntriesDataPack(
    createExpandedDeadWizardTokenSetupDataPack(
      loadCurrentRuntimeDataPack(rootDir),
      40
    ),
    [{ tokenId: "esw2_dbg__wizard_property_009", count: 4 }]
  );
  const state = initializeGame({ dataPack, seed: 287004 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    if (player.playerId !== attacker.playerId) {
      player.wizardProperties = [];
    }
  }
  const wizardProperty009 = state.tokenDefinitions.get(
    "esw2_dbg__wizard_property_009"
  );
  assert.ok(wizardProperty009);
  replaceFirstWizardProperty(state, attacker, wizardProperty009);
  attacker.hand = [];
  attacker.discard = [];
  attacker.life.current = 1;
  const returnedCards = attacker.deck.splice(0, 2);
  attacker.discard.push(...returnedCards);
  const token = {
    instanceId: markTokenInstanceId("fixture-starter-004-dwt"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
    ownerId: "common" as const,
  };
  state.common.deadWizardTokens.drawStack = [token];
  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__starter_004");
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return { choiceId: attacker.playerId };
    }
    if (effectId === "return_discard_to_hand") {
      const choice = choices.find(
        (candidate) =>
          candidate.choiceKind === "cardTarget" && candidate.amount === 2
      );
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    return undefined;
  };

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: wand.instanceId }),
    { ok: true }
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
  for (const card of returnedCards) {
    assert.equal(attacker.hand.includes(card), true);
  }
  const returnIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "effectCardsReturnedToHand" &&
      event.definitionId === "esw2_dbg__starter_004"
  );
  const faceIndex = state.eventLog.findIndex(
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.tokenDefinitionId === "esw2_dbg__dead_wizard_token_015"
  );
  assert.ok(returnIndex >= 0);
  assert.ok(faceIndex >= 0);
  assert.ok(returnIndex < faceIndex);
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

test("megaMayhem keeps a main-deck card when its destroy destination is invalid", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = state.players[0];
  assert.ok(player);
  const megaMayhemDefinition = createFixtureCardDefinition(
    "fixture-mega-mayhem-destroy-top-invalid-destination",
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
    [megaMayhemDefinition.cardId, megaMayhemDefinition],
  ]);
  const unresolvedCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-main-deck-missing-definition"),
    definitionId: markCardDefinitionId("fixture-missing-definition"),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.mainDeck.splice(0, state.common.mainDeck.length, unresolvedCard);

  const result = executeMayhemEffects(state, player, megaMayhemDefinition, {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId(
      "fixture-mega-mayhem-destroy-top-invalid-destination-instance"
    ),
    definitionId: markCardDefinitionId(megaMayhemDefinition.cardId),
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Missing target card definition fixture-missing-definition",
  });
  assert.deepEqual(state.common.mainDeck, [unresolvedCard]);
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

test("Mayhem preserves discarded cards when every affected player chooses destroy none", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60616,
    playerCount: 2,
  });
  const [activePlayer, foe] = getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(foe);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-mayhem-destroy-none-normal",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-destroy-none",
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
    instanceId: markCardInstanceId("fixture-mayhem-destroy-none-active"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  const foeTopDeckCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-destroy-none-foe"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  activePlayer.deck.splice(0, activePlayer.deck.length, activeTopDeckCard);
  foe.deck.splice(0, foe.deck.length, foeTopDeckCard);

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-destroy-none-instance"),
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
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (
      effectId !==
      "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
    ) {
      return undefined;
    }
    assert.deepEqual(
      choices.map((choice) => choice.choiceId),
      ["destroy_both", "destroy_none"]
    );
    return toChoiceSelection(
      choices.find((choice) => choice.choiceId === "destroy_none")
    );
  };

  const result = runMarketFlow(state, { mode: "turn" });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.discard.includes(activeTopDeckCard), true);
  assert.equal(foe.discard.includes(foeTopDeckCard), true);
  assert.equal(state.common.destroyedPile.includes(activeTopDeckCard), false);
  assert.equal(state.common.destroyedPile.includes(foeTopDeckCard), false);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId ===
            "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
      )
      .map((event) => event.choiceId),
    ["destroy_none", "destroy_none"]
  );
});

test("Mayhem falls back for the second invalid destroy choice before moving cards", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60617,
    playerCount: 2,
  });
  const [activePlayer, foe] = getPlayersInActiveOrder(state);
  assert.ok(activePlayer);
  assert.ok(foe);

  const normalDefinition = createFixtureCardDefinition(
    "fixture-mayhem-invalid-destroy-choice-normal",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-mayhem-invalid-destroy-choice",
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
    instanceId: markCardInstanceId(
      "fixture-mayhem-invalid-destroy-choice-active"
    ),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: activePlayer.playerId,
    marketChips: 0,
  };
  const foeTopDeckCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-mayhem-invalid-destroy-choice-foe"),
    definitionId: markCardDefinitionId(normalDefinition.cardId),
    ownerId: foe.playerId,
    marketChips: 0,
  };
  activePlayer.deck.splice(0, activePlayer.deck.length, activeTopDeckCard);
  activePlayer.discard.splice(0);
  foe.deck.splice(0, foe.deck.length, foeTopDeckCard);
  foe.discard.splice(0);
  state.common.destroyedPile.splice(0);

  const mayhem: CardInstance = {
    instanceId: markCardInstanceId(
      "fixture-mayhem-invalid-destroy-choice-instance"
    ),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.effectChoiceStrategy = ({ effectId, player, choices }) => {
    if (
      effectId !==
      "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
    ) {
      return undefined;
    }
    if (player.playerId === activePlayer.playerId) {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "destroy_both")
      );
    }
    return { choiceId: "invalid_destroy_choice" };
  };
  const nextRandomBefore = state.rng.fork().next();

  const result = executeMayhemEffects(state, activePlayer, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: activePlayer.playerId,
    cardInstanceId: mayhem.instanceId,
    definitionId: mayhem.definitionId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(activePlayer.deck, []);
  assert.deepEqual(activePlayer.discard, []);
  assert.deepEqual(foe.deck, []);
  assert.deepEqual(foe.discard, []);
  assert.deepEqual(state.common.destroyedPile, [
    activeTopDeckCard,
    foeTopDeckCard,
  ]);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId ===
            "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none"
      )
      .map((event) => event.choiceId),
    ["destroy_both", "destroy_both"]
  );
  assert.equal(state.rng.fork().next(), nextRandomBefore);
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
    return toChoiceSelection(
      choices.find(
        (choice) => choice.choiceId === `vote-${secondPlayer.playerId}`
      )
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
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "spend_chips")
      );
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
  const neutralTokens = state.common.deadWizardTokens.drawStack.filter(
    (token) => token.definitionId === "esw2_dbg__dead_wizard_token_neutral"
  );
  assert.equal(neutralTokens.length >= 2, true);
  state.common.deadWizardTokens.drawStack = [
    ...neutralTokens.slice(0, 2),
    ...state.common.deadWizardTokens.drawStack.filter(
      (token) => token.definitionId !== "esw2_dbg__dead_wizard_token_neutral"
    ),
    ...neutralTokens.slice(2),
  ];
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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === targetPlayer.playerId
      )
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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === targetPlayer.playerId
      )
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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === targetPlayer.playerId
      )
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

test("unsupported Mayhem effect is rejected at Runtime Data Intake", () => {
  const errors = validateFixtureEffectAtIntake("fixture-unsupported-mayhem", {
    effectId: "unsupported_mayhem_runtime_effect",
    timing: "onMayhemResolve",
  } as unknown as RuntimeEffect);

  assert.ok(
    errors.some((error) =>
      error.includes(
        "uses unsupported effect id unsupported_mayhem_runtime_effect"
      )
    ),
    errors.join("\n")
  );
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
  const familiar = activePlayer.unboughtFamiliars[0];
  assert.ok(familiar);

  assert.equal(familiar.definitionId, "esw2_dbg__familiar_001");
  assert.equal(familiar.ownerId, activePlayer.playerId);
  assert.equal(findOwnedCard(activePlayer, familiar.definitionId), undefined);
  assert.equal(
    foe.unboughtFamiliars.some(
      (candidate) => candidate.instanceId === familiar.instanceId
    ),
    false
  );
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
  assert.equal(activePlayer.unboughtFamiliars.includes(familiar), false);
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
  const familiar = targetPlayer.unboughtFamiliars[0];
  assert.ok(familiar);
  const paidDiscard = targetPlayer.hand[0];
  assert.ok(paidDiscard);
  targetPlayer.unboughtFamiliars = targetPlayer.unboughtFamiliars.filter(
    (candidate) => candidate.instanceId !== familiar.instanceId
  );
  familiar.ownerId = targetPlayer.playerId;
  targetPlayer.hand.push(familiar);
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "avoid_attack"
      ? toChoiceSelection(
          choices.find(
            (choice) =>
              choice.choiceKind === "defense" &&
              choice.targetCardInstanceId === familiar.instanceId
          )
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
  const familiar = targetPlayer.unboughtFamiliars[0];
  assert.ok(familiar);
  targetPlayer.hand.splice(0);
  targetPlayer.unboughtFamiliars = targetPlayer.unboughtFamiliars.filter(
    (candidate) => candidate.instanceId !== familiar.instanceId
  );
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
    effectId === "wild_magic_choice" ? toChoiceSelection(choices[0]) : undefined
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

test("DWT 020 suppresses only its controller's Basic Trophy payout", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 62020,
  });
  const firstPlayer = mustGetPlayer(state, state.activePlayerId);
  const secondPlayer = state.players.find(
    (player) => player.playerId !== firstPlayer.playerId
  );
  assert.ok(secondPlayer);
  firstPlayer.trophyLikeObjects.push(createBasicTrophy(firstPlayer.playerId));
  firstPlayer.deadWizardTokens.push({
    instanceId: markTokenInstanceId("fixture-dwt020"),
    definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_020"),
    ownerId: firstPlayer.playerId,
  });

  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(state.turn.number, 2);
  assert.equal(firstPlayer.chips, 0);

  const trophy = firstPlayer.trophyLikeObjects.pop();
  assert.ok(trophy);
  trophy.ownerId = secondPlayer.playerId;
  secondPlayer.trophyLikeObjects.push(trophy);
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(state.turn.number, 3);
  assert.equal(secondPlayer.chips, 1);
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

test("wizard property activation payload is rejected at Runtime Data Intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Token fixture-malformed-activation-property.engine.effects[0]",
    "gain_chips",
    { effectId: "gain_chips", timing: "onPlay", amount: "invalid" },
    "combat",
    "wizardProperty"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
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

test("Wizard Property 007 counts only spells gained by its controller this turn", () => {
  const state = initializeGame({
    rootDir,
    seed: 60707,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const otherPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(otherPlayer);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_007");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, activePlayer, property);

  const creature = addFixtureMarketCard(
    state,
    "fixture-wp007-active-creature",
    ["creature"],
    0
  );
  const foreignSpell = createCommonRuntimeCard("esw2_dbg__legend_014");
  state.common.legendMarket.push(foreignSpell);
  state.turn.power = 12;
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      source: "mainMarket",
      cardInstanceId: creature.instanceId,
    }).ok,
    true
  );

  state.activePlayerId = otherPlayer.playerId;
  state.turn.power = 12;
  assert.equal(
    applyAction(state, {
      type: "buyMarketCard",
      source: "legendMarket",
      cardInstanceId: foreignSpell.instanceId,
    }).ok,
    true
  );
  assert.deepEqual(
    state.turn.gainedCards.map((record) => record.playerId),
    [activePlayer.playerId, otherPlayer.playerId]
  );

  state.activePlayerId = activePlayer.playerId;
  const result = applyAction(state, { type: "endTurn" });

  assert.equal(result.ok, true);
  const drawEvent = [...state.eventLog]
    .reverse()
    .find(
      (event) =>
        event.type === "handDrawn" && event.playerId === activePlayer.playerId
    );
  assert.ok(drawEvent?.type === "handDrawn");
  assert.equal(drawEvent.amount, 5);
});

test("свойство 001 после получения Волшебника даёт чипсину и позволяет лошаре снять статус", () => {
  for (const [choiceId, remainsDingler] of [
    ["apply", false],
    ["decline", true],
  ] as const) {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: 305001,
    });
    const player = mustGetPlayer(state, state.activePlayerId);
    const property = state.tokenDefinitions.get(
      "esw2_dbg__wizard_property_001"
    );
    assert.equal(property?.kind, "wizardProperty");
    if (property?.kind !== "wizardProperty") return;
    replaceFirstWizardProperty(state, player, property);
    player.chips = 0;
    player.statuses = [
      {
        instanceId: markCardInstanceId(`fixture-dingler-${choiceId}`),
        statusId: "dingler",
        ownerId: player.playerId,
        effects: [],
      },
    ];
    const wizard = addFixtureMarketCard(
      state,
      `fixture-wizard-property-001-${choiceId}`,
      ["wizardCard"],
      0
    );
    state.effectChoiceStrategy = ({ effectId, choices }) =>
      effectId === "remove_status"
        ? toChoiceSelection(
            choices.find((choice) => choice.choiceId === choiceId)
          )
        : undefined;

    assert.deepEqual(
      applyAction(state, {
        type: "buyMarketCard",
        source: "mainMarket",
        cardInstanceId: wizard.instanceId,
      }),
      { ok: true }
    );

    assert.equal(player.chips, 1);
    assert.equal(
      player.statuses.some((status) => status.statusId === "dingler"),
      remainsDingler
    );
    assert.ok(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "remove_status" &&
          event.choiceId === choiceId &&
          event.choiceIds.join(",") === "apply,decline"
      )
    );
  }

  const normalState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 3050011,
  });
  const normalPlayer = mustGetPlayer(normalState, normalState.activePlayerId);
  const property = normalState.tokenDefinitions.get(
    "esw2_dbg__wizard_property_001"
  );
  assert.equal(property?.kind, "wizardProperty");
  if (property?.kind !== "wizardProperty") return;
  replaceFirstWizardProperty(normalState, normalPlayer, property);
  normalPlayer.chips = 0;
  normalPlayer.statuses = [];
  const wizard = addFixtureMarketCard(
    normalState,
    "fixture-wizard-property-001-normal",
    ["wizardCard"],
    0
  );
  assert.deepEqual(
    applyAction(normalState, {
      type: "buyMarketCard",
      source: "mainMarket",
      cardInstanceId: wizard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(normalPlayer.chips, 1);
  assert.equal(
    normalState.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "remove_status" &&
        "choiceIds" in event &&
        event.choiceIds?.join(",") === "apply,decline"
    ),
    false
  );
});

test("wizard property on-gain payload is rejected at Runtime Data Intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Token fixture-malformed-on-gain-property.engine.effects[0]",
    "topdeck_gained_card",
    {
      effectId: "topdeck_gained_card",
      timing: "onPlayCard",
      optional: true,
      cardTypes: ["creature"],
    },
    "combat",
    "wizardProperty"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /timing must be onGainCard/);
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
  secondSpell.definitionId = firstSpell.definitionId;
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
  assert.deepEqual(
    state.turn.gainedCards.map((record) => record.definitionId),
    [firstSpell.definitionId, firstSpell.definitionId, creature.definitionId]
  );
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);

  assert.equal(activePlayer.hand.length, 7);
  assert.deepEqual(state.turn.gainedCards, []);
});

test("temporary hand limit modifier payload is rejected at Runtime Data Intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Token fixture-invalid-hand-limit-property.engine.effects[0]",
    "temporary_hand_limit_by_gained_card_type",
    {
      effectId: "temporary_hand_limit_by_gained_card_type",
      timing: "endTurn",
      amount: -1,
      cardTypes: ["spell"],
    },
    "combat",
    "wizardProperty"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /amount must be a positive integer/);
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

test("Wizard Property 008 grants one chip on first permanent play, not activation", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60808,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_008");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);

  const definition = createFixtureCardDefinition(
    "fixture-wp008-activation",
    [
      { effectId: "add_power", timing: "onPlay", amount: 1 },
      { effectId: "add_power", timing: "activation", amount: 2 },
    ],
    { isOngoing: true }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card = addFixtureDefinitionToActiveHand(state, definition);

  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId })
      .ok,
    true
  );
  assert.equal(player.chips, 1);
  assert.equal(
    applyAction(state, {
      type: "activatePermanent",
      cardInstanceId: card.instanceId,
    }).ok,
    true
  );
  assert.equal(player.chips, 1);
  assert.equal(state.turn.power, 3);
});

test("fixed-discard gain cannot be redirected by Wizard Property 008", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60809,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_008");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);
  const gainedCard = addFixtureMarketCard(
    state,
    "fixture-wp008-fixed-discard-permanent",
    [],
    0
  );
  state.common.market.splice(0, state.common.market.length, gainedCard);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [
      gainedCard.definitionId,
      createFixtureCardDefinition(gainedCard.definitionId, [], {
        isOngoing: true,
      }),
    ],
  ]);
  state.effectChoiceStrategy = ({ effectId }) => {
    assert.notEqual(effectId, "topdeck_gained_card");
    return undefined;
  };
  const gainCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
    timing: "onPlay",
    target: { selector: "mainMarketCard" },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: gainCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(
    state.players
      .find((candidate) => candidate.playerId === player.playerId)
      ?.discard.includes(gainedCard),
    true
  );
  assert.equal(player.discard.includes(gainedCard), true);
  assert.equal(player.deck.includes(gainedCard), false);
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
    "cardBought",
    "deckTop"
  );
  assertGainedMovementGuarantees(
    gainState,
    gained.player,
    gained.card,
    "effectCardGained",
    "discard"
  );
});

test("Wizard Property 006 lets the player decline topdecking a gained creature", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_006");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);

  const definition = createFixtureCardDefinition(
    "fixture-declined-creature",
    [],
    {
      cardTypes: ["creature"],
    }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card = createCommonRuntimeCard(definition.cardId);
  state.common.market.splice(0, state.common.market.length, card);

  let choiceRequested = false;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "topdeck_gained_card") {
      return undefined;
    }
    choiceRequested = true;
    assert.deepEqual(
      choices.map((choice) => choice.choiceId),
      ["apply", "decline"]
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "topdeck_gained_card"
      ),
      false
    );
    return toChoiceSelection(choices[1]);
  };

  const result = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(choiceRequested, true);
  assert.equal(player.deck.includes(card), false);
  assert.equal(player.discard.includes(card), true);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "topdeck_gained_card" &&
        event.choiceId === "decline" &&
        event.choiceIds.join(",") === "apply,decline"
    )
  );
});

test("Wizard Property 006 topdecks a gained real Legend-Creature when applied", () => {
  const state = initializeGame({
    rootDir,
    seed: 60616,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_006");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);

  const card = createCommonRuntimeCard("esw2_dbg__legend_005");
  state.common.market.splice(0, state.common.market.length, card);
  state.turn.power = 10;
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "topdeck_gained_card"
      ? toChoiceSelection(choices.find((choice) => choice.choiceId === "apply"))
      : undefined;

  const result = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(player.deck[0], card);
  assert.equal(player.discard.includes(card), false);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "topdeck_gained_card" &&
        event.playerId === player.playerId &&
        event.choiceId === "apply"
    )
  );
});

test("Wizard Property 006 cannot redirect a fixed-discard gain of a real Legend-Creature", () => {
  const state = initializeGame({
    rootDir,
    seed: 60617,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_006");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);

  const card = createCommonRuntimeCard("esw2_dbg__legend_005");
  state.common.market.splice(0, state.common.market.length, card);
  let topdeckChoiceRequested = false;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "topdeck_gained_card") {
      topdeckChoiceRequested = true;
    }
    return undefined;
  };
  const gainCardId = addFixtureCardToActiveHand(state, {
    effectId: "gain_card",
    timing: "onPlay",
    target: { selector: "mainMarketCard" },
    destination: "discard",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: gainCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(topdeckChoiceRequested, false);
  assert.equal(player.discard.includes(card), true);
  assert.equal(player.deck.includes(card), false);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "topdeck_gained_card"
    ),
    false
  );
});

test("Зад в будущее предлагает взять с обычной барахолки карту на руку", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const zadVFutureshe = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__legend_031"
  );
  const mainMarketCard = addFixtureMarketCard(
    state,
    "fixture-zad-v-buduschee-main-market",
    [],
    0
  );

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: zadVFutureshe.instanceId,
  });
  assert.equal(playResult.ok, true);

  let choiceRequested = false;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "optional_gain_market_cards_to_hand_this_turn") {
      return undefined;
    }
    choiceRequested = true;
    assert.deepEqual(
      choices.map((choice) => choice.choiceId),
      ["apply", "decline"]
    );
    return toChoiceSelection(choices[0]);
  };

  const buyResult = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: mainMarketCard.instanceId,
  });

  assert.equal(buyResult.ok, true);
  assert.equal(choiceRequested, true);
  assert.equal(player.hand.includes(mainMarketCard), true);
  assert.equal(player.discard.includes(mainMarketCard), false);
});

test("Зад в будущее не меняет получение карты с барахолки легенд", () => {
  const state = initializeGame({
    rootDir,
    seed: 60615,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  state.turn.power = 99;
  const zadVFutureshe = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__legend_031"
  );
  const legendMarketCard = state.common.legendMarket[0];
  assert.ok(legendMarketCard);

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: zadVFutureshe.instanceId,
  });
  assert.equal(playResult.ok, true);

  state.effectChoiceStrategy = ({ effectId }) => {
    assert.notEqual(effectId, "optional_gain_market_cards_to_hand_this_turn");
    return undefined;
  };
  const buyResult = applyAction(state, {
    type: "buyMarketCard",
    source: "legendMarket",
    cardInstanceId: legendMarketCard.instanceId,
  });

  assert.equal(buyResult.ok, true);
  assert.equal(player.hand.includes(legendMarketCard), false);
  assert.equal(player.discard.includes(legendMarketCard), true);
});

test("Сувернирный ларёк предлагает положить полученную легенду на верх колоды", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  state.turn.power = 99;
  const suvenirnyiLarek = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__main_008"
  );
  const legendMarketCard = state.common.legendMarket[0];
  assert.ok(legendMarketCard);

  const playResult = applyAction(state, {
    type: "playCard",
    cardInstanceId: suvenirnyiLarek.instanceId,
  });
  assert.equal(playResult.ok, true);
  assert.equal(player.permanents.includes(suvenirnyiLarek), true);

  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "topdeck_gained_card") {
      return undefined;
    }
    return toChoiceSelection(choices[0]);
  };
  const buyResult = applyAction(state, {
    type: "buyMarketCard",
    source: "legendMarket",
    cardInstanceId: legendMarketCard.instanceId,
  });

  assert.equal(buyResult.ok, true);
  assert.equal(player.deck[0], legendMarketCard);
  assert.equal(player.discard.includes(legendMarketCard), false);
});

test("Мыжсемья и Эпичный мерч суммируют скидки на легенды текущего хода", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const myZheSemya = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_007"
  );
  const epichnyiMerch = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__main_044"
  );
  const legendMarketCard = state.common.legendMarket[0];
  assert.ok(legendMarketCard);
  const legendDefinition = state.cardDefinitions.get(
    legendMarketCard.definitionId
  );
  assert.ok(legendDefinition);

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: myZheSemya.instanceId,
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: epichnyiMerch.instanceId,
    }).ok,
    true
  );
  assert.equal(state.turn.power, 2);
  assert.equal(
    calculateEffectiveCardCost(state, player.playerId, legendDefinition),
    Math.max(0, legendDefinition.engine.cost - 4)
  );
});

test("защита Мыжсемья сбрасывает карту, избегает атаку и добирает две карты", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const attacker = mustGetPlayer(state, state.activePlayerId);
  const target = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(target);
  const myZheSemya = addRuntimeCardToHand(
    state,
    target,
    "esw2_dbg__familiar_007"
  );
  const targetLifeBefore = target.life.current;
  const targetHandBefore = target.hand.length;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === target.playerId)
      );
    }
    if (effectId === "avoid_attack") {
      return toChoiceSelection(
        choices.find(
          (choice) =>
            choice.choiceKind === "defense" &&
            choice.targetCardInstanceId === myZheSemya.instanceId
        )
      );
    }
    return undefined;
  });
  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(target.life.current, targetLifeBefore);
  assert.equal(target.hand.includes(myZheSemya), false);
  assert.equal(target.discard.includes(myZheSemya), true);
  assert.equal(target.hand.length, targetHandBefore + 1);
});

test("свойство волшебника 003 позволяет считать своего фамильяра легендой", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_003");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);
  const epichnyiMerch = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__main_044"
  );
  const familiarDefinition = state.cardDefinitions.get(
    "esw2_dbg__familiar_007"
  );
  assert.ok(familiarDefinition);
  const familiar = createRuntimeCardInstance(
    player,
    "esw2_dbg__familiar_007",
    "familiar-effective-type"
  );
  player.unboughtFamiliars.push(familiar);
  state.turn.power = 0;
  player.chips = familiarDefinition.engine.cost;
  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: familiar.instanceId,
      cardType: "legend",
      enabled: true,
    }),
    { ok: true }
  );
  assert.deepEqual(
    applyAction(state, {
      type: "buyMarketCard",
      cardInstanceId: familiar.instanceId,
      source: "familiar",
    }),
    { ok: true }
  );
  assert.equal(player.discard.includes(familiar), true);
  assert.equal(state.turn.power, 0);
  assert.equal(player.chips, 0);

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: epichnyiMerch.instanceId,
    }).ok,
    true
  );
  assert.equal(
    calculateEffectiveCardCost(
      state,
      player.playerId,
      familiarDefinition,
      familiar
    ),
    familiarDefinition.engine.cost - 2
  );
  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: familiar.instanceId,
      cardType: "legend",
      enabled: false,
    }),
    { ok: true }
  );
  assert.equal(
    calculateEffectiveCardCost(
      state,
      player.playerId,
      familiarDefinition,
      familiar
    ),
    familiarDefinition.engine.cost
  );
  assert.ok(
    listLegalActions(state).some(
      (action) =>
        action.type === "setCardEffectiveType" &&
        action.cardInstanceId === familiar.instanceId &&
        action.cardType === "legend" &&
        action.enabled
    )
  );
});

test("атака по стоимости контролируемой карты учитывает выбранный effective type фамильяра", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const targetPlayer = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(targetPlayer);

  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_003");
  assert.ok(property);
  player.hand = [];
  player.permanents = [];
  player.playedThisTurn = [];
  player.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-wp003-attack-cost"),
      definitionId: markTokenDefinitionId(property.tokenId),
      ownerId: player.playerId,
    },
  ];

  const familiarDefinition = state.cardDefinitions.get(
    "esw2_dbg__familiar_007"
  );
  assert.ok(familiarDefinition);
  const familiar = createRuntimeCardInstance(
    player,
    familiarDefinition.cardId,
    "effective-type-attack-cost-familiar"
  );
  player.permanents.push(familiar);

  assert.deepEqual(
    applyAction(state, {
      type: "setCardEffectiveType",
      cardInstanceId: familiar.instanceId,
      cardType: "legend",
      enabled: true,
    }),
    { ok: true }
  );

  const attack = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-effective-type-cost-attack", [
      {
        effectId: "attack_damage_equal_to_controlled_card_cost",
        timing: "onPlay",
        costMode: "highest",
        target: { selector: "opponentPlayer" },
      },
    ])
  );
  const targetLifeBefore = targetPlayer.life.current;

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attack.instanceId,
    }).ok,
    true
  );
  assert.equal(targetPlayer.life.current, targetLifeBefore - 4);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.effectId === "attack_damage_equal_to_controlled_card_cost" &&
        event.amount === 4
    )
  );
});

test("Wizard Property 006 and 008 apply topdecking after the player chooses apply", () => {
  const cases = [
    {
      propertyId: "esw2_dbg__wizard_property_006",
      cardId: "fixture-applied-creature",
      cardTypes: ["creature"],
      isOngoing: false,
    },
    {
      propertyId: "esw2_dbg__wizard_property_008",
      cardId: "fixture-applied-permanent",
      cardTypes: [],
      isOngoing: true,
    },
  ] as const;

  for (const testCase of cases) {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: 60615,
    });
    const player = mustGetPlayer(state, state.activePlayerId);
    const property = state.tokenDefinitions.get(testCase.propertyId);
    assert.ok(property);
    assert.equal(property.kind, "wizardProperty");
    replaceFirstWizardProperty(state, player, property);
    const definition = createFixtureCardDefinition(testCase.cardId, [], {
      cardTypes: [...testCase.cardTypes],
      isOngoing: testCase.isOngoing,
    });
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [definition.cardId, definition],
    ]);
    const card = createCommonRuntimeCard(definition.cardId);
    state.common.market.splice(0, state.common.market.length, card);
    state.effectChoiceStrategy = ({ effectId, choices }) =>
      effectId === "topdeck_gained_card"
        ? toChoiceSelection(choices[0])
        : undefined;

    const result = applyAction(state, {
      type: "buyMarketCard",
      source: "mainMarket",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(player.deck[0], card);
    assert.ok(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "topdeck_gained_card" &&
          event.choiceId === "apply" &&
          event.choiceIds.join(",") === "apply,decline"
      )
    );
  }
});

test("mandatory topdeck replacement applies without offering a decline", () => {
  const cases = [
    { optional: false, suffix: "false" },
    { optional: "omitted", suffix: "omitted" },
  ] as const;
  for (const { optional, suffix } of cases) {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: 60615,
    });
    const player = mustGetPlayer(state, state.activePlayerId);
    replaceFirstWizardProperty(
      state,
      player,
      createTopdeckOnGainWizardProperty(
        `fixture-mandatory-topdeck-${suffix}`,
        ["creature"],
        optional
      )
    );
    const card = addFixtureMarketCard(
      state,
      `fixture-mandatory-topdeck-card-${suffix}`,
      ["creature"],
      0
    );
    state.effectChoiceStrategy = ({ effectId }) => {
      assert.notEqual(effectId, "topdeck_gained_card");
      return undefined;
    };

    const result = applyAction(state, {
      type: "buyMarketCard",
      source: "mainMarket",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(player.deck[0], card);
    assert.equal(player.discard.includes(card), false);
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "topdeck_gained_card"
      ),
      false
    );
  }
});

test("Wizard Property 008 lets the player decline topdecking a gained permanent", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_008");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);
  const definition = createFixtureCardDefinition(
    "fixture-declined-permanent",
    [],
    {
      isOngoing: true,
    }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card = createCommonRuntimeCard(definition.cardId);
  state.common.market.splice(0, state.common.market.length, card);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "topdeck_gained_card"
      ? toChoiceSelection(choices[1])
      : undefined;

  const result = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(player.deck.includes(card), false);
  assert.equal(player.discard.includes(card), true);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "topdeck_gained_card" &&
        event.choiceId === "decline" &&
        event.choiceIds.join(",") === "apply,decline"
    )
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

test("reveal_top_card taking a real Wizard runs the gain lifecycle once", () => {
  const state = initializeGame({
    rootDir,
    seed: 337001,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_001");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);
  player.chips = 0;

  const wizard = createCommonRuntimeCard("esw2_dbg__main_006");
  player.deck.unshift(wizard);
  const revealCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    optionalTakeToHand: true,
  });
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "reveal_top_card"
      ? toChoiceSelection(choices.find((choice) => choice.choiceId === "take"))
      : undefined;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: revealCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(player.hand.filter((card) => card === wizard).length, 1);
  assert.equal(player.deck.includes(wizard), false);
  assert.equal(player.chips, 1);
  assert.deepEqual(state.turn.gainedCards, [
    {
      playerId: player.playerId,
      definitionId: wizard.definitionId,
      cardInstanceId: wizard.instanceId,
    },
  ]);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectChipsGained" &&
        event.effectId === "gain_chips" &&
        event.cardInstanceId === player.wizardProperties[0]?.instanceId &&
        event.definitionId === property.tokenId &&
        event.sourceType === "wizardProperty"
    ).length,
    1
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectCardGained" &&
        event.effectId === "reveal_top_card" &&
        event.targetCardInstanceId === wizard.instanceId
    ).length,
    1
  );
  const move = state.eventLog.find(
    (event) =>
      event.type === "cardMoved" && event.cardInstanceId === wizard.instanceId
  );
  assert.ok(move?.type === "cardMoved");
  assert.equal(move.effectId, "reveal_top_card");
  assert.equal(move.sourceType, "card");
});

test("reveal_top_card validates gain hooks before taking the revealed card", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 337004,
  });
  const player = scenario.activePlayer;
  player.hand.splice(0);
  const invalidGainCard = givenRuntimeCard(scenario, {
    zone: "deck",
    effects: [
      {
        effectId: "discard_card",
        timing: "onGain",
        targetSelector: "activePlayerHandCard",
        emptyChoice: "fail",
      },
    ],
  });
  player.deck.splice(player.deck.indexOf(invalidGainCard), 1);
  player.deck.unshift(invalidGainCard);
  const revealCard = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        optionalTakeToHand: true,
      },
    ],
  });
  let choiceRequests = 0;
  scenario.state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "reveal_top_card") {
      choiceRequests += 1;
      return { choiceId: "take" };
    }
    return undefined;
  };
  const expectedNextRandom = scenario.state.rng.fork().next();
  const gainedCards = scenario.state.turn.gainedCards;
  const eventLog = scenario.state.eventLog;

  const result = play(scenario, revealCard);
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected reveal_top_card gain preflight to fail");
  }
  assert.match(result.error, /timing.*onGain|does not support timing/);

  assert.equal(choiceRequests, 0);
  assert.equal(player.hand.includes(revealCard), true);
  assert.equal(player.deck[0], invalidGainCard);
  assert.equal(player.hand.includes(invalidGainCard), false);
  assert.equal(scenario.state.turn.gainedCards, gainedCards);
  assert.deepEqual(gainedCards, []);
  assert.equal(scenario.state.eventLog, eventLog);
  assert.equal(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "effectCardRevealed" &&
        event.targetCardInstanceId === invalidGainCard.instanceId
    ),
    false
  );
  assert.equal(scenario.state.rng.next(), expectedNextRandom);
});

test("reveal_top_card preflight checks multiple taken reveals in deck order", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 337006,
  });
  const player = scenario.activePlayer;
  player.hand.splice(0);
  player.deck.splice(0);
  player.discard.splice(0);
  const firstGainCard = givenRuntimeCard(scenario, {
    zone: "deck",
    effects: [],
  });
  const invalidGainCard = givenRuntimeCard(scenario, {
    zone: "deck",
    effects: [
      {
        effectId: "discard_card",
        timing: "onGain",
        targetSelector: "activePlayerHandCard",
        emptyChoice: "fail",
      },
    ],
  });
  const revealCard = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        optionalTakeToHand: true,
      },
      {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        optionalTakeToHand: true,
      },
    ],
  });
  scenario.state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "reveal_top_card" ? { choiceId: "take" } : undefined;
  const expectedNextRandom = scenario.state.rng.fork().next();
  const eventLog = scenario.state.eventLog;

  const result = play(scenario, revealCard);

  assert.equal(result.ok, false);
  assert.equal(player.hand.includes(revealCard), true);
  assert.deepEqual(player.deck, [firstGainCard, invalidGainCard]);
  assert.deepEqual(player.discard, []);
  assert.equal(scenario.state.eventLog, eventLog);
  assert.deepEqual(scenario.state.turn.gainedCards, []);
  assert.equal(scenario.state.rng.next(), expectedNextRandom);
});

test("reveal_top_card preflight does not shuffle an empty deck on gain failure", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 337005,
  });
  const player = scenario.activePlayer;
  player.hand.splice(0);
  player.deck.splice(0);
  player.discard.splice(0);
  const invalidGainCard = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [
      {
        effectId: "discard_card",
        timing: "onGain",
        targetSelector: "activePlayerHandCard",
        emptyChoice: "fail",
      },
    ],
  });
  const secondInvalidGainCard = givenRuntimeCard(scenario, {
    zone: "discard",
    effects: [
      {
        effectId: "discard_card",
        timing: "onGain",
        targetSelector: "activePlayerHandCard",
        emptyChoice: "fail",
      },
    ],
  });
  const revealCard = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "reveal_top_card",
        timing: "onPlay",
        source: "activePlayerDeck",
        optionalTakeToHand: true,
      },
    ],
  });
  const expectedNextRandom = scenario.state.rng.fork().next();
  const discard = player.discard;
  const deck = player.deck;
  const eventLog = scenario.state.eventLog;

  const result = play(scenario, revealCard);

  assert.equal(result.ok, false);
  assert.equal(player.hand.includes(revealCard), true);
  assert.equal(player.deck, deck);
  assert.equal(player.discard, discard);
  assert.deepEqual(player.discard, [invalidGainCard, secondInvalidGainCard]);
  assert.deepEqual(player.deck, []);
  assert.equal(scenario.state.eventLog, eventLog);
  assert.equal(scenario.state.rng.next(), expectedNextRandom);
});

test("reveal_top_card taking a real Spell contributes to the gained-card hand limit", () => {
  const state = initializeGame({
    rootDir,
    seed: 337002,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_007");
  assert.ok(property);
  assert.equal(property.kind, "wizardProperty");
  replaceFirstWizardProperty(state, player, property);
  player.hand.splice(0);

  const spell = createCommonRuntimeCard("esw2_dbg__main_001");
  player.deck.unshift(spell);
  const revealCardId = addFixtureCardToActiveHand(state, {
    effectId: "reveal_top_card",
    timing: "onPlay",
    source: "activePlayerDeck",
    optionalTakeToHand: true,
  });
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "reveal_top_card"
      ? toChoiceSelection(choices.find((choice) => choice.choiceId === "take"))
      : undefined;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: revealCardId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.turn.gainedCards, [
    {
      playerId: player.playerId,
      definitionId: spell.definitionId,
      cardInstanceId: spell.instanceId,
    },
  ]);
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  const drawEvent = [...state.eventLog]
    .reverse()
    .find(
      (event) =>
        event.type === "handDrawn" && event.playerId === player.playerId
    );
  assert.ok(drawEvent?.type === "handDrawn");
  assert.equal(drawEvent.amount, 6);
});

test("reveal_top_card keeps the hand destination for real Creature and Ongoing cards", () => {
  const cases = [
    {
      propertyId: "esw2_dbg__wizard_property_006",
      cardId: "esw2_dbg__main_016",
    },
    {
      propertyId: "esw2_dbg__wizard_property_008",
      cardId: "esw2_dbg__main_006",
    },
  ] as const;

  for (const [index, testCase] of cases.entries()) {
    const state = initializeGame({
      rootDir,
      seed: 337003 + index,
    });
    const player = mustGetPlayer(state, state.activePlayerId);
    const property = state.tokenDefinitions.get(testCase.propertyId);
    assert.ok(property);
    assert.equal(property.kind, "wizardProperty");
    replaceFirstWizardProperty(state, player, property);

    const card = createCommonRuntimeCard(testCase.cardId);
    player.deck.unshift(card);
    const revealCardId = addFixtureCardToActiveHand(state, {
      effectId: "reveal_top_card",
      timing: "onPlay",
      source: "activePlayerDeck",
      optionalTakeToHand: true,
    });
    let topdeckChoiceRequested = false;
    state.effectChoiceStrategy = ({ effectId, choices }) => {
      if (effectId === "topdeck_gained_card") {
        topdeckChoiceRequested = true;
      }
      return effectId === "reveal_top_card"
        ? toChoiceSelection(
            choices.find((choice) => choice.choiceId === "take")
          )
        : undefined;
    };

    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: revealCardId,
    });

    assert.equal(result.ok, true);
    assert.equal(
      player.hand.filter((candidate) => candidate === card).length,
      1
    );
    assert.equal(player.deck.includes(card), false);
    assert.deepEqual(state.turn.gainedCards, [
      {
        playerId: player.playerId,
        definitionId: card.definitionId,
        cardInstanceId: card.instanceId,
      },
    ]);
    assert.equal(topdeckChoiceRequested, false);
  }
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

test("wizard property resurrection life override respects Dingler cap", () => {
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
    instanceId: markCardInstanceId("fixture-dingler-status"),
    statusId: "dingler",
    ownerId: propertyOwner.playerId,
    effects: [
      verifiedTestRuntimeEffect({
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: -10,
        target: { targetType: "player" },
      }),
    ],
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
  assert.equal(propertyOwner.life.current, 15);
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
      return toChoiceSelection(
        choices.find(
          (choice) => choice.choiceId === secondControlled.instanceId
        )
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

test("#316 wizard property 009 replaces a real starter and buffs its temporary controller's attack", () => {
  const dataPack = createWizardPropertySetupEntriesDataPack(
    createExpandedDeadWizardTokenSetupDataPack(
      loadCurrentRuntimeDataPack(rootDir),
      40
    ),
    [{ tokenId: "esw2_dbg__wizard_property_009", count: 4 }]
  );
  const scenario = createGameScenario({
    dataPack,
    seed: 316009,
    playerCount: 2,
  });
  const state = scenario.state;
  const propertyOwner = state.players.find((player) =>
    player.wizardProperties.some(
      (property) => property.definitionId === "esw2_dbg__wizard_property_009"
    )
  );
  assert.ok(propertyOwner);
  const controller = state.players.find(
    (player) => player.playerId !== propertyOwner.playerId
  );
  assert.ok(controller);
  const ownedCards = [
    ...propertyOwner.hand,
    ...propertyOwner.deck,
    ...propertyOwner.discard,
    ...propertyOwner.playedThisTurn,
    ...propertyOwner.permanents,
  ];
  assert.equal(
    ownedCards.filter((card) => card.definitionId === "esw2_dbg__starter_004")
      .length,
    1
  );
  assert.equal(
    ownedCards.filter((card) => card.definitionId === "esw2_dbg__starter_001")
      .length,
    5
  );

  const wand = findOwnedCard(propertyOwner, "esw2_dbg__starter_004");
  assert.ok(wand);
  const moved = movePhysicalCard(
    state,
    wand.instanceId,
    `${controller.playerId}.hand`,
    "front"
  );
  assert.equal(moved.ok, true);
  givenTemporaryControl(scenario, wand, controller);
  propertyOwner.life.current = 20;
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    propertyOwner,
    "discardSelf"
  );
  state.activePlayerId = controller.playerId;

  assert.deepEqual(play(scenario, wand), { ok: true });
  assert.equal(propertyOwner.life.current, 18);
  assert.equal(propertyOwner.hand.includes(defenseCard), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackCreated" &&
        event.effectId === "attack_damage" &&
        event.amount === 2
    ),
    true
  );
});

test("#316 wizard property 009 uses ownership and tags instead of names", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 316010,
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

  const foreignWand = addRuntimeCardToHand(
    state,
    targetPlayer,
    "esw2_dbg__starter_004"
  );
  const movedForeignWand = movePhysicalCard(
    state,
    foreignWand.instanceId,
    `${propertyOwner.playerId}.hand`,
    "front"
  );
  assert.equal(movedForeignWand.ok, true);
  const foreignDefense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: foreignWand.instanceId,
    }),
    { ok: true }
  );
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(foreignDefense), true);

  const nameOnlyDefinition = createFixtureCardDefinition(
    "fixture-name-only-wand-attack",
    [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 1,
        targetSelector: "chosenFoe",
      },
    ]
  );
  nameOnlyDefinition.visible.nameRu = "Палочка без устойчивого тега";
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [nameOnlyDefinition.cardId, nameOnlyDefinition],
  ]);
  const nameOnlyWand = createRuntimeCardInstance(
    propertyOwner,
    nameOnlyDefinition.cardId,
    "fixture-name-only-wand"
  );
  propertyOwner.hand.push(nameOnlyWand);
  const nameOnlyDefense = addFixtureDefenseCardToHand(
    state,
    targetPlayer,
    "discardSelf"
  );
  chooseFirstFixtureDefense(state);
  targetPlayer.life.current = 20;

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: nameOnlyWand.instanceId,
    }),
    { ok: true }
  );
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(targetPlayer.discard.includes(nameOnlyDefense), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
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
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === modifierOwner.playerId)
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
    return effectId === "wild_magic_choice"
      ? toChoiceSelection(choices.at(-1))
      : undefined;
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
      return toChoiceSelection(choices.at(-1));
    }
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find(
          (choice) =>
            choice.choiceKind === "playerTarget" &&
            choice.choiceId === wandOwner.playerId
        )
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
  const expectedReturnChoiceIds = [
    `return_2_${firstDiscard.instanceId}_${secondDiscard.instanceId}`,
    `return_1_${firstDiscard.instanceId}`,
    `return_1_${secondDiscard.instanceId}`,
    "return_0",
  ];
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === "effectChoiceSelected" &&
        event.effectId === "return_discard_to_hand" &&
        event.choiceId === expectedReturnChoiceIds[0] &&
        event.choiceIds?.join(",") === expectedReturnChoiceIds.join(",") &&
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
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-losharocka-neutral-dwt"),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common",
    },
  ];
  const wand = addRuntimeCardToHand(state, activePlayer, "esw2_dbg__main_030");
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? {
          choiceId:
            choices.find((choice) => choice.choiceId === activePlayer.playerId)
              ?.choiceId ?? "",
        }
      : undefined;

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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === targetPlayer.playerId
      )
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
  const neutralDeadWizardToken = state.common.deadWizardTokens.drawStack.find(
    (token) => token.definitionId === "esw2_dbg__dead_wizard_token_neutral"
  );
  assert.ok(neutralDeadWizardToken);
  state.common.deadWizardTokens.drawStack = [neutralDeadWizardToken];
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
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceId === "pay_optional_cost" ||
          choice.choiceId === activePlayer.playerId
      )
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
    return toChoiceSelection(
      choices.find((choice) => choice.choiceId === "skip_optional_cost")
    );
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

test("attack_damage pays discard, chips, and nonlethal life costs before attacking", () => {
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
  activePlayer.chips = 2;
  activePlayer.life.current = 5;
  const paidDiscard = activePlayer.hand[0];
  assert.ok(paidDiscard);
  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: { selector: "opponentPlayer" },
    costs: [
      { costId: "discard_other_hand_card", amount: 1 },
      { costId: "spend_chips", amount: 2 },
      { costId: "pay_life", amount: 4 },
    ],
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.chips, 0);
  assert.equal(activePlayer.life.current, 1);
  assert.equal(activePlayer.hand.includes(paidDiscard), false);
  assert.equal(activePlayer.discard.includes(paidDiscard), true);
  assert.equal(targetPlayer.life.current, 16);
});

test("attack_damage leaves all costs untouched when cumulative chips are insufficient", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 60615,
  });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  activePlayer.chips = 3;
  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: { selector: "opponentPlayer" },
    costs: [
      { costId: "spend_chips", amount: 2 },
      { costId: "spend_chips", amount: 2 },
    ],
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.deepEqual(result, { ok: false, error: "Cannot pay chip cost" });
  assert.equal(activePlayer.chips, 3);
  assert.equal(
    state.eventLog.some((event) => event.type === "effectCostPaid"),
    false
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "attackCreated"),
    false
  );
});

test("optional attack offers payment for a payable life cost", () => {
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
  activePlayer.life.current = 5;
  chooseEffectChoiceWithFirstFixtureDefense(state, ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === "pay_optional_cost")
        )
      : undefined
  );
  const attackCardId = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 4,
    target: { selector: "opponentPlayer" },
    optional: true,
    costs: [{ costId: "pay_life", amount: 4 }],
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCardId,
  });

  assert.equal(result.ok, true);
  assert.equal(activePlayer.life.current, 1);
  assert.equal(targetPlayer.life.current, 16);
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
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-potny-buzzing-wand-dwt"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
  ];
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

test("#287 directional chain continues after a kill with an empty DWT stack", () => {
  const state = initializeGame({ rootDir, seed: 60616, playerCount: 3 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const nextTargetPlayer = mustGetPlayer(state, markPlayerId("player-3"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.life.current = 20;
    player.hand = [];
    player.discard = [];
  }
  targetPlayer.life.current = 1;
  nextTargetPlayer.life.current = 20;
  state.common.deadWizardTokens.drawStack = [];
  state.turn.power = 99;
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
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(nextTargetPlayer.life.current, 10);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    2
  );
});

test("#287 directional chain wraps after a full circle", () => {
  const state = initializeGame({ rootDir, seed: 606161, playerCount: 3 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const firstTarget = mustGetPlayer(state, markPlayerId("player-2"));
  const secondTarget = mustGetPlayer(state, markPlayerId("player-3"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.life.current = 20;
    player.hand = [];
    player.discard = [];
  }
  firstTarget.life.current = 1;
  secondTarget.life.current = 1;
  state.common.deadWizardTokens.drawStack = [];
  state.turn.power = 99;
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
  assert.equal(firstTarget.life.current, 10);
  assert.equal(secondTarget.life.current, 20);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    3
  );
});

test("#288 legend_019 attacks each unique adjacent foe with separate defense windows", () => {
  const state = initializeGame({
    rootDir,
    seed: 60617,
    playerCount: 4,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const leftFoe = mustGetPlayer(state, markPlayerId("player-2"));
  const distantFoe = mustGetPlayer(state, markPlayerId("player-3"));
  const rightFoe = mustGetPlayer(state, markPlayerId("player-4"));
  state.activePlayerId = activePlayer.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.life.current = 20;
  }
  addFixtureDefenseCardToHand(state, leftFoe, "discardSelf");
  chooseFirstFixtureDefense(state);
  const legend = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_019"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: legend.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 5);
  assert.equal(leftFoe.life.current, 20);
  assert.equal(distantFoe.life.current, 20);
  assert.equal(rightFoe.life.current, 10);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === legend.instanceId
    ).length,
    2
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "attackAvoided" &&
        event.targetPlayerId === leftFoe.playerId
    )
  );
});

test("#288 main_018 attacks the only foe once in a two-player game", () => {
  const state = initializeGame({
    rootDir,
    seed: 60618,
    playerCount: 2,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 20;
  const attackCard = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_018"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(targetPlayer.life.current, 13);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === attackCard.instanceId
    ).length,
    1
  );
});

test("#288 main_021 lets the target choose a hand card after an unavoided hit", () => {
  const state = initializeGame({
    rootDir,
    seed: 60619,
    playerCount: 3,
  });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 20;
  targetPlayer.hand = [];
  const keptCard = addRuntimeCardToHand(
    state,
    targetPlayer,
    "esw2_dbg__main_001"
  );
  const discardedCard = addRuntimeCardToHand(
    state,
    targetPlayer,
    "esw2_dbg__main_002"
  );
  let discardChooser: string | undefined;
  state.effectChoiceStrategy = (request) => {
    if (request.requestKind !== "effect") {
      return undefined;
    }
    if (request.effectId === "attack_damage") {
      return { choiceId: targetPlayer.playerId };
    }
    if (request.effectId === "attack_discard_cards") {
      discardChooser = request.player.playerId;
      return { choiceId: discardedCard.instanceId };
    }
    return undefined;
  };
  const attackCard = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__main_021"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attackCard.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 2);
  assert.equal(targetPlayer.life.current, 16);
  assert.equal(discardChooser, targetPlayer.playerId);
  assert.equal(targetPlayer.hand.includes(keptCard), true);
  assert.equal(targetPlayer.hand.includes(discardedCard), false);
  assert.equal(targetPlayer.discard.includes(discardedCard), true);
});

test("#288 main_021 cancels its discard on avoidance and discards the redirected target's card", () => {
  const avoidedState = initializeGame({
    rootDir,
    seed: 60620,
    playerCount: 2,
  });
  const avoidedAttacker = mustGetPlayer(avoidedState, markPlayerId("player-1"));
  const avoidedTarget = mustGetPlayer(avoidedState, markPlayerId("player-2"));
  avoidedState.activePlayerId = avoidedAttacker.playerId;
  avoidedAttacker.wizardProperties = [];
  avoidedTarget.wizardProperties = [];
  avoidedTarget.hand = [];
  const avoidedCard = addRuntimeCardToHand(
    avoidedState,
    avoidedTarget,
    "esw2_dbg__main_001"
  );
  addFixtureDefenseCardToHand(avoidedState, avoidedTarget, "discardSelf");
  chooseFirstFixtureDefense(avoidedState);
  const avoidedAttack = addRuntimeCardToHand(
    avoidedState,
    avoidedAttacker,
    "esw2_dbg__main_021"
  );

  assert.equal(
    applyAction(avoidedState, {
      type: "playCard",
      cardInstanceId: avoidedAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(avoidedTarget.life.current, 20);
  assert.equal(avoidedTarget.hand.includes(avoidedCard), true);
  assert.equal(avoidedTarget.discard.includes(avoidedCard), false);

  const redirectedState = initializeGame({
    rootDir,
    seed: 60621,
    playerCount: 2,
  });
  const redirectedAttacker = mustGetPlayer(
    redirectedState,
    markPlayerId("player-1")
  );
  const redirectingTarget = mustGetPlayer(
    redirectedState,
    markPlayerId("player-2")
  );
  redirectedState.activePlayerId = redirectedAttacker.playerId;
  redirectedAttacker.wizardProperties = [];
  redirectingTarget.wizardProperties = [];
  redirectedAttacker.hand = [];
  redirectingTarget.hand = [];
  const redirectedCard = addRuntimeCardToHand(
    redirectedState,
    redirectedAttacker,
    "esw2_dbg__main_001"
  );
  const originalTargetCard = addRuntimeCardToHand(
    redirectedState,
    redirectingTarget,
    "esw2_dbg__main_002"
  );
  addFixtureDefenseCardToHand(
    redirectedState,
    redirectingTarget,
    "discardSelf",
    { redirectAttack: true }
  );
  chooseFirstFixtureDefense(redirectedState);
  const redirectedAttack = addRuntimeCardToHand(
    redirectedState,
    redirectedAttacker,
    "esw2_dbg__main_021"
  );

  assert.equal(
    applyAction(redirectedState, {
      type: "playCard",
      cardInstanceId: redirectedAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(redirectingTarget.hand.includes(originalTargetCard), true);
  assert.equal(redirectedAttacker.hand.includes(redirectedCard), false);
  assert.equal(redirectedAttacker.discard.includes(redirectedCard), true);
});

test("#289 legend_024 wins when its original target is killed", () => {
  const state = initializeGame({ rootDir, seed: 60622, playerCount: 2 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  targetPlayer.life.current = 1;
  state.common.deadWizardTokens.drawStack = [];
  state.turn.power = 99;
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_024"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "playerDefeated");
  assert.equal(result.winnerPlayerId, activePlayer.playerId);
  assert.equal(targetPlayer.life.current, 20);
});

test("#289 legend_024 does not win when a redirect kills another wizard", () => {
  const state = initializeGame({ rootDir, seed: 60623, playerCount: 2 });
  const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = activePlayer.playerId;
  activePlayer.wizardProperties = [];
  targetPlayer.wizardProperties = [];
  activePlayer.life.current = 1;
  targetPlayer.life.current = 20;
  state.common.deadWizardTokens.drawStack = [];
  state.turn.power = 99;
  addFixtureDefenseCardToHand(state, targetPlayer, "discardSelf", {
    redirectAttack: true,
  });
  state.effectChoiceStrategy = (request) => {
    if (request.effectId === "attack_damage") {
      return { choiceId: targetPlayer.playerId };
    }
    return selectFirstFixtureDefense(request);
  };
  const wand = addRuntimeCardToHand(
    state,
    activePlayer,
    "esw2_dbg__legend_024"
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, undefined);
  assert.equal(targetPlayer.life.current, 20);
  assert.equal(activePlayer.life.current, 20);
});

test("#289 main_025 draws exactly once for an avoided original target", () => {
  const avoidedState = initializeGame({
    rootDir,
    seed: 60624,
    playerCount: 2,
  });
  const avoidedAttacker = mustGetPlayer(avoidedState, markPlayerId("player-1"));
  const avoidedTarget = mustGetPlayer(avoidedState, markPlayerId("player-2"));
  avoidedState.activePlayerId = avoidedAttacker.playerId;
  avoidedAttacker.wizardProperties = [];
  avoidedTarget.wizardProperties = [];
  avoidedTarget.life.current = 20;
  avoidedState.turn.power = 99;
  addFixtureDefenseCardToHand(avoidedState, avoidedTarget, "discardSelf");
  avoidedState.effectChoiceStrategy = (request) => {
    if (request.effectId === "attack_damage") {
      return { choiceId: avoidedTarget.playerId };
    }
    return selectFirstFixtureDefense(request);
  };
  const avoidedAttack = addRuntimeCardToHand(
    avoidedState,
    avoidedAttacker,
    "esw2_dbg__main_025"
  );

  assert.equal(
    applyAction(avoidedState, {
      type: "playCard",
      cardInstanceId: avoidedAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(avoidedTarget.life.current, 20);
  assert.equal(
    avoidedState.eventLog.filter(
      (event) =>
        event.type === "effectDrawCardsApplied" &&
        event.definitionId === "esw2_dbg__main_025"
    ).length,
    1
  );

  const redirectedState = initializeGame({
    rootDir,
    seed: 60625,
    playerCount: 2,
  });
  const redirectedAttacker = mustGetPlayer(
    redirectedState,
    markPlayerId("player-1")
  );
  const redirectingTarget = mustGetPlayer(
    redirectedState,
    markPlayerId("player-2")
  );
  redirectedState.activePlayerId = redirectedAttacker.playerId;
  redirectedAttacker.wizardProperties = [];
  redirectingTarget.wizardProperties = [];
  redirectedState.turn.power = 99;
  addFixtureDefenseCardToHand(
    redirectedState,
    redirectingTarget,
    "discardSelf",
    {
      redirectAttack: true,
    }
  );
  redirectedState.effectChoiceStrategy = (request) => {
    if (request.effectId === "attack_damage") {
      return { choiceId: redirectingTarget.playerId };
    }
    return selectFirstFixtureDefense(request);
  };
  const redirectedAttack = addRuntimeCardToHand(
    redirectedState,
    redirectedAttacker,
    "esw2_dbg__main_025"
  );

  assert.equal(
    applyAction(redirectedState, {
      type: "playCard",
      cardInstanceId: redirectedAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(
    redirectedState.eventLog.filter(
      (event) =>
        event.type === "effectDrawCardsApplied" &&
        event.definitionId === "esw2_dbg__main_025"
    ).length,
    1
  );
});

test("#289 main_025 does not draw on a hit or a death", () => {
  for (const targetLife of [20, 1]) {
    const state = initializeGame({
      rootDir,
      seed: 60626 + targetLife,
      playerCount: 2,
    });
    const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
    const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
    state.activePlayerId = activePlayer.playerId;
    activePlayer.wizardProperties = [];
    targetPlayer.wizardProperties = [];
    targetPlayer.life.current = targetLife;
    state.common.deadWizardTokens.drawStack = [];
    state.turn.power = 99;
    state.effectChoiceStrategy = (request) =>
      request.effectId === "attack_damage"
        ? { choiceId: targetPlayer.playerId }
        : undefined;
    const attack = addRuntimeCardToHand(
      state,
      activePlayer,
      "esw2_dbg__main_025"
    );

    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attack.instanceId,
      }).ok,
      true
    );
    assert.equal(
      state.eventLog.filter(
        (event) =>
          event.type === "effectDrawCardsApplied" &&
          event.definitionId === "esw2_dbg__main_025"
      ).length,
      0
    );
  }
});

test("#290 familiar_004 makes only the next card attack unavoidable", () => {
  const state = initializeGame({ rootDir, seed: 60627, playerCount: 2 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const target = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  attacker.wizardProperties = [];
  target.wizardProperties = [];
  target.life.current = 20;
  state.turn.power = 0;

  const defense = addFixtureDefenseCardToHand(state, target, "discardSelf");
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId === "attack_damage") {
      return { choiceId: target.playerId };
    }
    if (request.effectId === "avoid_attack") {
      defenseChoiceCount += 1;
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };

  const familiar = addRuntimeCardToHand(
    state,
    attacker,
    "esw2_dbg__familiar_004"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }).ok,
    true
  );
  assert.equal(state.turn.nextAttackUnavoidablePlayerId, attacker.playerId);
  assert.equal(state.turn.power, 3);

  const firstAttack = addRuntimeCardToHand(
    state,
    attacker,
    "esw2_dbg__main_024"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: firstAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(target.life.current, 14);
  assert.equal(defenseChoiceCount, 0);
  assert.equal(target.hand.includes(defense), true);
  assert.equal(state.turn.nextAttackUnavoidablePlayerId, undefined);

  const secondAttack = addRuntimeCardToHand(
    state,
    attacker,
    "esw2_dbg__main_024"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: secondAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(target.life.current, 14);
  assert.equal(defenseChoiceCount, 1);
  assert.equal(target.discard.includes(defense), true);
});

test("#290 legend_016 prevents defense until the current turn ends", () => {
  const state = initializeGame({ rootDir, seed: 60628, playerCount: 3 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const nextPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  const target = mustGetPlayer(state, markPlayerId("player-3"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
  }
  target.life.current = 20;
  const defense = addFixtureDefenseCardToHand(state, target, "discardSelf");
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId === "prevent_defense_this_turn") {
      return { choiceId: target.playerId };
    }
    if (request.effectId === "attack_damage") {
      return { choiceId: target.playerId };
    }
    if (request.effectId === "avoid_attack") {
      defenseChoiceCount += 1;
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };

  const legend = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_016");
  assert.equal(
    applyAction(state, { type: "playCard", cardInstanceId: legend.instanceId })
      .ok,
    true
  );
  assert.deepEqual(state.turn.defenseDisabledPlayerIds, [target.playerId]);

  for (let index = 0; index < 2; index += 1) {
    const attack = addRuntimeCardToHand(state, attacker, "esw2_dbg__main_024");
    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attack.instanceId,
      }).ok,
      true
    );
  }
  assert.equal(target.life.current, 8);
  assert.equal(defenseChoiceCount, 0);
  assert.equal(target.hand.includes(defense), true);

  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(state.activePlayerId, nextPlayer.playerId);
  assert.deepEqual(state.turn.defenseDisabledPlayerIds, []);
  state.turn.power = 99;

  const laterAttack = addRuntimeCardToHand(
    state,
    nextPlayer,
    "esw2_dbg__main_024"
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: laterAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(defenseChoiceCount, 1);
  assert.equal(target.life.current, 8);
  assert.equal(target.discard.includes(defense), true);
});

test("#291 familiar_010 always grants power but attacks only with a controlled legend", () => {
  const state = initializeGame({ rootDir, seed: 60629, playerCount: 2 });
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  const foe = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = player.playerId;
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
    candidate.hand = [];
  }
  let distributionChoiceRequests = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "distributed_attack_damage") {
      distributionChoiceRequests += 1;
    }
    return undefined;
  };

  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_010"
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 3);
  assert.equal(foe.life.current, 20);
  assert.equal(distributionChoiceRequests, 0);
});

test("#291 familiar_010 exposes only positive integer distributions summing to eight", () => {
  const state = initializeGame({ rootDir, seed: 60630, playerCount: 3 });
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  const foes = [
    mustGetPlayer(state, markPlayerId("player-2")),
    mustGetPlayer(state, markPlayerId("player-3")),
  ];
  const [firstFoe, secondFoe] = foes;
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  state.activePlayerId = player.playerId;
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
    candidate.hand = [];
    candidate.life.current = 20;
  }
  player.permanents.push(
    createRuntimeCardInstance(player, "esw2_dbg__legend_009", "legend-control")
  );

  let seenDistributionCount = 0;
  state.effectChoiceStrategy = (request) => {
    if (request.effectId !== "distributed_attack_damage") {
      return undefined;
    }
    const choices = request.choices.filter(
      (choice) => choice.choiceKind === "damageDistribution"
    );
    seenDistributionCount = choices.length;
    assert.equal(choices.length, 7);
    for (const choice of choices) {
      assert.equal(choice.targetPlayerIds.length, foes.length);
      assert.equal(choice.amounts.length, foes.length);
      assert.equal(choice.amount, 8);
      assert.equal(
        choice.amounts.every(
          (amount) => Number.isSafeInteger(amount) && amount > 0
        ),
        true
      );
      assert.equal(
        choice.amounts.reduce((total, amount) => total + amount, 0),
        8
      );
    }
    const selected = choices.find(
      (choice) =>
        choice.amounts[0] === 3 &&
        choice.amounts[1] === 5 &&
        choice.targetPlayerIds[0] === firstFoe.playerId &&
        choice.targetPlayerIds[1] === secondFoe.playerId
    );
    assert.ok(selected);
    return { choiceId: selected.choiceId };
  };

  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_010"
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(seenDistributionCount, 7);
  assert.equal(state.turn.power, 3);
  assert.equal(firstFoe.life.current, 17);
  assert.equal(secondFoe.life.current, 15);
});

test("#291 familiar_010 rejects an invalid distribution selection by falling back to a legal one", () => {
  const state = initializeGame({ rootDir, seed: 60631, playerCount: 2 });
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  const foe = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = player.playerId;
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
    candidate.hand = [];
    candidate.life.current = 20;
  }
  player.permanents.push(
    createRuntimeCardInstance(player, "esw2_dbg__legend_009", "legend-control")
  );
  let distributionChoiceRequests = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "distributed_attack_damage") {
      distributionChoiceRequests += 1;
      return { choiceId: "distribution:0,8" };
    }
    return undefined;
  };

  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_010"
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(distributionChoiceRequests, 1);
  assert.equal(state.turn.power, 3);
  assert.equal(foe.life.current, 12);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "distributed_attack_damage" &&
        event.choiceKind === "damageDistribution" &&
        event.amount === 8 &&
        event.amounts?.every((amount) => amount > 0) === true
    )
  );
});

test("#291 familiar_010 defense discards itself, draws one card, and avoids the distributed attack", () => {
  const state = initializeGame({ rootDir, seed: 60632, playerCount: 2 });
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  const foe = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = player.playerId;
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
    candidate.hand = [];
    candidate.life.current = 20;
  }
  player.permanents.push(
    createRuntimeCardInstance(player, "esw2_dbg__legend_009", "legend-control")
  );
  const drawnCard = foe.deck[0];
  assert.ok(drawnCard);
  const defense = addRuntimeCardToHand(state, foe, "esw2_dbg__familiar_010");
  defense.instanceId = markCardInstanceId("fixture-familiar-010-defense");
  state.effectChoiceStrategy = (request) => {
    if (request.effectId === "distributed_attack_damage") {
      const choice = request.choices.find(
        (candidate) => candidate.choiceKind === "damageDistribution"
      );
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    if (request.effectId === "avoid_attack") {
      const choice = request.choices.find(
        (candidate) =>
          candidate.choiceKind === "defense" &&
          candidate.targetCardInstanceId === defense.instanceId
      );
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    return undefined;
  };

  const attackerCard = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_010"
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackerCard.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 3);
  assert.equal(foe.life.current, 20);
  assert.equal(foe.discard.includes(defense), true);
  assert.equal(foe.hand.includes(drawnCard), true);
});

test("#291 familiar_010 skips the distributed attack when there are more than eight foes", () => {
  const state = initializeGame({ rootDir, seed: 60633, playerCount: 2 });
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  const template = mustGetPlayer(state, markPlayerId("player-2"));
  for (let index = 3; index <= 10; index += 1) {
    const extraPlayer = structuredClone(template);
    extraPlayer.playerId = markPlayerId(`player-${index}`);
    extraPlayer.hand = [];
    extraPlayer.deck = [];
    extraPlayer.discard = [];
    extraPlayer.playedThisTurn = [];
    extraPlayer.permanents = [];
    extraPlayer.unboughtFamiliars = [];
    extraPlayer.wizardProperties = [];
    extraPlayer.statuses = [];
    extraPlayer.trophyLikeObjects = [];
    state.players.push(extraPlayer);
  }
  state.activePlayerId = player.playerId;
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
    candidate.hand = [];
    candidate.life.current = 20;
  }
  player.permanents.push(
    createRuntimeCardInstance(player, "esw2_dbg__legend_009", "legend-control")
  );
  let distributionChoiceRequests = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "distributed_attack_damage") {
      distributionChoiceRequests += 1;
    }
    return undefined;
  };

  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_010"
  );
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 3);
  assert.equal(distributionChoiceRequests, 0);
  assert.equal(
    state.players.every((candidate) => candidate.life.current === 20),
    true
  );
});

test("#292 legend_023 chooses a fresh target for every attack and aggregates multiple deaths", () => {
  const state = initializeGame({
    rootDir,
    seed: 60634,
    playerCount: 5,
  });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const firstTarget = mustGetPlayer(state, markPlayerId("player-2"));
  const secondTarget = mustGetPlayer(state, markPlayerId("player-3"));
  const thirdTarget = mustGetPlayer(state, markPlayerId("player-4"));
  const untouchedTarget = mustGetPlayer(state, markPlayerId("player-5"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
    player.life.current = 20;
    player.trophyLikeObjects = [];
  }
  firstTarget.life.current = 7;
  secondTarget.life.current = 7;
  thirdTarget.life.current = 7;
  setNeutralDeadWizardTokenStack(state, 3, "legend-023-multiple-deaths");

  const targets = [firstTarget, firstTarget, secondTarget, thirdTarget];
  let targetChoiceIndex = 0;
  state.effectChoiceStrategy = (request) => {
    if (String(request.effectId) !== "sequential_attack_damage") {
      return undefined;
    }
    const target = targets[targetChoiceIndex];
    targetChoiceIndex += 1;
    const choice = request.choices.find(
      (candidate) =>
        candidate.choiceKind === "playerTarget" &&
        candidate.choiceId === target?.playerId
    );
    return toChoiceSelection(choice);
  };

  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_023");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: wand.instanceId,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(targetChoiceIndex, 4);
  assert.equal(firstTarget.life.current, 13);
  assert.equal(secondTarget.life.current, 20);
  assert.equal(thirdTarget.life.current, 20);
  assert.equal(untouchedTarget.life.current, 20);
  assert.equal(state.turn.power, 9);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    4
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "effectAddPowerApplied" &&
        event.cardInstanceId === wand.instanceId &&
        event.amount === 9
    ).length,
    1
  );

  const attackIds = state.eventLog
    .filter(
      (event) =>
        event.type === "attackCreated" &&
        event.cardInstanceId === wand.instanceId
    )
    .map((event) => event.attackId);
  assert.equal(attackIds.length, 4);
  assert.equal(
    attackIds.every((attackId) => attackId !== undefined),
    true
  );
  assert.equal(new Set(attackIds).size, 4);
});

test("#292 legend_023 can target its controller for every attack", () => {
  const state = initializeGame({ rootDir, seed: 60638, playerCount: 2 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const foe = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
    player.permanents = [];
    player.trophyLikeObjects = [];
  }
  attacker.life.current = 100;
  foe.life.current = 20;
  let selfWasLegal = false;
  let targetChoiceCount = 0;
  state.effectChoiceStrategy = (request) => {
    if (String(request.effectId) !== "sequential_attack_damage") {
      return undefined;
    }
    targetChoiceCount += 1;
    selfWasLegal ||= request.choices.some(
      (choice) => choice.choiceId === attacker.playerId
    );
    return { choiceId: attacker.playerId };
  };

  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_023");
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: wand.instanceId,
    }),
    { ok: true }
  );

  assert.equal(selfWasLegal, true);
  assert.equal(targetChoiceCount, 4);
  assert.equal(attacker.life.current, 72);
  assert.equal(foe.life.current, 20);
});

test("#292 legend_023 keeps separate defense windows and skips an avoided attack", () => {
  const state = initializeGame({ rootDir, seed: 60635, playerCount: 2 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const target = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
    player.trophyLikeObjects = [];
  }
  target.life.current = 20;
  const defense = addFixtureDefenseCardToHand(state, target, "discardSelf");
  setNeutralDeadWizardTokenStack(state, 1, "legend-023-avoid");
  state.effectChoiceStrategy = (request) => {
    if (String(request.effectId) === "sequential_attack_damage") {
      return { choiceId: target.playerId };
    }
    if (request.effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };

  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_023");
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: wand.instanceId,
    }),
    { ok: true }
  );

  assert.equal(target.life.current, 20);
  assert.equal(state.turn.power, 3);
  assert.equal(target.discard.includes(defense), true);
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    4
  );
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackAvoided" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    1
  );
});

test("#292 legend_023 credits redirected deaths to the original card controller", () => {
  const state = initializeGame({ rootDir, seed: 60636, playerCount: 2 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const redirectingTarget = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
    player.trophyLikeObjects = [];
  }
  attacker.life.current = 7;
  redirectingTarget.life.current = 20;
  const defenses = Array.from({ length: 4 }, () =>
    addFixtureDefenseCardToHand(state, redirectingTarget, "discardSelf", {
      redirectAttack: true,
    })
  );
  setNeutralDeadWizardTokenStack(state, 2, "legend-023-redirect");
  state.effectChoiceStrategy = (request) => {
    if (String(request.effectId) === "sequential_attack_damage") {
      return { choiceId: redirectingTarget.playerId };
    }
    if (request.effectId === "avoid_attack") {
      const defense = defenses.find((card) =>
        redirectingTarget.hand.includes(card)
      );
      return defense === undefined
        ? undefined
        : { choiceId: defense.instanceId };
    }
    return undefined;
  };

  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_023");
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: wand.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 6);
  assert.equal(attacker.life.current, 20);
  assert.equal(redirectingTarget.life.current, 20);
  assert.equal(
    defenses.every((defense) => redirectingTarget.discard.includes(defense)),
    true
  );
  assert.ok(
    redirectingTarget.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    )
  );
  const rewards = state.eventLog.filter(
    (event) =>
      event.type === "effectAddPowerApplied" &&
      event.cardInstanceId === wand.instanceId
  );
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0]?.playerId, attacker.playerId);
  assert.equal(rewards[0]?.amount, 6);
});

test("#292 legend_023 stops its remaining attacks after an early game end", () => {
  const state = initializeGame({ rootDir, seed: 60637, playerCount: 2 });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const target = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.wizardProperties = [];
    player.hand = [];
    player.discard = [];
  }
  target.life.current = 1;
  const gameEndingDwt = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt-292-early-end",
    [
      {
        effectId: "dead_wizard_token_gain_chips",
        timing: "onDeadWizardTokenFace",
        amount: 1,
      },
    ]
  );
  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [gameEndingDwt.tokenId, gameEndingDwt],
  ]);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt-292-early-end"),
      definitionId: markTokenDefinitionId(gameEndingDwt.tokenId),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = (request) =>
    String(request.effectId) === "sequential_attack_damage"
      ? { choiceId: target.playerId }
      : undefined;

  const wand = addRuntimeCardToHand(state, attacker, "esw2_dbg__legend_023");
  const result = withTemporaryEffectRuntimeOperations(
    "dead_wizard_token_gain_chips",
    {
      execute(_state, player) {
        return {
          ok: true,
          gameEnd: {
            reason: "playerDefeated",
            winnerPlayerId: player.playerId,
          },
        };
      },
    },
    () =>
      applyAction(state, {
        type: "playCard",
        cardInstanceId: wand.instanceId,
      })
  );

  assert.equal(result.ok, true);
  assert.equal(result.gameEndReason, "playerDefeated");
  assert.equal(
    state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.cardInstanceId === wand.instanceId
    ).length,
    1
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

  assert.equal(state.turn.power, 4);
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
  targetPlayer.statuses = [];
  targetPlayer.hand = [];
  state.common.deadWizardTokens.drawStack.splice(0);
  activePlayer.life.current = 10;
  targetPlayer.life.max = 20;
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

        return toChoiceSelection(
          choices.find(
            (choice) => choice.choiceId === testCase.selectedChoiceId
          )
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
      return toChoiceSelection(
        choices.find(
          (choice) =>
            choice.choiceKind === "playerTarget" &&
            choice.choiceId === targetPlayerId
        )
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

test("2D excludes self and falls back to the first foe for invalid choices", () => {
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
            choice.targetPlayerIds.includes(player.playerId)
        ),
        false
      );
      return {
        choiceKind: "playerTarget",
        choiceId: "invalid_foe_choice",
        targetPlayerIds: [],
      };
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
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "pass")
      );
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
        return toChoiceSelection(
          choices.find((choice) => choice.choiceId === "pass")
        );
      }
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "participate")
      );
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
        return toChoiceSelection(
          choices.find(
            (choice) => choice.choiceId === `vote-${secondPlayer.playerId}`
          )
        );
      }
      return toChoiceSelection(
        choices.find(
          (choice) => choice.choiceId === `vote-${thirdPlayer.playerId}`
        )
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
        return toChoiceSelection(
          choices.find(
            (choice) => choice.choiceId === testCase.selectedChoiceId
          )
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
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "take_damage")
      );
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
          verifiedTestRuntimeEffect({
            effectId:
              "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
            timing: "onMayhemResolve",
            targetSelector: "eachPlayerClockwiseFromActive",
            deathCondition: {
              effectId: "destroyed_card_kind_is",
              cardKind: "mayhem",
            },
            destroyedCardSource: "mainDeck",
          }),
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

test("targeted fixture effect selector is rejected at Runtime Data Intake", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Card fixture-targeted-effect-card",
    "fixture_add_power_equal_to_target_cost",
    {
      effectId: "fixture_add_power_equal_to_target_cost",
      timing: "onPlay",
      target: {
        targetType: "player",
      },
      targetSelector: "unsupportedFixtureSelector",
    },
    "fixture",
    "card"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /targetSelector must be one of/);
});

test("runtime effect ids are rejected at Runtime Data Intake", () => {
  const errors = validateFixtureEffectAtIntake("fixture-runtime-effect", {
    effectId: "fixture_runtime_effect_not_in_catalog",
    timing: "onPlay",
  } as unknown as RuntimeEffect);

  assert.ok(
    errors.some((error) =>
      error.includes(
        "uses unsupported effect id fixture_runtime_effect_not_in_catalog"
      )
    ),
    errors.join("\n")
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
  completionEventType: "cardBought" | "effectCardGained",
  destination: "discard" | "deckTop"
): void {
  assert.equal(state.common.market.includes(card), false);
  assert.equal(
    destination === "deckTop"
      ? player.deck[0] === card
      : player.discard.includes(card),
    true
  );
  assert.equal(
    destination === "deckTop"
      ? player.discard.includes(card)
      : player.deck.includes(card),
    false
  );
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
        event.destinationZone === `${player.playerId}.${destination}` &&
        event.ownerBefore === "common" &&
        event.ownerAfter === player.playerId
      );
    })
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.playerId === player.playerId &&
        event.effectId === "topdeck_gained_card"
    ),
    destination === "deckTop"
  );
  if (destination === "deckTop") {
    assert.ok(
      state.eventLog.some((event) => {
        return (
          event.type === "effectChoiceSelected" &&
          event.playerId === player.playerId &&
          event.effectId === "topdeck_gained_card" &&
          event.choiceId === "apply" &&
          event.choiceIds.join(",") === "apply,decline"
        );
      })
    );
  }
  assert.ok(
    state.eventLog.some((event) => {
      return (
        event.type === completionEventType &&
        event.playerId === player.playerId &&
        (event.cardInstanceId === card.instanceId ||
          event.targetCardInstanceId === card.instanceId) &&
        event.destination === destination
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

function validateFixtureEffectAtIntake(
  cardId: string,
  effect: RuntimeEffect
): string[] {
  const dataPack = loadCurrentRuntimeDataPack(
    rootDir,
    playableRuntimeDataPackPath
  );
  const definition = createFixtureCardDefinition(cardId, [effect]);
  const result = validateExecutableDataPack(
    {
      ...dataPack,
      cardDefinitions: new Map([
        ...dataPack.cardDefinitions,
        [definition.cardId, definition],
      ]),
    },
    { mode: "fixture" }
  );
  return result.ok ? [] : result.errors;
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

function setNeutralDeadWizardTokenStack(
  state: GameState,
  count: number,
  label: string
): void {
  state.common.deadWizardTokens.drawStack = Array.from(
    { length: count },
    (_, index) => ({
      instanceId: markTokenInstanceId(`fixture-${label}-${index + 1}`),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common" as const,
    })
  );
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
      effects: effects.map((effect) => verifiedTestRuntimeEffect(effect)),
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
        verifiedTestRuntimeEffect({
          effectId: "gain_chips",
          timing: "activation",
          amount: 1,
          condition: {
            conditionId: "control_count",
            cardTypes,
            minimumCount,
          },
        }),
      ],
      unsupportedMechanics: [],
    },
  };
}

function createEffectiveCardTypeWizardProperty(
  tokenId: string,
  sourceCardType: string,
  countedAsCardType: string
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
        verifiedTestRuntimeEffect({
          effectId: "owned_cards_count_as_card_type",
          timing: "whileControlled",
          sourceCardTypes: [sourceCardType],
          countedAsCardType,
        }),
      ],
      unsupportedMechanics: [],
    },
  };
}

function createFixtureDeadWizardTokenDefinition(
  tokenId: string,
  effects: RuntimeEffect[]
): TokenDefinition {
  return {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    source: { image: "assets/dead-wizard-token/dwt_fixture.png" },
    victoryPoints: -3,
    effects: effects.map((effect) => verifiedTestRuntimeEffect(effect)),
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
        verifiedTestRuntimeEffect({
          effectId: "gain_chips",
          timing: "onPlayCard",
          isOngoing: true,
          amount: 1,
        }),
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
        verifiedTestRuntimeEffect({
          effectId: "gain_chips",
          timing: "onPlayCard",
          cardTypes,
          amount: 1,
        }),
      ],
      unsupportedMechanics: [],
    },
  };
}

function createTopdeckOnGainWizardProperty(
  tokenId: string,
  cardTypes: string[],
  optional: boolean | "omitted" = true
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
        verifiedTestRuntimeEffect(
          optional === "omitted"
            ? {
                effectId: "topdeck_gained_card",
                timing: "onGainCard",
                cardTypes,
              }
            : {
                effectId: "topdeck_gained_card",
                timing: "onGainCard",
                optional,
                cardTypes,
              }
        ),
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
        verifiedTestRuntimeEffect({
          effectId: "temporary_hand_limit_by_gained_card_type",
          timing: "endTurn",
          amount,
          cardTypes,
        }),
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
      verifiedTestRuntimeEffect({
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount,
        target: {
          targetType: "player",
        },
      }),
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

test("Сердце мага даёт карту, 3 чипсины и 5 ПО", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const cardId = "esw2_dbg__legend_026";
  const definition = currentRuntimeDataPack.cardDefinitions.get(cardId);
  assert.ok(definition);
  assert.equal(definition.engine.victoryPoints, 5);
  assert.deepEqual(definition.engine.effects, [
    { effectId: "draw_cards", timing: "onPlay", amount: 1 },
    { effectId: "gain_chips", timing: "onPlay", amount: 3 },
  ]);
  assert.deepEqual(
    currentRuntimeDataPack.decks.legendDeck.entries.find(
      (entry) => entry.cardId === cardId
    ),
    { cardId, count: 1 }
  );

  const scenario = createGameScenario({ rootDir, seed: 239026 });
  scenario.activePlayer.deck.splice(0);
  const drawnCard = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_004",
    zone: "deck",
  });
  const chipsBefore = scenario.activePlayer.chips;
  const scoreBefore = scoreGame(scenario.state).find(
    (score) => score.playerId === scenario.activePlayer.playerId
  );
  assert.ok(scoreBefore);
  const heart = givenRuntimeCard(scenario, { definitionId: cardId });
  const handBefore = scenario.activePlayer.hand.length;

  assert.deepEqual(play(scenario, heart), { ok: true });

  assert.equal(scenario.activePlayer.chips, chipsBefore + 3);
  assert.equal(scenario.activePlayer.hand.length, handBefore);
  assert.equal(scenario.activePlayer.hand.includes(drawnCard), true);
  const scoreAfter = scoreGame(scenario.state).find(
    (score) => score.playerId === scenario.activePlayer.playerId
  );
  assert.ok(scoreAfter);
  assert.equal(scoreAfter.victoryPoints - scoreBefore.victoryPoints, 5);
});

test("все карты market-effects входят в текущий runtime-набор", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const expectedCards = [
    "esw2_dbg__familiar_007",
    "esw2_dbg__legend_030",
    "esw2_dbg__legend_031",
    "esw2_dbg__main_008",
    "esw2_dbg__main_044",
    "esw2_dbg__main_063",
    "esw2_dbg__main_065",
    "esw2_dbg__main_073",
  ];

  for (const cardId of expectedCards) {
    assert.ok(currentRuntimeDataPack.cardDefinitions.has(cardId));
  }
  assert.deepEqual(
    currentRuntimeDataPack.decks.familiarPool?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__familiar_007"
    ),
    { cardId: "esw2_dbg__familiar_007", count: 1 }
  );
  assert.deepEqual(
    currentRuntimeDataPack.decks.legendDeck.entries.find(
      (entry) => entry.cardId === "esw2_dbg__legend_030"
    ),
    { cardId: "esw2_dbg__legend_030", count: 1 }
  );
  assert.deepEqual(
    currentRuntimeDataPack.decks.legendDeck.entries.find(
      (entry) => entry.cardId === "esw2_dbg__legend_031"
    ),
    { cardId: "esw2_dbg__legend_031", count: 1 }
  );
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck.entries.filter((entry) =>
      [
        "esw2_dbg__main_008",
        "esw2_dbg__main_044",
        "esw2_dbg__main_063",
        "esw2_dbg__main_065",
        "esw2_dbg__main_073",
      ].includes(entry.cardId)
    ),
    [
      { cardId: "esw2_dbg__main_008", count: 1 },
      { cardId: "esw2_dbg__main_044", count: 2 },
      { cardId: "esw2_dbg__main_063", count: 1 },
      { cardId: "esw2_dbg__main_065", count: 1 },
      { cardId: "esw2_dbg__main_073", count: 1 },
    ]
  );
});

test("2E добавляет чипсину каждой текущей карте обычной барахолки", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const mayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_063");
  assert.ok(mayhemDefinition);
  const firstMarketCard = state.common.market[0];
  const secondMarketCard = state.common.market[1];
  assert.ok(firstMarketCard);
  assert.ok(secondMarketCard);
  for (const card of state.common.market) {
    card.marketChips = 0;
  }
  firstMarketCard.marketChips = 2;

  const result = executeMayhemEffects(state, player, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId("fixture-2e"),
    definitionId: mayhemDefinition.cardId,
  });

  assert.equal(result.ok, true);
  assert.equal(firstMarketCard.marketChips, 3);
  assert.equal(secondMarketCard.marketChips, 1);
  state.turn.power = 99;
  const buyResult = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: firstMarketCard.instanceId,
  });
  assert.equal(buyResult.ok, true);
  assert.equal(player.chips, 3);
  assert.equal(firstMarketCard.marketChips, 0);
});

test("Дерьмак Гастрит случайно уничтожает легенду и атакует каждого врага на её стоимость", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  const lowCostLegend = createFixtureCardDefinition(
    "fixture-gastrit-low-cost-legend",
    [],
    { cardTypes: ["legend"] }
  );
  lowCostLegend.engine.cost = 3;
  const highCostLegend = createFixtureCardDefinition(
    "fixture-gastrit-high-cost-legend",
    [],
    { cardTypes: ["legend"] }
  );
  highCostLegend.engine.cost = 7;
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [lowCostLegend.cardId, lowCostLegend],
    [highCostLegend.cardId, highCostLegend],
  ]);
  const lowCostCard = createCommonRuntimeCard(lowCostLegend.cardId);
  const highCostCard = createCommonRuntimeCard(highCostLegend.cardId);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    lowCostCard,
    highCostCard
  );
  const gastrit = addRuntimeCardToHand(state, player, "esw2_dbg__legend_030");
  const foeLifeBefore = foe.life.current;

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: gastrit.instanceId,
  });

  assert.equal(result.ok, true);
  const destroyedCard = state.common.destroyedPile.at(-1);
  assert.ok(destroyedCard);
  const destroyedCost = state.cardDefinitions.get(destroyedCard.definitionId)
    ?.engine.cost;
  assert.ok(typeof destroyedCost === "number");
  assert.equal(foe.life.current, foeLifeBefore - destroyedCost);
  assert.equal(state.common.legendMarket.length, 1);
  assert.equal(state.turn.power, 2);
});

test("2R очищает рынок легенд, пропускает МегаБеспредел и заполняет его до четырёх", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const mayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_065");
  assert.ok(mayhemDefinition);
  const oldLegendCards = state.common.legendMarket.slice(0, 2);
  state.common.legendMarket.splice(
    0,
    state.common.legendMarket.length,
    ...oldLegendCards
  );
  const megaMayhem = {
    ...createCommonRuntimeCard("esw2_dbg__mega_mayhem_004"),
    instanceId: markCardInstanceId("fixture-2r-mega-mayhem"),
  };
  const replacementLegends = Array.from({ length: 4 }, (_value, index) => ({
    ...createCommonRuntimeCard("esw2_dbg__legend_030"),
    instanceId: markCardInstanceId(`fixture-2r-legend-${index}`),
  }));
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    ...replacementLegends
  );

  const result = executeMayhemEffects(state, player, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId("fixture-2r"),
    definitionId: mayhemDefinition.cardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.legendMarket.length, 4);
  assert.deepEqual(state.common.legendMarket, replacementLegends);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
  for (const oldLegendCard of oldLegendCards) {
    assert.equal(state.common.destroyedPile.includes(oldLegendCard), true);
  }
});

test("2R оставляет неполный рынок при исчерпании колоды легенд до следующей проверки рынка", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const mayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_065");
  assert.ok(mayhemDefinition);
  const oldLegendCards = state.common.legendMarket.slice();
  state.common.legendDeck.splice(0);

  const result = executeMayhemEffects(state, player, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId("fixture-2r-exhausted"),
    definitionId: mayhemDefinition.cardId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.common.legendMarket.length, 0);
  for (const oldLegendCard of oldLegendCards) {
    assert.equal(state.common.destroyedPile.includes(oldLegendCard), true);
  }
  assert.deepEqual(runMarketFlow(state, { mode: "turn" }), {
    ok: true,
    gameEndReason: "legendDeckExhausted",
  });
});

test("2G выдаёт по чипсине каждому игроку и заново заполняет рынок легенд до трёх", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const mayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_073");
  assert.ok(mayhemDefinition);
  const replacementLegends = Array.from({ length: 3 }, (_value, index) => ({
    ...createCommonRuntimeCard("esw2_dbg__legend_030"),
    instanceId: markCardInstanceId(`fixture-2g-legend-${index}`),
  }));
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    ...replacementLegends
  );
  for (const targetPlayer of state.players) {
    targetPlayer.chips = 0;
  }

  const result = executeMayhemEffects(state, player, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId("fixture-2g"),
    definitionId: mayhemDefinition.cardId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.common.legendMarket, replacementLegends);
  assert.equal(state.common.legendMarket.length, 3);
  for (const targetPlayer of state.players) {
    assert.equal(targetPlayer.chips, 1);
  }
});

test("2G разыгрывает МегаБеспредел при обычном заполнении рынка легенд", () => {
  const state = initializeGame({ rootDir, seed: 60615 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const mayhemDefinition = state.cardDefinitions.get("esw2_dbg__main_073");
  assert.ok(mayhemDefinition);
  const megaMayhem = {
    ...createCommonRuntimeCard("esw2_dbg__mega_mayhem_005"),
    instanceId: markCardInstanceId("fixture-2g-mega-mayhem"),
  };
  const replacementLegends = Array.from({ length: 3 }, (_value, index) => ({
    ...createCommonRuntimeCard("esw2_dbg__legend_030"),
    instanceId: markCardInstanceId(`fixture-2g-after-mega-${index}`),
  }));
  state.common.legendDeck.splice(
    0,
    state.common.legendDeck.length,
    megaMayhem,
    ...replacementLegends
  );
  for (const targetPlayer of state.players) {
    targetPlayer.life.current = 20;
  }

  const result = executeMayhemEffects(state, player, mayhemDefinition, {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: markCardInstanceId("fixture-2g-mega"),
    definitionId: mayhemDefinition.cardId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.common.legendMarket, replacementLegends);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
  for (const targetPlayer of state.players) {
    assert.equal(targetPlayer.life.current, 5);
  }
});

test("Вялая башня при получении переносит две палочки из общего стека в сброс", () => {
  const state = initializeGame({ rootDir, seed: 243005 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const tower = createCommonRuntimeCard("esw2_dbg__main_005");
  const expectedWands = state.common.limpWandStack.slice(0, 2);
  player.wizardProperties = [];
  state.common.limpWandStack.splice(2);
  state.common.market.splice(0, state.common.market.length, tower);
  state.turn.power = 3;

  const result = applyAction(state, {
    type: "buyMarketCard",
    source: "mainMarket",
    cardInstanceId: tower.instanceId,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.common.limpWandStack.length, 0);
  assert.deepEqual(player.discard.slice(-3), [tower, ...expectedWands]);
  assert.equal(
    expectedWands.every((card) => card.ownerId === player.playerId),
    true
  );
});

test("Нарывка раздаёт палочки врагам по порядку, пока не исчерпает общий стек", () => {
  const source = loadCurrentRuntimeDataPack(rootDir);
  const wizardPropertyStack = source.tokenStacks.wizardProperties;
  assert.ok(wizardPropertyStack);
  const dataPack: LoadedDataPack = {
    ...source,
    tokenStacks: {
      ...source.tokenStacks,
      wizardProperties: {
        ...wizardPropertyStack,
        entries: [
          ...wizardPropertyStack.entries,
          { tokenId: "esw2_dbg__wizard_property_003", count: 1 },
        ],
      },
    },
  };
  const state = initializeGame({
    dataPack,
    seed: 243001,
    playerCount: 5,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foes = getOpponentsInSeatingOrder(state, player);
  player.wizardProperties = [];
  for (const foe of foes) {
    foe.wizardProperties = [];
  }
  const expectedWands = state.common.limpWandStack.slice(0, 5);
  state.common.limpWandStack.splice(5);
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_001");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.equal(state.common.limpWandStack.length, 0);
  assert.deepEqual(foes[0]?.discard, expectedWands.slice(0, 2));
  assert.deepEqual(foes[1]?.discard, expectedWands.slice(2, 4));
  assert.deepEqual(foes[2]?.discard, expectedWands.slice(4, 5));
  assert.deepEqual(foes[3]?.discard, []);
});

test("защита отменяет выдачу палочек от Нарывки", () => {
  const state = initializeGame({ rootDir, seed: 243101 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  const expectedWands = state.common.limpWandStack.slice(0, 2);
  state.common.limpWandStack.splice(2);
  const defense = addFixtureDefenseCardToHand(state, foe, "discardSelf");
  state.effectChoiceStrategy = selectFirstFixtureDefense;
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_001");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.deepEqual(state.common.limpWandStack, expectedWands);
  assert.equal(foe.discard.includes(defense), true);
});

test("Повелитель шкурок выдаёт палочку выбранному левому или правому врагу", () => {
  const state = initializeGame({ rootDir, seed: 243026, playerCount: 3 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foes = state.players.filter(
    (candidate) => candidate.playerId !== player.playerId
  );
  const target = foes[1];
  assert.ok(target);
  player.wizardProperties = [];
  for (const foe of foes) {
    foe.wizardProperties = [];
  }
  const expectedWand = state.common.limpWandStack[0];
  assert.ok(expectedWand);
  state.common.limpWandStack.splice(1);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_gain_limp_wand"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === target.playerId)
        )
      : undefined;
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__main_026");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.equal(state.turn.power, 2);
  assert.deepEqual(target.discard, [expectedWand]);
  assert.deepEqual(foes[0]?.discard, []);
  assert.equal(state.common.limpWandStack.length, 0);
});

test("МегаБеспредел выдаёт палочки на руки в порядке активного игрока", () => {
  const state = initializeGame({ rootDir, seed: 243002, playerCount: 3 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const activePlayerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === player.playerId
  );
  const playersInActiveOrder = Array.from(
    { length: state.players.length },
    (_value, index) =>
      state.players[(activePlayerIndex + index) % state.players.length]
  );
  const expectedWands = state.common.limpWandStack.slice(0, 5);
  state.common.limpWandStack.splice(5);
  for (const target of state.players) {
    target.wizardProperties = [];
    target.hand = [];
  }
  const definition = state.cardDefinitions.get("esw2_dbg__mega_mayhem_002");
  assert.ok(definition);

  assert.deepEqual(
    executeMayhemEffects(state, player, definition, {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: markCardInstanceId("fixture-mega-mayhem-002"),
      definitionId: definition.cardId,
    }),
    { ok: true }
  );

  assert.equal(state.common.limpWandStack.length, 0);
  assert.deepEqual(playersInActiveOrder[0]?.hand, expectedWands.slice(0, 3));
  assert.deepEqual(playersInActiveOrder[1]?.hand, expectedWands.slice(3, 5));
  assert.deepEqual(playersInActiveOrder[2]?.hand, []);
});

test("ТА САМАЯ Вялая Палочка не передаёт палочки без убийства цели", () => {
  const state = initializeGame({ rootDir, seed: 244021 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  const expectedWands = state.common.limpWandStack.slice(0, 3);
  state.common.limpWandStack.splice(3);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === foe.playerId)
        )
      : undefined;
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_021");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.equal(foe.life.current, 13);
  assert.deepEqual(state.common.limpWandStack, expectedWands);
  assert.deepEqual(foe.discard, []);
});

test("ТА САМАЯ Вялая Палочка после убийства передаёт до трёх палочек из всех источников", () => {
  const state = initializeGame({ rootDir, seed: 244022 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  foe.life.current = 7;
  const handWand = state.common.limpWandStack[0];
  const discardWand = state.common.limpWandStack[1];
  const stackWand = state.common.limpWandStack[2];
  assert.ok(handWand);
  assert.ok(discardWand);
  assert.ok(stackWand);
  state.common.limpWandStack.splice(0, 2);
  state.common.limpWandStack.splice(1);
  handWand.ownerId = player.playerId;
  discardWand.ownerId = player.playerId;
  player.hand.push(handWand);
  player.discard.push(discardWand);
  const transferQueue = [handWand, discardWand, stackWand];
  let transferIndex = 0;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "attack_damage") {
      return undefined;
    }
    const targetChoice = choices.find(
      (choice) => choice.choiceId === foe.playerId
    );
    if (targetChoice !== undefined) {
      return toChoiceSelection(targetChoice);
    }
    const selectedWand = transferQueue[transferIndex];
    transferIndex += 1;
    if (selectedWand === undefined) {
      return undefined;
    }
    return toChoiceSelection(
      choices.find(
        (choice) => choice.choiceId === `transfer_${selectedWand.instanceId}`
      )
    );
  };
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_021");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.equal(player.hand.includes(handWand), false);
  assert.equal(player.discard.includes(discardWand), false);
  assert.equal(state.common.limpWandStack.length, 0);
  assert.deepEqual(foe.discard.slice(-3), transferQueue);
  assert.equal(
    transferQueue.every((wand) => wand.ownerId === foe.playerId),
    true
  );
});

test("ТА САМАЯ Вялая Палочка после убийства передаёт меньший остаток палочек", () => {
  const state = initializeGame({ rootDir, seed: 244024 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  foe.life.current = 7;
  const remainingWand = state.common.limpWandStack[0];
  assert.ok(remainingWand);
  state.common.limpWandStack.splice(1);
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "attack_damage") return undefined;
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceId === foe.playerId ||
          choice.choiceId === `transfer_${remainingWand.instanceId}`
      )
    );
  };
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_021");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.deepEqual(state.common.limpWandStack, []);
  assert.equal(foe.discard.includes(remainingWand), true);
  assert.equal(remainingWand.ownerId, foe.playerId);
});

test("ТА САМАЯ Вялая Палочка позволяет отказаться от передачи после убийства", () => {
  const state = initializeGame({ rootDir, seed: 244023 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  foe.life.current = 7;
  const expectedWand = state.common.limpWandStack[0];
  assert.ok(expectedWand);
  state.common.limpWandStack.splice(1);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-limp-wand-death-dwt"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "attack_damage") {
      return undefined;
    }
    return toChoiceSelection(
      choices.find((choice) => choice.choiceId === foe.playerId) ?? choices[0]
    );
  };
  const card = addRuntimeCardToHand(state, player, "esw2_dbg__legend_021");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );

  assert.deepEqual(state.common.limpWandStack, [expectedWand]);
  assert.equal(foe.discard.includes(expectedWand), false);
});

test("Сальный шут даёт 3 мощи и атакой выдаёт палочку выбранному врагу", () => {
  const state = initializeGame({ rootDir, seed: 245003 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  const expectedWand = state.common.limpWandStack[0];
  assert.ok(expectedWand);
  state.common.limpWandStack.splice(1);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_gain_limp_wand"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === foe.playerId)
        )
      : undefined;
  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_003"
  );

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 3);
  assert.deepEqual(foe.discard, [expectedWand]);
  assert.equal(state.common.limpWandStack.length, 0);
});

test("Сальный шут сохраняет атаку при пустом стеке палочек", () => {
  const state = initializeGame({ rootDir, seed: 245005 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  state.common.limpWandStack = [];
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_gain_limp_wand"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === foe.playerId)
        )
      : undefined;
  const familiar = addRuntimeCardToHand(
    state,
    player,
    "esw2_dbg__familiar_003"
  );

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: familiar.instanceId,
    }),
    { ok: true }
  );

  assert.equal(state.turn.power, 3);
  assert.deepEqual(foe.discard, []);
});

test("Сальный шут защищается, берёт карту и перенаправляет палочку атакующему", () => {
  const state = initializeGame({ rootDir, seed: 245004 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  const expectedWand = state.common.limpWandStack[0];
  const drawnCard = foe.deck[0];
  assert.ok(expectedWand);
  assert.ok(drawnCard);
  state.common.limpWandStack.splice(1);
  const familiar = addRuntimeCardToHand(state, foe, "esw2_dbg__familiar_003");
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_gain_limp_wand") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === foe.playerId)
      );
    }
    if (effectId === "avoid_attack") {
      return toChoiceSelection(
        choices.find(
          (choice) =>
            choice.choiceKind === "defense" &&
            choice.targetCardInstanceId === familiar.instanceId
        )
      );
    }
    return undefined;
  };
  const attack = addRuntimeCardToHand(state, player, "esw2_dbg__main_026");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack.instanceId }),
    { ok: true }
  );

  assert.equal(foe.discard.includes(familiar), true);
  assert.equal(foe.hand.includes(drawnCard), true);
  assert.equal(player.discard.includes(expectedWand), true);
  assert.equal(foe.discard.includes(expectedWand), false);
  assert.equal(state.common.limpWandStack.length, 0);
});

test("Виагрус получает палочку только в начале последующего собственного хода", () => {
  const state = initializeGame({ rootDir, seed: 246029, playerCount: 2 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  player.hand = [];
  player.deck = [];
  player.discard = [];
  foe.hand = [];
  foe.deck = [];
  foe.discard = [];
  const expectedWand = state.common.limpWandStack[0];
  assert.ok(expectedWand);
  state.common.limpWandStack.splice(1);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "ongoing_start_turn_optional_gain_limp_wand_to_hand"
      ? toChoiceSelection(choices.find((choice) => choice.choiceId === "apply"))
      : undefined;
  const viagrus = addRuntimeCardToHand(state, player, "esw2_dbg__legend_029");

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: viagrus.instanceId,
    }),
    { ok: true }
  );
  assert.equal(player.hand.includes(expectedWand), false);
  assert.equal(state.common.limpWandStack.includes(expectedWand), true);

  assert.deepEqual(applyAction(state, { type: "endTurn" }), { ok: true });
  assert.deepEqual(applyAction(state, { type: "endTurn" }), { ok: true });

  assert.equal(state.activePlayerId, player.playerId);
  assert.equal(player.hand.includes(expectedWand), true);
  assert.equal(state.common.limpWandStack.includes(expectedWand), false);
});

test("Виагрус добавляет 3 мощи при розыгрыше вялой палочки", () => {
  const state = initializeGame({ rootDir, seed: 246030 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.hand = [];
  const limpWand = state.common.limpWandStack.shift();
  assert.ok(limpWand);
  limpWand.ownerId = player.playerId;
  player.hand.push(limpWand);
  const viagrus = addRuntimeCardToHand(state, player, "esw2_dbg__legend_029");

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: viagrus.instanceId,
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 0);

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: limpWand.instanceId,
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 3);
});

test("Виагрус не предлагает палочку в начале хода при пустом общем стеке", () => {
  const state = initializeGame({ rootDir, seed: 246032, playerCount: 2 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  for (const candidate of [player, foe]) {
    candidate.wizardProperties = [];
    candidate.hand = [];
    candidate.deck = [];
    candidate.discard = [];
  }
  state.common.limpWandStack = [];
  state.effectChoiceStrategy = () => {
    assert.fail("Пустой стек не должен открывать окно выбора");
  };
  const viagrus = addRuntimeCardToHand(state, player, "esw2_dbg__legend_029");

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: viagrus.instanceId,
    }),
    { ok: true }
  );
  assert.deepEqual(applyAction(state, { type: "endTurn" }), { ok: true });
  assert.deepEqual(applyAction(state, { type: "endTurn" }), { ok: true });

  assert.equal(state.activePlayerId, player.playerId);
  assert.deepEqual(player.hand, []);
});

test("Виагрус считает вялые палочки положительными ПО во всех личных зонах", () => {
  const state = initializeGame({ rootDir, seed: 246031 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.hand = [];
  player.deck = [];
  player.discard = [];
  player.playedThisTurn = [];
  const viagrus = addRuntimeCardToHand(state, player, "esw2_dbg__legend_029");
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: viagrus.instanceId,
    }),
    { ok: true }
  );
  const wands = state.common.limpWandStack.splice(0, 5);
  assert.equal(wands.length, 5);
  for (const wand of wands) {
    wand.ownerId = player.playerId;
  }
  const [handWand, deckWand, discardWand, playedWand, permanentWand] = wands;
  assert.ok(handWand);
  assert.ok(deckWand);
  assert.ok(discardWand);
  assert.ok(playedWand);
  assert.ok(permanentWand);
  player.hand.push(handWand);
  player.deck.push(deckWand);
  player.discard.push(discardWand);
  player.playedThisTurn.push(playedWand);
  player.permanents.push(permanentWand);

  const score = scoreGame(state).find(
    (candidate) => candidate.playerId === player.playerId
  );

  assert.ok(score);
  assert.equal(score.victoryPoints, 10);
});

test("смерть в незавершённой карте сначала выдаёт ЖДК, воскрешает и завершает карту", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 301001,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.wizardProperties = [];
  foe.wizardProperties = [];
  foe.life.current = 1;
  state.common.deadWizardTokens.drawStack.splice(1);
  const returnedCard = player.hand.shift();
  assert.ok(returnedCard);
  player.discard.push(returnedCard);
  const attackDefinition = createFixtureCardDefinition(
    "fixture-death-then-return",
    [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        amount: 1,
        onKill: [{ effectId: "return_discard_to_hand", amount: 1 }],
      },
    ]
  );
  const attack = addFixtureDefinitionToActiveHand(state, attackDefinition);
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === foe.playerId)
      );
    }
    if (effectId === "return_discard_to_hand") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceKind === "cardTarget")
      );
    }
    return undefined;
  };

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack.instanceId }),
    { ok: true }
  );

  assert.equal(foe.life.current, 20);
  assert.equal(foe.deadWizardTokens.length, 1);
  assert.equal(player.hand.includes(returnedCard), true);
  assertEventOrder(state, [
    (event) => event.type === "playerDied" && event.playerId === foe.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" && event.playerId === foe.playerId,
    (event) =>
      event.type === "playerResurrected" && event.playerId === foe.playerId,
    (event) =>
      event.type === "effectCardsReturnedToHand" &&
      event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === foe.playerId,
  ]);
});

test("set_life до нуля проводит смерть через общий lifecycle ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 301003 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.life.max = 20;
  player.life.current = 20;
  for (const targetPlayer of state.players) {
    targetPlayer.wizardProperties = [];
  }
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-set-life-neutral-dwt"),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common",
    },
  ];
  const setLife = addFixtureCardToActiveHand(state, {
    effectId: "set_life",
    timing: "onPlay",
    lifeTotal: 0,
    target: { selector: "activePlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: setLife }),
    { ok: true }
  );

  assert.equal(player.life.current, 20);
  assert.equal(player.deadWizardTokens.length, 1);
  assertEventOrder(state, [
    (event) =>
      event.type === "effectLifeSet" && event.playerId === player.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.playerId === player.playerId,
    (event) =>
      event.type === "playerResurrected" && event.playerId === player.playerId,
  ]);
});

test("МегаБеспредел с set_life до нуля использует lifecycle ЖДК для каждого игрока", () => {
  const state = initializeGame({ rootDir, seed: 301004 });
  const player = mustGetPlayer(state, state.activePlayerId);
  for (const targetPlayer of state.players) {
    targetPlayer.wizardProperties = [];
  }
  state.common.deadWizardTokens.drawStack = state.players.map(
    (_targetPlayer, index) => ({
      instanceId: markTokenInstanceId(`fixture-set-life-mega-dwt-${index}`),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common" as const,
    })
  );
  const definition = createFixtureCardDefinition(
    "fixture-mega-mayhem-set-life-zero",
    [
      {
        effectId: "mega_mayhem_set_life",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        lifeTotal: 0,
      },
    ],
    { cardKind: "megaMayhem" }
  );

  assert.deepEqual(
    executeMayhemEffects(state, player, definition, {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: player.playerId,
      cardInstanceId: markCardInstanceId("fixture-mega-mayhem-set-life-zero"),
      definitionId: definition.cardId,
    }),
    { ok: true }
  );

  for (const targetPlayer of state.players) {
    assert.equal(targetPlayer.life.current, 20);
    assert.equal(targetPlayer.deadWizardTokens.length, 1);
  }
});

test("несколько смертей одной карты выдают ЖДК сразу, а их лица разрешают FIFO после карты", () => {
  const state = initializeGame({ rootDir, seed: 301002, playerCount: 3 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const [firstFoe, secondFoe] = getOpponentsInSeatingOrder(state, player);
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  for (const candidate of state.players) {
    candidate.wizardProperties = [];
  }
  firstFoe.life.current = 1;
  secondFoe.life.current = 1;
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt-fifo-first"),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common",
    },
    {
      instanceId: markTokenInstanceId("fixture-dwt-fifo-second"),
      definitionId: markTokenDefinitionId(
        "esw2_dbg__dead_wizard_token_neutral"
      ),
      ownerId: "common",
    },
  ];
  const attackId = addFixtureCardToActiveHand(state, {
    effectId: "multi_target_attack",
    timing: "onPlay",
    amount: 1,
    target: { selector: "opponentPlayers" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attackId }),
    { ok: true }
  );

  assertEventOrder(state, [
    (event) =>
      event.type === "playerDied" && event.playerId === firstFoe.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.playerId === firstFoe.playerId,
    (event) =>
      event.type === "playerResurrected" &&
      event.playerId === firstFoe.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === secondFoe.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.playerId === secondFoe.playerId,
    (event) =>
      event.type === "playerResurrected" &&
      event.playerId === secondFoe.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === firstFoe.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === secondFoe.playerId,
  ]);
});

test("смерть от лица ЖДК выдаёт следующий жетон до завершения текущего лица", () => {
  const state = initializeGame({ rootDir, seed: 301005 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.life.current = 1;
  const deathFace = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt-face-causes-death",
    [
      {
        effectId: "set_life",
        timing: "onDeadWizardTokenFace",
        lifeTotal: 0,
        target: { selector: "activePlayer" },
      },
    ]
  );
  const neutralFace = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt-face-after-nested-death",
    []
  );
  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [deathFace.tokenId, deathFace],
    [neutralFace.tokenId, neutralFace],
  ]);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt-face-causes-death"),
      definitionId: markTokenDefinitionId(deathFace.tokenId),
      ownerId: "common",
    },
    {
      instanceId: markTokenInstanceId("fixture-dwt-face-after-nested-death"),
      definitionId: markTokenDefinitionId(neutralFace.tokenId),
      ownerId: "common",
    },
  ];
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    targetSelector: "chosenPlayer",
    amount: 1,
  });
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === player.playerId)
        )
      : undefined;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );

  assertEventOrder(state, [
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.playerId === player.playerId,
    (event) =>
      event.type === "playerDied" && event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.playerId === player.playerId,
  ]);
});

test("свойство 002 разыгрывает верхнюю постоянку врага один раз и сбрасывает её владельцу", () => {
  const state = initializeGame({ rootDir, seed: 310002 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = getOpponentsInSeatingOrder(state, player)[0];
  const property = player.wizardProperties[0];
  assert.ok(foe);
  assert.ok(property);
  property.definitionId = markTokenDefinitionId(
    "esw2_dbg__wizard_property_002"
  );
  player.permanents = [];

  const unavailableResult = applyAction(state, {
    type: "activateWizardProperty",
    tokenInstanceId: property.instanceId,
  });
  assert.deepEqual(unavailableResult, {
    ok: false,
    error: "Wizard property cannot be activated",
  });
  assert.deepEqual(state.turn.activatedCardIds, []);

  const effectiveTypeProperty = createEffectiveCardTypeWizardProperty(
    "fixture-wp002-effective-wizard",
    "familiar",
    "wizardCard"
  );
  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [effectiveTypeProperty.tokenId, effectiveTypeProperty],
  ]);
  player.wizardProperties.push({
    instanceId: markTokenInstanceId("fixture-wp002-effective-wizard"),
    definitionId: markTokenDefinitionId(effectiveTypeProperty.tokenId),
    ownerId: player.playerId,
  });
  addControlledFixturePermanent(state, player, "fixture-wp002-familiar-one", [
    "familiar",
  ]);
  addControlledFixturePermanent(state, player, "fixture-wp002-familiar-two", [
    "familiar",
  ]);
  const foreignOngoingDefinition = createFixtureCardDefinition(
    "fixture-wp002-foe-ongoing",
    [{ effectId: "add_power", timing: "onPlay", amount: 2 }],
    { isOngoing: true }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [foreignOngoingDefinition.cardId, foreignOngoingDefinition],
  ]);
  const foreignOngoing = createRuntimeCardInstance(
    foe,
    foreignOngoingDefinition.cardId,
    "fixture-wp002-foe-ongoing"
  );
  foe.deck = [];
  foe.discard = [foreignOngoing];
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "play_top_card_from_foe_deck"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === foe.playerId)
        )
      : undefined;

  assert.deepEqual(
    applyAction(state, {
      type: "activateWizardProperty",
      tokenInstanceId: property.instanceId,
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 2);
  assert.equal(foreignOngoing.ownerId, foe.playerId);
  assert.equal(foe.discard.includes(foreignOngoing), true);
  assert.equal(player.permanents.includes(foreignOngoing), false);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "discardShuffledIntoDeck" &&
        event.playerId === foe.playerId
    )
  );
  assert.deepEqual(
    applyAction(state, {
      type: "activateWizardProperty",
      tokenInstanceId: property.instanceId,
    }),
    { ok: false, error: "Wizard property cannot be activated" }
  );
});

test("ЖДК 006 сначала выбирает врага и передаёт ему случайную карту из сброса", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 3,
    seed: 310006,
  });
  const attacker = mustGetPlayer(state, state.activePlayerId);
  const recipient = getOpponentsInSeatingOrder(state, attacker)[0];
  assert.ok(recipient);
  const chosenFoe = getOpponentsInSeatingOrder(state, recipient).find(
    (player) => player.playerId !== attacker.playerId
  );
  assert.ok(chosenFoe);

  for (const player of state.players) {
    player.hand = [];
    player.discard = [];
  }
  recipient.life.current = 1;
  const transferredCard = createRuntimeCardInstance(
    recipient,
    "esw2_dbg__main_001",
    "dwt006-random-discard"
  );
  recipient.discard = [transferredCard];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt006"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_006"),
      ownerId: "common",
    },
  ];

  const expectedRng = state.rng.fork();
  expectedRng.nextInt(recipient.discard.length);
  const expectedNextRandomValue = expectedRng.next();
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
  });
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === recipient.playerId)
      );
    }
    if (effectId === "dead_wizard_token_random_discard_to_chosen_foe") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === chosenFoe.playerId)
      );
    }
    return undefined;
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attack,
  });

  assert.equal(result.ok, true);
  assert.equal(recipient.discard.includes(transferredCard), false);
  assert.equal(chosenFoe.discard.includes(transferredCard), true);
  assert.equal(transferredCard.ownerId, chosenFoe.playerId);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "dead_wizard_token_random_discard_to_chosen_foe" &&
        event.playerId === recipient.playerId &&
        event.targetPlayerId === chosenFoe.playerId
    )
  );
});

test("ЖДК 006 не расходует RNG при пустом собственном сбросе", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 3,
    seed: 310007,
  });
  const attacker = mustGetPlayer(state, state.activePlayerId);
  const recipient = getOpponentsInSeatingOrder(state, attacker)[0];
  assert.ok(recipient);
  const chosenFoe = getOpponentsInSeatingOrder(state, recipient)[0];
  assert.ok(chosenFoe);

  for (const player of state.players) {
    player.hand = [];
    player.discard = [];
  }
  recipient.life.current = 1;
  const expectedNextRandomValue = state.rng.fork().next();
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt006-empty"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_006"),
      ownerId: "common",
    },
  ];
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
  });
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === recipient.playerId)
      );
    }
    if (effectId === "dead_wizard_token_random_discard_to_chosen_foe") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === chosenFoe.playerId)
      );
    }
    return undefined;
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attack,
  });

  assert.equal(result.ok, true);
  assert.equal(chosenFoe.discard.length, 0);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectCardGained" &&
        event.effectId === "dead_wizard_token_random_discard_to_chosen_foe"
    ),
    false
  );
});

test("ЖДК 010 даёт врагам по очереди передавать Знак в руку получателя", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 4,
    seed: 310010,
  });
  const attacker = mustGetPlayer(state, state.activePlayerId);
  const recipient = getOpponentsInSeatingOrder(state, attacker)[0];
  assert.ok(recipient);
  const foes = getOpponentsInSeatingOrder(state, recipient);
  const firstFoe = foes[0];
  const secondFoe = foes[1];
  const emptyFoe = foes[2];
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  assert.ok(emptyFoe);

  for (const player of state.players) {
    player.hand = [];
    player.discard = [];
  }
  const signFromHand = createRuntimeCardInstance(
    firstFoe,
    "esw2_dbg__starter_001",
    "dwt010-hand-sign"
  );
  const signFromDiscard = createRuntimeCardInstance(
    secondFoe,
    "esw2_dbg__starter_001",
    "dwt010-discard-sign"
  );
  firstFoe.hand = [signFromHand];
  secondFoe.discard = [signFromDiscard];
  recipient.life.current = 1;
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt010"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_010"),
      ownerId: "common",
    },
  ];
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    targetSelector: "chosenFoe",
  });
  const chooserIds: string[] = [];
  state.effectChoiceStrategy = ({ effectId, player, choices }) => {
    if (effectId === "attack_damage") {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === recipient.playerId)
      );
    }
    if (effectId !== "dead_wizard_token_each_foe_optional_transfer_sign") {
      return undefined;
    }
    chooserIds.push(player.playerId);
    const selectedCard =
      player.playerId === firstFoe.playerId
        ? signFromHand
        : player.playerId === secondFoe.playerId
          ? signFromDiscard
          : undefined;
    return toChoiceSelection(
      choices.find((choice) => choice.choiceId === selectedCard?.instanceId)
    );
  };

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: attack,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(chooserIds, [firstFoe.playerId, secondFoe.playerId]);
  assert.equal(recipient.hand.includes(signFromHand), true);
  assert.equal(recipient.hand.includes(signFromDiscard), true);
  assert.equal(signFromHand.ownerId, recipient.playerId);
  assert.equal(signFromDiscard.ownerId, recipient.playerId);
  assert.equal(emptyFoe.hand.length, 0);
  assert.equal(emptyFoe.discard.length, 0);
  assert.deepEqual(state.turn.gainedCards, []);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "dead_wizard_token_each_foe_optional_transfer_sign"
    )
  );
  const choiceEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "dead_wizard_token_each_foe_optional_transfer_sign"
  );
  assert.deepEqual(
    choiceEvents.map((event) => event.playerId),
    [firstFoe.playerId, secondFoe.playerId]
  );
});

test("ЖДК 008 сначала спрашивает effective Legend для каждого Фамильяра", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 2,
    seed: 310008,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_003");
  assert.ok(property);
  replaceFirstWizardProperty(state, player, property);
  player.hand = [];
  player.deck = [];
  player.discard = [];
  player.playedThisTurn = [];
  player.permanents = [];
  player.effectiveCardTypeSelections = [];

  const deckCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt008-deck"
  );
  const realLegend = createRuntimeCardInstance(
    player,
    "esw2_dbg__legend_001",
    "dwt008-real-legend"
  );
  const selectedFamiliar = createRuntimeCardInstance(
    player,
    "esw2_dbg__familiar_007",
    "dwt008-selected-familiar"
  );
  const declinedFamiliar = createRuntimeCardInstance(
    player,
    "esw2_dbg__familiar_009",
    "dwt008-declined-familiar"
  );
  const ordinaryCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt008-ordinary"
  );
  player.deck = [deckCard];
  player.hand = [realLegend, selectedFamiliar, declinedFamiliar, ordinaryCard];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt008"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_008"),
      ownerId: "common",
    },
  ];

  const expectedDeck = [deckCard, realLegend, selectedFamiliar];
  const expectedRng = state.rng.fork();
  shuffleDeck(expectedDeck, expectedRng);
  const expectedNextRandomValue = expectedRng.next();
  const choiceEvents: string[] = [];
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "dead_wizard_token_shuffle_hand_legends") {
      return undefined;
    }
    const selectedCardId =
      choiceEvents.length === 0
        ? selectedFamiliar.instanceId
        : declinedFamiliar.instanceId;
    choiceEvents.push(selectedCardId);
    if (selectedCardId === declinedFamiliar.instanceId) {
      return toChoiceSelection(
        choices.find((choice) => choice.choiceId === "decline")
      );
    }
    const selectedChoice = choices.find(
      (choice) =>
        choice.choiceKind === "cardTarget" &&
        choice.targetCardInstanceIds.includes(selectedCardId)
    );
    return toChoiceSelection(
      selectedChoice ?? choices.find((choice) => choice.choiceId === "decline")
    );
  };

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(choiceEvents, [
    selectedFamiliar.instanceId,
    declinedFamiliar.instanceId,
  ]);
  assert.deepEqual(player.deck, expectedDeck);
  assert.equal(player.hand.includes(realLegend), false);
  assert.equal(player.hand.includes(selectedFamiliar), false);
  assert.equal(player.hand.includes(declinedFamiliar), true);
  assert.equal(player.hand.includes(ordinaryCard), true);
  assert.equal(realLegend.ownerId, player.playerId);
  assert.equal(selectedFamiliar.ownerId, player.playerId);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
  assertEventOrder(state, [
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "dead_wizard_token_shuffle_hand_legends" &&
      event.targetCardInstanceId === selectedFamiliar.instanceId,
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "dead_wizard_token_shuffle_hand_legends" &&
      event.choiceId === "decline" &&
      event.choiceIds.includes(
        `count_as_legend_${declinedFamiliar.instanceId}`
      ),
    (event) =>
      event.type === "cardMoved" &&
      event.cardInstanceId === realLegend.instanceId &&
      event.destinationZone === `${player.playerId}.deck`,
  ]);
});

test("ЖДК 008 не расходует RNG при пустом выборе легенд", () => {
  const state = initializeGame({
    rootDir,
    seed: 3100081,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const property = state.tokenDefinitions.get("esw2_dbg__wizard_property_003");
  assert.ok(property);
  replaceFirstWizardProperty(state, player, property);
  player.hand = [
    createRuntimeCardInstance(
      player,
      "esw2_dbg__familiar_007",
      "dwt008-empty-selection"
    ),
  ];
  const deckBefore = player.deck.slice();
  const expectedNextRandomValue = state.rng.fork().next();
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt008-empty"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_008"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "dead_wizard_token_shuffle_hand_legends"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === "decline")
        )
      : undefined;

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(player.deck, deckBefore);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" &&
        event.effectId === "dead_wizard_token_shuffle_hand_legends"
    ),
    false
  );
});

test("ЖДК 009 замешивает только свои активные постоянки", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 3,
    seed: 310009,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foreignOwner = getOpponentsInSeatingOrder(state, player)[0];
  assert.ok(foreignOwner);
  player.permanents = [];
  player.deck = [];
  player.hand = [];
  player.discard = [];
  const ownPermanent = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_011",
    "dwt009-own-permanent"
  );
  const foreignPermanent = createRuntimeCardInstance(
    foreignOwner,
    "esw2_dbg__main_005",
    "dwt009-foreign-permanent"
  );
  const deckCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt009-deck"
  );
  player.permanents = [ownPermanent];
  foreignOwner.permanents = [foreignPermanent];
  player.deck = [deckCard];
  state.turn.temporaryCardControls = [
    { cardInstanceId: ownPermanent.instanceId, controllerId: player.playerId },
    {
      cardInstanceId: foreignPermanent.instanceId,
      controllerId: player.playerId,
    },
  ];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt009"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_009"),
      ownerId: "common",
    },
  ];

  const expectedDeck = [deckCard, ownPermanent];
  const expectedRng = state.rng.fork();
  shuffleDeck(expectedDeck, expectedRng);
  const expectedNextRandomValue = expectedRng.next();

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(player.deck, expectedDeck);
  assert.equal(player.permanents.includes(ownPermanent), false);
  assert.equal(foreignOwner.permanents.includes(foreignPermanent), true);
  assert.equal(ownPermanent.ownerId, player.playerId);
  assert.equal(foreignPermanent.ownerId, foreignOwner.playerId);
  assert.equal(
    state.turn.temporaryCardControls.some(
      (control) => control.cardInstanceId === ownPermanent.instanceId
    ),
    false
  );
  assert.equal(
    state.turn.temporaryCardControls.some(
      (control) => control.cardInstanceId === foreignPermanent.instanceId
    ),
    true
  );
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
});

test("ЖДК 011 сначала собирает решения врагов, затем требует сбросить точное число карт", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 4,
    seed: 310011,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foes = getOpponentsInSeatingOrder(state, player);
  const firstFoe = foes[0];
  const secondFoe = foes[1];
  const thirdFoe = foes[2];
  assert.ok(firstFoe);
  assert.ok(secondFoe);
  assert.ok(thirdFoe);
  player.hand = [
    createRuntimeCardInstance(player, "esw2_dbg__main_001", "dwt011-first"),
    createRuntimeCardInstance(player, "esw2_dbg__main_001", "dwt011-second"),
  ];
  const [firstCard, secondCard] = player.hand;
  assert.ok(firstCard);
  assert.ok(secondCard);
  const chooserIds: string[] = [];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt011"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_011"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId, player: chooser, choices }) => {
    if (effectId !== "dead_wizard_token_each_foe_optional_discard") {
      return undefined;
    }
    chooserIds.push(chooser.playerId);
    if (chooser.playerId === player.playerId) {
      return toChoiceSelection(
        choices.find(
          (choice) =>
            choice.choiceKind === "cardTarget" &&
            choice.amount === 2 &&
            choice.targetCardInstanceIds.includes(firstCard.instanceId) &&
            choice.targetCardInstanceIds.includes(secondCard.instanceId)
        )
      );
    }
    return toChoiceSelection(
      choices.find(
        (choice) =>
          choice.choiceId ===
          (chooser.playerId === secondFoe.playerId ? "decline" : "apply")
      )
    );
  };

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(chooserIds, [
    firstFoe.playerId,
    secondFoe.playerId,
    thirdFoe.playerId,
    player.playerId,
  ]);
  assert.equal(player.hand.length, 0);
  assert.deepEqual(player.discard.slice(-2), [firstCard, secondCard]);
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId === "dead_wizard_token_each_foe_optional_discard"
      )
      .map((event) => event.playerId),
    [firstFoe.playerId, secondFoe.playerId, thirdFoe.playerId, player.playerId]
  );
});

test("ЖДК 011 не создаёт выбор сброса при пустой руке получателя", () => {
  const state = initializeGame({
    rootDir,
    playerCount: 3,
    seed: 3100111,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.hand = [];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt011-empty"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_011"),
      ownerId: "common",
    },
  ];
  const chooserIds: string[] = [];
  state.effectChoiceStrategy = ({ effectId, player: chooser }) => {
    if (effectId !== "dead_wizard_token_each_foe_optional_discard") {
      return undefined;
    }
    chooserIds.push(chooser.playerId);
    return { choiceId: "apply" };
  };

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(
    chooserIds,
    getOpponentsInSeatingOrder(state, player).map((foe) => foe.playerId)
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSelected" &&
        event.effectId === "dead_wizard_token_each_foe_optional_discard" &&
        event.playerId === player.playerId
    ),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectCardDiscarded" &&
        event.effectId === "dead_wizard_token_each_foe_optional_discard"
    ),
    false
  );
});

test("ЖДК 024 раскрывает верхнюю карту и уничтожает её по выбору", () => {
  const state = initializeGame({
    rootDir,
    seed: 310024,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const revealedCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt024-destroy"
  );
  player.deck = [revealedCard];
  player.discard = [];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt024-destroy"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_024"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "dead_wizard_token_reveal_and_optional_destroy"
      ? toChoiceSelection(
          choices.find(
            (choice) => choice.choiceId === `destroy_${revealedCard.instanceId}`
          )
        )
      : undefined;

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.equal(player.deck.includes(revealedCard), false);
  assert.equal(state.common.destroyedPile.includes(revealedCard), true);
  assert.equal(revealedCard.ownerId, player.playerId);
  assertEventOrder(state, [
    (event) =>
      event.type === "effectCardRevealed" &&
      event.effectId === "dead_wizard_token_reveal_and_optional_destroy" &&
      event.targetCardInstanceId === revealedCard.instanceId,
    (event) =>
      event.type === "effectChoiceSelected" &&
      event.effectId === "dead_wizard_token_reveal_and_optional_destroy" &&
      event.targetCardInstanceId === revealedCard.instanceId,
    (event) =>
      event.type === "cardMoved" &&
      event.cardInstanceId === revealedCard.instanceId &&
      event.destinationZone === "destroyedPile",
  ]);
});

test("ЖДК 024 оставляет раскрытую карту наверху при отказе", () => {
  const state = initializeGame({
    rootDir,
    seed: 3100241,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const revealedCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt024-decline"
  );
  player.deck = [revealedCard];
  player.discard = [];
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt024-decline"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_024"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "dead_wizard_token_reveal_and_optional_destroy"
      ? { choiceId: "decline" }
      : undefined;

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(player.deck, [revealedCard]);
  assert.equal(state.common.destroyedPile.includes(revealedCard), false);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "cardMoved" &&
        event.cardInstanceId === revealedCard.instanceId &&
        event.effectId === "dead_wizard_token_reveal_and_optional_destroy"
    ),
    false
  );
});

test("ЖДК 024 пополняет пустую колоду из сброса перед раскрытием", () => {
  const state = initializeGame({
    rootDir,
    seed: 3100242,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  const firstDiscardCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt024-refill-first"
  );
  const secondDiscardCard = createRuntimeCardInstance(
    player,
    "esw2_dbg__main_001",
    "dwt024-refill-second"
  );
  player.deck = [];
  player.discard = [firstDiscardCard, secondDiscardCard];
  const expectedDeck = player.discard.slice();
  const expectedRng = state.rng.fork();
  shuffleDeck(expectedDeck, expectedRng);
  const expectedNextRandomValue = expectedRng.next();
  const revealedCard = expectedDeck[0];
  assert.ok(revealedCard);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt024-refill"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_024"),
      ownerId: "common",
    },
  ];
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "dead_wizard_token_reveal_and_optional_destroy"
      ? { choiceId: "decline" }
      : undefined;

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.deepEqual(player.deck, expectedDeck);
  assert.equal(player.discard.length, 0);
  assert.equal(player.deck[0], revealedCard);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
});

test("ЖДК 024 ничего не делает при пустых колоде и сбросе", () => {
  const state = initializeGame({
    rootDir,
    seed: 3100243,
  });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.deck = [];
  player.discard = [];
  const expectedNextRandomValue = state.rng.fork().next();
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt024-empty"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_024"),
      ownerId: "common",
    },
  ];
  let choiceCount = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "dead_wizard_token_reveal_and_optional_destroy") {
      choiceCount += 1;
    }
    return undefined;
  };

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.equal(choiceCount, 0);
  assert.equal(state.rng.fork().next(), expectedNextRandomValue);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectRevealSkipped" &&
        event.effectId === "dead_wizard_token_reveal_and_optional_destroy"
    ),
    true
  );
});

test("ЖДК 001 считает реальные и fixture-легенды в сбросе, но не превышает остаток стопки палочек", () => {
  const state = initializeGame({ rootDir, seed: 310001 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foe = getOpponentsInSeatingOrder(state, player)[0];
  assert.ok(foe);
  player.wizardProperties = [];
  const wizardProperty003 = state.tokenDefinitions.get(
    "esw2_dbg__wizard_property_003"
  );
  assert.ok(wizardProperty003);
  assert.equal(wizardProperty003.kind, "wizardProperty");
  foe.wizardProperties = [
    {
      instanceId: markTokenInstanceId("fixture-dwt001-wizard-property-003"),
      definitionId: markTokenDefinitionId(wizardProperty003.tokenId),
      ownerId: foe.playerId,
    },
  ];
  foe.life.current = 1;
  const realLegend = createRuntimeCardInstance(
    foe,
    "esw2_dbg__legend_001",
    "fixture-dwt001-real-legend"
  );
  const effectiveLegendDefinition = createFixtureCardDefinition(
    "fixture-dwt001-effective-legend",
    [],
    { cardKind: "familiar", cardTypes: ["familiar"] }
  );
  const unselectedFamiliarDefinition = createFixtureCardDefinition(
    "fixture-dwt001-unselected-familiar",
    [],
    { cardKind: "familiar", cardTypes: ["familiar"] }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [effectiveLegendDefinition.cardId, effectiveLegendDefinition],
    [unselectedFamiliarDefinition.cardId, unselectedFamiliarDefinition],
  ]);
  const effectiveLegend = createRuntimeCardInstance(
    foe,
    effectiveLegendDefinition.cardId,
    "fixture-dwt001-effective-legend"
  );
  const unselectedFamiliar = createRuntimeCardInstance(
    foe,
    unselectedFamiliarDefinition.cardId,
    "fixture-dwt001-unselected-familiar"
  );
  foe.effectiveCardTypeSelections.push({
    cardInstanceId: effectiveLegend.instanceId,
    cardType: "legend",
  });
  foe.discard = [realLegend, effectiveLegend, unselectedFamiliar];
  const wand = state.common.limpWandStack[0];
  assert.ok(wand);
  state.common.limpWandStack.splice(3);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt001"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_001"),
      ownerId: "common",
    },
  ];
  const attack = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-dwt001-death", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        amount: 1,
      },
    ])
  );
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === foe.playerId)
        )
      : undefined;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack.instanceId }),
    { ok: true }
  );

  assert.equal(state.common.limpWandStack.length, 1);
  const gainedWands = foe.discard.filter(
    (card) => card.definitionId === wand.definitionId
  );
  assert.equal(gainedWands.length, 2);
  assert.equal(
    gainedWands.every((card) => card.ownerId === foe.playerId),
    true
  );
});

test("ЖДК 018 кладёт палочку наверх колоды и не меняет состояние при пустой special stack", () => {
  const resolveDwt018Death = (hasLimpWand: boolean) => {
    const state = initializeGame({ rootDir, seed: 310018 });
    const player = mustGetPlayer(state, state.activePlayerId);
    const foe = getOpponentsInSeatingOrder(state, player)[0];
    assert.ok(foe);
    player.wizardProperties = [];
    foe.wizardProperties = [];
    foe.life.current = 1;
    foe.deck = [];
    foe.discard = [];
    const wand = state.common.limpWandStack[0];
    if (hasLimpWand) {
      assert.ok(wand);
      state.common.limpWandStack.splice(1);
    } else {
      state.common.limpWandStack = [];
    }
    state.common.deadWizardTokens.drawStack = [
      {
        instanceId: markTokenInstanceId(
          `fixture-dwt018-${hasLimpWand ? "wand" : "empty"}`
        ),
        definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_018"),
        ownerId: "common",
      },
    ];
    const attack = addFixtureDefinitionToActiveHand(
      state,
      createFixtureCardDefinition(
        `fixture-dwt018-death-${hasLimpWand ? "wand" : "empty"}`,
        [
          {
            effectId: "attack_damage",
            timing: "onPlay",
            targetSelector: "chosenFoe",
            amount: 1,
          },
        ]
      )
    );
    state.effectChoiceStrategy = ({ effectId, choices }) =>
      effectId === "attack_damage"
        ? toChoiceSelection(
            choices.find((choice) => choice.choiceId === foe.playerId)
          )
        : undefined;

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attack.instanceId,
      }),
      { ok: true }
    );
    return { foe, state, wand };
  };

  const withWand = resolveDwt018Death(true);
  assert.ok(withWand.wand);
  assert.deepEqual(withWand.foe.deck, [withWand.wand]);
  assert.equal(withWand.wand.ownerId, withWand.foe.playerId);
  assert.equal(withWand.state.common.limpWandStack.length, 0);

  const emptyStack = resolveDwt018Death(false);
  assert.deepEqual(emptyStack.foe.deck, []);
  assert.equal(emptyStack.state.common.limpWandStack.length, 0);
});

test("endTurn проверяет start-of-turn эффекты следующего игрока до мутаций", () => {
  const state = initializeGame({ rootDir, seed: 246030 });
  const activePlayer = mustGetPlayer(state, state.activePlayerId);
  const nextPlayer = state.players.find(
    (player) => player.playerId !== activePlayer.playerId
  );
  assert.ok(nextPlayer);
  const invalidStartEffect = {
    effectId: "ongoing_start_turn_optional_gain_limp_wand_to_hand",
    timing: "onPlay",
    destination: "hand",
    amount: 1,
    chooser: "controller",
  } as unknown as RuntimeEffect;
  const definition = createFixtureCardDefinition(
    "fixture-invalid-start-of-turn-effect",
    [invalidStartEffect],
    { isOngoing: true }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  nextPlayer.permanents.push({
    instanceId: markCardInstanceId("fixture-invalid-start-of-turn-effect"),
    definitionId: markCardDefinitionId(definition.cardId),
    ownerId: nextPlayer.playerId,
    marketChips: 0,
  });
  const activeHand = activePlayer.hand.slice();
  const eventLog = state.eventLog.slice();
  const turnNumber = state.turn.number;

  const result = applyAction(state, { type: "endTurn" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /uses unsupported timing onPlay/);
  assert.equal(state.activePlayerId, activePlayer.playerId);
  assert.equal(state.turn.number, turnNumber);
  assert.deepEqual(activePlayer.hand, activeHand);
  assert.deepEqual(state.eventLog, eventLog);
});

test("прямая выдача ЖДК не воскрешает игрока и разрешает лицо сразу", () => {
  const state = initializeGame({ rootDir, seed: 301018 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.life.current = 3;
  player.wizardProperties = [];
  const wand = state.common.limpWandStack[0];
  assert.ok(wand);
  state.common.limpWandStack.splice(1);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-direct-dwt018"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_018"),
      ownerId: "common",
    },
  ];

  const result = resolveWithinDeadWizardTokenResolutionBoundary(state, () => {
    const gained = gainDeadWizardToken(state, player);
    assert.deepEqual(gained, { ok: true });
    assert.equal(player.life.current, 3);
    assert.equal(player.deadWizardTokens.length, 1);
    assert.equal(player.deck[0], wand);
    return { ok: true };
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(player.deck[0], wand);
  assert.equal(
    state.eventLog.some((event) => event.type === "playerResurrected"),
    false
  );
  assert.equal(
    state.eventLog.some((event) => event.type === "playerDied"),
    false
  );
  assert.equal(
    state.eventLog.filter((event) => event.type === "deadWizardTokenGained")
      .length,
    1
  );
  assert.equal(
    state.eventLog.filter(
      (event) => event.type === "deadWizardTokenFaceResolved"
    ).length,
    1
  );
});

test("ЖДК 015 выдаёт получателю одну чипсину сразу внутри внешней границы", () => {
  const state = initializeGame({ rootDir, seed: 303015 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.chips = 0;
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt015"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
  ];

  const result = resolveWithinDeadWizardTokenResolutionBoundary(state, () => {
    assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });
    assert.equal(player.chips, 1);
    return { ok: true };
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(player.chips, 1);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsGained" &&
        event.playerId === player.playerId &&
        event.effectId === "dead_wizard_token_gain_chips" &&
        event.amount === 1 &&
        event.definitionId === "esw2_dbg__dead_wizard_token_015"
    )
  );
});

test("не-ATTACK смерть лица ЖДК разрешает следующий gain вложенно", () => {
  const state = initializeGame({ rootDir, seed: 301019 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.life.current = 20;
  const deathFace = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt-direct-non-attack-death",
    [
      {
        effectId: "set_life",
        timing: "onDeadWizardTokenFace",
        lifeTotal: 0,
        target: { selector: "activePlayer" },
      },
    ]
  );
  const followupFace = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt-direct-non-attack-followup",
    [
      {
        effectId: "dead_wizard_token_gain_chips",
        timing: "onDeadWizardTokenFace",
        amount: 1,
      },
    ]
  );
  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [deathFace.tokenId, deathFace],
    [followupFace.tokenId, followupFace],
  ]);
  const firstToken = {
    instanceId: markTokenInstanceId("fixture-dwt-direct-non-attack-first"),
    definitionId: markTokenDefinitionId(deathFace.tokenId),
    ownerId: "common" as const,
  };
  const secondToken = {
    instanceId: markTokenInstanceId("fixture-dwt-direct-non-attack-second"),
    definitionId: markTokenDefinitionId(followupFace.tokenId),
    ownerId: "common" as const,
  };
  state.common.deadWizardTokens.drawStack = [firstToken, secondToken];

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });
  assert.equal(player.life.current, 20);
  assert.equal(player.chips, 1);
  assert.deepEqual(
    player.deadWizardTokens.map((token) => token.instanceId),
    [firstToken.instanceId, secondToken.instanceId]
  );
  assertEventOrder(state, [
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.tokenInstanceId === firstToken.instanceId,
    (event) =>
      event.type === "playerDied" && event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenGained" &&
      event.tokenInstanceId === secondToken.instanceId,
    (event) =>
      event.type === "playerResurrected" && event.playerId === player.playerId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.tokenInstanceId === secondToken.instanceId,
    (event) =>
      event.type === "deadWizardTokenFaceResolved" &&
      event.tokenInstanceId === firstToken.instanceId,
  ]);
});

test("ЖДК 012 выдаёт по одной чипсине противникам в порядке рассадки", () => {
  const state = initializeGame({ rootDir, seed: 303012 });
  const player = mustGetPlayer(state, state.activePlayerId);
  const foes = getOpponentsInSeatingOrder(state, player);
  player.chips = 0;
  for (const foe of foes) {
    foe.chips = 0;
  }
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt012"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_012"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

  assert.equal(player.chips, 0);
  assert.deepEqual(
    foes.map((foe) => foe.chips),
    foes.map(() => 1)
  );
  assert.deepEqual(
    state.eventLog
      .filter(
        (event) =>
          event.type === "effectChipsGained" &&
          event.effectId === "dead_wizard_token_each_foe_gain_chips"
      )
      .map((event) => event.playerId),
    foes.map((foe) => foe.playerId)
  );
});

test("ЖДК 021 отнимает половину чипсин, округляя вверх, без оплаты стоимости", () => {
  const cases = [
    { chipsBefore: 0, chipsAfter: 0 },
    { chipsBefore: 1, chipsAfter: 0 },
    { chipsBefore: 2, chipsAfter: 1 },
    { chipsBefore: 5, chipsAfter: 2 },
  ];

  for (const { chipsBefore, chipsAfter } of cases) {
    const state = initializeGame({ rootDir, seed: 303021 + chipsBefore });
    const player = mustGetPlayer(state, state.activePlayerId);
    player.chips = chipsBefore;
    state.common.deadWizardTokens.drawStack = [
      {
        instanceId: markTokenInstanceId(`fixture-dwt021-${chipsBefore}`),
        definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_021"),
        ownerId: "common",
      },
    ];

    assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });

    assert.equal(player.chips, chipsAfter);
    assert.equal(
      state.eventLog.some((event) => event.type === "effectCostPaid"),
      false
    );
    assert.ok(
      state.eventLog.some(
        (event) =>
          event.type === "effectChipsGained" &&
          event.effectId === "dead_wizard_token_lose_half_chips" &&
          event.amount === chipsAfter - chipsBefore
      )
    );
  }
});

test("ЖДК 017 выдаёт две чипсины убийце до следующего эффекта карты", () => {
  const state = initializeGame({ rootDir, seed: 304017 });
  const killer = mustGetPlayer(state, state.activePlayerId);
  const defeatedPlayer = getOpponentsInSeatingOrder(state, killer)[0];
  assert.ok(defeatedPlayer);
  killer.wizardProperties = [];
  defeatedPlayer.wizardProperties = [];
  killer.chips = 0;
  defeatedPlayer.life.current = 1;
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt017"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_017"),
      ownerId: "common",
    },
  ];
  const attack = addFixtureDefinitionToActiveHand(
    state,
    createFixtureCardDefinition("fixture-dwt017-death", [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        targetSelector: "chosenFoe",
        amount: 1,
      },
      { effectId: "gain_chips", timing: "onPlay", amount: 1 },
    ])
  );
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === defeatedPlayer.playerId)
        )
      : undefined;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack.instanceId }),
    { ok: true }
  );

  assert.equal(killer.chips, 3);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsGained" &&
        event.definitionId === "esw2_dbg__dead_wizard_token_017" &&
        event.effectId === "dead_wizard_token_reward_killer_chips" &&
        event.playerId === killer.playerId &&
        event.amount === 2
    )
  );
  assertEventOrder(state, [
    (event) =>
      event.type === "effectChipsGained" &&
      event.definitionId === "esw2_dbg__dead_wizard_token_017" &&
      event.effectId === "dead_wizard_token_reward_killer_chips" &&
      event.playerId === killer.playerId &&
      event.amount === 2,
    (event) =>
      event.type === "effectChipsGained" &&
      event.definitionId === attack.definitionId &&
      event.effectId === "gain_chips",
  ]);
});

test("ЖДК 007 позволяет только убившему лошаре снять статус", () => {
  for (const [choiceId, remainsDingler] of [
    ["apply", false],
    ["decline", true],
  ] as const) {
    const state = initializeGame({ rootDir, seed: 305007 });
    const killer = mustGetPlayer(state, state.activePlayerId);
    const defeatedPlayer = getOpponentsInSeatingOrder(state, killer)[0];
    assert.ok(defeatedPlayer);
    for (const player of state.players) {
      player.wizardProperties = [];
    }
    killer.statuses = [
      {
        instanceId: markCardInstanceId(`fixture-dwt007-dingler-${choiceId}`),
        statusId: "dingler",
        ownerId: killer.playerId,
        effects: [],
      },
    ];
    defeatedPlayer.life.current = 1;
    state.common.deadWizardTokens.drawStack = [
      {
        instanceId: markTokenInstanceId(`fixture-dwt007-${choiceId}`),
        definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_007"),
        ownerId: "common",
      },
    ];
    const attack = addFixtureDefinitionToActiveHand(
      state,
      createFixtureCardDefinition(`fixture-dwt007-death-${choiceId}`, [
        {
          effectId: "attack_damage",
          timing: "onPlay",
          targetSelector: "chosenFoe",
          amount: 1,
        },
      ])
    );
    state.effectChoiceStrategy = ({ effectId, choices }) => {
      if (effectId === "attack_damage") {
        return toChoiceSelection(
          choices.find((choice) => choice.choiceId === defeatedPlayer.playerId)
        );
      }
      return effectId === "dead_wizard_token_killer_optional_remove_dingler"
        ? toChoiceSelection(
            choices.find((choice) => choice.choiceId === choiceId)
          )
        : undefined;
    };

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attack.instanceId,
      }),
      { ok: true }
    );
    assert.equal(
      killer.statuses.some((status) => status.statusId === "dingler"),
      remainsDingler
    );
    assert.ok(
      state.eventLog.some(
        (event) =>
          event.type === "effectChoiceSelected" &&
          event.effectId ===
            "dead_wizard_token_killer_optional_remove_dingler" &&
          event.playerId === killer.playerId &&
          event.choiceId === choiceId
      )
    );
  }

  const directState = initializeGame({ rootDir, seed: 3050071 });
  const recipient = mustGetPlayer(directState, directState.activePlayerId);
  recipient.statuses = [
    {
      instanceId: markCardInstanceId("fixture-dwt007-direct-dingler"),
      statusId: "dingler",
      ownerId: recipient.playerId,
      effects: [],
    },
  ];
  directState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt007-direct"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_007"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(directState, recipient), { ok: true });
  assert.equal(
    recipient.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(
    directState.eventLog.some((event) => event.type === "effectChoiceSelected"),
    false
  );
});

test("ЖДК 017 вознаграждает player-attributed самоубийство без перемещения главного приза", () => {
  const state = initializeGame({ rootDir, seed: 3040171 });
  const player = mustGetPlayer(state, state.activePlayerId);
  player.wizardProperties = [];
  player.life.current = 1;
  player.chips = 0;
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt017-self-kill"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_017"),
      ownerId: "common",
    },
  ];
  const selfDamage = addFixtureCardToActiveHand(state, {
    effectId: "deal_damage",
    timing: "onPlay",
    amount: 1,
    target: { selector: "activePlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: selfDamage }),
    { ok: true }
  );

  assert.equal(player.chips, 2);
  assert.equal(
    state.eventLog.some((event) => event.type === "trophyControlChanged"),
    false
  );
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChipsGained" &&
        event.effectId === "dead_wizard_token_reward_killer_chips" &&
        event.playerId === player.playerId &&
        event.amount === 2
    )
  );
});

test("ЖДК 027 делает нормального лошарой, а лошаре полностью разрешает ещё один ЖДК", () => {
  const normalState = initializeGame({ rootDir, seed: 305027 });
  const normalPlayer = mustGetPlayer(normalState, normalState.activePlayerId);
  normalPlayer.wizardProperties = [];
  normalState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt027-normal"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_027"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(normalState, normalPlayer), {
    ok: true,
  });
  assert.equal(
    normalPlayer.statuses.some((status) => status.statusId === "dingler"),
    true
  );
  assert.equal(normalPlayer.deadWizardTokens.length, 1);

  const recursiveState = initializeGame({ rootDir, seed: 3050271 });
  const recursivePlayer = mustGetPlayer(
    recursiveState,
    recursiveState.activePlayerId
  );
  recursivePlayer.wizardProperties = [];
  recursivePlayer.chips = 0;
  recursivePlayer.statuses = [
    {
      instanceId: markCardInstanceId("fixture-dwt027-dingler"),
      statusId: "dingler",
      ownerId: recursivePlayer.playerId,
      effects: [],
    },
  ];
  recursiveState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt027-recursive"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_027"),
      ownerId: "common",
    },
    {
      instanceId: markTokenInstanceId("fixture-dwt027-recursive-followup"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_015"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(recursiveState, recursivePlayer), {
    ok: true,
  });
  assert.deepEqual(
    recursivePlayer.deadWizardTokens.map((token) => token.definitionId),
    ["esw2_dbg__dead_wizard_token_027", "esw2_dbg__dead_wizard_token_015"]
  );
  assert.equal(recursivePlayer.chips, 1);
  assert.equal(
    recursiveState.eventLog.filter(
      (event) => event.type === "deadWizardTokenFaceResolved"
    ).length,
    2
  );
  assert.equal(
    recursiveState.eventLog.some((event) => event.type === "playerDied"),
    false
  );
  assert.equal(
    recursiveState.eventLog.some((event) => event.type === "playerResurrected"),
    false
  );

  const emptyStackState = initializeGame({ rootDir, seed: 3050272 });
  const emptyStackPlayer = mustGetPlayer(
    emptyStackState,
    emptyStackState.activePlayerId
  );
  emptyStackPlayer.statuses = [
    {
      instanceId: markCardInstanceId("fixture-dwt027-empty-stack-dingler"),
      statusId: "dingler",
      ownerId: emptyStackPlayer.playerId,
      effects: [],
    },
  ];
  emptyStackState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt027-empty-stack"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_027"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(emptyStackState, emptyStackPlayer), {
    ok: true,
  });
  assert.equal(emptyStackPlayer.deadWizardTokens.length, 1);
});

test("ЖДК 028 меняет исходный Dingler-статус получателя", () => {
  for (const isDingler of [false, true]) {
    const state = initializeGame({
      rootDir,
      seed: isDingler ? 3050281 : 305028,
    });
    const player = mustGetPlayer(state, state.activePlayerId);
    player.wizardProperties = [];
    if (isDingler) {
      player.statuses = [
        {
          instanceId: markCardInstanceId("fixture-dwt028-dingler"),
          statusId: "dingler",
          ownerId: player.playerId,
          effects: [],
        },
      ];
    }
    state.common.deadWizardTokens.drawStack = [
      {
        instanceId: markTokenInstanceId(
          `fixture-dwt028-${isDingler ? "dingler" : "normal"}`
        ),
        definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_028"),
        ownerId: "common",
      },
    ];

    assert.deepEqual(gainDeadWizardToken(state, player), { ok: true });
    assert.equal(
      state.players
        .find((candidate) => candidate.playerId === player.playerId)
        ?.statuses.some((status) => status.statusId === "dingler"),
      !isDingler
    );
  }
});

test("прямой и вложенный ЖДК 017 не наследуют убийцу", () => {
  const directState = initializeGame({ rootDir, seed: 3040172 });
  const directRecipient = mustGetPlayer(
    directState,
    directState.activePlayerId
  );
  directRecipient.chips = 0;
  directState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt017-direct"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_017"),
      ownerId: "common",
    },
  ];

  assert.deepEqual(gainDeadWizardToken(directState, directRecipient), {
    ok: true,
  });
  assert.equal(directRecipient.chips, 0);

  const nestedState = initializeGame({ rootDir, seed: 3040173 });
  const killer = mustGetPlayer(nestedState, nestedState.activePlayerId);
  const defeatedPlayer = getOpponentsInSeatingOrder(nestedState, killer)[0];
  assert.ok(defeatedPlayer);
  killer.wizardProperties = [];
  defeatedPlayer.wizardProperties = [];
  killer.chips = 0;
  defeatedPlayer.life.current = 1;
  const deathFace = createFixtureDeadWizardTokenDefinition(
    "fixture-dwt017-ownerless-nested-death",
    [
      {
        effectId: "set_life",
        timing: "onDeadWizardTokenFace",
        lifeTotal: 0,
        target: { selector: "activePlayer" },
      },
    ]
  );
  nestedState.tokenDefinitions = new Map([
    ...nestedState.tokenDefinitions,
    [deathFace.tokenId, deathFace],
  ]);
  nestedState.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt017-ownerless-death"),
      definitionId: markTokenDefinitionId(deathFace.tokenId),
      ownerId: "common",
    },
    {
      instanceId: markTokenInstanceId("fixture-dwt017-nested"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_017"),
      ownerId: "common",
    },
  ];
  const attack = addFixtureCardToActiveHand(nestedState, {
    effectId: "attack_damage",
    timing: "onPlay",
    targetSelector: "chosenFoe",
    amount: 1,
  });
  nestedState.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === defeatedPlayer.playerId)
        )
      : undefined;

  assert.deepEqual(
    applyAction(nestedState, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(killer.chips, 0);
  assert.equal(
    nestedState.eventLog.some(
      (event) => event.effectId === "dead_wizard_token_reward_killer_chips"
    ),
    false
  );
});

test("ownerless Market Flow не назначает убийцу для ЖДК 017", () => {
  const state = initializeGame({ rootDir, seed: 3040174 });
  const affectedPlayer = mustGetPlayer(state, state.activePlayerId);
  affectedPlayer.wizardProperties = [];
  affectedPlayer.life.current = 1;
  affectedPlayer.chips = 0;
  const fillerDefinition = createFixtureCardDefinition(
    "fixture-dwt017-market-flow-filler",
    []
  );
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-dwt017-ownerless-market-flow",
    [
      {
        effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
        timing: "onMayhemResolve",
        targetSelector: "eachPlayerClockwiseFromActive",
        options: [
          { effectId: "discard_hand_then_draw_cards", drawAmount: 5 },
          { effectId: "take_damage", amount: 5 },
        ],
        chooser: "affectedPlayer",
      },
    ],
    { cardKind: "mayhem" }
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [fillerDefinition.cardId, fillerDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  state.common.deadWizardTokens.drawStack = [
    {
      instanceId: markTokenInstanceId("fixture-dwt017-market-flow"),
      definitionId: markTokenDefinitionId("esw2_dbg__dead_wizard_token_017"),
      ownerId: "common",
    },
  ];
  const mayhem: CardInstance = {
    instanceId: markCardInstanceId("fixture-dwt017-market-flow-mayhem"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  const filler: CardInstance = {
    instanceId: markCardInstanceId("fixture-dwt017-market-flow-filler"),
    definitionId: markCardDefinitionId(fillerDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  state.common.market.splice(4);
  state.common.mainDeck.splice(0, state.common.mainDeck.length, mayhem, filler);
  state.effectChoiceStrategy = ({ effectId, player, choices }) =>
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" &&
    player.playerId === affectedPlayer.playerId
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === "take_damage")
        )
      : undefined;

  assert.deepEqual(runMarketFlow(state, { mode: "turn" }), { ok: true });

  assert.equal(affectedPlayer.chips, 0);
  assert.equal(
    state.eventLog.some(
      (event) => event.effectId === "dead_wizard_token_reward_killer_chips"
    ),
    false
  );
});

test("#268 runtime defenses preserve play effects and resolve defense rewards", () => {
  const cases = [
    {
      definitionId: "esw2_dbg__main_013",
      playPower: 2,
      playDraw: 0,
      playChips: 0,
      defenseDraw: 1,
      defenseChips: 1,
    },
    {
      definitionId: "esw2_dbg__main_029",
      playPower: 0,
      playDraw: 2,
      playChips: 0,
      defenseDraw: 2,
      defenseChips: 0,
    },
    {
      definitionId: "esw2_dbg__main_054",
      playPower: 1,
      playDraw: 0,
      playChips: 0,
      defenseDraw: 0,
      defenseChips: 2,
    },
    {
      definitionId: "esw2_dbg__legend_022",
      playPower: 0,
      playDraw: 2,
      playChips: 2,
      defenseDraw: 2,
      defenseChips: 2,
    },
  ] as const;

  for (const [index, cardCase] of cases.entries()) {
    const state = initializeGame({ rootDir, seed: 268000 + index });
    const attacker = mustGetPlayer(state, markPlayerId("player-1"));
    const defender = mustGetPlayer(state, markPlayerId("player-2"));
    state.activePlayerId = attacker.playerId;

    const powerBeforePlay = state.turn.power;
    const attackerHandBeforePlay = attacker.hand.length;
    const attackerDeckBeforePlay = attacker.deck.length;
    const attackerChipsBeforePlay = attacker.chips;
    const playCard = addRuntimeCardToHand(
      state,
      attacker,
      cardCase.definitionId
    );
    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: playCard.instanceId,
      }),
      { ok: true }
    );
    assert.equal(state.turn.power, powerBeforePlay + cardCase.playPower);
    assert.equal(
      attacker.deck.length,
      attackerDeckBeforePlay - cardCase.playDraw
    );
    assert.equal(
      attacker.hand.length,
      attackerHandBeforePlay + cardCase.playDraw
    );
    assert.equal(attacker.chips, attackerChipsBeforePlay + cardCase.playChips);

    defender.hand.splice(0);
    const defenseCard = addRuntimeCardToHand(
      state,
      defender,
      cardCase.definitionId
    );
    const defenderDeckBeforeDefense = defender.deck.length;
    const defenderChipsBeforeDefense = defender.chips;
    const defenderLifeBeforeDefense = defender.life.current;
    state.effectChoiceStrategy = ({ effectId }) =>
      effectId === "avoid_attack"
        ? { choiceId: defenseCard.instanceId }
        : undefined;
    const attackCardId = addFixtureCardToActiveHand(state, {
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 5,
      target: { selector: "opponentPlayer" },
    });

    assert.deepEqual(
      applyAction(state, { type: "playCard", cardInstanceId: attackCardId }),
      { ok: true }
    );
    assert.equal(defender.life.current, defenderLifeBeforeDefense);
    assert.equal(defender.discard.includes(defenseCard), true);
    assert.equal(
      defender.deck.length,
      defenderDeckBeforeDefense - cardCase.defenseDraw
    );
    assert.equal(defender.hand.length, cardCase.defenseDraw);
    assert.equal(
      defender.chips,
      defenderChipsBeforeDefense + cardCase.defenseChips
    );
  }
});

test("#269 familiar defense reveals the main deck and never takes Mayhem", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const familiarDefinition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_001"
  );
  const normalDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_013");
  const mayhemDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_059");
  assert.ok(familiarDefinition);
  assert.ok(normalDefinition);
  assert.ok(mayhemDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.familiarPool?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__familiar_001"
    ),
    { cardId: "esw2_dbg__familiar_001", count: 1 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 269001,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [familiarDefinition.cardId, familiarDefinition],
    [normalDefinition.cardId, normalDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    familiarDefinition.cardId
  );
  const normalTopCard = createCommonRuntimeCard("esw2_dbg__main_013");
  state.common.mainDeck.splice(0, state.common.mainDeck.length, normalTopCard);
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "avoid_attack") {
      return { choiceId: defenseCard.instanceId };
    }
    if (effectId === "reveal_top_card") {
      assert.ok(choices.some((choice) => choice.choiceId === "take"));
      return { choiceId: "take" };
    }
    return undefined;
  };
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(defender.hand.includes(normalTopCard), true);
  assert.equal(state.common.mainDeck.includes(normalTopCard), false);

  const mayhemState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 269002,
  });
  mayhemState.cardDefinitions = new Map([
    ...mayhemState.cardDefinitions,
    [familiarDefinition.cardId, familiarDefinition],
    [mayhemDefinition.cardId, mayhemDefinition],
  ]);
  const mayhemAttacker = mustGetPlayer(mayhemState, markPlayerId("player-1"));
  const mayhemDefender = mustGetPlayer(mayhemState, markPlayerId("player-2"));
  mayhemState.activePlayerId = mayhemAttacker.playerId;
  mayhemDefender.hand = [];
  const mayhemDefense = addRuntimeCardToHand(
    mayhemState,
    mayhemDefender,
    familiarDefinition.cardId
  );
  const mayhem = createCommonRuntimeCard("esw2_dbg__main_059");
  mayhemState.common.mainDeck.splice(
    0,
    mayhemState.common.mainDeck.length,
    mayhem
  );
  mayhemState.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "avoid_attack") {
      return { choiceId: mayhemDefense.instanceId };
    }
    if (effectId === "reveal_top_card") {
      assert.equal(
        choices.some((choice) => choice.choiceId === "take"),
        false
      );
    }
    return undefined;
  };
  const mayhemAttack = addFixtureCardToActiveHand(mayhemState, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(mayhemState, {
      type: "playCard",
      cardInstanceId: mayhemAttack,
    }),
    { ok: true }
  );
  assert.equal(mayhemState.common.mainDeck[0], mayhem);
  assert.equal(mayhemDefender.hand.includes(mayhem), false);
});

test("reveal_top_card onDefense validates gain hooks before defense mutation", () => {
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 337007,
  });
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  const invalidDefinition = createFixtureCardDefinition(
    "fixture-337-on-defense-invalid-gain",
    [
      {
        effectId: "discard_card",
        timing: "onGain",
        targetSelector: "activePlayerHandCard",
        emptyChoice: "fail",
      },
    ]
  );
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [invalidDefinition.cardId, invalidDefinition],
  ]);
  const invalidCard = {
    instanceId: markCardInstanceId("fixture-337-on-defense-invalid-card"),
    definitionId: markCardDefinitionId(invalidDefinition.cardId),
    ownerId: "common" as const,
    marketChips: 0,
  } satisfies CardInstance;
  state.common.mainDeck.splice(0, state.common.mainDeck.length, invalidCard);
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    branchEffects: [
      {
        effectId: "reveal_top_card",
        timing: "onDefense",
        source: "mainDeck",
        optionalTakeToHand: true,
      },
    ],
  });
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack" ? { choiceId: defense.instanceId } : undefined;
  const expectedNextRandom = state.rng.fork().next();
  const eventLog = state.eventLog;

  assert.throws(
    () =>
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attack,
      }),
    /timing.*onGain|does not support timing/
  );

  assert.equal(defender.hand.includes(defense), true);
  assert.equal(state.common.mainDeck[0], invalidCard);
  assert.equal(state.eventLog, eventLog);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "defenseChoiceSelected" ||
        event.type === "effectCardRevealed" ||
        event.type === "effectCardGained"
    ),
    false
  );
  assert.deepEqual(state.turn.gainedCards, []);
  assert.equal(state.rng.next(), expectedNextRandom);
});

test("#269 defense returns another creature from discard and excludes itself", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const defenseDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_043");
  const creatureDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_014");
  assert.ok(defenseDefinition);
  assert.ok(creatureDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__main_043"
    ),
    { cardId: "esw2_dbg__main_043", count: 2 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 269003,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [defenseDefinition.cardId, defenseDefinition],
    [creatureDefinition.cardId, creatureDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    defenseDefinition.cardId
  );
  const otherCreature = addRuntimeCardToHand(
    state,
    defender,
    creatureDefinition.cardId
  );
  defender.hand.splice(defender.hand.indexOf(otherCreature), 1);
  defender.discard.push(otherCreature);
  let returnChoiceIds: readonly string[] = [];
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "avoid_attack") {
      return { choiceId: defenseCard.instanceId };
    }
    if (effectId === "return_discard_to_hand") {
      returnChoiceIds = choices.map((choice) => choice.choiceId);
      return {
        choiceId:
          choices.find(
            (choice) =>
              choice.choiceKind === "cardTarget" &&
              choice.targetCardInstanceIds?.includes(otherCreature.instanceId)
          )?.choiceId ?? "return_0",
      };
    }
    return undefined;
  };
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(defender.hand.includes(otherCreature), true);
  assert.equal(defender.discard.includes(otherCreature), false);
  assert.equal(returnChoiceIds.includes("return_0"), false);
});

test("#269 defense remains successful when no other creature is in discard", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const defenseDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_043");
  assert.ok(defenseDefinition);

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 269005,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [defenseDefinition.cardId, defenseDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    defenseDefinition.cardId
  );
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(attacker.life.current, 20);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectChoiceSkipped" &&
        event.effectId === "return_discard_to_hand" &&
        event.legalChoiceCount === 0
    )
  );
});

test("#269 defense optionally destroys a hand card", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const defenseDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_045");
  const handDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_014");
  assert.ok(defenseDefinition);
  assert.ok(handDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__main_045"
    ),
    { cardId: "esw2_dbg__main_045", count: 2 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 269004,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [defenseDefinition.cardId, defenseDefinition],
    [handDefinition.cardId, handDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    defenseDefinition.cardId
  );
  const destroyedCard = addRuntimeCardToHand(
    state,
    defender,
    handDefinition.cardId
  );
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "avoid_attack") {
      return { choiceId: defenseCard.instanceId };
    }
    if (effectId === "destroy_own_cards") {
      return {
        choiceId:
          choices.find(
            (choice) =>
              choice.choiceKind === "cardTarget" &&
              choice.targetCardInstanceIds?.includes(destroyedCard.instanceId)
          )?.choiceId ?? "decline",
      };
    }
    return undefined;
  };
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(defender.hand.includes(destroyedCard), false);
  assert.equal(state.common.destroyedPile.includes(destroyedCard), true);
});

test("#270 familiar defense keeps itself and discards one seeded-random other card", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const familiarDefinition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_006"
  );
  assert.ok(familiarDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.familiarPool?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__familiar_006"
    ),
    { cardId: "esw2_dbg__familiar_006", count: 1 }
  );

  const resolve = (seed: number) => {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed,
    });
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [familiarDefinition.cardId, familiarDefinition],
    ]);
    const attacker = mustGetPlayer(state, markPlayerId("player-1"));
    const defender = mustGetPlayer(state, markPlayerId("player-2"));
    state.activePlayerId = attacker.playerId;
    defender.hand = [];
    defender.discard = [];
    const defenseCard = addRuntimeCardToHand(
      state,
      defender,
      familiarDefinition.cardId
    );
    const otherCards = [
      addRuntimeCardToHand(state, defender, "esw2_dbg__main_013"),
      addRuntimeCardToHand(state, defender, "esw2_dbg__main_013"),
    ];
    const [firstOtherCard, secondOtherCard] = otherCards;
    assert.ok(firstOtherCard);
    assert.ok(secondOtherCard);
    state.effectChoiceStrategy = ({ effectId }) =>
      effectId === "avoid_attack"
        ? { choiceId: defenseCard.instanceId }
        : undefined;
    const attack = addFixtureCardToActiveHand(state, {
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 5,
      target: { selector: "opponentPlayer" },
    });
    const defenderLifeBefore = defender.life.current;

    assert.deepEqual(
      applyAction(state, { type: "playCard", cardInstanceId: attack }),
      { ok: true }
    );
    const discardedOtherCard = otherCards.find((card) =>
      defender.discard.includes(card)
    );
    assert.ok(discardedOtherCard);
    assert.equal(defender.hand.includes(defenseCard), true);
    assert.notEqual(
      defender.hand.includes(firstOtherCard),
      defender.hand.includes(secondOtherCard)
    );
    assert.equal(defender.discard.includes(defenseCard), false);
    assert.equal(defender.life.current, defenderLifeBefore);
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "defenseCostPaid" &&
          event.effectId === "discard_other_hand_card" &&
          event.targetCardInstanceId === discardedOtherCard.instanceId
      ),
      true
    );
    return discardedOtherCard.instanceId;
  };

  assert.equal(resolve(270001), resolve(270001));
});

test("#270 cards preserve their independent play effects", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const cases = [
    { definitionId: "esw2_dbg__familiar_006", power: 2, draw: 1 },
    { definitionId: "esw2_dbg__main_003", power: 1, draw: 0 },
  ] as const;

  for (const [index, cardCase] of cases.entries()) {
    const definition = currentRuntimeDataPack.cardDefinitions.get(
      cardCase.definitionId
    );
    assert.ok(definition);
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: 270010 + index,
    });
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [definition.cardId, definition],
    ]);
    const player = mustGetPlayer(state, markPlayerId("player-1"));
    state.activePlayerId = player.playerId;
    player.hand = [];
    const powerBefore = state.turn.power;
    const deckBefore = player.deck.length;
    const card = addRuntimeCardToHand(state, player, definition.cardId);

    assert.deepEqual(
      applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
      { ok: true }
    );
    assert.equal(state.turn.power, powerBefore + cardCase.power);
    assert.equal(player.deck.length, deckBefore - cardCase.draw);
    assert.equal(player.hand.length, cardCase.draw);
  }
});

test("#270 familiar defense is unavailable without another hand card", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const familiarDefinition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_006"
  );
  assert.ok(familiarDefinition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 270002,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [familiarDefinition.cardId, familiarDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    familiarDefinition.cardId
  );
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });
  const defenderLifeBefore = defender.life.current;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.life.current, defenderLifeBefore - 5);
  assert.equal(defender.hand.includes(defenseCard), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

test("#270 main treasure defense pays chip and nonlethal life while staying in hand", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const defenseDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_003");
  assert.ok(defenseDefinition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__main_003"
    ),
    { cardId: "esw2_dbg__main_003", count: 2 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 270003,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [defenseDefinition.cardId, defenseDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.chips = 1;
  defender.life.current = 3;
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    defenseDefinition.cardId
  );
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;

  const playAttack = () => {
    const attack = addFixtureCardToActiveHand(state, {
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 5,
      target: { selector: "opponentPlayer" },
    });
    assert.deepEqual(
      applyAction(state, { type: "playCard", cardInstanceId: attack }),
      { ok: true }
    );
  };

  playAttack();
  assert.equal(defender.life.current, 2);
  assert.equal(defender.chips, 0);
  assert.equal(defender.hand.includes(defenseCard), true);

  defender.chips = 1;
  playAttack();
  assert.equal(defender.life.current, 1);
  assert.equal(defender.chips, 0);
  assert.equal(defender.hand.includes(defenseCard), true);
  assert.equal(
    state.eventLog.filter((event) => event.type === "defenseChoiceSelected")
      .length,
    2
  );
});

test("#270 main treasure defense cannot spend the last life", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const defenseDefinition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_003");
  assert.ok(defenseDefinition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 270004,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [defenseDefinition.cardId, defenseDefinition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.chips = 1;
  defender.life.current = 1;
  const defenseCard = addRuntimeCardToHand(
    state,
    defender,
    defenseDefinition.cardId
  );
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.hand.includes(defenseCard), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.targetPlayerId === defender.playerId
    ),
    true
  );
});

test("#271 main spell grants three power without entering the defense branch", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_042");
  assert.ok(definition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck?.entries.find(
      (entry) => entry.cardId === "esw2_dbg__main_042"
    ),
    { cardId: "esw2_dbg__main_042", count: 2 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 271001,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const player = mustGetPlayer(state, markPlayerId("player-1"));
  state.activePlayerId = player.playerId;
  player.hand = [];
  const card = addRuntimeCardToHand(state, player, definition.cardId);
  const powerBefore = state.turn.power;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(state.turn.power, powerBefore + 3);
  assert.equal(
    state.eventLog.some((event) => event.type === "defenseChoiceSelected"),
    false
  );
});

test("#271 defense topdecks an observable face-up card and clears it after forked movement, shuffle, and draw", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_042");
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 271002,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(state, defender, definition.cardId);
  const defenderLifeBefore = defender.life.current;
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.life.current, defenderLifeBefore);
  assert.equal(defender.deck[0], defenseCard);
  assert.equal(defenseCard.faceUp, true);
  assert.equal(defender.hand.includes(defenseCard), false);

  const fork = forkGameState(state);
  const forkDefender = mustGetPlayer(fork, defender.playerId);
  const forkDefenseCard = forkDefender.deck[0];
  assert.ok(forkDefenseCard);
  assert.notEqual(forkDefenseCard, defenseCard);
  assert.equal(forkDefenseCard.faceUp, true);

  const moved = movePhysicalCard(
    fork,
    forkDefenseCard.instanceId,
    `${forkDefender.playerId}.discard`,
    "back"
  );
  assert.equal(moved.ok, true);
  assert.equal(forkDefenseCard.faceUp, undefined);

  const shuffledFork = forkGameState(state);
  const shuffledDefender = mustGetPlayer(shuffledFork, defender.playerId);
  const shuffledDefenseCard = shuffledDefender.deck[0];
  assert.ok(shuffledDefenseCard);
  shuffleDeck(shuffledDefender.deck, shuffledFork.rng);
  assert.equal(shuffledDefenseCard.faceUp, undefined);

  const drawResult = drawDeckCard(defender.deck, defender.discard, state.rng);
  assert.equal(drawResult.card, defenseCard);
  assert.equal(defenseCard.faceUp, undefined);
});

test("#271 declining the face-up defense leaves hand and deck unchanged", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_042");
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 271003,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  const defenseCard = addRuntimeCardToHand(state, defender, definition.cardId);
  const deckBefore = [...defender.deck];
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack" ? { choiceId: "decline" } : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 1,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defender.hand.includes(defenseCard), true);
  assert.deepEqual(defender.deck, deckBefore);
  assert.equal(defenseCard.faceUp, undefined);
});

test("#272 familiar discards one seeded-random card from the chosen foe", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__familiar_002"
  );
  assert.ok(definition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.familiarPool?.entries.find(
      (entry) => entry.cardId === definition.cardId
    ),
    { cardId: definition.cardId, count: 1 }
  );

  const resolve = (seed: number, emptyHand = false) => {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed,
    });
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [definition.cardId, definition],
    ]);
    const activePlayer = mustGetPlayer(state, markPlayerId("player-1"));
    const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
    state.activePlayerId = activePlayer.playerId;
    activePlayer.hand = [];
    targetPlayer.hand = [];
    targetPlayer.discard = [];
    const targetCards = emptyHand
      ? []
      : [
          addRuntimeCardToHand(state, targetPlayer, "esw2_dbg__main_013"),
          addRuntimeCardToHand(state, targetPlayer, "esw2_dbg__main_013"),
        ];
    const familiar = addRuntimeCardToHand(
      state,
      activePlayer,
      definition.cardId
    );
    const expectedRng = state.rng.fork();
    state.effectChoiceStrategy = ({ effectId, choices }) =>
      effectId === "discard_random_hand_cards"
        ? toChoiceSelection(
            choices.find((choice) => choice.choiceId === targetPlayer.playerId)
          )
        : undefined;

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: familiar.instanceId,
      }),
      { ok: true }
    );
    assert.equal(state.turn.power, 3);
    assert.equal(
      targetCards.filter((card) => targetPlayer.discard.includes(card)).length,
      emptyHand ? 0 : 1
    );
    assert.equal(targetPlayer.hand.length, emptyHand ? 0 : 1);
    if (!emptyHand) expectedRng.nextInt(targetCards.length);
    assert.equal(state.rng.next(), expectedRng.next());
    return targetCards.find((card) => targetPlayer.discard.includes(card));
  };

  const first = resolve(272001);
  const second = resolve(272001);
  assert.ok(first);
  assert.equal(first?.instanceId, second?.instanceId);
  resolve(272002, true);
});

test("#272 main wizard draws normally and counters an attack without opening another defense", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_017");
  assert.ok(definition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.mainDeck?.entries.find(
      (entry) => entry.cardId === definition.cardId
    ),
    { cardId: definition.cardId, count: 2 }
  );

  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 272003,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(state, defender, definition.cardId);
  const drawnCard = defender.deck[0];
  assert.ok(drawnCard);
  const attackerDefense = addRuntimeCardToHand(
    state,
    attacker,
    definition.cardId
  );
  attackerDefense.instanceId = markCardInstanceId(
    "fixture-runtime-main017-attacker-defense"
  );
  const attackerLifeBefore = attacker.life.current;
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "avoid_attack") return undefined;
    defenseChoiceCount += 1;
    return defenseChoiceCount === 1
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === defenseCard.instanceId)
        )
      : toChoiceSelection(
          choices.find((choice) => choice.choiceId === "decline")
        );
  };
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defenseChoiceCount, 1);
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(defender.hand.includes(drawnCard), true);
  assert.equal(attacker.life.current, attackerLifeBefore - 3);
  assert.equal(attacker.hand.includes(attackerDefense), true);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" &&
        event.effectId === "deal_damage" &&
        event.playerId === defender.playerId &&
        event.targetPlayerId === attacker.playerId &&
        event.amount === 3
    ),
    true
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.targetPlayerId === attacker.playerId &&
        event.effectId === "deal_damage"
    ),
    false
  );
});

test("#272 counter-damage death gives the defending player the trophy and resolves resurrection", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_017");
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 272004,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) player.trophyLikeObjects = [];
  attacker.trophyLikeObjects.push(createBasicTrophy(attacker.playerId));
  attacker.life.current = 3;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addRuntimeCardToHand(state, defender, definition.cardId);
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(attacker.life.current, 20);
  assert.equal(attacker.deadWizardTokens.length, 1);
  assert.equal(
    defender.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === attacker.playerId
    ),
    true
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "playerResurrected" &&
        event.playerId === attacker.playerId
    ),
    true
  );
  assert.equal(state.activePlayerId, attacker.playerId);
});

test("#272 ownerless defense draws but skips counter-damage", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition =
    currentRuntimeDataPack.cardDefinitions.get("esw2_dbg__main_017");
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 272005,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const sourcePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = sourcePlayer.playerId;
  targetPlayer.hand = [];
  targetPlayer.discard = [];
  const defenseCard = addRuntimeCardToHand(
    state,
    targetPlayer,
    definition.cardId
  );
  const drawnCard = targetPlayer.deck[0];
  assert.ok(drawnCard);
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-ownerless-counter-defense",
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
    instanceId: markCardInstanceId(
      "fixture-ownerless-counter-defense-instance"
    ),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "avoid_attack") return undefined;
    defenseChoiceCount += 1;
    return defenseChoiceCount === 1
      ? toChoiceSelection(
          choices.find((choice) => choice.choiceId === defenseCard.instanceId)
        )
      : undefined;
  };

  assert.deepEqual(
    executeMayhemEffects(state, sourcePlayer, mayhemDefinition, {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: sourcePlayer.playerId,
      cardInstanceId: mayhem.instanceId,
      definitionId: mayhem.definitionId,
    }),
    { ok: true }
  );
  assert.equal(targetPlayer.hand.includes(drawnCard), true);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" && event.effectId === "deal_damage"
    ),
    false
  );
  assert.equal(defenseChoiceCount, 1);
});

test("#273 legend028 gives power and redirects only against a Dingler", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__legend_028"
  );
  assert.ok(definition);
  assert.deepEqual(
    currentRuntimeDataPack.decks.legendDeck?.entries.find(
      (entry) => entry.cardId === definition.cardId
    ),
    { cardId: definition.cardId, count: 1 }
  );

  const playState = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 273001,
  });
  playState.cardDefinitions = new Map([
    ...playState.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const playPlayer = mustGetPlayer(playState, markPlayerId("player-1"));
  playPlayer.hand = [];
  playPlayer.wizardProperties = [];
  playState.activePlayerId = playPlayer.playerId;
  playState.turn.power = 0;
  const playedLegend = addRuntimeCardToHand(
    playState,
    playPlayer,
    definition.cardId
  );

  assert.deepEqual(
    applyAction(playState, {
      type: "playCard",
      cardInstanceId: playedLegend.instanceId,
    }),
    { ok: true }
  );
  assert.equal(playState.turn.power, 3);

  const resolveDefense = (attackerIsDingler: boolean) => {
    const state = initializeGame({
      rootDir,
      dataPackPath: playableRuntimeDataPackPath,
      seed: attackerIsDingler ? 273002 : 273003,
    });
    state.cardDefinitions = new Map([
      ...state.cardDefinitions,
      [definition.cardId, definition],
    ]);
    const attacker = mustGetPlayer(state, markPlayerId("player-1"));
    const defender = mustGetPlayer(state, markPlayerId("player-2"));
    state.activePlayerId = attacker.playerId;
    for (const player of state.players) {
      player.hand = [];
      player.discard = [];
      player.statuses = [];
      player.wizardProperties = [];
    }
    if (attackerIsDingler) {
      attacker.statuses.push(createDinglerStatus(attacker));
    }
    const drawnCards = defender.deck.slice(0, 3);
    assert.equal(drawnCards.length, 3);
    const defenseCard = addRuntimeCardToHand(
      state,
      defender,
      definition.cardId
    );
    state.effectChoiceStrategy = ({ effectId }) =>
      effectId === "avoid_attack"
        ? { choiceId: defenseCard.instanceId }
        : undefined;
    const attack = addFixtureCardToActiveHand(state, {
      effectId: "attack_damage",
      timing: "onPlay",
      amount: 5,
      target: { selector: "opponentPlayer" },
    });
    const attackerLifeBefore = attacker.life.current;
    const defenderLifeBefore = defender.life.current;

    assert.deepEqual(
      applyAction(state, { type: "playCard", cardInstanceId: attack }),
      { ok: true }
    );
    assert.equal(defender.discard.includes(defenseCard), true);
    for (const drawnCard of drawnCards) {
      assert.equal(defender.hand.includes(drawnCard), true);
    }
    const attackStarts = state.eventLog.filter(
      (event) =>
        event.type === "attackTargetStarted" && event.cardInstanceId === attack
    );
    assert.equal(attackStarts.length, attackerIsDingler ? 2 : 1);
    if (attackerIsDingler) {
      assert.equal(attacker.life.current, attackerLifeBefore - 5);
      assert.equal(defender.life.current, defenderLifeBefore);
      assert.equal(attackStarts[1]?.playerId, defender.playerId);
      assert.equal(attackStarts[1]?.targetPlayerId, attacker.playerId);
    } else {
      assert.equal(attacker.life.current, attackerLifeBefore);
      assert.equal(defender.life.current, defenderLifeBefore);
    }
    assert.equal(state.activePlayerId, attacker.playerId);
  };

  resolveDefense(false);
  resolveDefense(true);
});

test("#273 ownerless legend028 defense draws without redirecting", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__legend_028"
  );
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 273004,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const sourcePlayer = mustGetPlayer(state, markPlayerId("player-1"));
  const targetPlayer = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = sourcePlayer.playerId;
  targetPlayer.hand = [];
  targetPlayer.discard = [];
  targetPlayer.statuses = [createDinglerStatus(targetPlayer)];
  const defenseCard = addRuntimeCardToHand(
    state,
    targetPlayer,
    definition.cardId
  );
  const drawnCards = targetPlayer.deck.slice(0, 3);
  assert.equal(drawnCards.length, 3);
  const mayhemDefinition = createFixtureCardDefinition(
    "fixture-ownerless-legend028-defense",
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
    instanceId: markCardInstanceId("fixture-ownerless-legend028-instance"),
    definitionId: markCardDefinitionId(mayhemDefinition.cardId),
    ownerId: "common",
    marketChips: 0,
  };
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId !== "avoid_attack") return undefined;
    defenseChoiceCount += 1;
    return { choiceId: defenseCard.instanceId };
  };
  const lifeBefore = targetPlayer.life.current;

  assert.deepEqual(
    executeMayhemEffects(state, sourcePlayer, mayhemDefinition, {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: sourcePlayer.playerId,
      cardInstanceId: mayhem.instanceId,
      definitionId: mayhem.definitionId,
    }),
    { ok: true }
  );
  assert.equal(targetPlayer.life.current, lifeBefore);
  assert.equal(targetPlayer.discard.includes(defenseCard), true);
  for (const drawnCard of drawnCards) {
    assert.equal(targetPlayer.hand.includes(drawnCard), true);
  }
  assert.equal(defenseChoiceCount, 1);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectDamageDealt" && event.effectId === "deal_damage"
    ),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "attackTargetStarted" &&
        event.playerId === targetPlayer.playerId
    ),
    false
  );
});

test("#273 Dingler-only legend028 defenses terminate a redirect chain", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__legend_028"
  );
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 273005,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.hand = [];
    player.discard = [];
    player.statuses = [createDinglerStatus(player)];
    player.wizardProperties = [];
  }
  const attackerDefense = addRuntimeCardToHand(
    state,
    attacker,
    definition.cardId
  );
  attackerDefense.instanceId = markCardInstanceId(
    "fixture-legend028-attacker-defense"
  );
  const defenderDefense = addRuntimeCardToHand(
    state,
    defender,
    definition.cardId
  );
  defenderDefense.instanceId = markCardInstanceId(
    "fixture-legend028-defender-defense"
  );
  const attackerDrawnCards = attacker.deck.slice(0, 3);
  const defenderDrawnCards = defender.deck.slice(0, 3);
  assert.equal(attackerDrawnCards.length, 3);
  assert.equal(defenderDrawnCards.length, 3);
  let defenseChoiceCount = 0;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId !== "avoid_attack") return undefined;
    defenseChoiceCount += 1;
    const choice = choices.find(
      (candidate) => candidate.choiceId !== "decline"
    );
    assert.ok(choice);
    return toChoiceSelection(choice);
  };
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });
  const attackerLifeBefore = attacker.life.current;
  const defenderLifeBefore = defender.life.current;

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(defenseChoiceCount, 2);
  assert.equal(attacker.life.current, attackerLifeBefore);
  assert.equal(defender.life.current, defenderLifeBefore - 5);
  assert.equal(attacker.discard.includes(attackerDefense), true);
  assert.equal(defender.discard.includes(defenderDefense), true);
  for (const card of attackerDrawnCards) {
    assert.equal(attacker.hand.includes(card), true);
  }
  for (const card of defenderDrawnCards) {
    assert.equal(defender.hand.includes(card), true);
  }
  const attackStarts = state.eventLog.filter(
    (event) =>
      event.type === "attackTargetStarted" && event.cardInstanceId === attack
  );
  assert.deepEqual(
    attackStarts.map((event) => [
      event.playerId,
      event.targetPlayerId,
      event.amount,
    ]),
    [
      [attacker.playerId, defender.playerId, 5],
      [defender.playerId, attacker.playerId, 5],
      [attacker.playerId, defender.playerId, 5],
    ]
  );
  assert.equal(state.activePlayerId, attacker.playerId);
});

test("#273 redirected legend028 damage gives the trophy for killing the original attacker", () => {
  const currentRuntimeDataPack = loadCurrentRuntimeDataPack(rootDir);
  const definition = currentRuntimeDataPack.cardDefinitions.get(
    "esw2_dbg__legend_028"
  );
  assert.ok(definition);
  const state = initializeGame({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 273006,
  });
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const attacker = mustGetPlayer(state, markPlayerId("player-1"));
  const defender = mustGetPlayer(state, markPlayerId("player-2"));
  state.activePlayerId = attacker.playerId;
  for (const player of state.players) {
    player.hand = [];
    player.discard = [];
    player.statuses = [];
    player.wizardProperties = [];
    player.trophyLikeObjects = [];
  }
  attacker.statuses.push(createDinglerStatus(attacker));
  attacker.life.current = 3;
  attacker.trophyLikeObjects.push(createBasicTrophy(attacker.playerId));
  const defenseCard = addRuntimeCardToHand(state, defender, definition.cardId);
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "avoid_attack"
      ? { choiceId: defenseCard.instanceId }
      : undefined;
  const attack = addFixtureCardToActiveHand(state, {
    effectId: "attack_damage",
    timing: "onPlay",
    amount: 5,
    target: { selector: "opponentPlayer" },
  });

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: attack }),
    { ok: true }
  );
  assert.equal(attacker.life.current > 0, true);
  assert.equal(attacker.deadWizardTokens.length, 1);
  assert.equal(defender.discard.includes(defenseCard), true);
  assert.equal(
    defender.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    true
  );
  assert.equal(
    attacker.trophyLikeObjects.some(
      (trophy) => trophy.trophyId === "basicTrophy"
    ),
    false
  );
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "playerDied" && event.playerId === attacker.playerId
    ),
    true
  );
  assert.equal(state.activePlayerId, attacker.playerId);
});
