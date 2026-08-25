import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAction,
  getGameEndReason,
  initializeGame,
  runMarketFlow,
  scoreGame,
  type CardInstance,
  type GameState,
  type PlayerState,
  type TokenInstance,
} from "../src/index.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/domain/types.js";
import { getControlledDeadWizardTokenCount } from "../src/engine/dead-wizard-token-like.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";
import { verifiedTestRuntimeEffect } from "./helpers/verified-runtime-effect.js";

const rootDir = process.cwd();

test("ЖДК-дохляки считают себя ЖДК при розыгрыше", () => {
  for (const definitionId of [
    "esw2_dbg__main_049",
    "esw2_dbg__main_050",
    "esw2_dbg__main_051",
    "esw2_dbg__main_052",
    "esw2_dbg__main_053",
  ]) {
    const state = initializeGame({ rootDir, seed: 274001 });
    const player = getActivePlayer(state);
    player.hand = [];
    player.chips = 0;
    state.turn.power = 1;

    const card = addCardToHand(state, player, definitionId);
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    assert.equal(result.ok, true);
    assert.equal(player.chips, 1);
    assert.equal(
      player.permanents.some(
        (permanent) => permanent.instanceId === card.instanceId
      ),
      true
    );
    assert.equal(
      scoreGame(state).find((score) => score.playerId === player.playerId)
        ?.victoryPoints,
      1
    );
  }
});

test("ЖДК-подобная карта определяется mappingStatus, а не legacy-флагом", () => {
  const state = initializeGame({ rootDir, seed: 274000 });
  const player = getActivePlayer(state);
  const definition = state.cardDefinitions.get("esw2_dbg__main_049");
  assert.ok(definition);
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [
      definition.cardId,
      {
        ...definition,
        engine: { ...definition.engine, playableInV0: false },
      },
    ],
  ]);
  player.permanents = [createDohlakPermanent(player)];

  assert.equal(getControlledDeadWizardTokenCount(state, player), 1);
});

test("ЖДК-дохляк получает чипсину за физический ЖДК и за себя", () => {
  const state = initializeGame({ rootDir, seed: 274002 });
  const player = getActivePlayer(state);
  player.hand = [];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  player.chips = 0;
  state.turn.power = 1;

  const card = addCardToHand(state, player, "esw2_dbg__main_049");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(player.chips, 2);
});

test("Некрошест считает физический ЖДК и контролируемого Дохляка", () => {
  const state = initializeGame({ rootDir, seed: 275001 });
  const player = getActivePlayer(state);
  player.hand = [];
  player.permanents = [createDohlakPermanent(player)];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  state.turn.power = 1;

  const card = addCardToHand(state, player, "esw2_dbg__main_039");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(state.turn.power, 5);
});

test("Некроманка Гнилюся наносит урон каждому врагу по числу ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 275002 });
  const player = getActivePlayer(state);
  const foe = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(foe);
  player.hand = [];
  player.permanents = [createDohlakPermanent(player)];
  player.deadWizardTokens = [createDeadWizardToken(player)];
  player.life.current = 20;
  foe.life.current = 20;
  foe.hand = [];
  state.turn.power = 9;

  const card = addCardToHand(state, player, "esw2_dbg__legend_033");
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.ok, true);
  assert.equal(foe.life.current, 12);
});

test("МегаБеспредел MC выдаёт чипсины каждому за его ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 275003, playerCount: 3 });
  const orderedPlayers = getPlayersInActiveOrder(state);
  const [activePlayer, secondPlayer, thirdPlayer] = orderedPlayers;
  assert.ok(activePlayer);
  assert.ok(secondPlayer);
  assert.ok(thirdPlayer);
  for (const player of orderedPlayers) {
    player.chips = 0;
    player.deadWizardTokens = [];
    player.permanents = [];
  }
  activePlayer.deadWizardTokens = [createDeadWizardToken(activePlayer)];
  secondPlayer.deadWizardTokens = [
    createDeadWizardToken(secondPlayer),
    createDeadWizardToken(secondPlayer, "second"),
  ];

  const megaMayhem = createCommonCard(
    "esw2_dbg__mega_mayhem_003",
    "mega-mayhem-003"
  );
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
  assert.equal(activePlayer.chips, 1);
  assert.equal(secondPlayer.chips, 2);
  assert.equal(thirdPlayer.chips, 0);
  assert.equal(state.common.destroyedMegaMayhem.includes(megaMayhem), true);
});

