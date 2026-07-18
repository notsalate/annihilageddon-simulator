import type { CardDefinition, TokenDefinition } from "./data.js";
import {
  markCardDefinitionId,
  type CardDefinitionId,
  type TokenDefinitionId,
  type TokenInstanceId,
} from "../domain/types.js";
import {
  calculateEffectiveCardCost,
  calculateEffectivePlayerMaxLife,
} from "./effective-values.js";
import { recordGameEvent, recordTurnPowerChanged } from "./event-recorder.js";
import { isPlainRecord } from "../common.js";
import {
  isRuntimeEffectSelectorTarget,
  isRuntimeEffectId,
  isWildMagicOption,
  type AttackOutcomeBranch,
  type RuntimeEffectId,
  type RuntimeEffectCost,
  type RuntimeEffectPayload,
  type RuntimeEffectTargetSelector,
  type WildMagicOption,
} from "./runtime-effect.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  RuntimeEffectChoice,
  TokenInstance,
} from "./setup.js";

export const effectRuntimeModes = ["combat", "fixture"] as const;
export type EffectRuntimeMode = (typeof effectRuntimeModes)[number];
export type EffectRuntimeSupportedModes = readonly [
  EffectRuntimeMode,
  ...EffectRuntimeMode[],
];
export const effectRuntimeSourceKinds = ["card", "wizardProperty", "deadWizardToken"] as const;
export type EffectRuntimeSourceKind = (typeof effectRuntimeSourceKinds)[number];
export type EffectRuntimeSupportedSourceKinds = readonly [
  EffectRuntimeSourceKind,
  ...EffectRuntimeSourceKind[],
];

const RUNTIME_CARD_TYPES = new Set([
  "wizardCard",
  "spell",
  "treasure",
  "creature",
]);

export interface EffectSourceContext {
  sourceType: "card" | "wizardProperty";
  runtimeMode: EffectRuntimeMode;
  playerId: PlayerState["playerId"];
  cardInstanceId: string;
  definitionId: string;
  tokenInstanceId?: TokenInstance["instanceId"];
  tokenDefinitionId?: TokenDefinition["tokenId"];
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

export type SetupDirective = {
  kind: "forceStartingPlayer";
  playerId: PlayerState["playerId"];
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

export type EffectChoice = RuntimeEffectChoice;

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
    card: CardInstance
  ):
    | { ok: true; destination: "discard" | "deckTop" }
    | { ok: false; error: string };
  moveCardToPlayerZone(
    state: GameState,
    card: CardInstance,
    player: PlayerState,
    destination: CardInstance[],
    destinationZone: string,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): boolean;
  moveCardToZonePreservingOwner(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
    destination: CardInstance[],
    destinationZone: string,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
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
  getWizardPropertyAttackProfile(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext
  ): { damageBonus: number; unavoidable: boolean };
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
    source: EffectSourceContext
  ): DamageResult;
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
  ): void;
  removeDinglerStatus(
    state: GameState,
    player: PlayerState,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): void;
  hasDinglerStatus(player: PlayerState): boolean;
  resolveAttackTarget(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext,
    unavoidable?: boolean
  ): DamageResult & { avoided: boolean };
  resolveDefenseWindow(state: GameState, defendingPlayer: PlayerState): boolean;
  resolveMayhemAttack(
    state: GameState,
    sourcePlayer: PlayerState,
    amount: number,
    effectId: RuntimeEffectId,
    source: EffectSourceContext
  ): void;
  resolvePlayerDeath(state: GameState, player: PlayerState): void;
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
      nonOngoingOwnerId?: CardInstance["ownerId"];
      ongoingOwnerId?: CardInstance["ownerId"];
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
    effect: RuntimeEffectPayload,
    source: EffectSourceContext
  ): EffectExecutionResult;
  asString(value: unknown): string;
}

export interface EffectRuntimeHandler<
  Effect extends RuntimeEffectPayload = RuntimeEffectPayload,
