import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  resolveDefenseWindow as resolveDefenseWindowWithServices,
  type AttackDefenseServices,
} from "./attack-defense.js";
import {
  createAttackInstance,
  resolvePlayerControlledAttack as resolvePlayerControlledAttackLifecycle,
  type AttackDamageAttribution,
  type AttackTargetResolutionResult,
  type DamageApplicationResult,
  type DefenseAttackContext,
  type DefenseWindowResolutionResult,
  type PlayerControlledAttackAdapters,
  type PlayerControlledAttackExecutionResult,
  type PlayerControlledAttackIntent,
  type RedirectedAttackIntent,
} from "./attack-resolution.js";
import {
  getControlledCards,
  findCardLocation,
  insertDetachedCard,
  listMainDeckCards,
  listPlayerDeckCards,
  listPlayerDiscardCards,
  removeCardFromLocation,
  removeDeadWizardToken,
  removeTemporaryCardControl,
  reorderPhysicalCard,
} from "./control-ledger.js";
import {
  getControlledDeadWizardTokenLikeCards,
  getDeadWizardTokenChoiceId,
  getDeadWizardTokenLikeCardChoiceId,
} from "./dead-wizard-token-like.js";
import {
  beginDeadWizardTokenResolutionBoundary,
  dequeueDeadWizardTokenFace,
  endDeadWizardTokenResolutionBoundary,
  enqueueDeadWizardTokenFace,
} from "./dead-wizard-token-resolution.js";
import {
  executeRevealAndPlayFoeDeckCard,
  resolveMainMarketGainDestination,
} from "./effect-runtime-cards-ownership-choice.js";
import { gainLimpWandsFromCommonStack } from "./effect-runtime-special-card-stack.js";
import { drawCardsForPlayer } from "./effect-runtime-resources-draw.js";
import {
  resolveCardPlay,
  type CardPlayResolutionServices,
} from "./card-play-resolution.js";
import { calculateEffectivePlayerMaxLife } from "./effective-value-runtime.js";
import {
  clearFaceUpState,
  drawDeckCard,
  previewDeckCard,
  refillDeckFromDiscard,
} from "./deck-lifecycle.js";
import {
  recordCardMoved,
  recordDeckReshuffle,
  recordGameEvent,
  recordMarketChipsGained,
} from "./event-recorder.js";
import {
  type DamageCause,
  type DeadWizardTokenDeathPolicy,
  type EffectChoice,
  type EffectExecutionResult,
  type EffectRuntimeServices,
  type EffectSourceContext,
  type MayhemAttackPlanTarget,
  type MayhemAttackImpact,
  type EffectChoiceResolution,
  type EffectRuntimeHandlerOperationResult,
  type EffectRuntimeOperationResult,
  collectAttackReplacementProfile,
  evaluateRuntimeEffectAtTiming,
  evaluateRuntimeEffectBasicTrophyChipPayoutSuppression,
  executeRuntimeEffect,
  executeRuntimeEffectAtTiming as executeRuntimeEffectAtTimingInCatalog,
  resolveResurrectionLifeTotal,
  type TargetChoice,
  type TargetChoiceResult,
} from "./effect-runtime-registry.js";
import {
  executeAttackOutcomeBranch,
  executeAttackDiscardCards,
  validateAttackCostPrecondition,
} from "./effect-runtime-combat-attack.js";
import { getDistinctAdjacentFoes } from "./player-targets.js";
import {
  isRuntimeEffectSelectorTarget,
  type RuntimeEffect,
  type RuntimeEffectId,
  type RuntimeEffectPayload,
  type WildMagicOption,
} from "./runtime-effect.js";
import {
  markRuntimeEffectTreeVerified,
  requireVerifiedRuntimeEffect,
  type VerifiedRuntimeEffect,
} from "./runtime-effect-verification.js";
import {
  cardMatchesTypeForPlayer,
  runtimeEffectConditionMatches,
} from "./card-type-runtime.js";
import type {
  EffectChoiceRequest,
  ChoiceSelection,
  ChoiceView,
} from "./choice-policy.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  TokenInstance,
} from "./setup.js";
import { createChoicePlayerView } from "./strategy-decision-view.js";
import {
  dispatchControlledCardOperation,
  runControlledPowerMutation,
} from "./trigger-dispatch.js";

export function validateOnPlayEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext,
  excludedCardInstanceId?: CardInstance["instanceId"]
): EffectExecutionResult {
  return validateEffectsAtTiming(
    state,
    player,
    definition.engine.effects,
    "onPlay",
    source,
    undefined,
    excludedCardInstanceId
  );
}

export function validateActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  return validateEffectsAtTiming(
    state,
    player,
    definition.engine.effects,
    "activation",
    source
  );
}

