import type { TokenDefinition } from "./data.js";
import { recordTurnPowerChanged } from "./event-recorder.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  TokenInstance,
} from "./setup.js";

export type EffectRuntimeMode = "combat" | "fixture";

export interface EffectSourceContext {
  sourceType: "card" | "wizardProperty";
  runtimeMode: EffectRuntimeMode;
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
  healPlayer(
    state: GameState,
    sourcePlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext
  ): void;
  setPlayerLife(state: GameState, player: PlayerState, lifeTotal: number): void;
  resolveStatusTargetPlayers(
    state: GameState,
    player: PlayerState,
    effect: Record<string, unknown>,
    source: EffectSourceContext
  ): { ok: true; players: PlayerState[] } | { ok: false; error: string };
  gainDinglerStatus(
    state: GameState,
    player: PlayerState,
    effectId: string,
    source: EffectSourceContext
  ): void;
  removeDinglerStatus(
    state: GameState,
    player: PlayerState,
    effectId: string,
    source: EffectSourceContext
  ): void;
  hasDinglerStatus(player: PlayerState): boolean;
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
  supportedModes: readonly EffectRuntimeMode[];
}

const allEffectRuntimeModes: readonly EffectRuntimeMode[] = [
  "combat",
  "fixture",
];

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

const healHandler: EffectRuntimeHandler = {
  effectId: "heal",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "healing amount"),
      ...validatePlayerTargetSelector(subjectId, effect, "healing", [
        "activePlayer",
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
      services.asString(effect["effectId"]),
      source
    );
    return { ok: true };
  },
};

const setLifeHandler: EffectRuntimeHandler = {
  effectId: "set_life",
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
      ...validatePlayerTargetSelector(subjectId, effect, "set-life", [
        "activePlayer",
      ])
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

    services.setPlayerLife(state, targetResult.choice.player, lifeTotal);
    state.eventLog.push({
      type: "effectLifeSet",
      playerId: player.playerId,
      targetPlayerId: targetResult.choice.player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: services.asString(effect["effectId"]),
      amount: lifeTotal,
      sourceType: source.sourceType,
    });
    return { ok: true };
  },
};

const gainStatusHandler: EffectRuntimeHandler = {
  effectId: "gain_status",
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
      services.gainDinglerStatus(
        state,
        targetPlayer,
        services.asString(effect["effectId"]),
        source
      );
    }

    return { ok: true };
  },
};

const removeStatusHandler: EffectRuntimeHandler = {
  effectId: "remove_status",
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
        services.asString(effect["effectId"]),
        source
      );
    }

    return { ok: true };
  },
};

const toggleStatusHandler: EffectRuntimeHandler = {
  effectId: "toggle_status",
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
          services.asString(effect["effectId"]),
          source
        );
      } else {
        services.gainDinglerStatus(
          state,
          targetPlayer,
          services.asString(effect["effectId"]),
          source
        );
      }
    }

    return { ok: true };
  },
};

const megaMayhemSetLifeHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_set_life",
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
      services.setPlayerLife(state, targetPlayer, lifeTotal);
      state.eventLog.push({
        type: "effectLifeSet",
        playerId: player.playerId,
        targetPlayerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId: services.asString(effect["effectId"]),
        amount: lifeTotal,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

const megaMayhemEachPlayerToggleDinglerHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_each_player_toggle_dingler",
  validateShape(subjectId, effect) {
    return validateMegaMayhemEachPlayerToggleDinglerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      if (services.hasDinglerStatus(targetPlayer)) {
        services.removeDinglerStatus(
          state,
          targetPlayer,
          services.asString(effect["effectId"]),
          source
        );
        continue;
      }

      services.gainDinglerStatus(
        state,
        targetPlayer,
        services.asString(effect["effectId"]),
        source
      );
    }

    return { ok: true };
  },
};

