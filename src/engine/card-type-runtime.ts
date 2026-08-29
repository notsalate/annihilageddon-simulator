import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  TokenInstance,
} from "./setup.js";
import { getControlledCards, getPhysicalCardLedger } from "./control-ledger.js";
import {
  isOwnedCardsCountAsCardTypeRuntimeEffect,
  type OwnedCardsCountAsCardTypeRuntimeEffect,
} from "./effect-runtime-card-type.js";
import {
  evaluateRuntimeEffectAtTiming,
  type EffectSourceContext,
} from "./effect-runtime-registry.js";
import type {
  RuntimeEffect,
  RuntimeEffectCondition,
  RuntimeEffectForId,
} from "./runtime-effect.js";
import { requireVerifiedRuntimeEffect } from "./runtime-effect-verification.js";

type CardTypeEffectResolution =
  | {
      readonly status: "resolved";
      readonly effect: OwnedCardsCountAsCardTypeRuntimeEffect;
    }
  | { readonly status: "error"; readonly error: string };

type CardTypeCapabilityMode = "always" | "perCard";

const cardTypeEffectResolutionCache = new WeakMap<
  object,
  Map<string, CardTypeEffectResolution>
>();
const cardTypeCapabilitiesCache = new WeakMap<
  object,
  Map<string, readonly OwnedCardsCountAsCardTypeRuntimeEffect[]>
>();
const cardTypePerCardCapabilityCache = new WeakMap<
  object,
  Map<string, boolean>
>();
const cardTypeOptionsCache = new WeakMap<GameState, Map<string, string[]>>();

export function cardMatchesTypeForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  cardType: string,
  card?: CardInstance
): boolean {
  if (
    definition.engine.cardTypes.includes(cardType) ||
    definition.engine.tags?.includes("counts_as_every_card_type") === true
  ) {
    return true;
  }
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) return false;

  if (card !== undefined && card.ownerId !== playerId) return false;
  let capabilityMode: CardTypeCapabilityMode | undefined;
  for (const property of player.wizardProperties) {
    const propertyCapability = wizardPropertyCountsDefinitionAsType(
      state,
      playerId,
      property.instanceId,
      property.definitionId,
      definition,
      cardType
    );
    if (propertyCapability === "always") {
      capabilityMode = "always";
      break;
    }
    if (propertyCapability === "perCard") {
      capabilityMode = "perCard";
    }
  }
  if (capabilityMode === undefined || capabilityMode === "always") {
    return capabilityMode === "always";
  }
  if (card === undefined) return false;
  return player.effectiveCardTypeSelections.some(
    (selection) =>
      selection.cardInstanceId === card.instanceId &&
      selection.cardType === cardType
  );
}

export function runtimeEffectConditionMatches(
  state: GameState,
  player: PlayerId | PlayerState,
  condition: RuntimeEffectCondition,
  excludedCardInstanceId?: string
): boolean {
  const playerId = typeof player === "string" ? player : player.playerId;
  const playerState =
    typeof player === "string"
      ? state.players.find((candidate) => candidate.playerId === player)
      : player;
  if (playerState === undefined) return false;

  const controlledCards = getControlledCards(state, playerState).filter(
    (card) =>
      "conditionId" in condition || card.instanceId !== excludedCardInstanceId
  );

  if (
    "conditionId" in condition &&
    condition.conditionId === "controlled_card_count"
  ) {
    return controlledCards.length >= condition.minimumCount;
  }

  if ("conditionId" in condition && condition.conditionId === "control_count") {
    return (
      controlledCards.filter((card) => {
        const definition = state.cardDefinitions.get(card.definitionId);
        return (
          definition !== undefined &&
          condition.cardTypes.some((cardType) =>
            cardMatchesTypeForPlayer(
              state,
              playerId,
              definition,
              cardType,
              card
            )
          )
        );
      }).length >= condition.minimumCount
    );
  }

  return (
    controlledCards.filter((card) => {
      const definition = state.cardDefinitions.get(card.definitionId);
      return (
        definition !== undefined &&
        cardMatchesTypeForPlayer(
          state,
          playerId,
          definition,
          condition.cardType,
          card
        )
      );
    }).length >= condition.minimum
  );
}

export function countControlledCardsOfType(
  state: GameState,
  player: PlayerState,
  cardType: string
): number {
  return getControlledCards(state, player).filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition !== undefined &&
      cardMatchesTypeForPlayer(
        state,
        player.playerId,
        definition,
        cardType,
        card
      )
    );
  }).length;
}

