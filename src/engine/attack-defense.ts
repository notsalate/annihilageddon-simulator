import { installGameEventLog } from "./game-events.js";
import { recordGameEvent } from "./event-recorder.js";
import {
  isAvoidAttackRuntimeEffect,
  type AvoidAttackRuntimeEffect,
  type RuntimeEffect,
  type RuntimeEffectId,
} from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import type {
  AttackDefenseUsage,
  AttackIntent,
  AttackTargetResolutionResult,
  DefenseAttackContext,
  DefenseWindowResolutionResult,
  EffectChoice,
  EffectExecutionResult,
  EffectSourceContext,
} from "./effect-runtime-registry.js";

export interface AttackDefenseServices {
  chooseEffectChoice(
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    effectId: RuntimeEffectId,
    choices: readonly EffectChoice[]
  ): EffectChoice | undefined;
  executeDefenseEffects(
    state: GameState,
    player: PlayerState,
    effects: readonly RuntimeEffect[],
    source: EffectSourceContext
  ): EffectExecutionResult;
  resolveRedirectedAttack(
    state: GameState,
    intent: AttackIntent
  ): AttackTargetResolutionResult;
}

interface DefensePlayerMutationSnapshot {
  player: PlayerState;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  playedThisTurn: CardInstance[];
  permanents: CardInstance[];
  unboughtFamiliar: CardInstance | undefined;
  deadWizardTokens: PlayerState["deadWizardTokens"];
  wizardProperties: PlayerState["wizardProperties"];
  statuses: PlayerState["statuses"];
  trophyLikeObjects: PlayerState["trophyLikeObjects"];
  chips: number;
  life: PlayerState["life"];
}

interface DefenseObjectMutationSnapshot {
  object: object;
  value: object;
}

interface DefenseMutationSnapshot {
  activePlayerId: GameState["activePlayerId"];
  turn: GameState["turn"];
  players: DefensePlayerMutationSnapshot[];
  common: {
    market: CardInstance[];
    legendMarket: CardInstance[];
    mainDeck: CardInstance[];
    legendDeck: CardInstance[];
    wildMagicStack: CardInstance[];
    limpWandStack: CardInstance[];
    destroyedPile: CardInstance[];
    destroyedMayhem: CardInstance[];
    destroyedMegaMayhem: CardInstance[];
    deadWizardTokenStatus: GameState["common"]["deadWizardTokens"]["status"];
    deadWizardTokenDrawStack: GameState["common"]["deadWizardTokens"]["drawStack"];
  };
  mutableObjects: DefenseObjectMutationSnapshot[];
  rng: GameState["rng"];
  eventLogLength: number;
  defendedPlayerIds: Set<PlayerState["playerId"]>;
  usedDefenseCardInstanceIds: Set<CardInstance["instanceId"]>;
}

function createDefenseMutationSnapshot(
  state: GameState,
  defenseUsage: AttackDefenseUsage,
  eventLogLength: number
): DefenseMutationSnapshot {
  const mutableObjects = collectDefenseMutableObjects(state).map((object) => ({
    object,
    value: structuredClone(object),
  }));
  return {
    activePlayerId: state.activePlayerId,
    turn: structuredClone(state.turn),
    players: state.players.map((player) => ({
      player,
      deck: [...player.deck],
      hand: [...player.hand],
      discard: [...player.discard],
      playedThisTurn: [...player.playedThisTurn],
      permanents: [...player.permanents],
      unboughtFamiliar: player.unboughtFamiliar,
      deadWizardTokens: [...player.deadWizardTokens],
      wizardProperties: [...player.wizardProperties],
      statuses: [...player.statuses],
      trophyLikeObjects: [...player.trophyLikeObjects],
      chips: player.chips,
      life: { ...player.life },
    })),
    common: {
      market: [...state.common.market],
      legendMarket: [...state.common.legendMarket],
      mainDeck: [...state.common.mainDeck],
      legendDeck: [...state.common.legendDeck],
      wildMagicStack: [...state.common.wildMagicStack],
      limpWandStack: [...state.common.limpWandStack],
      destroyedPile: [...state.common.destroyedPile],
      destroyedMayhem: [...state.common.destroyedMayhem],
      destroyedMegaMayhem: [...state.common.destroyedMegaMayhem],
      deadWizardTokenStatus: state.common.deadWizardTokens.status,
      deadWizardTokenDrawStack: [...state.common.deadWizardTokens.drawStack],
    },
    mutableObjects,
    rng: state.rng.fork(),
    eventLogLength,
    defendedPlayerIds: new Set(defenseUsage.defendedPlayerIds),
    usedDefenseCardInstanceIds: new Set(
      defenseUsage.usedDefenseCardInstanceIds
    ),
  };
}

