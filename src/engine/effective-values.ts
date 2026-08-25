import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  TokenInstance,
} from "./setup.js";
import {
  buildControlledObjectView,
  listPlayerPlayedThisTurnCards,
  listOwnedScoringCards,
  type ControlledCardObject,
  type ControlledObjectView,
} from "./control-ledger.js";
import {
  type EffectiveValueKind,
  type EffectiveValueModifierEffect,
  type EffectiveValueModifierSource,
  isEffectiveValueModifierEffect,
} from "./effective-value-catalog.js";
import {
  isRuntimeEffectTarget,
  type RuntimeEffect,
  type RuntimeEffectTarget,
} from "./runtime-effect.js";
import {
  requireVerifiedRuntimeEffect,
  type VerifiedRuntimeEffect,
} from "./runtime-effect-verification.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import { isOwnedCardsCountAsCardTypeRuntimeEffect } from "./effect-runtime-card-type.js";

type EffectiveValueTarget =
  | {
      targetType: "card";
      definitionId: CardDefinition["cardId"];
    }
  | {
      targetType: "token";
      definitionId: TokenDefinition["tokenId"];
    }
  | {
      targetType: "player";
    };

type EffectiveValueSource = EffectiveValueModifierSource;

export type CardTypeMatcher = (
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  cardType: string,
  card?: CardInstance
) => boolean;

const playerCardTypeMatcher: CardTypeMatcher = cardMatchesTypeForPlayer;

const matchesDeclaredCardType: CardTypeMatcher = (
  _state,
  _playerId,
  definition,
  cardType
) =>
  definition.engine.cardTypes.includes(cardType) ||
  definition.engine.tags?.includes("counts_as_every_card_type") === true;

const effectiveValueEffectCache = new WeakMap<
  object,
  readonly (VerifiedRuntimeEffect & EffectiveValueModifierEffect)[]
>();
const knownCardTypesCache = new WeakMap<object, readonly string[]>();

interface EffectiveValueModifierEvaluationContext {
  readonly timing: "whileControlled" | "whileScoring";
  readonly valueKind: EffectiveValueKind;
  readonly targetMatches: (effect: EffectiveValueModifierEffect) => boolean;
  readonly countOwnedScoringCards: (
    countedCardTypes: readonly string[]
  ) => number;
  readonly hasStatus: (statusId: "dingler") => boolean;
}

type EffectiveValueModifierApplicationResult =
  | { readonly status: "notApplicable" }
  | { readonly status: "resolved"; readonly value: number };

function applyEffectiveValueModifier(
  effect: EffectiveValueModifierEffect,
  context: EffectiveValueModifierEvaluationContext,
  value: number
): EffectiveValueModifierApplicationResult {
  if (
    effect.timing !== context.timing ||
    effect.valueKind !== context.valueKind ||
    (effect.requiresStatus !== undefined &&
      !context.hasStatus(effect.requiresStatus)) ||
    !context.targetMatches(effect)
  ) {
    return { status: "notApplicable" };
  }

  if (effect.operation === "invertNegative") {
    return {
      status: "resolved",
      value: value < 0 ? Math.abs(value) : value,
    };
  }

  if (effect.operation === "multiply") {
    const multiplier = effect.multiplier;
    if (multiplier === undefined) {
      throw new Error(`${effect.effectId}.multiplier must be a safe integer`);
    }
    const multipliedValue = value * multiplier;
    if (!Number.isSafeInteger(multipliedValue)) {
      throw new Error(`${effect.effectId} result must be a safe integer`);
    }
    return { status: "resolved", value: multipliedValue };
  }

  const amount =
    effect.amount ??
    (effect.amountPerOwnedCard === undefined
      ? undefined
      : effect.amountPerOwnedCard *
        context.countOwnedScoringCards(effect.countedCardTypes ?? []));
  if (amount === undefined || !Number.isSafeInteger(amount)) {
    throw new Error(`${effect.effectId}.amount must be a safe integer`);
  }

  return { status: "resolved", value: value + amount };
}

export function calculateEffectiveCardCost(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card?: CardInstance,
  cardTypeMatcher: CardTypeMatcher = matchesDeclaredCardType
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "cardCost",
    target: {
      targetType: "card",
      definitionId: definition.cardId,
    },
    baseValue: definition.engine.cost,
    ...(card === undefined ? {} : { scoredCard: card }),
    cardTypeMatcher,
  });
}