test("Смерть от холестерина даёт +7 без ЖДК и уничтожает выбранный физический ЖДК", () => {
  const emptyState = initializeGame({ rootDir, seed: 276001 });
  const emptyPlayer = getActivePlayer(emptyState);
  emptyPlayer.hand = [];
  emptyState.turn.power = 1;
  const emptyCard = addCardToHand(
    emptyState,
    emptyPlayer,
    "esw2_dbg__legend_013"
  );

  assert.deepEqual(
    applyAction(emptyState, {
      type: "playCard",
      cardInstanceId: emptyCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(emptyState.turn.power, 8);

  const destroyState = initializeGame({ rootDir, seed: 276002 });
  const destroyPlayer = getActivePlayer(destroyState);
  destroyPlayer.hand = [];
  destroyPlayer.deadWizardTokens = [
    createDeadWizardToken(
      destroyPlayer,
      "legend013",
      "esw2_dbg__dead_wizard_token_015"
    ),
  ];
  destroyState.effectChoiceStrategy = (request) => {
    const effectId = String(request.effectId);
    return effectId === "optional_destroy_controlled_dead_wizard_token"
      ? { choiceId: request.choices[1]?.choiceId ?? "decline" }
      : undefined;
  };
  destroyState.turn.power = 1;
  const destroyCard = addCardToHand(
    destroyState,
    destroyPlayer,
    "esw2_dbg__legend_013"
  );

  assert.deepEqual(
    applyAction(destroyState, {
      type: "playCard",
      cardInstanceId: destroyCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(destroyState.turn.power, 1);
  assert.equal(destroyPlayer.deadWizardTokens.length, 0);
  assert.equal(
    destroyState.eventLog.some(
      (event) =>
        event.type === "deadWizardTokenDestroyed" &&
        event.effectId === "optional_destroy_controlled_dead_wizard_token"
    ),
    true
  );
});

test("Смерть от холестерина уничтожает контролируемого Дохляка", () => {
  const state = initializeGame({ rootDir, seed: 276003 });
  const player = getActivePlayer(state);
  player.hand = [];
  const dohlak = createDohlakPermanent(player);
  player.permanents = [dohlak];
  state.effectChoiceStrategy = (request) => {
    const effectId = String(request.effectId);
    return effectId === "optional_destroy_controlled_dead_wizard_token"
      ? { choiceId: request.choices[1]?.choiceId ?? "decline" }
      : undefined;
  };
  const card = addCardToHand(state, player, "esw2_dbg__legend_013");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(player.permanents.includes(dohlak), false);
  assert.equal(state.common.destroyedPile.includes(dohlak), true);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "effectCardDestroyed" &&
        event.targetCardInstanceId === dohlak.instanceId &&
        event.effectId === "optional_destroy_controlled_dead_wizard_token"
    ),
    true
  );
});

test("Жница Любви передаёт физический ЖДК выбранному колдуну и применяет его лицо", () => {
  const state = initializeGame({ rootDir, seed: 276004 });
  const player = getActivePlayer(state);
  const target = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(target);
  player.hand = [];
  target.hand = [];
  const token = createDeadWizardToken(
    player,
    "legend006",
    "esw2_dbg__dead_wizard_token_015"
  );
  player.deadWizardTokens = [token];
  target.chips = 0;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  const passivePowerCard = addCardToHand(state, player, "esw2_dbg__legend_025");
  player.hand = [];
  player.permanents = [passivePowerCard];
  assert.deepEqual(
    dispatchControlledCardOperation(state, player, {
      kind: "recalculateControlledPower",
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 1);
  state.effectChoiceStrategy = (request) => {
    const effectId = String(request.effectId);
    const choices = request.choices;
    if (effectId !== "attack_transfer_controlled_dead_wizard_token") {
      return undefined;
    }
    const targetChoice = choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === target.playerId
    );
    if (targetChoice !== undefined) return { choiceId: targetChoice.choiceId };
    const tokenChoice = choices.find(
      (choice) =>
        choice.choiceKind === "option" &&
        choice.choiceId === `token:${token.instanceId}`
    );
    return tokenChoice === undefined
      ? undefined
      : { choiceId: tokenChoice.choiceId };
  };
  const card = addCardToHand(state, player, "esw2_dbg__legend_006");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(state.turn.power, 4);
  assert.equal(player.deadWizardTokens.includes(token), false);
  assert.equal(target.deadWizardTokens.includes(token), true);
  assert.equal(token.ownerId, target.playerId);
  assert.equal(target.chips, 1);
  assert.equal(
    state.eventLog.some(
      (event) =>
        event.type === "deadWizardTokenFaceResolved" &&
        event.tokenInstanceId === token.instanceId &&
        event.playerId === target.playerId
    ),
    true
  );
});

test("Жница Любви передаёт Дохляка с постоянным контролем", () => {
  const state = initializeGame({ rootDir, seed: 276005 });
  const player = getActivePlayer(state);
  const target = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(target);
  player.hand = [];
  target.hand = [];
  const dohlak = createDohlakPermanent(player);
  player.permanents = [dohlak];
  state.effectChoiceStrategy = (request) => {
    const effectId = String(request.effectId);
    const choices = request.choices;
    if (effectId !== "attack_transfer_controlled_dead_wizard_token") {
      return undefined;
    }
    const playerChoice = choices.find(
      (choice) =>
        choice.choiceKind === "playerTarget" &&
        choice.choiceId === target.playerId
    );
    if (playerChoice !== undefined) return { choiceId: playerChoice.choiceId };
    const cardChoice = choices.find(
      (choice) =>
        choice.choiceKind === "cardTarget" &&
        choice.targetCardInstanceIds.includes(dohlak.instanceId)
    );
    return cardChoice === undefined
      ? undefined
      : { choiceId: cardChoice.choiceId };
  };
  const card = addCardToHand(state, player, "esw2_dbg__legend_006");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(player.permanents.includes(dohlak), false);
  assert.equal(target.permanents.includes(dohlak), true);
  assert.equal(dohlak.ownerId, target.playerId);
});

test("Хахатальер выдаёт ЖДК выбранному врагу, а перенаправление на атакующего игнорирует только перенаправление", () => {
  const state = initializeGame({ rootDir, seed: 276006 });
  const player = getActivePlayer(state);
  const target = state.players.find(
    (candidate) => candidate.playerId !== player.playerId
  );
  assert.ok(target);
  player.hand = [];
  target.hand = [];
  target.deadWizardTokens = [];
  const defense = addFixtureDefenseCardToHand(state, target, "discardSelf", {
    redirectAttack: true,
    branchEffects: [
      verifiedTestRuntimeEffect({
        effectId: "draw_cards",
        timing: "onDefense",
        amount: 1,
      }),
    ],
  });
  const drawnCard = target.deck[0];
  assert.ok(drawnCard);
  const expectedTokens = state.common.deadWizardTokens.drawStack.slice(0, 2);
  state.common.deadWizardTokens.drawStack.splice(2);
  state.effectChoiceStrategy = (request) => {
    const effectId = String(request.effectId);
    const choices = request.choices;
    if (effectId === "attack_gain_dead_wizard_tokens") {
      const choice = choices.find(
        (candidate) =>
          candidate.choiceKind === "playerTarget" &&
          candidate.choiceId === target.playerId
      );
      return choice === undefined ? undefined : { choiceId: choice.choiceId };
    }
    if (effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };
  const card = addCardToHand(state, player, "esw2_dbg__legend_027");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.deepEqual(target.deadWizardTokens, expectedTokens);
  assert.equal(player.deadWizardTokens.length, 0);
  assert.equal(target.discard.includes(defense), true);
  assert.equal(target.hand.includes(drawnCard), true);
});

test("Мескалито добирает карту и получает мощь за физический и карточный ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 277001 });
  const player = getActivePlayer(state);
  player.hand = [];
  player.permanents = [createDohlakPermanent(player)];
  player.deadWizardTokens = [
    createDeadWizardToken(
      player,
      "familiar009-normal",
      "esw2_dbg__dead_wizard_token_015"
    ),
  ];
  state.turn.power = 0;
  const drawnCard = player.deck[0];
  assert.ok(drawnCard);
  const card = addCardToHand(state, player, "esw2_dbg__familiar_009");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(state.turn.power, 2);
  assert.equal(player.hand.includes(drawnCard), true);
  assert.equal(player.playedThisTurn.includes(card), true);
});

test("Мескалито обменивает физические ЖДК при защите и применяет оба лица", () => {
  const state = initializeGame({ rootDir, seed: 277002 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  const attackerToken = createDeadWizardToken(
    attacker,
    "familiar009-attacker",
    "esw2_dbg__dead_wizard_token_015"
  );
  const defenderToken = createDeadWizardToken(
    defender,
    "familiar009-defender",
    "esw2_dbg__dead_wizard_token_015"
  );
  attacker.deadWizardTokens = [attackerToken];
  defender.deadWizardTokens = [defenderToken];
  const defense = addCardToHand(state, defender, "esw2_dbg__familiar_009");
  const drawnCard = defender.deck[0];
  assert.ok(drawnCard);
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  chooseFamiliarDefenseAndExchange(state, defender, defense, [
    `token:${defenderToken.instanceId}`,
    `token:${attackerToken.instanceId}`,
  ]);
  const lifeBefore = defender.life.current;

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(defender.life.current, lifeBefore);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.hand.includes(drawnCard), true);
  assert.deepEqual(defender.deadWizardTokens, [attackerToken]);
  assert.deepEqual(attacker.deadWizardTokens, [defenderToken]);
  assert.equal(attackerToken.ownerId, defender.playerId);
  assert.equal(defenderToken.ownerId, attacker.playerId);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "deadWizardTokenFaceResolved")
      .map((event) => event.tokenInstanceId),
    [defenderToken.instanceId, attackerToken.instanceId]
  );
  assert.equal(attacker.chips, 1);
  assert.equal(defender.chips, 1);
});

test("Мескалито обменивает карты-Дохляки с постоянным контролем", () => {
  const state = initializeGame({ rootDir, seed: 277003 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  const attackerDohlak = createDohlakPermanent(attacker);
  const defenderDohlak = createDohlakPermanent(defender);
  attacker.permanents = [attackerDohlak];
  defender.permanents = [defenderDohlak];
  const defense = addCardToHand(state, defender, "esw2_dbg__familiar_009");
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  chooseFamiliarDefenseAndExchange(state, defender, defense, [
    `card:${defenderDohlak.instanceId}`,
    `card:${attackerDohlak.instanceId}`,
  ]);

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.deepEqual(defender.permanents, [attackerDohlak]);
  assert.deepEqual(attacker.permanents, [defenderDohlak]);
  assert.equal(attackerDohlak.ownerId, defender.playerId);
  assert.equal(defenderDohlak.ownerId, attacker.playerId);
});

test("Мескалито сохраняет защиту и добор при отказе от обмена", () => {
  const state = initializeGame({ rootDir, seed: 277004 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  const attackerToken = createDeadWizardToken(
    attacker,
    "familiar009-decline-attacker",
    "esw2_dbg__dead_wizard_token_015"
  );
  const defenderToken = createDeadWizardToken(
    defender,
    "familiar009-decline-defender",
    "esw2_dbg__dead_wizard_token_015"
  );
  attacker.deadWizardTokens = [attackerToken];
  defender.deadWizardTokens = [defenderToken];
  const defense = addCardToHand(state, defender, "esw2_dbg__familiar_009");
  const drawnCard = defender.deck[0];
  assert.ok(drawnCard);
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  chooseFamiliarDefenseAndExchange(state, defender, defense, "decline");

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.deepEqual(attacker.deadWizardTokens, [attackerToken]);
  assert.deepEqual(defender.deadWizardTokens, [defenderToken]);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.hand.includes(drawnCard), true);
  assert.equal(
    state.eventLog.some(
      (event) => event.type === "deadWizardTokenFaceResolved"
    ),
    false
  );
});

test("Мескалито не предлагает обмен без ЖДК атакующего", () => {
  const state = initializeGame({ rootDir, seed: 277005 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  const defenderToken = createDeadWizardToken(
    defender,
    "familiar009-empty-attacker",
    "esw2_dbg__dead_wizard_token_015"
  );
  attacker.deadWizardTokens = [];
  defender.deadWizardTokens = [defenderToken];
  const defense = addCardToHand(state, defender, "esw2_dbg__familiar_009");
  const drawnCard = defender.deck[0];
  assert.ok(drawnCard);
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  let exchangeRequests = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "attack_damage") {
      return { choiceId: defender.playerId };
    }
    if (effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    if (effectId === "exchange_controlled_dead_wizard_tokens") {
      exchangeRequests += 1;
    }
    return undefined;
  };

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(exchangeRequests, 0);
  assert.deepEqual(defender.deadWizardTokens, [defenderToken]);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(defender.hand.includes(drawnCard), true);
});

test("Мортал Комбо не убивает цель после успешной защиты и не меняет стопку ЖДК", () => {
  const state = initializeGame({ rootDir, seed: 278001 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  const defense = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  const stack = [
    createDeadWizardTokenInStack("mortal-combo-avoid-1"),
    createDeadWizardTokenInStack("mortal-combo-avoid-2"),
  ];
  state.common.deadWizardTokens.drawStack = [...stack];
  state.turn.power = 13;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (String(effectId) === "attack_kill_and_replace_dead_wizard_token") {
      const targetChoice = choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === defender.playerId
      );
      return targetChoice === undefined
        ? undefined
        : { choiceId: targetChoice.choiceId };
    }
    if (effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    return undefined;
  };
  const card = addCardToHand(state, attacker, "esw2_dbg__legend_007");

  assert.deepEqual(
    applyAction(state, { type: "playCard", cardInstanceId: card.instanceId }),
    { ok: true }
  );
  assert.equal(defender.life.current, 20);
  assert.deepEqual(
    state.common.deadWizardTokens.drawStack.map((token) => token.instanceId),
    stack.map((token) => token.instanceId)
  );
  assert.equal(defender.deadWizardTokens.length, 0);
  assert.equal(defender.discard.includes(defense), true);
  assert.equal(
    state.eventLog.some((event) => event.type === "playerDied"),
    false
  );
});

test("Мортал Комбо заменяет обычный ЖДК выбором из доступной тройки", () => {
  for (const availableCount of [0, 1, 2, 3]) {
    const state = initializeGame({
      rootDir,
      seed: 278010 + availableCount,
    });
    const attacker = getActivePlayer(state);
    const defender = state.players.find(
      (candidate) => candidate.playerId !== attacker.playerId
    );
    assert.ok(defender);
    attacker.hand = [];
    defender.hand = [];
    attacker.chips = 0;
    defender.chips = 0;
    const stack = Array.from({ length: availableCount }, (_, index) =>
      createDeadWizardTokenInStack(
        `mortal-combo-${availableCount}-${index}`,
        "esw2_dbg__dead_wizard_token_015"
      )
    );
    state.common.deadWizardTokens.drawStack = [...stack];
    state.turn.power = 13;
    const selectedIndex =
      availableCount === 0 ? undefined : Math.floor(availableCount / 2);
    state.effectChoiceStrategy = ({ effectId, choices }) => {
      if (String(effectId) !== "attack_kill_and_replace_dead_wizard_token") {
        return undefined;
      }
      const targetChoice = choices.find(
        (choice) =>
          choice.choiceKind === "playerTarget" &&
          choice.choiceId === defender.playerId
      );
      if (targetChoice !== undefined) {
        return { choiceId: targetChoice.choiceId };
      }
      const selectedToken =
        selectedIndex === undefined ? undefined : stack[selectedIndex];
      const selectedTokenId = selectedToken?.instanceId;
      const tokenChoice = choices.find(
        (choice) =>
          selectedTokenId !== undefined &&
          choice.choiceId === `token:${selectedTokenId}`
      );
      return tokenChoice === undefined
        ? undefined
        : { choiceId: tokenChoice.choiceId };
    };
    const card = addCardToHand(state, attacker, "esw2_dbg__legend_007");

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: card.instanceId,
      }),
      { ok: true }
    );
    assert.equal(defender.life.current, 20);
    assert.equal(
      defender.deadWizardTokens.length,
      availableCount === 0 ? 0 : 1
    );
    if (selectedIndex !== undefined) {
      const selectedToken = stack[selectedIndex];
      assert.ok(selectedToken);
      assert.equal(defender.deadWizardTokens[0], selectedToken);
      assert.equal(selectedToken.ownerId, defender.playerId);
      assert.equal(defender.chips, 1);
      assert.equal(
        state.eventLog.filter(
          (event) =>
            event.type === "deadWizardTokenFaceResolved" &&
            event.tokenInstanceId === selectedToken.instanceId
        ).length,
        1
      );
      assert.deepEqual(
        state.common.deadWizardTokens.drawStack.map(
          (token) => token.instanceId
        ),
        stack
          .filter((_, index) => index !== selectedIndex)
          .map((token) => token.instanceId)
      );
    } else {
      assert.deepEqual(state.common.deadWizardTokens.drawStack, []);
      assert.equal(defender.chips, 0);
    }
    assert.equal(
      state.eventLog.filter((event) => event.type === "playerDied").length,
      1
    );
  }
});

test("Браталити заменяет следующее обычное убийство и переносит награду убийце", () => {
  const state = initializeGame({ rootDir, seed: 279001 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  attacker.deadWizardTokens = [];
  defender.deadWizardTokens = [];
  defender.life.current = 5;
  state.turn.power = 0;
  const replacementToken = createDeadWizardTokenInStack(
    "bratality-reward",
    "esw2_dbg__dead_wizard_token_001"
  );
  state.common.deadWizardTokens.drawStack = [replacementToken];
  const legend = state.common.legendMarket[0];
  assert.ok(legend);
  legend.marketChips = 2;

  const replacementCard = addCardToHand(state, attacker, "esw2_dbg__main_032");
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "attack_damage") {
      return { choiceId: defender.playerId };
    }
    if (effectId === "arm_dead_wizard_token_kill_replacement") {
      return { choiceId: "apply" };
    }
    if (effectId === "dead_wizard_token_gain_limp_wands_per_discard_legend") {
      return undefined;
    }
    return undefined;
  };

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: replacementCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(state.turn.power, 4);
  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );

  assert.equal(defender.life.current, 15);
  assert.deepEqual(defender.deadWizardTokens, []);
  assert.deepEqual(attacker.deadWizardTokens, [replacementToken]);
  assert.equal(attacker.chips, 2);
  assert.equal(attacker.discard.includes(legend), true);
  assert.equal(state.common.legendMarket.includes(legend), false);
  assert.equal(state.turn.deadWizardTokenKillReplacement, undefined);
  assert.equal(
    state.eventLog.filter((event) => event.type === "playerDied").length,
    1
  );
});

test("Браталити расходует окно при отказе и не влияет на второе убийство", () => {
  const state = initializeGame({ rootDir, seed: 279002 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  attacker.deadWizardTokens = [];
  defender.deadWizardTokens = [];
  defender.life.current = 5;
  state.turn.power = 0;
  const stackTokens = [
    createDeadWizardTokenInStack(
      "bratality-decline-first",
      "esw2_dbg__dead_wizard_token_001"
    ),
    createDeadWizardTokenInStack(
      "bratality-decline-second",
      "esw2_dbg__dead_wizard_token_001"
    ),
  ];
  state.common.deadWizardTokens.drawStack = [...stackTokens];
  const replacementCard = addCardToHand(state, attacker, "esw2_dbg__main_032");
  const firstAttack = addCardToHandWithSuffix(
    state,
    attacker,
    "esw2_dbg__main_030",
    "first"
  );
  const secondAttack = addCardToHandWithSuffix(
    state,
    attacker,
    "esw2_dbg__main_030",
    "second"
  );
  let replacementChoices = 0;
  state.effectChoiceStrategy = ({ effectId }) => {
    if (effectId === "attack_damage") {
      return { choiceId: defender.playerId };
    }
    if (effectId === "arm_dead_wizard_token_kill_replacement") {
      replacementChoices += 1;
      return { choiceId: "decline" };
    }
    return undefined;
  };

  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: replacementCard.instanceId,
    }).ok,
    true
  );
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: firstAttack.instanceId,
    }).ok,
    true
  );

  assert.equal(replacementChoices, 1);
  assert.equal(defender.deadWizardTokens.length, 1);
  assert.equal(attacker.deadWizardTokens.length, 0);
  assert.equal(state.turn.deadWizardTokenKillReplacement, undefined);

  defender.life.current = 5;
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: secondAttack.instanceId,
    }).ok,
    true
  );
  assert.equal(replacementChoices, 1);
  assert.equal(defender.deadWizardTokens.length, 2);
  assert.equal(attacker.deadWizardTokens.length, 0);
});

