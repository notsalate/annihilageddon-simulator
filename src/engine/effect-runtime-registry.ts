import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  type DefenseAttackContext,
  type DefenseWindowResolutionResult,
  type DamageApplicationResult,
  type PlayerControlledAttackIntent,
} from "./attack-resolution.js";
export { createAttackDefenseUsage } from "./attack-resolution.js";
export type {
  AttackAmountComponents,
  AttackDefenseUsage,
  DamageApplicationResult,
  AttackIntent,
  AttackResolution,
  AttackTargetResolutionResult,
  DefenseAttackContext,
  DefenseWindowResolutionResult,
} from "./attack-resolution.js";
import {
  type CardDefinitionId,
  type TokenDefinitionId,
  type TokenInstanceId,
} from "../domain/types.js";
import {
  buildControlledObjectView,
  findCardLocation,
  getControlledOngoingCards,
  removeDeadWizardToken,
} from "./control-ledger.js";
import {
  calculateEffectiveCardCost as calculateEffectiveCardCostCore,
  calculateEffectivePlayerMaxLife as calculateEffectivePlayerMaxLifeCore,
} from "./effective-values.js";
import { cardMatchesTypeForPlayer } from "./card-type-runtime.js";
import {
  getControlledDeadWizardTokenCount,
  getControlledDeadWizardTokenLikeCards,
  getDeadWizardTokenChoiceId,
  getDeadWizardTokenLikeCardChoiceId,
} from "./dead-wizard-token-like.js";
import {
  allEffectRuntimeModes,
  fixtureEffectTimings,
  immediateEffectTimings,
} from "./effect-runtime-catalog-shared.js";
export {
  effectRuntimeModes,
  effectRuntimeSourceKinds,
} from "./effect-runtime-catalog-shared.js";
export type {
  EffectRuntimeMode,
  EffectRuntimeSourceKind,
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import { createResourceDrawEffectDefinitions } from "./effect-runtime-resources-draw.js";
import type { ResourceDrawEffectPayloadMap } from "./effect-runtime-resources-draw.js";
import { createActivationEffectDefinitions } from "./effect-runtime-activation.js";
import {
  createCardOwnershipChoiceEffectDefinitions,
  type CardOwnershipChoiceEffectId,
} from "./effect-runtime-cards-ownership-choice.js";
import {
  createEffectiveValueModifierEffectDefinitions,
  type EffectiveValueModifierId,
} from "./effect-runtime-effective-value-modifier.js";
import {
  createCardTypeEffectDefinitions,
  type CardTypeEffectId,
  type CardTypeEffectPayloadMap,
} from "./effect-runtime-card-type.js";
import {
  createDeadWizardTokenEffectDefinitions,
  type DeadWizardTokenEffectId,
  type DeadWizardTokenEffectPayloadMap,
} from "./effect-runtime-dead-wizard-token.js";
import {
  createControlledPowerEffectDefinitions,
  createOngoingEffectDefinitions,
} from "./effect-runtime-ongoing.js";
import { createCombatAttackEffectDefinitions } from "./effect-runtime-combat-attack.js";
import { createCombatDefenseEffectDefinitions } from "./effect-runtime-combat-defense.js";
import { createCombatReplacementEffectDefinitions } from "./effect-runtime-combat-replacement.js";
import { createMayhemEffectDefinitions } from "./effect-runtime-mayhem.js";
import { createSetupEffectDefinitions } from "./effect-runtime-setup.js";
import { createWildMagicEffectDefinitions } from "./effect-runtime-wild-magic.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import { createUnsupportedEffectHandler } from "./effect-runtime-family-support.js";
import {
  requireVerifiedRuntimeEffect,
  type VerifiedRuntimeEffect,
  type VerifiedRuntimeEffectForId,
} from "./runtime-effect-verification.js";
import { recordGameEvent, recordTurnPowerChanged } from "./event-recorder.js";
import {
  isRuntimeEffectId,
  type EffectTiming,
  type RuntimeEffect,
  type RuntimeEffectForId,
  type RuntimeEffectId,
  type RuntimeEffectPayload,
  type SetupEffectPayloadMap,
  type ImmediateEffectPayloadMap,
  type ActivationEffectPayloadMap,
  type OngoingEffectPayloadMap,
  type WildMagicOption,
} from "./runtime-effect.js";
import {
  decodeRuntimeEffectForId,
  type DecodeResult,
  type RuntimeEffectDecoder,
} from "./runtime-effect-decoder.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  TokenInstance,
} from "./setup.js";