export function calculateEffectiveCardVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card: CardInstance | undefined,
  cardTypeMatcher: CardTypeMatcher = matchesDeclaredCardType
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "cardVictoryPoints",
    target: {
      targetType: "card",
      definitionId: definition.cardId,
    },
    baseValue: definition.engine.victoryPoints,
    scoringCards: getOwnedScoringCards(state, playerId),
    ...(card === undefined ? {} : { scoredCard: card }),
    cardTypeMatcher,
  });
}

export function calculateEffectiveTokenVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition,
  cardTypeMatcher: CardTypeMatcher = matchesDeclaredCardType
): number {
  if (definition.kind !== "deadWizardToken") {
    throw new Error(`Token ${definition.tokenId} does not have victory points`);
  }

  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "tokenVictoryPoints",
    target: {
      targetType: "token",
      definitionId: definition.tokenId,
    },
    baseValue: getDeclaredDeadWizardTokenVictoryPoints(definition),
    scoringCards: getOwnedScoringCards(state, playerId),
    cardTypeMatcher,
  });
}

function getDeclaredDeadWizardTokenVictoryPoints(
  definition: Extract<TokenDefinition, { kind: "deadWizardToken" }>
): number {
  const declaredEffects = definition.effects
    .map(requireVerifiedRuntimeEffect)
    .filter(isEndgameFixedTokenVictoryPointsEffect);
  if (declaredEffects.length === 0) {
    return definition.victoryPoints;
  }
  if (declaredEffects.length !== 1) {
    throw new Error(
      `Dead wizard token ${definition.tokenId} must declare at most one fixed scoring effect`
    );
  }
  const declaredVictoryPoints = declaredEffects[0]!.victoryPoints;
  if (declaredVictoryPoints !== definition.victoryPoints) {
    throw new Error(
      `Dead wizard token ${definition.tokenId} fixed scoring effect must match victoryPoints`
    );
  }
  return declaredVictoryPoints;
}

function isEndgameFixedTokenVictoryPointsEffect(
  effect: VerifiedRuntimeEffect
): effect is VerifiedRuntimeEffect &
  RuntimeEffectForId<"endgame_fixed_token_victory_points"> {
  return (
    effect.effectId === "endgame_fixed_token_victory_points" &&
    effect.timing === "scoring"
  );
}

export function calculateEffectivePlayerVictoryPoints(
  state: GameState,
  playerId: PlayerId,
  baseValue: number,
  cardTypeMatcher: CardTypeMatcher = matchesDeclaredCardType
): number {
  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "playerVictoryPoints",
    target: {
      targetType: "player",
    },
    baseValue,
    scoringCards: getOwnedScoringCards(state, playerId),
    cardTypeMatcher,
  });
}

export function calculateEffectivePlayerMaxLife(
  state: GameState,
  playerId: PlayerId,
  cardTypeMatcher: CardTypeMatcher = matchesDeclaredCardType
): number {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return calculateEffectiveValue({
    state,
    playerId,
    valueKind: "playerMaxLife",
    target: {
      targetType: "player",
    },
    baseValue: player.life.max,
    cardTypeMatcher,
  });
}

export function calculateEffectiveCardCostForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card?: CardInstance
): number {
  return calculateEffectiveCardCost(
    state,
    playerId,
    definition,
    card,
    playerCardTypeMatcher
  );
}

export function calculateEffectiveCardVictoryPointsForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: CardDefinition,
  card: CardInstance | undefined
): number {
  return calculateEffectiveCardVictoryPoints(
    state,
    playerId,
    definition,
    card,
    playerCardTypeMatcher
  );
}

export function calculateEffectiveTokenVictoryPointsForPlayer(
  state: GameState,
  playerId: PlayerId,
  definition: TokenDefinition
): number {
  return calculateEffectiveTokenVictoryPoints(
    state,
    playerId,
    definition,
    playerCardTypeMatcher
  );
}

export function calculateEffectivePlayerVictoryPointsForPlayer(
  state: GameState,
  playerId: PlayerId,
  baseValue: number
): number {
  return calculateEffectivePlayerVictoryPoints(
    state,
    playerId,
    baseValue,
    playerCardTypeMatcher
  );
}

