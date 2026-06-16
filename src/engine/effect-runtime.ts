import type { CardDefinition } from "./data.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type EffectSourceContext =
  | {
      sourceType: "card";
      playerId: PlayerState["playerId"];
      cardInstanceId: CardInstance["instanceId"];
      definitionId: CardDefinition["cardId"];
    };

export function executeOnPlayEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext,
): EffectExecutionResult {
  for (const effect of definition.engine.effects) {
    if (!isEffectRecord(effect) || effect["timing"] !== "onPlay") {
      continue;
    }

    const result = executeEffect(state, player, effect, source);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export type EffectExecutionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

function executeEffect(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
): EffectExecutionResult {
  if (effect["effectId"] === "add_power") {
    const amount = effect["amount"];
    if (typeof amount === "number") {
      state.turn.power += amount;
      state.eventLog.push({
        type: "effectAddPowerApplied",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: "add_power",
        amount,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  }

  if (effect["effectId"] === "draw_cards") {
    const amount = effect["amount"];
    if (typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0) {
      const drawnCount = drawCards(player, amount, state);
      state.eventLog.push({
        type: "effectDrawCardsApplied",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: "draw_cards",
        amount: drawnCount,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_add_power_equal_to_target_cost") {
    const targetResult = resolveTargetChoice(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    const choice = requireCardChoice(targetResult.choice, "fixture_add_power_equal_to_target_cost");
    if (!choice.ok) {
      return choice;
    }

    const definition = state.cardDefinitions.get(choice.card.definitionId);
    if (definition === undefined) {
      return {
        ok: false,
        error: `Missing target card definition ${choice.card.definitionId}`,
      };
    }

    state.turn.power += definition.engine.cost;
    state.eventLog.push({
      type: "effectFixtureTargetCostPowerApplied",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: "fixture_add_power_equal_to_target_cost",
      amount: definition.engine.cost,
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_gain_card") {
    const targetResult = resolveTargetChoice(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    if (effect["destination"] !== "discard") {
      return {
        ok: false,
        error: `Unsupported gain destination ${asString(effect["destination"])}`,
      };
    }

    const choice = requireCardChoice(targetResult.choice, "fixture_gain_card");
    if (!choice.ok) {
      return choice;
    }

    const moved = moveCardToPlayerZone(state, choice.card, player, player.discard);
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    state.eventLog.push({
      type: "effectCardGained",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: "fixture_gain_card",
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_discard_card") {
    const targetResult = resolveTargetChoice(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    const choice = requireCardChoice(targetResult.choice, "fixture_discard_card");
    if (!choice.ok) {
      return choice;
    }

    const moved = moveCardToPlayerZone(state, choice.card, player, player.discard);
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    state.eventLog.push({
      type: "effectCardDiscarded",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: "fixture_discard_card",
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_destroy_card") {
    const targetResult = resolveTargetChoice(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    if (effect["destination"] !== "destroyedMayhem") {
      return {
        ok: false,
        error: `Unsupported destroy destination ${asString(effect["destination"])}`,
      };
    }

    const choice = requireCardChoice(targetResult.choice, "fixture_destroy_card");
    if (!choice.ok) {
      return choice;
    }

    const moved = moveCardToZonePreservingOwner(state, choice.card, state.common.destroyedMayhem);
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    state.eventLog.push({
      type: "effectCardDestroyed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId: "fixture_destroy_card",
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_reveal_top_card") {
    if (effect["source"] !== "activePlayerDeck") {
      return {
        ok: false,
        error: `Unsupported reveal source ${asString(effect["source"])}`,
      };
    }

    const card = peekTopDeckCard(player, state);
    if (card === undefined) {
      state.eventLog.push({
        type: "effectRevealSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: "fixture_reveal_top_card",
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    state.eventLog.push({
      type: "effectCardRevealed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: "fixture_reveal_top_card",
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_play_top_card") {
    if (effect["source"] !== "activePlayerDeck") {
      return {
        ok: false,
        error: `Unsupported play-top source ${asString(effect["source"])}`,
      };
    }

    if (effect["destination"] !== "play") {
      return {
        ok: false,
        error: `Unsupported play-top destination ${asString(effect["destination"])}`,
      };
    }

    const card = drawTopDeckCard(player, state);
    if (card === undefined) {
      state.eventLog.push({
        type: "effectPlayTopSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: "fixture_play_top_card",
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const playedResult = playResolvedCard(state, player, card);
    if (!playedResult.ok) {
      return playedResult;
    }

    state.eventLog.push({
      type: "effectCardPlayedFromDeck",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: "fixture_play_top_card",
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "fixture_deal_damage") {
    const targetResult = resolveTargetChoice(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    if (targetResult.choice.choiceType !== "player") {
      return {
        ok: false,
        error: "Damage effect requires a player target",
      };
    }

    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      return {
        ok: false,
        error: `Invalid damage amount ${String(amount)}`,
      };
    }

    const targetPlayer = targetResult.choice.player;
    targetPlayer.life.current -= amount;
    state.eventLog.push({
      type: "effectDamageDealt",
      playerId: player.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "fixture_deal_damage",
      amount,
      sourceType: source.sourceType,
    });

    if (targetPlayer.life.current < 1) {
      resolvePlayerDeath(state, targetPlayer);
    }

    return { ok: true };
  }

  return { ok: true };
}

type TargetChoice =
  | {
      choiceType: "card";
      card: CardInstance;
    }
  | {
      choiceType: "player";
      player: PlayerState;
    };

type TargetChoiceResult =
  | {
      ok: true;
      choice: TargetChoice | undefined;
    }
  | {
      ok: false;
      error: string;
    };

function resolveTargetChoice(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
): TargetChoiceResult {
  const choicesResult = buildLegalTargetChoices(state, player, effect);
  if (!choicesResult.ok) {
    return choicesResult;
  }

  const choice = chooseFirstLegalChoice(choicesResult.choices);
  if (choice === undefined) {
    state.eventLog.push({
      type: "effectChoiceSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: asString(effect["effectId"]),
      sourceType: source.sourceType,
    });

    if (effect["emptyChoice"] === "fail") {
      return {
        ok: false,
        error: `No legal choices for effect ${asString(effect["effectId"])}`,
      };
    }

    return {
      ok: true,
      choice: undefined,
    };
  }

  state.eventLog.push({
    type: "effectChoiceSelected",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    ...(choice.choiceType === "card"
      ? {
          targetCardInstanceId: choice.card.instanceId,
          targetDefinitionId: choice.card.definitionId,
        }
      : {
          targetPlayerId: choice.player.playerId,
        }),
    effectId: asString(effect["effectId"]),
    sourceType: source.sourceType,
  });

  return {
    ok: true,
    choice,
  };
}

function buildLegalTargetChoices(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
): { ok: true; choices: TargetChoice[] } | { ok: false; error: string } {
  const target = effect["target"];
  if (!isEffectRecord(target)) {
    return {
      ok: false,
      error: `Effect ${asString(effect["effectId"])} requires a target selector`,
    };
  }

  const selector = target["selector"];
  if (selector === "mainMarketCard") {
    return {
      ok: true,
      choices: state.common.market.map((card) => ({
        choiceType: "card" as const,
        card,
      })),
    };
  }

  if (selector === "activePlayerHandCard") {
    const player = state.players.find((candidate) => candidate.playerId === state.activePlayerId);
    if (player === undefined) {
      return {
        ok: false,
        error: `Missing active player ${state.activePlayerId}`,
      };
    }

    return {
      ok: true,
      choices: player.hand.map((card) => ({
        choiceType: "card" as const,
        card,
      })),
    };
  }

  if (selector === "opponentPlayer") {
    return {
      ok: true,
      choices: state.players
        .filter((candidate) => candidate.playerId !== player.playerId)
        .map((candidate) => ({
          choiceType: "player" as const,
          player: candidate,
        })),
    };
  }

  return {
    ok: false,
    error: `Unsupported target selector ${asString(selector)}`,
  };
}

function chooseFirstLegalChoice(choices: readonly TargetChoice[]): TargetChoice | undefined {
  return choices[0];
}

function requireCardChoice(
  choice: TargetChoice,
  effectId: string,
): { ok: true; card: CardInstance } | { ok: false; error: string } {
  if (choice.choiceType !== "card") {
    return {
      ok: false,
      error: `Effect ${effectId} requires a card target`,
    };
  }

  return {
    ok: true,
    card: choice.card,
  };
}

function resolvePlayerDeath(state: GameState, player: PlayerState): void {
  state.eventLog.push({
    type: "playerDied",
    playerId: player.playerId,
  });

  if (state.common.deadWizardTokens.status === "available") {
    const token = state.common.deadWizardTokens.drawStack.shift();
    if (token !== undefined) {
      token.ownerId = player.playerId;
      player.deadWizardTokens.push(token);
      state.eventLog.push({
        type: "deadWizardTokenGained",
        playerId: player.playerId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      });
    }
  }

  player.life.current = 20;
  state.eventLog.push({
    type: "playerResurrected",
    playerId: player.playerId,
    amount: 20,
  });
}

function moveCardToPlayerZone(
  state: GameState,
  card: CardInstance,
  player: PlayerState,
  destination: CardInstance[],
): boolean {
  if (!removeCardFromKnownZones(state, card)) {
    return false;
  }

  card.ownerId = player.playerId;
  destination.push(card);
  return true;
}

function moveCardToZonePreservingOwner(state: GameState, card: CardInstance, destination: CardInstance[]): boolean {
  if (!removeCardFromKnownZones(state, card)) {
    return false;
  }

  destination.push(card);
  return true;
}

function removeCardFromKnownZones(state: GameState, card: CardInstance): boolean {
  const zones = [
    state.common.market,
    state.common.legendMarket,
    state.common.mainDeck,
    state.common.legendDeck,
    state.common.wildMagicStack,
    state.common.limpWandStack,
    state.common.destroyedMayhem,
    state.common.destroyedMegaMayhem,
    ...state.players.flatMap((player) => [player.deck, player.hand, player.discard, player.playedThisTurn, player.permanents]),
  ];

  for (const zone of zones) {
    const index = zone.findIndex((candidate) => candidate.instanceId === card.instanceId);
    if (index >= 0) {
      zone.splice(index, 1);
      return true;
    }
  }

  return false;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "<unknown>";
}

function drawCards(player: PlayerState, count: number, state: GameState): number {
  let drawnCount = 0;
  for (let index = 0; index < count; index += 1) {
    shuffleDiscardIntoDeckIfNeeded(player, state);

    const card = player.deck.shift();
    if (card === undefined) {
      return drawnCount;
    }

    player.hand.push(card);
    drawnCount += 1;
  }

  return drawnCount;
}

function drawTopDeckCard(player: PlayerState, state: GameState): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck.shift();
}

function peekTopDeckCard(player: PlayerState, state: GameState): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck[0];
}

function playResolvedCard(state: GameState, player: PlayerState, card: CardInstance): EffectExecutionResult {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing card definition ${card.definitionId}`,
    };
  }

  card.ownerId = player.playerId;
  if (definition.engine.isOngoing) {
    player.permanents.push(card);
  } else {
    player.playedThisTurn.push(card);
  }

  return executeOnPlayEffects(state, player, definition, {
    sourceType: "card",
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
}

function shuffleDiscardIntoDeckIfNeeded(player: PlayerState, state: GameState): void {
  if (player.deck.length > 0 || player.discard.length === 0) {
    return;
  }

  player.deck.push(...player.discard.splice(0));
  shuffleInPlace(player.deck, state);
  state.eventLog.push({
    type: "discardShuffledIntoDeck",
    playerId: player.playerId,
  });
}

function shuffleInPlace<T>(items: T[], state: GameState): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rng.nextInt(index + 1);
    const item = items[index];
    const swapItem = items[swapIndex];
    if (item === undefined || swapItem === undefined) {
      throw new Error("Unexpected sparse array during shuffle");
    }

    items[index] = swapItem;
    items[swapIndex] = item;
  }
}

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}