test("Браталити выдаёт доступную часть награды при пустой стопке или рынке", () => {
  for (const rewardCase of ["legendOnly", "tokenOnly"] as const) {
    const state = initializeGame({
      rootDir,
      seed: rewardCase === "legendOnly" ? 279003 : 279004,
    });
    const attacker = getActivePlayer(state);
    const defender = state.players.find(
      (candidate) => candidate.playerId !== attacker.playerId
    );
    assert.ok(defender);
    attacker.hand = [];
    defender.hand = [];
    attacker.deadWizardTokens = [];
    defender.deadWizardTokens = [];
    attacker.chips = 0;
    defender.life.current = 5;
    state.turn.power = 0;

    const legend = state.common.legendMarket[0];
    assert.ok(legend);
    legend.marketChips = 2;
    if (rewardCase === "legendOnly") {
      state.common.deadWizardTokens.drawStack = [];
    } else {
      state.common.legendMarket = [];
      state.common.deadWizardTokens.drawStack = [
        createDeadWizardTokenInStack(
          "bratality-token-only",
          "esw2_dbg__dead_wizard_token_015"
        ),
      ];
    }

    const replacementCard = addCardToHand(
      state,
      attacker,
      "esw2_dbg__main_032"
    );
    const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
    state.effectChoiceStrategy = ({ effectId, choices }) => {
      if (effectId === "attack_damage") {
        return { choiceId: defender.playerId };
      }
      if (effectId !== "arm_dead_wizard_token_kill_replacement") {
        return undefined;
      }
      const applyChoice = choices.find((choice) => choice.choiceId === "apply");
      if (applyChoice !== undefined) {
        return { choiceId: applyChoice.choiceId };
      }
      const legendChoice = choices.find(
        (choice) => choice.choiceKind === "cardTarget"
      );
      return legendChoice === undefined
        ? undefined
        : { choiceId: legendChoice.choiceId };
    };

    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: replacementCard.instanceId,
      }).ok,
      true
    );
    assert.equal(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attackCard.instanceId,
      }).ok,
      true
    );

    if (rewardCase === "legendOnly") {
      assert.equal(attacker.deadWizardTokens.length, 0);
      assert.equal(attacker.chips, 2);
      assert.equal(attacker.discard.includes(legend), true);
    } else {
      assert.equal(attacker.deadWizardTokens.length, 1);
      assert.equal(attacker.chips, 1);
      assert.equal(attacker.discard.length, 0);
    }
    assert.equal(defender.deadWizardTokens.length, 0);
    assert.equal(state.turn.deadWizardTokenKillReplacement, undefined);
  }
});

