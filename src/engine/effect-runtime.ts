import type { CardDefinition, TokenDefinition } from "./data.js";
import { calculateEffectivePlayerMaxLife } from "./effective-values.js";
import { recordEffectChipsChanged, recordMarketChipsGained } from "./event-recorder.js";
import {
  getEffectRuntimeHandler,
  type EffectExecutionResult,
  type EffectRuntimeServices,
  type EffectSourceContext,
  type TargetChoice,
  type TargetChoiceResult,
} from "./effect-runtime-registry.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export function executeOnPlayEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext,
): EffectExecutionResult {
  return executeEffects(state, player, definition.engine.effects, "onPlay", source);
}

export function executeActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext,
): EffectExecutionResult {
  return executeEffects(state, player, definition.engine.effects, "activation", source);
}

export function executeWizardPropertyActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
  source: EffectSourceContext,
): EffectExecutionResult {
  if (definition.kind !== "wizardProperty" || definition.engine === undefined) {
    return { ok: true };
  }

  return executeEffects(state, player, definition.engine.effects, "activation", source);
}

export function hasExecutableWizardPropertyActivation(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
): boolean {
  if (definition.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
    return false;
  }

  return definition.engine.effects.some((effect) => {
    return isEffectRecord(effect) && effect["timing"] === "activation" && effectConditionMatches(state, player, effect);
  });
}

