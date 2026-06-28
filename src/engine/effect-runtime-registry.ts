import type { TokenDefinition } from "./data.js";
import { recordTurnPowerChanged } from "./event-recorder.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  TokenInstance,
} from "./setup.js";

export interface EffectSourceContext {
  sourceType: "card" | "wizardProperty";
  playerId: PlayerState["playerId"];
  cardInstanceId: string;
  definitionId: string;
  tokenInstanceId?: TokenInstance["instanceId"];
  tokenDefinitionId?: TokenDefinition["tokenId"];
}

export type EffectExecutionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type TargetChoice =
  | {
      choiceType: "card";
      card: CardInstance;
    }
  | {
      choiceType: "player";
      player: PlayerState;
    };

export interface EffectChoice {
  choiceId: string;
  amount?: number;
  direction?: "left" | "right";
  cards?: CardInstance[];
  players?: PlayerState[];
}

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
    effect: Record<string, unknown>,
    source: EffectSourceContext
  ): TargetChoiceResult;
  requireCardChoice(
    choice: TargetChoice,
    effectId: string
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
    effectId: string,
    source: EffectSourceContext
  ): boolean;
  moveCardToZonePreservingOwner(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
    destination: CardInstance[],
    destinationZone: string,
    effectId: string,
    source: EffectSourceContext
  ): boolean;
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
  getWizardPropertyAttackProfile(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext
  ): { damageBonus: number; unavoidable: boolean };
  chooseEffectChoice(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    effectId: string,
    choices: readonly EffectChoice[]
  ): EffectChoice | undefined;
  dealDamage(
    state: GameState,
    sourcePlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext
  ): DamageResult;
  resolveAttackTarget(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext,
    unavoidable?: boolean
  ): DamageResult & { avoided: boolean };
  resolveDefenseWindow(state: GameState, defendingPlayer: PlayerState): boolean;
  resolveMayhemAttack(
    state: GameState,
    sourcePlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext
  ): void;
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
    option: Record<string, unknown>
  ): boolean;
  executeEffect(
    state: GameState,
    player: PlayerState,
    effect: Record<string, unknown>,
    source: EffectSourceContext
  ): EffectExecutionResult;
  asString(value: unknown): string;
}