import type {
  EffectRuntimeMode,
  EffectRuntimeSourceKind,
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
type EffectRuntimeSourceTimingPolicy = {
  readonly sourceKind: EffectRuntimeSourceKind;
  readonly timings: EffectRuntimeSupportedTimings;
};

export interface EffectSourceContext {
  sourceType: EffectRuntimeSourceKind;
  runtimeMode: EffectRuntimeMode;
  playerId: PlayerState["playerId"];
  currentAttackerPlayerId?: PlayerState["playerId"];
  cardInstanceId: string;
  definitionId: string;
  tokenInstanceId?: TokenInstance["instanceId"];
  tokenDefinitionId?: TokenDefinition["tokenId"];
  deadWizardTokenDeathKillerPlayerId?: PlayerState["playerId"];
}

export interface AttackReplacementProfile {
  readonly doublesOwnedAttackDamage: boolean;
  readonly damageBonus: number;
  readonly controlledCardDamageBonus: number;
  readonly deadWizardTokenDamageBonus: number;
  readonly unavoidable: boolean;
}

export interface PlayerDefeatGameEnd {
  reason: "playerDefeated";
  winnerPlayerId: PlayerState["playerId"];
}

export type EffectGameEnd = PlayerDefeatGameEnd;

export type EffectExecutionResult =
  | {
      ok: true;
      gameEnd?: EffectGameEnd;
    }
  | {
      ok: false;
      error: string;
    };

export interface MayhemAttackPlanTarget {
  targetPlayer: PlayerState;
  amount: number;
}

export type MayhemAttackImpact =
  | { kind: "damage" }
  | {
      kind: "effect";
      executeOnHit(targetPlayer: PlayerState): EffectExecutionResult;
    };

export type SetupDirective = {
  kind: "forceStartingPlayer" | "retainAndChooseThirdFamiliar";
  playerId: PlayerState["playerId"];
};

export type SetupPoolRequirement = {
  readonly kind: "additionalFamiliarCandidates";
  readonly amount: number;
};

export type SetupEffectExecutionResult =
  | { status: "executed"; directive?: SetupDirective }
  | { status: "error"; error: string };

type SetupEffectHandlerResult =
  | { ok: true; directive?: SetupDirective }
  | { ok: false; error: string };

export interface SetupEffectSourceContext {
  sourceType: "wizardProperty";
  runtimeMode: EffectRuntimeMode;
  playerId: PlayerState["playerId"];
  tokenInstanceId: TokenInstanceId;
  tokenDefinitionId: TokenDefinitionId;
}

export interface EffectRuntimeSetupServices {
  hasCardDefinition(definitionId: CardDefinitionId): boolean;
  createCardInstance(
    definitionId: CardDefinitionId,
    ownerId: PlayerState["playerId"]
  ): CardInstance;
  allowsMissingData: boolean;
}

export type TargetChoice =
  | {
      choiceType: "card";
      card: CardInstance;
    }
  | {
      choiceType: "player";
      player: PlayerState;
    };

interface EffectChoiceOption {
  choiceKind: "option";
  choiceId: string;
}

interface EffectChoicePlayerTarget {
  choiceKind: "playerTarget";
  choiceId: string;
  players: readonly PlayerState[];
}

interface EffectChoiceCardTarget {
  choiceKind: "cardTarget";
  choiceId: string;
  cards: readonly CardInstance[];
  amount: number;
}

interface EffectChoiceDefense {
  choiceKind: "defense";
  choiceId: string;
  card: CardInstance | undefined;
}

interface EffectChoiceDirectionalPlayerTarget {
  choiceKind: "directionalPlayerTarget";
  choiceId: string;
  direction: "left" | "right";
  players: readonly PlayerState[];
}

export type EffectChoice =
  | EffectChoiceOption
  | EffectChoicePlayerTarget
  | EffectChoiceCardTarget
  | EffectChoiceDefense
  | EffectChoiceDirectionalPlayerTarget;

export type EffectChoiceResolution =
  | { status: "selected"; choice: EffectChoice }
  | { status: "empty" };

export type TargetChoiceResult =
  | {
      ok: true;
      choice: TargetChoice | undefined;
    }
  | {
      ok: false;
      error: string;
    };

export interface DamageResult {
  damageDealt: number;
  killed: boolean;
}

export type DamageCause =
  | { kind: "playerControlled"; player: PlayerState }
  | { kind: "ownerless" };

export interface EffectRuntimeServices {
  resolveTargetChoice(
    state: GameState,
    player: PlayerState,
    effect: RuntimeEffectPayload,
    source: EffectSourceContext
  ): TargetChoiceResult;
  requireCardChoice(
    choice: TargetChoice,
    effectId: RuntimeEffectId
  ): { ok: true; card: CardInstance } | { ok: false; error: string };
  moveGainedCardToPlayerDestination(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
    fixedDestination?: "discard"
  ):
    | { ok: true; destination: "discard" | "deckTop" | "hand" }
    | { ok: false; error: string };
  moveCardToPlayerZone(
    state: GameState,
    card: CardInstance,
    player: PlayerState,
    destination: CardInstance[],
    destinationZone: string,
    effectId: RuntimeEffectId,
    source: EffectSourceContext,
    placeOnTop?: boolean
  ): boolean;
  moveCardToZonePreservingOwner(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
    destination: CardInstance[],
    destinationZone: string,
    effectId: RuntimeEffectId,
    source: EffectSourceContext,
    placeOnTop?: boolean
  ): boolean;
  discardTopDeckCards(
    state: GameState,
    player: PlayerState,
    count: number
  ): CardInstance[];
  getDestroyDestination(
    state: GameState,
    card: CardInstance
  ):
    | { ok: true; zone: CardInstance[]; zoneName: string }
    | { ok: false; error: string };
  getOpponentsInSeatingOrder(
    state: GameState,
    player: PlayerState
  ): PlayerState[];
  getPlayersInActiveOrder(state: GameState): PlayerState[];
  prepareEffectChoice(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    effectId: RuntimeEffectId,
    choices: readonly EffectChoice[]
  ): EffectChoiceResolution;
  recordEffectChoiceSelected(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    effectId: RuntimeEffectId,
    choices: readonly EffectChoice[],
    choice: EffectChoice
  ): void;
  chooseEffectChoice(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    effectId: RuntimeEffectId,
    choices: readonly EffectChoice[]
  ): EffectChoice | undefined;
  dealDamage(
    state: GameState,
    sourcePlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext,
    cause: DamageCause
  ): DamageApplicationResult;
  healPlayer(
    state: GameState,
    sourcePlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): void;
  setPlayerLife(
    state: GameState,
    player: PlayerState,
    lifeTotal: number
  ): { lifeAfter: number; lifeBefore: number };
  exchangePlayerLifeTotals(
    state: GameState,
    player: PlayerState,
    targetPlayer: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): void;
  resolveStatusTargetPlayers(
    state: GameState,
    player: PlayerState,
    effect: RuntimeEffectPayload,
    source: EffectSourceContext
  ): { ok: true; players: PlayerState[] } | { ok: false; error: string };
  gainDinglerStatus(
    state: GameState,
    player: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): EffectExecutionResult;
  removeDinglerStatus(
    state: GameState,
    player: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): EffectExecutionResult;
  hasDinglerStatus(player: PlayerState): boolean;
  gainDeadWizardToken(
    state: GameState,
    player: PlayerState
  ): EffectExecutionResult;
  transferControlledDeadWizardTokenLike(
    state: GameState,
    player: PlayerState,
    targetPlayer: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): EffectExecutionResult;
  exchangeControlledDeadWizardTokenLikes(
    state: GameState,
    player: PlayerState,
    targetPlayer: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): EffectExecutionResult;
  resolvePlayerControlledAttack(
    intent: PlayerControlledAttackIntent
  ): EffectExecutionResult;
  resolveDefenseWindow(
    state: GameState,
    defendingPlayer: PlayerState,
    attack: DefenseAttackContext
  ): DefenseWindowResolutionResult;
  resolveMayhemAttack(
    state: GameState,
    sourcePlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): EffectExecutionResult;
  resolveMayhemAttackPlan(
    state: GameState,
    sourcePlayer: PlayerState,
    targets: readonly MayhemAttackPlanTarget[],
    effectId: RuntimeEffectId,
    source: EffectSourceContext,
    impact?: MayhemAttackImpact
  ): EffectExecutionResult;
  resolvePlayerDeath(
    state: GameState,
    player: PlayerState
  ): EffectExecutionResult;
  peekTopDeckCard(
    player: PlayerState,
    state: GameState
  ): CardInstance | undefined;
  drawTopDeckCard(
    player: PlayerState,
    state: GameState
  ): CardInstance | undefined;
  playResolvedCard(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
    ownership?: {
      nonOngoingDestination?: {
        zone: "ownerDiscardAfterResolution";
        ownerId: PlayerState["playerId"];
      };
      ongoingOwnerId?: CardInstance["ownerId"];
      forceOngoingDiscard?: {
        zone: "ownerDiscardAfterResolution";
        ownerId: PlayerState["playerId"];
      };
    }
  ): EffectExecutionResult;
  isLegalWildMagicOption(
    state: GameState,
    player: PlayerState,
    option: WildMagicOption
  ): boolean;
  executeEffect(
    state: GameState,
    player: PlayerState,
    effect: VerifiedRuntimeEffect,
    source: EffectSourceContext
  ): EffectExecutionResult;
  executeMayhemEffects(
    state: GameState,
    player: PlayerState,
    definition: CardDefinition,
    source: EffectSourceContext
  ): EffectExecutionResult;
  asString(value: unknown): string;
}

export interface EffectRuntimeTimedExecutionOperationContext {
  readonly state: GameState;
  readonly player: PlayerState;
  readonly source: EffectSourceContext;
  readonly services: EffectRuntimeServices;
  readonly timing: EffectTiming;
  readonly isApplicable?: (effect: RuntimeEffectPayload) => boolean;
}

export interface EffectRuntimeOnPlayCardOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
  readonly sourceDefinition: CardDefinition;
  readonly playedCard: CardInstance;
  readonly playedDefinition: CardDefinition;
}

export interface EffectRuntimeAfterPlayerAttackDamageOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
  readonly sourceDefinition: CardDefinition;
  readonly totalDamageDealt: number;
  readonly attackSource: EffectSourceContext;
}

export interface EffectRuntimeAfterDamageDealtOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
  readonly sourceDefinition: CardDefinition;
  readonly damageDealt: number;
  readonly damageSource: EffectSourceContext;
}

export interface EffectRuntimeEndTurnDrawModifierOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
  readonly currentDrawCount: number;
}

export interface EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
}

export interface EffectRuntimeControlledPowerOperationContext {
  readonly state: GameState;
  readonly controller: PlayerState;
  readonly source: EffectSourceContext;
  readonly sourceDefinition: CardDefinition;
}

export type EffectRuntimeHandlerOperationResult<Result> =
  | { readonly status: "notApplicable" }
  | { readonly status: "resolved"; readonly result: Result };

export type EffectRuntimeOperationResult<Result> =
  | EffectRuntimeHandlerOperationResult<Result>
  | { readonly status: "error"; readonly error: string };

export interface EffectRuntimeTimedEvaluationOperationContext<
  Effect extends RuntimeEffectPayload,
  Result,
> {
  readonly source: EffectSourceContext;
  readonly timing: EffectTiming;
  readonly evaluate: (
    effect: Effect
  ) => EffectRuntimeHandlerOperationResult<Result>;
}

export interface EffectRuntimeCatalogOperationOverridesForTesting<
  Id extends RuntimeEffectId,
> {
  readonly execute?: (
    state: GameState,
    player: PlayerState,
    effect: RuntimeEffectForId<Id>,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ) => EffectExecutionResult;
  readonly executeOnPlayCard?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeOnPlayCardOperationContext
  ) => EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  readonly applyAfterPlayerAttackDamage?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeAfterPlayerAttackDamageOperationContext
  ) => EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  readonly applyAfterDamageDealt?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeAfterDamageDealtOperationContext
  ) => EffectRuntimeHandlerOperationResult<EffectExecutionResult>;
  readonly evaluateEndTurnDrawModifier?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeEndTurnDrawModifierOperationContext
  ) => EffectRuntimeHandlerOperationResult<number>;
  readonly evaluateBasicTrophyChipPayoutSuppression?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext
  ) => EffectRuntimeHandlerOperationResult<boolean>;
  readonly evaluateControlledPower?: (
    effect: RuntimeEffectForId<Id>,
    context: EffectRuntimeControlledPowerOperationContext
  ) => EffectRuntimeHandlerOperationResult<number>;
  readonly executeSetup?: (
    player: PlayerState,
    effect: RuntimeEffectForId<Id>,
    source: SetupEffectSourceContext,
    services: EffectRuntimeSetupServices
  ) => SetupEffectHandlerResult;
}

type PositiveAmountRuntimeEffect<EffectId extends RuntimeEffectId> =
  RuntimeEffectForId<EffectId> & { amount: number };

type AddPowerRuntimeEffect = PositiveAmountRuntimeEffect<"add_power">;

type EffectRuntimeSourcePolicyContext = Pick<
  EffectSourceContext,
  "sourceType" | "runtimeMode"
>;

interface EffectRuntimeEntry<
  EffectId extends RuntimeEffectId = RuntimeEffectId,