export function calculateEffectivePlayerMaxLifeForPlayer(
  state: GameState,
  playerId: PlayerId
): number {
  return calculateEffectivePlayerMaxLife(
    state,
    playerId,
    playerCardTypeMatcher
  );
}

function calculateEffectiveValue(options: {
  state: GameState;
  playerId: PlayerId;
  valueKind: EffectiveValueKind;
  target: EffectiveValueTarget;
  baseValue: number;
  scoringCards?: readonly ControlledCardObject[];
  scoredCard?: CardInstance;
  cardTypeMatcher: CardTypeMatcher;
}): number {
  let value = options.baseValue;
  const view = buildControlledObjectView(options.state, options.playerId);
  let scoringCardTypeIndex:
    | ReadonlyMap<string, ReadonlySet<ControlledCardObject>>
    | undefined;
  const getScoringCardTypeIndex = () => {
    if (scoringCardTypeIndex === undefined) {
      const scoringCards =
        options.scoringCards ??
        getOwnedScoringCards(options.state, options.playerId);
      scoringCardTypeIndex = buildScoringCardTypeIndex(
        options.state,
        options.playerId,
        scoringCards,
        options.cardTypeMatcher
      );
    }
    return scoringCardTypeIndex;
  };

  for (const { effect, source, timing } of [
    ...getControlledObjectEffects(options.state, options.playerId, view),
    ...getScoringCardEffects(
      options.state,
      options.playerId,
      options.scoringCards ?? []
    ),
  ]) {
    const applied = applyEffectiveValueModifier(
      effect,
      {
        timing,
        valueKind: options.valueKind,
        targetMatches: (modifier) => {
          if (
            !matchesTarget(
              options.state,
              options.playerId,
              modifier.target,
              options.target,
              options.scoredCard,
              options.cardTypeMatcher
            )
          ) {
            return false;
          }
          if (
            options.target.targetType !== "card" ||
            options.scoredCard === undefined ||
            modifier.timing !== "whileScoring" ||
            !isSelfScoringCardEffectTarget(modifier.target, source.definitionId)
          ) {
            return true;
          }
          return source.cardInstanceId === options.scoredCard.instanceId;
        },
        countOwnedScoringCards: (countedCardTypes) =>
          countOwnedScoringCards(getScoringCardTypeIndex(), countedCardTypes),
        hasStatus: (statusId) =>
          view.statuses.some((status) => status.statusId === statusId),
      },
      value
    );
    if (applied.status === "resolved") {
      value = applied.value;
    }
  }

  if (
    options.valueKind === "cardVictoryPoints" &&
    options.target.targetType === "card" &&
    stateHasPositiveLimpWandScoring(
      options.state,
      options.target.definitionId,
      options.scoringCards ??
        getOwnedScoringCards(options.state, options.playerId)
    )
  ) {
    value = Math.abs(value);
  }

  return value;
}

function stateHasPositiveLimpWandScoring(
  state: GameState,
  scoredDefinitionId: CardDefinition["cardId"],
  scoringCards: readonly ControlledCardObject[]
): boolean {
  if (
    state.cardDefinitions.get(scoredDefinitionId)?.engine.cardKind !==
    "limpWand"
  ) {
    return false;
  }

  return scoringCards.some((object) =>
    object.definition.engine.effects.some((effect) => {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      return (
        verifiedEffect.effectId === "endgame_limp_wands_score_positive" &&
        verifiedEffect.timing === "scoring" &&
        verifiedEffect.scoreMode === "absolutePositiveVictoryPoints" &&
        verifiedEffect.appliesToOwnedCardKind === "limpWand"
      );
    })
  );
}

export function getOwnedScoringCards(
  state: GameState,
  playerId: PlayerId
): ControlledCardObject[] {
  return listOwnedScoringCards(state, playerId);
}

interface EffectiveValueEffect {
  readonly effect: VerifiedRuntimeEffect & EffectiveValueModifierEffect;
  readonly source: EffectiveValueSource;
  readonly timing: "whileControlled" | "whileScoring";
}