> {
  effectId: RuntimeEffectId;
  unsupported?: true;
  allowedTargetSelectors?: readonly RuntimeEffectTargetSelector[];
  validateShape(subjectId: string, effect: RuntimeEffectPayload): string[];
  execute(
    state: GameState,
    player: PlayerState,
    effect: Effect,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult;
  executeSetup?(
    player: PlayerState,
    effect: Effect,
    source: SetupEffectSourceContext,
    services: EffectRuntimeSetupServices
  ): SetupEffectHandlerResult;
}

export type RuntimeEffectForId<EffectId extends RuntimeEffectId> = Extract<
  RuntimeEffectPayload,
  { effectId: EffectId }
>;

type PositiveAmountRuntimeEffect<EffectId extends RuntimeEffectId> =
  RuntimeEffectForId<EffectId> & { amount: number };

type AddPowerRuntimeEffect = PositiveAmountRuntimeEffect<"add_power">;
type GainChipsRuntimeEffect = PositiveAmountRuntimeEffect<"gain_chips">;

export interface EffectRuntimeCatalogEntry<
  EffectId extends RuntimeEffectId = RuntimeEffectId,
> {
  effectId: EffectId;
  handler: EffectRuntimeHandler<RuntimeEffectForId<EffectId>>;
  supportedModes: EffectRuntimeSupportedModes;
  supportedSourceKinds: EffectRuntimeSupportedSourceKinds;
}

const allEffectRuntimeModes: EffectRuntimeSupportedModes = effectRuntimeModes;
const allEffectRuntimeSourceKinds: EffectRuntimeSupportedSourceKinds =
  effectRuntimeSourceKinds;
const fixtureOnlyRuntimeEffectIds = new Set<RuntimeEffectId>([
  "fixture_modify_effective_value",
  "fixture_add_power_equal_to_target_cost",
]);

const damageTargetSelectors = [
  "opponentPlayer", "activePlayer",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const activePlayerTargetSelectors = [
  "activePlayer",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const opponentOrChosenFoeTargetSelectors = [
  "opponentPlayer",
  "chosenFoe",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const attackTargetSelectors = [
  "opponentPlayer",
  "chosenFoe",
  "chosenPlayer",
  "eachFoe",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const directionalAttackTargetSelectors = [
  "leftOrRightFoe",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const eachPlayerClockwiseFromActiveTargetSelectors = [
  "eachPlayerClockwiseFromActive",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const chosenFoeTargetSelectors = [
  "chosenFoe",
] as const satisfies readonly RuntimeEffectTargetSelector[];
const dinglerStatusTargetSelectors = [
  "activePlayer",
  "opponentPlayer",
  "anyPlayer",
  "eachPlayerClockwiseFromActive",
] as const satisfies readonly RuntimeEffectTargetSelector[];

const addPowerHandler: EffectRuntimeHandler<AddPowerRuntimeEffect> = {
  effectId: "add_power",
  validateShape(subjectId, effect) {
    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return [`${subjectId} uses invalid power amount ${String(amount)}`];
    }

    return [];
  },
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

const addPowerPerPlayerWithStatusHandler: EffectRuntimeHandler = {
  effectId: "add_power_per_player_with_status",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["statusId"] !== "dingler") {
      errors.push(
        `${subjectId} uses unsupported status ${String(effect["statusId"])}`
      );
    }
    const amountPerPlayer = effect["amountPerPlayer"];
    if (
      typeof amountPerPlayer !== "number" ||
      !Number.isSafeInteger(amountPerPlayer) ||
      amountPerPlayer <= 0
    ) {
      errors.push(
        `${subjectId} uses invalid power amount per player ${String(amountPerPlayer)}`
      );
    }
    return errors;
  },
  execute(state, player, effect, source, services) {
    const amountPerPlayer = effect["amountPerPlayer"];
    if (typeof amountPerPlayer !== "number") {
      return {
        ok: false,
        error: "Invalid add_power_per_player_with_status effect",
      };
    }

    const matchingPlayerCount = state.players.filter((candidate) =>
      services.hasDinglerStatus(candidate)
    ).length;
    const powerBefore = state.turn.power;
    state.turn.power += matchingPlayerCount * amountPerPlayer;
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

const gainCardHandler: EffectRuntimeHandler = {
  effectId: "gain_card",
  validateShape(subjectId, effect) {
    const errors = validateCardTargetSelector(
      subjectId,
      effect,
      "gain",
      "mainMarketCard"
    );
    if (effect["destination"] !== "discard") {
      errors.push(
        `${subjectId} uses unsupported gain destination ${String(effect["destination"])}`
      );
    }

    return errors;
  },
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

    if (effect["destination"] !== "discard") {
      return {
        ok: false,
        error: `Unsupported gain destination ${services.asString(effect["destination"])}`,
      };
    }

    const effectId = effect.effectId;
    const choice = services.requireCardChoice(targetResult.choice, effectId);
    if (!choice.ok) {
      return choice;
    }

    const moved = services.moveGainedCardToPlayerDestination(
      state,
      player,
      choice.card
    );
    if (!moved.ok) {
      return moved;
    }

    recordGameEvent(state, {
      type: "effectCardGained",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId,
      destination: moved.destination,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const discardCardHandler: EffectRuntimeHandler = {
  effectId: "discard_card",
  validateShape(subjectId, effect) {
    return validateCardTargetSelector(
      subjectId,
      effect,
      "discard",
      "activePlayerHandCard"
    );
  },
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

    const effectId = effect.effectId;
    const choice = services.requireCardChoice(targetResult.choice, effectId);
    if (!choice.ok) {
      return choice;
    }

    const moved = services.moveCardToPlayerZone(
      state,
      choice.card,
      player,
      player.discard,
      `${player.playerId}.discard`,
      effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    recordGameEvent(state, {
      type: "effectCardDiscarded",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const destroyCardHandler: EffectRuntimeHandler = {
  effectId: "destroy_card",
  validateShape(subjectId, effect) {
    return validateCardTargetSelector(
      subjectId,
      effect,
      "destroy",
      "activePlayerHandCard"
    );
  },
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

    const effectId = effect.effectId;
    const choice = services.requireCardChoice(targetResult.choice, effectId);
    if (!choice.ok) {
      return choice;
    }

    const destination = services.getDestroyDestination(state, choice.card);
    if (!destination.ok) {
      return destination;
    }

    const moved = services.moveCardToZonePreservingOwner(
      state,
      player,
      choice.card,
      destination.zone,
      destination.zoneName,
      effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move card ${choice.card.instanceId}`,
      };
    }

    recordGameEvent(state, {
      type: "effectCardDestroyed",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: choice.card.instanceId,
      targetDefinitionId: choice.card.definitionId,
      effectId,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const dealDamageHandler: EffectRuntimeHandler = {
  effectId: "deal_damage",
  allowedTargetSelectors: damageTargetSelectors,
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "damage amount"),
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "damage",
        damageTargetSelectors
      ),
    ];
  },
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

    const amount = requirePositiveIntegerAmount(effect, "damage amount");
    if (!amount.ok) {
      return amount;
    }

    services.dealDamage(
      state,
      player,
      targetResult.choice.player,
      amount.value,
      effect.effectId,
      source
    );
    return { ok: true };
  },
};

const healHandler: EffectRuntimeHandler = {
  effectId: "heal",
  allowedTargetSelectors: activePlayerTargetSelectors,
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "healing amount"),
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "healing",
        activePlayerTargetSelectors
      ),
    ];
  },
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

    const amount = requirePositiveIntegerAmount(effect, "heal amount");
    if (!amount.ok) {
      return amount;
    }

    services.healPlayer(
      state,
      player,
      targetResult.choice.player,
      amount.value,
      effect.effectId,
      source
    );
    return { ok: true };
  },
};

const healEqualDamageDealtOnOwnTurnHandler: EffectRuntimeHandler = {
  effectId: "heal_equal_damage_dealt_on_own_turn",
  validateShape(subjectId, effect) {
    if (effect["timing"] !== "afterDamageDealt") {
      return [
        `${subjectId} uses unsupported damage trigger timing ${String(effect["timing"])}`,
      ];
    }

    return [];
  },
  execute() {
    return { ok: true };
  },
};

const setLifeHandler: EffectRuntimeHandler = {
  effectId: "set_life",
  allowedTargetSelectors: activePlayerTargetSelectors,
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      errors.push(`${subjectId} uses invalid life total ${String(lifeTotal)}`);
    }

    errors.push(
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "set-life",
        activePlayerTargetSelectors
      )
    );
    return errors;
  },
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

    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      return {
        ok: false,
        error: `Invalid life total ${String(lifeTotal)}`,
      };
    }

    const lifeChange = services.setPlayerLife(
      state,
      targetResult.choice.player,
      lifeTotal
    );
    recordGameEvent(state, {
      type: "effectLifeSet",
      playerId: player.playerId,
      targetPlayerId: targetResult.choice.player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      amount: lifeTotal,
      targetLifeBefore: lifeChange.lifeBefore,
      targetLifeAfter: lifeChange.lifeAfter,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const exchangeLifeAndDinglerStatusHandler: EffectRuntimeHandler = {
  effectId: "exchange_life_and_dingler_status",
  allowedTargetSelectors: opponentOrChosenFoeTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validatePlayerTargetSelector(
      subjectId,
      effect,
      "life exchange",
      opponentOrChosenFoeTargetSelectors
    );
    for (const flag of [
      "allowLifeExchange",
      "allowDinglerStatusExchange",
    ] as const) {
      const value = effect[flag];
      if (value !== undefined && typeof value !== "boolean") {
        errors.push(
          `${subjectId} uses invalid ${flag} flag ${
            value === null ? "null" : typeof value
          }`
        );
      }
    }
    return errors;
  },
  execute(state, player, effect, source, services) {
    const effectId = effect.effectId;
    const allowLifeExchange =
      effect["allowLifeExchange"] === undefined
        ? true
        : effect["allowLifeExchange"] === true;
    const allowDinglerStatusExchange =
      effect["allowDinglerStatusExchange"] === undefined
        ? true
        : effect["allowDinglerStatusExchange"] === true;

    if (effect["optional"] === true) {
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
    const playerLife = player.life.current;
    player.life.current = targetPlayer.life.current;
    targetPlayer.life.current = playerLife;
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

  if (exchangeDinglerStatus) {
    const playerHadDingler = services.hasDinglerStatus(player);
    const targetHadDingler = services.hasDinglerStatus(targetPlayer);
    if (playerHadDingler && !targetHadDingler) {
      services.removeDinglerStatus(state, player, effectId, source);
      services.gainDinglerStatus(state, targetPlayer, effectId, source);
    }
    if (!playerHadDingler && targetHadDingler) {
      services.removeDinglerStatus(state, targetPlayer, effectId, source);
      services.gainDinglerStatus(state, player, effectId, source);
    }
  }

  return { ok: true };
}

const gainStatusHandler: EffectRuntimeHandler = {
  effectId: "gain_status",
  allowedTargetSelectors: dinglerStatusTargetSelectors,
  validateShape(subjectId, effect) {
    return validateDinglerStatusEffectShape(subjectId, effect, "gain-status");
  },
  execute(state, player, effect, source, services) {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${services.asString(statusId)}`,
      };
    }

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
      services.gainDinglerStatus(state, targetPlayer, effect.effectId, source);
    }

    return { ok: true };
  },
};

const attackGainStatusHandler: EffectRuntimeHandler = {
  effectId: "attack_gain_status",
  allowedTargetSelectors: dinglerStatusTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validateDinglerStatusEffectShape(
      subjectId,
      effect,
      "attack-status"
    );
    if (effect["timing"] !== "onPlay") {
      errors.unshift(
        `${subjectId} uses unsupported attack-status timing ${String(effect["timing"])}`
      );
    }
    return errors;
  },
  execute(state, player, effect, source, services) {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${services.asString(statusId)}`,
      };
    }

    const targetResult = services.resolveStatusTargetPlayers(
      state,
      player,
      effect,
      source
    );
    if (!targetResult.ok) {
      return targetResult;
    }

    const effectId = effect.effectId;
    for (const targetPlayer of targetResult.players) {
      recordGameEvent(state, {
        type: "attackCreated",
        playerId: player.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      if (services.resolveDefenseWindow(state, targetPlayer)) {
        recordGameEvent(state, {
          type: "attackAvoided",
          playerId: targetPlayer.playerId,
          targetPlayerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId,
          sourceType: source.sourceType,
        });
        continue;
      }

      services.gainDinglerStatus(state, targetPlayer, effectId, source);
    }

    return { ok: true };
  },
};

const removeStatusHandler: EffectRuntimeHandler = {
  effectId: "remove_status",
  allowedTargetSelectors: dinglerStatusTargetSelectors,
  validateShape(subjectId, effect) {
    return validateDinglerStatusEffectShape(subjectId, effect, "remove-status");
  },
  execute(state, player, effect, source, services) {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${services.asString(statusId)}`,
      };
    }

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
      services.removeDinglerStatus(
        state,
        targetPlayer,
        effect.effectId,
        source
      );
    }

    return { ok: true };
  },
};

const toggleStatusHandler: EffectRuntimeHandler = {
  effectId: "toggle_status",
  allowedTargetSelectors: dinglerStatusTargetSelectors,
  validateShape(subjectId, effect) {
    return validateDinglerStatusEffectShape(subjectId, effect, "toggle-status");
  },
  execute(state, player, effect, source, services) {
    const statusId = effect["statusId"];
    if (statusId !== "dingler") {
      return {
        ok: false,
        error: `Unsupported status ${services.asString(statusId)}`,
      };
    }

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
        services.removeDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
      } else {
        services.gainDinglerStatus(
          state,
          targetPlayer,
          effect.effectId,
          source
        );
      }
    }

    return { ok: true };
  },
};

const megaMayhemSetLifeHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_set_life",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMegaMayhemSetLifeEffectShape(subjectId, effect);
  },
  execute(state, player, effect, source, services) {
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      return {
        ok: false,
        error: `Invalid life total ${String(lifeTotal)}`,
      };
    }

    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const lifeChange = services.setPlayerLife(state, targetPlayer, lifeTotal);
      recordGameEvent(state, {
        type: "effectLifeSet",
        playerId: player.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        amount: lifeTotal,
        targetLifeBefore: lifeChange.lifeBefore,
        targetLifeAfter: lifeChange.lifeAfter,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const megaMayhemEachPlayerToggleDinglerHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_each_player_toggle_dingler",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMegaMayhemEachPlayerToggleDinglerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const decisions = collectMayhemAttackDefenseDecisions(
      state,
      services.getPlayersInActiveOrder(state),
      effectId,
      source,
      services
    );
    for (const { player: targetPlayer, avoided } of decisions) {
      if (avoided) {
        continue;
      }

      if (services.hasDinglerStatus(targetPlayer)) {
        services.removeDinglerStatus(state, targetPlayer, effectId, source);
        continue;
      }

      services.gainDinglerStatus(state, targetPlayer, effectId, source);
    }

    return { ok: true };
  },
};

const megaMayhemEachPlayerDestroyTopMainDeckHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMegaMayhemEachPlayerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const destroyedCard = state.common.mainDeck.shift();
      if (destroyedCard === undefined) {
        recordGameEvent(state, {
          type: "effectDestroyTopMainDeckSkipped",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId,
          sourceType: source.sourceType,
        });
        continue;
      }

      const destination = services.getDestroyDestination(state, destroyedCard);
      if (!destination.ok) {
        return destination;
      }

      destination.zone.push(destroyedCard);
      recordGameEvent(state, {
        type: "effectTopMainDeckCardDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        targetCardInstanceId: destroyedCard.instanceId,
        targetDefinitionId: destroyedCard.definitionId,
        effectId,
        sourceType: source.sourceType,
      });

      const destroyedDefinition = state.cardDefinitions.get(
        destroyedCard.definitionId
      );
      if (destroyedDefinition?.engine.cardKind === "mayhem") {
        services.resolvePlayerDeath(state, targetPlayer);
      }
    }
    return { ok: true };
  },
};