> {
  readonly effectId: EffectId;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly unsupported: boolean;
  supportsTiming(timing: EffectTiming): boolean;
  validateSourceTiming(
    subjectId: string,
    effect: RuntimeEffectForId<EffectId>,
    sourceKind: EffectRuntimeSourceKind
  ): string | undefined;
  decode(
    subjectId: string,
    rawEffect: unknown
  ): DecodeResult<RuntimeEffectForId<EffectId>>;
  executeVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult;
  evaluateAtTimingVerified<Result>(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeTimedEvaluationOperationContext<
      RuntimeEffectForId<EffectId>,
      Result
    >
  ): EffectRuntimeOperationResult<Result>;
  executeAtTimingVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeTimedExecutionOperationContext
  ): EffectRuntimeOperationResult<EffectExecutionResult>;
  executeOnPlayCardVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeOnPlayCardOperationContext
  ): EffectRuntimeOperationResult<EffectExecutionResult>;
  executeSetupVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    player: PlayerState,
    source: SetupEffectSourceContext,
    services: EffectRuntimeSetupServices
  ): SetupEffectExecutionResult;
  getSetupPoolRequirementVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>
  ): SetupPoolRequirement | undefined;
  applyAfterPlayerAttackDamageVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeAfterPlayerAttackDamageOperationContext
  ): EffectRuntimeOperationResult<EffectExecutionResult>;
  applyAfterDamageDealtVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeAfterDamageDealtOperationContext
  ): EffectRuntimeOperationResult<EffectExecutionResult>;
  evaluateEndTurnDrawModifierVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeEndTurnDrawModifierOperationContext
  ): EffectRuntimeOperationResult<number>;
  evaluateBasicTrophyChipPayoutSuppressionVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext
  ): EffectRuntimeOperationResult<boolean>;
  evaluateControlledPowerVerified(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<EffectId>,
    context: EffectRuntimeControlledPowerOperationContext
  ): EffectRuntimeOperationResult<number>;
}

const withEffectRuntimeCatalogOperationsForTestingSymbol: unique symbol =
  Symbol("withEffectRuntimeCatalogOperationsForTesting");

type TestableEffectRuntimeEntry<Id extends RuntimeEffectId> =
  EffectRuntimeEntry<Id> & {
    [withEffectRuntimeCatalogOperationsForTestingSymbol]<Result>(
      overrides: EffectRuntimeCatalogOperationOverridesForTesting<Id>,
      run: () => Result
    ): Result;
  };

interface EffectRuntimeEntryConfig<Id extends RuntimeEffectId> {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<NoInfer<Id>>>;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedSourceTimingPolicies?: readonly EffectRuntimeSourceTimingPolicy[];
}

type EffectRuntimeFamilyEntryDefinition<Id extends RuntimeEffectId> = Omit<
  EffectRuntimeEntryConfig<Id>,
  "supportedTimings"
> & {
  readonly supportedTimings: EffectRuntimeSupportedTimings;
};

type AnyEffectRuntimeFamilyEntryDefinition = {
  [Id in RuntimeEffectId]: EffectRuntimeFamilyEntryDefinition<Id>;
}[RuntimeEffectId];

type EffectRuntimeFamilyEntries<
  Definitions extends readonly AnyEffectRuntimeFamilyEntryDefinition[],
> = {
  [Definition in Definitions[number] as Definition["effectId"]]: EffectRuntimeEntry<
    Definition["effectId"]
  >;
};

function bindRuntimeEffectDecoder<Id extends RuntimeEffectId>(
  effectId: Id
): RuntimeEffectDecoder<Id> {
  return {
    effectId,
    decode(subjectId, rawEffect) {
      return decodeRuntimeEffectForId(subjectId, effectId, rawEffect);
    },
  };
}

function getUnsupportedSourceTimingError<Id extends RuntimeEffectId>(
  subjectId: string,
  effectId: Id,
  effect: RuntimeEffectForId<Id>,
  sourceKind: EffectRuntimeSourceKind,
  policies: readonly EffectRuntimeSourceTimingPolicy[] | undefined
): string | undefined {
  if (policies === undefined) {
    return undefined;
  }
  const timing = "timing" in effect ? effect.timing : undefined;
  const policy = policies.find(
    ({ sourceKind: supportedSourceKind }) => supportedSourceKind === sourceKind
  );
  if (
    policy !== undefined &&
    timing !== undefined &&
    policy.timings.includes(timing)
  ) {
    return undefined;
  }
  return `${subjectId} uses unsupported timing ${String(
    timing
  )} for source ${sourceKind} in effect ${effectId}`;
}

function defineEffectRuntimeEntry<Id extends RuntimeEffectId>(
  config: EffectRuntimeEntryConfig<Id>
): EffectRuntimeEntry<Id> {
  if (config.decoder.effectId !== config.effectId) {
    throw new Error(
      `Effect Runtime Catalog decoder mismatch for ${config.effectId}`
    );
  }
  let operationOverrides:
    | EffectRuntimeCatalogOperationOverridesForTesting<Id>
    | undefined;
  const decode = (
    subjectId: string,
    rawEffect: unknown
  ): DecodeResult<RuntimeEffectForId<Id>> => {
    const decoded = config.decoder.decode(subjectId, rawEffect);
    if (!decoded.ok) {
      return decoded;
    }
    const timing = "timing" in decoded.value ? decoded.value.timing : undefined;
    if (timing !== undefined && !config.supportedTimings.includes(timing)) {
      return {
        ok: false,
        errors: [`${subjectId} uses unsupported timing ${String(timing)}`],
      };
    }
    return decoded;
  };

  type DecodedCatalogOperation =
    | { readonly ok: true; readonly effect: RuntimeEffectForId<Id> }
    | { readonly ok: false; readonly error: string };

  const validateTypedCatalogOperation = (
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<Id>,
    source: EffectRuntimeSourcePolicyContext
  ): DecodedCatalogOperation => {
    if (!config.supportedTimings.includes(effect.timing)) {
      return {
        ok: false,
        error: `${subjectId} uses unsupported timing ${String(effect.timing)}`,
      };
    }
    if (!config.supportedSourceKinds.includes(source.sourceType)) {
      return {
        ok: false,
        error: `Effect ${config.effectId} uses unsupported source kind`,
      };
    }
    const sourceTimingError = getUnsupportedSourceTimingError(
      subjectId,
      config.effectId,
      effect,
      source.sourceType,
      config.supportedSourceTimingPolicies
    );
    if (sourceTimingError !== undefined) {
      return { ok: false, error: sourceTimingError };
    }
    if (!config.supportedModes.includes(source.runtimeMode)) {
      return {
        ok: false,
        error: `Effect ${config.effectId} is unavailable in ${source.runtimeMode} mode`,
      };
    }
    return { ok: true, effect };
  };

  const requireSupportedOperation = (
    subjectId: string,
    decoded: DecodedCatalogOperation
  ): DecodedCatalogOperation => {
    if (!decoded.ok || config.handler.unsupported !== true) {
      return decoded;
    }
    return {
      ok: false,
      error: `${subjectId} uses unsupported effect ${config.effectId}`,
    };
  };

  const evaluateAtTimingVerified = <Result>(
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<Id>,
    context: EffectRuntimeTimedEvaluationOperationContext<
      RuntimeEffectForId<Id>,
      Result
    >
  ): EffectRuntimeOperationResult<Result> => {
    const validated = validateTypedCatalogOperation(
      subjectId,
      effect,
      context.source
    );
    if (!validated.ok) {
      return { status: "error", error: validated.error };
    }
    if (validated.effect.timing !== context.timing) {
      return { status: "notApplicable" };
    }
    const supported = requireSupportedOperation(subjectId, validated);
    return supported.ok
      ? context.evaluate(supported.effect)
      : { status: "error", error: supported.error };
  };

  const executeVerified = (
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<Id>,
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult => {
    const validated = requireSupportedOperation(
      subjectId,
      validateTypedCatalogOperation(subjectId, effect, source)
    );
    const executeOperation =
      operationOverrides?.execute ?? config.handler.execute;
    return validated.ok
      ? executeOperation(state, player, validated.effect, source, services)
      : { ok: false, error: validated.error };
  };

  const executeAtTimingVerified = (
    subjectId: string,
    effect: VerifiedRuntimeEffectForId<Id>,
    context: EffectRuntimeTimedExecutionOperationContext
  ): EffectRuntimeOperationResult<EffectExecutionResult> => {
    const validated = validateTypedCatalogOperation(
      subjectId,
      effect,
      context.source
    );
    if (!validated.ok) {
      return { status: "error", error: validated.error };
    }
    if (validated.effect.timing !== context.timing) {
      return { status: "notApplicable" };
    }
    const supported = requireSupportedOperation(subjectId, validated);
    if (!supported.ok) {
      return { status: "error", error: supported.error };
    }
    if (
      context.isApplicable !== undefined &&
      !context.isApplicable(supported.effect)
    ) {
      return { status: "notApplicable" };
    }
    const executeOperation =
      operationOverrides?.execute ?? config.handler.execute;
    return {
      status: "resolved",
      result: executeOperation(
        context.state,
        context.player,
        supported.effect,
        context.source,
        context.services
      ),
    };
  };

  const entry: TestableEffectRuntimeEntry<Id> = {
    effectId: config.effectId,
    supportedModes: config.supportedModes,
    supportedSourceKinds: config.supportedSourceKinds,
    unsupported: config.handler.unsupported === true,
    supportsTiming(timing) {
      return config.supportedTimings.includes(timing);
    },
    validateSourceTiming(subjectId, effect, sourceKind) {
      return getUnsupportedSourceTimingError(
        subjectId,
        config.effectId,
        effect,
        sourceKind,
        config.supportedSourceTimingPolicies
      );
    },
    decode,
    executeVerified,
    evaluateAtTimingVerified,
    executeAtTimingVerified,
    executeOnPlayCardVerified(subjectId, effect, context) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "onPlayCard",
        evaluate(effect) {
          if (!context.sourceDefinition.engine.isOngoing) {
            return { status: "notApplicable" };
          }
          const executeOnPlayCard =
            operationOverrides?.executeOnPlayCard ??
            config.handler.executeOnPlayCard;
          return executeOnPlayCard === undefined
            ? { status: "notApplicable" }
            : executeOnPlayCard(effect, context);
        },
      });
    },
    executeSetupVerified(subjectId, effect, player, source, services) {
      const validated = requireSupportedOperation(
        subjectId,
        validateTypedCatalogOperation(subjectId, effect, source)
      );
      if (!validated.ok) {
        return { status: "error", error: validated.error };
      }
      const setup =
        operationOverrides?.executeSetup ?? config.handler.executeSetup;
      if (setup === undefined) {
        return {
          status: "error",
          error: `Setup effect executor missing for ${config.effectId}`,
        };
      }
      const result = setup(player, validated.effect, source, services);
      return result.ok
        ? {
            status: "executed",
            ...(result.directive === undefined
              ? {}
              : { directive: result.directive }),
          }
        : { status: "error", error: result.error };
    },
    getSetupPoolRequirementVerified(_subjectId, effect) {
      return config.handler.getSetupPoolRequirement?.(effect);
    },
    applyAfterPlayerAttackDamageVerified(subjectId, effect, context) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "afterFirstAttackDamageEachTurn",
        evaluate(effect) {
          if (!context.sourceDefinition.engine.isOngoing) {
            return { status: "notApplicable" };
          }
          const applyAfterPlayerAttackDamage =
            operationOverrides?.applyAfterPlayerAttackDamage ??
            config.handler.applyAfterPlayerAttackDamage;
          return applyAfterPlayerAttackDamage === undefined
            ? { status: "notApplicable" }
            : applyAfterPlayerAttackDamage(effect, context);
        },
      });
    },
    applyAfterDamageDealtVerified(subjectId, effect, context) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "afterDamageDealt",
        evaluate(effect) {
          if (!context.sourceDefinition.engine.isOngoing) {
            return { status: "notApplicable" };
          }
          const applyAfterDamageDealt =
            operationOverrides?.applyAfterDamageDealt ??
            config.handler.applyAfterDamageDealt;
          return applyAfterDamageDealt === undefined
            ? { status: "notApplicable" }
            : applyAfterDamageDealt(effect, context);
        },
      });
    },
    evaluateEndTurnDrawModifierVerified(subjectId, effect, context) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "endTurn",
        evaluate(effect) {
          const evaluateEndTurnDrawModifier =
            operationOverrides?.evaluateEndTurnDrawModifier ??
            config.handler.evaluateEndTurnDrawModifier;
          return evaluateEndTurnDrawModifier === undefined
            ? { status: "notApplicable" }
            : evaluateEndTurnDrawModifier(effect, context);
        },
      });
    },
    evaluateBasicTrophyChipPayoutSuppressionVerified(
      subjectId,
      effect,
      context
    ) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "whileControlled",
        evaluate(effect) {
          const evaluateSuppression =
            operationOverrides?.evaluateBasicTrophyChipPayoutSuppression ??
            config.handler.evaluateBasicTrophyChipPayoutSuppression;
          return evaluateSuppression === undefined
            ? { status: "notApplicable" }
            : evaluateSuppression(effect, context);
        },
      });
    },
    evaluateControlledPowerVerified(subjectId, effect, context) {
      return evaluateAtTimingVerified(subjectId, effect, {
        source: context.source,
        timing: "whileControlled",
        evaluate(effect) {
          if (!context.sourceDefinition.engine.isOngoing) {
            return { status: "notApplicable" };
          }
          const evaluateControlledPower =
            operationOverrides?.evaluateControlledPower ??
            config.handler.evaluateControlledPower;
          return evaluateControlledPower === undefined
            ? { status: "notApplicable" }
            : evaluateControlledPower(effect, context);
        },
      });
    },
    [withEffectRuntimeCatalogOperationsForTestingSymbol](overrides, run) {
      const previousOverrides = operationOverrides;
      operationOverrides = overrides;
      try {
        return run();
      } finally {
        operationOverrides = previousOverrides;
      }
    },
  };
  return entry;
}