function getControlledObjectEffects(
  state: GameState,
  playerId: PlayerId,
  view: ControlledObjectView
): EffectiveValueEffect[] {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }
  const playedThisTurnCards = listPlayerPlayedThisTurnCards(player);
  const playedThisTurnIds = new Set(
    playedThisTurnCards.map((card) => card.instanceId)
  );

  return [
    ...playedThisTurnCards.flatMap((card) => {
      const definition = mustGetCardDefinition(state, card.definitionId);
      return toEffectiveValueEffects(
        definition.engine.effects,
        cardEffectSource(state, playerId, card.instanceId, definition.cardId)
      );
    }),
    ...view.cards
      .filter((object) => !playedThisTurnIds.has(object.card.instanceId))
      .flatMap((object) =>
        toEffectiveValueEffects(
          object.definition.engine.effects,
          cardEffectSource(
            state,
            playerId,
            object.card.instanceId,
            object.definition.cardId
          )
        )
      ),
    ...view.tokens.flatMap((object) => {
      const effects =
        object.definition.kind === "deadWizardToken"
          ? object.definition.effects
          : (object.definition.engine?.effects ?? []);
      return toEffectiveValueEffects(
        effects,
        deadWizardTokenEffectSource(
          state,
          playerId,
          object.token.instanceId,
          object.definition.tokenId
        )
      );
    }),
    ...view.wizardProperties.flatMap((object) =>
      toEffectiveValueEffects(
        getWizardPropertyEffects(object.definition),
        wizardPropertyEffectSource(
          state,
          playerId,
          object.token.instanceId,
          object.definition.tokenId
        )
      )
    ),
    ...view.statuses.flatMap((status) =>
      toEffectiveValueEffects(
        status.effects,
        cardEffectSource(state, playerId, status.instanceId, status.statusId)
      )
    ),
    ...view.trophyLikeObjects.flatMap((trophy) =>
      toEffectiveValueEffects(
        trophy.effects,
        cardEffectSource(state, playerId, trophy.instanceId, trophy.trophyId)
      )
    ),
  ];
}

function getScoringCardEffects(
  state: GameState,
  playerId: PlayerId,
  scoringCards: readonly ControlledCardObject[]
): EffectiveValueEffect[] {
  return scoringCards.flatMap((object) => {
    return toEffectiveValueEffects(
      object.definition.engine.effects,
      cardEffectSource(
        state,
        playerId,
        object.card.instanceId,
        object.definition.cardId
      ),
      "whileScoring"
    );
  });
}

function toEffectiveValueEffects(
  effects: readonly RuntimeEffect[],
  source: EffectiveValueSource,
  timing: "whileControlled" | "whileScoring" = "whileControlled"
): EffectiveValueEffect[] {
  let effectiveEffects = effectiveValueEffectCache.get(effects);
  if (effectiveEffects === undefined) {
    effectiveEffects = effects.flatMap((effect) => {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      return isEffectiveValueModifierEffect(verifiedEffect)
        ? [verifiedEffect]
        : [];
    });
    if (Object.isFrozen(effects)) {
      effectiveValueEffectCache.set(effects, effectiveEffects);
    }
  }

  return effectiveEffects.map((effect) => ({ effect, source, timing }));
}

function cardEffectSource(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: string,
  definitionId: string
): EffectiveValueSource {
  return {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId,
    definitionId,
  };
}