function collectDefenseMutableObjects(state: GameState): object[] {
  const objects = new Set<object>();
  const add = (values: readonly object[]): void => {
    for (const value of values) objects.add(value);
  };
  for (const player of state.players) {
    add(player.deck);
    add(player.hand);
    add(player.discard);
    add(player.playedThisTurn);
    add(player.permanents);
    if (player.unboughtFamiliar !== undefined)
      objects.add(player.unboughtFamiliar);
    add(player.deadWizardTokens);
    add(player.wizardProperties);
    add(player.statuses);
    add(player.trophyLikeObjects);
  }
  add(state.common.market);
  add(state.common.legendMarket);
  add(state.common.mainDeck);
  add(state.common.legendDeck);
  add(state.common.wildMagicStack);
  add(state.common.limpWandStack);
  add(state.common.destroyedPile);
  add(state.common.destroyedMayhem);
  add(state.common.destroyedMegaMayhem);
  add(state.common.deadWizardTokens.drawStack);
  return [...objects];
}

function restoreDefenseMutationSnapshot(
  state: GameState,
  defenseUsage: AttackDefenseUsage,
  snapshot: DefenseMutationSnapshot
): void {
  for (const mutableObject of snapshot.mutableObjects) {
    Object.assign(mutableObject.object, structuredClone(mutableObject.value));
  }
  state.activePlayerId = snapshot.activePlayerId;
  state.turn = structuredClone(snapshot.turn);
  for (const playerSnapshot of snapshot.players) {
    const { player } = playerSnapshot;
    player.deck = [...playerSnapshot.deck];
    player.hand = [...playerSnapshot.hand];
    player.discard = [...playerSnapshot.discard];
    player.playedThisTurn = [...playerSnapshot.playedThisTurn];
    player.permanents = [...playerSnapshot.permanents];
    player.unboughtFamiliar = playerSnapshot.unboughtFamiliar;
    player.deadWizardTokens = [...playerSnapshot.deadWizardTokens];
    player.wizardProperties = [...playerSnapshot.wizardProperties];
    player.statuses = [...playerSnapshot.statuses];
    player.trophyLikeObjects = [...playerSnapshot.trophyLikeObjects];
    player.chips = playerSnapshot.chips;
    player.life = { ...playerSnapshot.life };
  }
  state.common.market = [...snapshot.common.market];
  state.common.legendMarket = [...snapshot.common.legendMarket];
  state.common.mainDeck = [...snapshot.common.mainDeck];
  state.common.legendDeck = [...snapshot.common.legendDeck];
  state.common.wildMagicStack = [...snapshot.common.wildMagicStack];
  state.common.limpWandStack = [...snapshot.common.limpWandStack];
  state.common.destroyedPile = [...snapshot.common.destroyedPile];
  state.common.destroyedMayhem = [...snapshot.common.destroyedMayhem];
  state.common.destroyedMegaMayhem = [...snapshot.common.destroyedMegaMayhem];
  state.common.deadWizardTokens =
    snapshot.common.deadWizardTokenStatus === "notInDataPack"
      ? { status: "notInDataPack", drawStack: [] }
      : {
          status: snapshot.common.deadWizardTokenStatus,
          drawStack: [...snapshot.common.deadWizardTokenDrawStack],
        };
  state.rng = snapshot.rng;
  state.eventLog.splice(snapshot.eventLogLength);
  installGameEventLog(state);
  defenseUsage.defendedPlayerIds.clear();
  for (const playerId of snapshot.defendedPlayerIds) {
    defenseUsage.defendedPlayerIds.add(playerId);
  }
  defenseUsage.usedDefenseCardInstanceIds.clear();
  for (const cardInstanceId of snapshot.usedDefenseCardInstanceIds) {
    defenseUsage.usedDefenseCardInstanceIds.add(cardInstanceId);
  }
}