const megaMayhemEachPlayerDestroyTopMainDeckHandler: EffectRuntimeHandler = {
  effectId: "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem",
  validateShape(subjectId, effect) {
    return validateMegaMayhemEachPlayerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const effectId = services.asString(effect["effectId"]);
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const destroyedCard = state.common.mainDeck.shift();
      if (destroyedCard === undefined) {
        state.eventLog.push({
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
      state.eventLog.push({
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

    const effectId = services.asString(effect["effectId"]);
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

      state.eventLog.push({
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
  validateShape(subjectId, effect) {
    return validateMayhemEachPlayerShape(subjectId, effect);
  },
  execute(state, _player, effect, source, services) {
    const errors = mayhemEachPlayerDiscardDeckDestroyHandler.validateShape(
      "Effect mayhem_each_player_discard_deck_then_destroy_from_discard",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid Mayhem discard-deck destroy effect",
      };
    }

    const effectId = services.asString(effect["effectId"]);
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

      state.eventLog.push({
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
    const errors = mayhemEachPlayerHandRedrawChoiceHandler.validateShape(
      "Effect mayhem_each_player_choose_discard_hand_draw_or_take_damage",
      effect
    );
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? "Invalid Mayhem hand-redraw choice effect",
      };
    }

    const effectId = services.asString(effect["effectId"]);
    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const discardedCount = targetPlayer.hand.length;
      targetPlayer.discard.push(...targetPlayer.hand.splice(0));
      const drawnCount = drawCards(targetPlayer, 5, state);
      state.eventLog.push({
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

const replaceStartingCardHandler: EffectRuntimeHandler = {
  effectId: "replace_starting_card",
  validateShape(subjectId, effect) {
    const errors = validateSetupTiming(subjectId, effect);
    const fromDefinitionId = effect["fromDefinitionId"];
    if (!isNonEmptyString(fromDefinitionId)) {
      errors.push(
        `${subjectId} uses invalid replacement source card ${String(fromDefinitionId)}`
      );
    }

    const toDefinitionId = effect["toDefinitionId"];
    if (!isNonEmptyString(toDefinitionId)) {
      errors.push(
        `${subjectId} uses invalid replacement target card ${String(toDefinitionId)}`
      );
    }

    return errors;
  },
  execute() {
    return setupOnlyExecutionError("replace_starting_card");
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
};

const forceStartingPlayerHandler: EffectRuntimeHandler = {
  effectId: "force_starting_player",
  validateShape(subjectId, effect) {
    const errors = validateSetupTiming(subjectId, effect);
    const targetSelector = effect["targetSelector"];
    if (targetSelector !== undefined && targetSelector !== "activePlayer") {
      errors.push(
        `${subjectId} uses unsupported force-starting-player target ${String(targetSelector)}`
      );
    }

    return errors;
  },
  execute() {
    return setupOnlyExecutionError("force_starting_player");
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
};

const setResurrectionLifeTotalHandler: EffectRuntimeHandler = {
  effectId: "set_resurrection_life_total",
  validateShape(subjectId, effect) {
    const errors = validateReplacementTiming(subjectId, effect);
    errors.push(...validateLifeTotal(subjectId, effect));

    const unlessStatusId = effect["unlessStatusId"];
    if (unlessStatusId !== undefined && !isNonEmptyString(unlessStatusId)) {
      errors.push(
        `${subjectId} uses invalid resurrection exception status ${String(unlessStatusId)}`
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
    if (effect["timing"] !== "whileControlled") {
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
    if (operation !== "add") {
      errors.push(
        `${subjectId} uses unsupported effective-value operation ${String(operation)}`
      );
    }

    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount)) {
      errors.push(
        `${subjectId} uses invalid effective-value amount ${String(amount)}`
      );
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
    state.eventLog.push({
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
        `${subjectId} uses unsupported topdeck-gained-card destination ${String(destination)}`
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

    for (const filterField of ["cardDefinitionIds", "cardKind"]) {
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
    }

    for (const filterField of ["cardDefinitionIds", "cardKind", "isOngoing"]) {
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

function validateLifeTotal(
  subjectId: string,
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
): string[] {
  const target = effect["target"];
  if (!isEffectRecord(target)) {
    return [
      `${subjectId} uses invalid effective-value target ${String(target)}`,
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
      isNonEmptyString(target["definitionId"])
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
  effect: Record<string, unknown>
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
  ]) {
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

function validateDinglerStatusEffectShape(
  subjectId: string,
  effect: Record<string, unknown>,
  effectLabel: string
): string[] {
  const errors: string[] = [];
  if (effect["statusId"] !== "dingler") {
    errors.push(
      `${subjectId} uses unsupported status ${String(effect["statusId"])}`
    );
  }

  errors.push(
    ...validatePlayerTargetSelector(subjectId, effect, effectLabel, [
      "activePlayer",
      "opponentPlayer",
    ])
  );
  return errors;
}

function validateMegaMayhemSetLifeEffectShape(
  subjectId: string,
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
): string[] {
  const errors = validateMegaMayhemEachPlayerShape(subjectId, effect);
  if (effect["statusId"] !== undefined) {
    errors.push(
      `${subjectId} uses unsupported status ${String(effect["statusId"])}`
    );
  }
  return errors;
}

function validateMegaMayhemEachPlayerShape(
  subjectId: string,
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
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
  effect: Record<string, unknown>
): string[] {
  const options = effect["options"];
  if (!Array.isArray(options) || options.length !== 2) {
    return [`${subjectId} uses unsupported Mayhem hand-redraw options`];
  }

  const [redrawOption, damageOption] = options;
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
    services.gainDinglerStatus(state, targetPlayer, "gain_status", source);
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

function setupOnlyExecutionError(effectId: string): EffectExecutionResult {
  return {
    ok: false,
    error: `${effectId} is a setup-only wizard property effect`,
  };
}

export const effectRuntimeCatalog = new Map<string, EffectRuntimeCatalogEntry>([
  [addPowerHandler.effectId, toCatalogEntry(addPowerHandler)],
  [gainCardHandler.effectId, toCatalogEntry(gainCardHandler)],
  [discardCardHandler.effectId, toCatalogEntry(discardCardHandler)],
  [destroyCardHandler.effectId, toCatalogEntry(destroyCardHandler)],
  [dealDamageHandler.effectId, toCatalogEntry(dealDamageHandler)],
  [healHandler.effectId, toCatalogEntry(healHandler)],
  [setLifeHandler.effectId, toCatalogEntry(setLifeHandler)],
  [gainStatusHandler.effectId, toCatalogEntry(gainStatusHandler)],
  [removeStatusHandler.effectId, toCatalogEntry(removeStatusHandler)],
  [toggleStatusHandler.effectId, toCatalogEntry(toggleStatusHandler)],
  [megaMayhemSetLifeHandler.effectId, toCatalogEntry(megaMayhemSetLifeHandler)],
  [
    megaMayhemEachPlayerToggleDinglerHandler.effectId,
    toCatalogEntry(megaMayhemEachPlayerToggleDinglerHandler),
  ],
  [
    megaMayhemEachPlayerDestroyTopMainDeckHandler.effectId,
    toCatalogEntry(megaMayhemEachPlayerDestroyTopMainDeckHandler),
  ],
  [
    mayhemEachPlayerDiscardTopDeckDestroyHandler.effectId,
    toCatalogEntry(mayhemEachPlayerDiscardTopDeckDestroyHandler),
  ],
  [
    mayhemEachPlayerDiscardDeckDestroyHandler.effectId,
    toCatalogEntry(mayhemEachPlayerDiscardDeckDestroyHandler),
  ],
  [
    mayhemEachPlayerHandRedrawChoiceHandler.effectId,
    toCatalogEntry(mayhemEachPlayerHandRedrawChoiceHandler),
  ],
  [
    replaceStartingCardHandler.effectId,
    toCatalogEntry(replaceStartingCardHandler),
  ],
  [
    startWithBasicTrophyHandler.effectId,
    toCatalogEntry(startWithBasicTrophyHandler),
  ],
  [
    forceStartingPlayerHandler.effectId,
    toCatalogEntry(forceStartingPlayerHandler),
  ],
  [
    setStartingLifeTotalHandler.effectId,
    toCatalogEntry(setStartingLifeTotalHandler),
  ],
  [
    setResurrectionLifeTotalHandler.effectId,
    toCatalogEntry(setResurrectionLifeTotalHandler),
  ],
  [
    modifyEffectiveValueHandler.effectId,
    toCatalogEntry(modifyEffectiveValueHandler),
  ],
  [
    fixtureModifyEffectiveValueHandler.effectId,
    toFixtureOnlyCatalogEntry(fixtureModifyEffectiveValueHandler),
  ],
  [
    fixtureAddPowerEqualToTargetCostHandler.effectId,
    toFixtureOnlyCatalogEntry(fixtureAddPowerEqualToTargetCostHandler),
  ],
  [topdeckGainedCardHandler.effectId, toCatalogEntry(topdeckGainedCardHandler)],
  [
    temporaryHandLimitByGainedCardTypeHandler.effectId,
    toCatalogEntry(temporaryHandLimitByGainedCardTypeHandler),
  ],
  [
    modifyOwnedWandAttackDamageHandler.effectId,
    toCatalogEntry(modifyOwnedWandAttackDamageHandler),
  ],
  [
    preventDefenseAgainstOwnedWandAttacksHandler.effectId,
    toCatalogEntry(preventDefenseAgainstOwnedWandAttacksHandler),
  ],
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

export function isEffectRuntimeCatalogEntrySupportedInMode(
  entry: EffectRuntimeCatalogEntry,
  mode: EffectRuntimeMode
): boolean {
  return entry.supportedModes.includes(mode);
}

function toCatalogEntry(
  handler: EffectRuntimeHandler
): EffectRuntimeCatalogEntry {
  return {
    effectId: handler.effectId,
    handler,
    supportedModes: allEffectRuntimeModes,
  };
}

function toFixtureOnlyCatalogEntry(
  handler: EffectRuntimeHandler
): EffectRuntimeCatalogEntry {
  return {
    effectId: handler.effectId,
    handler,
    supportedModes: ["fixture"],
  };
}