function wizardPropertyEffectSource(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: string
): EffectiveValueSource {
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

function deadWizardTokenEffectSource(
  state: GameState,
  playerId: PlayerId,
  tokenInstanceId: TokenInstance["instanceId"],
  tokenDefinitionId: string
): EffectiveValueSource {
  return {
    sourceType: "deadWizardToken",
    runtimeMode: state.runtimeMode,
    playerId,
    cardInstanceId: tokenInstanceId,
    definitionId: tokenDefinitionId,
    tokenInstanceId,
    tokenDefinitionId,
  };
}

function isSelfScoringCardEffectTarget(
  effectTarget: RuntimeEffectTarget | undefined,
  sourceDefinitionId: string
): boolean {
  return (
    effectTarget !== undefined &&
    "targetType" in effectTarget &&
    effectTarget.targetType === "card" &&
    effectTarget.definitionId === sourceDefinitionId
  );
}

function getWizardPropertyEffects(
  definition: TokenDefinition
): RuntimeEffect[] {
  if (definition.kind !== "wizardProperty" || definition.engine === undefined) {
    return [];
  }

  if (!definition.engine.playableInV0) {
    const hasExecutableEffect = definition.engine.effects.some(
      (effect) => !isOwnedCardsCountAsCardTypeRuntimeEffect(effect)
    );
    if (hasExecutableEffect) {
      throw new Error(
        `Cannot execute non-playable wizard property ${definition.tokenId}`
      );
    }
    return [];
  }

  return definition.engine.effects;
}

function buildScoringCardTypeIndex(
  state: GameState,
  playerId: PlayerId,
  scoringCards: readonly ControlledCardObject[],
  cardTypeMatcher: CardTypeMatcher
): ReadonlyMap<string, ReadonlySet<ControlledCardObject>> {
  const index = new Map<string, Set<ControlledCardObject>>();
  const knownCardTypes = getKnownCardTypes(state);

  for (const object of scoringCards) {
    const declaredCardTypes = object.definition.engine.cardTypes;
    const isEveryCardType =
      object.definition.engine.tags?.includes("counts_as_every_card_type") ===
      true;
    for (const cardType of isEveryCardType
      ? knownCardTypes
      : declaredCardTypes) {
      addScoringCardType(index, cardType, object);
    }

    if (isEveryCardType || cardTypeMatcher === matchesDeclaredCardType) {
      continue;
    }

    for (const cardType of knownCardTypes) {
      if (declaredCardTypes.includes(cardType)) continue;
      if (
        cardTypeMatcher(
          state,
          playerId,
          object.definition,
          cardType,
          object.card
        )
      ) {
        addScoringCardType(index, cardType, object);
      }
    }
  }
  return index;
}

function getKnownCardTypes(state: GameState): readonly string[] {
  const cached = knownCardTypesCache.get(state.cardDefinitions);
  if (cached !== undefined) return cached;

  const knownCardTypes = new Set<string>(["legend"]);
  for (const definition of state.cardDefinitions.values()) {
    for (const cardType of definition.engine.cardTypes) {
      knownCardTypes.add(cardType);
    }
  }
  const result = Array.from(knownCardTypes);
  knownCardTypesCache.set(state.cardDefinitions, result);
  return result;
}

function addScoringCardType(
  index: Map<string, Set<ControlledCardObject>>,
  cardType: string,
  object: ControlledCardObject
): void {
  const cards = index.get(cardType) ?? new Set<ControlledCardObject>();
  cards.add(object);
  index.set(cardType, cards);
}

function countOwnedScoringCards(
  index: ReadonlyMap<string, ReadonlySet<ControlledCardObject>>,
  countedCardTypes: readonly string[] | undefined
): number {
  if (!Array.isArray(countedCardTypes)) {
    return 0;
  }

  const matchingCards = new Set<ControlledCardObject>();
  for (const cardType of new Set(countedCardTypes)) {
    if (typeof cardType !== "string") {
      continue;
    }
    for (const card of index.get(cardType) ?? []) {
      matchingCards.add(card);
    }
  }
  return matchingCards.size;
}

function matchesTarget(
  state: GameState,
  playerId: PlayerId,
  effectTarget: RuntimeEffectTarget | undefined,
  target: EffectiveValueTarget,
  targetCard: CardInstance | undefined,
  cardTypeMatcher: CardTypeMatcher
): boolean {
  if (effectTarget === undefined || !isRuntimeEffectTarget(effectTarget)) {
    return false;
  }

  if (!("targetType" in effectTarget)) {
    return false;
  }

  if (target.targetType === "player") {
    return effectTarget.targetType === target.targetType;
  }

  if (effectTarget.targetType !== target.targetType) {
    return false;
  }

  if (effectTarget.definitionId === target.definitionId) {
    return true;
  }

  if (
    target.targetType === "token" &&
    effectTarget.targetType === "token" &&
    effectTarget.tokenKind === "deadWizardToken"
  ) {
    const definition = mustGetTokenDefinition(state, target.definitionId);
    return definition.kind === "deadWizardToken";
  }

  if (
    target.targetType === "card" &&
    effectTarget.targetType === "card" &&
    Array.isArray(effectTarget.cardTypes)
  ) {
    const definition = mustGetCardDefinition(state, target.definitionId);
    return effectTarget.cardTypes.some((cardType) => {
      return (
        typeof cardType === "string" &&
        cardTypeMatcher(state, playerId, definition, cardType, targetCard)
      );
    });
  }

  return false;
}

function mustGetCardDefinition(
  state: GameState,
  definitionId: string
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }

  return definition;
}

function mustGetTokenDefinition(
  state: GameState,
  definitionId: string
): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }

  return definition;
}