export function resolveDefenseWindow(
  state: GameState,
  defendingPlayer: PlayerState,
  attack: DefenseAttackContext,
  services: AttackDefenseServices
): DefenseWindowResolutionResult {
  if (attack.defenseUsage.defendedPlayerIds.has(defendingPlayer.playerId)) {
    return { ok: true, avoided: false };
  }

  const legalDefenses = findLegalDefenses(
    state,
    defendingPlayer,
    attack.defenseUsage
  );
  if (legalDefenses.length === 0) {
    return { ok: true, avoided: false };
  }

  const choices: EffectChoice[] = [
    { choiceKind: "defense", choiceId: "decline", card: undefined },
    ...legalDefenses.map((defense) => ({
      choiceKind: "defense" as const,
      choiceId: defense.card.instanceId,
      card: defense.card,
    })),
  ];
  const eventLogLengthBeforeChoice = state.eventLog.length;
  const selectedChoice = services.chooseEffectChoice(
    state,
    defendingPlayer,
    attack.source,
    "avoid_attack",
    choices
  );
  if (
    selectedChoice?.choiceKind !== "defense" ||
    selectedChoice.card === undefined
  ) {
    return { ok: true, avoided: false };
  }
  const defense = legalDefenses.find(
    (candidate) => candidate.card === selectedChoice.card
  );
  if (defense === undefined) {
    return { ok: true, avoided: false };
  }

  const mutationSnapshot = createDefenseMutationSnapshot(
    state,
    attack.defenseUsage,
    eventLogLengthBeforeChoice
  );
  recordGameEvent(state, {
    type: "defenseChoiceSelected",
    playerId: defendingPlayer.playerId,
    cardInstanceId: defense.card.instanceId,
    definitionId: defense.card.definitionId,
    effectId: "avoid_attack",
  });

  if (!payDefenseCosts(state, defendingPlayer, defense.card, defense.effect)) {
    restoreDefenseMutationSnapshot(
      state,
      attack.defenseUsage,
      mutationSnapshot
    );
    return {
      ok: false,
      error: `Cannot pay defense costs for ${defense.card.instanceId}`,
    };
  }

  attack.defenseUsage.defendedPlayerIds.add(defendingPlayer.playerId);
  attack.defenseUsage.usedDefenseCardInstanceIds.add(defense.card.instanceId);

  const redirectsAttack = defense.effect.redirectAttack === true;

  const defenseSource: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: defendingPlayer.playerId,
    cardInstanceId: defense.card.instanceId,
    definitionId: defense.card.definitionId,
  };

  if (redirectsAttack && !moveDefenseCard(state, defendingPlayer, defense)) {
    restoreDefenseMutationSnapshot(
      state,
      attack.defenseUsage,
      mutationSnapshot
    );
    return {
      ok: false,
      error: `Cannot move redirect defense ${defense.card.instanceId}`,
    };
  }

  const branchEffects = defense.effect.branchEffects;
  if (branchEffects !== undefined) {
    const branchResult = services.executeDefenseEffects(
      state,
      defendingPlayer,
      branchEffects,
      defenseSource
    );
    if (!branchResult.ok) {
      restoreDefenseMutationSnapshot(
        state,
        attack.defenseUsage,
        mutationSnapshot
      );
      return branchResult;
    }
    if (branchResult.gameEnd !== undefined) {
      if (
        !redirectsAttack &&
        !moveDefenseCard(state, defendingPlayer, defense)
      ) {
        restoreDefenseMutationSnapshot(
          state,
          attack.defenseUsage,
          mutationSnapshot
        );
        return {
          ok: false,
          error: `Cannot move defense ${defense.card.instanceId}`,
        };
      }
      return { ok: true, avoided: true, gameEnd: branchResult.gameEnd };
    }
  }

  if (redirectsAttack && attack.kind === "redirectable") {
    const redirectResult = services.resolveRedirectedAttack(state, {
      attackingPlayer: defendingPlayer,
      targetPlayer: attack.attackingPlayer,
      amount:
        attack.amountComponents.unresolvedBaseAmount +
        attack.amountComponents.sourceOwnerModifierAmount,
      effectId: attack.effectId,
      source: {
        ...attack.source,
        playerId: defendingPlayer.playerId,
      },
      unavoidable: false,
      baseAmount: attack.amountComponents.unresolvedBaseAmount,
      originalSource: attack.originalSource,
      defenseUsage: attack.defenseUsage,
      amountComponents: attack.amountComponents,
    });
    if (!redirectResult.ok) {
      restoreDefenseMutationSnapshot(
        state,
        attack.defenseUsage,
        mutationSnapshot
      );
      return redirectResult;
    }
    if (redirectResult.gameEnd !== undefined) {
      return { ok: true, avoided: true, gameEnd: redirectResult.gameEnd };
    }
    return { ok: true, avoided: true, resolution: redirectResult.resolution };
  }

  if (!redirectsAttack && !moveDefenseCard(state, defendingPlayer, defense)) {
    restoreDefenseMutationSnapshot(
      state,
      attack.defenseUsage,
      mutationSnapshot
    );
    return {
      ok: false,
      error: `Cannot move defense ${defense.card.instanceId}`,
    };
  }
  if (attack.kind === "nonredirectable") {
    return { ok: true, avoided: true };
  }

  return {
    ok: true,
    avoided: true,
    resolution: {
      damageDealt: 0,
      killed: false,
      avoided: true,
      amountComponents: attack.amountComponents,
      attackingPlayer: attack.attackingPlayer,
      currentAttackerId: attack.attackingPlayer.playerId,
      targetPlayer: defendingPlayer,
      source: defenseSource,
      originalSource: attack.originalSource,
    },
  };
}