export function validateWizardPropertyOnPlayCardEffects(
  state: GameState,
  player: PlayerState,
  playedDefinition: CardDefinition,
  excludedCardInstanceId?: CardInstance["instanceId"]
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

    const result = validateEffectsAtTiming(
      state,
      player,
      definition.engine.effects,
      "onPlayCard",
      {
        sourceType: "wizardProperty",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
      (effect) =>
        cardTriggerMatches(effect, playedDefinition)
          ? { status: "resolved", result: undefined }
          : { status: "notApplicable" },
      excludedCardInstanceId
    );
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function validateGainedCardEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  card: CardInstance
): EffectExecutionResult {
  const ownGainValidation = validateEffectsAtTiming(
    state,
    player,
    definition.engine.effects,
    "onGain",
    {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: card.instanceId,
      definitionId: definition.cardId,
    }
  );
  if (!ownGainValidation.ok) {
    return ownGainValidation;
  }

  for (const token of player.wizardProperties) {
    const tokenDefinition = state.tokenDefinitions.get(token.definitionId);
    if (
      tokenDefinition?.kind !== "wizardProperty" ||
      tokenDefinition.engine === undefined ||
      !tokenDefinition.engine.playableInV0
    ) {
      continue;
    }

    const result = validateEffectsAtTiming(
      state,
      player,
      tokenDefinition.engine.effects,
      "onGainCard",
      {
        sourceType: "wizardProperty",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
      (effect) =>
        cardTriggerMatches(effect, definition, state, player, card)
          ? { status: "resolved", result: undefined }
          : { status: "notApplicable" }
    );
    if (!result.ok) {
      return result;
    }
  }

  for (const controlledCard of getControlledCards(state, player)) {
    const controlledDefinition = state.cardDefinitions.get(
      controlledCard.definitionId
    );
    if (
      controlledDefinition === undefined ||
      !controlledDefinition.engine.playableInV0
    ) {
      continue;
    }

    const result = validateEffectsAtTiming(
      state,
      player,
      controlledDefinition.engine.effects,
      "onGainCard",
      {
        sourceType: "card",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: controlledCard.instanceId,
        definitionId: controlledDefinition.cardId,
      },
      (effect) =>
        cardTriggerMatches(effect, definition, state, player, card)
          ? { status: "resolved", result: undefined }
          : { status: "notApplicable" }
    );
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function validateRevealTopCardGainEffects(
  state: GameState,
  player: PlayerState,
  playedCard: CardInstance,
  playedDefinition: CardDefinition
): EffectExecutionResult {
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: playedCard.instanceId,
    definitionId: playedDefinition.cardId,
  };

  return validateRevealTopCardGainEffectsAtTiming(
    state,
    player,
    playedDefinition.engine.effects,
    "onPlay",
    source,
    playedCard.instanceId
  );
}

export function validateDefenseEffects(
  state: GameState,
  player: PlayerState,
  effects: readonly RuntimeEffect[],
  source: EffectSourceContext,
  excludedCardInstanceId: CardInstance["instanceId"]
): EffectExecutionResult {
  const effectValidation = validateEffectsAtTiming(
    state,
    player,
    effects,
    "onDefense",
    source,
    undefined,
    excludedCardInstanceId
  );
  if (!effectValidation.ok) {
    return effectValidation;
  }

  return validateRevealTopCardGainEffectsAtTiming(
    state,
    player,
    effects,
    "onDefense",
    source,
    excludedCardInstanceId
  );
}

function validateRevealTopCardGainEffectsAtTiming(
  state: GameState,
  player: PlayerState,
  effects: readonly RuntimeEffect[],
  timing: RuntimeEffect["timing"],
  source: EffectSourceContext,
  excludedCardInstanceId: CardInstance["instanceId"]
): EffectExecutionResult {
  let activeDeckPreview = {
    deck: [...listPlayerDeckCards(player)],
    discard: [...listPlayerDiscardCards(player)],
    rng: state.rng,
  };
  let mainDeckPreview = [...listMainDeckCards(state)];

  for (const effect of effects) {
    const revealResult = evaluateRuntimeEffectAtTiming(
      requireVerifiedRuntimeEffect(effect),
      source,
      timing,
      (decodedEffect) => {
        if (
          decodedEffect.effectId !== "reveal_top_card" ||
          decodedEffect.optionalTakeToHand !== true ||
          !effectConditionMatches(
            state,
            player,
            decodedEffect,
            source.cardInstanceId
          )
        ) {
          return { status: "notApplicable" };
        }
        return { status: "resolved", result: decodedEffect };
      }
    );
    if (revealResult.status === "error") {
      return { ok: false, error: revealResult.error };
    }
    if (revealResult.status !== "resolved") {
      continue;
    }

    let card: CardInstance | undefined;
    if (revealResult.result.source === "mainDeck") {
      card = mainDeckPreview[0];
    } else {
      const preview = previewDeckCard(
        activeDeckPreview.deck,
        activeDeckPreview.discard,
        activeDeckPreview.rng
      );
      activeDeckPreview = preview;
      card = preview.card;
    }
    if (card === undefined) {
      continue;
    }

    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      return {
        ok: false,
        error: `Missing revealed card definition ${card.definitionId}`,
      };
    }
    const canTake =
      revealResult.result.excludeCardKind === undefined ||
      definition.engine.cardKind !== revealResult.result.excludeCardKind;
    if (!canTake) {
      continue;
    }

    const validationPlayer: PlayerState = {
      ...player,
      hand: [
        ...player.hand.filter(
          (candidate) => candidate.instanceId !== excludedCardInstanceId
        ),
        card,
      ],
      permanents: player.permanents.filter(
        (candidate) => candidate.instanceId !== excludedCardInstanceId
      ),
    };
    const gainValidation = validateGainedCardEffects(
      state,
      validationPlayer,
      definition,
      card
    );
    if (!gainValidation.ok) {
      return gainValidation;
    }

    if (revealResult.result.source === "mainDeck") {
      mainDeckPreview.shift();
    } else {
      activeDeckPreview.deck.shift();
    }
  }

  return { ok: true };
}

function validateEffectsAtTiming(
  state: GameState,
  player: PlayerState,
  effects: readonly RuntimeEffect[],
  timing: RuntimeEffect["timing"],
  source: EffectSourceContext,
  isApplicable?: (
    effect: RuntimeEffectPayload
  ) => EffectRuntimeHandlerOperationResult<undefined>,
  excludedCardInstanceId?: CardInstance["instanceId"]
): EffectExecutionResult {
  for (const effect of effects) {
    const verifiedEffect = requireVerifiedRuntimeEffect(effect);
    let expectedFailure: string | undefined;
    const result = evaluateRuntimeEffectAtTiming(
      verifiedEffect,
      source,
      timing,
      (decodedEffect) => {
        const applicability = effectConditionMatches(
          state,
          player,
          decodedEffect,
          source.sourceType === "card" ? source.cardInstanceId : undefined
        )
          ? (isApplicable?.(decodedEffect) ??
            ({ status: "resolved", result: undefined } as const))
          : ({ status: "notApplicable" } as const);
        if (applicability.status === "resolved") {
          expectedFailure = getExpectedEffectFailure(
            state,
            player,
            decodedEffect,
            excludedCardInstanceId,
            source
          );
        }
        return applicability;
      }
    );
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    if (expectedFailure !== undefined) {
      return { ok: false, error: expectedFailure };
    }
  }

  return { ok: true };
}

function getExpectedEffectFailure(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  excludedCardInstanceId?: CardInstance["instanceId"],
  source?: EffectSourceContext
): string | undefined {
  if (
    effect.effectId === "attack_damage" &&
    (!("optional" in effect) || effect.optional !== true) &&
    "costs" in effect &&
    effect.costs !== undefined
  ) {
    const costError = validateAttackCostPrecondition(player, effect.costs);
    if (costError !== undefined) {
      return costError;
    }
  }

  if (!("emptyChoice" in effect) || effect.emptyChoice !== "fail") {
    return undefined;
  }

  const choices = buildLegalTargetChoices(state, player, effect, source);
  if (!choices.ok) {
    return choices.error;
  }
  const legalChoices = choices.choices.filter(
    (choice) =>
      choice.choiceType !== "card" ||
      choice.card.instanceId !== excludedCardInstanceId
  );
  if (legalChoices.length === 0) {
    return `No legal choices for effect ${asString(effect.effectId)}`;
  }
  return undefined;
}

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

export function hasExecutableCardActivation(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): boolean {
  for (const effect of definition.engine.effects) {
    const result = evaluateRuntimeEffectAtTiming(
      requireVerifiedRuntimeEffect(effect),
      source,
      "activation",
      (decodedEffect) =>
        effectConditionMatches(
          state,
          player,
          decodedEffect,
          source.cardInstanceId
        )
          ? { status: "resolved", result: true }
          : { status: "notApplicable" }
    );
    if (result.status === "resolved") return true;
    if (result.status === "error") return false;
  }
  return false;
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
  const engine = definition.engine;

  return executeEffects(state, player, engine.effects, "activation", source);
}

export type WizardPropertyActivationAvailability =
  | { readonly ok: true; readonly executable: boolean }
  | { readonly ok: false; readonly error: string };

export function getWizardPropertyActivationAvailability(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
  source?: EffectSourceContext
): WizardPropertyActivationAvailability {
  if (
    definition.kind !== "wizardProperty" ||
    definition.engine === undefined ||
    !definition.engine.playableInV0
  ) {
    return { ok: true, executable: false };
  }

  const operationSource: EffectSourceContext = source ?? {
    sourceType: "wizardProperty",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: definition.tokenId,
    definitionId: definition.tokenId,
    tokenDefinitionId: definition.tokenId,
  };
  let executable = false;
  for (const effect of definition.engine.effects) {
    const verifiedEffect = requireVerifiedRuntimeEffect(effect);
    const result = evaluateRuntimeEffectAtTiming(
      verifiedEffect,
      operationSource,
      "activation",
      (decodedEffect) =>
        effectConditionMatches(state, player, decodedEffect)
          ? { status: "resolved", result: true }
          : { status: "notApplicable" }
    );
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    if (result.status === "resolved") {
      executable = true;
    }
  }

  return { ok: true, executable };
}

export function hasExecutableWizardPropertyActivation(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition
): boolean {
  const availability = getWizardPropertyActivationAvailability(
    state,
    player,
    definition
  );
  return availability.ok && availability.executable;
}

export type DeadWizardTokenActivationAvailability =
  | { readonly ok: true; readonly executable: boolean }
  | { readonly ok: false; readonly error: string };

export function getDeadWizardTokenActivationAvailability(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
  source?: EffectSourceContext
): DeadWizardTokenActivationAvailability {
  if (definition.kind !== "deadWizardToken") {
    return { ok: true, executable: false };
  }

  const operationSource: EffectSourceContext = source ?? {
    sourceType: "deadWizardToken",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: definition.tokenId,
    definitionId: definition.tokenId,
    tokenDefinitionId: definition.tokenId,
  };
  let executable = false;
  for (const effect of definition.effects) {
    const verifiedEffect = requireVerifiedRuntimeEffect(effect);
    const result = evaluateRuntimeEffectAtTiming(
      verifiedEffect,
      operationSource,
      "activation",
      (decodedEffect) => {
        if (!effectConditionMatches(state, player, decodedEffect)) {
          return { status: "notApplicable" };
        }
        if (
          decodedEffect.effectId ===
            "dead_wizard_token_self_destroy_for_chips" &&
          player.chips < decodedEffect.chipCost
        ) {
          return { status: "notApplicable" };
        }
        return { status: "resolved", result: true };
      }
    );
    if (result.status === "error") {
      return { ok: false, error: result.error };
    }
    if (result.status === "resolved") {
      executable = true;
    }
  }

  return { ok: true, executable };
}

export function executeDeadWizardTokenActivationEffects(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  if (definition.kind !== "deadWizardToken") {
    return { ok: true };
  }
  return executeEffects(
    state,
    player,
    definition.effects,
    "activation",
    source
  );
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
      definition.engine.effects,
      "onPlayCard",
      {
        sourceType: "wizardProperty",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
      (effect) => cardTriggerMatches(effect, playedDefinition)
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

  return dispatchControlledCardOperation(state, player, {
    kind: "onPlayCard",
    playedCard,
    playedDefinition,
  });
}

export function executeControlledCardAfterControllerPlaysCardEffects(
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

  return dispatchControlledCardOperation(state, player, {
    kind: "afterControllerPlaysCard",
    executeEffect(effect, source) {
      return executeRuntimeEffectAtTiming(
        state,
        player,
        effect,
        "afterControllerPlaysCard",
        source,
        effectRuntimeServices,
        (decodedEffect) =>
          decodedEffect.effectId ===
            "ongoing_add_power_when_playing_limp_wand" &&
          playedDefinition.engine.cardKind === decodedEffect.cardKind
      );
    },
  });
}

export function executeControlledCardStartOfControllerTurnEffects(
  state: GameState,
  player: PlayerState
): EffectExecutionResult {
  return dispatchControlledCardOperation(state, player, {
    kind: "startOfControllerTurn",
    executeEffect(effect, source) {
      return executeRuntimeEffectAtTiming(
        state,
        player,
        effect,
        "startOfControllerTurn",
        source,
        effectRuntimeServices
      );
    },
  });
}

export function validateControlledCardStartOfControllerTurnEffects(
  state: GameState,
  player: PlayerState
): EffectExecutionResult {
  return dispatchControlledCardOperation(state, player, {
    kind: "startOfControllerTurn",
    executeEffect(effect, source) {
      let expectedFailure: string | undefined;
      const result = evaluateRuntimeEffectAtTiming(
        effect,
        source,
        "startOfControllerTurn",
        (decodedEffect) => {
          expectedFailure = getExpectedEffectFailure(
            state,
            player,
            decodedEffect,
            undefined,
            source
          );
          return { status: "resolved", result: undefined };
        }
      );
      if (result.status === "error") {
        return result;
      }
      if (expectedFailure !== undefined) {
        return {
          status: "resolved",
          result: { ok: false, error: expectedFailure },
        };
      }
      return { status: "resolved", result: { ok: true } };
    },
  });
}

export function resolveWithinDeadWizardTokenResolutionBoundary(
  state: GameState,
  resolve: () => EffectExecutionResult
): EffectExecutionResult {
  beginDeadWizardTokenResolutionBoundary(state);
  let result: EffectExecutionResult;
  let isOutermostBoundary: boolean;
  try {
    result = resolve();
  } finally {
    isOutermostBoundary = endDeadWizardTokenResolutionBoundary(state);
  }

  if (!result.ok || result.gameEnd !== undefined) {
    return result;
  }
  if (!isOutermostBoundary) {
    return result;
  }
  return resolveQueuedDeadWizardTokenFaces(state);
}

function resolveQueuedDeadWizardTokenFaces(
  state: GameState
): EffectExecutionResult {
  let face = dequeueDeadWizardTokenFace(state);
  while (face !== undefined) {
    const currentFace = face;
    const player = state.players.find(
      (candidate) => candidate.playerId === currentFace.playerId
    );
    if (player === undefined) {
      return {
        ok: false,
        error: `Missing dead wizard token player ${currentFace.playerId}`,
      };
    }
    const token = player.deadWizardTokens.find(
      (candidate) => candidate.instanceId === currentFace.tokenInstanceId
    );
    if (
      token === undefined ||
      token.definitionId !== currentFace.tokenDefinitionId
    ) {
      return {
        ok: false,
        error: `Missing dead wizard token ${currentFace.tokenInstanceId}`,
      };
    }
    const definition = state.tokenDefinitions.get(
      currentFace.tokenDefinitionId
    );
    if (definition?.kind !== "deadWizardToken") {
      return {
        ok: false,
        error: `Missing dead wizard token definition ${currentFace.tokenDefinitionId}`,
      };
    }

    const source: EffectSourceContext = {
      sourceType: "deadWizardToken",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: token.instanceId,
      definitionId: definition.tokenId,
      tokenInstanceId: token.instanceId,
      tokenDefinitionId: definition.tokenId,
      ...(currentFace.deathKillerPlayerId === undefined
        ? {}
        : {
            deadWizardTokenDeathKillerPlayerId: currentFace.deathKillerPlayerId,
          }),
      ...(currentFace.deadWizardTokenWasDinglerAtGain === undefined
        ? {}
        : {
            deadWizardTokenWasDinglerAtGain:
              currentFace.deadWizardTokenWasDinglerAtGain,
          }),
      ...(currentFace.deadWizardTokenProjectionEffectIds === undefined
        ? {}
        : {
            deadWizardTokenProjectionEffectIds:
              currentFace.deadWizardTokenProjectionEffectIds,
          }),
    };
    beginDeadWizardTokenResolutionBoundary(state);
    let result: EffectExecutionResult;
    try {
      result = executeEffects(
        state,
        player,
        definition.effects,
        "onDeadWizardTokenFace",
        source,
        (decodedEffect) =>
          !currentFace.deadWizardTokenProjectionEffectIds?.includes(
            decodedEffect.effectId
          )
      );
    } finally {
      endDeadWizardTokenResolutionBoundary(state);
    }
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
    recordGameEvent(state, {
      type: "deadWizardTokenFaceResolved",
      playerId: player.playerId,
      tokenInstanceId: token.instanceId,
      tokenDefinitionId: token.definitionId,
    });
    face = dequeueDeadWizardTokenFace(state);
  }
  return { ok: true };
}

export function moveGainedCardToPlayerDestination(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  fixedDestination?: "discard" | "hand",
  movementSource?: {
    effectId: RuntimeEffectId;
    sourceType: EffectSourceContext["sourceType"];
  }
):
  | { ok: true; destination: "discard" | "deckTop" | "hand" }
  | { ok: false; error: string } {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing gained card definition ${card.definitionId}`,
    };
  }

  const ownerBefore = card.ownerId;
  const sourceLocation = removeCardFromLocation(state, card.instanceId);
  if (sourceLocation === undefined) {
    return {
      ok: false,
      error: `Cannot move card ${card.instanceId}`,
    };
  }
  const sourceZone = sourceLocation.zoneName;

  moveMarketChipsToPlayer(state, player, card);
  card.ownerId = player.playerId;
  state.turn.gainedCards.push({
    playerId: player.playerId,
    definitionId: card.definitionId,
    cardInstanceId: card.instanceId,
  });
  const onGainCardResult = runOnGainCardEffects(
    state,
    player,
    card,
    definition,
    fixedDestination
  );
  if (!onGainCardResult.ok) {
    return onGainCardResult;
  }
  const destinationResult =
    fixedDestination === undefined
      ? resolveMainMarketGainDestination(
          state,
          player,
          sourceZone,
          onGainCardResult.destination,
          effectRuntimeServices
        )
      : { ok: true as const, destination: fixedDestination };
  if (!destinationResult.ok) {
    return destinationResult;
  }
  const destination = destinationResult.destination;
  clearFaceUpState(card);

  if (destination === "deckTop") {
    player.deck.unshift(card);
  } else if (destination === "hand") {
    player.hand.push(card);
  } else {
    player.discard.push(card);
  }
  recordCardMoved(state, player, card, {
    sourceZone,
    destinationZone:
      destination === "deckTop"
        ? `${player.playerId}.deckTop`
        : destination === "hand"
          ? `${player.playerId}.hand`
          : `${player.playerId}.discard`,
    ownerBefore,
    ownerAfter: card.ownerId,
    ...(movementSource === undefined
      ? {}
      : {
          effectId: movementSource.effectId,
          sourceType: movementSource.sourceType,
        }),
  });

  const ownGainResult = executeGainedCardOnGainEffects(
    state,
    player,
    card,
    definition
  );
  if (!ownGainResult.ok) {
    return ownGainResult;
  }

  return { ok: true, destination };
}

function executeGainedCardOnGainEffects(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  definition: CardDefinition
): EffectExecutionResult {
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: card.instanceId,
    definitionId: definition.cardId,
  };

  for (const effect of definition.engine.effects) {
    const execution = executeRuntimeEffectAtTiming(
      state,
      player,
      requireVerifiedRuntimeEffect(effect),
      "onGain",
      source,
      effectRuntimeServices
    );
    if (execution.status === "error") {
      return { ok: false, error: execution.error };
    }
    if (execution.status === "resolved") {
      const result = execution.result;
      if (!result.ok || result.gameEnd !== undefined) {
        return result;
      }
    }
  }

  return { ok: true };
}

function runOnGainCardEffects(
  state: GameState,
  player: PlayerState,
  gainedCard: CardInstance,
  gainedDefinition: CardDefinition,
  fixedDestination?: "discard" | "hand"
):
  | { ok: true; destination: "discard" | "deckTop" }
  | { ok: false; error: string } {
  let destination: "discard" | "deckTop" = "discard";
  const effectSources: {
    source: EffectSourceContext;
    effects: readonly RuntimeEffect[];
  }[] = [];

  for (const token of player.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }
    effectSources.push({
      source: {
        sourceType: "wizardProperty",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
      effects: definition.engine.effects,
    });
  }

  for (const controlledCard of getControlledCards(state, player)) {
    const definition = state.cardDefinitions.get(controlledCard.definitionId);
    if (definition === undefined || !definition.engine.playableInV0) {
      continue;
    }
    effectSources.push({
      source: {
        sourceType: "card",
        runtimeMode: state.runtimeMode,
        playerId: player.playerId,
        cardInstanceId: controlledCard.instanceId,
        definitionId: definition.cardId,
      },
      effects: definition.engine.effects,
    });
  }

  for (const { source, effects } of effectSources) {
    for (const effect of effects) {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      const applicability = evaluateRuntimeEffectAtTiming(
        verifiedEffect,
        source,
        "onGainCard",
        (decodedEffect) =>
          cardTriggerMatches(
            decodedEffect,
            gainedDefinition,
            state,
            player,
            gainedCard
          )
            ? { status: "resolved", result: decodedEffect }
            : { status: "notApplicable" }
      );
      if (applicability.status === "error") {
        return { ok: false, error: applicability.error };
      }
      if (applicability.status === "notApplicable") {
        continue;
      }

      if (applicability.result.effectId === "topdeck_gained_card") {
        if (fixedDestination !== undefined) {
          continue;
        }
        if (applicability.result.optional === true) {
          const choice = chooseEffectChoice(
            state,
            player,
            source,
            "topdeck_gained_card",
            [
              { choiceKind: "option", choiceId: "apply" },
              { choiceKind: "option", choiceId: "decline" },
            ]
          );
          if (choice?.choiceId === "apply") {
            destination = "deckTop";
          }
        } else {
          destination = "deckTop";
        }
        continue;
      }

      const execution = executeRuntimeEffectAtTiming(
        state,
        player,
        verifiedEffect,
        "onGainCard",
        source,
        effectRuntimeServices,
        (decodedEffect) =>
          cardTriggerMatches(
            decodedEffect,
            gainedDefinition,
            state,
            player,
            gainedCard
          )
      );
      if (execution.status === "error") {
        return { ok: false, error: execution.error };
      }
      if (execution.status === "notApplicable") {
        continue;
      }
      if (!execution.result.ok) {
        return execution.result;
      }
    }
  }

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

    const source: EffectSourceContext = {
      sourceType: "wizardProperty",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: token.instanceId,
      definitionId: token.definitionId,
      tokenInstanceId: token.instanceId,
      tokenDefinitionId: token.definitionId,
    };
    for (const effect of definition.engine.effects) {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      const result = evaluateRuntimeEffectAtTiming(
        verifiedEffect,
        source,
        "endTurn",
        (decodedEffect) =>
          decodedEffect.effectId === "temporary_hand_limit_by_gained_card_type"
            ? {
                status: "resolved",
                result:
                  drawCount +
                  decodedEffect.amount *
                    countGainedCardsMatchingEffect(
                      state,
                      player,
                      decodedEffect
                    ),
              }
            : { status: "notApplicable" }
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      if (result.status === "resolved") {
        drawCount = result.result;
      }
    }
  }

  const controlledDrawResult = dispatchControlledCardOperation(state, player, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: drawCount,
  });
  if (!controlledDrawResult.ok) {
    throw new Error(controlledDrawResult.error);
  }

  return controlledDrawResult.drawCount;
}

export function isBasicTrophyChipPayoutSuppressed(
  state: GameState,
  player: PlayerState
): boolean {
  for (const token of player.deadWizardTokens) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (definition?.kind !== "deadWizardToken") {
      continue;
    }

    const source: EffectSourceContext = {
      sourceType: "deadWizardToken",
      runtimeMode: state.runtimeMode,
      playerId: player.playerId,
      cardInstanceId: token.instanceId,
      definitionId: definition.tokenId,
      tokenInstanceId: token.instanceId,
      tokenDefinitionId: definition.tokenId,
    };
    for (const effect of definition.effects) {
      const result = evaluateRuntimeEffectBasicTrophyChipPayoutSuppression(
        requireVerifiedRuntimeEffect(effect),
        { state, controller: player, source }
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      if (result.status === "resolved" && result.result) {
        return true;
      }
    }
  }

  return false;
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

export function validateMayhemEffects(
  state: GameState,
  player: PlayerState,
  definition: CardDefinition,
  source: EffectSourceContext
): EffectExecutionResult {
  return validateEffectsAtTiming(
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
  source: EffectSourceContext,
  isApplicable?: (effect: RuntimeEffectPayload) => boolean
): EffectExecutionResult {
  for (const effect of effects) {
    const verifiedEffect = requireVerifiedRuntimeEffect(effect);
    const operationResult = executeRuntimeEffectAtTiming(
      state,
      player,
      verifiedEffect,
      timing,
      source,
      effectRuntimeServices,
      (decodedEffect) =>
        effectConditionMatches(
          state,
          player,
          decodedEffect,
          source.sourceType === "card" ? source.cardInstanceId : undefined
        ) &&
        (isApplicable?.(decodedEffect) ?? true)
    );
    if (operationResult.status === "error") {
      return { ok: false, error: operationResult.error };
    }
    if (operationResult.status === "notApplicable") {
      continue;
    }

    const result = operationResult.result;
    if (!result.ok || result.gameEnd !== undefined) {
      return result;
    }
  }

  return { ok: true };
}

function executeRuntimeEffectAtTiming(
  state: GameState,
  player: PlayerState,
  effect: VerifiedRuntimeEffect,
  timing: RuntimeEffect["timing"],
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  isApplicable?: (effect: RuntimeEffectPayload) => boolean
): EffectRuntimeOperationResult<EffectExecutionResult> {
  let operationResult:
    | EffectRuntimeOperationResult<EffectExecutionResult>
    | undefined;
  const boundaryResult = resolveWithinDeadWizardTokenResolutionBoundary(
    state,
    () => {
      operationResult = executeRuntimeEffectAtTimingInCatalog(
        state,
        player,
        effect,
        timing,
        source,
        services,
        isApplicable
      );
      if (operationResult.status === "error") {
        return { ok: false, error: operationResult.error };
      }
      if (operationResult.status === "notApplicable") {
        return { ok: true };
      }
      return operationResult.result;
    }
  );

  if (!boundaryResult.ok) {
    return { status: "error", error: boundaryResult.error };
  }
  if (operationResult === undefined) {
    return {
      status: "error",
      error: `Effect ${effect.effectId} did not produce an execution result`,
    };
  }
  if (operationResult.status === "notApplicable") {
    return operationResult;
  }
  if (operationResult.status === "error") {
    return operationResult;
  }
  return { status: "resolved", result: boundaryResult };
}

function cardTriggerMatches(
  effect: RuntimeEffectPayload,
  definition: CardDefinition,
  state?: GameState,
  player?: PlayerState,
  card?: CardInstance
): boolean {
  const cardTypes = "cardTypes" in effect ? effect.cardTypes : undefined;
  const matchesType =
    Array.isArray(cardTypes) &&
    cardTypes.some((cardType) =>
      state === undefined || player === undefined
        ? definition.engine.cardTypes.includes(cardType)
        : cardMatchesTypeForPlayer(
            state,
            player.playerId,
            definition,
            cardType,
            card
          )
    );
  const matchesOngoing =
    "isOngoing" in effect &&
    effect.isOngoing === true &&
    definition.engine.isOngoing;
  const cardTags = "cardTags" in effect ? effect.cardTags : undefined;
  const matchesTag =
    Array.isArray(cardTags) &&
    cardTags.some(
      (cardTag) => definition.engine.tags?.includes(cardTag) === true
    );
  return matchesType || matchesOngoing || matchesTag;
}

function countGainedCardsMatchingEffect(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload
): number {
  return state.turn.gainedCards.filter((record) => {
    if (record.playerId !== player.playerId) return false;
    const definition = state.cardDefinitions.get(record.definitionId);
    const card = findCardLocation(state, record.cardInstanceId)?.card;
    return (
      definition !== undefined &&
      cardTriggerMatches(effect, definition, state, player, card)
    );
  }).length;
}

export function executeEffect(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffect,
  source: EffectSourceContext
): EffectExecutionResult {
  return executeRuntimeEffect(
    state,
    player,
    requireVerifiedRuntimeEffect(effect),
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
  effect: RuntimeEffectPayload,
  excludedCardInstanceId?: string
): boolean {
  const condition = "condition" in effect ? effect.condition : undefined;
  return (
    condition === undefined ||
    runtimeEffectConditionMatches(
      state,
      player,
      condition,
      excludedCardInstanceId
    )
  );
}

function resolvePlayerControlledAttackWithRuntimeAdapters(
  intent: PlayerControlledAttackIntent
): PlayerControlledAttackExecutionResult {
  return resolvePlayerControlledAttackLifecycle(
    intent,
    playerControlledAttackAdapters
  );
}

const playerControlledAttackAdapters: PlayerControlledAttackAdapters = {
  resolveTargets: resolvePlayerControlledAttackTargets,
  resolveDefenseWindow(
    state,
    defendingPlayer,
    attack,
    resolveRedirectedAttack
  ) {
    return resolveDefenseWindow(
      state,
      defendingPlayer,
      attack,
      resolveRedirectedAttack
    );
  },
  dealAttackDamage(
    state,
    attackingPlayer,
    targetPlayer,
    amount,
    effectId,
    source
  ) {
    return dealDamage(
      state,
      attackingPlayer,
      targetPlayer,
      amount,
      effectId,
      source,
      { kind: "playerControlled", player: attackingPlayer }
    );
  },
  executeOnHitEffect(state, attackingPlayer, targetPlayer, effect, source) {
    if (effect.effectId === "attack_reveal_and_play_foe_deck_card") {
      return executeRevealAndPlayFoeDeckCard(
        state,
        attackingPlayer,
        targetPlayer,
        effect,
        source,
        effectRuntimeServices
      );
    }
    if (effect.effectId === "attack_gain_limp_wand") {
      return gainLimpWandsFromCommonStack(
        state,
        targetPlayer,
        effect.amount,
        "discard",
        effect.effectId,
        source,
        effectRuntimeServices
      );
    }
    if (effect.effectId === "attack_discard_cards") {
      return executeAttackDiscardCards(
        state,
        targetPlayer,
        effect.amount,
        source,
        effectRuntimeServices
      );
    }
    if (
      effect.effectId === "attack_gain_status" &&
      effect["statusId"] === "dingler"
    ) {
      return gainDinglerStatus(
        state,
        targetPlayer,
        "attack_gain_status",
        source
      );
    }
    if (effect.effectId === "attack_gain_dead_wizard_tokens") {
      for (let index = 0; index < effect.amount; index += 1) {
        const result = effectRuntimeServices.gainDeadWizardToken(
          state,
          targetPlayer
        );
        if (!result.ok || result.gameEnd !== undefined) {
          return result;
        }
      }
      return { ok: true };
    }
    if (effect.effectId === "attack_transfer_controlled_dead_wizard_token") {
      return effectRuntimeServices.transferControlledDeadWizardTokenLike(
        state,
        attackingPlayer,
        targetPlayer,
        effect.effectId,
        source
      );
    }
    if (effect.effectId === "attack_kill_and_replace_dead_wizard_token") {
      const killResult = effectRuntimeServices.killPlayer(
        state,
        attackingPlayer,
        targetPlayer,
        effect.effectId,
        source,
        "skip"
      );
      if (!killResult.ok || killResult.gameEnd !== undefined) {
        return killResult;
      }
      return effectRuntimeServices.replaceDeadWizardTokenAfterKill(
        state,
        attackingPlayer,
        targetPlayer,
        effect.amount,
        effect.effectId,
        source
      );
    }
    return {
      ok: false,
      error: `Unsupported player-controlled on-hit effect ${effect.effectId}`,
    };
  },
  executeOutcomeBranch(state, attackingPlayer, targetPlayer, branch, context) {
    return executeAttackOutcomeBranch(
      state,
      attackingPlayer,
      branch,
      context.source,
      targetPlayer,
      context,
      context.effectId,
      effectRuntimeServices
    );
  },
  applyAfterAttackDamage(
    state,
    attribution: AttackDamageAttribution<EffectSourceContext>
  ) {
    return applyAfterPlayerAttackDamage(
      state,
      attribution.attackingPlayer,
      attribution.damageDealt,
      attribution.source
    );
  },
};

function resolvePlayerControlledAttackTargets(
  intent: PlayerControlledAttackIntent
):
  | { ok: true; players: readonly PlayerState[] }
  | { ok: false; error: string } {
  if (intent.targetPlan.kind === "orderedPlayers") {
    return { ok: true, players: intent.targetPlan.players };
  }

  const effect = intent.targetPlan.effect;
  if (effect.effectId === "attack_gain_status") {
    return resolveStatusTargetPlayers(
      intent.state,
      intent.attackingPlayer,
      effect,
      intent.source
    );
  }
  if ("targetSelector" in effect && effect.targetSelector === "eachFoe") {
    return {
      ok: true,
      players: getOpponentsInSeatingOrder(intent.state, intent.attackingPlayer),
    };
  }

  const targetResult = resolveTargetChoice(
    intent.state,
    intent.attackingPlayer,
    effect,
    intent.source
  );
  if (!targetResult.ok) {
    return targetResult;
  }
  if (targetResult.choice === undefined) {
    return { ok: true, players: [] };
  }
  if (targetResult.choice.choiceType !== "player") {
    return {
      ok: false,
      error: "Attack effect requires a player target",
    };
  }
  return { ok: true, players: [targetResult.choice.player] };
}

function resolveMayhemAttackPlan(
  state: GameState,
  sourcePlayer: PlayerState,
  targets: readonly MayhemAttackPlanTarget[],
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  impact: MayhemAttackImpact = { kind: "damage" }
): EffectExecutionResult {
  const attackInstance = createAttackInstance(state, sourcePlayer, source);
  const attackSource = attackInstance.source;
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
    attackId: attackInstance.attackId,
    cardInstanceId: attackSource.cardInstanceId,
    definitionId: attackSource.definitionId,
    effectId,
    ...phaseAmount,
    sourceType: attackSource.sourceType,
  });

  for (const target of targets) {
    recordGameEvent(state, {
      type: "mayhemDecisionStarted",
      playerId: sourcePlayer.playerId,
      attackId: attackInstance.attackId,
      targetPlayerId: target.targetPlayer.playerId,
      cardInstanceId: attackSource.cardInstanceId,
      definitionId: attackSource.definitionId,
      effectId,
      amount: target.amount,
      sourceType: attackSource.sourceType,
    });
    const defenseResult = resolveDefenseWindow(state, target.targetPlayer, {
      kind: "nonredirectable",
      attackId: attackInstance.attackId,
      source: attackSource,
      defenseUsage: attackInstance.defenseUsage,
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
        attackId: attackInstance.attackId,
        targetPlayerId: target.targetPlayer.playerId,
        cardInstanceId: attackSource.cardInstanceId,
        definitionId: attackSource.definitionId,
        effectId,
        sourceType: attackSource.sourceType,
      });
    }

    decisions.push({ ...target, avoided });
  }

  recordGameEvent(state, {
    type: "mayhemResolutionPhaseStarted",
    playerId: sourcePlayer.playerId,
    attackId: attackInstance.attackId,
    cardInstanceId: attackSource.cardInstanceId,
    definitionId: attackSource.definitionId,
    effectId,
    ...phaseAmount,
    sourceType: attackSource.sourceType,
  });

  for (const decision of decisions) {
    if (decision.avoided) {
      recordGameEvent(state, {
        type: "mayhemTargetSkipped",
        playerId: sourcePlayer.playerId,
        attackId: attackInstance.attackId,
        targetPlayerId: decision.targetPlayer.playerId,
        cardInstanceId: attackSource.cardInstanceId,
        definitionId: attackSource.definitionId,
        effectId,
        sourceType: attackSource.sourceType,
      });
      continue;
    }

    recordGameEvent(state, {
      type: "attackTargetStarted",
      playerId: sourcePlayer.playerId,
      attackId: attackInstance.attackId,
      targetPlayerId: decision.targetPlayer.playerId,
      cardInstanceId: attackSource.cardInstanceId,
      definitionId: attackSource.definitionId,
      effectId,
      amount: decision.amount,
      sourceType: attackSource.sourceType,
    });
    if (impact.kind === "effect") {
      const result = impact.executeOnHit(decision.targetPlayer);
      if (!result.ok || result.gameEnd !== undefined) {
        return result;
      }
      continue;
    }
    const damageResult = dealDamage(
      state,
      sourcePlayer,
      decision.targetPlayer,
      decision.amount,
      effectId,
      attackSource,
      attackSource.playerControlledAttackPlayerId === undefined
        ? { kind: "ownerless" }
        : { kind: "playerControlled", player: sourcePlayer }
    );
    if (!("damageDealt" in damageResult)) {
      return damageResult;
    }
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
  restoreDetachedCardToZone,
  discardTopDeckCards,
  drawCards: drawCardsForPlayer,
  getDestroyDestination,
  getOpponentsInSeatingOrder,
  getPlayersInActiveOrder,
  prepareEffectChoice,
  recordEffectChoiceSelected,
  chooseEffectChoice,
  runControlledPowerMutation,
  dealDamage,
  killPlayer,
  replaceDeadWizardTokenAfterKill,
  healPlayer,
  setPlayerLife,
  exchangePlayerLifeTotals,
  resolveStatusTargetPlayers,
  gainDinglerStatus,
  removeDinglerStatus,
  hasDinglerStatus,
  gainDeadWizardToken,
  transferControlledDeadWizardTokenLike,
  exchangeControlledDeadWizardTokenLikes,
  collectAttackReplacementProfile,
  resolvePendingDeadWizardTokenFaces: resolveQueuedDeadWizardTokenFaces,
  resolvePlayerControlledAttack:
    resolvePlayerControlledAttackWithRuntimeAdapters,
  resolveDefenseWindow,
  resolveMayhemAttack,
  resolveMayhemAttackPlan,
  resolvePlayerDeath(state, player) {
    return resolvePlayerDeath(state, player, player.life.current, undefined);
  },
  peekTopDeckCard,
  drawTopDeckCard,
  playResolvedCard,
  isLegalWildMagicOption,
  executeEffect,
  executeMayhemEffects,
  asString,
};

const cardPlayResolutionServices: CardPlayResolutionServices = {
  executeOnPlayEffects,
  executeWizardPropertyOnPlayCardEffects,
  executeControlledCardOnPlayCardEffects,
  executeControlledCardAfterControllerPlaysCardEffects,
};

function resolveStatusTargetPlayers(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext
): { ok: true; players: PlayerState[] } | { ok: false; error: string } {
  if (
    "targetSelector" in effect &&
    effect.targetSelector === "eachPlayerClockwiseFromActive"
  ) {
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
  const choicesResult = buildLegalTargetChoices(state, player, effect, source);
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
    if ("emptyChoice" in effect && effect.emptyChoice === "fail") {
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
  const resolution = resolveEffectChoice(
    state,
    player,
    source,
    effectId,
    choices
  );
  if (resolution.status !== "selected") {
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

  recordEffectChoiceSelected(
    state,
    player,
    source,
    effectId,
    choices,
    resolution.choice
  );
  return resolution.choice;
}

function prepareEffectChoice(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  choices: readonly EffectChoice[]
): EffectChoiceResolution {
  return resolveEffectChoice(state, player, source, effectId, choices);
}

function resolveEffectChoice(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  choices: readonly EffectChoice[]
): EffectChoiceResolution {
  const decisionRequest: EffectChoiceRequest = structuredClone({
    requestKind: "effect" as const,
    player: createChoicePlayerView(player),
    effectId,
    sourceType: source.sourceType,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    choices: choices.map(createChoiceView),
  });
  const selectedChoice = state.effectChoiceStrategy?.(decisionRequest);
  if (selectedChoice === undefined) {
    const defaultChoice = choices[0];
    return defaultChoice === undefined
      ? { status: "empty" }
      : { status: "selected", choice: defaultChoice };
  }

  if (!isCanonicalChoiceSelection(selectedChoice)) {
    const fallbackChoice = choices[0];
    return fallbackChoice === undefined
      ? { status: "empty" }
      : { status: "selected", choice: fallbackChoice };
  }

  const selectedChoiceIndex = readChoiceIndex(selectedChoice);
  const indexedChoice =
    selectedChoiceIndex === undefined
      ? undefined
      : choices[selectedChoiceIndex];
  const matchedChoice =
    indexedChoice !== undefined
      ? matchesDecisionChoice(indexedChoice, selectedChoice)
        ? indexedChoice
        : undefined
      : choices.find((candidate) =>
          matchesDecisionChoice(candidate, selectedChoice)
        );
  if (matchedChoice !== undefined) {
    return { status: "selected", choice: matchedChoice };
  }

  const fallbackChoice = choices[0];
  return fallbackChoice === undefined
    ? { status: "empty" }
    : { status: "selected", choice: fallbackChoice };
}

function recordEffectChoiceSelected(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  choices: readonly EffectChoice[],
  choice: EffectChoice
): void {
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
            : choice.choiceKind === "damageDistribution"
              ? {
                  ...choicePayloadBase,
                  choiceKind: "damageDistribution" as const,
                  amount: choice.amount,
                  amounts: [...choice.amounts],
                  targetPlayerIds: choice.players.map(
                    (candidate) => candidate.playerId
                  ),
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
}

function createChoiceView(choice: EffectChoice): ChoiceView {
  if (choice.choiceKind === "option") {
    return { choiceKind: choice.choiceKind, choiceId: choice.choiceId };
  }
  if (choice.choiceKind === "playerTarget") {
    return {
      choiceKind: choice.choiceKind,
      choiceId: choice.choiceId,
      targetPlayerIds: choice.players.map((player) => player.playerId),
    };
  }
  if (choice.choiceKind === "cardTarget") {
    return {
      choiceKind: choice.choiceKind,
      choiceId: choice.choiceId,
      targetCardInstanceIds: choice.cards.map((card) => card.instanceId),
      amount: choice.amount,
    };
  }
  if (choice.choiceKind === "defense") {
    return {
      choiceKind: choice.choiceKind,
      choiceId: choice.choiceId,
      ...(choice.card === undefined
        ? {}
        : {
            targetCardInstanceId: choice.card.instanceId,
          }),
    };
  }
  if (choice.choiceKind === "damageDistribution") {
    return {
      choiceKind: choice.choiceKind,
      choiceId: choice.choiceId,
      targetPlayerIds: choice.players.map((player) => player.playerId),
      amounts: [...choice.amounts],
      amount: choice.amount,
    };
  }
  return {
    choiceKind: choice.choiceKind,
    choiceId: choice.choiceId,
    direction: choice.direction,
    targetPlayerIds: choice.players.map((player) => player.playerId),
  };
}

function matchesDecisionChoice(
  choice: EffectChoice,
  selection: ChoiceSelection
): boolean {
  return choice.choiceId === selection.choiceId;
}

function isCanonicalChoiceSelection(value: unknown): value is ChoiceSelection {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  if (
    !keys.includes("choiceId") ||
    keys.some((key) => key !== "choiceId" && key !== "choiceIndex") ||
    keys.length > 2
  ) {
    return false;
  }

  const choiceId = (value as { readonly choiceId?: unknown }).choiceId;
  return (
    typeof choiceId === "string" &&
    (keys.length === 1 || readChoiceIndex(value) !== undefined)
  );
}

function readChoiceIndex(selection: unknown): number | undefined {
  const value = (selection as { readonly choiceIndex?: unknown }).choiceIndex;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function buildLegalTargetChoices(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source?: EffectSourceContext
): { ok: true; choices: TargetChoice[] } | { ok: false; error: string } {
  const target = "target" in effect ? effect.target : undefined;
  if (!isRuntimeEffectSelectorTarget(target)) {
    const targetSelector =
      "targetSelector" in effect ? effect.targetSelector : undefined;
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

    if (
      targetSelector === "chosenLeftOrRightFoe" ||
      targetSelector === "leftAndRightFoes"
    ) {
      return {
        ok: true,
        choices: getDistinctAdjacentFoes(
          getOpponentsInSeatingOrder(state, player)
        ).map((candidate) => ({
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

    if (targetSelector === "currentAttacker") {
      const currentAttackerPlayerId = source?.currentAttackerPlayerId;
      if (currentAttackerPlayerId === undefined) {
        return { ok: true, choices: [] };
      }
      const currentAttacker = state.players.find(
        (candidate) => candidate.playerId === currentAttackerPlayerId
      );
      return currentAttacker === undefined
        ? {
            ok: false,
            error: `Missing current attacker ${currentAttackerPlayerId}`,
          }
        : {
            ok: true,
            choices: [
              { choiceType: "player" as const, player: currentAttacker },
            ],
          };
    }

    if (targetSelector === "activePlayer") {
      const activePlayer = state.players.find(
        (candidate) => candidate.playerId === state.activePlayerId
      );
      return activePlayer === undefined
        ? { ok: false, error: `Missing active player ${state.activePlayerId}` }
        : {
            ok: true,
            choices: [{ choiceType: "player" as const, player: activePlayer }],
          };
    }

    if (targetSelector === "opponentPlayer") {
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

    if (targetSelector === "anyPlayer") {
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
      error: `Unsupported target selector ${asString(targetSelector)}`,
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
        deadWizardTokenPolicy?: DeadWizardTokenDeathPolicy;
      }
    | undefined,
  attackId?: EffectSourceContext["attackId"]
): EffectExecutionResult {
  recordGameEvent(state, {
    type: "playerDied",
    playerId: player.playerId,
    lifeAfter: lifeAfterDamage,
    ...(attackId === undefined ? {} : { attackId }),
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

  let issueResult: EffectExecutionResult = { ok: true };
  const hasPendingReplacement =
    killCredit !== undefined &&
    state.turn.deadWizardTokenKillReplacement?.playerId ===
      killCredit.killer.playerId &&
    killCredit.killer.playerId !== player.playerId;
  if (killCredit?.deadWizardTokenPolicy !== "skip" && !hasPendingReplacement) {
    issueResult = issueDeadWizardToken(
      state,
      player,
      killCredit?.killer.playerId,
      { projectRespawn: true }
    );
    if (!issueResult.ok) {
      return issueResult;
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
    ...(attackId === undefined ? {} : { attackId }),
  });

  if (killCredit?.deadWizardTokenPolicy === "skip") {
    return { ok: true };
  }
  if (killCredit !== undefined) {
    const replacementResult = resolveDeadWizardTokenKillReplacement(
      state,
      killCredit,
      player
    );
    if (replacementResult !== undefined) {
      return replacementResult;
    }
  }
  return issueResult;
}

function resolveDeadWizardTokenKillReplacement(
  state: GameState,
  killCredit: {
    killer: PlayerState;
    effectId: RuntimeEffectId;
    source: EffectSourceContext;
    deadWizardTokenPolicy?: DeadWizardTokenDeathPolicy;
  },
  defeatedPlayer: PlayerState
): EffectExecutionResult | undefined {
  const pending = state.turn.deadWizardTokenKillReplacement;
  if (
    pending === undefined ||
    pending.playerId !== killCredit.killer.playerId ||
    pending.playerId === defeatedPlayer.playerId
  ) {
    return undefined;
  }

  state.turn.deadWizardTokenKillReplacement = undefined;
  const replacementSource: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: pending.playerId,
    cardInstanceId: pending.cardInstanceId,
    definitionId: pending.definitionId,
  };
  const replacementChoice = chooseEffectChoice(
    state,
    killCredit.killer,
    replacementSource,
    "arm_dead_wizard_token_kill_replacement",
    [
      { choiceKind: "option", choiceId: "decline" },
      { choiceKind: "option", choiceId: "apply" },
    ]
  );
  if (replacementChoice?.choiceId !== "apply") {
    return issueDeadWizardToken(
      state,
      defeatedPlayer,
      killCredit.killer.playerId
    );
  }

  const killerTokenResult = issueDeadWizardToken(state, killCredit.killer);
  if (!killerTokenResult.ok || killerTokenResult.gameEnd !== undefined) {
    return killerTokenResult;
  }

  const legendChoices: EffectChoice[] = state.common.legendMarket.map(
    (card) => ({
      choiceKind: "cardTarget" as const,
      choiceId: card.instanceId,
      cards: [card],
      amount: 1,
    })
  );
  if (legendChoices.length === 0) {
    return { ok: true };
  }

  const legendChoice = chooseEffectChoice(
    state,
    killCredit.killer,
    replacementSource,
    "arm_dead_wizard_token_kill_replacement",
    legendChoices
  );
  if (legendChoice?.choiceKind !== "cardTarget") {
    return { ok: true };
  }
  const legend = state.common.legendMarket.find(
    (card) => card.instanceId === legendChoice.cards[0]?.instanceId
  );
  if (legend === undefined) {
    return {
      ok: false,
      error: "Chosen legend disappeared before Bratality reward",
    };
  }
  const gainResult = moveGainedCardToPlayerDestination(
    state,
    killCredit.killer,
    legend,
    "discard"
  );
  if (!gainResult.ok) {
    return gainResult;
  }
  return { ok: true };
}

export function gainDeadWizardToken(
  state: GameState,
  player: PlayerState
): EffectExecutionResult {
  return resolveWithinDeadWizardTokenResolutionBoundary(state, () =>
    issueDeadWizardToken(state, player)
  );
}

function transferControlledDeadWizardTokenLike(
  state: GameState,
  player: PlayerState,
  targetPlayer: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  return resolveWithinDeadWizardTokenResolutionBoundary(state, () => {
    const cards = getControlledDeadWizardTokenLikeCards(state, player);
    const choices: EffectChoice[] = [
      ...player.deadWizardTokens.map((token) => ({
        choiceKind: "option" as const,
        choiceId: getDeadWizardTokenChoiceId(token.instanceId),
      })),
      ...cards.map((card) => ({
        choiceKind: "cardTarget" as const,
        choiceId: getDeadWizardTokenLikeCardChoiceId(card.instanceId),
        cards: [card],
        amount: 1,
      })),
    ];
    const choice = chooseEffectChoice(state, player, source, effectId, choices);
    if (choice === undefined) {
      return { ok: true };
    }

    if (choice.choiceKind === "option") {
      const tokenInstanceId = choice.choiceId.startsWith("token:")
        ? choice.choiceId.slice("token:".length)
        : undefined;
      if (tokenInstanceId === undefined) {
        return {
          ok: false,
          error: "Invalid dead wizard token transfer choice",
        };
      }
      const tokenBeforeRemoval = player.deadWizardTokens.find(
        (candidate) => candidate.instanceId === tokenInstanceId
      );
      if (tokenBeforeRemoval === undefined) {
        return {
          ok: false,
          error: `Dead wizard token ${tokenInstanceId} disappeared before transfer`,
        };
      }
      const movementResult = runControlledPowerMutation(
        state,
        () => state.activePlayerId,
        () => {
          const token = removeDeadWizardToken(
            player,
            tokenBeforeRemoval.instanceId
          );
          if (token === undefined) {
            return {
              ok: false as const,
              error: `Dead wizard token ${tokenInstanceId} disappeared before transfer`,
            };
          }
          token.ownerId = targetPlayer.playerId;
          targetPlayer.deadWizardTokens.push(token);
          enqueueDeadWizardTokenFace(state, targetPlayer, token);
          return { ok: true as const };
        },
        (result) => result.ok
      );
      if (!movementResult.ok) {
        return movementResult;
      }
      if (!movementResult.value.ok) {
        return movementResult.value;
      }
      return movementResult.gameEnd === undefined
        ? { ok: true }
        : { ok: true, gameEnd: movementResult.gameEnd };
    }

    if (choice.choiceKind !== "cardTarget") {
      return {
        ok: false,
        error: "Invalid dead wizard token transfer choice kind",
      };
    }
    const card = cards.find(
      (candidate) => candidate.instanceId === choice.cards[0]?.instanceId
    );
    if (card === undefined) {
      return {
        ok: false,
        error:
          "Controlled dead wizard token-like card disappeared before transfer",
      };
    }
    const movementResult = runControlledPowerMutation(
      state,
      () => state.activePlayerId,
      () => {
        const moved = moveCardToPlayerZone(
          state,
          card,
          targetPlayer,
          targetPlayer.permanents,
          `${targetPlayer.playerId}.permanents`,
          effectId,
          source
        );
        if (!moved) {
          return {
            ok: false as const,
            error: `Cannot transfer controlled dead wizard token-like card ${card.instanceId}`,
          };
        }
        removeTemporaryCardControl(state, card.instanceId);
        return { ok: true as const };
      },
      (result) => result.ok
    );
    if (!movementResult.ok) {
      return movementResult;
    }
    if (!movementResult.value.ok) {
      return movementResult.value;
    }
    return movementResult.gameEnd === undefined
      ? { ok: true }
      : { ok: true, gameEnd: movementResult.gameEnd };
  });
}

type ControlledDeadWizardTokenLikeSelection =
  | {
      kind: "token";
      token: PlayerState["deadWizardTokens"][number];
    }
  | {
      kind: "card";
      card: CardInstance;
    };

function exchangeControlledDeadWizardTokenLikes(
  state: GameState,
  player: PlayerState,
  targetPlayer: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  return resolveWithinDeadWizardTokenResolutionBoundary(state, () => {
    const playerObjects = getControlledDeadWizardTokenLikeSelections(
      state,
      player
    );
    const targetObjects = getControlledDeadWizardTokenLikeSelections(
      state,
      targetPlayer
    );
    if (playerObjects.length === 0 || targetObjects.length === 0) {
      return { ok: true };
    }

    const exchangeChoice = chooseEffectChoice(state, player, source, effectId, [
      { choiceKind: "option", choiceId: "decline" },
      { choiceKind: "option", choiceId: "exchange" },
    ]);
    if (exchangeChoice === undefined || exchangeChoice.choiceId === "decline") {
      return { ok: true };
    }
    if (
      exchangeChoice.choiceKind !== "option" ||
      exchangeChoice.choiceId !== "exchange"
    ) {
      return { ok: false, error: "Invalid dead wizard token exchange option" };
    }

    const playerChoice = chooseEffectChoice(
      state,
      player,
      source,
      effectId,
      createDeadWizardTokenLikeChoices(playerObjects)
    );
    if (playerChoice === undefined) {
      return { ok: true };
    }
    const playerSelection = resolveDeadWizardTokenLikeSelection(
      playerObjects,
      playerChoice
    );
    if (playerSelection === undefined) {
      return {
        ok: false,
        error: "Invalid own dead wizard token exchange choice",
      };
    }

    const targetChoice = chooseEffectChoice(
      state,
      player,
      source,
      effectId,
      createDeadWizardTokenLikeChoices(targetObjects)
    );
    if (targetChoice === undefined) {
      return { ok: true };
    }
    const targetSelection = resolveDeadWizardTokenLikeSelection(
      targetObjects,
      targetChoice
    );
    if (targetSelection === undefined) {
      return {
        ok: false,
        error: "Invalid attacker dead wizard token exchange choice",
      };
    }
    if (
      playerSelection.kind === "card" &&
      targetSelection.kind === "card" &&
      playerSelection.card.instanceId === targetSelection.card.instanceId
    ) {
      return {
        ok: false,
        error: "Dead wizard token exchange selected the same card twice",
      };
    }
    if (
      !isControlledDeadWizardTokenLikeSelectionAvailable(
        state,
        player,
        playerSelection
      ) ||
      !isControlledDeadWizardTokenLikeSelectionAvailable(
        state,
        targetPlayer,
        targetSelection
      )
    ) {
      return {
        ok: false,
        error: "Dead wizard token exchange target disappeared before movement",
      };
    }

    const movementResult = runControlledPowerMutation(
      state,
      () => state.activePlayerId,
      () => {
        const playerMovement = moveControlledDeadWizardTokenLike(
          state,
          player,
          targetPlayer,
          playerSelection,
          effectId,
          source
        );
        if (!playerMovement.ok) {
          return playerMovement;
        }
        const targetMovement = moveControlledDeadWizardTokenLike(
          state,
          targetPlayer,
          player,
          targetSelection,
          effectId,
          source
        );
        if (!targetMovement.ok) {
          return targetMovement;
        }
        return { ok: true } as const;
      },
      (result) => result.ok
    );
    if (!movementResult.ok) {
      return movementResult;
    }
    if (!movementResult.value.ok) {
      return movementResult.value;
    }
    return movementResult.gameEnd === undefined
      ? { ok: true }
      : { ok: true, gameEnd: movementResult.gameEnd };
  });
}

function getControlledDeadWizardTokenLikeSelections(
  state: GameState,
  player: PlayerState
): ControlledDeadWizardTokenLikeSelection[] {
  return [
    ...player.deadWizardTokens.map((token) => ({
      kind: "token" as const,
      token,
    })),
    ...getControlledDeadWizardTokenLikeCards(state, player).map((card) => ({
      kind: "card" as const,
      card,
    })),
  ];
}

function createDeadWizardTokenLikeChoices(
  selections: readonly ControlledDeadWizardTokenLikeSelection[]
): EffectChoice[] {
  return selections.map((selection) =>
    selection.kind === "token"
      ? {
          choiceKind: "option" as const,
          choiceId: getDeadWizardTokenChoiceId(selection.token.instanceId),
        }
      : {
          choiceKind: "cardTarget" as const,
          choiceId: getDeadWizardTokenLikeCardChoiceId(
            selection.card.instanceId
          ),
          cards: [selection.card],
          amount: 1,
        }
  );
}

function resolveDeadWizardTokenLikeSelection(
  selections: readonly ControlledDeadWizardTokenLikeSelection[],
  choice: EffectChoice
): ControlledDeadWizardTokenLikeSelection | undefined {
  return selections.find((selection) =>
    selection.kind === "token"
      ? choice.choiceId ===
        getDeadWizardTokenChoiceId(selection.token.instanceId)
      : choice.choiceId ===
        getDeadWizardTokenLikeCardChoiceId(selection.card.instanceId)
  );
}

function isControlledDeadWizardTokenLikeSelectionAvailable(
  state: GameState,
  player: PlayerState,
  selection: ControlledDeadWizardTokenLikeSelection
): boolean {
  if (selection.kind === "token") {
    return player.deadWizardTokens.some(
      (token) => token.instanceId === selection.token.instanceId
    );
  }

  return (
    findCardLocation(state, selection.card.instanceId) !== undefined &&
    getControlledDeadWizardTokenLikeCards(state, player).some(
      (card) => card.instanceId === selection.card.instanceId
    )
  );
}

function moveControlledDeadWizardTokenLike(
  state: GameState,
  player: PlayerState,
  targetPlayer: PlayerState,
  selection: ControlledDeadWizardTokenLikeSelection,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  if (selection.kind === "token") {
    const token = removeDeadWizardToken(player, selection.token.instanceId);
    if (token === undefined) {
      return {
        ok: false,
        error: `Dead wizard token ${selection.token.instanceId} disappeared before exchange`,
      };
    }
    token.ownerId = targetPlayer.playerId;
    targetPlayer.deadWizardTokens.push(token);
    enqueueDeadWizardTokenFace(state, targetPlayer, token);
    return { ok: true };
  }

  const moved = moveCardToPlayerZone(
    state,
    selection.card,
    targetPlayer,
    targetPlayer.permanents,
    `${targetPlayer.playerId}.permanents`,
    effectId,
    source
  );
  if (!moved) {
    return {
      ok: false,
      error: `Cannot exchange controlled dead wizard token-like card ${selection.card.instanceId}`,
    };
  }
  removeTemporaryCardControl(state, selection.card.instanceId);
  return { ok: true };
}

function issueDeadWizardToken(
  state: GameState,
  player: PlayerState,
  deathKillerPlayerId?: PlayerState["playerId"],
  options?: { projectRespawn?: boolean }
): EffectExecutionResult {
  if (
    state.common.deadWizardTokens.status === "available" &&
    state.common.deadWizardTokens.drawStack.length > 0
  ) {
    const mutationResult = runControlledPowerMutation(
      state,
      player.playerId,
      () => {
        const token = state.common.deadWizardTokens.drawStack.shift();
        if (token === undefined) {
          return undefined;
        }

        token.ownerId = player.playerId;
        player.deadWizardTokens.push(token);
        recordGameEvent(state, {
          type: "deadWizardTokenGained",
          playerId: player.playerId,
          tokenInstanceId: token.instanceId,
          tokenDefinitionId: token.definitionId,
        });
        return token;
      }
    );
    if (!mutationResult.ok) {
      return mutationResult;
    }
    if (mutationResult.gameEnd !== undefined) {
      return { ok: true, gameEnd: mutationResult.gameEnd };
    }
    const token = mutationResult.value;
    if (token !== undefined) {
      const projection =
        options?.projectRespawn === true
          ? applyDeadWizardTokenRespawnProjection(
              state,
              player,
              token,
              deathKillerPlayerId
            )
          : {
              ok: true as const,
              deadWizardTokenWasDinglerAtGain: undefined,
              deadWizardTokenProjectionEffectIds: undefined,
            };
      if (!projection.ok) {
        return projection;
      }
      enqueueDeadWizardTokenFace(
        state,
        player,
        token,
        deathKillerPlayerId,
        projection.deadWizardTokenWasDinglerAtGain === undefined &&
          projection.deadWizardTokenProjectionEffectIds === undefined
          ? undefined
          : projection
      );
    }
  }
  return { ok: true };
}

function applyDeadWizardTokenRespawnProjection(
  state: GameState,
  player: PlayerState,
  token: TokenInstance,
  deathKillerPlayerId?: PlayerState["playerId"]
):
  | {
      ok: true;
      deadWizardTokenWasDinglerAtGain: boolean;
      deadWizardTokenProjectionEffectIds: readonly string[];
    }
  | { ok: false; error: string } {
  const definition = state.tokenDefinitions.get(token.definitionId);
  if (definition?.kind !== "deadWizardToken") {
    return {
      ok: true,
      deadWizardTokenWasDinglerAtGain: hasDinglerStatus(player),
      deadWizardTokenProjectionEffectIds: [],
    };
  }

  const deadWizardTokenWasDinglerAtGain = hasDinglerStatus(player);
  const deadWizardTokenProjectionEffectIds: string[] = [];
  const source: EffectSourceContext = {
    sourceType: "deadWizardToken",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    cardInstanceId: token.instanceId,
    definitionId: definition.tokenId,
    tokenInstanceId: token.instanceId,
    tokenDefinitionId: definition.tokenId,
    ...(deathKillerPlayerId === undefined
      ? {}
      : { deadWizardTokenDeathKillerPlayerId: deathKillerPlayerId }),
  };

  for (const effect of definition.effects) {
    const verifiedEffect = requireVerifiedRuntimeEffect(effect);
    if (verifiedEffect.timing !== "onDeadWizardTokenFace") {
      continue;
    }

    if (
      verifiedEffect.effectId === "gain_status" &&
      verifiedEffect.statusId === "dingler"
    ) {
      const result = gainDinglerStatus(
        state,
        player,
        verifiedEffect.effectId,
        source
      );
      if (!result.ok) {
        return result;
      }
      deadWizardTokenProjectionEffectIds.push(verifiedEffect.effectId);
      continue;
    }

    if (
      verifiedEffect.effectId === "toggle_status" &&
      verifiedEffect.statusId === "dingler"
    ) {
      const result = deadWizardTokenWasDinglerAtGain
        ? removeDinglerStatus(state, player, verifiedEffect.effectId, source)
        : gainDinglerStatus(state, player, verifiedEffect.effectId, source);
      if (!result.ok) {
        return result;
      }
      deadWizardTokenProjectionEffectIds.push(verifiedEffect.effectId);
      continue;
    }

    if (
      verifiedEffect.effectId ===
        "dead_wizard_token_gain_status_or_draw_face" &&
      verifiedEffect.statusId === "dingler" &&
      !deadWizardTokenWasDinglerAtGain
    ) {
      const result = gainDinglerStatus(
        state,
        player,
        verifiedEffect.effectId,
        source
      );
      if (!result.ok) {
        return result;
      }
      deadWizardTokenProjectionEffectIds.push(verifiedEffect.effectId);
    }
  }

  return {
    ok: true,
    deadWizardTokenWasDinglerAtGain,
    deadWizardTokenProjectionEffectIds,
  };
}

function getResurrectionLifeTotal(
  state: GameState,
  player: PlayerState
): number {
  const effectiveMaxLife = calculateEffectivePlayerMaxLife(
    state,
    player.playerId
  );
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
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      const result = resolveResurrectionLifeTotal(
        verifiedEffect,
        {
          sourceType: "wizardProperty",
          runtimeMode: state.runtimeMode,
          playerId: player.playerId,
          cardInstanceId: token.instanceId,
          definitionId: token.definitionId,
          tokenInstanceId: token.instanceId,
          tokenDefinitionId: token.definitionId,
        },
        player.statuses
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      if (result.status === "resolved") {
        return Math.min(result.result, effectiveMaxLife);
      }
    }
  }

  return Math.min(20, effectiveMaxLife);
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
        ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
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
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
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
): DamageApplicationResult {
  const previousLife = targetPlayer.life.current;
  targetPlayer.life.current -= amount;
  const damageDealt = Math.max(0, Math.min(previousLife, amount));
  recordGameEvent(state, {
    type: "effectDamageDealt",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    ...(source.attackId === undefined ? {} : { attackId: source.attackId }),
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
    const deathResult = resolvePlayerDeath(
      state,
      targetPlayer,
      targetPlayer.life.current,
      cause.kind === "playerControlled"
        ? {
            killer: cause.player,
            effectId,
            source,
            ...(cause.deadWizardTokenPolicy === undefined
              ? {}
              : { deadWizardTokenPolicy: cause.deadWizardTokenPolicy }),
          }
        : undefined,
      source.attackId
    );
    if (!deathResult.ok || deathResult.gameEnd !== undefined) {
      return deathResult;
    }
  }

  const triggerResult = applyDamageDealtTriggers(
    state,
    sourcePlayer,
    targetPlayer,
    damageDealt,
    source
  );
  if (!triggerResult.ok || triggerResult.gameEnd !== undefined) {
    return triggerResult;
  }

  return {
    damageDealt,
    killed,
  };
}

function killPlayer(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  deadWizardTokenPolicy: DeadWizardTokenDeathPolicy = "normal"
): EffectExecutionResult {
  const result = dealDamage(
    state,
    sourcePlayer,
    targetPlayer,
    Math.max(1, targetPlayer.life.current),
    effectId,
    source,
    {
      kind: "playerControlled",
      player: sourcePlayer,
      deadWizardTokenPolicy,
    }
  );
  return "damageDealt" in result ? { ok: true } : result;
}

function replaceDeadWizardTokenAfterKill(
  state: GameState,
  killer: PlayerState,
  targetPlayer: PlayerState,
  amount: 3,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  if (
    state.common.deadWizardTokens.status !== "available" ||
    state.common.deadWizardTokens.drawStack.length === 0
  ) {
    return { ok: true };
  }

  const available = state.common.deadWizardTokens.drawStack.slice(0, amount);
  if (available.length === 0) {
    return { ok: true };
  }

  const choice = chooseEffectChoice(
    state,
    killer,
    source,
    effectId,
    available.map((token) => ({
      choiceKind: "option" as const,
      choiceId: getDeadWizardTokenChoiceId(token.instanceId),
    }))
  );
  if (choice === undefined) {
    return { ok: true };
  }
  const selectedIndex = available.findIndex(
    (token) =>
      choice.choiceKind === "option" &&
      choice.choiceId === getDeadWizardTokenChoiceId(token.instanceId)
  );
  if (selectedIndex < 0) {
    return {
      ok: false,
      error: "Invalid dead wizard token replacement choice",
    };
  }

  const mutationResult = runControlledPowerMutation(
    state,
    () => state.activePlayerId,
    () => {
      const current = state.common.deadWizardTokens.drawStack;
      const currentPrefix = current.slice(0, available.length);
      const prefixMatches = currentPrefix.every(
        (token, index) => token.instanceId === available[index]?.instanceId
      );
      if (!prefixMatches) {
        return {
          ok: false as const,
          error: "Dead wizard token replacement stack changed before movement",
        };
      }

      const selectedToken = currentPrefix[selectedIndex];
      if (selectedToken === undefined) {
        return {
          ok: false as const,
          error: "Dead wizard token replacement target disappeared",
        };
      }

      state.common.deadWizardTokens.drawStack = [
        ...currentPrefix.filter((_, index) => index !== selectedIndex),
        ...current.slice(available.length),
      ];
      selectedToken.ownerId = targetPlayer.playerId;
      targetPlayer.deadWizardTokens.push(selectedToken);
      recordGameEvent(state, {
        type: "deadWizardTokenGained",
        playerId: targetPlayer.playerId,
        tokenInstanceId: selectedToken.instanceId,
        tokenDefinitionId: selectedToken.definitionId,
      });
      enqueueDeadWizardTokenFace(
        state,
        targetPlayer,
        selectedToken,
        killer.playerId
      );
      return { ok: true as const };
    },
    (result) => result.ok
  );
  if (!mutationResult.ok) {
    return mutationResult;
  }
  if (!mutationResult.value.ok) {
    return mutationResult.value;
  }
  return mutationResult.gameEnd === undefined
    ? { ok: true }
    : { ok: true, gameEnd: mutationResult.gameEnd };
}

function applyDamageDealtTriggers(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  damageDealt: number,
  damageSource: EffectSourceContext
): EffectExecutionResult {
  if (
    damageDealt <= 0 ||
    sourcePlayer.playerId === targetPlayer.playerId ||
    state.activePlayerId !== sourcePlayer.playerId
  ) {
    return { ok: true };
  }

  return dispatchControlledCardOperation(state, sourcePlayer, {
    kind: "afterDamageDealt",
    damageDealt,
    damageSource,
  });
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
  attackSource: EffectSourceContext
): EffectExecutionResult {
  if (
    totalDamageDealt <= 0 ||
    state.activePlayerId !== attackingPlayer.playerId ||
    state.turn.damagingAttackPlayerIds.includes(attackingPlayer.playerId)
  ) {
    return { ok: true };
  }

  const dispatchResult = dispatchControlledCardOperation(
    state,
    attackingPlayer,
    {
      kind: "afterPlayerAttackDamage",
      totalDamageDealt,
      attackSource,
    }
  );
  if (!dispatchResult.ok || dispatchResult.gameEnd !== undefined) {
    return dispatchResult;
  }

  state.turn.damagingAttackPlayerIds.push(attackingPlayer.playerId);
  return { ok: true };
}

const attackDefenseServices: AttackDefenseServices = {
  chooseEffectChoice,
  validateDefenseEffects,
  executeDefenseEffects(state, player, effects, source) {
    return executeEffects(state, player, effects, "onDefense", source);
  },
};

function resolveDefenseWindow(
  state: GameState,
  defendingPlayer: PlayerState,
  attack: DefenseAttackContext,
  resolveRedirectedAttack?: (
    intent: RedirectedAttackIntent
  ) => AttackTargetResolutionResult
): DefenseWindowResolutionResult {
  return resolveDefenseWindowWithServices(
    state,
    defendingPlayer,
    attack,
    attackDefenseServices,
    resolveRedirectedAttack
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

function exchangePlayerLifeTotals(
  state: GameState,
  player: PlayerState,
  targetPlayer: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  const playerLife = player.life.current;
  const targetPlayerLife = targetPlayer.life.current;
  const playerLifeAfter = Math.min(
    targetPlayerLife,
    calculateEffectivePlayerMaxLife(state, player.playerId)
  );
  const targetPlayerLifeAfter = Math.min(
    playerLife,
    calculateEffectivePlayerMaxLife(state, targetPlayer.playerId)
  );
  player.life.current = playerLifeAfter;
  targetPlayer.life.current = targetPlayerLifeAfter;
  if (playerLifeAfter < targetPlayerLife) {
    recordGameEvent(state, {
      type: "playerLifeClamped",
      playerId: player.playerId,
      amount: playerLifeAfter,
    });
  }
  if (targetPlayerLifeAfter < playerLife) {
    recordGameEvent(state, {
      type: "playerLifeClamped",
      playerId: targetPlayer.playerId,
      amount: targetPlayerLifeAfter,
    });
  }
  recordGameEvent(state, {
    type: "effectLifeExchanged",
    playerId: player.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });
}

function moveCardToPlayerZone(
  state: GameState,
  card: CardInstance,
  player: PlayerState,
  destination: CardInstance[],
  destinationZone: string,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  placeOnTop = false
): boolean {
  const ownerBefore = card.ownerId;
  const sourceLocation = removeCardFromLocation(state, card.instanceId);
  if (sourceLocation === undefined) {
    return false;
  }
  const sourceZone = sourceLocation.zoneName;

  moveMarketChipsToPlayer(state, player, card);
  card.ownerId = player.playerId;
  if (placeOnTop) {
    destination.unshift(card);
  } else {
    destination.push(card);
  }
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
  source: EffectSourceContext,
  placeOnTop = false
): boolean {
  const ownerBefore = card.ownerId;
  const sourceLocation = findCardLocation(state, card.instanceId);
  if (sourceLocation === undefined) {
    return false;
  }

  if (sourceLocation.zoneName === destinationZone) {
    const reordered = reorderPhysicalCard(
      state,
      card.instanceId,
      destinationZone,
      placeOnTop ? "front" : "back"
    );
    if (!reordered.ok) {
      return false;
    }
    recordCardMoved(state, player, card, {
      sourceZone: sourceLocation.zoneName,
      destinationZone,
      ownerBefore,
      ownerAfter: card.ownerId,
      effectId,
      sourceType: source.sourceType,
    });
    return true;
  }

  const removedLocation = removeCardFromLocation(state, card.instanceId);
  if (removedLocation === undefined) {
    return false;
  }
  const sourceZone = removedLocation.zoneName;

  if (placeOnTop) {
    destination.unshift(card);
  } else {
    destination.push(card);
  }
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

function restoreDetachedCardToZone(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  destinationZone: string,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  placeOnTop = false
): boolean {
  const ownerBefore = card.ownerId;
  const restored = insertDetachedCard(
    state,
    card,
    destinationZone,
    placeOnTop ? "front" : "back"
  );
  if (!restored.ok) {
    return false;
  }
  recordCardMoved(state, player, card, {
    sourceZone: restored.move.sourceZoneName,
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
    const result = drawDeckCard(player.deck, player.discard, state.rng);
    if (result.reshuffled) {
      recordDeckReshuffle(state, player.playerId);
    }

    const card = result.card;
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
      markRuntimeEffectTreeVerified({
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerMaxLife",
        operation: "add",
        amount: -10,
        target: {
          targetType: "player",
        },
      }),
      markRuntimeEffectTreeVerified({
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "playerVictoryPoints",
        operation: "add",
        amount: -5,
        target: {
          targetType: "player",
        },
      }),
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
): EffectExecutionResult {
  const mutationResult = runControlledPowerMutation(
    state,
    player.playerId,
    () => {
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
    }
  );
  if (!mutationResult.ok) {
    return mutationResult;
  }
  return mutationResult.gameEnd === undefined
    ? { ok: true }
    : { ok: true, gameEnd: mutationResult.gameEnd };
}

function removeDinglerStatus(
  state: GameState,
  player: PlayerState,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): EffectExecutionResult {
  const dinglerIndex = player.statuses.findIndex(
    (status) => status.statusId === "dingler"
  );
  if (dinglerIndex < 0) {
    return { ok: true };
  }

  const mutationResult = runControlledPowerMutation(
    state,
    player.playerId,
    () => {
      player.statuses.splice(dinglerIndex, 1);
      recordGameEvent(state, {
        type: "dinglerStatusRemoved",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
    }
  );
  if (!mutationResult.ok) {
    return mutationResult;
  }
  return mutationResult.gameEnd === undefined
    ? { ok: true }
    : { ok: true, gameEnd: mutationResult.gameEnd };
}

function drawTopDeckCard(
  player: PlayerState,
  state: GameState
): CardInstance | undefined {
  const result = drawDeckCard(player.deck, player.discard, state.rng);
  if (result.reshuffled) {
    recordDeckReshuffle(state, player.playerId);
  }
  return result.card;
}

function peekTopDeckCard(
  player: PlayerState,
  state: GameState
): CardInstance | undefined {
  if (refillDeckFromDiscard(player.deck, player.discard, state.rng)) {
    recordDeckReshuffle(state, player.playerId);
  }
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
    forceOngoingDiscard?: {
      zone: "ownerDiscardAfterResolution";
      ownerId: PlayerState["playerId"];
    };
  } = {}
): EffectExecutionResult {
  return resolveCardPlay(state, player, card, cardPlayResolutionServices, {
    ...ownership,
    ongoingOwnerId: ownership.ongoingOwnerId ?? player.playerId,
  });
}
