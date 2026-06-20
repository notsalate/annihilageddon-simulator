import type { TokenDefinition } from "./data.js";
import type { CardInstance, GameState, PlayerState, TokenInstance } from "./setup.js";

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

export type TargetChoiceResult =
  | {
      ok: true;
      choice: TargetChoice | undefined;
    }
  | {
      ok: false;
      error: string;
    };

export interface EffectRuntimeServices {
  resolveTargetChoice(
    state: GameState,
    player: PlayerState,
    effect: Record<string, unknown>,
    source: EffectSourceContext,
  ): TargetChoiceResult;
  requireCardChoice(
    choice: TargetChoice,
    effectId: string,
  ): { ok: true; card: CardInstance } | { ok: false; error: string };
  moveGainedCardToPlayerDestination(
    state: GameState,
    player: PlayerState,
    card: CardInstance,
  ): { ok: true; destination: "discard" | "deckTop" } | { ok: false; error: string };
  moveCardToPlayerZone(state: GameState, card: CardInstance, player: PlayerState, destination: CardInstance[]): boolean;
  moveCardToZonePreservingOwner(state: GameState, card: CardInstance, destination: CardInstance[]): boolean;
  getDestroyDestination(state: GameState, card: CardInstance): { ok: true; zone: CardInstance[] } | { ok: false; error: string };
  getOpponentsInSeatingOrder(state: GameState, player: PlayerState): PlayerState[];
  getWizardPropertyAttackProfile(
    state: GameState,
    source: EffectSourceContext,
  ): { damageBonus: number; unavoidable: boolean };
  dealDamage(
    state: GameState,
    sourcePlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext,
  ): void;
  resolveAttackTarget(
    state: GameState,
    attackingPlayer: PlayerState,
    targetPlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext,
    unavoidable?: boolean,
  ): void;
  resolveDefenseWindow(state: GameState, defendingPlayer: PlayerState): boolean;
  resolveMayhemAttack(
    state: GameState,
    sourcePlayer: PlayerState,
    amount: number,
    effectId: string,
    source: EffectSourceContext,
  ): void;
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
    services: EffectRuntimeServices,
  ): EffectExecutionResult;
}

const addPowerHandler: EffectRuntimeHandler = {
  effectId: "add_power",
  validateShape(subjectId, effect) {
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
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

    state.turn.power += amount;
    state.eventLog.push({
      type: "effectAddPowerApplied",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      effectId: "add_power",
      amount,
      sourceType: source.sourceType,
    });

    return { ok: true };
  },
};

const gainCardHandler: EffectRuntimeHandler = {
  effectId: "gain_card",
  validateShape(subjectId, effect) {
    const errors = validateCardTargetSelector(subjectId, effect, "gain", "mainMarketCard");
    if (effect["destination"] !== "discard") {
      errors.push(`${subjectId} uses unsupported gain destination ${String(effect["destination"])}`);
    }

    return errors;
  },
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(state, player, effect, source);
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

    const moved = services.moveGainedCardToPlayerDestination(state, player, choice.card);
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
    return validateCardTargetSelector(subjectId, effect, "discard", "activePlayerHandCard");
  },
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(state, player, effect, source);
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

    const moved = services.moveCardToPlayerZone(state, choice.card, player, player.discard);
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
    return validateCardTargetSelector(subjectId, effect, "destroy", "activePlayerHandCard");
  },
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(state, player, effect, source);
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

    const moved = services.moveCardToZonePreservingOwner(state, choice.card, destination.zone);
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
      ...validatePlayerTargetSelector(subjectId, effect, "damage", ["opponentPlayer"]),
    ];
  },
  execute(state, player, effect, source, services) {
    const targetResult = services.resolveTargetChoice(state, player, effect, source);
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

    services.dealDamage(state, player, targetResult.choice.player, amount.value, services.asString(effect["effectId"]), source);
    return { ok: true };
  },
};