const mayhemEachPlayerDiscardTopDeckDestroyHandler: EffectRuntimeHandler = {
  effectId:
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validateMayhemEachPlayerShape(subjectId, effect);
    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      errors.push(
        `${subjectId} uses invalid Mayhem discard amount ${String(amount)}`
      );
    }
    return errors;
  },
  execute(state, _player, effect, source, services) {
    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      return {
        ok: false,
        error: `Invalid Mayhem discard amount ${String(amount)}`,
      };
    }

    const effectId = effect.effectId;
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const discardedCards = services.discardTopDeckCards(
        state,
        targetPlayer,
        amount
      );
      for (const discardedCard of discardedCards) {
        const destination = services.getDestroyDestination(
          state,
          discardedCard
        );
        if (!destination.ok) {
          return destination;
        }

        if (
          !services.moveCardToZonePreservingOwner(
            state,
            targetPlayer,
            discardedCard,
            destination.zone,
            destination.zoneName,
            effectId,
            source
          )
        ) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${discardedCard.instanceId}`,
          };
        }
      }

      recordGameEvent(state, {
        type: "mayhemDiscardedTopDeckCardsDestroyed",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: discardedCards.length,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const mayhemEachPlayerDiscardDeckDestroyHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_player_discard_deck_then_destroy_from_discard",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMayhemEachPlayerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const discardedCount = targetPlayer.deck.length;
      targetPlayer.discard.push(...targetPlayer.deck.splice(0));
      const destroyTarget = targetPlayer.discard[0];
      if (destroyTarget !== undefined) {
        const destination = services.getDestroyDestination(
          state,
          destroyTarget
        );
        if (!destination.ok) {
          return destination;
        }

        if (
          !services.moveCardToZonePreservingOwner(
            state,
            targetPlayer,
            destroyTarget,
            destination.zone,
            destination.zoneName,
            effectId,
            source
          )
        ) {
          return {
            ok: false,
            error: `Cannot destroy discarded card ${destroyTarget.instanceId}`,
          };
        }
      }

      recordGameEvent(state, {
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
        effectId,
        amount: discardedCount,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const mayhemEachPlayerHandRedrawChoiceHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validateMayhemEachPlayerShape(subjectId, effect);
    if (effect["chooser"] !== "affectedPlayer") {
      errors.push(
        `${subjectId} uses unsupported Mayhem chooser ${String(effect["chooser"])}`
      );
    }

    errors.push(...validateMayhemHandRedrawOptions(subjectId, effect));
    return errors;
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return { ok: false, error: "Invalid Mayhem hand-redraw choice effect" };
    }

    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effectId,
        [
          { choiceKind: "option", choiceId: "discard_hand_then_draw_cards" },
          { choiceKind: "option", choiceId: "take_damage" },
        ]
      );
      const selectedChoiceId =
        choice?.choiceId ?? "discard_hand_then_draw_cards";
      if (selectedChoiceId === "take_damage") {
        const damageOption: unknown = options[1];
        if (
          !isEffectRecord(damageOption) ||
          typeof damageOption["amount"] !== "number"
        ) {
          return {
            ok: false,
            error: "Invalid Mayhem hand-redraw damage option",
          };
        }

        services.dealDamage(
          state,
          targetPlayer,
          targetPlayer,
          damageOption["amount"],
          effectId,
          source
        );
        continue;
      }

      const redrawOption: unknown = options[0];
      if (
        !isEffectRecord(redrawOption) ||
        typeof redrawOption["drawAmount"] !== "number"
      ) {
        return { ok: false, error: "Invalid Mayhem hand-redraw option" };
      }

      const discardedCount = targetPlayer.hand.length;
      targetPlayer.discard.push(...targetPlayer.hand.splice(0));
      const drawnCount = drawCards(
        targetPlayer,
        redrawOption["drawAmount"],
        state
      );
      recordGameEvent(state, {
        type: "mayhemHandDiscardedAndRedrawn",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: discardedCount + drawnCount,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const mayhemEachPlayerReduceLifeToGainChipsHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_player_reduce_life_to_gain_chips",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validateMayhemEachPlayerShape(subjectId, effect);
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      errors.push(`${subjectId} uses invalid life total ${String(lifeTotal)}`);
    }

    const chipAmount = effect["chipAmount"];
    if (
      typeof chipAmount !== "number" ||
      !Number.isSafeInteger(chipAmount) ||
      chipAmount < 1
    ) {
      errors.push(
        `${subjectId} uses invalid chip amount ${String(chipAmount)}`
      );
    }

    if (effect["chooser"] !== "affectedPlayer") {
      errors.push(
        `${subjectId} uses unsupported Mayhem chooser ${String(effect["chooser"])}`
      );
    }

    return errors;
  },
  execute(state, _player, effect, source, services) {
    const lifeTotal = effect["lifeTotal"];
    const chipAmount = effect["chipAmount"];
    if (typeof lifeTotal !== "number" || typeof chipAmount !== "number") {
      return { ok: false, error: "Invalid Mayhem life-for-chips effect" };
    }

    const effectId = effect.effectId;
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (targetPlayer.life.current <= lifeTotal) {
        continue;
      }

      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effectId,
        [
          { choiceKind: "option", choiceId: "reduce_life_gain_chips" },
          { choiceKind: "option", choiceId: "pass" },
        ]
      );
      if (choice?.choiceId !== "reduce_life_gain_chips") {
        continue;
      }

      const lifeChange = services.setPlayerLife(state, targetPlayer, lifeTotal);
      const chipsBefore = targetPlayer.chips;
      targetPlayer.chips += chipAmount;
      recordGameEvent(state, {
        type: "effectLifeSet",
        playerId: targetPlayer.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: lifeTotal,
        targetLifeBefore: lifeChange.lifeBefore,
        targetLifeAfter: lifeChange.lifeAfter,
        sourceType: source.sourceType,
      });
      recordEffectChipsChanged(
        state,
        targetPlayer,
        source,
        effectId,
        chipsBefore,
        targetPlayer.chips
      );
    }

    return { ok: true };
  },
};

const increaseHandLimitAtMaxLifeHandler: EffectRuntimeHandler = {
  effectId: "increase_hand_limit_at_max_life",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "endTurn") {
      errors.push(
        `${subjectId} uses unsupported hand-limit timing ${String(effect["timing"])}`
      );
    }

    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 1
    ) {
      errors.push(
        `${subjectId} uses invalid hand-limit amount ${String(amount)}`
      );
    }

    return errors;
  },
  execute() {
    return { ok: true };
  },
};

const mayhemEachPlayerBattleHighestHandCostHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_player_battle_highest_hand_cost",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMayhemBattleHighestHandCostShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const winnerDrawAmount = effect["winnerDrawAmount"];
    if (typeof winnerDrawAmount !== "number") {
      return {
        ok: false,
        error: "Invalid Mayhem battle winner draw amount",
      };
    }

    const participants: Array<{ player: PlayerState; handCost: number }> = [];
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const participationChoice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effectId,
        [
          { choiceKind: "option", choiceId: "participate" },
          { choiceKind: "option", choiceId: "pass" },
        ]
      );
      if (participationChoice?.choiceId !== "participate") {
        continue;
      }

      const handCost = sumHandCost(state, targetPlayer);
      participants.push({ player: targetPlayer, handCost });
      recordGameEvent(state, {
        type: "mayhemBattleParticipationSelected",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: handCost,
        sourceType: source.sourceType,
      });
    }

    const highestCost = Math.max(
      ...participants.map((participant) => participant.handCost),
      0
    );
    const winners = participants
      .filter((participant) => participant.handCost === highestCost)
      .map((participant) => participant.player);
    const winnerIds = winners.map((winner) => winner.playerId);

    for (const winner of winners) {
      drawCards(winner, winnerDrawAmount, state);
    }
    for (const participant of participants) {
      if (winnerIds.includes(participant.player.playerId)) {
        continue;
      }
      participant.player.discard.push(...participant.player.hand.splice(0));
    }

    recordGameEvent(state, {
      type: "mayhemBattleResolved",
      playerId: source.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount: highestCost,
      participantPlayerIds: participants.map(
        (participant) => participant.player.playerId
      ),
      winnerPlayerIds: winnerIds,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const mayhemEachPlayerVoteDinglerHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_player_vote_dingler",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMayhemVoteDinglerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const players = services.getPlayersInActiveOrder(state);
    const votes = new Map<PlayerState["playerId"], number>();

    for (const votingPlayer of players) {
      const choice = services.chooseEffectChoice(
        state,
        votingPlayer,
        source,
        effectId,
        players.map((targetPlayer) => ({
          choiceKind: "playerTarget" as const,
          choiceId: `vote-${targetPlayer.playerId}`,
          players: [targetPlayer],
        }))
      );
      const votedPlayer =
        choice?.choiceKind === "playerTarget" ? choice.players[0] : undefined;
      if (votedPlayer === undefined) {
        continue;
      }

      votes.set(
        votedPlayer.playerId,
        (votes.get(votedPlayer.playerId) ?? 0) + 1
      );
      recordGameEvent(state, {
        type: "mayhemVoteRecorded",
        playerId: votingPlayer.playerId,
        targetPlayerId: votedPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
    }

    const highestVoteCount = Math.max(...votes.values(), 0);
    const winners = players.filter(
      (candidate) => votes.get(candidate.playerId) === highestVoteCount
    );
    for (const winner of winners) {
      services.gainDinglerStatus(state, winner, effectId, source);
    }

    recordGameEvent(state, {
      type: "mayhemVoteResolved",
      playerId: source.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount: highestVoteCount,
      winnerPlayerIds: winners.map((winner) => winner.playerId),
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const mayhemEachDinglerRecoveryChoiceHandler: EffectRuntimeHandler = {
  effectId: "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    return validateMayhemDinglerRecoveryShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const lifeCost = effect["lifeCost"];
    const chipCost = effect["chipCost"];
    if (typeof lifeCost !== "number" || typeof chipCost !== "number") {
      return { ok: false, error: "Invalid Mayhem Dingler recovery costs" };
    }

    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (!services.hasDinglerStatus(targetPlayer)) {
        continue;
      }

      const choices: EffectChoice[] = [];
      if (targetPlayer.life.current - lifeCost >= 1) {
        choices.push({ choiceKind: "option", choiceId: "pay_life" });
      }
      if (targetPlayer.chips >= chipCost) {
        choices.push({ choiceKind: "option", choiceId: "spend_chips" });
      }
      choices.push({ choiceKind: "option", choiceId: "skip" });

      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effectId,
        choices
      );
      if (choice?.choiceId === "pay_life") {
        targetPlayer.life.current -= lifeCost;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId,
          costId: "pay_life",
          amount: lifeCost,
          sourceType: source.sourceType,
        });
        services.removeDinglerStatus(state, targetPlayer, effectId, source);
        continue;
      }

      if (choice?.choiceId === "spend_chips") {
        targetPlayer.chips -= chipCost;
        recordGameEvent(state, {
          type: "effectCostPaid",
          playerId: targetPlayer.playerId,
          cardInstanceId: source.cardInstanceId,
          definitionId: source.definitionId,
          effectId,
          costId: "spend_chips",
          amount: chipCost,
          sourceType: source.sourceType,
        });
        services.removeDinglerStatus(state, targetPlayer, effectId, source);
      }
    }

    return { ok: true };
  },
};

const mayhemLowestLifeDinglerMaxLifeHandler: EffectRuntimeHandler = {
  effectId: "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "onMayhemResolve") {
      errors.push(
        `${subjectId} uses unsupported Mayhem timing ${String(effect["timing"])}`
      );
    }
    if (effect["statusId"] !== "dingler") {
      errors.push(
        `${subjectId} uses unsupported Mayhem lowest-life status ${String(effect["statusId"])}`
      );
    }
    return errors;
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const lowestLife = Math.min(
      ...state.players.map((candidate) => candidate.life.current)
    );
    const targets = services
      .getPlayersInActiveOrder(state)
      .filter((candidate) => candidate.life.current === lowestLife);

    const decisions = collectMayhemAttackDefenseDecisions(
      state,
      targets,
      effectId,
      source,
      services
    );
    for (const { player: targetPlayer, avoided } of decisions) {
      if (avoided) {
        continue;
      }

      services.gainDinglerStatus(state, targetPlayer, effectId, source);
      const maxLife = calculateEffectivePlayerMaxLife(
        state,
        targetPlayer.playerId
      );
      services.setPlayerLife(state, targetPlayer, maxLife);
      recordGameEvent(state, {
        type: "effectLifeSet",
        playerId: source.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: maxLife,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const replaceStartingCardHandler: EffectRuntimeHandler = {
  effectId: "replace_starting_card",
  validateShape(subjectId, effect) {
    const errors = validateSetupTiming(subjectId, effect);
    const fromDefinitionId = effect["fromDefinitionId"];
    if (!isStableDefinitionId(fromDefinitionId)) {
      errors.push(
        `${subjectId} uses invalid replacement source card ${String(fromDefinitionId)}`
      );
    }

    const toDefinitionId = effect["toDefinitionId"];
    if (!isStableDefinitionId(toDefinitionId)) {
      errors.push(
        `${subjectId} uses invalid replacement target card ${String(toDefinitionId)}`
      );
    }

    return errors;
  },
  execute() {
    return setupOnlyExecutionError("replace_starting_card");
  },
  executeSetup(player, effect, _source, services) {
    const rawFromDefinitionId = effect["fromDefinitionId"];
    const rawToDefinitionId = effect["toDefinitionId"];
    if (
      !isStableDefinitionId(rawFromDefinitionId) ||
      !isStableDefinitionId(rawToDefinitionId)
    ) {
      return { ok: false, error: "replace_starting_card requires stable fromDefinitionId and toDefinitionId" };
    }
    const fromDefinitionId = markCardDefinitionId(rawFromDefinitionId);
    const toDefinitionId = markCardDefinitionId(rawToDefinitionId);
    if (!services.hasCardDefinition(toDefinitionId)) {
      if (services.allowsMissingData) return { ok: true };
      return { ok: false, error: `Cannot replace with missing target card ${toDefinitionId}` };
    }
    const zones = [player.hand, player.deck, player.discard, player.playedThisTurn, player.permanents];
    for (const zone of zones) {
      const cardIndex = zone.findIndex((card) => card.ownerId === player.playerId && card.definitionId === fromDefinitionId);
      if (cardIndex < 0) continue;
      zone.splice(cardIndex, 1, services.createCardInstance(toDefinitionId, player.playerId));
      return { ok: true };
    }
    if (services.allowsMissingData) return { ok: true };
    return { ok: false, error: `Cannot replace missing starting card ${fromDefinitionId} for ${player.playerId}` };
  },
};

const startWithBasicTrophyHandler: EffectRuntimeHandler = {
  effectId: "start_with_basic_trophy",
  validateShape(subjectId, effect) {
    return validateSetupTiming(subjectId, effect);
  },
  execute() {
    return setupOnlyExecutionError("start_with_basic_trophy");
  },
  executeSetup(player) {
    if (!player.trophyLikeObjects.some((trophy) => trophy.trophyId === "basicTrophy")) {
      player.trophyLikeObjects.push({
        instanceId: `setup-basic-trophy-${player.playerId}`,
        trophyId: "basicTrophy",
        ownerId: player.playerId,
        effects: [],
      });
    }
    return { ok: true };
  },
};

const forceStartingPlayerHandler: EffectRuntimeHandler = {
  effectId: "force_starting_player",
  validateShape(subjectId, effect) {
    const errors = validateSetupTiming(subjectId, effect);
    const targetSelector = effect["targetSelector"];
    if (targetSelector !== undefined && targetSelector !== "activePlayer") {
      errors.push(
        `${subjectId} uses unsupported force-starting-player target ${
          typeof targetSelector === "string" ? targetSelector : "<unknown>"
        }`
      );
    }

    return errors;
  },
  execute() {
    return setupOnlyExecutionError("force_starting_player");
  },
  executeSetup(_player, _effect, source) {
    return {
      ok: true,
      directive: { kind: "forceStartingPlayer", playerId: source.playerId },
    };
  },
};

const setStartingLifeTotalHandler: EffectRuntimeHandler = {
  effectId: "set_starting_life_total",
  validateShape(subjectId, effect) {
    return [
      ...validateSetupTiming(subjectId, effect),
      ...validateLifeTotal(subjectId, effect),
    ];
  },
  execute() {
    return setupOnlyExecutionError("set_starting_life_total");
  },
  executeSetup(player, effect) {
    const lifeTotal = effect.lifeTotal;
    if (typeof lifeTotal !== "number") {
      return { ok: false, error: "Invalid setup life total" };
    }
    player.life.current = lifeTotal;
    player.life.max = Math.max(player.life.max, lifeTotal);
    return { ok: true };
  },
};

const setResurrectionLifeTotalHandler: EffectRuntimeHandler = {
  effectId: "set_resurrection_life_total",
  validateShape(subjectId, effect) {
    const errors = validateReplacementTiming(subjectId, effect);
    errors.push(...validateLifeTotal(subjectId, effect));

    const unlessStatusId = effect["unlessStatusId"];
    if (unlessStatusId !== undefined && !isNonEmptyString(unlessStatusId)) {
      errors.push(
        `${subjectId} uses invalid resurrection exception status ${
          typeof unlessStatusId === "string" ? unlessStatusId : "<unknown>"
        }`
      );
    }

    return errors;
  },
  execute() {
    return setupOnlyExecutionError("set_resurrection_life_total");
  },
};

const modifyEffectiveValueHandler: EffectRuntimeHandler = {
  effectId: "modify_effective_value",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (
      effect["timing"] !== "whileControlled" &&
      effect["timing"] !== "whileScoring"
    ) {
      errors.push(
        `${subjectId} uses unsupported effective-value timing ${String(effect["timing"])}`
      );
    }

    const valueKind = effect["valueKind"];
    if (
      valueKind !== "cardCost" &&
      valueKind !== "cardVictoryPoints" &&
      valueKind !== "tokenVictoryPoints" &&
      valueKind !== "playerMaxLife" &&
      valueKind !== "playerVictoryPoints"
    ) {
      errors.push(
        `${subjectId} uses unsupported effective-value kind ${String(valueKind)}`
      );
    }

    const operation = effect["operation"];
    if (operation !== "add" && operation !== "invertNegative") {
      errors.push(
        `${subjectId} uses unsupported effective-value operation ${String(operation)}`
      );
    }

    const amount = effect["amount"];
    const amountPerOwnedCard = effect["amountPerOwnedCard"];
    if (
      operation === "add" &&
      (typeof amount !== "number" || !Number.isSafeInteger(amount)) &&
      (typeof amountPerOwnedCard !== "number" ||
        !Number.isSafeInteger(amountPerOwnedCard))
    ) {
      errors.push(
        `${subjectId} uses invalid effective-value amount ${String(amount)}`
      );
    }
    if (operation === "invertNegative" && amount !== undefined) {
      errors.push(`${subjectId} cannot combine invertNegative with amount`);
    }
    if (
      amountPerOwnedCard !== undefined &&
      (typeof amountPerOwnedCard !== "number" ||
        !Number.isSafeInteger(amountPerOwnedCard))
    ) {
      errors.push(
        `${subjectId} uses invalid effective-value amountPerOwnedCard ${
          typeof amountPerOwnedCard === "number"
            ? amountPerOwnedCard
            : "<unknown>"
        }`
      );
    }
    if (amountPerOwnedCard !== undefined) {
      const countedCardTypes = effect["countedCardTypes"];
      if (
        !Array.isArray(countedCardTypes) ||
        countedCardTypes.length === 0 ||
        !countedCardTypes.every(isNonEmptyString)
      ) {
        errors.push(
          `${subjectId} uses invalid effective-value countedCardTypes`
        );
      }
    }

    errors.push(
      ...validateEffectiveValueModifierTarget(subjectId, valueKind, effect)
    );
    return errors;
  },
  execute() {
    return {
      ok: false,
      error: "modify_effective_value is an effective-value-only effect",
    };
  },
};

const fixtureModifyEffectiveValueHandler: EffectRuntimeHandler = {
  ...modifyEffectiveValueHandler,
  effectId: "fixture_modify_effective_value",
  execute() {
    return {
      ok: false,
      error: "fixture_modify_effective_value is an effective-value-only effect",
    };
  },
};

const fixtureAddPowerEqualToTargetCostHandler: EffectRuntimeHandler = {
  effectId: "fixture_add_power_equal_to_target_cost",
  validateShape(subjectId, effect) {
    return validateCardTargetSelector(
      subjectId,
      effect,
      "fixture target-cost power",
      "mainMarketCard"
    );
  },
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

const topdeckGainedCardHandler: EffectRuntimeHandler = {
  effectId: "topdeck_gained_card",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "onGainCard") {
      errors.push(
        `${subjectId} uses unsupported topdeck-gained-card timing ${String(effect["timing"])}`
      );
    }

    const destination = effect["destination"];
    if (destination !== undefined && destination !== "deckTop") {
      errors.push(
        `${subjectId} uses unsupported topdeck-gained-card destination ${
          typeof destination === "string" ? destination : "<unknown>"
        }`
      );
    }

    const cardTypes = effect["cardTypes"];
    if (
      cardTypes !== undefined &&
      (!Array.isArray(cardTypes) ||
        cardTypes.length === 0 ||
        !cardTypes.every(isNonEmptyString))
    ) {
      errors.push(
        `${subjectId} uses unsupported topdeck-gained-card filter cardTypes`
      );
    }

    if (effect["isOngoing"] !== undefined && effect["isOngoing"] !== true) {
      errors.push(
        `${subjectId} uses unsupported topdeck-gained-card filter isOngoing`
      );
    }

    for (const filterField of ["cardDefinitionIds", "cardKind"] as const) {
      if (effect[filterField] !== undefined) {
        errors.push(
          `${subjectId} uses unsupported topdeck-gained-card filter ${filterField}`
        );
      }
    }

    return errors;
  },
  execute() {
    return {
      ok: false,
      error: "topdeck_gained_card is a gained-card replacement effect",
    };
  },
};

const temporaryHandLimitByGainedCardTypeHandler: EffectRuntimeHandler = {
  effectId: "temporary_hand_limit_by_gained_card_type",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "endTurn") {
      errors.push(
        `${subjectId} uses unsupported temporary-hand-limit timing ${String(effect["timing"])}`
      );
    }

    errors.push(
      ...validatePositiveIntegerAmount(subjectId, effect, "hand limit amount")
    );

    const cardTypes = effect["cardTypes"];
    if (
      !Array.isArray(cardTypes) ||
      cardTypes.length === 0 ||
      !cardTypes.every(isNonEmptyString)
    ) {
      errors.push(
        `${subjectId} uses unsupported temporary-hand-limit filter cardTypes`
      );
    } else {
      for (const cardType of cardTypes) {
        if (!RUNTIME_CARD_TYPES.has(cardType)) {
          errors.push(
            `${subjectId} uses unknown temporary-hand-limit card type ${cardType}`
          );
        }
      }
    }

    for (const filterField of [
      "cardDefinitionIds",
      "cardKind",
      "isOngoing",
    ] as const) {
      if (effect[filterField] !== undefined) {
        errors.push(
          `${subjectId} uses unsupported temporary-hand-limit filter ${filterField}`
        );
      }
    }

    return errors;
  },
  execute() {
    return {
      ok: false,
      error:
        "temporary_hand_limit_by_gained_card_type is an end-turn hand-limit effect",
    };
  },
};

const modifyOwnedWandAttackDamageHandler: EffectRuntimeHandler = {
  effectId: "modify_owned_wand_attack_damage",
  validateShape(subjectId, effect) {
    return [
      ...validateWandAttackReplacementShape(subjectId, effect),
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "wand attack damage amount"
      ),
    ];
  },
  execute() {
    return {
      ok: false,
      error: "modify_owned_wand_attack_damage is an attack replacement effect",
    };
  },
};

const preventDefenseAgainstOwnedWandAttacksHandler: EffectRuntimeHandler = {
  effectId: "prevent_defense_against_owned_wand_attacks",
  validateShape(subjectId, effect) {
    return validateWandAttackReplacementShape(subjectId, effect);
  },
  execute() {
    return {
      ok: false,
      error:
        "prevent_defense_against_owned_wand_attacks is an attack replacement effect",
    };
  },
};

const attackDamageHandler: EffectRuntimeHandler = {
  effectId: "attack_damage",
  allowedTargetSelectors: attackTargetSelectors,
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "attack damage amount"
      ),
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "attack",
        attackTargetSelectors
      ),
    ];
  },
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

    const amount = requirePositiveIntegerAmount(effect, "attack damage amount");
    if (!amount.ok) {
      return amount;
    }
    return executeAttackWithAmount(
      state,
      player,
      effect,
      source,
      services,
      amount.value
    );
  },
};

const addPowerIfPlayerHasStatusHandler: EffectRuntimeHandler = {
  effectId: "add_power_if_player_has_status",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "whileControlled") {
      errors.push(
        `${subjectId} uses unsupported passive power timing ${String(effect["timing"])}`
      );
    }
    if (effect["statusId"] !== "dingler") {
      errors.push(
        `${subjectId} uses unsupported status ${String(effect["statusId"])}`
      );
    }
    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      errors.push(
        `${subjectId} uses invalid passive power amount ${String(amount)}`
      );
    }
    return errors;
  },
  execute() {
    return {
      ok: false,
      error: "add_power_if_player_has_status is a passive controlled effect",
    };
  },
};

const addPowerPerControlledObjectHandler: EffectRuntimeHandler = {
  effectId: "add_power_per_controlled_object",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "onPlay") {
      errors.push(
        `${subjectId} uses unsupported add-power timing ${String(effect["timing"])}`
      );
    }

    return [
      ...errors,
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "controlled-object power amount"
      ),
    ];
  },
  execute(state, player, effect, source) {
    const amountPerObject = requirePositiveIntegerAmount(
      effect,
      "controlled-object power amount"
    );
    if (!amountPerObject.ok) {
      return amountPerObject;
    }

    const amount = countControlledObjects(player) * amountPerObject.value;
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

const attackDamageEqualToControlledCardCostHandler: EffectRuntimeHandler = {
  effectId: "attack_damage_equal_to_controlled_card_cost",
  allowedTargetSelectors: attackTargetSelectors,
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    const costMode = effect["costMode"];
    if (costMode !== "highest" && costMode !== "chosen") {
      errors.push(
        `${subjectId} uses unsupported controlled-card cost mode ${String(costMode)}`
      );
    }

    if (
      effect["excludeSource"] !== undefined &&
      typeof effect["excludeSource"] !== "boolean"
    ) {
      errors.push(`${subjectId} uses non-boolean excludeSource`);
    }

    return [
      ...errors,
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "attack",
        attackTargetSelectors
      ),
    ];
  },
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
      services
    );
    if (!amountResult.ok) {
      return amountResult;
    }

    if (amountResult.amount <= 0) {
      return { ok: true };
    }

    return executeAttackWithAmount(
      state,
      player,
      effect,
      source,
      services,
      amountResult.amount
    );
  },
};

function countControlledObjects(player: PlayerState): number {
  return (
    player.permanents.length +
    player.deadWizardTokens.length +
    player.wizardProperties.length +
    player.statuses.length +
    player.trophyLikeObjects.length
  );
}

function resolveControlledCardCost(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): { ok: true; amount: number } | { ok: false; error: string } {
  const cards = getControlledCardsForCost(state, player, effect, source);
  if (cards.length === 0) {
    return { ok: true, amount: 0 };
  }

  if (effect["costMode"] === "highest") {
    return {
      ok: true,
      amount: Math.max(
        ...cards.map(({ definition }) =>
          calculateEffectiveCardCost(state, player.playerId, definition)
        )
      ),
    };
  }

  if (effect["costMode"] === "chosen") {
    const choices = cards.map(({ card, definition }) => ({
      choiceKind: "cardTarget" as const,
      choiceId: card.instanceId,
      cards: [card],
      amount: calculateEffectiveCardCost(state, player.playerId, definition),
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
    error: `Unsupported controlled-card cost mode ${String(effect["costMode"])}`,
  };
}

function getControlledCardsForCost(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext
): { card: CardInstance; definition: CardDefinition }[] {
  return [...player.permanents, ...player.playedThisTurn]
    .filter(
      (card) =>
        effect["excludeSource"] !== true ||
        card.instanceId !== source.cardInstanceId
    )
    .map((card) => {
      const definition = state.cardDefinitions.get(card.definitionId);
      if (definition === undefined) {
        throw new Error(`Missing card definition ${card.definitionId}`);
      }

      return { card, definition };
    });
}

function executeAttackWithAmount(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext,
  services: EffectRuntimeServices,
  amount: number
): EffectExecutionResult {
  const attackProfile = services.getWizardPropertyAttackProfile(
    state,
    player,
    source
  );
  const attackAmount = amount + attackProfile.damageBonus;
  const effectId = effect.effectId;

  if (effect["targetSelector"] === "eachFoe") {
    recordGameEvent(state, {
      type: "attackCreated",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      amount: attackAmount,
      sourceType: source.sourceType,
    });

    for (const targetPlayer of services.getOpponentsInSeatingOrder(
      state,
      player
    )) {
      const attackResult = services.resolveAttackTarget(
        state,
        player,
        targetPlayer,
        attackAmount,
        effectId,
        source,
        attackProfile.unavoidable
      );
      const branchResult = executeAttackBranches(
        state,
        player,
        effect,
        source,
        targetPlayer,
        attackResult,
        services
      );
      if (!branchResult.ok) {
        return branchResult;
      }
    }

    return { ok: true };
  }

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
      error: "Attack effect requires a player target",
    };
  }

  const targetPlayer = targetResult.choice.player;
  recordGameEvent(state, {
    type: "attackCreated",
    playerId: player.playerId,
    targetPlayerId: targetPlayer.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    amount: attackAmount,
    sourceType: source.sourceType,
  });
  if (
    !attackProfile.unavoidable &&
    services.resolveDefenseWindow(state, targetPlayer)
  ) {
    recordGameEvent(state, {
      type: "attackAvoided",
      playerId: targetPlayer.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  const attackResult = services.dealDamage(
    state,
    player,
    targetPlayer,
    attackAmount,
    effectId,
    source
  );
  return executeAttackBranches(
    state,
    player,
    effect,
    source,
    targetPlayer,
    { ...attackResult, avoided: false },
    services
  );
}

const avoidAttackHandler: EffectRuntimeHandler = {
  effectId: "avoid_attack",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["timing"] !== "onDefense") {
      errors.push(
        `${subjectId} uses unsupported defense timing ${String(effect["timing"])}`
      );
    }

    const destination = effect["destination"];
    if (destination !== "discardSelf" && destination !== "topdeckSelf") {
      errors.push(
        `${subjectId} uses unsupported defense branch ${String(destination)}`
      );
    }

    return errors;
  },
  execute(_state, _player, _effect) {
    return { ok: true };
  },
};

const gainChipsHandler: EffectRuntimeHandler<GainChipsRuntimeEffect> = {
  effectId: "gain_chips",
  validateShape(subjectId, effect) {
    return validatePositiveIntegerAmount(subjectId, effect, "chip amount");
  },
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

const gainChipsPerPlayerWithStatusHandler: EffectRuntimeHandler = {
  effectId: "gain_chips_per_player_with_status",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    const amountPerPlayer = effect["amountPerPlayer"];
    if (
      typeof amountPerPlayer !== "number" ||
      !Number.isSafeInteger(amountPerPlayer) ||
      amountPerPlayer <= 0
    ) {
      errors.push(
        `${subjectId} uses invalid chip amount ${String(amountPerPlayer)}`
      );
    }

    if (effect["status"] !== "dingler") {
      errors.push(
        `${subjectId} uses unsupported status ${String(effect["status"])}`
      );
    }

    return errors;
  },
  execute(state, player, effect, source) {
    const amountPerPlayer = effect["amountPerPlayer"];
    if (typeof amountPerPlayer !== "number" || effect["status"] !== "dingler") {
      return {
        ok: false,
        error: "Invalid gain_chips_per_player_with_status effect",
      };
    }

    const matchingPlayerCount = state.players.filter((candidate) => {
      return candidate.statuses.some(
        (candidateStatus) => candidateStatus.statusId === "dingler"
      );
    }).length;
    const amount = matchingPlayerCount * amountPerPlayer;
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

const drawCardsHandler: EffectRuntimeHandler = {
  effectId: "draw_cards",
  validateShape(subjectId, effect) {
    return validatePositiveIntegerAmount(subjectId, effect, "draw amount");
  },
  execute(state, player, effect, source) {
    const amount = requirePositiveIntegerAmount(effect, "draw amount");
    if (!amount.ok) {
      return amount;
    }

    const drawnCount = drawCards(player, amount.value, state);
    recordGameEvent(state, {
      type: "effectDrawCardsApplied",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "draw_cards",
      amount: drawnCount,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const directionalChainAttackHandler: EffectRuntimeHandler = {
  effectId: "directional_chain_attack",
  allowedTargetSelectors: directionalAttackTargetSelectors,
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "attack damage amount"
      ),
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "directional attack",
        directionalAttackTargetSelectors
      ),
    ];
  },
  execute(state, player, effect, source, services) {
    const amount = requirePositiveIntegerAmount(effect, "attack damage amount");
    if (!amount.ok) {
      return amount;
    }

    const attackProfile = services.getWizardPropertyAttackProfile(
      state,
      player,
      source
    );
    const attackAmount = amount.value + attackProfile.damageBonus;
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
    const foes =
      directionChoice?.choiceKind === "directionalPlayerTarget"
        ? directionChoice.players
        : [];
    const attacked = new Set<string>();

    recordGameEvent(state, {
      type: "attackCreated",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "directional_chain_attack",
      amount: attackAmount,
      sourceType: source.sourceType,
    });

    for (const targetPlayer of foes) {
      if (attacked.has(targetPlayer.playerId)) {
        continue;
      }

      attacked.add(targetPlayer.playerId);
      const attackResult = services.resolveAttackTarget(
        state,
        player,
        targetPlayer,
        attackAmount,
        "directional_chain_attack",
        source,
        attackProfile.unavoidable
      );
      if (!attackResult.killed) {
        break;
      }
    }

    return { ok: true };
  },
};

const multiTargetAttackHandler: EffectRuntimeHandler = {
  effectId: "multi_target_attack",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "attack damage amount"
      ),
      ...validatePlayerTargetSelector(
        subjectId,
        effect,
        "multi-target attack",
        ["opponentPlayers"]
      ),
    ];
  },
  execute(state, player, effect, source, services) {
    const target = effect.target;
    if (
      !isRuntimeEffectSelectorTarget(target) ||
      target.selector !== "opponentPlayers"
    ) {
      return {
        ok: false,
        error: "Unsupported multi-target attack selector",
      };
    }

    const amount = requirePositiveIntegerAmount(effect, "attack damage amount");
    if (!amount.ok) {
      return amount;
    }

    const attackProfile = services.getWizardPropertyAttackProfile(
      state,
      player,
      source
    );
    const attackAmount = amount.value + attackProfile.damageBonus;
    recordGameEvent(state, {
      type: "attackCreated",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "multi_target_attack",
      amount: attackAmount,
      sourceType: source.sourceType,
    });

    for (const targetPlayer of services.getOpponentsInSeatingOrder(
      state,
      player
    )) {
      services.resolveAttackTarget(
        state,
        player,
        targetPlayer,
        attackAmount,
        "multi_target_attack",
        source,
        attackProfile.unavoidable
      );
    }

    return { ok: true };
  },
};

const mayhemAttackHandler: EffectRuntimeHandler = {
  effectId: "mayhem_attack",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "Mayhem attack damage amount"
      ),
      ...validatePlayerTargetSelector(subjectId, effect, "Mayhem attack", [
        "allPlayers",
      ]),
    ];
  },
  execute(state, player, effect, source, services) {
    const target = effect.target;
    if (
      !isRuntimeEffectSelectorTarget(target) ||
      target.selector !== "allPlayers"
    ) {
      return {
        ok: false,
        error: "Unsupported Mayhem attack selector",
      };
    }

    const amount = requirePositiveIntegerAmount(effect, "attack damage amount");
    if (!amount.ok) {
      return amount;
    }

    services.resolveMayhemAttack(
      state,
      player,
      amount.value,
      "mayhem_attack",
      source
    );
    return { ok: true };
  },
};

const revealTopCardHandler: EffectRuntimeHandler = {
  effectId: "reveal_top_card",
  validateShape(subjectId, effect) {
    if (effect["source"] !== "activePlayerDeck") {
      return [
        `${subjectId} uses unsupported reveal source ${String(effect["source"])}`,
      ];
    }

    return [];
  },
  execute(state, player, effect, source, services) {
    const effectId = effect.effectId;
    const card = services.peekTopDeckCard(player, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectRevealSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    recordGameEvent(state, {
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
  },
};

const playTopCardHandler: EffectRuntimeHandler = {
  effectId: "play_top_card",
  validateShape(subjectId, effect) {
    const errors: string[] = [];
    if (effect["source"] !== "activePlayerDeck") {
      errors.push(
        `${subjectId} uses unsupported play-top source ${String(effect["source"])}`
      );
    }

    if (effect["destination"] !== "play") {
      errors.push(
        `${subjectId} uses unsupported play-top destination ${String(effect["destination"])}`
      );
    }

    return errors;
  },
  execute(state, player, effect, source, services) {
    const effectId = effect.effectId;
    const card = services.drawTopDeckCard(player, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectPlayTopSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const playedResult = services.playResolvedCard(state, player, card);
    if (!playedResult.ok || playedResult.gameEnd !== undefined) {
      return playedResult;
    }

    recordGameEvent(state, {
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
  },
};

const playTopCardFromFoeDeckHandler: EffectRuntimeHandler = {
  effectId: "play_top_card_from_foe_deck",
  allowedTargetSelectors: chosenFoeTargetSelectors,
  validateShape(subjectId, effect) {
    if (effect["targetSelector"] !== "chosenFoe") {
      return [
        `${subjectId} uses unsupported foe-deck target ${String(effect["targetSelector"])}`,
      ];
    }

    return [];
  },
  execute(state, player, effect, source, services) {
    const foe = services
      .getOpponentsInSeatingOrder(state, player)
      .find((candidate) => {
        return candidate.deck.length > 0 || candidate.discard.length > 0;
      });
    if (foe === undefined) {
      recordGameEvent(state, {
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const card = services.drawTopDeckCard(foe, state);
    if (card === undefined) {
      recordGameEvent(state, {
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        targetPlayerId: foe.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: effect.effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const playedResult = services.playResolvedCard(state, player, card, {
      nonOngoingOwnerId: card.ownerId,
      ongoingOwnerId: player.playerId,
    });
    if (!playedResult.ok || playedResult.gameEnd !== undefined) {
      return playedResult;
    }

    recordGameEvent(state, {
      type: "effectFoeDeckCardPlayed",
      playerId: player.playerId,
      targetPlayerId: foe.playerId,
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

const wildMagicChoiceHandler: EffectRuntimeHandler = {
  effectId: "wild_magic_choice",
  validateShape(subjectId, effect) {
    const options = effect.options;
    if (!Array.isArray(options)) {
      return [`${subjectId} uses wild_magic_choice without options`];
    }

    const errors: string[] = [];
    for (const option of options) {
      if (!isWildMagicOption(option)) {
        errors.push(`${subjectId} uses invalid Wild Magic option`);
        continue;
      }

      const optionEffectId = option.effectId;
      if (!isRuntimeEffectId(optionEffectId)) {
        errors.push(
          `${subjectId} uses unsupported Wild Magic option ${String(optionEffectId)}`
        );
        continue;
      }

      const catalogEntry = effectRuntimeCatalog.get(optionEffectId);
      if (catalogEntry === undefined) {
        errors.push(
          `${subjectId} uses unsupported Wild Magic option ${optionEffectId}`
        );
        continue;
      }

      errors.push(...catalogEntry.handler.validateShape(subjectId, option));
    }

    return errors;
  },
  execute(state, player, effect, source, services) {
    const options = effect.options;
    if (!Array.isArray(options)) {
      return {
        ok: false,
        error: "Wild Magic effect requires options",
      };
    }

    const legalOptions = options.filter(
      (option): option is WildMagicOption =>
        isWildMagicOption(option) &&
        services.isLegalWildMagicOption(state, player, option)
    );
    const choices: EffectChoice[] = legalOptions.map((_, index) => ({
      choiceKind: "option",
      choiceId: `wild_magic_option_${index}`,
    }));
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      effect.effectId,
      choices
    );
    const selectedOption = legalOptions[choices.indexOf(choice!)];

    if (selectedOption !== undefined) {

      recordGameEvent(state, {
        type: "wildMagicChoiceSelected",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: selectedOption.effectId,
        sourceType: source.sourceType,
      });
      return services.executeEffect(state, player, selectedOption, source);
    }

    recordGameEvent(state, {
      type: "wildMagicChoiceSkipped",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "wild_magic_choice",
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

function validateCardTargetSelector(
  subjectId: string,
  effect: RuntimeEffectPayload,
  effectLabel: string,
  expectedSelector: string
): string[] {
  const target = effect["target"];
  const selector =
    target !== undefined && "selector" in target ? target.selector : target;
  if (selector !== expectedSelector) {
    return [
      `${subjectId} uses unsupported ${effectLabel} target ${formatUnknown(selector)}`,
    ];
  }

  return [];
}

function validatePlayerTargetSelector(
  subjectId: string,
  effect: RuntimeEffectPayload,
  effectLabel: string,
  expectedSelectors: readonly string[]
): string[] {
  const target = effect["target"];
  const targetSelector = effect["targetSelector"];
  if (
    (target !== undefined &&
      "selector" in target &&
      expectedSelectors.includes(String(target.selector))) ||
    expectedSelectors.includes(String(targetSelector))
  ) {
    return [];
  }

  const selector =
    target !== undefined && "selector" in target
      ? target.selector
      : targetSelector;
  return [
    `${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`,
  ];
}

function validatePositiveIntegerAmount(
  subjectId: string,
  effect: RuntimeEffectPayload,
  amountLabel: string
): string[] {
  const amount = effect["amount"];
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return [`${subjectId} uses invalid ${amountLabel} ${String(amount)}`];
  }

  return [];
}

function validateLifeTotal(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const lifeTotal = effect["lifeTotal"];
  if (
    typeof lifeTotal !== "number" ||
    !Number.isSafeInteger(lifeTotal) ||
    lifeTotal < 1
  ) {
    return [`${subjectId} uses invalid life total ${String(lifeTotal)}`];
  }

  return [];
}

function validateSetupTiming(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  if (effect["timing"] !== "setup") {
    return [
      `${subjectId} uses unsupported setup timing ${String(effect["timing"])}`,
    ];
  }

  return [];
}

function validateReplacementTiming(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  if (effect["timing"] !== "replacement") {
    return [
      `${subjectId} uses unsupported replacement timing ${String(effect["timing"])}`,
    ];
  }

  return [];
}

function validateEffectiveValueModifierTarget(
  subjectId: string,
  valueKind: unknown,
  effect: RuntimeEffectPayload
): string[] {
  const target = effect["target"];
  if (!isEffectRecord(target)) {
    return [
      `${subjectId} uses invalid effective-value target ${formatUnknown(target)}`,
    ];
  }

  if (valueKind === "cardCost" || valueKind === "cardVictoryPoints") {
    if (target["targetType"] !== "card") {
      return [
        `${subjectId} uses unsupported effective-value target ${String(target["targetType"])}`,
      ];
    }

    if (isNonEmptyString(target["definitionId"])) {
      return [];
    }

    const cardTypes = target["cardTypes"];
    if (
      Array.isArray(cardTypes) &&
      cardTypes.length > 0 &&
      cardTypes.every(isNonEmptyString)
    ) {
      return [];
    }

    return [
      `${subjectId} uses invalid effective-value card target ${String(target["definitionId"])}`,
    ];
  }

  if (valueKind === "tokenVictoryPoints") {
    if (
      target["targetType"] === "token" &&
      (isNonEmptyString(target["definitionId"]) ||
        ("tokenKind" in target && target["tokenKind"] === "deadWizardToken"))
    ) {
      return [];
    }

    return [
      `${subjectId} uses unsupported effective-value target ${String(target["targetType"])}`,
    ];
  }

  if (valueKind === "playerMaxLife" || valueKind === "playerVictoryPoints") {
    if (target["targetType"] === "player") {
      return [];
    }

    return [
      `${subjectId} uses unsupported effective-value target ${String(target["targetType"])}`,
    ];
  }

  return [];
}

function validateWandAttackReplacementShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors: string[] = [];
  if (effect["timing"] !== "attackReplacement") {
    errors.push(
      `${subjectId} uses unsupported wand-attack replacement timing ${String(effect["timing"])}`
    );
  }

  const cardDefinitionIds = effect["cardDefinitionIds"];
  const cardTags = effect["cardTags"];
  const hasValidCardDefinitionIds =
    Array.isArray(cardDefinitionIds) &&
    cardDefinitionIds.length > 0 &&
    cardDefinitionIds.every(isNonEmptyString);
  const hasValidCardTags =
    Array.isArray(cardTags) &&
    cardTags.length > 0 &&
    cardTags.every(isNonEmptyString);

  if (cardDefinitionIds !== undefined && !hasValidCardDefinitionIds) {
    errors.push(
      `${subjectId} uses unsupported wand-attack replacement filter cardDefinitionIds`
    );
  }

  if (cardTags !== undefined && !hasValidCardTags) {
    errors.push(
      `${subjectId} uses unsupported wand-attack replacement filter cardTags`
    );
  }

  if (cardDefinitionIds === undefined && cardTags === undefined) {
    errors.push(
      `${subjectId} uses unsupported wand-attack replacement filter cardDefinitionIds/cardTags`
    );
  }

  for (const fieldName of [
    "target",
    "targetSelector",
    "cardTypes",
    "cardKind",
    "isOngoing",
    "destination",
  ] as const) {
    if (effect[fieldName] !== undefined) {
      errors.push(
        `${subjectId} uses unsupported wand-attack replacement field ${fieldName}`
      );
    }
  }

  return errors;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStableDefinitionId(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim() === value;
}

function validateDinglerStatusEffectShape(
  subjectId: string,
  effect: RuntimeEffectPayload,
  effectLabel: string
): string[] {
  const errors: string[] = [];
  if (effect["statusId"] !== "dingler") {
    errors.push(
      `${subjectId} uses unsupported status ${
        typeof effect["statusId"] === "string"
          ? effect["statusId"]
          : "<unknown>"
      }`
    );
  }

  errors.push(
    ...validatePlayerTargetSelector(
      subjectId,
      effect,
      effectLabel,
      dinglerStatusTargetSelectors
    )
  );
  return errors;
}

function validateMegaMayhemSetLifeEffectShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors = validateMegaMayhemEachPlayerShape(subjectId, effect);
  const lifeTotal = effect["lifeTotal"];
  if (
    typeof lifeTotal !== "number" ||
    !Number.isSafeInteger(lifeTotal) ||
    lifeTotal < 1
  ) {
    errors.push(`${subjectId} uses invalid life total ${String(lifeTotal)}`);
  }
  return errors;
}

function validateMegaMayhemEachPlayerToggleDinglerShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors = validateMegaMayhemEachPlayerShape(subjectId, effect);
  if (effect["statusId"] !== undefined) {
    errors.push(
      `${subjectId} uses unsupported status ${
        typeof effect["statusId"] === "string"
          ? effect["statusId"]
          : "<unknown>"
      }`
    );
  }
  return errors;
}

function validateMegaMayhemEachPlayerShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors: string[] = [];
  if (effect["timing"] !== "onMayhemResolve") {
    errors.push(
      `${subjectId} uses unsupported MegaMayhem timing ${String(effect["timing"])}`
    );
  }
  if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
    errors.push(
      `${subjectId} uses unsupported MegaMayhem target ${String(effect["targetSelector"])}`
    );
  }
  return errors;
}

function validateMayhemEachPlayerShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors: string[] = [];
  if (effect["timing"] !== "onMayhemResolve") {
    errors.push(
      `${subjectId} uses unsupported Mayhem timing ${String(effect["timing"])}`
    );
  }
  if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
    errors.push(
      `${subjectId} uses unsupported Mayhem target ${String(effect["targetSelector"])}`
    );
  }
  return errors;
}

function validateMayhemHandRedrawOptions(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const options = effect["options"];
  if (!Array.isArray(options) || options.length !== 2) {
    return [`${subjectId} uses unsupported Mayhem hand-redraw options`];
  }

  const redrawOption: unknown = options[0];
  const damageOption: unknown = options[1];
  const errors: string[] = [];
  if (
    !isEffectRecord(redrawOption) ||
    redrawOption["effectId"] !== "discard_hand_then_draw_cards" ||
    redrawOption["drawAmount"] !== 5
  ) {
    errors.push(
      `${subjectId} uses unsupported Mayhem hand-redraw option ${String(
        isEffectRecord(redrawOption) ? redrawOption["effectId"] : redrawOption
      )}`
    );
  }

  if (
    !isEffectRecord(damageOption) ||
    damageOption["effectId"] !== "take_damage" ||
    damageOption["amount"] !== 5
  ) {
    errors.push(
      `${subjectId} uses unsupported Mayhem damage option ${String(
        isEffectRecord(damageOption) ? damageOption["effectId"] : damageOption
      )}`
    );
  }

  return errors;
}

function validateMayhemBattleHighestHandCostShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors = validateMayhemEachPlayerShape(subjectId, effect);
  if (effect["chooser"] !== "affectedPlayer") {
    errors.push(
      `${subjectId} uses unsupported Mayhem chooser ${String(effect["chooser"])}`
    );
  }
  const winnerDrawAmount = effect["winnerDrawAmount"];
  if (
    typeof winnerDrawAmount !== "number" ||
    !Number.isSafeInteger(winnerDrawAmount) ||
    winnerDrawAmount < 0
  ) {
    errors.push(
      `${subjectId} uses invalid Mayhem winner draw amount ${String(winnerDrawAmount)}`
    );
  }
  return errors;
}

function validateMayhemVoteDinglerShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors = validateMayhemEachPlayerShape(subjectId, effect);
  if (effect["chooser"] !== "affectedPlayer") {
    errors.push(
      `${subjectId} uses unsupported Mayhem chooser ${String(effect["chooser"])}`
    );
  }
  if (effect["voteTargetSelector"] !== "anyPlayer") {
    errors.push(
      `${subjectId} uses unsupported Mayhem vote target ${String(
        effect["voteTargetSelector"]
      )}`
    );
  }
  if (effect["statusId"] !== "dingler") {
    errors.push(
      `${subjectId} uses unsupported Mayhem vote status ${String(effect["statusId"])}`
    );
  }
  return errors;
}

function validateMayhemDinglerRecoveryShape(
  subjectId: string,
  effect: RuntimeEffectPayload
): string[] {
  const errors = validateMayhemEachPlayerShape(subjectId, effect);
  if (effect["chooser"] !== "affectedPlayer") {
    errors.push(
      `${subjectId} uses unsupported Mayhem chooser ${String(effect["chooser"])}`
    );
  }
  if (effect["statusId"] !== "dingler") {
    errors.push(
      `${subjectId} uses unsupported Mayhem recovery status ${String(effect["statusId"])}`
    );
  }
  for (const costField of ["lifeCost", "chipCost"] as const) {
    const cost = effect[costField];
    if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost <= 0) {
      errors.push(
        `${subjectId} uses invalid Mayhem recovery ${costField} ${String(cost)}`
      );
    }
  }
  return errors;
}

function payOptionalCosts(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult & { skipped?: boolean } {
  const { costs } = effect;
  if (costs === undefined) {
    return { ok: true };
  }

  if (effect["optional"] === true) {
    const canPay = costs.every((cost: RuntimeEffectCost) => {
      return cost.costId === "spend_chips" && player.chips >= cost.amount;
    });
    const choices: EffectChoice[] = canPay
      ? [
          {
            choiceKind: "option",
            choiceId: "pay_optional_cost",
          },
          {
            choiceKind: "option",
            choiceId: "skip_optional_cost",
          },
        ]
      : [
          {
            choiceKind: "option",
            choiceId: "skip_optional_cost",
          },
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

  for (const cost of costs) {
    if (cost.costId !== "spend_chips") {
      return {
        ok: false,
        error: `Unsupported attack cost ${cost.costId}`,
      };
    }

    if (player.chips < cost.amount) {
      if (effect["optional"] === true) {
        return { ok: true, skipped: true };
      }

      return { ok: false, error: "Cannot pay chip cost" };
    }

    player.chips -= cost.amount;
    recordGameEvent(state, {
      type: "effectCostPaid",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: effect.effectId,
      costId: "spend_chips",
      amount: cost.amount,
      sourceType: source.sourceType,
    });
  }

  return { ok: true };
}

function executeAttackBranches(
  state: GameState,
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: DamageResult & { avoided: boolean },
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (attackResult.avoided) {
    return { ok: true };
  }

  const onDamageDealt = effect.onDamageDealt;
  if (onDamageDealt !== undefined) {
    for (const branch of onDamageDealt) {
      const result = executeAttackBranch(
        state,
        player,
        branch,
        source,
        targetPlayer,
        attackResult,
        services
      );
      if (!result.ok) {
        return result;
      }
    }
  }

  const onKill = effect.onKill;
  if (attackResult.killed && onKill !== undefined) {
    for (const branch of onKill) {
      const result = executeAttackBranch(
        state,
        player,
        branch,
        source,
        targetPlayer,
        attackResult,
        services
      );
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}

function collectMayhemAttackDefenseDecisions(
  state: GameState,
  targets: readonly PlayerState[],
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): Array<{ player: PlayerState; avoided: boolean }> {
  const decisions: Array<{ player: PlayerState; avoided: boolean }> = [];

  recordGameEvent(state, {
    type: "mayhemDecisionPhaseStarted",
    playerId: source.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });

  for (const targetPlayer of targets) {
    recordGameEvent(state, {
      type: "mayhemDecisionStarted",
      playerId: source.playerId,
      targetPlayerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId,
      sourceType: source.sourceType,
    });
    const avoided = services.resolveDefenseWindow(state, targetPlayer);
    if (avoided) {
      recordGameEvent(state, {
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

  recordGameEvent(state, {
    type: "mayhemResolutionPhaseStarted",
    playerId: source.playerId,
    cardInstanceId: source.cardInstanceId,
    definitionId: source.definitionId,
    effectId,
    sourceType: source.sourceType,
  });

  return decisions;
}

function executeAttackBranch(
  state: GameState,
  player: PlayerState,
  branch: AttackOutcomeBranch,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: DamageResult,
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

    if (remaining > 0) {
      player.chips += remaining;
    }

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
    const amount = branch.amount;

    const returnChoice = services.chooseEffectChoice(
      state,
      player,
      source,
      "return_discard_to_hand",
      buildDiscardReturnChoices(player.discard, amount)
    );
    const returned =
      returnChoice?.choiceKind === "cardTarget" ? returnChoice.cards : [];
    for (const card of returned) {
      const index = player.discard.indexOf(card);
      if (index >= 0) {
        player.discard.splice(index, 1);
      }
    }
    player.hand.push(...returned);
    recordGameEvent(state, {
      type: "effectCardsReturnedToHand",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "return_discard_to_hand",
      amount: returned.length,
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  if (branch.effectId === "gain_status" && branch.statusId === "dingler") {
    services.gainDinglerStatus(state, targetPlayer, "gain_status", source);
    return { ok: true };
  }

  return {
    ok: false,
    error: `Unsupported attack branch ${services.asString(branch.effectId)}`,
  };
}

function buildDiscardReturnChoices(
  discard: readonly CardInstance[],
  maxAmount: number
): EffectChoice[] {
  const cappedAmount = Math.min(maxAmount, discard.length);
  const choices: EffectChoice[] = [];
  for (let amount = cappedAmount; amount >= 1; amount -= 1) {
    for (const cards of chooseCardCombinations(discard, amount)) {
      choices.push({
        choiceKind: "cardTarget",
        choiceId: `return_${amount}`,
        amount,
        cards,
      });
    }
  }

  choices.push({
    choiceKind: "cardTarget",
    choiceId: "return_0",
    amount: 0,
    cards: [],
  });
  return choices;
}

function chooseCardCombinations(
  cards: readonly CardInstance[],
  amount: number,
  startIndex = 0
): CardInstance[][] {
  if (amount === 0) {
    return [[]];
  }

  const combinations: CardInstance[][] = [];
  for (let index = startIndex; index <= cards.length - amount; index += 1) {
    const card = cards[index];
    if (card === undefined) {
      continue;
    }

    for (const tail of chooseCardCombinations(cards, amount - 1, index + 1)) {
      combinations.push([card, ...tail]);
    }
  }

  return combinations;
}

function requirePositiveIntegerAmount(
  effect: RuntimeEffectPayload,
  amountLabel: string
): { ok: true; value: number } | { ok: false; error: string } {
  const amount = effect["amount"];
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return {
      ok: false,
      error: `Invalid ${amountLabel} ${String(amount)}`,
    };
  }

  return {
    ok: true,
    value: amount,
  };
}

function recordEffectChipsChanged(
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

function drawCards(
  player: PlayerState,
  count: number,
  state: GameState
): number {
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

function sumHandCost(state: GameState, player: PlayerState): number {
  return player.hand.reduce((total, card) => {
    const cost = state.cardDefinitions.get(card.definitionId)?.engine.cost;
    return total + (typeof cost === "number" ? cost : 0);
  }, 0);
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
interface EffectRecord {
  amount?: unknown;
  cardTypes?: unknown;
  definitionId?: unknown;
  drawAmount?: unknown;
  effectId?: unknown;
  targetType?: unknown;
  tokenKind?: unknown;
}

function isEffectRecord(effect: unknown): effect is EffectRecord {
  return isPlainRecord(effect);
}
function formatUnknown(value: unknown): string {
  return String(value);
}

function setupOnlyExecutionError(
  effectId: RuntimeEffectId
): EffectExecutionResult {
  return {
    ok: false,
    error: `${effectId} is a setup-only wizard property effect`,
  };
}

function createUnsupportedEffectHandler(
  effectId: RuntimeEffectId
): EffectRuntimeHandler {
  return {
    effectId,
    unsupported: true,
    validateShape(subjectId) {
      return [`${subjectId} uses unsupported effect ${effectId}`];
    },
    execute() {
      return { ok: false, error: `Unsupported effect id ${effectId}` };
    },
  };
}
export const effectRuntimeHandlerMap = {
  add_power: addPowerHandler,
  add_power_per_player_with_status: addPowerPerPlayerWithStatusHandler,
  add_power_if_player_has_status: addPowerIfPlayerHasStatusHandler,
  add_power_per_controlled_object: addPowerPerControlledObjectHandler,
  gain_card: gainCardHandler,
  discard_card: discardCardHandler,
  destroy_card: destroyCardHandler,
  deal_damage: dealDamageHandler,
  heal: healHandler,
  heal_equal_damage_dealt_on_own_turn: healEqualDamageDealtOnOwnTurnHandler,
  set_life: setLifeHandler,
  exchange_life_and_dingler_status: exchangeLifeAndDinglerStatusHandler,
  attack_damage_equal_to_controlled_card_cost:
    attackDamageEqualToControlledCardCostHandler,
  gain_status: gainStatusHandler,
  attack_gain_status: attackGainStatusHandler,
  remove_status: removeStatusHandler,
  toggle_status: toggleStatusHandler,
  mega_mayhem_set_life: megaMayhemSetLifeHandler,
  mega_mayhem_each_player_toggle_dingler:
    megaMayhemEachPlayerToggleDinglerHandler,
  mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem:
    megaMayhemEachPlayerDestroyTopMainDeckHandler,
  mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none:
    mayhemEachPlayerDiscardTopDeckDestroyHandler,
  mayhem_each_player_discard_deck_then_destroy_from_discard:
    mayhemEachPlayerDiscardDeckDestroyHandler,
  mayhem_each_player_choose_discard_hand_draw_or_take_damage:
    mayhemEachPlayerHandRedrawChoiceHandler,
  mayhem_each_player_reduce_life_to_gain_chips:
    mayhemEachPlayerReduceLifeToGainChipsHandler,
  increase_hand_limit_at_max_life: increaseHandLimitAtMaxLifeHandler,
  mayhem_each_player_battle_highest_hand_cost:
    mayhemEachPlayerBattleHighestHandCostHandler,
  mayhem_each_player_vote_dingler: mayhemEachPlayerVoteDinglerHandler,
  mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status:
    mayhemEachDinglerRecoveryChoiceHandler,
  mayhem_lowest_life_players_gain_dingler_and_set_to_max_life:
    mayhemLowestLifeDinglerMaxLifeHandler,
  replace_starting_card: replaceStartingCardHandler,
  start_with_basic_trophy: startWithBasicTrophyHandler,
  force_starting_player: forceStartingPlayerHandler,
  set_starting_life_total: setStartingLifeTotalHandler,
  set_resurrection_life_total: setResurrectionLifeTotalHandler,
  modify_effective_value: modifyEffectiveValueHandler,
  fixture_modify_effective_value: fixtureModifyEffectiveValueHandler,
  fixture_add_power_equal_to_target_cost:
    fixtureAddPowerEqualToTargetCostHandler,
  topdeck_gained_card: topdeckGainedCardHandler,
  temporary_hand_limit_by_gained_card_type:
    temporaryHandLimitByGainedCardTypeHandler,
  modify_owned_wand_attack_damage: modifyOwnedWandAttackDamageHandler,
  prevent_defense_against_owned_wand_attacks:
    preventDefenseAgainstOwnedWandAttacksHandler,
  attack_damage: attackDamageHandler,
  avoid_attack: avoidAttackHandler,
  gain_chips: gainChipsHandler,
  gain_chips_per_player_with_status: gainChipsPerPlayerWithStatusHandler,
  draw_cards: drawCardsHandler,
  reveal_top_card: revealTopCardHandler,
  play_top_card: playTopCardHandler,
  play_top_card_from_foe_deck: playTopCardFromFoeDeckHandler,
  wild_magic_choice: wildMagicChoiceHandler,
  directional_chain_attack: directionalChainAttackHandler,
  multi_target_attack: multiTargetAttackHandler,
  mayhem_attack: mayhemAttackHandler,
  activation_destroy_self_then_destroy_own_cards:
    createUnsupportedEffectHandler(
      "activation_destroy_self_then_destroy_own_cards"
    ),
  add_power_per_controlled_permanent: createUnsupportedEffectHandler(
    "add_power_per_controlled_permanent"
  ),
  attack_damage_equal_remembered_card_cost: createUnsupportedEffectHandler(
    "attack_damage_equal_remembered_card_cost"
  ),
  attack_destroy_top_legend_deck_then_damage_equal_cost:
    createUnsupportedEffectHandler(
      "attack_destroy_top_legend_deck_then_damage_equal_cost"
    ),
  attack_discard_cards: createUnsupportedEffectHandler("attack_discard_cards"),
  attack_gain_limp_wand: createUnsupportedEffectHandler(
    "attack_gain_limp_wand"
  ),
  conditional_activation_attack_damage: createUnsupportedEffectHandler(
    "conditional_activation_attack_damage"
  ),
  conditional_activation_destroy_own_cards: createUnsupportedEffectHandler(
    "conditional_activation_destroy_own_cards"
  ),
  conditional_activation_gain_chips: createUnsupportedEffectHandler(
    "conditional_activation_gain_chips"
  ),
  controls_other_card_type: createUnsupportedEffectHandler(
    "controls_other_card_type"
  ),
  defense_discard_self_avoid_attack_then_optional_destroy_hand_card:
    createUnsupportedEffectHandler(
      "defense_discard_self_avoid_attack_then_optional_destroy_hand_card"
    ),
  destroy_own_cards: createUnsupportedEffectHandler("destroy_own_cards"),
  destroy_random_legend_market_card: createUnsupportedEffectHandler(
    "destroy_random_legend_market_card"
  ),
  destroyed_card_kind_is: createUnsupportedEffectHandler(
    "destroyed_card_kind_is"
  ),
  discard_hand_then_draw_cards: createUnsupportedEffectHandler(
    "discard_hand_then_draw_cards"
  ),
  discard_self: createUnsupportedEffectHandler("discard_self"),
  endgame_limp_wands_score_positive: createUnsupportedEffectHandler(
    "endgame_limp_wands_score_positive"
  ),
  endgame_vp_per_owned_legend: createUnsupportedEffectHandler(
    "endgame_vp_per_owned_legend"
  ),
  gain_chips_equal_damage_dealt: createUnsupportedEffectHandler(
    "gain_chips_equal_damage_dealt"
  ),
  heal_equal_damage_dealt: createUnsupportedEffectHandler(
    "heal_equal_damage_dealt"
  ),
  on_gain_self_gain_limp_wands: createUnsupportedEffectHandler(
    "on_gain_self_gain_limp_wands"
  ),
  ongoing_add_power: createUnsupportedEffectHandler("ongoing_add_power"),
  ongoing_add_power_when_playing_limp_wand: createUnsupportedEffectHandler(
    "ongoing_add_power_when_playing_limp_wand"
  ),
  ongoing_first_attack_damage_add_power: createUnsupportedEffectHandler(
    "ongoing_first_attack_damage_add_power"
  ),
  ongoing_hand_refill_bonus: createUnsupportedEffectHandler(
    "ongoing_hand_refill_bonus"
  ),
  ongoing_start_turn_optional_gain_limp_wand_to_hand:
    createUnsupportedEffectHandler(
      "ongoing_start_turn_optional_gain_limp_wand_to_hand"
    ),
  optional_gain_market_cards_to_hand_this_turn: createUnsupportedEffectHandler(
    "optional_gain_market_cards_to_hand_this_turn"
  ),
  optional_spend_chip_attack_damage: createUnsupportedEffectHandler(
    "optional_spend_chip_attack_damage"
  ),
  optional_spend_chip_destroy_own_cards: createUnsupportedEffectHandler(
    "optional_spend_chip_destroy_own_cards"
  ),
  return_discard_to_hand: createUnsupportedEffectHandler(
    "return_discard_to_hand"
  ),
} satisfies Record<RuntimeEffectId, EffectRuntimeHandler>;

export const effectRuntimeCatalogSource = createEffectRuntimeCatalogSource(
  effectRuntimeHandlerMap
);

function createEffectRuntimeCatalogSource(
  handlers: Record<RuntimeEffectId, EffectRuntimeHandler>
): Partial<Record<RuntimeEffectId, EffectRuntimeCatalogEntry>> {
  const source: Partial<Record<RuntimeEffectId, EffectRuntimeCatalogEntry>> =
    {};

  for (const handler of Object.values(handlers)) {
    if (handler.unsupported === true) {
      continue;
    }

    source[handler.effectId] = {
      effectId: handler.effectId,
      handler,
      supportedModes: fixtureOnlyRuntimeEffectIds.has(handler.effectId)
        ? ["fixture"]
        : allEffectRuntimeModes,
      supportedSourceKinds:
        handler.effectId === "temporary_hand_limit_by_gained_card_type"
          ? ["wizardProperty"]
          : allEffectRuntimeSourceKinds,
    };
  }

  return source;
}

export const effectRuntimeCatalog = new Map<
  RuntimeEffectId,
  EffectRuntimeCatalogEntry
>(
  Object.entries(effectRuntimeCatalogSource) as Array<
    [RuntimeEffectId, EffectRuntimeCatalogEntry]
  >
);

export const effectRuntimeRegistry = new Map<
  RuntimeEffectId,
  EffectRuntimeHandler
>(
  [...effectRuntimeCatalog].map(([effectId, entry]) => [
    effectId,
    entry.handler,
  ])
);

export function getEffectRuntimeCatalogEntry<EffectId extends RuntimeEffectId>(
  effectId: EffectId
): EffectRuntimeCatalogEntry<EffectId> | undefined {
  return effectRuntimeCatalog.get(effectId) as
    | EffectRuntimeCatalogEntry<EffectId>
    | undefined;
}

export function getEffectRuntimeHandler<EffectId extends RuntimeEffectId>(
  effectId: EffectId
): EffectRuntimeHandler<RuntimeEffectForId<EffectId>> | undefined {
  return getEffectRuntimeCatalogEntry(effectId)?.handler;
}

export function isEffectRuntimeCatalogEntrySupportedInMode<
  EffectId extends RuntimeEffectId,
>(
  entry: EffectRuntimeCatalogEntry<EffectId>,
  mode: EffectRuntimeMode
): boolean {
  return entry.supportedModes.includes(mode);
}

export type EffectRuntimeCatalogResolution =
  | { ok: true; entry: EffectRuntimeCatalogEntry }
  | { ok: false; errors: string[] };


export function resolveEffectRuntimeCatalogEntry(
  subjectId: string,
  rawEffectId: string,
  effect: RuntimeEffectPayload | object,
  mode: EffectRuntimeMode,
  sourceKind: EffectRuntimeSourceKind
): EffectRuntimeCatalogResolution {
  const entry = isRuntimeEffectId(rawEffectId)
    ? getEffectRuntimeCatalogEntry(rawEffectId)
    : undefined;
  if (entry === undefined) {
    return {
      ok: false,
      errors: [`${subjectId} uses unsupported effect id ${rawEffectId}`],
    };
  }

  if (!entry.supportedSourceKinds.includes(sourceKind)) {
    return {
      ok: false,
      errors: [`${subjectId} uses token-only effect id ${rawEffectId}`],
    };
  }

  if (!isEffectRuntimeCatalogEntrySupportedInMode(entry, mode)) {
    if (mode === "combat" && rawEffectId.startsWith("fixture_")) {
      return {
        ok: false,
        errors: [
          `${subjectId} uses fixture effect id ${rawEffectId} in combat data`,
        ],
      };
    }
    return {
      ok: false,
      errors: [
        `${subjectId} uses effect id ${rawEffectId} outside supported ${mode} mode`,
      ],
    };
  }

  const shapeErrors = entry.handler.validateShape(
    subjectId,
    effect as RuntimeEffectPayload
  );
  return shapeErrors.length > 0
    ? { ok: false, errors: shapeErrors }
    : { ok: true, entry };
}

export function tryExecuteSetupEffect(
  player: PlayerState,
  effect: RuntimeEffectPayload,
  source: SetupEffectSourceContext,
  services: EffectRuntimeSetupServices
): SetupEffectExecutionResult {
  const resolution = resolveEffectRuntimeCatalogEntry(
    `Setup effect ${String(effect["effectId"])}`,
    String(effect["effectId"]),
    effect,
    source.runtimeMode,
    "wizardProperty"
  );
  if (!resolution.ok) {
    return { status: "error", error: resolution.errors[0] ?? "Invalid setup effect" };
  }

  const executeSetup = resolution.entry.handler.executeSetup;
  if (executeSetup === undefined) {
    return {
      status: "error",
      error: `Setup effect executor missing for ${String(effect["effectId"])}`,
    };
  }

  const result = executeSetup(player, effect, source, services);
  return result.ok
    ? { status: "executed", ...(result.directive === undefined ? {} : { directive: result.directive }) }
    : { status: "error", error: result.error };
}