test("Браталити истекает в конце хода", () => {
  const state = initializeGame({ rootDir, seed: 279003 });
  const attacker = getActivePlayer(state);
  attacker.hand = [];
  state.turn.power = 0;
  const replacementCard = addCardToHand(state, attacker, "esw2_dbg__main_032");
  assert.equal(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: replacementCard.instanceId,
    }).ok,
    true
  );
  assert.ok(state.turn.deadWizardTokenKillReplacement);
  assert.equal(applyAction(state, { type: "endTurn" }).ok, true);
  assert.equal(state.turn.deadWizardTokenKillReplacement, undefined);
});

test("ЖДК 022 раскрывает верх Main Deck и ставит вложенное лицо в FIFO", () => {
  for (const revealedDefinitionId of [
    "esw2_dbg__main_059",
    "esw2_dbg__main_002",
  ]) {
    const isMayhem = revealedDefinitionId === "esw2_dbg__main_059";
    const state = initializeGame({
      rootDir,
      seed: isMayhem ? 312022 : 312023,
    });
    const attacker = getActivePlayer(state);
    const defender = state.players.find(
      (candidate) => candidate.playerId !== attacker.playerId
    );
    assert.ok(defender);
    attacker.hand = [];
    defender.hand = [];
    attacker.chips = 0;
    defender.life.current = 5;
    state.turn.power = 0;
    const revealedCard = createCommonCard(
      revealedDefinitionId,
      `dwt-022-revealed-${revealedDefinitionId}`
    );
    state.common.mainDeck = [revealedCard];
    const outerToken = createDeadWizardTokenInStack(
      `dwt-022-outer-${revealedDefinitionId}`,
      "esw2_dbg__dead_wizard_token_022"
    );
    const nestedToken = createDeadWizardTokenInStack(
      `dwt-022-nested-${revealedDefinitionId}`,
      "esw2_dbg__dead_wizard_token_017"
    );
    state.common.deadWizardTokens.drawStack = [outerToken, nestedToken];
    const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
    state.effectChoiceStrategy = ({ effectId }) =>
      effectId === "attack_damage"
        ? { choiceId: defender.playerId }
        : undefined;

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attackCard.instanceId,
      }),
      { ok: true }
    );
    assert.equal(state.common.mainDeck[0], revealedCard);
    assert.equal(defender.deadWizardTokens.length, isMayhem ? 2 : 1);
    assert.equal(attacker.chips, 0);
    assert.deepEqual(
      state.eventLog
        .filter((event) => event.type === "deadWizardTokenFaceResolved")
        .map((event) => event.tokenInstanceId),
      isMayhem
        ? [outerToken.instanceId, nestedToken.instanceId]
        : [outerToken.instanceId]
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "effectCardRevealed" &&
          event.effectId ===
            "dead_wizard_token_reveal_main_deck_gain_if_mayhem" &&
          event.targetCardInstanceId === revealedCard.instanceId
      ),
      true
    );
    assert.equal(
      state.eventLog.filter((event) => event.type === "playerDied").length,
      1
    );
  }
});