function defineEffectRuntimeFamily<
  const Definitions extends readonly AnyEffectRuntimeFamilyEntryDefinition[],
>(
  familyId: string,
  definitions: Definitions
): EffectRuntimeFamilyEntries<Definitions> {
  const entries = new Map<RuntimeEffectId, EffectRuntimeEntry>();
  for (const definition of definitions) {
    if (entries.has(definition.effectId)) {
      throw new Error(
        `Effect Runtime family ${familyId} registers duplicate effect ID ${definition.effectId}`
      );
    }
    entries.set(definition.effectId, defineEffectRuntimeEntry(definition));
  }
  return Object.fromEntries(entries) as EffectRuntimeFamilyEntries<Definitions>;
}

export function defineEffectRuntimeFamilyForTesting<
  const Definitions extends readonly AnyEffectRuntimeFamilyEntryDefinition[],
>(familyId: string, definitions: Definitions): readonly RuntimeEffectId[] {
  defineEffectRuntimeFamily(familyId, definitions);
  return definitions.map((definition) => definition.effectId);
}

const addPowerHandler: EffectRuntimeHandler<AddPowerRuntimeEffect> = {
  effectId: "add_power",
  execute(state, player, effect, source) {
    const powerBefore = state.turn.power;
    state.turn.power += effect.amount;
    recordTurnPowerChanged(
      state,
      player,
      source,
      "add_power",
      powerBefore,
      state.turn.power
    );

    return { ok: true };
  },
};

const addPowerPerPlayerWithStatusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"add_power_per_player_with_status">
> = {
  effectId: "add_power_per_player_with_status",
  execute(state, player, effect, source, services) {
    const matchingPlayerCount = state.players.filter((candidate) =>
      services.hasDinglerStatus(candidate)
    ).length;
    const powerBefore = state.turn.power;
    state.turn.power += matchingPlayerCount * effect.amountPerPlayer;
    recordTurnPowerChanged(
      state,
      player,
      source,
      "add_power_per_player_with_status",
      powerBefore,
      state.turn.power
    );
    return { ok: true };
  },
};

const addPowerPerControlledDeadWizardTokenHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"add_power_per_controlled_dead_wizard_token">
> = {
  effectId: "add_power_per_controlled_dead_wizard_token",
  execute(state, player, effect, source) {
    const amount =
      getControlledDeadWizardTokenCount(state, player) *
      effect.amountPerDeadWizardToken;
    if (amount === 0) {
      return { ok: true };
    }

    const powerBefore = state.turn.power;
    state.turn.power += amount;
    recordTurnPowerChanged(
      state,
      player,
      source,
      effect.effectId,
      powerBefore,
      state.turn.power
    );
    return { ok: true };
  },
};

const addPowerIfNoControlledDeadWizardTokenHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"add_power_if_no_controlled_dead_wizard_token">
> = {
  effectId: "add_power_if_no_controlled_dead_wizard_token",
  execute(state, player, effect, source) {
    if (getControlledDeadWizardTokenCount(state, player) > 0) {
      return { ok: true };
    }

    const powerBefore = state.turn.power;
    state.turn.power += effect.amount;
    recordTurnPowerChanged(
      state,
      player,
      source,
      effect.effectId,
      powerBefore,
      state.turn.power
    );
    return { ok: true };
  },
};

const optionalDestroyControlledDeadWizardTokenHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"optional_destroy_controlled_dead_wizard_token">
> = {
  effectId: "optional_destroy_controlled_dead_wizard_token",
  execute(state, player, effect, source, services) {
    const cards = getControlledDeadWizardTokenLikeCards(state, player);
    const choices: EffectChoice[] = [
      { choiceKind: "option", choiceId: "decline" },
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
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    if (choice === undefined || choice.choiceId === "decline") {
      return { ok: true };
    }

    if (choice.choiceKind === "option") {
      const tokenInstanceId = choice.choiceId.startsWith("token:")
        ? choice.choiceId.slice("token:".length)
        : undefined;
      if (tokenInstanceId === undefined) {
        return { ok: false, error: "Invalid dead wizard token choice" };
      }
      const tokenBeforeRemoval = player.deadWizardTokens.find(
        (candidate) => candidate.instanceId === tokenInstanceId
      );
      if (tokenBeforeRemoval === undefined) {
        return {
          ok: false,
          error: `Dead wizard token ${tokenInstanceId} disappeared before destruction`,
        };
      }
      const token = removeDeadWizardToken(
        player,
        tokenBeforeRemoval.instanceId
      );
      if (token === undefined) {
        return {
          ok: false,
          error: `Dead wizard token ${tokenInstanceId} disappeared before destruction`,
        };
      }
      recordGameEvent(state, {
        type: "deadWizardTokenDestroyed",
        playerId: player.playerId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    if (choice.choiceKind !== "cardTarget") {
      return { ok: false, error: "Invalid dead wizard token choice kind" };
    }
    const card = cards.find(
      (candidate) => candidate.instanceId === choice.cards[0]?.instanceId
    );
    if (card === undefined) {
      return {
        ok: false,
        error:
          "Controlled dead wizard token-like card disappeared before destruction",
      };
    }
    const destination = services.getDestroyDestination(state, card);
    if (!destination.ok) return destination;
    const moved = services.moveCardToZonePreservingOwner(
      state,
      player,
      card,
      destination.zone,
      destination.zoneName,
      effect.effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot destroy controlled dead wizard token-like card ${card.instanceId}`,
      };
    }
    recordGameEvent(state, {
      type: "effectCardDestroyed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: effect.effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const dealDamageHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"deal_damage">
> = {
  effectId: "deal_damage",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
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

    const damageResult = services.dealDamage(
      state,
      player,
      targetResult.choice.player,
      effect.amount,
      effect.effectId,
      source,
      { kind: "playerControlled", player }
    );
    if (!("damageDealt" in damageResult)) {
      return damageResult;
    }
    return { ok: true };
  },
};

const healHandler: EffectRuntimeHandler<RuntimeEffectForId<"heal">> = {
  effectId: "heal",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
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

    services.healPlayer(
      state,
      player,
      targetResult.choice.player,
      effect.amount,
      effect.effectId,
      source
    );
    return { ok: true };
  },
};

const healEqualDamageDealtOnOwnTurnHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"heal_equal_damage_dealt_on_own_turn">
> = {
  effectId: "heal_equal_damage_dealt_on_own_turn",
  execute() {
    return { ok: true };
  },
  applyAfterDamageDealt(effect, context) {
    applyLifeChange(
      context.state,
      context.controller,
      context.controller,
      context.damageDealt,
      effect.effectId,
      context.source
    );
    return { status: "resolved", result: { ok: true } };
  },
};

function applyLifeChange(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  const effectiveMaxLife = calculateEffectivePlayerMaxLifeCore(
    state,
    targetPlayer.playerId
  );
  const targetLifeBefore = targetPlayer.life.current;
  const unclampedLife = targetLifeBefore + amount;
  targetPlayer.life.current = Math.min(unclampedLife, effectiveMaxLife);

  recordGameEvent(state, {
    type: "effectLifeHealed",
    playerId: sourcePlayer.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: Math.max(0, targetPlayer.life.current - targetLifeBefore),
    targetLifeBefore,
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

const setLifeHandler: EffectRuntimeHandler<RuntimeEffectForId<"set_life">> = {
  effectId: "set_life",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
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

    const lifeChange = services.setPlayerLife(
      state,
      targetResult.choice.player,
      effect.lifeTotal
    );
    recordGameEvent(state, {
      type: "effectLifeSet",
      playerId: player.playerId,
      targetPlayerId: targetResult.choice.player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      amount: effect.lifeTotal,
      targetLifeBefore: lifeChange.lifeBefore,
      targetLifeAfter: lifeChange.lifeAfter,
      sourceType: source.sourceType,
    });
    if (lifeChange.lifeAfter < 1) {
      return services.resolvePlayerDeath(state, targetResult.choice.player);
    }
    return { ok: true };
  },
};

const exchangeLifeAndDinglerStatusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"exchange_life_and_dingler_status">
> = {
  effectId: "exchange_life_and_dingler_status",
  execute(state, player, effect, source, services) {
    const effectId = effect.effectId;
    const allowLifeExchange =
      effect.allowLifeExchange === undefined
        ? true
        : effect.allowLifeExchange === true;
    const allowDinglerStatusExchange =
      effect.allowDinglerStatusExchange === undefined
        ? true
        : effect.allowDinglerStatusExchange === true;

    if (effect.optional === true) {
      const choices: EffectChoice[] = [
        { choiceKind: "option", choiceId: "pass" },
      ];
      if (allowLifeExchange) {
        choices.push({ choiceKind: "option", choiceId: "exchange_life_only" });
      }
      if (allowDinglerStatusExchange) {
        choices.push({
          choiceKind: "option",
          choiceId: "exchange_dingler_status_only",
        });
      }
      if (allowLifeExchange && allowDinglerStatusExchange) {
        choices.push({
          choiceKind: "option",
          choiceId: "exchange_life_and_dingler_status",
        });
      }
      const choice = services.chooseEffectChoice(
        state,
        player,
        source,
        effectId,
        choices
      );
      if (choice?.choiceId === "pass") {
        return { ok: true };
      }
      if (choice?.choiceId === "exchange_life_only") {
        return exchangeLifeAndOrDinglerStatus(
          state,
          player,
          effect,
          source,
          services,
          true,
          false
        );
      }
      if (choice?.choiceId === "exchange_dingler_status_only") {
        return exchangeLifeAndOrDinglerStatus(
          state,
          player,
          effect,
          source,
          services,
          false,
          true
        );
      }
      if (choice?.choiceId === "exchange_life_and_dingler_status") {
        return exchangeLifeAndOrDinglerStatus(
          state,
          player,
          effect,
          source,
          services,
          true,
          true
        );
      }
    }

    return exchangeLifeAndOrDinglerStatus(
      state,
      player,
      effect,
      source,
      services,
      allowLifeExchange,
      allowDinglerStatusExchange
    );
  },
};

function exchangeLifeAndOrDinglerStatus(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  exchangeLife: boolean,
  exchangeDinglerStatus: boolean
): EffectExecutionResult {
  if (!exchangeLife && !exchangeDinglerStatus) {
    return { ok: true };
  }

  const effectId = effect.effectId;
  const targetResult = services.resolveTargetChoice(
    state,
    player,
    effect,
    source
  );
  if (!targetResult.ok) {
    return targetResult;
  }

  if (targetResult.choice === undefined) {
    return { ok: true };
  }

  if (targetResult.choice.choiceType !== "player") {
    return {
      ok: false,
      error: "Life exchange effect requires a player target",
    };
  }

  const targetPlayer = targetResult.choice.player;
  if (exchangeLife) {
    services.exchangePlayerLifeTotals(
      state,
      player,
      targetPlayer,
      effectId,
      source
    );
  }

  if (exchangeDinglerStatus) {
    const playerHadDingler = services.hasDinglerStatus(player);
    const targetHadDingler = services.hasDinglerStatus(targetPlayer);
    if (playerHadDingler && !targetHadDingler) {
      const removeResult = services.removeDinglerStatus(
        state,
        player,
        effectId,
        source
      );
      if (!removeResult.ok) {
        return removeResult;
      }
      const gainResult = services.gainDinglerStatus(
        state,
        targetPlayer,
        effectId,
        source
      );
      if (!gainResult.ok) {
        return gainResult;
      }
    }
    if (!playerHadDingler && targetHadDingler) {
      const removeResult = services.removeDinglerStatus(
        state,
        targetPlayer,
        effectId,
        source
      );
      if (!removeResult.ok) {
        return removeResult;
      }
      const gainResult = services.gainDinglerStatus(
        state,
        player,
        effectId,
        source
      );
      if (!gainResult.ok) {
        return gainResult;
      }
    }
  }

  return { ok: true };
}

const gainStatusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"gain_status">
> = {
  effectId: "gain_status",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveStatusTargetPlayers(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      const result = services.gainDinglerStatus(
        state,
        targetPlayer,
        effect.effectId,
        source
      );
      if (!result.ok) {
        return result;
      }
    }

    return { ok: true };
  },
};

const removeStatusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"remove_status">
> = {
  effectId: "remove_status",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveStatusTargetPlayers(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      if (!services.hasDinglerStatus(targetPlayer)) {
        continue;
      }
      if (effect.optional === true) {
        const choice = services.chooseEffectChoice(
          state,
          targetPlayer,
          source,
          effect.effectId,
          [
            { choiceKind: "option", choiceId: "apply" },
            { choiceKind: "option", choiceId: "decline" },
          ]
        );
        if (choice?.choiceId !== "apply") {
          continue;
        }
      }
      const result = services.removeDinglerStatus(
        state,
        targetPlayer,
        effect.effectId,
        source
      );
      if (!result.ok) {
        return result;
      }
    }

    return { ok: true };
  },
};

const toggleStatusHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"toggle_status">
> = {
  effectId: "toggle_status",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveStatusTargetPlayers(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }

    for (const targetPlayer of targetResult.players) {
      if (services.hasDinglerStatus(targetPlayer)) {
        const result = services.removeDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
        if (!result.ok) {
          return result;
        }
      } else {
        const result = services.gainDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
        if (!result.ok) {
          return result;
        }
      }
    }

    return { ok: true };
  },
};

function countControlledObjects(state: GameState, player: PlayerState): number {
  const controlled = buildControlledObjectView(state, player.playerId);
  return (
    controlled.cards.length +
    controlled.tokens.length +
    controlled.wizardProperties.length +
    controlled.statuses.length +
    controlled.trophyLikeObjects.length
  );
}

const addPowerPerControlledObjectHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"add_power_per_controlled_object">
> = {
  effectId: "add_power_per_controlled_object",
  execute(state, player, effect, source) {
    const amount = countControlledObjects(state, player) * effect.amount;
    if (amount === 0) {
      return { ok: true };
    }

    const powerBefore = state.turn.power;
    state.turn.power += amount;
    recordTurnPowerChanged(
      state,
      player,
      source,
      "add_power_per_controlled_object",
      powerBefore,
      state.turn.power
    );

    return { ok: true };
  },
};

const fixtureAddPowerEqualToTargetCostHandler: EffectRuntimeHandler<
  RuntimeEffectForId<"fixture_add_power_equal_to_target_cost">
> = {
  effectId: "fixture_add_power_equal_to_target_cost",
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }

    if (targetResult.choice === undefined) {
      return { ok: true };
    }

    const choice = services.requireCardChoice(
      targetResult.choice,
      "fixture_add_power_equal_to_target_cost"
    );
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
    recordGameEvent(state, {
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
  },
};

type LifeStatusEffectId =
  | "heal"
  | "set_life"
  | "gain_status"
  | "remove_status"
  | "toggle_status";

type EffectRuntimeEntriesFor<PayloadMap> = {
  [Id in keyof PayloadMap & RuntimeEffectId]: EffectRuntimeEntry<Id>;
};

const effectiveValueModifierEntries = defineEffectRuntimeFamily(
  "effective-value/modifier",
  createEffectiveValueModifierEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Pick<SetupEffectPayloadMap, EffectiveValueModifierId>
>;

const cardTypeEntries = defineEffectRuntimeFamily(
  "cards/type",
  createCardTypeEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Pick<CardTypeEffectPayloadMap, CardTypeEffectId>
>;

const deadWizardTokenEntries = defineEffectRuntimeFamily(
  "tokens/dead-wizard",
  createDeadWizardTokenEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Pick<DeadWizardTokenEffectPayloadMap, DeadWizardTokenEffectId>
>;

const controlledPowerEntries = defineEffectRuntimeFamily(
  "values/controlled-power",
  createControlledPowerEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Pick<ImmediateEffectPayloadMap, "add_power_if_player_has_status"> &
    Pick<
      OngoingEffectPayloadMap,
      "ongoing_add_power" | "ongoing_add_power_per_dead_wizard_token"
    >
>;

const resourceDrawEntries = defineEffectRuntimeFamily(
  "resources/draw",
  createResourceDrawEffectDefinitions({ bindRuntimeEffectDecoder })
);

const setLifeSupportedTimings = [
  ...immediateEffectTimings,
  "onDeadWizardTokenFace",
] as const satisfies EffectRuntimeSupportedTimings;

const statusEffectTimings = [
  ...immediateEffectTimings,
  "onDeadWizardTokenFace",
] as const satisfies EffectRuntimeSupportedTimings;

const lifeStatusEntries = defineEffectRuntimeFamily("life/status", [
  {
    effectId: "heal",
    decoder: bindRuntimeEffectDecoder("heal"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: healHandler,
  },
  {
    effectId: "set_life",
    decoder: bindRuntimeEffectDecoder("set_life"),
    supportedTimings: setLifeSupportedTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
    handler: setLifeHandler,
  },
  {
    effectId: "gain_status",
    decoder: bindRuntimeEffectDecoder("gain_status"),
    supportedTimings: statusEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
    handler: gainStatusHandler,
  },
  {
    effectId: "remove_status",
    decoder: bindRuntimeEffectDecoder("remove_status"),
    supportedTimings: statusEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
    handler: removeStatusHandler,
  },
  {
    effectId: "toggle_status",
    decoder: bindRuntimeEffectDecoder("toggle_status"),
    supportedTimings: statusEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty", "deadWizardToken"],
    handler: toggleStatusHandler,
  },
] as const) satisfies EffectRuntimeEntriesFor<
  Pick<ImmediateEffectPayloadMap, LifeStatusEffectId>
>;

const cardOwnershipChoiceEntries = defineEffectRuntimeFamily(
  "cards/ownership/choice",
  createCardOwnershipChoiceEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Pick<ImmediateEffectPayloadMap, CardOwnershipChoiceEffectId>
>;

const setupFamilyEntries = defineEffectRuntimeFamily(
  "setup",
  createSetupEffectDefinitions({
    bindRuntimeEffectDecoder,
    calculateEffectivePlayerMaxLife: (state, playerId) =>
      calculateEffectivePlayerMaxLifeCore(state, playerId),
  })
);

const setupEffectEntries = {
  ...setupFamilyEntries,
  ...effectiveValueModifierEntries,
} satisfies EffectRuntimeEntriesFor<SetupEffectPayloadMap>;

const wildMagicEffectEntries = defineEffectRuntimeFamily(
  "cards/wild-magic",
  createWildMagicEffectDefinitions({ bindRuntimeEffectDecoder })
);

const combatAttackEffectEntries = defineEffectRuntimeFamily(
  "combat/attack",
  createCombatAttackEffectDefinitions({
    bindRuntimeEffectDecoder,
    collectAttackReplacementProfile,
    calculateEffectiveCardCost: (state, playerId, definition, card) =>
      calculateEffectiveCardCostCore(
        state,
        playerId,
        definition,
        card,
        cardMatchesTypeForPlayer
      ),
  })
);

const combatDefenseEffectEntries = defineEffectRuntimeFamily(
  "combat/defense",
  createCombatDefenseEffectDefinitions({ bindRuntimeEffectDecoder })
);

const combatReplacementEffectEntries = defineEffectRuntimeFamily(
  "combat/attack-replacement",
  createCombatReplacementEffectDefinitions({ bindRuntimeEffectDecoder })
);

const mayhemEffectEntries = defineEffectRuntimeFamily(
  "events/mayhem",
  createMayhemEffectDefinitions({
    bindRuntimeEffectDecoder,
    calculateEffectivePlayerMaxLife: (state, playerId) =>
      calculateEffectivePlayerMaxLifeCore(state, playerId),
  })
);

const immediateEffectEntries = defineEffectRuntimeFamily("effects/general", [
  {
    effectId: "add_power",
    decoder: bindRuntimeEffectDecoder("add_power"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: addPowerHandler,
  },
  {
    effectId: "add_power_per_controlled_object",
    decoder: bindRuntimeEffectDecoder("add_power_per_controlled_object"),
    supportedTimings: ["onPlay"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: addPowerPerControlledObjectHandler,
  },
  {
    effectId: "add_power_per_controlled_dead_wizard_token",
    decoder: bindRuntimeEffectDecoder(
      "add_power_per_controlled_dead_wizard_token"
    ),
    supportedTimings: ["onPlay"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: addPowerPerControlledDeadWizardTokenHandler,
  },
  {
    effectId: "add_power_if_no_controlled_dead_wizard_token",
    decoder: bindRuntimeEffectDecoder(
      "add_power_if_no_controlled_dead_wizard_token"
    ),
    supportedTimings: ["onPlay"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: addPowerIfNoControlledDeadWizardTokenHandler,
  },
  {
    effectId: "optional_destroy_controlled_dead_wizard_token",
    decoder: bindRuntimeEffectDecoder(
      "optional_destroy_controlled_dead_wizard_token"
    ),
    supportedTimings: ["onPlay"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: optionalDestroyControlledDeadWizardTokenHandler,
  },
  {
    effectId: "add_power_per_controlled_permanent",
    decoder: bindRuntimeEffectDecoder("add_power_per_controlled_permanent"),
    supportedTimings: ["onPlay"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: createUnsupportedEffectHandler(
      "add_power_per_controlled_permanent"
    ),
  },
  {
    effectId: "add_power_per_player_with_status",
    decoder: bindRuntimeEffectDecoder("add_power_per_player_with_status"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: addPowerPerPlayerWithStatusHandler,
  },
  {
    effectId: "gain_chips_equal_damage_dealt",
    decoder: bindRuntimeEffectDecoder("gain_chips_equal_damage_dealt"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: createUnsupportedEffectHandler("gain_chips_equal_damage_dealt"),
  },
  {
    effectId: "heal_equal_damage_dealt",
    decoder: bindRuntimeEffectDecoder("heal_equal_damage_dealt"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: createUnsupportedEffectHandler("heal_equal_damage_dealt"),
  },
  {
    effectId: "heal_equal_damage_dealt_on_own_turn",
    decoder: bindRuntimeEffectDecoder("heal_equal_damage_dealt_on_own_turn"),
    supportedTimings: ["afterDamageDealt"],
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: healEqualDamageDealtOnOwnTurnHandler,
  },
  {
    effectId: "exchange_life_and_dingler_status",
    decoder: bindRuntimeEffectDecoder("exchange_life_and_dingler_status"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: exchangeLifeAndDinglerStatusHandler,
  },
  {
    effectId: "deal_damage",
    decoder: bindRuntimeEffectDecoder("deal_damage"),
    supportedTimings: immediateEffectTimings,
    supportedModes: allEffectRuntimeModes,
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: dealDamageHandler,
  },
  {
    effectId: "fixture_add_power_equal_to_target_cost",
    decoder: bindRuntimeEffectDecoder("fixture_add_power_equal_to_target_cost"),
    supportedTimings: fixtureEffectTimings,
    supportedModes: ["fixture"],
    supportedSourceKinds: ["card", "wizardProperty"],
    handler: fixtureAddPowerEqualToTargetCostHandler,
  },
] as const) satisfies EffectRuntimeEntriesFor<
  Omit<
    ImmediateEffectPayloadMap,
    | "add_power_if_player_has_status"
    | "wild_magic_choice"
    | keyof ResourceDrawEffectPayloadMap
    | LifeStatusEffectId
    | CardOwnershipChoiceEffectId
  >
>;

const activationEffectEntries = defineEffectRuntimeFamily(
  "activation",
  createActivationEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<ActivationEffectPayloadMap>;

const ongoingEffectEntries = defineEffectRuntimeFamily(
  "ongoing/passive",
  createOngoingEffectDefinitions({ bindRuntimeEffectDecoder })
) satisfies EffectRuntimeEntriesFor<
  Omit<
    OngoingEffectPayloadMap,
    "ongoing_add_power" | "ongoing_add_power_per_dead_wizard_token"
  >
>;

type EffectRuntimeCatalogDefinition = {
  readonly [Id in RuntimeEffectId]: EffectRuntimeEntry<Id>;
};

type EffectRuntimeCatalogEntryGroup = Partial<EffectRuntimeCatalogDefinition>;

type KeysOfUnion<Value> = Value extends unknown ? keyof Value : never;

type EffectRuntimeCatalogGroupIds<
  Groups extends readonly EffectRuntimeCatalogEntryGroup[],
> = KeysOfUnion<Groups[number]> & RuntimeEffectId;

type MissingEffectRuntimeCatalogEntryIds<
  Groups extends readonly EffectRuntimeCatalogEntryGroup[],
> = Exclude<RuntimeEffectId, EffectRuntimeCatalogGroupIds<Groups>>;

function mergeEffectRuntimeCatalogEntryGroups(
  groups: readonly EffectRuntimeCatalogEntryGroup[]
): EffectRuntimeCatalogDefinition {
  const entries = new Map<RuntimeEffectId, EffectRuntimeEntry>();
  for (const group of groups) {
    for (const [effectId, entry] of Object.entries(group)) {
      if (!isRuntimeEffectId(effectId) || entry === undefined) {
        throw new Error(`Invalid Effect Runtime Catalog entry ${effectId}`);
      }
      if (entries.has(effectId)) {
        throw new Error(
          `Effect Runtime Catalog registers duplicate effect ID ${effectId}`
        );
      }
      entries.set(effectId, entry);
    }
  }
  return Object.fromEntries(entries) as EffectRuntimeCatalogDefinition;
}

function defineEffectRuntimeCatalog<
  const Groups extends readonly EffectRuntimeCatalogEntryGroup[],
>(
  groups: Groups,
  ...completeness: MissingEffectRuntimeCatalogEntryIds<Groups> extends never
    ? []
    : [MissingEffectRuntimeCatalogEntryIds<Groups>]
): EffectRuntimeCatalogDefinition {
  void completeness;
  return mergeEffectRuntimeCatalogEntryGroups(groups);
}

export function defineEffectRuntimeCatalogGroupsForTesting(
  groups: readonly {
    readonly familyId: string;
    readonly definitions: readonly AnyEffectRuntimeFamilyEntryDefinition[];
  }[]
): readonly RuntimeEffectId[] {
  const entries = groups.map(({ familyId, definitions }) =>
    defineEffectRuntimeFamily(familyId, definitions)
  );
  mergeEffectRuntimeCatalogEntryGroups(entries);
  return groups.flatMap(({ definitions }) =>
    definitions.map((definition) => definition.effectId)
  );
}

const effectRuntimeCatalogDefinition = defineEffectRuntimeCatalog([
  setupEffectEntries,
  cardTypeEntries,
  deadWizardTokenEntries,
  controlledPowerEntries,
  resourceDrawEntries,
  lifeStatusEntries,
  cardOwnershipChoiceEntries,
  wildMagicEffectEntries,
  immediateEffectEntries,
  combatAttackEffectEntries,
  combatDefenseEffectEntries,
  combatReplacementEffectEntries,
  activationEffectEntries,
  ongoingEffectEntries,
  mayhemEffectEntries,
] as const);

function getEffectRuntimeCatalogEntry<Id extends RuntimeEffectId>(
  effectId: Id
): EffectRuntimeEntry<Id> {
  return effectRuntimeCatalogDefinition[effectId];
}

function getVerifiedEffectRuntimeCatalogEntry(
  effect: VerifiedRuntimeEffect
): EffectRuntimeEntry<RuntimeEffectId> {
  return getEffectRuntimeCatalogEntry(effect.effectId);
}

export function validateRuntimeEffectCatalogPayload<Id extends RuntimeEffectId>(
  subjectId: string,
  effectId: Id,
  effect: unknown,
  mode: EffectRuntimeMode,
  sourceKind: EffectRuntimeSourceKind
): DecodeResult<RuntimeEffectForId<Id>> {
  const entry = getEffectRuntimeCatalogEntry(effectId);
  const decoded = entry.decode(subjectId, effect);
  if (!decoded.ok) {
    return decoded;
  }
  if (entry.unsupported) {
    return {
      ok: false,
      errors: [`${subjectId} uses unsupported effect ${effectId}`],
    };
  }
  if (!entry.supportedSourceKinds.includes(sourceKind)) {
    return {
      ok: false,
      errors: [
        sourceKind === "deadWizardToken"
          ? `${subjectId} deadWizardToken does not support effect id ${effectId}`
          : `${subjectId} uses token-only effect id ${effectId}`,
      ],
    };
  }
  const sourceTimingError = entry.validateSourceTiming(
    subjectId,
    decoded.value,
    sourceKind
  );
  if (sourceTimingError !== undefined) {
    return { ok: false, errors: [sourceTimingError] };
  }
  if (!entry.supportedModes.includes(mode)) {
    return {
      ok: false,
      errors:
        mode === "combat" && effectId.startsWith("fixture_")
          ? [`${subjectId} uses fixture effect id ${effectId} in combat data`]
          : [
              `${subjectId} uses effect id ${effectId} outside supported ${mode} mode`,
            ],
    };
  }
  return decoded;
}

export function executeRuntimeEffect(
  state: GameState,
  player: PlayerState,
  effect: VerifiedRuntimeEffect,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  return getVerifiedEffectRuntimeCatalogEntry(effect).executeVerified(
    `Effect ${effect.effectId}`,
    effect,
    state,
    player,
    source,
    services
  );
}

export function evaluateRuntimeEffectAtTiming<Result>(
  effect: VerifiedRuntimeEffect,
  source: EffectSourceContext,
  timing: EffectTiming,
  evaluate: (
    effect: RuntimeEffectPayload
  ) => EffectRuntimeHandlerOperationResult<Result>
): EffectRuntimeOperationResult<Result> {
  return getVerifiedEffectRuntimeCatalogEntry(effect).evaluateAtTimingVerified(
    `Effect ${effect.effectId}`,
    effect,
    { source, timing, evaluate }
  );
}

/** Keeps fixture validation observable when a timed dispatch skips normal effects. */
export function isSupportedRuntimeEffectTiming(
  effect: VerifiedRuntimeEffect
): boolean {
  return getVerifiedEffectRuntimeCatalogEntry(effect).supportsTiming(
    effect.timing
  );
}

export function collectAttackReplacementProfile(
  state: GameState,
  attackingPlayer: PlayerState,
  source: EffectSourceContext,
  options?: {
    includeDeadWizardTokenModifiers?: boolean;
    includeSourceOwnerModifiers?: boolean;
  }
): EffectRuntimeOperationResult<AttackReplacementProfile> {
  const includeDeadWizardTokenModifiers =
    options?.includeDeadWizardTokenModifiers ?? false;
  const includeSourceOwnerModifiers =
    options?.includeSourceOwnerModifiers ?? true;
  const profile = {
    doublesOwnedAttackDamage: false,
    damageBonus: 0,
    controlledCardDamageBonus: 0,
    deadWizardTokenDamageBonus: 0,
    unavoidable: false,
  };
  const applyEffects = (
    effects: readonly RuntimeEffect[],
    effectSource: EffectSourceContext,
    allowWandDefensePrevention: boolean
  ): EffectRuntimeOperationResult<void> => {
    for (const effect of effects) {
      const verifiedEffect = requireVerifiedRuntimeEffect(effect);
      const result = evaluateRuntimeEffectAtTiming(
        verifiedEffect,
        effectSource,
        "attackReplacement",
        (decoded) => {
          if (decoded.effectId === "double_owned_attack_damage") {
            profile.doublesOwnedAttackDamage = true;
            return { status: "resolved", result: undefined };
          }
          if (!effectMatchesAttackSource(state, decoded, source.definitionId)) {
            return { status: "notApplicable" };
          }
          if (decoded.effectId === "modify_owned_wand_attack_damage") {
            profile.damageBonus += decoded.amount;
            if (effectSource.sourceType === "deadWizardToken") {
              profile.deadWizardTokenDamageBonus += decoded.amount;
            } else if (
              effectSource.sourceType === "card" &&
              effectSource.playerId === attackingPlayer.playerId
            ) {
              profile.controlledCardDamageBonus += decoded.amount;
            }
          }
          if (
            allowWandDefensePrevention &&
            decoded.effectId === "prevent_defense_against_owned_wand_attacks"
          ) {
            profile.unavoidable = true;
          }
          return { status: "resolved", result: undefined };
        }
      );
      if (result.status === "error") return result;
    }
    return { status: "resolved", result: undefined };
  };

  for (const card of getControlledOngoingCards(state, attackingPlayer)) {
    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) continue;
    const result = applyEffects(
      definition.engine.effects,
      {
        sourceType: "card",
        runtimeMode: source.runtimeMode,
        playerId: attackingPlayer.playerId,
        cardInstanceId: card.instanceId,
        definitionId: card.definitionId,
      },
      false
    );
    if (result.status === "error") return result;
  }

  if (includeDeadWizardTokenModifiers) {
    for (const token of attackingPlayer.deadWizardTokens) {
      const definition = state.tokenDefinitions.get(token.definitionId);
      if (definition?.kind !== "deadWizardToken") continue;
      const result = applyEffects(
        definition.effects,
        {
          sourceType: "deadWizardToken",
          runtimeMode: source.runtimeMode,
          playerId: attackingPlayer.playerId,
          cardInstanceId: token.instanceId,
          definitionId: definition.tokenId,
          tokenInstanceId: token.instanceId,
          tokenDefinitionId: definition.tokenId,
        },
        false
      );
      if (result.status === "error") return result;
    }
  }

  if (!includeSourceOwnerModifiers || source.sourceType !== "card")
    return { status: "resolved", result: profile };
  const sourceCard = findCardLocation(state, source.cardInstanceId)?.card;
  if (sourceCard === undefined || sourceCard.ownerId === "common") {
    return { status: "resolved", result: profile };
  }
  const sourceOwner = state.players.find(
    (player) => player.playerId === sourceCard.ownerId
  );
  if (sourceOwner === undefined) return { status: "resolved", result: profile };

  for (const token of sourceOwner.wizardProperties) {
    const definition = state.tokenDefinitions.get(token.definitionId);
    if (
      definition?.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    )
      continue;
    const result = applyEffects(
      definition.engine.effects,
      {
        sourceType: "wizardProperty",
        runtimeMode: source.runtimeMode,
        playerId: sourceOwner.playerId,
        cardInstanceId: token.instanceId,
        definitionId: token.definitionId,
        tokenInstanceId: token.instanceId,
        tokenDefinitionId: token.definitionId,
      },
      true
    );
    if (result.status === "error") return result;
  }

  if (sourceOwner.playerId !== attackingPlayer.playerId) {
    for (const card of getControlledOngoingCards(state, sourceOwner)) {
      const definition = state.cardDefinitions.get(card.definitionId);
      if (definition === undefined) continue;
      const result = applyEffects(
        definition.engine.effects,
        {
          sourceType: "card",
          runtimeMode: source.runtimeMode,
          playerId: sourceOwner.playerId,
          cardInstanceId: card.instanceId,
          definitionId: card.definitionId,
        },
        false
      );
      if (result.status === "error") return result;
    }
  }
  return { status: "resolved", result: profile };
}

function effectMatchesAttackSource(
  state: GameState,
  effect: RuntimeEffectPayload,
  definitionId: string
): boolean {
  const cardDefinitionIds =
    "cardDefinitionIds" in effect ? effect.cardDefinitionIds : undefined;
  if (
    Array.isArray(cardDefinitionIds) &&
    cardDefinitionIds.some((candidate) => candidate === definitionId)
  )
    return true;
  const cardTags = "cardTags" in effect ? effect.cardTags : undefined;
  if (!Array.isArray(cardTags)) return false;
  const definition = state.cardDefinitions.get(definitionId);
  return cardTags.some((candidate) =>
    (definition?.engine.tags ?? []).includes(candidate)
  );
}

export function resolveResurrectionLifeTotal(
  effect: VerifiedRuntimeEffect,
  source: EffectSourceContext,
  statuses: readonly { readonly statusId: string }[]
): EffectRuntimeOperationResult<number> {
  return getVerifiedEffectRuntimeCatalogEntry(effect).evaluateAtTimingVerified(
    `Effect ${effect.effectId}`,
    effect,
    {
      source,
      timing: "replacement",
      evaluate: (decoded) => {
        if (decoded.effectId !== "set_resurrection_life_total") {
          return { status: "notApplicable" };
        }
        return decoded.unlessStatusId === undefined ||
          !statuses.some((status) => status.statusId === decoded.unlessStatusId)
          ? { status: "resolved", result: decoded.lifeTotal }
          : { status: "notApplicable" };
      },
    }
  );
}

export function executeRuntimeEffectAtTiming(
  state: GameState,
  player: PlayerState,
  effect: VerifiedRuntimeEffect,
  timing: EffectTiming,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  isApplicable?: (effect: RuntimeEffectPayload) => boolean
): EffectRuntimeOperationResult<EffectExecutionResult> {
  return getVerifiedEffectRuntimeCatalogEntry(effect).executeAtTimingVerified(
    `Effect ${effect.effectId}`,
    effect,
    {
      state,
      player,
      source,
      services,
      timing,
      ...(isApplicable === undefined ? {} : { isApplicable }),
    }
  );
}

export function executeRuntimeEffectOnPlayCard(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeOnPlayCardOperationContext
): EffectRuntimeOperationResult<EffectExecutionResult> {
  return getVerifiedEffectRuntimeCatalogEntry(effect).executeOnPlayCardVerified(
    `Effect ${effect.effectId}`,
    effect,
    context
  );
}

export function applyRuntimeEffectAfterPlayerAttackDamage(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeAfterPlayerAttackDamageOperationContext
): EffectRuntimeOperationResult<EffectExecutionResult> {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).applyAfterPlayerAttackDamageVerified(
    `Effect ${effect.effectId}`,
    effect,
    context
  );
}

export function applyRuntimeEffectAfterDamageDealt(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeAfterDamageDealtOperationContext
): EffectRuntimeOperationResult<EffectExecutionResult> {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).applyAfterDamageDealtVerified(`Effect ${effect.effectId}`, effect, context);
}

export function evaluateRuntimeEffectEndTurnDrawModifier(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeEndTurnDrawModifierOperationContext
): EffectRuntimeOperationResult<number> {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).evaluateEndTurnDrawModifierVerified(
    `Effect ${effect.effectId}`,
    effect,
    context
  );
}

export function evaluateRuntimeEffectBasicTrophyChipPayoutSuppression(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeBasicTrophyChipPayoutSuppressionOperationContext
): EffectRuntimeOperationResult<boolean> {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).evaluateBasicTrophyChipPayoutSuppressionVerified(
    `Effect ${effect.effectId}`,
    effect,
    context
  );
}

export function evaluateRuntimeEffectControlledPower(
  effect: VerifiedRuntimeEffect,
  context: EffectRuntimeControlledPowerOperationContext
): EffectRuntimeOperationResult<number> {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).evaluateControlledPowerVerified(
    `Effect ${effect.effectId}`,
    effect,
    context
  );
}

export function withEffectRuntimeCatalogOperationsForTesting<
  Id extends RuntimeEffectId,
  Result,
>(
  effectId: Id,
  overrides: EffectRuntimeCatalogOperationOverridesForTesting<Id>,
  run: () => Result
): Result {
  const entry = getEffectRuntimeCatalogEntry(
    effectId
  ) as TestableEffectRuntimeEntry<Id>;
  return entry[withEffectRuntimeCatalogOperationsForTestingSymbol](
    overrides,
    run
  );
}

export function tryExecuteSetupEffect(
  player: PlayerState,
  effect: VerifiedRuntimeEffect,
  source: SetupEffectSourceContext,
  services: EffectRuntimeSetupServices
): SetupEffectExecutionResult {
  return getVerifiedEffectRuntimeCatalogEntry(effect).executeSetupVerified(
    `Setup effect ${effect.effectId}`,
    effect,
    player,
    source,
    services
  );
}

export function getSetupEffectPoolRequirement(
  effect: VerifiedRuntimeEffect
): SetupPoolRequirement | undefined {
  return getVerifiedEffectRuntimeCatalogEntry(
    effect
  ).getSetupPoolRequirementVerified(`Setup effect ${effect.effectId}`, effect);
}
