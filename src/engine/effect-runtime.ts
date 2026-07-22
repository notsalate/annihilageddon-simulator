import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  resolveDefenseWindow as resolveDefenseWindowWithServices,
  type AttackDefenseServices,
} from "./attack-defense.js";
import {
  createAttackAmountState,
  resolveAttackAmount,
} from "./attack-resolution.js";
import { reconcileActivePlayerControlledPower } from "./controlled-power.js";
import {
  findCardLocation,
  getControlledCards,
  grantTemporaryControl,
} from "./control-ledger.js";
import { calculateEffectivePlayerMaxLife } from "./effective-values.js";
import {
  recordCardMoved,
  recordGameEvent,
  recordMarketChipsGained,
} from "./event-recorder.js";
import {
  type AttackIntent,
  type DamageCause,
  type DamageResult,
  type AttackTargetResolutionResult,
  createAttackDefenseUsage,
  type DefenseAttackContext,
  type DefenseWindowResolutionResult,
  type EffectChoice,
  type EffectExecutionResult,
  type EffectRuntimeServices,
  type EffectSourceContext,
  type MayhemAttackPlanTarget,
  resolveEffectRuntimeCatalogEntry,
  type TargetChoice,
  type TargetChoiceResult,
} from "./effect-runtime-registry.js";
import {
  isRuntimeEffectSelectorTarget,
  type RuntimeEffect,
  type RuntimeEffectId,
  type RuntimeEffectPayload,
  type WildMagicOption,
} from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import {
  dispatchControlledCardEffects,
  listControlledCardEffects,
} from "./trigger-dispatch.js";
export function executeOnPlayEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  return executeEffects(
    state,
    player,
    definition.engine.effects,
    "onPlay",
    source
  );
}

export function executeActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  return executeEffects(
    state,
    player,
    definition.engine.effects,
    "activation",
    source
  );
}

export function executeWizardPropertyActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  if (definition.kind !== "wizardProperty" || definition.engine === undefined) {
    return { ok: true };
  }

  return executeEffects(
    state,
    player,
    definition.engine.effects,
    "activation",
    source
  );
}

export function hasExecutableWizardPropertyActivation(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition
): boolean {
  if (
    definition.kind !== "wizardProperty" ||
    definition.engine === undefined ||
    !definition.engine.playableInV0
  ) {
    return false;
  }

  return definition.engine.effects.some((effect) => {
    return (
      effect.timing === "activation" &&
      effectConditionMatches(state, player, effect)
    );
  });
}

export function executeWizardPropertyOnPlayCardEffects(
  state: GameState,
  player: PlayerState,
  playedDefinition: CardDefinition
): EffectExecutionResult {
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }

    const result = executeEffects(
      state,
      player,
      definition.engine.effects.filter((effect) =>
        cardTriggerMatches(effect, playedDefinition)
      ),
      "onPlayCard",
      {
        sourceType: "wizardProperty",
        runtimeMode: "combat",
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      }
    );
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  return { ok: true };
}

export function executeControlledCardOnPlayCardEffects(
  state: GameState,
  player: PlayerState,
  playedCard: CardInstance
): EffectExecutionResult {
  const playedDefinition = state.cardDefinitions.get(playedCard.definitionId);
  if (playedDefinition === undefined) {
    return {
      ok: false,
      error: `Missing played card definition ${playedCard.definitionId}`,
    };
  }

  return dispatchControlledCardEffects({
    state,
    player,
    timing: "onPlayCard",
    predicate(effect, _source, context) {
      return (
        context.definition.engine.isOngoing &&
        cardTriggerMatches(effect, playedDefinition)
      );
    },
    execute(effect, source) {
      return executeEffects(state, player, [effect], "onPlayCard", source);
    },
  });
}