test("ЖДК 023 пополняет личную колоду, сохраняет верхнюю карту и учитывает WP003", () => {
  const scenarios = [
    {
      name: "легенда после refill",
      definitionId: "esw2_dbg__legend_001",
      refill: true,
      selected: false,
      qualifies: true,
    },
    {
      name: "обычная карта",
      definitionId: "esw2_dbg__main_002",
      refill: false,
      selected: false,
      qualifies: false,
    },
    {
      name: "фамильяр с выбранным типом",
      definitionId: "esw2_dbg__familiar_007",
      refill: false,
      selected: true,
      qualifies: true,
    },
    {
      name: "фамильяр без выбранного типа",
      definitionId: "esw2_dbg__familiar_007",
      refill: false,
      selected: false,
      qualifies: false,
    },
  ] as const;

  for (const scenario of scenarios) {
    const state = initializeGame({
      rootDir,
      seed: 312023 + scenarios.indexOf(scenario),
    });
    const attacker = getActivePlayer(state);
    const defender = state.players.find(
      (candidate) => candidate.playerId !== attacker.playerId
    );
    assert.ok(defender);
    attacker.hand = [];
    defender.hand = [];
    attacker.chips = 0;
    defender.chips = 0;
    defender.life.current = 5;
    state.turn.power = 0;

    const revealedCard = createPlayerCard(
      defender,
      scenario.definitionId,
      `dwt-023-${scenario.name}`
    );
    defender.deck = scenario.refill ? [] : [revealedCard];
    defender.discard = scenario.refill ? [revealedCard] : [];
    if (scenario.definitionId === "esw2_dbg__familiar_007") {
      defender.wizardProperties = [
        {
          instanceId: markTokenInstanceId(`dwt-023-wp003-${scenario.name}`),
          definitionId: markTokenDefinitionId("esw2_dbg__wizard_property_003"),
          ownerId: defender.playerId,
        },
      ];
      if (scenario.selected) {
        const previousActivePlayerId = state.activePlayerId;
        state.activePlayerId = defender.playerId;
        assert.deepEqual(
          applyAction(state, {
            type: "setCardEffectiveType",
            cardInstanceId: revealedCard.instanceId,
            cardType: "legend",
            enabled: true,
          }),
          { ok: true }
        );
        state.activePlayerId = previousActivePlayerId;
      }
    }

    const outerToken = createDeadWizardTokenInStack(
      `dwt-023-outer-${scenario.name}`,
      "esw2_dbg__dead_wizard_token_023"
    );
    const nestedToken = createDeadWizardTokenInStack(
      `dwt-023-nested-${scenario.name}`,
      "esw2_dbg__dead_wizard_token_015"
    );
    state.common.deadWizardTokens.drawStack = [outerToken, nestedToken];
    const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
    state.effectChoiceStrategy = ({ effectId }) =>
      effectId === "attack_damage"
        ? { choiceId: defender.playerId }
        : undefined;

    assert.deepEqual(
      applyAction(state, {
        type: "playCard",
        cardInstanceId: attackCard.instanceId,
      }),
      { ok: true }
    );
    assert.equal(defender.deck[0], revealedCard);
    assert.equal(defender.discard.includes(revealedCard), false);
    assert.equal(defender.deadWizardTokens.length, scenario.qualifies ? 2 : 1);
    assert.equal(defender.chips, scenario.qualifies ? 1 : 0);
    assert.deepEqual(
      state.eventLog
        .filter((event) => event.type === "deadWizardTokenFaceResolved")
        .map((event) => event.tokenInstanceId),
      scenario.qualifies
        ? [outerToken.instanceId, nestedToken.instanceId]
        : [outerToken.instanceId]
    );
    assert.equal(
      state.eventLog.some(
        (event) =>
          event.type === "effectCardRevealed" &&
          event.effectId ===
            "dead_wizard_token_reveal_player_deck_gain_if_legend" &&
          event.targetCardInstanceId === revealedCard.instanceId
      ),
      true
    );
    assert.equal(
      scenario.refill &&
        state.eventLog.some(
          (event) =>
            event.type === "discardShuffledIntoDeck" &&
            event.playerId === defender.playerId
        ),
      scenario.refill
    );
  }
});

