import type { CardDefinition } from "./data.js";
import { buildControlledObjectView } from "./control-ledger.js";
import { countControlledCardsOfType } from "./card-type-runtime.js";
import { getControlledDeadWizardTokenCount } from "./dead-wizard-token-like.js";
import { recordGameEvent } from "./event-recorder.js";
import { transferUpToLimpWandsToPlayer } from "./effect-runtime-special-card-stack.js";
import { executeReturnDiscardToHand } from "./effect-runtime-cards-ownership-choice.js";
import type {
  AttackReplacementProfile,
  DamageResult,
  EffectChoice,
  EffectExecutionResult,
  EffectRuntimeOperationResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import {
  createUnsupportedEffectHandler,
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
  RuntimeEffectTarget,
  RuntimeEffectTargetSelector,
} from "./runtime-effect.js";
import {
  allEffectRuntimeModes,
  type EffectRuntimeSupportedModes,
  type EffectRuntimeSupportedSourceKinds,
  type EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type CombatAttackEffectId =
  | "attack_damage"
  | "attack_damage_per_controlled_dead_wizard_token"
  | "attack_damage_equal_remembered_card_cost"
  | "attack_damage_equal_to_controlled_card_cost"
  | "attack_destroy_top_legend_deck_then_damage_equal_cost"
  | "attack_discard_cards"
  | "attack_gain_limp_wand"
  | "attack_gain_status"
  | "activation_attack_damage_per_controlled_card_type"
  | "conditional_activation_attack_damage"
  | "directional_chain_attack"
  | "multi_target_attack"
  | "optional_spend_chip_attack_damage";

export const combatAttackEffectIds = [
  "attack_damage",
  "attack_damage_per_controlled_dead_wizard_token",
  "attack_damage_equal_remembered_card_cost",
  "attack_damage_equal_to_controlled_card_cost",
  "attack_destroy_top_legend_deck_then_damage_equal_cost",
  "attack_discard_cards",
  "attack_gain_limp_wand",
  "attack_gain_status",
  "activation_attack_damage_per_controlled_card_type",
  "conditional_activation_attack_damage",
  "directional_chain_attack",
  "multi_target_attack",
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
  optionalTarget: OptionalField<RuntimeEffectTarget>;
  optionalTargetSelector: OptionalField<RuntimeEffectTargetSelector>;
  optionalCosts: OptionalField<RuntimeEffectCost[]>;
  optionalAttackBranches: OptionalField<AttackOutcomeBranch[]>;
  selectorTarget<Selector extends RuntimeEffectTargetSelector>(
    selector: Selector
  ): ValueDecoder<{ selector: Selector }>;
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
    optionalTarget,
    optionalTargetSelector,
    optionalCosts,
    optionalAttackBranches,
    selectorTarget,
    requireTargetSelector,
    oneOf,
  } = tools;
  return {
    attack_damage: defineDecoder(
      "attack_damage",
      {
        effectId: required(literal("attack_damage")),
        timing: optionalTiming,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        costs: optionalCosts,
        optional: optional(booleanValue),
        onDamageDealt: optionalAttackBranches,
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
        amountPerDeadWizardToken: required(positiveInteger),
        targetSelector: required(literal("eachFoe")),
        onDamageDealt: optionalAttackBranches,
        onKill: optionalAttackBranches,
      }
    ),
    attack_damage_equal_remembered_card_cost: defineDecoder(
      "attack_damage_equal_remembered_card_cost",
      {
        effectId: required(literal("attack_damage_equal_remembered_card_cost")),
        timing: optionalTiming,
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
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
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
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
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onKill: optionalAttackBranches,
        damageUsesDestroyedCardCost: required(literal(true)),
        destroyedCardSource: required(literal("legendDeck")),
      }
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
    attack_gain_limp_wand: defineDecoder("attack_gain_limp_wand", {
      effectId: required(literal("attack_gain_limp_wand")),
      timing: optionalTiming,
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
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
        onKill: optionalAttackBranches,
      },
      requireTargetSelector("directional attack", ["leftOrRightFoe"])
    ),
    multi_target_attack: defineDecoder("multi_target_attack", {
      effectId: required(literal("multi_target_attack")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      target: required(selectorTarget("opponentPlayers")),
      onDamageDealt: optionalAttackBranches,
      onKill: optionalAttackBranches,
    }),
    optional_spend_chip_attack_damage: defineDecoder(
      "optional_spend_chip_attack_damage",
      {
        effectId: required(literal("optional_spend_chip_attack_damage")),
        timing: optionalTiming,
        amount: required(positiveInteger),
        target: optionalTarget,
        targetSelector: optionalTargetSelector,
        onDamageDealt: optionalAttackBranches,
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

function resolvePlayerControlledDamageAttack(
  state: GameState,
  player: PlayerState,
  effect: PlayerControlledDamageAttackEffect,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  amount: number,
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
  return services.resolvePlayerControlledAttack({
    state,
    attackingPlayer: player,
    source,
    effectId: effect.effectId,
    unavoidable: attackProfile.unavoidable,
    targetPlan: { kind: "runtimeSelector", effect },
    impact: {
      kind: "damage",
      baseAmount: amount,
      sourceOwnerModifierAmount: attackProfile.damageBonus,
      onDamageDealt:
        "onDamageDealt" in effect ? (effect.onDamageDealt ?? []) : [],
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
      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        unavoidable: attackProfile.unavoidable,
        attackProfile,
        targetPlan: { kind: "runtimeSelector", effect },
        impact: { kind: "effects", effects: [effect] },
      });
    },
  };
}

function attackGainLimpWandHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"attack_gain_limp_wand">> {
  return {
    effectId: "attack_gain_limp_wand",
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
      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        unavoidable: attackProfile.unavoidable,
        attackProfile,
        targetPlan: { kind: "runtimeSelector", effect },
        impact: { kind: "effects", effects: [effect] },
      });
    },
  };
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
      const attackedPlayerIds = new Set<PlayerState["playerId"]>();
      const foes = chosenFoes.filter((targetPlayer) => {
        if (attackedPlayerIds.has(targetPlayer.playerId)) {
          return false;
        }
        attackedPlayerIds.add(targetPlayer.playerId);
        return true;
      });
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

      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        unavoidable: attackProfile.unavoidable,
        targetPlan: {
          kind: "orderedPlayers",
          players: foes,
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
    },
  };
}

function multiTargetAttackHandler(
  collectAttackReplacementProfile: AttackReplacementCollector
): EffectRuntimeHandler<RuntimeEffectForId<"multi_target_attack">> {
  return {
    effectId: "multi_target_attack",
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
      return services.resolvePlayerControlledAttack({
        state,
        attackingPlayer: player,
        source,
        effectId: effect.effectId,
        unavoidable: attackProfile.unavoidable,
        targetPlan: {
          kind: "orderedPlayers",
          players: services.getOpponentsInSeatingOrder(state, player),
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

export function executeAttackOutcomeBranch(
  state: GameState,
  player: PlayerState,
  branch: AttackOutcomeBranch,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: DamageResult,
  attackEffectId: RuntimeEffectId,
  services: EffectRuntimeServices
): EffectExecutionResult {
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
        collectAttackReplacementProfile
      );
    },
  };

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
      handler: createUnsupportedEffectHandler(
        "attack_destroy_top_legend_deck_then_damage_equal_cost"
      ),
    },
    {
      effectId: "attack_discard_cards",
      decoder: bindRuntimeEffectDecoder("attack_discard_cards"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: createUnsupportedEffectHandler("attack_discard_cards"),
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
      effectId: "multi_target_attack",
      decoder: bindRuntimeEffectDecoder("multi_target_attack"),
      supportedTimings: attackTimings,
      supportedModes: allEffectRuntimeModes,
      supportedSourceKinds,
      handler: multiTargetAttackHandler(collectAttackReplacementProfile),
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