export interface EffectRuntimeHandler {
  effectId: string;
  validateShape(subjectId: string, effect: Record<string, unknown>): string[];
  execute(
    state: GameState,
    player: PlayerState,
    effect: Record<string, unknown>,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult;
}

export interface EffectRuntimeCatalogEntry {
  effectId: string;
  handler: EffectRuntimeHandler;
}

const addPowerHandler: EffectRuntimeHandler = {
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
    const errors = addPowerHandler.validateShape("Effect add_power", effect);
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid add_power effect",
      };
    }

    const amount = effect["amount"];
    if (typeof amount !== "number") {
      return {
        ok: false,
        error: "Invalid add_power effect",
      };
    }

    const powerBefore = state.turn.power;
    state.turn.power += amount;
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

    const effectId = services.asString(effect["effectId"]);
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

    state.eventLog.push({
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

    const effectId = services.asString(effect["effectId"]);
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

    state.eventLog.push({
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

    const effectId = services.asString(effect["effectId"]);
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

    state.eventLog.push({
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
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "damage amount"),
      ...validatePlayerTargetSelector(subjectId, effect, "damage", [
        "opponentPlayer",
      ]),
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
      services.asString(effect["effectId"]),
      source
    );
    return { ok: true };
  },
};

const attackDamageHandler: EffectRuntimeHandler = {
  effectId: "attack_damage",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "attack damage amount"
      ),
      ...validatePlayerTargetSelector(subjectId, effect, "attack", [
        "opponentPlayer",
        "chosenFoe",
        "chosenPlayer",
        "eachFoe",
      ]),
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

    const attackProfile = services.getWizardPropertyAttackProfile(
      state,
      player,
      source
    );
    const attackAmount = amount.value + attackProfile.damageBonus;

    if (effect["targetSelector"] === "eachFoe") {
      state.eventLog.push({
        type: "attackCreated",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: "attack_damage",
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
          "attack_damage",
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

    const effectId = services.asString(effect["effectId"]);
    const targetPlayer = targetResult.choice.player;
    state.eventLog.push({
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
      state.eventLog.push({
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
  },
};

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
  execute(_state, _player, effect) {
    const errors = avoidAttackHandler.validateShape(
      "Effect avoid_attack",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid avoid_attack effect",
      };
    }

    return { ok: true };
  },
};

const gainChipsHandler: EffectRuntimeHandler = {
  effectId: "gain_chips",
  validateShape(subjectId, effect) {
    return validatePositiveIntegerAmount(subjectId, effect, "chip amount");
  },
  execute(state, player, effect, source) {
    const amount = requirePositiveIntegerAmount(effect, "chip amount");
    if (!amount.ok) {
      return amount;
    }

    const chipsBefore = player.chips;
    player.chips += amount.value;
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
    const errors = gainChipsPerPlayerWithStatusHandler.validateShape(
      "Effect gain_chips_per_player_with_status",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid gain_chips_per_player_with_status effect",
      };
    }

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
    state.eventLog.push({
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
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(
        subjectId,
        effect,
        "attack damage amount"
      ),
      ...validatePlayerTargetSelector(subjectId, effect, "directional attack", [
        "leftOrRightFoe",
      ]),
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
          choiceId: "left",
          direction: "left",
          players: leftFoes,
        },
        {
          choiceId: "right",
          direction: "right",
          players: rightFoes,
        },
      ]
    );
    const foes = directionChoice?.players ?? [];
    const attacked = new Set<string>();

    state.eventLog.push({
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
    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "opponentPlayers") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      return {
        ok: false,
        error: `Unsupported multi-target attack selector ${String(selector)}`,
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
    state.eventLog.push({
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
    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "allPlayers") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      return {
        ok: false,
        error: `Unsupported Mayhem attack selector ${String(selector)}`,
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
    const errors = revealTopCardHandler.validateShape(
      "Effect reveal_top_card",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid reveal_top_card effect",
      };
    }

    const effectId = services.asString(effect["effectId"]);
    const card = services.peekTopDeckCard(player, state);
    if (card === undefined) {
      state.eventLog.push({
        type: "effectRevealSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    state.eventLog.push({
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
    const errors = playTopCardHandler.validateShape(
      "Effect play_top_card",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid play_top_card effect",
      };
    }

    const effectId = services.asString(effect["effectId"]);
    const card = services.drawTopDeckCard(player, state);
    if (card === undefined) {
      state.eventLog.push({
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
    if (!playedResult.ok) {
      return playedResult;
    }

    state.eventLog.push({
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
  validateShape(subjectId, effect) {
    if (effect["targetSelector"] !== "chosenFoe") {
      return [
        `${subjectId} uses unsupported foe-deck target ${String(effect["targetSelector"])}`,
      ];
    }

    return [];
  },
  execute(state, player, effect, source, services) {
    const errors = playTopCardFromFoeDeckHandler.validateShape(
      "Effect play_top_card_from_foe_deck",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid play_top_card_from_foe_deck effect",
      };
    }

    const foe = services
      .getOpponentsInSeatingOrder(state, player)
      .find((candidate) => {
        return candidate.deck.length > 0 || candidate.discard.length > 0;
      });
    if (foe === undefined) {
      state.eventLog.push({
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: services.asString(effect["effectId"]),
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const card = services.drawTopDeckCard(foe, state);
    if (card === undefined) {
      state.eventLog.push({
        type: "effectPlayTopFoeDeckSkipped",
        playerId: player.playerId,
        targetPlayerId: foe.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: services.asString(effect["effectId"]),
        sourceType: source.sourceType,
      });
      return { ok: true };
    }

    const playedResult = services.playResolvedCard(state, player, card, {
      nonOngoingOwnerId: card.ownerId,
      ongoingOwnerId: player.playerId,
    });
    if (!playedResult.ok) {
      return playedResult;
    }

    state.eventLog.push({
      type: "effectFoeDeckCardPlayed",
      playerId: player.playerId,
      targetPlayerId: foe.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: card.instanceId,
      targetDefinitionId: card.definitionId,
      effectId: services.asString(effect["effectId"]),
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const wildMagicChoiceHandler: EffectRuntimeHandler = {
  effectId: "wild_magic_choice",
  validateShape(subjectId, effect) {
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return [`${subjectId} uses wild_magic_choice without options`];
    }

    const errors: string[] = [];
    for (const option of options) {
      if (!isEffectRecord(option)) {
        errors.push(`${subjectId} uses invalid Wild Magic option`);
        continue;
      }

      const optionEffectId = option["effectId"];
      if (typeof optionEffectId !== "string") {
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
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return {
        ok: false,
        error: "Wild Magic effect requires options",
      };
    }

    for (const option of options) {
      if (
        !isEffectRecord(option) ||
        !services.isLegalWildMagicOption(state, player, option)
      ) {
        continue;
      }

      state.eventLog.push({
        type: "wildMagicChoiceSelected",
        playerId: player.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: services.asString(option["effectId"]),
        sourceType: source.sourceType,
      });
      return services.executeEffect(state, player, option, source);
    }

    state.eventLog.push({
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
  effect: Record<string, unknown>,
  effectLabel: string,
  expectedSelector: string
): string[] {
  const target = effect["target"];
  const selector =
    typeof target === "object" && target !== null
      ? (target as Record<string, unknown>)["selector"]
      : target;
  if (selector !== expectedSelector) {
    return [
      `${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`,
    ];
  }

  return [];
}

function validatePlayerTargetSelector(
  subjectId: string,
  effect: Record<string, unknown>,
  effectLabel: string,
  expectedSelectors: readonly string[]
): string[] {
  const target = effect["target"];
  const targetSelector = effect["targetSelector"];
  if (
    (isEffectRecord(target) &&
      expectedSelectors.includes(String(target["selector"]))) ||
    expectedSelectors.includes(String(targetSelector))
  ) {
    return [];
  }

  const selector = isEffectRecord(target) ? target["selector"] : targetSelector;
  return [
    `${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`,
  ];
}

function validatePositiveIntegerAmount(
  subjectId: string,
  effect: Record<string, unknown>,
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

function payOptionalCosts(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult & { skipped?: boolean } {
  const costs = effect["costs"];
  if (costs === undefined) {
    return { ok: true };
  }

  if (!Array.isArray(costs)) {
    return { ok: false, error: "Invalid attack costs" };
  }

  if (effect["optional"] === true) {
    const canPay = costs.every((cost) => {
      if (!isEffectRecord(cost) || cost["costId"] !== "spend_chips") {
        return false;
      }

      const amount = cost["amount"];
      return (
        typeof amount === "number" &&
        Number.isSafeInteger(amount) &&
        amount > 0 &&
        player.chips >= amount
      );
    });
    const choices: EffectChoice[] = canPay
      ? [
          {
            choiceId: "pay_optional_cost",
          },
          {
            choiceId: "skip_optional_cost",
          },
        ]
      : [
          {
            choiceId: "skip_optional_cost",
          },
        ];
    const choice = services.chooseEffectChoice(
      state,
      player,
      source,
      services.asString(effect["effectId"]),
      choices
    );
    if (choice?.choiceId !== "pay_optional_cost") {
      return { ok: true, skipped: true };
    }
  }

  for (const cost of costs) {
    if (!isEffectRecord(cost) || cost["costId"] !== "spend_chips") {
      return {
        ok: false,
        error: `Unsupported attack cost ${String(isEffectRecord(cost) ? cost["costId"] : cost)}`,
      };
    }

    const amount = cost["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return { ok: false, error: `Invalid chip cost ${String(amount)}` };
    }

    if (player.chips < amount) {
      if (effect["optional"] === true) {
        return { ok: true, skipped: true };
      }

      return { ok: false, error: "Cannot pay chip cost" };
    }

    player.chips -= amount;
    state.eventLog.push({
      type: "effectCostPaid",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: services.asString(effect["effectId"]),
      costId: "spend_chips",
      amount,
      sourceType: source.sourceType,
    });
  }

  return { ok: true };
}

function executeAttackBranches(
  state: GameState,
  player: PlayerState,
  effect: Record<string, unknown>,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: DamageResult & { avoided: boolean },
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (attackResult.avoided) {
    return { ok: true };
  }

  const onDamageDealt = effect["onDamageDealt"];
  if (Array.isArray(onDamageDealt)) {
    for (const branch of onDamageDealt) {
      if (!isEffectRecord(branch)) {
        return { ok: false, error: "Invalid attack damage branch" };
      }

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

  const onKill = effect["onKill"];
  if (attackResult.killed && Array.isArray(onKill)) {
    for (const branch of onKill) {
      if (!isEffectRecord(branch)) {
        return { ok: false, error: "Invalid attack kill branch" };
      }

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

function executeAttackBranch(
  state: GameState,
  player: PlayerState,
  branch: Record<string, unknown>,
  source: EffectSourceContext,
  targetPlayer: PlayerState,
  attackResult: DamageResult,
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (branch["effectId"] === "gain_chips") {
    const amount = branch["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return { ok: false, error: `Invalid chip gain ${String(amount)}` };
    }

    const chipsBefore = player.chips;
    player.chips += amount;
    state.eventLog.push({
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

  if (branch["effectId"] === "gain_chips_equal_damage_dealt") {
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

    state.eventLog.push({
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

  if (branch["effectId"] === "return_discard_to_hand") {
    const amount = branch["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return { ok: false, error: `Invalid return amount ${String(amount)}` };
    }

    const returnChoice = services.chooseEffectChoice(
      state,
      player,
      source,
      "return_discard_to_hand",
      buildDiscardReturnChoices(player.discard, amount)
    );
    const returned = returnChoice?.cards ?? [];
    for (const card of returned) {
      const index = player.discard.indexOf(card);
      if (index >= 0) {
        player.discard.splice(index, 1);
      }
    }
    player.hand.push(...returned);
    state.eventLog.push({
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

  if (
    branch["effectId"] === "gain_status" &&
    branch["statusId"] === "dingler"
  ) {
    targetPlayer.statuses.push({
      instanceId: `dingler-${targetPlayer.playerId}`,
      statusId: "dingler",
      ownerId: targetPlayer.playerId,
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
    });
    targetPlayer.life.current = Math.min(targetPlayer.life.current, 15);
    state.eventLog.push({
      type: "dinglerStatusGained",
      playerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "gain_status",
      sourceType: source.sourceType,
    });
    return { ok: true };
  }

  return {
    ok: false,
    error: `Unsupported attack branch ${services.asString(branch["effectId"])}`,
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
        choiceId: `return_${amount}`,
        amount,
        cards,
      });
    }
  }

  choices.push({
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
  effect: Record<string, unknown>,
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
  effectId: string,
  chipsBefore: number,
  chipsAfter: number
): void {
  state.eventLog.push({
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

function shuffleDiscardIntoDeckIfNeeded(
  player: PlayerState,
  state: GameState
): void {
  if (player.deck.length > 0 || player.discard.length === 0) {
    return;
  }

  player.deck.push(...player.discard.splice(0));
  shuffleInPlace(player.deck, state);
  state.eventLog.push({
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

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}

export const effectRuntimeCatalog = new Map<string, EffectRuntimeCatalogEntry>([
  [addPowerHandler.effectId, toCatalogEntry(addPowerHandler)],
  [gainCardHandler.effectId, toCatalogEntry(gainCardHandler)],
  [discardCardHandler.effectId, toCatalogEntry(discardCardHandler)],
  [destroyCardHandler.effectId, toCatalogEntry(destroyCardHandler)],
  [dealDamageHandler.effectId, toCatalogEntry(dealDamageHandler)],
  [attackDamageHandler.effectId, toCatalogEntry(attackDamageHandler)],
  [avoidAttackHandler.effectId, toCatalogEntry(avoidAttackHandler)],
  [gainChipsHandler.effectId, toCatalogEntry(gainChipsHandler)],
  [
    gainChipsPerPlayerWithStatusHandler.effectId,
    toCatalogEntry(gainChipsPerPlayerWithStatusHandler),
  ],
  [drawCardsHandler.effectId, toCatalogEntry(drawCardsHandler)],
  [revealTopCardHandler.effectId, toCatalogEntry(revealTopCardHandler)],
  [playTopCardHandler.effectId, toCatalogEntry(playTopCardHandler)],
  [
    playTopCardFromFoeDeckHandler.effectId,
    toCatalogEntry(playTopCardFromFoeDeckHandler),
  ],
  [wildMagicChoiceHandler.effectId, toCatalogEntry(wildMagicChoiceHandler)],
  [
    directionalChainAttackHandler.effectId,
    toCatalogEntry(directionalChainAttackHandler),
  ],
  [multiTargetAttackHandler.effectId, toCatalogEntry(multiTargetAttackHandler)],
  [mayhemAttackHandler.effectId, toCatalogEntry(mayhemAttackHandler)],
]);

export const effectRuntimeRegistry = new Map<string, EffectRuntimeHandler>(
  [...effectRuntimeCatalog].map(([effectId, entry]) => [
    effectId,
    entry.handler,
  ])
);

export function getEffectRuntimeCatalogEntry(
  effectId: string
): EffectRuntimeCatalogEntry | undefined {
  return effectRuntimeCatalog.get(effectId);
}

export function getEffectRuntimeHandler(
  effectId: string
): EffectRuntimeHandler | undefined {
  return getEffectRuntimeCatalogEntry(effectId)?.handler;
}

function toCatalogEntry(
  handler: EffectRuntimeHandler
): EffectRuntimeCatalogEntry {
  return {
    effectId: handler.effectId,
    handler,
  };
}