export function executeWizardPropertyOnPlayCardEffects(
  state: GameState,
  player: PlayerState,
  playedDefinition: CardDefinition,
): EffectExecutionResult {
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (definition?.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
      continue;
    }

    const result = executeEffects(
      state,
      player,
      definition.engine.effects.filter((effect) => cardTriggerMatches(effect, playedDefinition)),
      "onPlayCard",
      {
        sourceType: "wizardProperty",
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
    );
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function moveGainedCardToPlayerDestination(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
): { ok: true; destination: "discard" | "deckTop" } | { ok: false; error: string } {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing gained card definition ${card.definitionId}`,
    };
  }

  if (!removeCardFromKnownZones(state, card)) {
    return {
      ok: false,
      error: `Cannot move card ${card.instanceId}`,
    };
  }

  moveMarketChipsToPlayer(state, player, card);
  card.ownerId = player.playerId;
  state.turn.gainedCardDefinitionIds.push(card.definitionId);
  let destination: "discard" | "deckTop" = "discard";

  for (const token of player.wizardProperties) {
    const tokenDefinition = state.tokenDefinitions.get(token.definitionId);
    if (tokenDefinition?.kind !== "wizardProperty" || tokenDefinition.engine === undefined || !tokenDefinition.engine.playableInV0) {
      continue;
    }

    for (const effect of tokenDefinition.engine.effects) {
      if (!isEffectRecord(effect) || effect["timing"] !== "onGainCard" || !cardTriggerMatches(effect, definition)) {
        continue;
      }

      if (effect["effectId"] === "topdeck_gained_card") {
        destination = "deckTop";
        state.eventLog.push({
          type: "effectChoiceSelected",
          playerId: player.playerId,
          cardInstanceId: token.instanceId,
          definitionId: token.definitionId,
          tokenInstanceId: token.instanceId,
          tokenDefinitionId: token.definitionId,
          targetCardInstanceId: card.instanceId,
          targetDefinitionId: card.definitionId,
          effectId: "topdeck_gained_card",
          sourceType: "wizardProperty",
        });
        continue;
      }

      const result = executeEffect(state, player, effect, {
        sourceType: "wizardProperty",
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      });
      if (!result.ok) {
        return result;
      }
    }
  }

  if (destination === "deckTop") {
    player.deck.unshift(card);
  } else {
    player.discard.push(card);
  }

  return { ok: true, destination };
}

export function calculateEndTurnDrawCount(state: GameState, player: PlayerState): number {
  let drawCount = 5;
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (definition?.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect) || effect["effectId"] !== "temporary_hand_limit_by_gained_card_type") {
        continue;
      }

      const amount = effect["amount"];
      if (effect["timing"] !== "endTurn" || typeof amount !== "number" || !Number.isSafeInteger(amount)) {
        continue;
      }

      drawCount += amount * countGainedCardsMatchingEffect(state, effect);
    }
  }

  return drawCount;
}

export function executeMayhemEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext,
): EffectExecutionResult {
  return executeEffects(state, player, definition.engine.effects, "onMayhemResolve", source);
}

function executeEffects(
  state: GameState,
  player: PlayerState,
  effects: readonly unknown[],
  timing: string,
  source: EffectSourceContext,
): EffectExecutionResult {
  for (const effect of effects) {
    if (!isEffectRecord(effect) || effect["timing"] !== timing) {
      continue;
    }

    if (timing === "onMayhemResolve" && !isSupportedMayhemRuntimeEffect(effect)) {
      return {
        ok: false,
        error: `Unsupported Mayhem effect id ${asString(effect["effectId"])}`,
      };
    }

    if (!effectConditionMatches(state, player, effect)) {
      continue;
    }

    const result = executeEffect(state, player, effect, source);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function cardTriggerMatches(effect: unknown, definition: CardDefinition): boolean {
  if (!isEffectRecord(effect)) {
    return false;
  }

  const cardTypes = effect["cardTypes"];
  const matchesType =
    Array.isArray(cardTypes) &&
    cardTypes.some((cardType) => typeof cardType === "string" && definition.engine.cardTypes.includes(cardType));
  const matchesOngoing = effect["isOngoing"] === true && definition.engine.isOngoing;
  return matchesType || matchesOngoing;
}

function countGainedCardsMatchingEffect(state: GameState, effect: Record<string, unknown>): number {
  return state.turn.gainedCardDefinitionIds.filter((definitionId) => {
    const definition = state.cardDefinitions.get(definitionId);
    return definition !== undefined && cardTriggerMatches(effect, definition);
  }).length;
}

function isSupportedMayhemRuntimeEffect(effect: Record<string, unknown>): boolean {
  const effectId = effect["effectId"];
  if (typeof effectId === "string" && getEffectRuntimeHandler(effectId) !== undefined) {
    return true;
  }

  return (
    effectId === "heal" ||
    effectId === "set_life" ||
    effectId === "mega_mayhem_set_life" ||
    effectId === "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" ||
    effectId === "mega_mayhem_each_player_toggle_dingler" ||
    effectId === "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" ||
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" ||
    effectId === "mayhem_each_player_discard_deck_then_destroy_from_discard" ||
    effectId === "gain_chips_per_player_with_status" ||
    effectId === "reveal_top_card" ||
    effectId === "play_top_card" ||
    effectId === "draw_cards" ||
    effectId === "gain_status" ||
    effectId === "remove_status" ||
    effectId === "toggle_status" ||
    effectId === "wild_magic_choice"
  );
}

function executeEffect(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
): EffectExecutionResult {
  const runtimeHandler = typeof effect["effectId"] === "string" ? getEffectRuntimeHandler(effect["effectId"]) : undefined;
  if (runtimeHandler !== undefined) {
    return runtimeHandler.execute(state, player, effect, source, effectRuntimeServices);
  }

  if (effect["effectId"] === "gain_chips") {
    const amount = effect["amount"];
    if (typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0) {
      const chipsBefore = player.chips;
      player.chips += amount;
      recordEffectChipsChanged(state, player, source, "gain_chips", chipsBefore, player.chips);
    }

    return { ok: true };
  }

  if (effect["effectId"] === "gain_chips_per_player_with_status") {
    const amountPerPlayer = effect["amountPerPlayer"];
    const status = effect["status"];
    if (typeof amountPerPlayer === "number" && Number.isSafeInteger(amountPerPlayer) && amountPerPlayer > 0 && status === "dingler") {
      const matchingPlayerCount = state.players.filter((candidate) => {
        return candidate.statuses.some((candidateStatus) => candidateStatus.statusId === status);
      }).length;
      const amount = matchingPlayerCount * amountPerPlayer;
      const chipsBefore = player.chips;
      player.chips += amount;
      recordEffectChipsChanged(state, player, source, "gain_chips_per_player_with_status", chipsBefore, player.chips);
    }

    return { ok: true };
  }

  if (effect["effectId"] === "wild_magic_choice") {
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return {
        ok: false,
        error: "Wild Magic effect requires options",
      };
    }

    for (const option of options) {
      if (!isEffectRecord(option) || !isLegalWildMagicOption(state, player, option)) {
        continue;
      }

      state.eventLog.push({
        type: "wildMagicChoiceSelected",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(option["effectId"]),
        sourceType: source.sourceType,
      });
      return executeEffect(state, player, option, source);
    }

    state.eventLog.push({
      type: "wildMagicChoiceSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "wild_magic_choice",
      sourceType: source.sourceType,
    });
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

  if (effect["effectId"] === "reveal_top_card") {
    const effectId = asString(effect["effectId"]);
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
        effectId,
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
      effectId,
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "play_top_card") {
    const effectId = asString(effect["effectId"]);
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
        effectId,
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
      effectId,
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "play_top_card_from_foe_deck") {
    if (effect["targetSelector"] !== "chosenFoe") {
      return {
        ok: false,
        error: `Unsupported foe-deck target ${asString(effect["targetSelector"])}`,
      };
    }

    const foe = getOpponentsInSeatingOrder(state, player).find((candidate) => {
      return candidate.deck.length > 0 || candidate.discard.length > 0;
    });
    if (foe === undefined) {
      state.eventLog.push({
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(effect["effectId"]),
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const card = drawTopDeckCard(foe, state);
    if (card === undefined) {
      state.eventLog.push({
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        targetPlayerId: foe.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(effect["effectId"]),
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const playedResult = playResolvedCard(state, player, card, {
      nonOngoingOwnerId: card.ownerId,
      ongoingOwnerId: player.playerId,
    });
    if (!playedResult.ok) {
      return playedResult;
    }

    state.eventLog.push({
      type: "effectFoeDeckCardPlayed",
      playerId: player.playerId,
      targetPlayerId: foe.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: asString(effect["effectId"]),
      sourceType: source.sourceType,
    });

    return { ok: true };
  }

  if (effect["effectId"] === "heal") {
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
        error: "Heal effect requires a player target",
      };
    }

    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      return {
        ok: false,
        error: `Invalid heal amount ${String(amount)}`,
      };
    }

    healPlayer(state, player, targetResult.choice.player, amount, asString(effect["effectId"]), source);
    return { ok: true };
  }

  if (effect["effectId"] === "gain_status") {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${asString(statusId)}`,
      };
    }

    const targetResult = resolveStatusTargetPlayers(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      gainDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
    }

    return { ok: true };
  }

  if (effect["effectId"] === "remove_status") {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${asString(statusId)}`,
      };
    }

    const targetResult = resolveStatusTargetPlayers(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      removeDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
    }

    return { ok: true };
  }

  if (effect["effectId"] === "toggle_status") {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${asString(statusId)}`,
      };
    }

    const targetResult = resolveStatusTargetPlayers(state, player, effect, source);
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      if (hasDinglerStatus(targetPlayer)) {
        removeDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
      } else {
        gainDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
      }
    }
    return { ok: true };
  }

  if (effect["effectId"] === "set_life") {
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
        error: "Set-life effect requires a player target",
      };
    }

    const lifeTotal = effect["lifeTotal"];
    if (typeof lifeTotal !== "number" || !Number.isSafeInteger(lifeTotal) || lifeTotal < 1) {
      return {
        ok: false,
        error: `Invalid life total ${String(lifeTotal)}`,
      };
    }

    setPlayerLife(state, targetResult.choice.player, lifeTotal);
    state.eventLog.push({
      type: "effectLifeSet",
      playerId: player.playerId,
      targetPlayerId: targetResult.choice.player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: asString(effect["effectId"]),
      amount: lifeTotal,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  if (effect["effectId"] === "mega_mayhem_set_life" && effect["targetSelector"] === "eachPlayerClockwiseFromActive") {
    const lifeTotal = effect["lifeTotal"];
    if (typeof lifeTotal !== "number" || !Number.isSafeInteger(lifeTotal) || lifeTotal < 1) {
      return {
        ok: false,
        error: `Invalid life total ${String(lifeTotal)}`,
      };
    }

    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      setPlayerLife(state, targetPlayer, lifeTotal);
      state.eventLog.push({
        type: "effectLifeSet",
        playerId: player.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(effect["effectId"]),
        amount: lifeTotal,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  }

  if (effect["effectId"] === "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem") {
    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      const destroyedCard = state.common.mainDeck.shift();
      if (destroyedCard === undefined) {
        state.eventLog.push({
          type: "effectDestroyTopMainDeckSkipped",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: asString(effect["effectId"]),
          sourceType: source.sourceType,
        });
        continue;
      }

      const destination = getDestroyDestination(state, destroyedCard);
      if (!destination.ok) {
        return destination;
      }

      destination.zone.push(destroyedCard);
      state.eventLog.push({
        type: "effectTopMainDeckCardDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        targetCardInstanceId: destroyedCard.instanceId,
        targetDefinitionId: destroyedCard.definitionId,
        effectId: asString(effect["effectId"]),
        sourceType: source.sourceType,
      });

      const destroyedDefinition = state.cardDefinitions.get(destroyedCard.definitionId);
      if (destroyedDefinition?.engine.cardKind === "mayhem") {
        resolvePlayerDeath(state, targetPlayer, undefined);
      }
    }
    return { ok: true };
  }

  if (effect["effectId"] === "mega_mayhem_each_player_toggle_dingler") {
    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      if (hasDinglerStatus(targetPlayer)) {
        removeDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
        continue;
      }

      gainDinglerStatus(state, targetPlayer, asString(effect["effectId"]), source);
    }
    return { ok: true };
  }

  if (effect["effectId"] === "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none") {
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      return {
        ok: false,
        error: `Invalid Mayhem discard amount ${String(amount)}`,
      };
    }

    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      const discardedCards = discardTopDeckCards(state, targetPlayer, amount);
      for (const discardedCard of discardedCards) {
        const destination = getDestroyDestination(state, discardedCard);
        if (!destination.ok) {
          return destination;
        }

        if (!moveCardToZonePreservingOwner(state, discardedCard, destination.zone)) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${discardedCard.instanceId}`,
          };
        }
      }

      state.eventLog.push({
        type: "mayhemDiscardedTopDeckCardsDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(effect["effectId"]),
        amount: discardedCards.length,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  }

  if (effect["effectId"] === "mayhem_each_player_choose_discard_hand_draw_or_take_damage") {
    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      const discardedCount = targetPlayer.hand.length;
      targetPlayer.discard.push(...targetPlayer.hand.splice(0));
      const drawnCount = drawCards(targetPlayer, 5, state);
      state.eventLog.push({
        type: "mayhemHandDiscardedAndRedrawn",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: asString(effect["effectId"]),
        amount: discardedCount + drawnCount,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  }

  if (effect["effectId"] === "mayhem_each_player_discard_deck_then_destroy_from_discard") {
    for (const targetPlayer of getPlayersInActiveOrder(state)) {
      const discardedCount = targetPlayer.deck.length;
      targetPlayer.discard.push(...targetPlayer.deck.splice(0));
      const destroyTarget = targetPlayer.discard[0];
      if (destroyTarget !== undefined) {
        const destination = getDestroyDestination(state, destroyTarget);
        if (!destination.ok) {
          return destination;
        }

        if (!moveCardToZonePreservingOwner(state, destroyTarget, destination.zone)) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${destroyTarget.instanceId}`,
          };
        }
      }

      state.eventLog.push({
        type: "mayhemDeckDiscardedThenDiscardCardDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        ...(destroyTarget === undefined
          ? {}
          : {
              targetCardInstanceId: destroyTarget.instanceId,
              targetDefinitionId: destroyTarget.definitionId,
            }),
        effectId: asString(effect["effectId"]),
        amount: discardedCount,
        sourceType: source.sourceType,
      });
    }
    return { ok: true };
  }

  return { ok: true };
}

