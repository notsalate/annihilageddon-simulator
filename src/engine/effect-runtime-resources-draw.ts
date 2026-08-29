import { getPhysicalCardLedger } from "./control-ledger.js";
import { getControlledDeadWizardTokenCount } from "./dead-wizard-token-like.js";
import { recordDeckReshuffle, recordGameEvent } from "./event-recorder.js";
import type { EffectSourceContext } from "./effect-runtime-registry.js";
import type { EffectRuntimeHandler } from "./effect-runtime-family-types.js";
import type { RuntimeEffectDecoder } from "./runtime-effect-decoder.js";
import type {
  EffectTiming,
  RuntimeEffectCondition,
  RuntimeEffectForId,
  RuntimeEffectId,
} from "./runtime-effect.js";
import type {
  EffectRuntimeSupportedModes,
  EffectRuntimeSupportedSourceKinds,
  EffectRuntimeSupportedTimings,
} from "./effect-runtime-catalog-shared.js";
import type {
  ObjectFields,
  OptionalField,
  RequiredField,
  ValueDecoder,
} from "./effect-runtime-family-support.js";
import type { GameState, PlayerState } from "./setup.js";

type EffectWithOptionalTiming<Id extends string> = {
  effectId: Id;
  timing?: EffectTiming;
};

type PositiveAmount = { amount: number };
type Conditioned = { condition?: RuntimeEffectCondition };
type DecodedPayloadValidator<Id extends ResourceDrawEffectId> = (
  subjectId: string,
  effect: RuntimeEffectForId<Id>
) => string[];

export type ResourceDrawEffectId =
  | "gain_chips"
  | "gain_chips_per_player_with_status"
  | "gain_chips_per_controlled_dead_wizard_token"
  | "draw_cards"
  | "draw_cards_for_each_player"
  | "draw_cards_for_self_and_chosen_foe";

export type GainChipsRuntimeEffect = EffectWithOptionalTiming<"gain_chips"> &
  PositiveAmount &
  Conditioned & {
    cardTypes?: string[];
    isOngoing?: true;
  };

export type GainChipsPerPlayerWithStatusRuntimeEffect =
  EffectWithOptionalTiming<"gain_chips_per_player_with_status"> & {
    amountPerPlayer: number;
    status: "dingler";
  };

export type GainChipsPerControlledDeadWizardTokenRuntimeEffect =
  EffectWithOptionalTiming<"gain_chips_per_controlled_dead_wizard_token"> & {
    amountPerDeadWizardToken: number;
    targetSelector?: "eachPlayerClockwiseFromActive";
  };

export type DrawCardsRuntimeEffect = EffectWithOptionalTiming<"draw_cards"> &
  PositiveAmount;
export type DrawCardsForEachPlayerRuntimeEffect =
  EffectWithOptionalTiming<"draw_cards_for_each_player"> & {
    amount: number;
    targetSelector: "eachPlayerClockwiseFromActive";
  };
export type DrawCardsForSelfAndChosenFoeRuntimeEffect =
  EffectWithOptionalTiming<"draw_cards_for_self_and_chosen_foe"> & {
    amount: number;
    targetSelector: "chosenFoe";
  };

export interface ResourceDrawEffectPayloadMap {
  gain_chips: GainChipsRuntimeEffect;
  gain_chips_per_player_with_status: GainChipsPerPlayerWithStatusRuntimeEffect;
  gain_chips_per_controlled_dead_wizard_token: GainChipsPerControlledDeadWizardTokenRuntimeEffect;
  draw_cards: DrawCardsRuntimeEffect;
  draw_cards_for_each_player: DrawCardsForEachPlayerRuntimeEffect;
  draw_cards_for_self_and_chosen_foe: DrawCardsForSelfAndChosenFoeRuntimeEffect;
}

export const resourceDrawEffectIds = [
  "gain_chips",
  "gain_chips_per_player_with_status",
  "gain_chips_per_controlled_dead_wizard_token",
  "draw_cards",
  "draw_cards_for_each_player",
  "draw_cards_for_self_and_chosen_foe",
] as const satisfies readonly ResourceDrawEffectId[];

export interface ResourceDrawDecoderTools {
  defineDecoder<Id extends ResourceDrawEffectId>(
    effectId: Id,
    fields: ObjectFields<RuntimeEffectForId<Id>>,
    validateDecodedPayload?: DecodedPayloadValidator<Id>
  ): RuntimeEffectDecoder<Id>;
  required<T>(decode: ValueDecoder<T>): RequiredField<T>;
  optional<T>(decode: ValueDecoder<T>): OptionalField<T>;
  literal<const Value extends string | number | boolean>(
    expected: Value
  ): ValueDecoder<Value>;
  positiveInteger: ValueDecoder<number>;
  nonEmptyStringArray: ValueDecoder<string[]>;
  optionalCondition: OptionalField<RuntimeEffectCondition>;
  optionalTiming: OptionalField<EffectTiming>;
  optionalTargetSelector: OptionalField<"eachPlayerClockwiseFromActive">;
}

