import { drawDeckCards } from "./deck-lifecycle.js";
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
  | "draw_cards";

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

export type DrawCardsRuntimeEffect = EffectWithOptionalTiming<"draw_cards"> &
  PositiveAmount;

export interface ResourceDrawEffectPayloadMap {
  gain_chips: GainChipsRuntimeEffect;
  gain_chips_per_player_with_status: GainChipsPerPlayerWithStatusRuntimeEffect;
  draw_cards: DrawCardsRuntimeEffect;
}

export const resourceDrawEffectIds = [
  "gain_chips",
  "gain_chips_per_player_with_status",
  "draw_cards",
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
    draw_cards: defineDecoder("draw_cards", {
      effectId: required(literal("draw_cards")),
      timing: optionalTiming,
      amount: required(positiveInteger),
    }),
  };
}

const gainChipsHandler: EffectRuntimeHandler<GainChipsRuntimeEffect> = {
  effectId: "gain_chips",
  execute(state, player, effect, source) {
    changePlayerChips(state, player, effect.amount, source, "gain_chips");

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

const drawCardsHandler: EffectRuntimeHandler<DrawCardsRuntimeEffect> = {
  effectId: "draw_cards",
  execute(state, player, effect, source) {
    const drawResult = drawDeckCards(
      player.deck,
      player.discard,
      effect.amount,
      state.rng,
      () => recordDeckReshuffle(state, player.playerId)
    );
    player.hand.push(...drawResult.cards);
    recordGameEvent(state, {
      type: "effectDrawCardsApplied",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "draw_cards",
      amount: drawResult.cards.length,
      sourceType: source.sourceType,
    });

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
      effectId: "draw_cards",
      decoder: bindRuntimeEffectDecoder("draw_cards"),
      supportedTimings,
      supportedModes,
      supportedSourceKinds,
      handler: drawCardsHandler,
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