export function moveGainedCardToPlayerDestination(
  state: GameState,
  player: PlayerState,
  card: CardInstance
):
  | { ok: true; destination: "discard" | "deckTop" }
  | { ok: false; error: string } {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing gained card definition ${card.definitionId}`,
    };
  }

  const sourceZone = getCardZoneName(state, card) ?? "unknown";
  const ownerBefore = card.ownerId;
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
    if (
      tokenDefinition?.kind !== "wizardProperty" ||
      tokenDefinition.engine === undefined ||
      !tokenDefinition.engine.playableInV0
    ) {
      continue;
    }

    for (const effect of tokenDefinition.engine.effects) {
      if (
        effect.timing !== "onGainCard" ||
        !cardTriggerMatches(effect, definition)
      ) {
        continue;
      }

      if (effect["effectId"] === "topdeck_gained_card") {
        destination = "deckTop";
        recordGameEvent(state, {
          type: "effectChoiceSelected",
          playerId: player.playerId,
          cardInstanceId: token.instanceId,
          definitionId: token.definitionId,
          tokenInstanceId: token.instanceId,
          tokenDefinitionId: token.definitionId,
          choiceKind: "cardTarget",
          targetCardInstanceId: card.instanceId,
          targetDefinitionId: card.definitionId,
          effectId: "topdeck_gained_card",
          sourceType: "wizardProperty",
        });
        continue;
      }

      const result = executeEffect(state, player, effect, {
        sourceType: "wizardProperty",
        runtimeMode: "combat",
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
  recordCardMoved(state, player, card, {
    sourceZone,
    destinationZone:
      destination === "deckTop"
        ? `${player.playerId}.deckTop`
        : `${player.playerId}.discard`,
    ownerBefore,
    ownerAfter: card.ownerId,
  });

  return { ok: true, destination };
}

export function calculateEndTurnDrawCount(
  state: GameState,
  player: PlayerState
): number {
  let drawCount = 5;
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (effect.effectId !== "temporary_hand_limit_by_gained_card_type") {
        continue;
      }

      const amount = effect["amount"];
      if (
        effect["timing"] !== "endTurn" ||
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        continue;
      }

      drawCount += amount * countGainedCardsMatchingEffect(state, effect);
    }
  }

  for (const { effect } of listControlledCardEffects({
    state,
    player,
    timing: "endTurn",
  })) {
    if (
      effect.effectId === "ongoing_hand_refill_bonus" &&
      Number.isSafeInteger(effect.amount) &&
      effect.amount > 0
    ) {
      drawCount += effect.amount;
      continue;
    }

    if (effect.effectId !== "increase_hand_limit_at_max_life") {
      continue;
    }

    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      continue;
    }

    if (
      player.life.current >=
      calculateEffectivePlayerMaxLife(state, player.playerId)
    ) {
      drawCount += amount;
    }
  }

  return drawCount;
}

export function executeMayhemEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  return executeEffects(
    state,
    player,
    definition.engine.effects,
    "onMayhemResolve",
    source
  );
}

function executeEffects(
  state: GameState,
  player: PlayerState,
  effects: readonly RuntimeEffect[],
  timing: RuntimeEffect["timing"],
  source: EffectSourceContext
): EffectExecutionResult {
  for (const effect of effects) {
    if (effect.timing !== timing) {
      continue;
    }

    if (!effectConditionMatches(state, player, effect)) {
      continue;
    }

    const result = executeEffect(state, player, effect, source);
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  return { ok: true };
}

function cardTriggerMatches(
  effect: RuntimeEffectPayload,
  definition: CardDefinition
): boolean {
  const cardTypes = effect.cardTypes;
  const matchesType =
    Array.isArray(cardTypes) &&
    cardTypes.some(
      (cardType) =>
        typeof cardType === "string" &&
        definition.engine.cardTypes.includes(cardType)
    );
  const matchesOngoing =
    effect.isOngoing === true && definition.engine.isOngoing;
  const cardTags = effect.cardTags;
  const matchesTag =
    Array.isArray(cardTags) &&
    cardTags.some(
      (cardTag) =>
        typeof cardTag === "string" &&
        definition.engine.tags?.includes(cardTag) === true
    );
  return matchesType || matchesOngoing || matchesTag;
}

function countGainedCardsMatchingEffect(
  state: GameState,
  effect: RuntimeEffectPayload
): number {
  return state.turn.gainedCardDefinitionIds.filter((definitionId) => {
    const definition = state.cardDefinitions.get(definitionId);
    return definition !== undefined && cardTriggerMatches(effect, definition);
  }).length;
}

export function executeEffect(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext
): EffectExecutionResult {
  const resolution = resolveEffectRuntimeCatalogEntry(
    `Effect ${asString(effect["effectId"])}`,
    asString(effect["effectId"]),
    effect,
    source.runtimeMode,
    source.sourceType
  );
  if (!resolution.ok) {
    return { ok: false, error: getEffectExecutionError(resolution.errors) };
  }

  return resolution.entry.handler.execute(
    state,
    player,
    resolution.effect,
    source,
    effectRuntimeServices
  );
}

export function getEffectExecutionError(errors: readonly string[]): string {
  return errors[0] ?? "Effect resolution failed without diagnostic";
}

function effectConditionMatches(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload
): boolean {
  const { condition } = effect;
  if (condition === undefined) {
    return true;
  }

  if ("conditionId" in condition) {
    const matchingCount = getControlledCards(state, player).filter((card) => {
      const definition = state.cardDefinitions.get(card.definitionId);
      return (
        definition !== undefined &&
        condition.cardTypes.some((cardType: string) =>
          controlledCardMatchesType(definition, cardType)
        )
      );
    }).length;

    return matchingCount >= condition.minimumCount;
  }

  return false;
}

function controlledCardMatchesType(
  definition: CardDefinition,
  cardType: string
): boolean {
  return (
    definition.engine.cardTypes.includes(cardType) ||
    definition.engine.tags?.includes("counts_as_every_card_type") === true
  );
}

function getAttackProfile(
  state: GameState,
  _attackInitiator: PlayerState,
  source: EffectSourceContext
): { damageBonus: number; unavoidable: boolean } {
  if (source.sourceType !== "card") {
    return { damageBonus: 0, unavoidable: false };
  }

  const sourceCard = findCardLocation(state, source.cardInstanceId)?.card;
  if (sourceCard === undefined || sourceCard.ownerId === "common") {
    return { damageBonus: 0, unavoidable: false };
  }

  const sourceOwner = state.players.find(
    (candidate) => candidate.playerId === sourceCard.ownerId
  );
  if (sourceOwner === undefined) {
    return { damageBonus: 0, unavoidable: false };
  }

  let damageBonus = 0;
  let unavoidable = false;
  for (const token of sourceOwner.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (
        effect.timing !== "attackReplacement" ||
        !effectMatchesCardDefinition(state, effect, source.definitionId)
      ) {
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

  for (const card of getControlledCards(state, sourceOwner)) {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (
      definition === undefined ||
      !definition.engine.playableInV0 ||
      !definition.engine.isOngoing
    ) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (
        effect.timing !== "attackReplacement" ||
        !effectMatchesCardDefinition(state, effect, source.definitionId)
      ) {
        continue;
      }
      if (effect["effectId"] === "modify_owned_wand_attack_damage") {
        const amount = effect["amount"];
        if (typeof amount === "number" && Number.isSafeInteger(amount)) {
          damageBonus += amount;
        }
      }
    }
  }

  return { damageBonus, unavoidable };
}

function effectMatchesCardDefinition(
  state: GameState,
  effect: RuntimeEffectPayload,
  definitionId: string
): boolean {
  const cardDefinitionIds = effect["cardDefinitionIds"];
  if (
    Array.isArray(cardDefinitionIds) &&
    cardDefinitionIds.some((candidate) => candidate === definitionId)
  ) {
    return true;
  }

  const cardTags = effect["cardTags"];
  if (!Array.isArray(cardTags)) {
    return false;
  }

  const definition = state.cardDefinitions.get(definitionId);
  const definitionTags = definition?.engine.tags ?? [];
  return cardTags.some(
    (candidate) =>
      typeof candidate === "string" && definitionTags.includes(candidate)
  );
}

function resolveAttackTarget(
  state: GameState,
  intent: AttackIntent
): AttackTargetResolutionResult {
  const { attackingPlayer, targetPlayer, amount, effectId, source } = intent;
  const unavoidable = intent.unavoidable ?? false;
  const baseAmount = intent.baseAmount ?? amount;
  const originalSource = intent.originalSource ?? source;
  const defenseUsage = intent.defenseUsage ?? createAttackDefenseUsage();
  const amountComponents =
    intent.amountComponents ??
    createAttackAmountState(baseAmount, amount - baseAmount);
  const { components: resolvedAmountComponents, total: resolvedAmount } =
    resolveAttackAmount(state, attackingPlayer, targetPlayer, amountComponents);
  recordGameEvent(state, {
    type: "attackTargetStarted",
    playerId: attackingPlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: resolvedAmount,
    sourceType: source.sourceType,
  });

  const defenseResult: DefenseWindowResolutionResult = unavoidable
    ? { ok: true, avoided: false }
    : resolveDefenseWindow(state, targetPlayer, {
        kind: "redirectable",
        attackingPlayer,
        amountComponents: resolvedAmountComponents,
        effectId,
        source,
        originalSource,
        defenseUsage,
      });
  if (!defenseResult.ok) {
    return defenseResult;
  }
  if (defenseResult.gameEnd !== undefined) {
    return { ok: true, gameEnd: defenseResult.gameEnd };
  }
  if (defenseResult.avoided) {
    recordGameEvent(state, {
      type: "attackAvoided",
      playerId: targetPlayer.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    if (defenseResult.resolution === undefined) {
      return {
        ok: false,
        error: "Redirectable defense avoided an attack without a player attack resolution",
      };
    }
    return { ok: true, resolution: defenseResult.resolution };
  }

  return {
    ok: true,
    resolution: {
      ...dealDamage(
        state,
        attackingPlayer,
        targetPlayer,
        resolvedAmount,
        effectId,
        source,
        { kind: "playerControlled", player: attackingPlayer }
      ),
      avoided: false,
      amountComponents: resolvedAmountComponents,
      attackingPlayer,
      currentAttackerId: attackingPlayer.playerId,
      targetPlayer,
      source,
      originalSource,
    },
  };
}

function resolveMayhemAttackPlan(
  state: GameState,
  sourcePlayer: PlayerState,
  targets: readonly MayhemAttackPlanTarget[],
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  const decisions: Array<MayhemAttackPlanTarget & { avoided: boolean }> = [];
  const firstAmount = targets[0]?.amount;
  const phaseAmount =
    firstAmount !== undefined &&
    targets.every((target) => target.amount === firstAmount)
      ? { amount: firstAmount }
      : {};

  recordGameEvent(state, {
    type: "mayhemDecisionPhaseStarted",
    playerId: sourcePlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    ...phaseAmount,
    sourceType: source.sourceType,
  });

  for (const target of targets) {
    recordGameEvent(state, {
      type: "mayhemDecisionStarted",
      playerId: sourcePlayer.playerId,
      targetPlayerId: target.targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount: target.amount,
      sourceType: source.sourceType,
    });
    const defenseResult = resolveDefenseWindow(state, target.targetPlayer, {
      kind: "nonredirectable",
      source,
      defenseUsage: createAttackDefenseUsage(),
    });
    if (!defenseResult.ok) {
      return defenseResult;
    }
    if (defenseResult.gameEnd !== undefined) {
      return { ok: true, gameEnd: defenseResult.gameEnd };
    }
    const avoided = defenseResult.avoided;
    if (avoided) {
      recordGameEvent(state, {
        type: "attackAvoided",
        playerId: target.targetPlayer.playerId,
        targetPlayerId: target.targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
    }

    decisions.push({ ...target, avoided });
  }

  recordGameEvent(state, {
    type: "mayhemResolutionPhaseStarted",
    playerId: sourcePlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    ...phaseAmount,
    sourceType: source.sourceType,
  });

  for (const decision of decisions) {
    if (decision.avoided) {
      recordGameEvent(state, {
        type: "mayhemTargetSkipped",
        playerId: sourcePlayer.playerId,
        targetPlayerId: decision.targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      continue;
    }

    recordGameEvent(state, {
      type: "attackTargetStarted",
      playerId: sourcePlayer.playerId,
      targetPlayerId: decision.targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount: decision.amount,
      sourceType: source.sourceType,
    });
    dealDamage(
      state,
      sourcePlayer,
      decision.targetPlayer,
      decision.amount,
      effectId,
      source,
      { kind: "ownerless" }
    );
  }

  return { ok: true };
}

function resolveMayhemAttack(
  state: GameState,
  sourcePlayer: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  return resolveMayhemAttackPlan(
    state,
    sourcePlayer,
    getPlayersInActiveOrder(state).map((targetPlayer) => ({
      targetPlayer,
      amount,
    })),
    effectId,
    source
  );
}

function getOpponentsInSeatingOrder(
  state: GameState,
  player: PlayerState
): PlayerState[] {
  const playerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === player.playerId
  );
  if (playerIndex < 0) {
    return [];
  }

  return Array.from({ length: state.players.length - 1 }, (_, offset) => {
    return state.players[(playerIndex + offset + 1) % state.players.length];
  }).filter((candidate): candidate is PlayerState => candidate !== undefined);
}

function isLegalWildMagicOption(
  state: GameState,
  player: PlayerState,
  option: WildMagicOption
): boolean {
  if (option.effectId === "add_power") {
    return true;
  }

  if (option.effectId === "play_top_card_from_foe_deck") {
    return getOpponentsInSeatingOrder(state, player).some(
      (foe) => foe.deck.length > 0 || foe.discard.length > 0
    );
  }

  return false;
}

function getPlayersInActiveOrder(state: GameState): PlayerState[] {
  const playerIndex = state.players.findIndex(
    (candidate) => candidate.playerId === state.activePlayerId
  );
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
  discardTopDeckCards,
  getDestroyDestination,
  getOpponentsInSeatingOrder,
  getPlayersInActiveOrder,
  getAttackProfile,
  chooseEffectChoice,
  dealDamage,
  applyAfterPlayerAttackDamage,
  healPlayer,
  setPlayerLife,
  resolveStatusTargetPlayers,
  gainDinglerStatus,
  removeDinglerStatus,
  hasDinglerStatus,
  resolveAttackTarget,
  resolveDefenseWindow,
  resolveMayhemAttack,
  resolveMayhemAttackPlan,
  resolvePlayerDeath(state, player) {
    resolvePlayerDeath(state, player, player.life.current, undefined);
  },
  peekTopDeckCard,
  drawTopDeckCard,
  playResolvedCard,
  isLegalWildMagicOption,
  executeEffect,
  asString,
};

function resolveStatusTargetPlayers(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext
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
  effect: RuntimeEffectPayload,
  source: EffectSourceContext
): TargetChoiceResult {
  const choicesResult = buildLegalTargetChoices(state, player, effect);
  if (!choicesResult.ok) {
    return choicesResult;
  }

  const effectId = effect["effectId"];
  const runtimeChoices: EffectChoice[] = choicesResult.choices.map((choice) =>
    choice.choiceType === "card"
      ? {
          choiceKind: "cardTarget" as const,
          choiceId: choice.card.instanceId,
          cards: [choice.card],
          amount: 1,
        }
      : {
          choiceKind: "playerTarget" as const,
          choiceId: choice.player.playerId,
          players: [choice.player],
        }
  );
  const selected = chooseEffectChoice(
    state,
    player,
    source,
    effectId,
    runtimeChoices
  );
  if (selected === undefined) {
    if (effect["emptyChoice"] === "fail") {
      return {
        ok: false,
        error: `No legal choices for effect ${asString(effectId)}`,
      };
    }
    return { ok: true, choice: undefined };
  }

  if (selected.choiceKind === "cardTarget") {
    if (selected.cards.length !== 1) {
      return {
        ok: false,
        error: `Card target choice must contain exactly one card`,
      };
    }
    const card = selected.cards[0];
    if (card === undefined) {
      return {
        ok: false,
        error: `Card target choice must contain exactly one card`,
      };
    }
    return { ok: true, choice: { choiceType: "card", card } };
  }
  if (selected.choiceKind === "playerTarget") {
    if (selected.players.length !== 1) {
      return {
        ok: false,
        error: `Player target choice must contain exactly one player`,
      };
    }
    const targetPlayer = selected.players[0];
    if (targetPlayer === undefined) {
      return {
        ok: false,
        error: `Player target choice must contain exactly one player`,
      };
    }
    return { ok: true, choice: { choiceType: "player", player: targetPlayer } };
  }
  return {
    ok: false,
    error: `Unsupported target choice kind ${selected.choiceKind}`,
  };
}

function chooseEffectChoice(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  choices: readonly EffectChoice[]
): EffectChoice | undefined {
  const selectedChoice = state.effectChoiceStrategy?.({
    player,
    effectId,
    sourceType: source.sourceType,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    choices,
  });
  const choice =
    selectedChoice !== undefined && choices.includes(selectedChoice)
      ? selectedChoice
      : choices[0];
  if (choice === undefined) {
    recordGameEvent(state, {
      type: "effectChoiceSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      legalChoiceCount: 0,
      sourceType: source.sourceType,
    });
    return undefined;
  }

  const choicePayloadBase = {
    choiceId: choice.choiceId,
    choiceIds: choices.map((candidate) => candidate.choiceId),
    legalChoiceCount: choices.length,
  };
  const choicePayload =
    choice.choiceKind === "option"
      ? { ...choicePayloadBase, choiceKind: "option" as const }
      : choice.choiceKind === "playerTarget"
        ? {
            ...choicePayloadBase,
            choiceKind: "playerTarget" as const,
            targetPlayerIds: choice.players.map(
              (candidate) => candidate.playerId
            ),
            ...(choice.players.length === 1
              ? { targetPlayerId: choice.players[0]!.playerId }
              : {}),
          }
        : choice.choiceKind === "cardTarget"
          ? {
              ...choicePayloadBase,
              choiceKind: "cardTarget" as const,
              amount: choice.amount,
              targetCardInstanceIds: choice.cards.map(
                (candidate) => candidate.instanceId
              ),
              targetDefinitionIds: choice.cards.map(
                (candidate) => candidate.definitionId
              ),
              ...(choice.cards.length === 1
                ? {
                    targetCardInstanceId: choice.cards[0]!.instanceId,
                    targetDefinitionId: choice.cards[0]!.definitionId,
                  }
                : {}),
            }
          : choice.choiceKind === "defense"
            ? {
                ...choicePayloadBase,
                choiceKind: "defense" as const,
                ...(choice.card === undefined
                  ? {}
                  : {
                      targetCardInstanceId: choice.card.instanceId,
                      targetDefinitionId: choice.card.definitionId,
                    }),
              }
            : {
                ...choicePayloadBase,
                choiceKind: "directionalPlayerTarget" as const,
                direction: choice.direction,
                targetPlayerIds: choice.players.map(
                  (candidate) => candidate.playerId
                ),
              };

  recordGameEvent(state, {
    type: "effectChoiceSelected",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    ...choicePayload,
    sourceType: source.sourceType,
  });
  return choice;
}

function buildLegalTargetChoices(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload
): { ok: true; choices: TargetChoice[] } | { ok: false; error: string } {
  const target = effect.target;
  if (!isRuntimeEffectSelectorTarget(target)) {
    const selector = effect.targetSelector;
    const targetSelector = effect.targetSelector;
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
      error: `Unsupported target selector ${asString(selector)}`,
    };
  }

  const selector = target.selector;
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
    const player = state.players.find(
      (candidate) => candidate.playerId === state.activePlayerId
    );
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

function requireCardChoice(
  choice: TargetChoice,
  effectId: RuntimeEffectId
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
  lifeAfterDamage: number,
  killCredit:
    | {
        killer: PlayerState;
        effectId: RuntimeEffectId;
        source: EffectSourceContext;
      }
    | undefined
): void {
  recordGameEvent(state, {
    type: "playerDied",
    playerId: player.playerId,
    lifeAfter: lifeAfterDamage,
  });

  if (killCredit !== undefined) {
    awardBasicTrophyForKill(
      state,
      killCredit.killer,
      player,
      killCredit.effectId,
      killCredit.source
    );
  }

  if (state.common.deadWizardTokens.status === "available") {
    const token = state.common.deadWizardTokens.drawStack.shift();
    if (token !== undefined) {
      token.ownerId = player.playerId;
      player.deadWizardTokens.push(token);
      recordGameEvent(state, {
        type: "deadWizardTokenGained",
        playerId: player.playerId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      });
      reconcileActivePlayerControlledPower(state);
    }
  }

  const resurrectionLifeTotal = getResurrectionLifeTotal(state, player);
  const lifeBeforeResurrection = player.life.current;
  player.life.current = resurrectionLifeTotal;
  recordGameEvent(state, {
    type: "playerResurrected",
    playerId: player.playerId,
    amount: resurrectionLifeTotal,
    lifeBefore: lifeBeforeResurrection,
    lifeAfter: resurrectionLifeTotal,
  });
}

function getResurrectionLifeTotal(
  state: GameState,
  player: PlayerState
): number {
  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (
        effect.effectId !== "set_resurrection_life_total" ||
        effect.timing !== "replacement"
      ) {
        continue;
      }

      const unlessStatusId = effect["unlessStatusId"];
      if (
        typeof unlessStatusId === "string" &&
        player.statuses.some((status) => status.statusId === unlessStatusId)
      ) {
        continue;
      }

      const lifeTotal = effect["lifeTotal"];
      if (
        typeof lifeTotal === "number" &&
        Number.isSafeInteger(lifeTotal) &&
        lifeTotal > 0
      ) {
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
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  if (killer.playerId === defeatedPlayer.playerId) {
    return;
  }

  for (const player of state.players) {
    const trophyIndex = player.trophyLikeObjects.findIndex(
      (trophy) => trophy.trophyId === "basicTrophy"
    );
    if (trophyIndex >= 0) {
      const [trophy] = player.trophyLikeObjects.splice(trophyIndex, 1);
      if (trophy !== undefined) {
        trophy.ownerId = killer.playerId;
        killer.trophyLikeObjects.push(trophy);
      }

      recordGameEvent(state, {
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
  recordGameEvent(state, {
    type: "trophyControlChanged",
    playerId: killer.playerId,
    targetPlayerId: defeatedPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function dealDamage(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  cause: DamageCause
): DamageResult {
  const previousLife = targetPlayer.life.current;
  targetPlayer.life.current -= amount;
  const damageDealt = Math.max(0, Math.min(previousLife, amount));
  recordGameEvent(state, {
    type: "effectDamageDealt",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: damageDealt,
    targetLifeBefore: previousLife,
    targetLifeAfter: targetPlayer.life.current,
    sourceType: source.sourceType,
  });

  const killed = targetPlayer.life.current < 1;
  if (killed) {
    resolvePlayerDeath(
      state,
      targetPlayer,
      targetPlayer.life.current,
      cause.kind === "playerControlled"
        ? {
            killer: cause.player,
            effectId,
            source,
          }
        : undefined
    );
  }

  applyDamageDealtTriggers(
    state,
    sourcePlayer,
    targetPlayer,
    damageDealt,
    source
  );

  return {
    damageDealt,
    killed,
  };
}

function applyDamageDealtTriggers(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  damageDealt: number,
  damageSource: EffectSourceContext
): void {
  if (
    damageDealt <= 0 ||
    sourcePlayer.playerId === targetPlayer.playerId ||
    state.activePlayerId !== sourcePlayer.playerId
  ) {
    return;
  }

  for (const controlledCard of getControlledCards(state, sourcePlayer)) {
    const definition = state.cardDefinitions.get(controlledCard.definitionId);
    if (definition === undefined || !definition.engine.playableInV0) {
      continue;
    }

    for (const effect of definition.engine.effects) {
      if (
        effect.effectId !== "heal_equal_damage_dealt_on_own_turn" ||
        effect.timing !== "afterDamageDealt"
      ) {
        continue;
      }

      healPlayer(
        state,
        sourcePlayer,
        sourcePlayer,
        damageDealt,
        "heal_equal_damage_dealt_on_own_turn",
        {
          ...damageSource,
          cardInstanceId: controlledCard.instanceId,
          definitionId: controlledCard.definitionId,
        }
      );
    }
  }
}

/**
 * Shared seam for player-owned attacks after every target has resolved. The
 * caller supplies the current attacker, so a future redirect can transfer its
 * ledger ownership. Global Mayhem attacks deliberately do not call it: they
 * have no permanent owner.
 */
function applyAfterPlayerAttackDamage(
  state: GameState,
  attackingPlayer: PlayerState,
  totalDamageDealt: number,
  _attackSource: EffectSourceContext
): void {
  if (
    totalDamageDealt <= 0 ||
    state.activePlayerId !== attackingPlayer.playerId ||
    state.turn.damagingAttackPlayerIds.includes(attackingPlayer.playerId)
  ) {
    return;
  }

  state.turn.damagingAttackPlayerIds.push(attackingPlayer.playerId);
  dispatchControlledCardEffects({
    state,
    player: attackingPlayer,
    timing: "afterFirstAttackDamageEachTurn",
    execute(effect, source) {
      const resolution = resolveEffectRuntimeCatalogEntry(
        `Effect ${effect.effectId}`,
        effect.effectId,
        effect,
        source.runtimeMode,
        source.sourceType
      );
      if (!resolution.ok) {
        return { ok: true };
      }

      resolution.entry.handler.applyAfterPlayerAttackDamage?.(
        state,
        attackingPlayer,
        resolution.effect,
        source,
        totalDamageDealt
      );
      return { ok: true };
    },
  });
}

const attackDefenseServices: AttackDefenseServices = {
  chooseEffectChoice,
  executeDefenseEffects(state, player, effects, source) {
    return executeEffects(state, player, effects, "onDefense", source);
  },
  resolveRedirectedAttack: resolveAttackTarget,
  getCardEffectRuntimeMode,
};

function resolveDefenseWindow(
  state: GameState,
  defendingPlayer: PlayerState,
  attack: DefenseAttackContext
): DefenseWindowResolutionResult {
  return resolveDefenseWindowWithServices(
    state,
    defendingPlayer,
    attack,
    attackDefenseServices
  );
}

function healPlayer(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  const effectiveMaxLife = calculateEffectivePlayerMaxLife(
    state,
    targetPlayer.playerId
  );
  const previousLife = targetPlayer.life.current;
  const unclampedLife = previousLife + amount;
  targetPlayer.life.current = Math.min(unclampedLife, effectiveMaxLife);
  const healedAmount = Math.max(0, targetPlayer.life.current - previousLife);

  recordGameEvent(state, {
    type: "effectLifeHealed",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: healedAmount,
    targetLifeBefore: previousLife,
    targetLifeAfter: targetPlayer.life.current,
    sourceType: source.sourceType,
  });

  if (unclampedLife > effectiveMaxLife) {
    recordGameEvent(state, {
      type: "playerLifeClamped",
      playerId: targetPlayer.playerId,
      amount: effectiveMaxLife,
    });
  }
}

function setPlayerLife(
  state: GameState,
  player: PlayerState,
  lifeTotal: number
): { lifeAfter: number; lifeBefore: number } {
  const lifeBefore = player.life.current;
  const effectiveLifeTotal = hasDinglerStatus(player)
    ? Math.min(lifeTotal, 15)
    : lifeTotal;
  player.life.current = effectiveLifeTotal;

  if (effectiveLifeTotal < lifeTotal) {
    recordGameEvent(state, {
      type: "playerLifeClamped",
      playerId: player.playerId,
      amount: effectiveLifeTotal,
    });
  }

  return {
    lifeBefore,
    lifeAfter: effectiveLifeTotal,
  };
}

function moveCardToPlayerZone(
  state: GameState,
  card: CardInstance,
  player: PlayerState,
  destination: CardInstance[],
  destinationZone: string,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): boolean {
  const sourceZone = getCardZoneName(state, card) ?? "unknown";
  const ownerBefore = card.ownerId;
  if (!removeCardFromKnownZones(state, card)) {
    return false;
  }

  moveMarketChipsToPlayer(state, player, card);
  card.ownerId = player.playerId;
  destination.push(card);
  recordCardMoved(state, player, card, {
    sourceZone,
    destinationZone,
    ownerBefore,
    ownerAfter: card.ownerId,
    effectId,
    sourceType: source.sourceType,
  });
  return true;
}

function moveMarketChipsToPlayer(
  state: GameState,
  player: PlayerState,
  card: CardInstance
): void {
  if (card.marketChips <= 0) {
    return;
  }

  const amount = card.marketChips;
  const chipsBefore = player.chips;
  player.chips += amount;
  card.marketChips = 0;
  recordMarketChipsGained(state, player, card, chipsBefore, player.chips);
}

function moveCardToZonePreservingOwner(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  destination: CardInstance[],
  destinationZone: string,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): boolean {
  const sourceZone = getCardZoneName(state, card) ?? "unknown";
  const ownerBefore = card.ownerId;
  if (!removeCardFromKnownZones(state, card)) {
    return false;
  }

  destination.push(card);
  recordCardMoved(state, player, card, {
    sourceZone,
    destinationZone,
    ownerBefore,
    ownerAfter: card.ownerId,
    effectId,
    sourceType: source.sourceType,
  });
  return true;
}

function getDestroyDestination(
  state: GameState,
  card: CardInstance
):
  | { ok: true; zone: CardInstance[]; zoneName: string }
  | { ok: false; error: string } {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing target card definition ${card.definitionId}`,
    };
  }

  if (definition.engine.cardKind === "wildMagic") {
    return {
      ok: true,
      zone: state.common.wildMagicStack,
      zoneName: "wildMagicStack",
    };
  }

  if (definition.engine.cardKind === "limpWand") {
    return {
      ok: true,
      zone: state.common.limpWandStack,
      zoneName: "limpWandStack",
    };
  }

  if (definition.engine.cardKind === "megaMayhem") {
    return {
      ok: true,
      zone: state.common.destroyedMegaMayhem,
      zoneName: "destroyedMegaMayhem",
    };
  }

  if (definition.engine.cardKind === "mayhem") {
    return {
      ok: true,
      zone: state.common.destroyedMayhem,
      zoneName: "destroyedMayhem",
    };
  }

  return {
    ok: true,
    zone: state.common.destroyedPile,
    zoneName: "destroyedPile",
  };
}