export type ResourceDrawEffectDecoders = {
  [Id in ResourceDrawEffectId]: RuntimeEffectDecoder<Id>;
};

export function createResourceDrawEffectDecoders(
  tools: ResourceDrawDecoderTools
): ResourceDrawEffectDecoders {
  const {
    defineDecoder,
    required,
    optional,
    literal,
    positiveInteger,
    nonEmptyStringArray,
    optionalCondition,
    optionalTiming,
    optionalTargetSelector,
  } = tools;

  return {
    gain_chips: defineDecoder("gain_chips", {
      effectId: required(literal("gain_chips")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      condition: optionalCondition,
      cardTypes: optional(nonEmptyStringArray),
      isOngoing: optional(literal(true)),
    }),
    gain_chips_per_player_with_status: defineDecoder(
      "gain_chips_per_player_with_status",
      {
        effectId: required(literal("gain_chips_per_player_with_status")),
        timing: optionalTiming,
        amountPerPlayer: required(positiveInteger),
        status: required(literal("dingler")),
      }
    ),
    gain_chips_per_controlled_dead_wizard_token: defineDecoder(
      "gain_chips_per_controlled_dead_wizard_token",
      {
        effectId: required(
          literal("gain_chips_per_controlled_dead_wizard_token")
        ),
        timing: optionalTiming,
        amountPerDeadWizardToken: required(positiveInteger),
        targetSelector: optionalTargetSelector,
      }
    ),
    draw_cards: defineDecoder("draw_cards", {
      effectId: required(literal("draw_cards")),
      timing: optionalTiming,
      amount: required(positiveInteger),
    }),
    draw_cards_for_each_player: defineDecoder("draw_cards_for_each_player", {
      effectId: required(literal("draw_cards_for_each_player")),
      timing: optionalTiming,
      amount: required(positiveInteger),
      targetSelector: required(literal("eachPlayerClockwiseFromActive")),
    }),
    draw_cards_for_self_and_chosen_foe: defineDecoder(
      "draw_cards_for_self_and_chosen_foe",
      {
        effectId: required(literal("draw_cards_for_self_and_chosen_foe")),
        timing: optionalTiming,
        amount: required(positiveInteger),
        targetSelector: required(literal("chosenFoe")),
      }
    ),
  };
}

const gainChipsHandler: EffectRuntimeHandler<GainChipsRuntimeEffect> = {
  effectId: "gain_chips",
  execute(state, player, effect, source) {
    const chipsBefore = player.chips;
    player.chips += effect.amount;
    recordEffectChipsChanged(
      state,
      player,
      source,
      "gain_chips",
      chipsBefore,
      player.chips
    );

    return { ok: true };
  },
};

const gainChipsPerPlayerWithStatusHandler: EffectRuntimeHandler<GainChipsPerPlayerWithStatusRuntimeEffect> =
  {
    effectId: "gain_chips_per_player_with_status",
    execute(state, player, effect, source) {
      const matchingPlayerCount = state.players.filter((candidate) => {
        return candidate.statuses.some(
          (candidateStatus) => candidateStatus.statusId === "dingler"
        );
      }).length;
      const amount = matchingPlayerCount * effect.amountPerPlayer;
      const chipsBefore = player.chips;
      player.chips += amount;
      recordEffectChipsChanged(
        state,
        player,
        source,
        "gain_chips_per_player_with_status",
        chipsBefore,
        player.chips
      );

      return { ok: true };
    },
  };

const gainChipsPerControlledDeadWizardTokenHandler: EffectRuntimeHandler<GainChipsPerControlledDeadWizardTokenRuntimeEffect> =
  {
    effectId: "gain_chips_per_controlled_dead_wizard_token",
    execute(state, player, effect, source, services) {
      const recipients =
        effect.targetSelector === "eachPlayerClockwiseFromActive"
          ? services.getPlayersInActiveOrder(state)
          : [player];

      for (const recipient of recipients) {
        const amount =
          getControlledDeadWizardTokenCount(state, recipient) *
          effect.amountPerDeadWizardToken;
        const chipsBefore = recipient.chips;
        recipient.chips += amount;
        recordEffectChipsChanged(
          state,
          recipient,
          source,
          effect.effectId,
          chipsBefore,
          recipient.chips
        );
      }

      return { ok: true };
    },
  };

export function drawCardsForPlayer(
  state: GameState,
  player: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext
): void {
  const drawResult = getPhysicalCardLedger(state).drawCards(
    player.playerId,
    amount,
    state.rng,
    () => recordDeckReshuffle(state, player.playerId)
  );
  getPhysicalCardLedger(state).addCards(
    `${player.playerId}.hand`,
    drawResult.cards
  );
  recordGameEvent(state, {
    type: "effectDrawCardsApplied",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: drawResult.cards.length,
    sourceType: source.sourceType,
  });
}

const drawCardsHandler: EffectRuntimeHandler<DrawCardsRuntimeEffect> = {
  effectId: "draw_cards",
  execute(state, player, effect, source) {
    drawCardsForPlayer(state, player, effect.amount, effect.effectId, source);
    return { ok: true };
  },
};

const drawCardsForEachPlayerHandler: EffectRuntimeHandler<DrawCardsForEachPlayerRuntimeEffect> =
  {
    effectId: "draw_cards_for_each_player",
    execute(state, _player, effect, source, services) {
      for (const recipient of services.getPlayersInActiveOrder(state)) {
        drawCardsForPlayer(
          state,
          recipient,
          effect.amount,
          effect.effectId,
          source
        );
      }

      return { ok: true };
    },
  };

const drawCardsForSelfAndChosenFoeHandler: EffectRuntimeHandler<DrawCardsForSelfAndChosenFoeRuntimeEffect> =
  {
    effectId: "draw_cards_for_self_and_chosen_foe",
    execute(state, player, effect, source, services) {
      const targetResult = services.resolveTargetChoice(
        state,
        player,
        effect,
        source
      );
      if (!targetResult.ok) return targetResult;
      if (targetResult.choice?.choiceType !== "player") {
        return { ok: true };
      }

      for (const recipient of [player, targetResult.choice.player]) {
        drawCardsForPlayer(
          state,
          recipient,
          effect.amount,
          effect.effectId,
          source
        );
      }

      return { ok: true };
    },
  };

type ResourceDrawEffectDefinitionFor<Id extends ResourceDrawEffectId> = {
  readonly effectId: Id;
  readonly decoder: RuntimeEffectDecoder<Id>;
  readonly supportedTimings: EffectRuntimeSupportedTimings;
  readonly supportedModes: EffectRuntimeSupportedModes;
  readonly supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
  readonly handler: EffectRuntimeHandler<RuntimeEffectForId<Id>>;
};

type ResourceDrawEffectDefinition = {
  [Id in ResourceDrawEffectId]: ResourceDrawEffectDefinitionFor<Id>;
}[ResourceDrawEffectId];

export interface ResourceDrawCatalogTools {
  bindRuntimeEffectDecoder<Id extends ResourceDrawEffectId>(
    effectId: Id
  ): RuntimeEffectDecoder<Id>;
}

export function createResourceDrawEffectDefinitions(
  tools: ResourceDrawCatalogTools
): readonly ResourceDrawEffectDefinition[] {
  const { bindRuntimeEffectDecoder } = tools;
  const supportedTimings = [
    "activation",
    "onDefense",
    "onGainCard",
    "onMayhemResolve",
    "onPlay",
    "onPlayCard",
  ] as const satisfies EffectRuntimeSupportedTimings;
  const supportedModes = ["combat", "fixture"] as const;
  const supportedSourceKinds = ["card", "wizardProperty"] as const;

  return [
    {
      effectId: "gain_chips",
      decoder: bindRuntimeEffectDecoder("gain_chips"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainChipsHandler,
    },
    {
      effectId: "gain_chips_per_player_with_status",
      decoder: bindRuntimeEffectDecoder("gain_chips_per_player_with_status"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainChipsPerPlayerWithStatusHandler,
    },
    {
      effectId: "gain_chips_per_controlled_dead_wizard_token",
      decoder: bindRuntimeEffectDecoder(
        "gain_chips_per_controlled_dead_wizard_token"
      ),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: gainChipsPerControlledDeadWizardTokenHandler,
    },
    {
      effectId: "draw_cards",
      decoder: bindRuntimeEffectDecoder("draw_cards"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: drawCardsHandler,
    },
    {
      effectId: "draw_cards_for_each_player",
      decoder: bindRuntimeEffectDecoder("draw_cards_for_each_player"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: drawCardsForEachPlayerHandler,
    },
    {
      effectId: "draw_cards_for_self_and_chosen_foe",
      decoder: bindRuntimeEffectDecoder("draw_cards_for_self_and_chosen_foe"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: drawCardsForSelfAndChosenFoeHandler,
    },
  ];
}

export function recordEffectChipsChanged(
  state: GameState,
  player: PlayerState,
  source: EffectSourceContext,
  effectId: RuntimeEffectId,
  chipsBefore: number,
  chipsAfter: number
): void {
  recordGameEvent(state, {
    type: "effectChipsGained",
    playerId: player.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    chipsBefore,
    chipsAfter,
    amount: chipsAfter - chipsBefore,
    sourceType: source.sourceType,
  });
}

export function changePlayerChips(
  state: GameState,
  player: PlayerState,
  amount: number,
  source: EffectSourceContext,
  effectId: RuntimeEffectId
): void {
  const chipsBefore = player.chips;
  player.chips += amount;
  recordEffectChipsChanged(
    state,
    player,
    source,
    effectId,
    chipsBefore,
    player.chips
  );
}