function effectConditionMatches(state: GameState, player: PlayerState, effect: Record<string, unknown>): boolean {
  const condition = effect["condition"];
  if (condition === undefined) {
    return true;
  }

  if (!isEffectRecord(condition)) {
    return false;
  }

  if (condition["conditionId"] !== "control_count") {
    return false;
  }

  const cardTypes = condition["cardTypes"];
  const minimumCount = condition["minimumCount"];
  if (!Array.isArray(cardTypes) || typeof minimumCount !== "number" || !Number.isSafeInteger(minimumCount)) {
    return false;
  }

  const matchingCount = [...player.permanents, ...player.playedThisTurn].filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return definition !== undefined && cardTypes.some((cardType) => {
      return typeof cardType === "string" && definition.engine.cardTypes.includes(cardType);
    });
  }).length;

  return matchingCount >= minimumCount;
}

function getWizardPropertyAttackProfile(
  state: GameState,
  source: EffectSourceContext,
): { damageBonus: number; unavoidable: boolean } {
  if (source.sourceType !== "card") {
    return { damageBonus: 0, unavoidable: false };
  }

  const sourceCard = findCardInstance(state, source.cardInstanceId);
  if (sourceCard === undefined || sourceCard.ownerId === "common") {
    return { damageBonus: 0, unavoidable: false };
  }

  const owner = state.players.find((player) => player.playerId === sourceCard.ownerId);
  if (owner === undefined) {
    return { damageBonus: 0, unavoidable: false };
  }

  let damageBonus = 0;
  let unavoidable = false;
  for (const token of owner.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (definition?.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect) || effect["timing"] !== "attackReplacement" || !effectMatchesCardDefinition(effect, source.definitionId)) {
        continue;
      }

      if (effect["effectId"] === "modify_owned_wand_attack_damage") {
        const amount = effect["amount"];
        if (typeof amount === "number" && Number.isSafeInteger(amount)) {
          damageBonus += amount;
        }
      }

      if (effect["effectId"] === "prevent_defense_against_owned_wand_attacks") {
        unavoidable = true;
      }
    }
  }

  return { damageBonus, unavoidable };
}