test("вложенный ЖДК не завершает игру сразу после исчерпания стопки", () => {
  const state = initializeGame({ rootDir, seed: 312024 });
  const attacker = getActivePlayer(state);
  const defender = state.players.find(
    (candidate) => candidate.playerId !== attacker.playerId
  );
  assert.ok(defender);
  attacker.hand = [];
  defender.hand = [];
  defender.life.current = 5;
  state.turn.power = 0;
  state.common.mainDeck = [
    createCommonCard("esw2_dbg__main_059", "dwt-022-empty-stack-revealed"),
  ];
  const outerToken = createDeadWizardTokenInStack(
    "dwt-022-empty-stack-outer",
    "esw2_dbg__dead_wizard_token_022"
  );
  state.common.deadWizardTokens.drawStack = [outerToken];
  const attackCard = addCardToHand(state, attacker, "esw2_dbg__main_030");
  state.effectChoiceStrategy = ({ effectId }) =>
    effectId === "attack_damage" ? { choiceId: defender.playerId } : undefined;

  assert.deepEqual(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: attackCard.instanceId,
    }),
    { ok: true }
  );
  assert.equal(defender.deadWizardTokens.length, 1);
  assert.deepEqual(
    state.eventLog
      .filter((event) => event.type === "deadWizardTokenFaceResolved")
      .map((event) => event.tokenInstanceId),
    [outerToken.instanceId]
  );
  assert.equal(getGameEndReason(state), "deadWizardTokensExhausted");
});