function moveDefenseCard(
  state: GameState,
  defendingPlayer: PlayerState,
  defense: {
    card: CardInstance;
    destination: "discardSelf" | "topdeckSelf";
  }
): boolean {
  const cardIndex = defendingPlayer.hand.findIndex(
    (card) => card.instanceId === defense.card.instanceId
  );
  if (cardIndex < 0) {
    return false;
  }

  const [card] = defendingPlayer.hand.splice(cardIndex, 1);
  if (card === undefined) {
    return false;
  }

  if (defense.destination === "discardSelf") {
    defendingPlayer.discard.push(card);
    recordGameEvent(state, {
      type: "defenseCardMoved",
      playerId: defendingPlayer.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      destination: "discard",
    });
    return true;
  }

  if (defense.destination === "topdeckSelf") {
    defendingPlayer.deck.unshift(card);
    recordGameEvent(state, {
      type: "defenseCardMoved",
      playerId: defendingPlayer.playerId,
      cardInstanceId: card.instanceId,
      definitionId: card.definitionId,
      destination: "deckTop",
    });
    return true;
  }

  return false;
}

function findLegalDefenses(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseUsage: AttackDefenseUsage
): Array<{
  card: CardInstance;
  destination: "discardSelf" | "topdeckSelf";
  effect: AvoidAttackRuntimeEffect;
}> {
  const legalDefenses: Array<{
    card: CardInstance;
    destination: "discardSelf" | "topdeckSelf";
    effect: AvoidAttackRuntimeEffect;
  }> = [];
  for (const card of defendingPlayer.hand) {
    if (defenseUsage.usedDefenseCardInstanceIds.has(card.instanceId)) {
      continue;
    }

    const definition = state.cardDefinitions.get(card.definitionId);
    if (definition === undefined) {
      continue;
    }

    const defenseEffect = definition.engine.effects.find(
      (effect): effect is AvoidAttackRuntimeEffect => {
        return isAvoidAttackRuntimeEffect(effect);
      }
    );
    if (
      defenseEffect !== undefined &&
      canPayDefenseCosts(defendingPlayer, card, defenseEffect)
    ) {
      legalDefenses.push({
        card,
        destination: defenseEffect.destination,
        effect: defenseEffect,
      });
    }
  }

  return legalDefenses;
}

function canPayDefenseCosts(
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  defenseEffect: RuntimeEffect
): boolean {
  const { costs } = defenseEffect;
  if (costs === undefined) {
    return true;
  }

  let remainingChips = defendingPlayer.chips;
  let remainingPayableLife = defendingPlayer.life.current - 1;
  let remainingOtherCards = defendingPlayer.hand.filter(
    (card) => card.instanceId !== defenseCard.instanceId
  ).length;

  for (const cost of costs) {
    switch (cost.costId) {
      case "discard_other_hand_card":
        if (remainingOtherCards < 1) {
          return false;
        }
        remainingOtherCards -= 1;
        break;
      case "spend_chips":
        if (remainingChips < cost.amount) {
          return false;
        }
        remainingChips -= cost.amount;
        break;
      case "pay_life":
        if (remainingPayableLife < cost.amount) {
          return false;
        }
        remainingPayableLife -= cost.amount;
        break;
    }
  }

  return true;
}

function payDefenseCosts(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  defenseEffect: RuntimeEffect
): boolean {
  const { costs } = defenseEffect;
  if (costs === undefined) {
    return true;
  }

  for (const cost of costs) {
    switch (cost.costId) {
      case "discard_other_hand_card": {
        const paidCardIndex = defendingPlayer.hand.findIndex(
          (card) => card.instanceId !== defenseCard.instanceId
        );
        if (paidCardIndex < 0) {
          return false;
        }

        const [paidCard] = defendingPlayer.hand.splice(paidCardIndex, 1);
        if (paidCard === undefined) {
          return false;
        }

        defendingPlayer.discard.push(paidCard);
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          targetCardInstanceId: paidCard.instanceId,
          targetDefinitionId: paidCard.definitionId,
          effectId: cost.costId,
        });
        break;
      }
      case "spend_chips": {
        if (defendingPlayer.chips < cost.amount) {
          return false;
        }

        defendingPlayer.chips -= cost.amount;
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          effectId: cost.costId,
          amount: cost.amount,
          chipsBefore: defendingPlayer.chips + cost.amount,
          chipsAfter: defendingPlayer.chips,
        });
        break;
      }
      case "pay_life": {
        if (defendingPlayer.life.current - cost.amount < 1) {
          return false;
        }

        const lifeBefore = defendingPlayer.life.current;
        defendingPlayer.life.current -= cost.amount;
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          effectId: cost.costId,
          amount: cost.amount,
          lifeBefore,
          lifeAfter: defendingPlayer.life.current,
        });
        break;
      }
    }
  }

  return true;
}