export function getCardEffectiveTypeOptions(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance
): string[] {
  const player = requirePlayer(state, playerId);
  if (card.ownerId !== playerId) return [];
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) return [];

  const cacheKey = JSON.stringify([
    state.runtimeMode,
    playerId,
    player.wizardProperties.map(({ instanceId, definitionId }) => [
      instanceId,
      definitionId,
    ]),
    card.definitionId,
  ]);
  const cachedOptions = cardTypeOptionsCache.get(state)?.get(cacheKey);
  if (cachedOptions !== undefined) return cachedOptions;

  const options = new Set<string>();
  for (const property of player.wizardProperties) {
    const propertyDefinition = state.tokenDefinitions.get(
      property.definitionId
    );
    const effects =
      propertyDefinition?.kind === "wizardProperty"
        ? propertyDefinition.engine?.effects
        : undefined;
    if (effects === undefined) continue;

    const capabilities = getCardTypeCapabilities(
      createWizardPropertyEffectSource(
        state,
        playerId,
        property.instanceId,
        property.definitionId
      ),
      effects
    );
    for (const capability of capabilities) {
      if (
        capability.selectionMode === "perCard" &&
        capability.sourceCardTypes.some((sourceCardType) =>
          definition.engine.cardTypes.includes(sourceCardType)
        )
      ) {
        options.add(capability.countedAsCardType);
      }
    }
  }
  const sortedOptions = Array.from(options).sort();
  const stateCache = cardTypeOptionsCache.get(state) ?? new Map();
  stateCache.set(cacheKey, sortedOptions);
  cardTypeOptionsCache.set(state, stateCache);
  return sortedOptions;
}

export function hasPlayerPerCardEffectiveTypeEffects(
  state: GameState,
  playerId: PlayerId
): boolean {
  const player = requirePlayer(state, playerId);
  for (const property of player.wizardProperties) {
    const propertyDefinition = state.tokenDefinitions.get(
      property.definitionId
    );
    const effects =
      propertyDefinition?.kind === "wizardProperty"
        ? propertyDefinition.engine?.effects
        : undefined;
    if (effects === undefined) continue;

    const cachedPerCardCapability = Object.isFrozen(effects)
      ? cardTypePerCardCapabilityCache.get(effects)?.get(state.runtimeMode)
      : undefined;
    if (cachedPerCardCapability !== undefined) {
      if (cachedPerCardCapability) return true;
      continue;
    }

    const capabilities = getCardTypeCapabilities(
      createWizardPropertyEffectSource(
        state,
        playerId,
        property.instanceId,
        property.definitionId
      ),
      effects
    );
    const hasPerCardCapability = capabilities.some(
      (capability) => capability.selectionMode === "perCard"
    );
    if (Object.isFrozen(effects)) {
      const cache = cardTypePerCardCapabilityCache.get(effects) ?? new Map();
      cache.set(state.runtimeMode, hasPerCardCapability);
      cardTypePerCardCapabilityCache.set(effects, cache);
    }
    if (hasPerCardCapability) {
      return true;
    }
  }
  return false;
}

export function isPlayerCardEffectiveTypeSelected(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): boolean {
  const player = requirePlayer(state, playerId);
  return player.effectiveCardTypeSelections.some(
    (selection) =>
      selection.cardInstanceId === cardInstanceId &&
      selection.cardType === cardType
  );
}