function getCardZoneName(
  state: GameState,
  card: CardInstance
): string | undefined {
  for (const player of state.players) {
    if (player.unboughtFamiliar?.instanceId === card.instanceId) {
      return `${player.playerId}.unboughtFamiliar`;
    }

    const playerZones: Array<[string, CardInstance[]]> = [
      [`${player.playerId}.deck`, player.deck],
      [`${player.playerId}.hand`, player.hand],
      [`${player.playerId}.discard`, player.discard],
      [`${player.playerId}.playedThisTurn`, player.playedThisTurn],
      [`${player.playerId}.permanents`, player.permanents],
    ];
    for (const [zoneName, zone] of playerZones) {
      if (zone.some((candidate) => candidate.instanceId === card.instanceId)) {
        return zoneName;
      }
    }
  }

  const commonZones: Array<[string, CardInstance[]]> = [
    ["mainMarket", state.common.market],
    ["legendMarket", state.common.legendMarket],
    ["mainDeck", state.common.mainDeck],
    ["legendDeck", state.common.legendDeck],
    ["wildMagicStack", state.common.wildMagicStack],
    ["limpWandStack", state.common.limpWandStack],
    ["destroyedPile", state.common.destroyedPile],
    ["destroyedMayhem", state.common.destroyedMayhem],
    ["destroyedMegaMayhem", state.common.destroyedMegaMayhem],
  ];
  return commonZones.find(([, zone]) =>
    zone.some((candidate) => candidate.instanceId === card.instanceId)
  )?.[0];
}