function effectMatchesCardDefinition(effect: Record<string, unknown>, definitionId: string): boolean {
  const cardDefinitionIds = effect["cardDefinitionIds"];
  return Array.isArray(cardDefinitionIds) && cardDefinitionIds.some((candidate) => candidate === definitionId);
}

function findCardInstance(state: GameState, cardInstanceId: string): CardInstance | undefined {
  for (const player of state.players) {
    const card = [...player.hand, ...player.deck, ...player.discard, ...player.playedThisTurn, ...player.permanents].find(
      (candidate) => candidate.instanceId === cardInstanceId,
    );
    if (card !== undefined) {
      return card;
    }
  }

  return [
    ...state.common.market,
    ...state.common.legendMarket,
    ...state.common.mainDeck,
    ...state.common.legendDeck,
    ...state.common.wildMagicStack,
    ...state.common.limpWandStack,
    ...state.common.destroyedMayhem,
    ...state.common.destroyedMegaMayhem,
  ].find((candidate) => candidate.instanceId === cardInstanceId);
}

function resolveAttackTarget(
  state: GameState,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: string,
  source: EffectSourceContext,
  unavoidable = false,
): void {
  state.eventLog.push({
    type: "attackTargetStarted",
    playerId: attackingPlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount,
    sourceType: source.sourceType,
  });

  if (!unavoidable && resolveDefenseWindow(state, targetPlayer)) {
    state.eventLog.push({
      type: "attackAvoided",
      playerId: targetPlayer.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    return;
  }

  dealDamage(state, attackingPlayer, targetPlayer, amount, effectId, source);
}

function resolveMayhemAttack(
  state: GameState,
  sourcePlayer: PlayerState,
  amount: number,
  effectId: string,
  source: EffectSourceContext,
): void {
  const targets = getPlayersInActiveOrder(state);
  const decisions: Array<{ player: PlayerState; avoided: boolean }> = [];

  state.eventLog.push({
    type: "mayhemDecisionPhaseStarted",
    playerId: sourcePlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount,
    sourceType: source.sourceType,
  });

  for (const targetPlayer of targets) {
    state.eventLog.push({
      type: "mayhemDecisionStarted",
      playerId: sourcePlayer.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount,
      sourceType: source.sourceType,
    });
    const avoided = resolveDefenseWindow(state, targetPlayer);
    if (avoided) {
      state.eventLog.push({
        type: "attackAvoided",
        playerId: targetPlayer.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
    }

    decisions.push({ player: targetPlayer, avoided });
  }

  state.eventLog.push({
    type: "mayhemResolutionPhaseStarted",
    playerId: sourcePlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount,
    sourceType: source.sourceType,
  });

  for (const decision of decisions) {
    if (decision.avoided) {
      state.eventLog.push({
        type: "mayhemTargetSkipped",
        playerId: sourcePlayer.playerId,
        targetPlayerId: decision.player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      continue;
    }

    state.eventLog.push({
      type: "attackTargetStarted",
      playerId: sourcePlayer.playerId,
      targetPlayerId: decision.player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount,
      sourceType: source.sourceType,
    });
    dealDamage(state, sourcePlayer, decision.player, amount, effectId, source);
  }
}

function getOpponentsInSeatingOrder(state: GameState, player: PlayerState): PlayerState[] {
  const playerIndex = state.players.findIndex((candidate) => candidate.playerId === player.playerId);
  if (playerIndex < 0) {
    return [];
  }

  return Array.from({ length: state.players.length - 1 }, (_, offset) => {
    return state.players[(playerIndex + offset + 1) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function isLegalWildMagicOption(state: GameState, player: PlayerState, option: Record<string, unknown>): boolean {
  if (option["effectId"] === "add_power") {
    const amount = option["amount"];
    return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0;
  }

  if (option["effectId"] === "play_top_card_from_foe_deck") {
    return getOpponentsInSeatingOrder(state, player).some((foe) => foe.deck.length > 0 || foe.discard.length > 0);
  }

  return false;
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const playerIndex = state.players.findIndex((candidate) => candidate.playerId === state.activePlayerId);
  if (playerIndex < 0) {
    return [];
  }

  return Array.from({ length: state.players.length }, (_, offset) => {
    return state.players[(playerIndex + offset) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

const effectRuntimeServices: EffectRuntimeServices = {
  resolveTargetChoice,
  requireCardChoice,
  moveGainedCardToPlayerDestination,
  moveCardToPlayerZone,
  moveCardToZonePreservingOwner,
  getDestroyDestination,
  getOpponentsInSeatingOrder,
  getWizardPropertyAttackProfile,
  dealDamage,
  resolveAttackTarget,
  resolveDefenseWindow,
  resolveMayhemAttack,
  asString,
};

function resolveStatusTargetPlayers(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
): { ok: true; players: PlayerState[] } | { ok: false; error: string } {
  if (effect["targetSelector"] === "eachPlayerClockwiseFromActive") {
    return {
      ok: true,
      players: getPlayersInActiveOrder(state),
    };
  }

  const targetResult = resolveTargetChoice(state, player, effect, source);
  if (!targetResult.ok) {
    return targetResult;
  }

  if (targetResult.choice === undefined) {
    return {
      ok: true,
      players: [],
    };
  }

  if (targetResult.choice.choiceType !== "player") {
    return {
      ok: false,
      error: `Status effect requires a player target`,
    };
  }

  return {
    ok: true,
    players: [targetResult.choice.player],
  };
}

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
    const targetSelector = effect["targetSelector"];
    if (targetSelector === "chosenFoe") {
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

    if (targetSelector === "chosenPlayer") {
      return {
        ok: true,
        choices: state.players.map((candidate) => ({
          choiceType: "player" as const,
          player: candidate,
        })),
      };
    }

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

  if (selector === "anyPlayer") {
    return {
      ok: true,
      choices: state.players.map((candidate) => ({
        choiceType: "player" as const,
        player: candidate,
      })),
    };
  }

  if (selector === "activePlayer") {
    return {
      ok: true,
      choices: [
        {
          choiceType: "player",
          player,
        },
      ],
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

function resolvePlayerDeath(
  state: GameState,
  player: PlayerState,
  killCredit:
    | {
        killer: PlayerState;
        effectId: string;
        source: EffectSourceContext;
      }
    | undefined,
): void {
  state.eventLog.push({
    type: "playerDied",
    playerId: player.playerId,
  });

  if (killCredit !== undefined) {
    awardBasicTrophyForKill(state, killCredit.killer, player, killCredit.effectId, killCredit.source);
  }

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

  const resurrectionLifeTotal = getResurrectionLifeTotal(state, player);
  player.life.current = resurrectionLifeTotal;
  state.eventLog.push({
    type: "playerResurrected",
    playerId: player.playerId,
    amount: resurrectionLifeTotal,
  });
}

function getResurrectionLifeTotal(state: GameState, player: PlayerState): number {
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (definition?.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (
        !isEffectRecord(effect) ||
        effect["effectId"] !== "set_resurrection_life_total" ||
        effect["timing"] !== "replacement"
      ) {
        continue;
      }

      const unlessStatusId = effect["unlessStatusId"];
      if (typeof unlessStatusId === "string" && player.statuses.some((status) => status.statusId === unlessStatusId)) {
        continue;
      }

      const lifeTotal = effect["lifeTotal"];
      if (typeof lifeTotal === "number" && Number.isSafeInteger(lifeTotal) && lifeTotal > 0) {
        return lifeTotal;
      }
    }
  }

  return 20;
}

function awardBasicTrophyForKill(
  state: GameState,
  killer: PlayerState,
  defeatedPlayer: PlayerState,
  effectId: string,
  source: EffectSourceContext,
): void {
  if (killer.playerId === defeatedPlayer.playerId || !givesBasicTrophyCredit(effectId)) {
    return;
  }

  for (const player of state.players) {
    const trophyIndex = player.trophyLikeObjects.findIndex((trophy) => trophy.trophyId === "basicTrophy");
    if (trophyIndex >= 0) {
      const [trophy] = player.trophyLikeObjects.splice(trophyIndex, 1);
      if (trophy !== undefined) {
        trophy.ownerId = killer.playerId;
        killer.trophyLikeObjects.push(trophy);
      }

      state.eventLog.push({
        type: "trophyControlChanged",
        playerId: killer.playerId,
        targetPlayerId: defeatedPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      return;
    }
  }

  killer.trophyLikeObjects.push({
    instanceId: "basic-trophy",
    trophyId: "basicTrophy",
    ownerId: killer.playerId,
    effects: [],
  });
  state.eventLog.push({
    type: "trophyControlChanged",
    playerId: killer.playerId,
    targetPlayerId: defeatedPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function givesBasicTrophyCredit(effectId: string): boolean {
  return effectId === "attack_damage" || effectId === "multi_target_attack" || effectId === "deal_damage";
}

function dealDamage(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: string,
  source: EffectSourceContext,
): void {
  targetPlayer.life.current -= amount;
  state.eventLog.push({
    type: "effectDamageDealt",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount,
    sourceType: source.sourceType,
  });

  if (targetPlayer.life.current < 1) {
    resolvePlayerDeath(
      state,
      targetPlayer,
      givesBasicTrophyCredit(effectId)
        ? {
            killer: sourcePlayer,
            effectId,
            source,
          }
        : undefined,
    );
  }
}

function resolveDefenseWindow(state: GameState, defendingPlayer: PlayerState): boolean {
  const defense = findFirstLegalDefense(state, defendingPlayer);
  if (defense === undefined) {
    return false;
  }

  state.eventLog.push({
    type: "defenseChoiceSelected",
    playerId: defendingPlayer.playerId,
    cardInstanceId: defense.card.instanceId,
    definitionId: defense.card.definitionId,
    effectId: "avoid_attack",
  });

  if (!payDefenseCosts(state, defendingPlayer, defense.card, defense.effect)) {
    return false;
  }

  const branchEffects = defense.effect["branchEffects"];
  if (Array.isArray(branchEffects)) {
    const branchResult = executeEffects(
      state,
      defendingPlayer,
      branchEffects,
      "onDefense",
      {
        sourceType: "card",
        playerId: defendingPlayer.playerId,
        cardInstanceId: defense.card.instanceId,
        definitionId: defense.card.definitionId,
      },
    );
    if (!branchResult.ok) {
      return false;
    }
  }

  const cardIndex = defendingPlayer.hand.findIndex((card) => card.instanceId === defense.card.instanceId);
  if (cardIndex < 0) {
    return false;
  }

  const [card] = defendingPlayer.hand.splice(cardIndex, 1);
  if (card === undefined) {
    return false;
  }

  if (defense.destination === "discardSelf") {
    defendingPlayer.discard.push(card);
    state.eventLog.push({
      type: "defenseCardMoved",
      playerId: defendingPlayer.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      destination: "discard",
    });
    return true;
  }

  if (defense.destination === "topdeckSelf") {
    defendingPlayer.deck.unshift(card);
    state.eventLog.push({
      type: "defenseCardMoved",
      playerId: defendingPlayer.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      destination: "deckTop",
    });
    return true;
  }

  return false;
}

function findFirstLegalDefense(
  state: GameState,
  defendingPlayer: PlayerState,
): { card: CardInstance; destination: "discardSelf" | "topdeckSelf"; effect: Record<string, unknown> } | undefined {
  for (const card of defendingPlayer.hand) {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      continue;
    }

    const defenseEffect = definition.engine.effects.find((effect): effect is Record<string, unknown> => {
      return (
        isEffectRecord(effect) &&
        effect["effectId"] === "avoid_attack" &&
        effect["timing"] === "onDefense" &&
        (effect["destination"] === "discardSelf" || effect["destination"] === "topdeckSelf")
      );
    });
    if (defenseEffect !== undefined && canPayDefenseCosts(defendingPlayer, card, defenseEffect)) {
      const destination = defenseEffect["destination"];
      if (destination !== "discardSelf" && destination !== "topdeckSelf") {
        continue;
      }

      return {
        card,
        destination,
        effect: defenseEffect,
      };
    }
  }

  return undefined;
}

function canPayDefenseCosts(
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  defenseEffect: Record<string, unknown>,
): boolean {
  const costs = defenseEffect["costs"];
  if (costs === undefined) {
    return true;
  }

  if (!Array.isArray(costs)) {
    return false;
  }

  for (const cost of costs) {
    if (!isEffectRecord(cost)) {
      return false;
    }

    if (cost["costId"] === "discard_other_hand_card") {
      if (defendingPlayer.hand.every((card) => card.instanceId === defenseCard.instanceId)) {
        return false;
      }
      continue;
    }

    if (cost["costId"] === "spend_chips") {
      const amount = cost["amount"];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || defendingPlayer.chips < amount) {
        return false;
      }
      continue;
    }

    if (cost["costId"] === "pay_life") {
      const amount = cost["amount"];
      if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        defendingPlayer.life.current - amount < 1
      ) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}

function payDefenseCosts(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  defenseEffect: Record<string, unknown>,
): boolean {
  const costs = defenseEffect["costs"];
  if (costs === undefined) {
    return true;
  }

  if (!Array.isArray(costs)) {
    return false;
  }

  for (const cost of costs) {
    if (!isEffectRecord(cost)) {
      return false;
    }

    if (cost["costId"] === "discard_other_hand_card") {
      const paidCardIndex = defendingPlayer.hand.findIndex((card) => card.instanceId !== defenseCard.instanceId);
      if (paidCardIndex < 0) {
        return false;
      }

      const [paidCard] = defendingPlayer.hand.splice(paidCardIndex, 1);
      if (paidCard === undefined) {
        return false;
      }

      defendingPlayer.discard.push(paidCard);
      state.eventLog.push({
        type: "defenseCostPaid",
        playerId: defendingPlayer.playerId,
        cardInstanceId: defenseCard.instanceId,
        definitionId: defenseCard.definitionId,
        targetCardInstanceId: paidCard.instanceId,
        targetDefinitionId: paidCard.definitionId,
        effectId: "discard_other_hand_card",
      });
      continue;
    }

    if (cost["costId"] === "spend_chips") {
      const amount = cost["amount"];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || defendingPlayer.chips < amount) {
        return false;
      }

      defendingPlayer.chips -= amount;
      state.eventLog.push({
        type: "defenseCostPaid",
        playerId: defendingPlayer.playerId,
        cardInstanceId: defenseCard.instanceId,
        definitionId: defenseCard.definitionId,
        effectId: "spend_chips",
        amount,
      });
      continue;
    }

    if (cost["costId"] === "pay_life") {
      const amount = cost["amount"];
      if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        defendingPlayer.life.current - amount < 1
      ) {
        return false;
      }

      defendingPlayer.life.current -= amount;
      state.eventLog.push({
        type: "defenseCostPaid",
        playerId: defendingPlayer.playerId,
        cardInstanceId: defenseCard.instanceId,
        definitionId: defenseCard.definitionId,
        effectId: "pay_life",
        amount,
      });
      continue;
    }

    return false;
  }

  return true;
}

function healPlayer(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: string,
  source: EffectSourceContext,
): void {
  const effectiveMaxLife = calculateEffectivePlayerMaxLife(state, targetPlayer.playerId);
  const previousLife = targetPlayer.life.current;
  const unclampedLife = previousLife + amount;
  targetPlayer.life.current = Math.min(unclampedLife, effectiveMaxLife);
  const healedAmount = Math.max(0, targetPlayer.life.current - previousLife);

  state.eventLog.push({
    type: "effectLifeHealed",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: healedAmount,
    sourceType: source.sourceType,
  });

  if (unclampedLife > effectiveMaxLife) {
    state.eventLog.push({
      type: "playerLifeClamped",
      playerId: targetPlayer.playerId,
      amount: effectiveMaxLife,
    });
  }
}

function setPlayerLife(state: GameState, player: PlayerState, lifeTotal: number): void {
  const effectiveLifeTotal = hasDinglerStatus(player) ? Math.min(lifeTotal, 15) : lifeTotal;
  player.life.current = effectiveLifeTotal;

  if (effectiveLifeTotal < lifeTotal) {
    state.eventLog.push({
      type: "playerLifeClamped",
      playerId: player.playerId,
      amount: effectiveLifeTotal,
    });
  }
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

  moveMarketChipsToPlayer(state, player, card);
  card.ownerId = player.playerId;
  destination.push(card);
  return true;
}

function moveMarketChipsToPlayer(state: GameState, player: PlayerState, card: CardInstance): void {
  if (card.marketChips <= 0) {
    return;
  }

  const amount = card.marketChips;
  const chipsBefore = player.chips;
  player.chips += amount;
  card.marketChips = 0;
  recordMarketChipsGained(state, player, card, chipsBefore, player.chips);
}

function moveCardToZonePreservingOwner(state: GameState, card: CardInstance, destination: CardInstance[]): boolean {
  if (!removeCardFromKnownZones(state, card)) {
    return false;
  }

  destination.push(card);
  return true;
}

function getDestroyDestination(
  state: GameState,
  card: CardInstance,
): { ok: true; zone: CardInstance[] } | { ok: false; error: string } {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing target card definition ${card.definitionId}`,
    };
  }

  if (definition.engine.cardKind === "wildMagic") {
    return { ok: true, zone: state.common.wildMagicStack };
  }

  if (definition.engine.cardKind === "limpWand") {
    return { ok: true, zone: state.common.limpWandStack };
  }

  if (definition.engine.cardKind === "megaMayhem") {
    return { ok: true, zone: state.common.destroyedMegaMayhem };
  }

  if (definition.engine.cardKind === "mayhem") {
    return { ok: true, zone: state.common.destroyedMayhem };
  }

  return { ok: true, zone: state.common.destroyedPile };
}

function removeCardFromKnownZones(state: GameState, card: CardInstance): boolean {
  for (const player of state.players) {
    if (player.unboughtFamiliar?.instanceId === card.instanceId) {
      player.unboughtFamiliar = undefined;
      return true;
    }
  }

  const zones = [
    state.common.market,
    state.common.legendMarket,
    state.common.mainDeck,
    state.common.legendDeck,
    state.common.wildMagicStack,
    state.common.limpWandStack,
    state.common.destroyedPile,
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

function discardTopDeckCards(state: GameState, player: PlayerState, count: number): CardInstance[] {
  const discardedCards: CardInstance[] = [];
  for (let index = 0; index < count; index += 1) {
    shuffleDiscardIntoDeckIfNeeded(player, state);

    const card = player.deck.shift();
    if (card === undefined) {
      return discardedCards;
    }

    player.discard.push(card);
    discardedCards.push(card);
  }

  return discardedCards;
}

function createDinglerStatus(playerId: PlayerState["playerId"]): PlayerState["statuses"][number] {
  return {
    instanceId: `dingler-${playerId}`,
    statusId: "dingler",
    ownerId: playerId,
    effects: [
      {
        effectId: "fixture_modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: -10,
        target: {
          targetType: "player",
        },
      },
    ],
  };
}

function hasDinglerStatus(player: PlayerState): boolean {
  return player.statuses.some((status) => status.statusId === "dingler");
}

function gainDinglerStatus(
  state: GameState,
  player: PlayerState,
  effectId: string,
  source: EffectSourceContext,
): void {
  if (!hasDinglerStatus(player)) {
    player.statuses.push(createDinglerStatus(player.playerId));
  }

  player.life.current = Math.min(player.life.current, 15);
  state.eventLog.push({
    type: "dinglerStatusGained",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function removeDinglerStatus(
  state: GameState,
  player: PlayerState,
  effectId: string,
  source: EffectSourceContext,
): void {
  const dinglerIndex = player.statuses.findIndex((status) => status.statusId === "dingler");
  if (dinglerIndex < 0) {
    return;
  }

  player.statuses.splice(dinglerIndex, 1);
  state.eventLog.push({
    type: "dinglerStatusRemoved",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function drawTopDeckCard(player: PlayerState, state: GameState): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck.shift();
}

function peekTopDeckCard(player: PlayerState, state: GameState): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck[0];
}

function playResolvedCard(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  ownership: {
    nonOngoingOwnerId?: PlayerState["playerId"] | "common";
    ongoingOwnerId?: PlayerState["playerId"] | "common";
  } = {},
): EffectExecutionResult {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing card definition ${card.definitionId}`,
    };
  }

  if (definition.engine.isOngoing) {
    card.ownerId = ownership.ongoingOwnerId ?? player.playerId;
    player.permanents.push(card);
  } else {
    card.ownerId = ownership.nonOngoingOwnerId ?? player.playerId;
    player.playedThisTurn.push(card);
  }

  const effectResult = executeOnPlayEffects(state, player, definition, {
    sourceType: "card",
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }

  return executeWizardPropertyOnPlayCardEffects(state, player, definition);
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