function chooseFamiliarDefenseAndExchange(
  state: GameState,
  defender: PlayerState,
  defense: CardInstance,
  exchange: "decline" | readonly string[]
): void {
  let exchangeSelectionIndex = 0;
  state.effectChoiceStrategy = ({ effectId, choices }) => {
    if (effectId === "attack_damage") {
      return { choiceId: defender.playerId };
    }
    if (effectId === "avoid_attack") {
      return { choiceId: defense.instanceId };
    }
    if (effectId !== "exchange_controlled_dead_wizard_tokens") {
      return undefined;
    }
    if (choices.some((choice) => choice.choiceId === "exchange")) {
      return {
        choiceId: exchange === "decline" ? "decline" : "exchange",
      };
    }
    if (exchange === "decline") {
      return undefined;
    }
    const choiceId = exchange[exchangeSelectionIndex];
    exchangeSelectionIndex += 1;
    return choiceId !== undefined &&
      choices.some((choice) => choice.choiceId === choiceId)
      ? { choiceId }
      : undefined;
  };
}

function getActivePlayer(state: GameState): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  assert.ok(player);
  return player;
}

function addCardToHand(
  state: GameState,
  player: PlayerState,
  definitionId: string
): CardInstance {
  assert.ok(state.cardDefinitions.has(definitionId));
  const card: CardInstance = {
    instanceId: markCardInstanceId(`dwt-interactions-${definitionId}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
}

function addCardToHandWithSuffix(
  state: GameState,
  player: PlayerState,
  definitionId: string,
  suffix: string
): CardInstance {
  assert.ok(state.cardDefinitions.has(definitionId));
  const card: CardInstance = {
    instanceId: markCardInstanceId(
      `dwt-interactions-${definitionId}-${suffix}`
    ),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
  player.hand.push(card);
  return card;
}

function createPlayerCard(
  player: PlayerState,
  definitionId: string,
  suffix: string
): CardInstance {
  return {
    instanceId: markCardInstanceId(`dwt-interactions-${suffix}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: player.playerId,
    marketChips: 0,
  };
}

function createDeadWizardToken(
  player: PlayerState,
  suffix = "default",
  definitionId = "esw2_dbg__dead_wizard_token_001"
): TokenInstance {
  return createDeadWizardTokenWithSuffix(player, suffix, definitionId);
}

function createDeadWizardTokenWithSuffix(
  player: PlayerState,
  suffix: string,
  definitionId = "esw2_dbg__dead_wizard_token_001"
): TokenInstance {
  return {
    instanceId: markTokenInstanceId(
      `dwt-interactions-physical-token-${suffix}`
    ),
    definitionId: markTokenDefinitionId(definitionId),
    ownerId: player.playerId,
  };
}

function createDeadWizardTokenInStack(
  suffix: string,
  definitionId = "esw2_dbg__dead_wizard_token_001"
): TokenInstance {
  return {
    instanceId: markTokenInstanceId(`dwt-interactions-stack-token-${suffix}`),
    definitionId: markTokenDefinitionId(definitionId),
    ownerId: "common",
  };
}

function createDohlakPermanent(player: PlayerState): CardInstance {
  return {
    instanceId: markCardInstanceId(
      `dwt-interactions-dohlak-${player.playerId}`
    ),
    definitionId: markCardDefinitionId("esw2_dbg__main_049"),
    ownerId: player.playerId,
    marketChips: 0,
  };
}

function createCommonCard(definitionId: string, suffix: string): CardInstance {
  return {
    instanceId: markCardInstanceId(`dwt-interactions-${suffix}`),
    definitionId: markCardDefinitionId(definitionId),
    ownerId: "common",
    marketChips: 0,
  };
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const activeIndex = state.players.findIndex(
    (player) => player.playerId === state.activePlayerId
  );
  assert.notEqual(activeIndex, -1);
  return Array.from({ length: state.players.length }, (_, offset) => {
    return state.players[(activeIndex + offset) % state.players.length];
  }).filter((player): player is PlayerState => player !== undefined);
}