function removeCardFromKnownZones(
  state: GameState,
  card: CardInstance
): boolean {
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
    ...state.players.flatMap((player) => [
      player.deck,
      player.hand,
      player.discard,
      player.playedThisTurn,
      player.permanents,
    ]),
  ];

  for (const zone of zones) {
    const index = zone.findIndex(
      (candidate) => candidate.instanceId === card.instanceId
    );
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

function discardTopDeckCards(
  state: GameState,
  player: PlayerState,
  count: number
): CardInstance[] {
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

function createDinglerStatus(
  playerId: PlayerState["playerId"]
): PlayerState["statuses"][number] {
  return {
    instanceId: `dingler-${playerId}`,
    statusId: "dingler",
    ownerId: playerId,
    effects: [
      {
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: -10,
        target: {
          targetType: "player",
        },
      },
      {
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amount: -5,
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
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  if (!hasDinglerStatus(player)) {
    player.statuses.push(createDinglerStatus(player.playerId));
  }

  player.life.current = Math.min(player.life.current, 15);
  recordGameEvent(state, {
    type: "dinglerStatusGained",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
  reconcileActivePlayerControlledPower(state);
}

function removeDinglerStatus(
  state: GameState,
  player: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  const dinglerIndex = player.statuses.findIndex(
    (status) => status.statusId === "dingler"
  );
  if (dinglerIndex < 0) {
    return;
  }

  player.statuses.splice(dinglerIndex, 1);
  recordGameEvent(state, {
    type: "dinglerStatusRemoved",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
  reconcileActivePlayerControlledPower(state);
}

function drawTopDeckCard(
  player: PlayerState,
  state: GameState
): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck.shift();
}

function peekTopDeckCard(
  player: PlayerState,
  state: GameState
): CardInstance | undefined {
  shuffleDiscardIntoDeckIfNeeded(player, state);
  return player.deck[0];
}

function playResolvedCard(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  ownership: {
    nonOngoingDestination?: {
      zone: "ownerDiscardAfterResolution";
      ownerId: PlayerState["playerId"];
    };
    ongoingOwnerId?: PlayerState["playerId"] | "common";
  } = {}
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
    player.playedThisTurn.push(card);
    grantTemporaryControl(state, card.instanceId, player.playerId);
  }

  const effectResult = executeOnPlayEffects(state, player, definition, {
    sourceType: "card",
    runtimeMode: getCardEffectRuntimeMode(card.definitionId),
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  });
  if (!effectResult.ok) {
    return effectResult;
  }
  if (effectResult.gameEnd !== undefined) {
    const movementResult = moveResolvedNonOngoingCardToDestination(
      state,
      player,
      card,
      definition.engine.isOngoing,
      ownership.nonOngoingDestination
    );
    return movementResult.ok ? effectResult : movementResult;
  }

  const wizardPropertyResult = executeWizardPropertyOnPlayCardEffects(
    state,
    player,
    definition
  );
  if (!wizardPropertyResult.ok) {
    return wizardPropertyResult;
  }

  if (wizardPropertyResult.gameEnd === undefined) {
    const controlledCardResult = executeControlledCardOnPlayCardEffects(
      state,
      player,
      card
    );
    if (!controlledCardResult.ok) {
      return controlledCardResult;
    }
    if (controlledCardResult.gameEnd !== undefined) {
      const movementResult = moveResolvedNonOngoingCardToDestination(
        state,
        player,
        card,
        definition.engine.isOngoing,
        ownership.nonOngoingDestination
      );
      return movementResult.ok ? controlledCardResult : movementResult;
    }
  }

  const movementResult = moveResolvedNonOngoingCardToDestination(
    state,
    player,
    card,
    definition.engine.isOngoing,
    ownership.nonOngoingDestination
  );
  return movementResult.ok ? wizardPropertyResult : movementResult;
}

function moveResolvedNonOngoingCardToDestination(
  state: GameState,
  controller: PlayerState,
  card: CardInstance,
  isOngoing: boolean,
  destination:
    | {
        zone: "ownerDiscardAfterResolution";
        ownerId: PlayerState["playerId"];
      }
    | undefined
): EffectExecutionResult {
  if (isOngoing || destination === undefined) {
    return { ok: true };
  }
  if (card.ownerId !== destination.ownerId) {
    return {
      ok: false,
      error: `Cannot move ${card.instanceId} to a discard that does not belong to its owner`,
    };
  }
  const cardIndex = controller.playedThisTurn.findIndex(
    (candidate) => candidate.instanceId === card.instanceId
  );
  if (cardIndex < 0) {
    return { ok: true };
  }
  const owner = state.players.find(
    (candidate) => candidate.playerId === destination.ownerId
  );
  if (owner === undefined) {
    return {
      ok: false,
      error: `Missing card owner ${destination.ownerId}`,
    };
  }

  controller.playedThisTurn.splice(cardIndex, 1);
  owner.discard.push(card);
  recordCardMoved(state, controller, card, {
    sourceZone: `${controller.playerId}.playedThisTurn`,
    destinationZone: `${owner.playerId}.discard`,
    ownerBefore: card.ownerId,
    ownerAfter: card.ownerId,
  });
  return { ok: true };
}

function shuffleDiscardIntoDeckIfNeeded(
  player: PlayerState,
  state: GameState
): void {
  if (player.deck.length > 0 || player.discard.length === 0) {
    return;
  }

  player.deck.push(...player.discard.splice(0));
  shuffleInPlace(player.deck, state);
  recordGameEvent(state, {
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

function getCardEffectRuntimeMode(definitionId: string): "combat" | "fixture" {
  return definitionId.startsWith("fixture-") ? "fixture" : "combat";
}