const attackDamageHandler: EffectRuntimeHandler = {
  effectId: "attack_damage",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "attack damage amount"),
      ...validatePlayerTargetSelector(subjectId, effect, "attack", [
        "opponentPlayer",
        "chosenFoe",
        "chosenPlayer",
        "eachFoe",
      ]),
    ];
  },
  execute(state, player, effect, source, services) {
    const amount = requirePositiveIntegerAmount(effect, "attack damage amount");
    if (!amount.ok) {
      return amount;
    }

    const attackProfile = services.getWizardPropertyAttackProfile(state, source);
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

      for (const targetPlayer of services.getOpponentsInSeatingOrder(state, player)) {
        services.resolveAttackTarget(state, player, targetPlayer, attackAmount, "attack_damage", source, attackProfile.unavoidable);
      }

      return { ok: true };
    }

    const targetResult = services.resolveTargetChoice(state, player, effect, source);
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
    if (!attackProfile.unavoidable && services.resolveDefenseWindow(state, targetPlayer)) {
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

    services.dealDamage(state, player, targetPlayer, attackAmount, effectId, source);
    return { ok: true };
  },
};

const multiTargetAttackHandler: EffectRuntimeHandler = {
  effectId: "multi_target_attack",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "attack damage amount"),
      ...validatePlayerTargetSelector(subjectId, effect, "multi-target attack", ["opponentPlayers"]),
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

    const attackProfile = services.getWizardPropertyAttackProfile(state, source);
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

    for (const targetPlayer of services.getOpponentsInSeatingOrder(state, player)) {
      services.resolveAttackTarget(
        state,
        player,
        targetPlayer,
        attackAmount,
        "multi_target_attack",
        source,
        attackProfile.unavoidable,
      );
    }

    return { ok: true };
  },
};

const mayhemAttackHandler: EffectRuntimeHandler = {
  effectId: "mayhem_attack",
  validateShape(subjectId, effect) {
    return [
      ...validatePositiveIntegerAmount(subjectId, effect, "Mayhem attack damage amount"),
      ...validatePlayerTargetSelector(subjectId, effect, "Mayhem attack", ["allPlayers"]),
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

    services.resolveMayhemAttack(state, player, amount.value, "mayhem_attack", source);
    return { ok: true };
  },
};

function validateCardTargetSelector(
  subjectId: string,
  effect: Record<string, unknown>,
  effectLabel: string,
  expectedSelector: string,
): string[] {
  const target = effect["target"];
  const selector = typeof target === "object" && target !== null ? (target as Record<string, unknown>)["selector"] : target;
  if (selector !== expectedSelector) {
    return [`${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`];
  }

  return [];
}

function validatePlayerTargetSelector(
  subjectId: string,
  effect: Record<string, unknown>,
  effectLabel: string,
  expectedSelectors: readonly string[],
): string[] {
  const target = effect["target"];
  const targetSelector = effect["targetSelector"];
  if (
    (isEffectRecord(target) && expectedSelectors.includes(String(target["selector"]))) ||
    expectedSelectors.includes(String(targetSelector))
  ) {
    return [];
  }

  const selector = isEffectRecord(target) ? target["selector"] : targetSelector;
  return [`${subjectId} uses unsupported ${effectLabel} target ${String(selector)}`];
}

function validatePositiveIntegerAmount(subjectId: string, effect: Record<string, unknown>, amountLabel: string): string[] {
  const amount = effect["amount"];
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return [`${subjectId} uses invalid ${amountLabel} ${String(amount)}`];
  }

  return [];
}

function requirePositiveIntegerAmount(
  effect: Record<string, unknown>,
  amountLabel: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const amount = effect["amount"];
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
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

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}

export const effectRuntimeRegistry = new Map<string, EffectRuntimeHandler>([
  [addPowerHandler.effectId, addPowerHandler],
  [gainCardHandler.effectId, gainCardHandler],
  [discardCardHandler.effectId, discardCardHandler],
  [destroyCardHandler.effectId, destroyCardHandler],
  [dealDamageHandler.effectId, dealDamageHandler],
  [attackDamageHandler.effectId, attackDamageHandler],
  [multiTargetAttackHandler.effectId, multiTargetAttackHandler],
  [mayhemAttackHandler.effectId, mayhemAttackHandler],
]);

export function getEffectRuntimeHandler(effectId: string): EffectRuntimeHandler | undefined {
  return effectRuntimeRegistry.get(effectId);
}