export function setPlayerCardEffectiveType(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): void {
  const player = requirePlayer(state, playerId);
  const card = getPhysicalCardLedger(state).findPlayerCard(
    playerId,
    cardInstanceId,
    "effectiveTypeSelection"
  );
  if (card === undefined || card.ownerId !== playerId) {
    throw new Error(
      `Card ${cardInstanceId} is not owned by player ${playerId}`
    );
  }

  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${card.definitionId}`);
  }
  if (!getCardEffectiveTypeOptions(state, playerId, card).includes(cardType)) {
    throw new Error(
      `Player ${playerId} has no wizard property that counts ${cardInstanceId} as ${cardType}`
    );
  }
  if (
    !player.effectiveCardTypeSelections.some(
      (selection) =>
        selection.cardInstanceId === cardInstanceId &&
        selection.cardType === cardType
    )
  ) {
    player.effectiveCardTypeSelections.push({ cardInstanceId, cardType });
  }
}

export function clearPlayerCardEffectiveType(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstance["instanceId"],
  cardType: string
): void {
  const player = requirePlayer(state, playerId);
  const card = getPhysicalCardLedger(state).findPlayerCard(
    playerId,
    cardInstanceId,
    "effectiveTypeSelection"
  );
  if (card === undefined || card.ownerId !== playerId) {
    throw new Error(
      `Card ${cardInstanceId} is not owned by player ${playerId}`
    );
  }
  player.effectiveCardTypeSelections =
    player.effectiveCardTypeSelections.filter(
      (selection) =>
        selection.cardInstanceId !== cardInstanceId ||
        selection.cardType !== cardType
    );
}

function requirePlayer(state: GameState, playerId: PlayerId) {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }
  return player;
}

function createWizardPropertyEffectSource(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: TokenDefinition["tokenId"]
): EffectSourceContext {
  return {
    sourceType: "wizardProperty",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId: tokenInstanceId,
    definitionId: tokenDefinitionId,
    tokenInstanceId,
    tokenDefinitionId,
  };
}

function wizardPropertyCountsDefinitionAsType(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: TokenDefinition["tokenId"],
  definition: CardDefinition,
  cardType: string
): CardTypeCapabilityMode | undefined {
  const propertyDefinition = state.tokenDefinitions.get(tokenDefinitionId);
  const effects =
    propertyDefinition?.kind === "wizardProperty"
      ? propertyDefinition.engine?.effects
      : undefined;
  if (effects === undefined) return undefined;

  const source = createWizardPropertyEffectSource(
    state,
    playerId,
    tokenInstanceId,
    tokenDefinitionId
  );
  for (const capability of getCardTypeCapabilities(source, effects)) {
    if (
      capability.countedAsCardType === cardType &&
      capability.sourceCardTypes.some((sourceCardType) =>
        definition.engine.cardTypes.includes(sourceCardType)
      )
    ) {
      return capability.selectionMode ?? "always";
    }
  }
  return undefined;
}

function getCardTypeCapabilities(
  source: EffectSourceContext,
  effects: readonly RuntimeEffect[]
): readonly OwnedCardsCountAsCardTypeRuntimeEffect[] {
  const cacheable = Object.isFrozen(effects);
  const cached = cacheable
    ? cardTypeCapabilitiesCache.get(effects)?.get(source.runtimeMode)
    : undefined;
  if (cached !== undefined) return cached;

  const capabilities: OwnedCardsCountAsCardTypeRuntimeEffect[] = [];
  for (const effect of effects) {
    if (!isOwnedCardsCountAsCardTypeRuntimeEffect(effect)) continue;
    const resolvedEffect = resolveCardTypeEffect(effect, source);
    if (resolvedEffect.status === "error") {
      throw new Error(resolvedEffect.error);
    }
    capabilities.push(resolvedEffect.effect);
  }

  if (cacheable) {
    const cache = cardTypeCapabilitiesCache.get(effects) ?? new Map();
    cache.set(source.runtimeMode, capabilities);
    cardTypeCapabilitiesCache.set(effects, cache);
  }
  return capabilities;
}

function resolveCardTypeEffect(
  effect: RuntimeEffectForId<"owned_cards_count_as_card_type">,
  source: EffectSourceContext
): CardTypeEffectResolution {
  const cacheable =
    Object.isFrozen(effect) && Object.isFrozen(effect.sourceCardTypes);
  const cached = cacheable
    ? cardTypeEffectResolutionCache.get(effect)?.get(source.runtimeMode)
    : undefined;
  if (cached !== undefined) return cached;

  const result = evaluateRuntimeEffectAtTiming(
    requireVerifiedRuntimeEffect(effect),
    source,
    "whileControlled",
    (decoded) => {
      if (decoded.effectId !== "owned_cards_count_as_card_type") {
        return { status: "notApplicable" };
      }
      return {
        status: "resolved",
        result: decoded,
      };
    }
  );
  const resolved: CardTypeEffectResolution =
    result.status === "resolved"
      ? { status: "resolved", effect: result.result }
      : {
          status: "error",
          error:
            result.status === "error"
              ? result.error
              : "owned_cards_count_as_card_type is not applicable",
        };
  if (cacheable) {
    const cache = cardTypeEffectResolutionCache.get(effect) ?? new Map();
    cache.set(source.runtimeMode, resolved);
    cardTypeEffectResolutionCache.set(effect, cache);
  }
  return resolved;
}
