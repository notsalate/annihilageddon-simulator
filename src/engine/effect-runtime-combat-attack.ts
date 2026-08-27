import type { CardDefinition } from "./data.js";
import {
  buildControlledObjectView,
  peekLegendDeckCard,
} from "./control-ledger.js";
import type {
  AttackInstance,
  PlayerControlledAttackAdapters,
  PlayerControlledSharedAttackImpact,
  ResolvedAttackBranchContext,
  DefenseWindowMode,
} from "./attack-resolution.js";
import { createAttackChainRecurrenceKey } from "./attack-cycle.js";
import { countControlledCardsOfType } from "./card-type-runtime.js";
import { getControlledDeadWizardTokenCount } from "./dead-wizard-token-like.js";
import { recordGameEvent, recordTurnPowerChanged } from "./event-recorder.js";
import { transferUpToLimpWandsToPlayer } from "./effect-runtime-special-card-stack.js";
import {
  destroyOwnedCard,
  executeReturnDiscardToHand,
} from "./effect-runtime-cards-ownership-choice.js";
import type {
  AttackReplacementProfile,
  EffectChoice,
  EffectExecutionResult,
  EffectRuntimeOperationResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import {
  type ObjectFields,
  type OptionalField,
  type RequiredField,
  type ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  AttackOutcomeBranch,
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectCost,
  RuntimeEffectForId,
  RuntimeEffectId,
  AttackSemantics,
  RuntimeEffectTarget,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import { validateAttackSemanticsForEffect } from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import { getDistinctAdjacentFoes } from "./player-targets.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type CombatAttackEffectId =
  | "attack_damage"
  | "attack_damage_per_controlled_dead_wizard_token"
  | "attack_gain_dead_wizard_tokens"
  | "attack_transfer_controlled_dead_wizard_token"
  | "attack_kill_and_replace_dead_wizard_token"
  | "attack_damage_equal_remembered_card_cost"
  | "attack_damage_equal_to_controlled_card_cost"
  | "attack_destroy_top_legend_deck_then_damage_equal_cost"
  | "attack_discard_cards"
  | "attack_damage_equal_random_discarded_hand_cost"
  | "attack_reveal_and_play_foe_deck_card"
  | "attack_gain_limp_wand"
  | "attack_gain_status"
  | "activation_attack_damage_per_controlled_card_type"
  | "conditional_activation_attack_damage"
  | "directional_chain_attack"
  | "distributed_attack_damage"
  | "sequential_attack_damage"
  | "multi_target_attack"
  | "multi_target_neighbor_attack"
  | "optional_spend_chip_attack_damage";

export const combatAttackEffectIds = [
  "attack_damage",
  "attack_damage_per_controlled_dead_wizard_token",
  "attack_gain_dead_wizard_tokens",
  "attack_transfer_controlled_dead_wizard_token",
  "attack_kill_and_replace_dead_wizard_token",
  "attack_damage_equal_remembered_card_cost",
  "attack_damage_equal_to_controlled_card_cost",
  "attack_destroy_top_legend_deck_then_damage_equal_cost",
  "attack_discard_cards",
  "attack_damage_equal_random_discarded_hand_cost",
  "attack_reveal_and_play_foe_deck_card",
  "attack_gain_limp_wand",
  "attack_gain_status",
  "activation_attack_damage_per_controlled_card_type",
  "conditional_activation_attack_damage",
  "directional_chain_attack",
  "distributed_attack_damage",
  "sequential_attack_damage",
  "multi_target_attack",
  "multi_target_neighbor_attack",
  "optional_spend_chip_attack_damage",
] as const satisfies readonly CombatAttackEffectId[];

type DecodedPayloadValidator<Id extends CombatAttackEffectId> = (
  subjectId: string,
  effect: RuntimeEffectForId<Id>
) => string[];

export interface CombatAttackEffectDecoderTools {
  defineDecoder<Id extends CombatAttackEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: DecodedPayloadValidator<Id>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  booleanValue: ValueDecoder<boolean>;
  nonEmptyString: ValueDecoder<string>;
  positiveInteger: ValueDecoder<number>;
  optionalCondition: OptionalField<RuntimeEffectCondition>;
  optionalTiming: OptionalField<EffectTiming>;
  optionalAttackSemantics: OptionalField<AttackSemantics>;
  optionalTarget: OptionalField<RuntimeEffectTarget>;
  optionalTargetSelector: OptionalField<RuntimeEffectTargetSelector>;
  optionalCosts: OptionalField<RuntimeEffectCost[]>;
  optionalAttackBranches: OptionalField<AttackOutcomeBranch[]>;
  selectorTargetOneOf<
    const Selectors extends readonly RuntimeEffectTargetSelector[],
  >(
    selectors: Selectors
  ): ValueDecoder<{ selector: Selectors[number] }>;
  requireTargetSelector(
    label: string,
    selectors: readonly RuntimeEffectTargetSelector[]
  ): (
    subjectId: string,
    effect: RuntimeEffectForId<CombatAttackEffectId>
  ) => string[];
  oneOf<const Values extends readonly (string | number | boolean)[]>(
    values: Values
  ): ValueDecoder<Values[number]>;
}

export type CombatAttackEffectDecoders = {
  [Id in CombatAttackEffectId]: RuntimeEffectDecoder<Id>;
};

export function createCombatAttackEffectDecoders(
  tools: CombatAttackEffectDecoderTools
): CombatAttackEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    booleanValue,
    nonEmptyString,
    positiveInteger,
    optionalCondition,
    optionalTiming,
    optionalAttackSemantics,
    optionalTarget,
    optionalTargetSelector,
    optionalCosts,
    optionalAttackBranches,
    selectorTargetOneOf,
    requireTargetSelector,
    oneOf,
  } = tools;
  return {
    attack_damage: defineDecoder(
      "attack_damage",
      {
        effectId: required(literal("attack_damage")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        costs: optionalCosts,
        optional: optional(booleanValue),
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
      },
      requireTargetSelector("attack", [
        "opponentPlayer",
        "chosenFoe",
        "chosenPlayer",
        "eachFoe",
      ])
    ),
    attack_damage_per_controlled_dead_wizard_token: defineDecoder(
      "attack_damage_per_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("attack_damage_per_controlled_dead_wizard_token")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amountPerDeadWizardToken: required(positiveInteger),
        targetSelector: required(literal("eachFoe")),
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
      }
    ),
    attack_gain_dead_wizard_tokens: defineDecoder(
      "attack_gain_dead_wizard_tokens",
      {
        effectId: required(literal("attack_gain_dead_wizard_tokens")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        targetSelector: required(literal("chosenFoe")),
        redirectPolicy: required(literal("ignoreOriginalAttacker")),
      }
    ),
    attack_transfer_controlled_dead_wizard_token: defineDecoder(
      "attack_transfer_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("attack_transfer_controlled_dead_wizard_token")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        targetSelector: required(literal("chosenPlayer")),
      }
    ),
    attack_kill_and_replace_dead_wizard_token: defineDecoder(
      "attack_kill_and_replace_dead_wizard_token",
      {
        effectId: required(
          literal("attack_kill_and_replace_dead_wizard_token")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(literal(3)),
        targetSelector: required(literal("chosenFoe")),
      }
    ),
    attack_damage_equal_remembered_card_cost: defineDecoder(
      "attack_damage_equal_remembered_card_cost",
      {
        effectId: required(literal("attack_damage_equal_remembered_card_cost")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
        rememberedCard: required(literal("destroyedLegend")),
      }
    ),
    attack_damage_equal_to_controlled_card_cost: defineDecoder(
      "attack_damage_equal_to_controlled_card_cost",
      {
        effectId: required(
          literal("attack_damage_equal_to_controlled_card_cost")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
        costMode: required(oneOf(["highest", "chosen"] as const)),
        excludeSource: optional(booleanValue),
      },
      requireTargetSelector("attack", [
        "opponentPlayer",
        "chosenFoe",
        "chosenPlayer",
        "eachFoe",
      ])
    ),
    attack_destroy_top_legend_deck_then_damage_equal_cost: defineDecoder(
      "attack_destroy_top_legend_deck_then_damage_equal_cost",
      {
        effectId: required(
          literal("attack_destroy_top_legend_deck_then_damage_equal_cost")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
        damageUsesDestroyedCardCost: required(literal(true)),
        destroyedCardSource: required(literal("legendDeck")),
      },
      requireTargetSelector("attack", ["chosenFoe"])
    ),
    attack_discard_cards: defineDecoder("attack_discard_cards", {
      effectId: required(literal("attack_discard_cards")),
      timing: optionalTiming,
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
      amount: required(positiveInteger),
      chooser: required(literal("target")),
      sourceZone: required(literal("hand")),
    }),
    attack_damage_equal_random_discarded_hand_cost: defineDecoder(
      "attack_damage_equal_random_discarded_hand_cost",
      {
        effectId: required(
          literal("attack_damage_equal_random_discarded_hand_cost")
        ),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        targetSelector: required(literal("eachFoe")),
        discardAmount: required(positiveInteger),
        rng: required(literal("seeded")),
        unavoidable: required(literal(true)),
      }
    ),
    attack_reveal_and_play_foe_deck_card: defineDecoder(
      "attack_reveal_and_play_foe_deck_card",
      {
        effectId: required(literal("attack_reveal_and_play_foe_deck_card")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        targetSelector: required(literal("chosenFoe")),
      }
    ),
    attack_gain_limp_wand: defineDecoder("attack_gain_limp_wand", {
      effectId: required(literal("attack_gain_limp_wand")),
      timing: optionalTiming,
      attackSemantics: optionalAttackSemantics,
      target: optionalTarget,
      targetSelector: optionalTargetSelector,
      destination: required(literal("targetDiscard")),
      amount: required(positiveInteger),
    }),
    attack_gain_status: defineDecoder(
      "attack_gain_status",
      {
        effectId: required(literal("attack_gain_status")),
        timing: required(oneOf(["activation", "onPlay"] as const)),
        attackSemantics: optionalAttackSemantics,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        statusId: required(literal("dingler")),
      },
      requireTargetSelector("attack-status", [
        "activePlayer",
        "opponentPlayer",
        "anyPlayer",
        "eachPlayerClockwiseFromActive",
      ])
    ),
    conditional_activation_attack_damage: defineDecoder(
      "conditional_activation_attack_damage",
      {
        effectId: required(literal("conditional_activation_attack_damage")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        condition: optionalCondition,
      }
    ),
    activation_attack_damage_per_controlled_card_type: defineDecoder(
      "activation_attack_damage_per_controlled_card_type",
      {
        effectId: required(
          literal("activation_attack_damage_per_controlled_card_type")
        ),
        timing: required(literal("activation")),
        attackSemantics: optionalAttackSemantics,
        amountPerCard: required(positiveInteger),
        cardType: required(nonEmptyString),
        targetSelector: required(literal("eachFoe")),
      }
    ),
    directional_chain_attack: defineDecoder(
      "directional_chain_attack",
      {
        effectId: required(literal("directional_chain_attack")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
      },
      requireTargetSelector("directional attack", ["leftOrRightFoe"])
    ),
    distributed_attack_damage: defineDecoder(
      "distributed_attack_damage",
      {
        effectId: required(literal("distributed_attack_damage")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        targetSelector: required(literal("eachFoe")),
        condition: optionalCondition,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
      },
      requireTargetSelector("distributed attack", ["eachFoe"])
    ),
    sequential_attack_damage: defineDecoder(
      "sequential_attack_damage",
      {
        effectId: required(literal("sequential_attack_damage")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        attackCount: required(positiveInteger),
        powerPerKill: required(positiveInteger),
        targetSelector: required(oneOf(["chosenFoe", "chosenPlayer"] as const)),
      },
      requireTargetSelector("sequential attack", ["chosenFoe", "chosenPlayer"])
    ),
    multi_target_attack: defineDecoder("multi_target_attack", {
      effectId: required(literal("multi_target_attack")),
      timing: optionalTiming,
      attackSemantics: optionalAttackSemantics,
      amount: required(positiveInteger),
      target: required(selectorTargetOneOf(["opponentPlayers"] as const)),
      onDamageDealt: optionalAttackBranches,
      onAvoided: optionalAttackBranches,
      onKill: optionalAttackBranches,
    }),
    multi_target_neighbor_attack: defineDecoder(
      "multi_target_neighbor_attack",
      {
        effectId: required(literal("multi_target_neighbor_attack")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        target: required(selectorTargetOneOf(["leftAndRightFoes"] as const)),
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
      }
    ),
    optional_spend_chip_attack_damage: defineDecoder(
      "optional_spend_chip_attack_damage",
      {
        effectId: required(literal("optional_spend_chip_attack_damage")),
        timing: optionalTiming,
        attackSemantics: optionalAttackSemantics,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onAvoided: optionalAttackBranches,
        onKill: optionalAttackBranches,
        chipCost: required(positiveInteger),
      },
      requireTargetSelector("optional chip attack", ["chosenPlayer"])
    ),
  };
}

type PositiveAmountRuntimeEffect<Id extends CombatAttackEffectId> =
  RuntimeEffectForId<Id> & { amount: number };
type NormalizedOptionalSpendChipAttackDamageRuntimeEffect =
  PositiveAmountRuntimeEffect<"optional_spend_chip_attack_damage"> & {
    optional: true;
    costs: [{ costId: "spend_chips"; amount: number }];
  };
type ExecutableAttackDamageRuntimeEffect =
  | PositiveAmountRuntimeEffect<"attack_damage">
  | NormalizedOptionalSpendChipAttackDamageRuntimeEffect;

type AttackReplacementCollector = (
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext
) => EffectRuntimeOperationResult<AttackReplacementProfile>;

export interface CombatAttackCatalogTools {
  bindRuntimeEffectDecoder<Id extends CombatAttackEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
  collectAttackReplacementProfile: AttackReplacementCollector;
  calculateEffectiveCardCost(
    state: GameState,
    playerId: PlayerState["playerId"],
    definition: CardDefinition,
    card?: CardInstance
  ): number;
}

type AttackCostPaymentStep =
  | { kind: "discardOtherHandCard"; cardInstanceId: CardInstance["instanceId"] }
  | { kind: "spendChips"; amount: number; chipsAfter: number }
  | { kind: "payLife"; amount: number; lifeAfter: number };

interface AttackCostPaymentPlan {
  startingChips: number;
  startingLife: number;
  steps: readonly AttackCostPaymentStep[];
}

function planAttackCosts(
  player: PlayerState,
  costs: readonly RuntimeEffectCost[]
): { ok: true; value: AttackCostPaymentPlan } | { ok: false; error: string } {
  let remainingChips = player.chips;
  let remainingLife = player.life.current;
  const reservedCardInstanceIds = new Set<CardInstance["instanceId"]>();
  const steps: AttackCostPaymentStep[] = [];

  for (const cost of costs) {
    switch (cost.costId) {
      case "discard_other_hand_card": {
        const card = player.hand.find(
          (candidate) => !reservedCardInstanceIds.has(candidate.instanceId)
        );
        if (card === undefined) {
          return { ok: false, error: "Cannot discard another hand card" };
        }
        reservedCardInstanceIds.add(card.instanceId);
        steps.push({
          kind: "discardOtherHandCard",
          cardInstanceId: card.instanceId,
        });
        break;
      }
      case "spend_chips":
        if (remainingChips < cost.amount) {
          return { ok: false, error: "Cannot pay chip cost" };
        }
        remainingChips -= cost.amount;
        steps.push({
          kind: "spendChips",
          amount: cost.amount,
          chipsAfter: remainingChips,
        });
        break;
      case "pay_life":
        if (remainingLife - cost.amount < 1) {
          return { ok: false, error: "Cannot pay life cost" };
        }
        remainingLife -= cost.amount;
        steps.push({
          kind: "payLife",
          amount: cost.amount,
          lifeAfter: remainingLife,
        });
        break;
    }
  }

  return {
    ok: true,
    value: {
      startingChips: player.chips,
      startingLife: player.life.current,
      steps,
    },
  };
}

export function validateAttackCostPrecondition(
  player: PlayerState,
  costs: readonly RuntimeEffectCost[]
): string | undefined {
  const plan = planAttackCosts(player, costs);
  return plan.ok ? undefined : plan.error;
}

function commitAttackCostPlan(
  state: GameState,
  player: PlayerState,
  effect: { effectId: RuntimeEffectId },
  source: EffectSourceContext,
  plan: AttackCostPaymentPlan
): EffectExecutionResult {
  if (
    player.chips !== plan.startingChips ||
    player.life.current !== plan.startingLife ||
    plan.steps.some(
      (step) =>
        step.kind === "discardOtherHandCard" &&
        !player.hand.some((card) => card.instanceId === step.cardInstanceId)
    )
  ) {
    return { ok: false, error: "Attack cost plan changed before payment" };
  }

  for (const step of plan.steps) {
    switch (step.kind) {
      case "discardOtherHandCard": {
        const cardIndex = player.hand.findIndex(
          (card) => card.instanceId === step.cardInstanceId
        );
        const [card] = player.hand.splice(cardIndex, 1);
        if (card === undefined) {
          return { ok: false, error: "Attack cost plan lost discard card" };
        }
        player.discard.push(card);
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "discard_other_hand_card",
          amount: 1,
          sourceType: source.sourceType,
        });
        break;
      }
      case "spendChips":
        player.chips = step.chipsAfter;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "spend_chips",
          amount: step.amount,
          sourceType: source.sourceType,
        });
        break;
      case "payLife":
        player.life.current = step.lifeAfter;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: player.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId: effect.effectId,
          costId: "pay_life",
          amount: step.amount,
          sourceType: source.sourceType,
        });
        break;
    }
  }

  return { ok: true };
}

function payOptionalCosts(
  state: GameState,
  player: PlayerState,
  effect: {
    effectId: RuntimeEffectId;
    costs?: RuntimeEffectCost[];
    optional?: boolean;
  },
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult & { skipped?: boolean } {
  const { costs } = effect;
  if (costs === undefined) {
    return { ok: true };
  }

  const plan = planAttackCosts(player, costs);
  if (!plan.ok) {
    if (effect.optional !== true) {
      return plan;
    }
    services.chooseEffectChoice(state, player, source, effect.effectId, [
      { choiceKind: "option", choiceId: "skip_optional_cost" },
    ]);
    return { ok: true, skipped: true };
  }

  if (effect.optional === true) {
    const choices: EffectChoice[] = [
      { choiceKind: "option", choiceId: "pay_optional_cost" },
      { choiceKind: "option", choiceId: "skip_optional_cost" },
    ];
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    if (choice?.choiceId !== "pay_optional_cost") {
      return { ok: true, skipped: true };
    }
  }

  return commitAttackCostPlan(state, player, effect, source, plan.value);
}

function getControlledCardsForCost(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectForId<"attack_damage_equal_to_controlled_card_cost">,
  source: EffectSourceContext
): { card: CardInstance; definition: CardDefinition }[] {
  return buildControlledObjectView(state, player.playerId)
    .cards.filter(
      ({ card }) =>
        effect.excludeSource !== true ||
        card.instanceId !== source.cardInstanceId
    )
    .map(({ card, definition }) => ({ card, definition }));
}

function resolveControlledCardCost(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectForId<"attack_damage_equal_to_controlled_card_cost">,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  calculateEffectiveCardCost: CombatAttackCatalogTools["calculateEffectiveCardCost"]
): { ok: true; amount: number } | { ok: false; error: string } {
  const cards = getControlledCardsForCost(state, player, effect, source);
  if (cards.length === 0) {
    return { ok: true, amount: 0 };
  }

  if (effect.costMode === "highest") {
    return {
      ok: true,
      amount: Math.max(
        ...cards.map(({ card, definition }) =>
          calculateEffectiveCardCost(state, player.playerId, definition, card)
        )
      ),
    };
  }

  if (effect.costMode === "chosen") {
    const choices = cards.map(({ card, definition }) => ({
      choiceKind: "cardTarget" as const,
      choiceId: card.instanceId,
      cards: [card],
      amount: calculateEffectiveCardCost(
        state,
        player.playerId,
        definition,
        card
      ),
    }));
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      "attack_damage_equal_to_controlled_card_cost",
      choices
    );

    return {
      ok: true,
      amount: choice?.choiceKind === "cardTarget" ? choice.amount : 0,
    };
  }

  return {
    ok: false,
    error: `Unsupported controlled-card cost mode ${String(effect.costMode)}`,
  };
}

type PlayerControlledDamageAttackEffect =
  | RuntimeEffectForId<"attack_damage">
  | RuntimeEffectForId<"attack_damage_per_controlled_dead_wizard_token">
  | RuntimeEffectForId<"optional_spend_chip_attack_damage">
  | RuntimeEffectForId<"attack_damage_equal_remembered_card_cost">
  | RuntimeEffectForId<"attack_damage_equal_to_controlled_card_cost">
  | RuntimeEffectForId<"conditional_activation_attack_damage">
  | RuntimeEffectForId<"activation_attack_damage_per_controlled_card_type">;

type PlayerControlledAttackBaseAmountResolver = (
  state: GameState,
  attackingPlayer: PlayerState,
  targetPlayer: PlayerState
) => number;

function defaultPlayerControlledAttackSemantics(
  targetApplications: AttackSemantics["targetApplications"] = "single"
): AttackSemantics {
  return {
    resolver: "playerControlled",
    instanceMode: "single",
    defenseWindowMode: "PER_TARGET",
    targetApplications,
    attackText: "perTarget",
    continuation: "none",
  };
}

function resolvePlayerControlledAttackMapping(
  effect: { effectId: RuntimeEffectId; attackSemantics?: AttackSemantics },
  fallback: AttackSemantics
):
  | {
      ok: true;
      semantics: AttackSemantics;
      defenseWindowMode: DefenseWindowMode;
    }
  | { ok: false; error: string } {
  const semantics = effect.attackSemantics ?? fallback;
  const errors = validateAttackSemanticsForEffect(
    effect.effectId,
    { attackSemantics: semantics },
    `${effect.effectId}.attackSemantics`
  );
  if (errors.length > 0) {
    return { ok: false, error: errors.join("; ") };
  }
  if (
    semantics.resolver !== "playerControlled" ||
    semantics.defenseWindowMode === "MAYHEM"
  ) {
    return {
      ok: false,
      error: `${effect.effectId} requires playerControlled AttackSemantics`,
    };
  }
  return {
    ok: true,
    semantics,
    defenseWindowMode: semantics.defenseWindowMode,
  };
}

type PlayerControlledDeadWizardTokenEffectAttack =
  | RuntimeEffectForId<"attack_gain_dead_wizard_tokens">
  | RuntimeEffectForId<"attack_transfer_controlled_dead_wizard_token">;

type PlayerControlledEffectsAttackEffect =
  | PlayerControlledDeadWizardTokenEffectAttack
  | RuntimeEffectForId<"attack_discard_cards">
  | RuntimeEffectForId<"attack_gain_limp_wand">
  | RuntimeEffectForId<"attack_gain_status">
  | RuntimeEffectForId<"attack_reveal_and_play_foe_deck_card">
  | RuntimeEffectForId<"attack_kill_and_replace_dead_wizard_token">;

function createSharedAttackEffectImpact(
  effect: PlayerControlledEffectsAttackEffect
): PlayerControlledSharedAttackImpact {
  return {
    kind: "shared" as const,
    resolve(
      state: GameState,
      attack: AttackInstance,
      adapters: PlayerControlledAttackAdapters
    ): EffectExecutionResult {
      const application = attack.applications[0];
      if (application === undefined) {
        return { ok: false, error: "Shared attack has no target application" };
      }
      if (application.resolution?.avoided === true) {
        return { ok: true };
      }
      return adapters.executeOnHitEffect(
        state,
        application.attackingPlayer,
        application.targetPlayer,
        effect,
        application.source
      );
    },
  };
}

function resolvePlayerControlledEffectsAttack(
  state: GameState,
  player: PlayerState,
  effect: PlayerControlledEffectsAttackEffect,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectExecutionResult {
  const attackProfileResult = collectAttackReplacementProfile(
    state,
    player,
    source
  );
  if (attackProfileResult.status !== "resolved") {
    return {
      ok: false,
      error:
        attackProfileResult.status === "error"
          ? attackProfileResult.error
          : "Attack replacement profile was not applicable",
    };
  }
  const attackProfile = attackProfileResult.result;
  const mappingResult = resolvePlayerControlledAttackMapping(
    effect,
    effect.effectId === "attack_transfer_controlled_dead_wizard_token"
      ? {
          ...defaultPlayerControlledAttackSemantics(),
          defenseWindowMode: "COLLECT_ALL_FIRST",
          attackText: "shared",
        }
      : defaultPlayerControlledAttackSemantics()
  );
  if (!mappingResult.ok) return mappingResult;
  return services.resolvePlayerControlledAttack({
    state,
    attackingPlayer: player,
    source,
    effectId: effect.effectId,
    defenseWindowMode: mappingResult.defenseWindowMode,
    attackSemantics: mappingResult.semantics,
    unavoidable: attackProfile.unavoidable,
    attackProfile,
    ...(effect.effectId === "attack_gain_dead_wizard_tokens"
      ? { redirectPolicy: effect.redirectPolicy }
      : {}),
    targetPlan: { kind: "runtimeSelector", effect },
    impact:
      mappingResult.semantics.attackText === "shared"
        ? createSharedAttackEffectImpact(effect)
        : { kind: "effects", effects: [effect] },
  });
}

function resolvePlayerControlledDamageAttack(
  state: GameState,
  player: PlayerState,
  effect: PlayerControlledDamageAttackEffect,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  amount: number,
  collectAttackReplacementProfile: AttackReplacementCollector,
  baseAmountForTarget?: PlayerControlledAttackBaseAmountResolver
): EffectExecutionResult {
  const attackProfileResult = collectAttackReplacementProfile(
    state,
    player,
    source
  );
  if (attackProfileResult.status !== "resolved") {
    return {
      ok: false,
      error:
        attackProfileResult.status === "error"
          ? attackProfileResult.error
          : "Attack replacement profile was not applicable",
    };
  }
  const attackProfile = attackProfileResult.result;
  const mappingResult = resolvePlayerControlledAttackMapping(
    effect,
    defaultPlayerControlledAttackSemantics()
  );
  if (!mappingResult.ok) return mappingResult;
  return services.resolvePlayerControlledAttack({
    state,
    attackingPlayer: player,
    source,
    effectId: effect.effectId,
    defenseWindowMode: mappingResult.defenseWindowMode,
    attackSemantics: mappingResult.semantics,
    unavoidable: attackProfile.unavoidable,
    targetPlan: { kind: "runtimeSelector", effect },
    impact: {
      kind: "damage",
      baseAmount: amount,
      ...(baseAmountForTarget === undefined ? {} : { baseAmountForTarget }),
      sourceOwnerModifierAmount: attackProfile.damageBonus,
      onDamageDealt:
        "onDamageDealt" in effect ? (effect.onDamageDealt ?? []) : [],
      onAvoided: "onAvoided" in effect ? (effect.onAvoided ?? []) : [],
      onKill: "onKill" in effect ? (effect.onKill ?? []) : [],
    },
  });
}

function executeAttackDamage(
  state: GameState,
  player: PlayerState,
  effect: ExecutableAttackDamageRuntimeEffect,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectExecutionResult {
  const costResult = payOptionalCosts(state, player, effect, source, services);
  if (!costResult.ok || costResult.skipped) {
    return costResult.ok ? { ok: true } : costResult;
  }

  return resolvePlayerControlledDamageAttack(
    state,
    player,
    effect,
    source,
    services,
    effect.amount,
    collectAttackReplacementProfile
  );
}

function attackGainStatusHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"attack_gain_status">> {
  return {
    effectId: "attack_gain_status",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
}

function attackGainLimpWandHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"attack_gain_limp_wand">> {
  return {
    effectId: "attack_gain_limp_wand",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
}

function attackDiscardCardsHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"attack_discard_cards">> {
  return {
    effectId: "attack_discard_cards",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
}

type RandomDiscardDamagePlan = {
  cards: readonly CardInstance[];
  amount: number;
};

function createAttackDamageEqualRandomDiscardedHandCostHandler(
  collectAttackReplacementProfile: AttackReplacementCollector,
  calculateEffectiveCardCost: CombatAttackCatalogTools["calculateEffectiveCardCost"]
): EffectRuntimeHandler<
  RuntimeEffectForId<"attack_damage_equal_random_discarded_hand_cost">
> {
  return {
    effectId: "attack_damage_equal_random_discarded_hand_cost",
    execute(state, player, effect, source, services) {
      const opponents = services.getOpponentsInSeatingOrder(state, player);
      const plans = new Map<PlayerState["playerId"], RandomDiscardDamagePlan>();

      for (const opponent of opponents) {
        const available = [...opponent.hand];
        const selectedCards: CardInstance[] = [];
        let amount = 0;
        while (selectedCards.length < effect.discardAmount) {
          if (available.length === 0) break;
          const selectedIndex = state.rng.nextInt(available.length);
          const [card] = available.splice(selectedIndex, 1);
          if (card === undefined) {
            return {
              ok: false,
              error: "Seeded hand discard selected a missing card",
            };
          }
          const definition = state.cardDefinitions.get(card.definitionId);
          if (definition === undefined) {
            return {
              ok: false,
              error: `Missing definition for randomly discarded card ${card.definitionId}`,
            };
          }
          selectedCards.push(card);
          amount += calculateEffectiveCardCost(
            state,
            opponent.playerId,
            definition,
            card
          );
        }
        plans.set(opponent.playerId, { cards: selectedCards, amount });
      }

      const attackProfileResult = collectAttackReplacementProfile(
        state,
        player,
        source
      );
      if (attackProfileResult.status !== "resolved") {
        return {
          ok: false,
          error:
            attackProfileResult.status === "error"
              ? attackProfileResult.error
              : "Attack replacement profile was not applicable",
        };
      }
      const attackProfile = {
        ...attackProfileResult.result,
        unavoidable: true,
      } as const;
      const mappingResult = resolvePlayerControlledAttackMapping(
        effect,
        defaultPlayerControlledAttackSemantics("allInOneInstance")
      );
      if (!mappingResult.ok) return mappingResult;

      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        defenseWindowMode: mappingResult.defenseWindowMode,
        attackSemantics: mappingResult.semantics,
        unavoidable: true,
        attackProfile,
        targetPlan: { kind: "orderedPlayers", players: opponents },
        impact: {
          kind: "damage",
          baseAmount: 0,
          baseAmountForTarget: (_state, _attackingPlayer, targetPlayer) =>
            plans.get(targetPlayer.playerId)?.amount ?? 0,
          sourceOwnerModifierAmount: attackProfile.damageBonus,
          onDamageDealt: [],
          onAvoided: [],
          onKill: [],
          beforeDamage(
            stateBeforeDamage,
            _attackingPlayer,
            targetPlayer,
            attackSource
          ) {
            const plan = plans.get(targetPlayer.playerId);
            if (plan === undefined) {
              return {
                ok: false,
                error: `Missing random discard plan for ${targetPlayer.playerId}`,
              };
            }
            if (plan.cards.some((card) => !targetPlayer.hand.includes(card))) {
              return {
                ok: false,
                error: `Random discard plan changed before attacking ${targetPlayer.playerId}`,
              };
            }
            for (const card of plan.cards) {
              const moved = services.moveCardToPlayerZone(
                stateBeforeDamage,
                card,
                targetPlayer,
                targetPlayer.discard,
                `${targetPlayer.playerId}.discard`,
                effect.effectId,
                attackSource
              );
              if (!moved) {
                return {
                  ok: false,
                  error: `Cannot move randomly discarded card ${card.instanceId}`,
                };
              }
              recordGameEvent(stateBeforeDamage, {
                type: "effectCardDiscarded",
                playerId: targetPlayer.playerId,
                cardInstanceId: attackSource.cardInstanceId,
                definitionId: attackSource.definitionId,
                targetCardInstanceId: card.instanceId,
                targetDefinitionId: card.definitionId,
                effectId: effect.effectId,
                sourceType: attackSource.sourceType,
              });
            }
            return { ok: true };
          },
        },
      });
    },
  };
}

export function executeAttackDiscardCards(
  state: GameState,
  targetPlayer: PlayerState,
  amount: number,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  for (let discarded = 0; discarded < amount; discarded += 1) {
    const choices: EffectChoice[] = targetPlayer.hand.map((card) => ({
      choiceKind: "cardTarget" as const,
      choiceId: card.instanceId,
      cards: [card],
      amount: 1,
    }));
    if (choices.length === 0) {
      return { ok: true };
    }

    const choice = services.chooseEffectChoice(
      state,
      targetPlayer,
      source,
      "attack_discard_cards",
      choices
    );
    if (choice === undefined) {
      return { ok: true };
    }
    if (choice.choiceKind !== "cardTarget" || choice.cards.length !== 1) {
      return {
        ok: false,
        error: "Attack discard choice must contain exactly one hand card",
      };
    }
    const card = choice.cards[0];
    if (card === undefined || !targetPlayer.hand.includes(card)) {
      return {
        ok: false,
        error: "Chosen attack discard card is no longer in the target hand",
      };
    }

    const moved = services.moveCardToPlayerZone(
      state,
      card,
      targetPlayer,
      targetPlayer.discard,
      `${targetPlayer.playerId}.discard`,
      "attack_discard_cards",
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move attack discard card ${card.instanceId}`,
      };
    }
    recordGameEvent(state, {
      type: "effectCardDiscarded",
      playerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: "attack_discard_cards",
      sourceType: source.sourceType,
    });
  }

  return { ok: true };
}

function directionalChainAttackHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"directional_chain_attack">> {
  return {
    effectId: "directional_chain_attack",
    execute(state, player, effect, source, services) {
      const leftFoes = services.getOpponentsInSeatingOrder(state, player);
      const rightFoes = [...leftFoes].reverse();
      const directionChoice = services.chooseEffectChoice(
        state,
        player,
        source,
        "directional_chain_attack",
        [
          {
            choiceKind: "directionalPlayerTarget",
            choiceId: "left",
            direction: "left",
            players: leftFoes,
          },
          {
            choiceKind: "directionalPlayerTarget",
            choiceId: "right",
            direction: "right",
            players: rightFoes,
          },
        ]
      );
      const chosenFoes =
        directionChoice?.choiceKind === "directionalPlayerTarget"
          ? directionChoice.players
          : [];
      if (chosenFoes.length === 0) {
        return { ok: true };
      }

      const chosenDirection =
        directionChoice?.choiceKind === "directionalPlayerTarget"
          ? directionChoice.direction
          : "left";
      let targetIndex = 0;
      const seenRecurrences = new Set<string>();
      while (true) {
        const targetPlayer = chosenFoes[targetIndex];
        if (targetPlayer === undefined) {
          return { ok: true };
        }

        const choicePolicyState =
          state.effectChoiceStrategy === undefined
            ? null
            : state.effectChoiceStrategy.getState?.();
        if (choicePolicyState !== undefined) {
          const recurrenceKey = createAttackChainRecurrenceKey(
            state,
            {
              direction: chosenDirection,
              targetIndex,
              targetPlayerId: targetPlayer.playerId,
              choicePolicyState,
            },
            source
          );
          if (seenRecurrences.has(recurrenceKey)) {
            recordGameEvent(state, {
              type: "attackChainCycleDetected",
              playerId: player.playerId,
              cardInstanceId: source.cardInstanceId,
              definitionId: source.definitionId,
              effectId: effect.effectId,
              sourceType: source.sourceType,
            });
            return {
              ok: true,
              cycleOutcome: {
                kind: "provenAttackChainCycle",
                effectId: effect.effectId,
              },
            };
          }
          seenRecurrences.add(recurrenceKey);
        }

        const attackProfileResult = collectAttackReplacementProfile(
          state,
          player,
          source
        );
        if (attackProfileResult.status !== "resolved") {
          return {
            ok: false,
            error:
              attackProfileResult.status === "error"
                ? attackProfileResult.error
                : "Attack replacement profile was not applicable",
          };
        }
        const attackProfile = attackProfileResult.result;
        const mappingResult = resolvePlayerControlledAttackMapping(effect, {
          ...defaultPlayerControlledAttackSemantics(),
          instanceMode: "chain",
          continuation: "onKill",
        });
        if (!mappingResult.ok) return mappingResult;
        const attackResult = services.resolvePlayerControlledAttack({
          state,
          attackingPlayer: player,
          source,
          effectId: effect.effectId,
          defenseWindowMode: mappingResult.defenseWindowMode,
          attackSemantics: mappingResult.semantics,
          unavoidable: attackProfile.unavoidable,
          targetPlan: {
            kind: "orderedPlayers",
            players: [targetPlayer],
            continueWhile: "targetKilled",
          },
          impact: {
            kind: "damage",
            baseAmount: effect.amount,
            sourceOwnerModifierAmount: attackProfile.damageBonus,
            onDamageDealt: effect.onDamageDealt ?? [],
            onKill: effect.onKill ?? [],
          },
        });
        if (!attackResult.ok || attackResult.gameEnd !== undefined) {
          return attackResult;
        }

        if (attackResult.requestedTargetKilled !== true) {
          return { ok: true };
        }

        targetIndex = (targetIndex + 1) % chosenFoes.length;
      }
    },
  };
}

function sequentialAttackDamageHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"sequential_attack_damage">> {
  return {
    effectId: "sequential_attack_damage",
    execute(state, player, effect, source, services) {
      let killedWizardCount = 0;

      for (
        let attackIndex = 0;
        attackIndex < effect.attackCount;
        attackIndex += 1
      ) {
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
          continue;
        }
        if (targetResult.choice.choiceType !== "player") {
          return {
            ok: false,
            error: "Sequential attack requires a player target",
          };
        }

        const attackProfileResult = collectAttackReplacementProfile(
          state,
          player,
          source
        );
        if (attackProfileResult.status !== "resolved") {
          return {
            ok: false,
            error:
              attackProfileResult.status === "error"
                ? attackProfileResult.error
                : "Attack replacement profile was not applicable",
          };
        }
        const attackProfile = attackProfileResult.result;
        const mappingResult = resolvePlayerControlledAttackMapping(effect, {
          ...defaultPlayerControlledAttackSemantics(),
          instanceMode: "sequential",
          continuation: "fixedCount",
        });
        if (!mappingResult.ok) return mappingResult;
        const attackResult = services.resolvePlayerControlledAttack({
          state,
          attackingPlayer: player,
          source,
          effectId: effect.effectId,
          defenseWindowMode: mappingResult.defenseWindowMode,
          attackSemantics: mappingResult.semantics,
          unavoidable: attackProfile.unavoidable,
          attackProfile,
          reportResolvedTargetKilled: true,
          targetPlan: {
            kind: "orderedPlayers",
            players: [targetResult.choice.player],
            continueWhile: "targetKilled",
          },
          impact: {
            kind: "damage",
            baseAmount: effect.amount,
            sourceOwnerModifierAmount: attackProfile.damageBonus,
            onDamageDealt: [],
            onAvoided: [],
            onKill: [],
          },
        });
        if (!attackResult.ok || attackResult.gameEnd !== undefined) {
          return attackResult;
        }
        if (attackResult.resolvedTargetKilled === true) {
          killedWizardCount += 1;
        }
      }

      const rewardAmount = killedWizardCount * effect.powerPerKill;
      if (rewardAmount === 0) {
        return { ok: true };
      }

      const powerBefore = state.turn.power;
      state.turn.power += rewardAmount;
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
}

type MultiTargetAttackEffectId =
  | "multi_target_attack"
  | "multi_target_neighbor_attack";

function multiTargetAttackHandler<Id extends MultiTargetAttackEffectId>(
  effectId: Id,
  collectAttackReplacementProfile: AttackReplacementCollector,
  resolveTargetPlayers: (
    opponents: readonly PlayerState[]
  ) => readonly PlayerState[]
): EffectRuntimeHandler<RuntimeEffectForId<Id>> {
  return {
    effectId,
    execute(state, player, effect, source, services) {
      const attackProfileResult = collectAttackReplacementProfile(
        state,
        player,
        source
      );
      if (attackProfileResult.status !== "resolved") {
        return {
          ok: false,
          error:
            attackProfileResult.status === "error"
              ? attackProfileResult.error
              : "Attack replacement profile was not applicable",
        };
      }
      const attackProfile = attackProfileResult.result;
      const opponents = services.getOpponentsInSeatingOrder(state, player);
      const targetPlayers = resolveTargetPlayers(opponents);
      const mappingResult = resolvePlayerControlledAttackMapping(
        effect,
        defaultPlayerControlledAttackSemantics("allInOneInstance")
      );
      if (!mappingResult.ok) return mappingResult;
      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        defenseWindowMode: mappingResult.defenseWindowMode,
        attackSemantics: mappingResult.semantics,
        unavoidable: attackProfile.unavoidable,
        targetPlan: {
          kind: "orderedPlayers",
          players: targetPlayers,
        },
        impact: {
          kind: "damage",
          baseAmount: effect.amount,
          sourceOwnerModifierAmount: attackProfile.damageBonus,
          onDamageDealt: effect.onDamageDealt ?? [],
          onKill: effect.onKill ?? [],
        },
      });
    },
  };
}

function buildPositiveIntegerDistributions(
  total: number,
  targetCount: number
): number[][] {
  if (targetCount < 1 || targetCount > total) {
    return [];
  }

  const distributions: number[][] = [];
  const current = Array.from({ length: targetCount }, () => 1);

  function visit(index: number, remaining: number): void {
    if (index === targetCount - 1) {
      current[index] = remaining;
      distributions.push([...current]);
      return;
    }

    const minimumForRest = targetCount - index - 1;
    for (let amount = 1; amount <= remaining - minimumForRest; amount += 1) {
      current[index] = amount;
      visit(index + 1, remaining - amount);
    }
  }

  visit(0, total);
  return distributions;
}

function distributedAttackDamageHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"distributed_attack_damage">> {
  return {
    effectId: "distributed_attack_damage",
    execute(state, player, effect, source, services) {
      const opponents = services.getOpponentsInSeatingOrder(state, player);
      const distributions = buildPositiveIntegerDistributions(
        effect.amount,
        opponents.length
      );
      if (distributions.length === 0) {
        return { ok: true };
      }

      const choices: EffectChoice[] = distributions.map((amounts) => ({
        choiceKind: "damageDistribution",
        choiceId: `distribution:${amounts.join(",")}`,
        players: opponents,
        amounts,
        amount: effect.amount,
      }));
      const selectedChoice = services.chooseEffectChoice(
        state,
        player,
        source,
        effect.effectId,
        choices
      );
      if (
        selectedChoice?.choiceKind !== "damageDistribution" ||
        selectedChoice.players.length !== opponents.length ||
        selectedChoice.amounts.length !== opponents.length ||
        selectedChoice.amount !== effect.amount ||
        selectedChoice.amounts.some(
          (amount) => !Number.isSafeInteger(amount) || amount < 1
        ) ||
        selectedChoice.amounts.reduce((total, amount) => total + amount, 0) !==
          effect.amount
      ) {
        return {
          ok: false,
          error:
            "Distributed attack choice must contain positive integer amounts summing to the attack total",
        };
      }

      const attackProfileResult = collectAttackReplacementProfile(
        state,
        player,
        source
      );
      if (attackProfileResult.status !== "resolved") {
        return {
          ok: false,
          error:
            attackProfileResult.status === "error"
              ? attackProfileResult.error
              : "Attack replacement profile was not applicable",
        };
      }
      const amountsByPlayerId = new Map(
        selectedChoice.players.map((targetPlayer, index) => [
          targetPlayer.playerId,
          selectedChoice.amounts[index] ?? 0,
        ])
      );
      const attackProfile = attackProfileResult.result;
      const mappingResult = resolvePlayerControlledAttackMapping(
        effect,
        defaultPlayerControlledAttackSemantics("allInOneInstance")
      );
      if (!mappingResult.ok) return mappingResult;
      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        defenseWindowMode: mappingResult.defenseWindowMode,
        attackSemantics: mappingResult.semantics,
        unavoidable: attackProfile.unavoidable,
        attackProfile,
        targetPlan: { kind: "orderedPlayers", players: opponents },
        impact: {
          kind: "damage",
          baseAmount: effect.amount,
          baseAmountForTarget: (_state, _attackingPlayer, targetPlayer) =>
            amountsByPlayerId.get(targetPlayer.playerId) ?? 0,
          sourceOwnerModifierAmount: attackProfile.damageBonus,
          onDamageDealt: effect.onDamageDealt ?? [],
          onAvoided: effect.onAvoided ?? [],
          onKill: effect.onKill ?? [],
        },
      });
    },
  };
}

export function executeAttackOutcomeBranch(
  state: GameState,
  player: PlayerState,
  branch: AttackOutcomeBranch,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: ResolvedAttackBranchContext,
  attackEffectId: RuntimeEffectId,
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (branch.effectId === "draw_cards") {
    services.drawCards(state, player, branch.amount, branch.effectId, source);
    return { ok: true };
  }

  if (branch.effectId === "end_game_if_original_target_killed") {
    if (!attackResult.killed) {
      return { ok: true };
    }
    return {
      ok: true,
      gameEnd: {
        reason: "playerDefeated",
        winnerPlayerId: player.playerId,
        resolution: "endOfTurn",
      },
    };
  }

  if (branch.effectId === "attack_discard_cards") {
    return executeAttackDiscardCards(
      state,
      targetPlayer,
      branch.amount,
      source,
      services
    );
  }

  if (branch.effectId === "gain_chips") {
    const amount = branch.amount;
    const chipsBefore = player.chips;
    player.chips += amount;
    recordGameEvent(state, {
      type: "effectChipsChanged",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "gain_chips",
      chipsBefore,
      chipsAfter: player.chips,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  if (branch.effectId === "gain_chips_equal_damage_dealt") {
    let remaining = attackResult.damageDealt;
    const stolen = Math.min(targetPlayer.chips, remaining);
    if (stolen > 0) {
      targetPlayer.chips -= stolen;
      player.chips += stolen;
      remaining -= stolen;
    }
    if (remaining > 0) player.chips += remaining;
    recordGameEvent(state, {
      type: "effectChipsChanged",
      playerId: player.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "gain_chips_equal_damage_dealt",
      amount: attackResult.damageDealt,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  if (branch.effectId === "heal_equal_damage_dealt") {
    services.healPlayer(
      state,
      player,
      player,
      attackResult.damageDealt,
      "heal_equal_damage_dealt",
      source
    );
    return { ok: true };
  }

  if (branch.effectId === "return_discard_to_hand") {
    return executeReturnDiscardToHand(
      state,
      player,
      branch.amount,
      source,
      services
    );
  }

  if (branch.effectId === "transfer_limp_wands_to_killed_target") {
    return transferUpToLimpWandsToPlayer(
      state,
      player,
      targetPlayer,
      branch.amount,
      attackEffectId,
      source,
      services
    );
  }

  if (branch.effectId === "gain_status" && branch.statusId === "dingler") {
    return services.gainDinglerStatus(
      state,
      targetPlayer,
      "gain_status",
      source
    );
  }

  return {
    ok: false,
    error: `Unsupported attack branch ${services.asString(branch.effectId)}`,
  };
}

type CombatAttackEffectDefinition<Id extends CombatAttackEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};
type AnyCombatAttackEffectDefinition = {
  [Id in CombatAttackEffectId]: CombatAttackEffectDefinition<Id>;
}[CombatAttackEffectId];

export function createCombatAttackEffectDefinitions(
  tools: CombatAttackCatalogTools
): readonly AnyCombatAttackEffectDefinition[] {
  const attackTimings = [
    "activation",
    "onPlay",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const supportedSourceKinds = [
    "card",
  ] as const satisfies EffectRuntimeSupportedSourceKinds;
  const { bindRuntimeEffectDecoder, collectAttackReplacementProfile } = tools;
  const attackDamageHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_damage">
  > = {
    effectId: "attack_damage",
    execute(state, player, effect, source, services) {
      return executeAttackDamage(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const optionalSpendChipAttackDamageHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"optional_spend_chip_attack_damage">
  > = {
    effectId: "optional_spend_chip_attack_damage",
    execute(state, player, effect, source, services) {
      const attackEffect: NormalizedOptionalSpendChipAttackDamageRuntimeEffect =
        {
          ...effect,
          optional: true,
          costs: [{ costId: "spend_chips", amount: effect.chipCost }],
        };
      return executeAttackDamage(
        state,
        player,
        attackEffect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const attackDamageEqualRememberedCardCostHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_damage_equal_remembered_card_cost">
  > = {
    effectId: "attack_damage_equal_remembered_card_cost",
    execute(state, player, effect, source, services) {
      const amount = state.turn.rememberedDestroyedLegendCost ?? 0;
      if (amount <= 0) return { ok: true };
      return resolvePlayerControlledDamageAttack(
        state,
        player,
        effect,
        source,
        services,
        amount,
        collectAttackReplacementProfile
      );
    },
  };
  const attackDestroyTopLegendDeckThenDamageEqualCostHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_destroy_top_legend_deck_then_damage_equal_cost">
  > = {
    effectId: "attack_destroy_top_legend_deck_then_damage_equal_cost",
    execute(state, player, effect, source, services) {
      const targetResult = services.resolveTargetChoice(
        state,
        player,
        effect,
        source
      );
      if (!targetResult.ok) return targetResult;
      if (targetResult.choice === undefined) return { ok: true };
      if (targetResult.choice.choiceType !== "player") {
        return { ok: false, error: "Attack effect requires a player target" };
      }

      const legendCard = peekLegendDeckCard(state);
      if (legendCard === undefined) return { ok: true };
      const legendDefinition = state.cardDefinitions.get(
        legendCard.definitionId
      );
      if (legendDefinition === undefined) {
        return {
          ok: false,
          error: `Missing legend definition ${legendCard.definitionId}`,
        };
      }
      const amount = tools.calculateEffectiveCardCost(
        state,
        player.playerId,
        legendDefinition,
        legendCard
      );
      const attackProfileResult = collectAttackReplacementProfile(
        state,
        player,
        source
      );
      if (attackProfileResult.status !== "resolved") {
        return {
          ok: false,
          error:
            attackProfileResult.status === "error"
              ? attackProfileResult.error
              : "Attack replacement profile was not applicable",
        };
      }
      const attackProfile = attackProfileResult.result;
      const mappingResult = resolvePlayerControlledAttackMapping(
        effect,
        defaultPlayerControlledAttackSemantics()
      );
      if (!mappingResult.ok) return mappingResult;

      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        defenseWindowMode: mappingResult.defenseWindowMode,
        attackSemantics: mappingResult.semantics,
        unavoidable: attackProfile.unavoidable,
        attackProfile,
        targetPlan: {
          kind: "orderedPlayers",
          players: [targetResult.choice.player],
        },
        impact: {
          kind: "damage",
          baseAmount: amount,
          sourceOwnerModifierAmount: attackProfile.damageBonus,
          onDamageDealt: effect.onDamageDealt ?? [],
          onKill: effect.onKill ?? [],
          beforeDamage(
            stateBeforeDamage,
            _attackingPlayer,
            targetPlayer,
            attackSource
          ) {
            const currentLegendCard = peekLegendDeckCard(stateBeforeDamage);
            if (currentLegendCard === undefined) {
              return {
                ok: false,
                error: "Legend card disappeared before destruction",
              };
            }
            if (currentLegendCard.instanceId !== legendCard.instanceId) {
              return {
                ok: false,
                error: "Legend top card changed before destruction",
              };
            }
            return destroyOwnedCard(
              stateBeforeDamage,
              targetPlayer,
              currentLegendCard,
              effect.effectId,
              attackSource,
              services
            );
          },
        },
      });
    },
  };
  const attackDamageEqualToControlledCardCostHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_damage_equal_to_controlled_card_cost">
  > = {
    effectId: "attack_damage_equal_to_controlled_card_cost",
    execute(state, player, effect, source, services) {
      const costResult = payOptionalCosts(
        state,
        player,
        effect,
        source,
        services
      );
      if (!costResult.ok || costResult.skipped) {
        return costResult.ok ? { ok: true } : costResult;
      }
      const amountResult = resolveControlledCardCost(
        state,
        player,
        effect,
        source,
        services,
        tools.calculateEffectiveCardCost
      );
      if (!amountResult.ok) return amountResult;
      if (amountResult.amount <= 0) return { ok: true };
      return resolvePlayerControlledDamageAttack(
        state,
        player,
        effect,
        source,
        services,
        amountResult.amount,
        collectAttackReplacementProfile
      );
    },
  };
  const conditionalActivationAttackDamageHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"conditional_activation_attack_damage">
  > = {
    effectId: "conditional_activation_attack_damage",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledDamageAttack(
        state,
        player,
        effect,
        source,
        services,
        effect.amount,
        collectAttackReplacementProfile
      );
    },
  };
  const activationAttackDamagePerControlledCardTypeHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"activation_attack_damage_per_controlled_card_type">
  > = {
    effectId: "activation_attack_damage_per_controlled_card_type",
    execute(state, player, effect, source, services) {
      const amount =
        countControlledCardsOfType(state, player, effect.cardType) *
        effect.amountPerCard;
      return resolvePlayerControlledDamageAttack(
        state,
        player,
        effect,
        source,
        services,
        amount,
        collectAttackReplacementProfile
      );
    },
  };
  const attackDamagePerControlledDeadWizardTokenHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_damage_per_controlled_dead_wizard_token">
  > = {
    effectId: "attack_damage_per_controlled_dead_wizard_token",
    execute(state, player, effect, source, services) {
      const amount =
        getControlledDeadWizardTokenCount(state, player) *
        effect.amountPerDeadWizardToken;
      if (amount === 0) {
        return { ok: true };
      }
      return resolvePlayerControlledDamageAttack(
        state,
        player,
        effect,
        source,
        services,
        amount,
        collectAttackReplacementProfile,
        (_state, currentPlayer) =>
          getControlledDeadWizardTokenCount(_state, currentPlayer) *
          effect.amountPerDeadWizardToken
      );
    },
  };
  const attackGainDeadWizardTokensHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_gain_dead_wizard_tokens">
  > = {
    effectId: "attack_gain_dead_wizard_tokens",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const attackTransferControlledDeadWizardTokenHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_transfer_controlled_dead_wizard_token">
  > = {
    effectId: "attack_transfer_controlled_dead_wizard_token",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const attackKillAndReplaceDeadWizardTokenHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_kill_and_replace_dead_wizard_token">
  > = {
    effectId: "attack_kill_and_replace_dead_wizard_token",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const attackRevealAndPlayFoeDeckCardHandler: EffectRuntimeHandler<
    RuntimeEffectForId<"attack_reveal_and_play_foe_deck_card">
  > = {
    effectId: "attack_reveal_and_play_foe_deck_card",
    execute(state, player, effect, source, services) {
      return resolvePlayerControlledEffectsAttack(
        state,
        player,
        effect,
        source,
        services,
        collectAttackReplacementProfile
      );
    },
  };
  const attackDamageEqualRandomDiscardedHandCostHandler =
    createAttackDamageEqualRandomDiscardedHandCostHandler(
      collectAttackReplacementProfile,
      tools.calculateEffectiveCardCost
    );

  return [
    {
      effectId: "attack_damage",
      decoder: bindRuntimeEffectDecoder("attack_damage"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDamageHandler,
    },
    {
      effectId: "attack_damage_per_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "attack_damage_per_controlled_dead_wizard_token"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDamagePerControlledDeadWizardTokenHandler,
    },
    {
      effectId: "attack_damage_equal_remembered_card_cost",
      decoder: bindRuntimeEffectDecoder(
        "attack_damage_equal_remembered_card_cost"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDamageEqualRememberedCardCostHandler,
    },
    {
      effectId: "attack_gain_dead_wizard_tokens",
      decoder: bindRuntimeEffectDecoder("attack_gain_dead_wizard_tokens"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackGainDeadWizardTokensHandler,
    },
    {
      effectId: "attack_transfer_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "attack_transfer_controlled_dead_wizard_token"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackTransferControlledDeadWizardTokenHandler,
    },
    {
      effectId: "attack_kill_and_replace_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "attack_kill_and_replace_dead_wizard_token"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackKillAndReplaceDeadWizardTokenHandler,
    },
    {
      effectId: "attack_damage_equal_to_controlled_card_cost",
      decoder: bindRuntimeEffectDecoder(
        "attack_damage_equal_to_controlled_card_cost"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDamageEqualToControlledCardCostHandler,
    },
    {
      effectId: "attack_destroy_top_legend_deck_then_damage_equal_cost",
      decoder: bindRuntimeEffectDecoder(
        "attack_destroy_top_legend_deck_then_damage_equal_cost"
      ),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDestroyTopLegendDeckThenDamageEqualCostHandler,
    },
    {
      effectId: "attack_discard_cards",
      decoder: bindRuntimeEffectDecoder("attack_discard_cards"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDiscardCardsHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "attack_damage_equal_random_discarded_hand_cost",
      decoder: bindRuntimeEffectDecoder(
        "attack_damage_equal_random_discarded_hand_cost"
      ),
      supportedTimings: ["onPlay"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackDamageEqualRandomDiscardedHandCostHandler,
    },
    {
      effectId: "attack_reveal_and_play_foe_deck_card",
      decoder: bindRuntimeEffectDecoder("attack_reveal_and_play_foe_deck_card"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackRevealAndPlayFoeDeckCardHandler,
    },
    {
      effectId: "attack_gain_limp_wand",
      decoder: bindRuntimeEffectDecoder("attack_gain_limp_wand"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackGainLimpWandHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "attack_gain_status",
      decoder: bindRuntimeEffectDecoder("attack_gain_status"),
      supportedTimings: ["activation", "onPlay"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: attackGainStatusHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "activation_attack_damage_per_controlled_card_type",
      decoder: bindRuntimeEffectDecoder(
        "activation_attack_damage_per_controlled_card_type"
      ),
      supportedTimings: ["activation"],
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: activationAttackDamagePerControlledCardTypeHandler,
    },
    {
      effectId: "conditional_activation_attack_damage",
      decoder: bindRuntimeEffectDecoder("conditional_activation_attack_damage"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: conditionalActivationAttackDamageHandler,
    },
    {
      effectId: "directional_chain_attack",
      decoder: bindRuntimeEffectDecoder("directional_chain_attack"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: directionalChainAttackHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "distributed_attack_damage",
      decoder: bindRuntimeEffectDecoder("distributed_attack_damage"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: distributedAttackDamageHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "sequential_attack_damage",
      decoder: bindRuntimeEffectDecoder("sequential_attack_damage"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: sequentialAttackDamageHandler(collectAttackReplacementProfile),
    },
    {
      effectId: "multi_target_attack",
      decoder: bindRuntimeEffectDecoder("multi_target_attack"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: multiTargetAttackHandler(
        "multi_target_attack",
        collectAttackReplacementProfile,
        (opponents) => opponents
      ),
    },
    {
      effectId: "multi_target_neighbor_attack",
      decoder: bindRuntimeEffectDecoder("multi_target_neighbor_attack"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: multiTargetAttackHandler(
        "multi_target_neighbor_attack",
        collectAttackReplacementProfile,
        getDistinctAdjacentFoes
      ),
    },
    {
      effectId: "optional_spend_chip_attack_damage",
      decoder: bindRuntimeEffectDecoder("optional_spend_chip_attack_damage"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: optionalSpendChipAttackDamageHandler,
    },
  ];
}
