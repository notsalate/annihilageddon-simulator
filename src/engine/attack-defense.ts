import {
  listDefenseCardLocations,
  listPhysicalCardLocations,
  listPhysicalCardZoneDescriptors,
  movePhysicalCard,
} from "./control-ledger.js";
import { installGameEventLog } from "./game-events.js";
import { recordGameEvent } from "./event-recorder.js";
import {
  isAvoidAttackRuntimeEffect,
  type AvoidAttackRuntimeEffect,
  type RuntimeEffect,
  type RuntimeEffectCost,
  type RuntimeEffectId,
} from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import type {
  AttackDefenseUsage,
  AttackTargetResolutionResult,
  DefenseAttackContext,
  DefenseWindowResolutionResult,
  RedirectedAttackIntent,
} from "./attack-resolution.js";
import type {
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
}

export type DefensePaymentStep =
  | {
      readonly kind: "discardOtherHandCard";
      readonly cardInstanceId: CardInstance["instanceId"];
    }
  | {
      readonly kind: "spendChips";
      readonly amount: number;
      readonly chipsBefore: number;
      readonly chipsAfter: number;
    }
  | {
      readonly kind: "payLife";
      readonly amount: number;
      readonly lifeBefore: number;
      readonly lifeAfter: number;
    };

export interface DefensePaymentPlan {
  readonly playerId: PlayerState["playerId"];
  readonly defenseCardInstanceId: CardInstance["instanceId"];
  readonly startingChips: number;
  readonly startingLife: number;
  readonly steps: readonly DefensePaymentStep[];
}

export type DefensePaymentPlanResult =
  | { readonly ok: true; readonly plan: DefensePaymentPlan }
  | { readonly ok: false; readonly reason: string };

interface LegalDefense {
  readonly card: CardInstance;
  readonly destination: "discardSelf" | "topdeckSelf";
  readonly effect: AvoidAttackRuntimeEffect;
  readonly paymentPlan: DefensePaymentPlan;
}

interface DefensePlayerMutationSnapshot {
  player: PlayerState;
  deadWizardTokens: PlayerState["deadWizardTokens"];
  wizardProperties: PlayerState["wizardProperties"];
  statuses: PlayerState["statuses"];
  trophyLikeObjects: PlayerState["trophyLikeObjects"];
  chips: number;
  life: PlayerState["life"];
}

interface DefenseCardZoneSnapshot {
  readonly zoneName: string;
  readonly cards: readonly CardInstance[];
}

interface DefenseObjectMutationSnapshot {
  object: object;
  value: object;
}

interface DefenseMutationSnapshot {
  activePlayerId: GameState["activePlayerId"];
  turn: GameState["turn"];
  cardZones: readonly DefenseCardZoneSnapshot[];
  players: DefensePlayerMutationSnapshot[];
  common: {
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
    cardZones: listPhysicalCardZoneDescriptors(state).map((descriptor) => ({
      zoneName: descriptor.zoneName,
      cards: [...descriptor.read()],
    })),
    players: state.players.map((player) => ({
      player,
      deadWizardTokens: [...player.deadWizardTokens],
      wizardProperties: [...player.wizardProperties],
      statuses: [...player.statuses],
      trophyLikeObjects: [...player.trophyLikeObjects],
      chips: player.chips,
      life: { ...player.life },
    })),
    common: {
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
  add(listPhysicalCardLocations(state).map((location) => location.card));
  for (const player of state.players) {
    add(player.deadWizardTokens);
    add(player.wizardProperties);
    add(player.statuses);
    add(player.trophyLikeObjects);
  }
  add(state.common.deadWizardTokens.drawStack);
  return [...objects];
}

function restoreDefenseMutationSnapshot(
  state: GameState,
  defenseUsage: AttackDefenseUsage,
  snapshot: DefenseMutationSnapshot
): void {
  const cardZoneDescriptors = listPhysicalCardZoneDescriptors(state);
  const descriptorsByName = new Map(
    cardZoneDescriptors.map((descriptor) => [descriptor.zoneName, descriptor])
  );
  const snapshotsByName = new Map(
    snapshot.cardZones.map((cardZone) => [cardZone.zoneName, cardZone])
  );

  if (descriptorsByName.size !== cardZoneDescriptors.length) {
    throw new Error(
      "Defense rollback found duplicate physical card descriptors"
    );
  }
  if (snapshotsByName.size !== snapshot.cardZones.length) {
    throw new Error("Defense rollback snapshot contains duplicate card zones");
  }
  for (const descriptor of cardZoneDescriptors) {
    if (!snapshotsByName.has(descriptor.zoneName)) {
      throw new Error(
        `Defense rollback found unknown physical card zone ${descriptor.zoneName}`
      );
    }
  }
  for (const cardZone of snapshot.cardZones) {
    const descriptor = descriptorsByName.get(cardZone.zoneName);
    if (descriptor === undefined) {
      throw new Error(
        `Defense rollback is missing physical card zone ${cardZone.zoneName}`
      );
    }
    if (descriptor.cardinality === "zeroOrOne" && cardZone.cards.length > 1) {
      throw new Error(
        `Defense rollback snapshot violates singleton card zone ${cardZone.zoneName}`
      );
    }
  }

  for (const mutableObject of snapshot.mutableObjects) {
    Object.assign(mutableObject.object, structuredClone(mutableObject.value));
  }
  state.activePlayerId = snapshot.activePlayerId;
  state.turn = structuredClone(snapshot.turn);
  for (const playerSnapshot of snapshot.players) {
    const { player } = playerSnapshot;
    player.deadWizardTokens = [...playerSnapshot.deadWizardTokens];
    player.wizardProperties = [...playerSnapshot.wizardProperties];
    player.statuses = [...playerSnapshot.statuses];
    player.trophyLikeObjects = [...playerSnapshot.trophyLikeObjects];
    player.chips = playerSnapshot.chips;
    player.life = { ...playerSnapshot.life };
  }
  for (const cardZone of snapshot.cardZones) {
    const descriptor = descriptorsByName.get(cardZone.zoneName);
    if (descriptor === undefined) {
      throw new Error(
        `Defense rollback lost physical card zone ${cardZone.zoneName} after validation`
      );
    }
    descriptor.replace(cardZone.cards);
  }
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

export type ResolveRedirectedAttack = (
  intent: RedirectedAttackIntent
) => AttackTargetResolutionResult;

export function resolveDefenseWindow(
  state: GameState,
  defendingPlayer: PlayerState,
  attack: DefenseAttackContext,
  services: AttackDefenseServices,
  resolveRedirectedAttack?: ResolveRedirectedAttack
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
  const defensesByChoice = new Map<EffectChoice, LegalDefense>(
    legalDefenses.map((defense, index) => [choices[index + 1]!, defense])
  );
  const eventLogLengthBeforeChoice = state.eventLog.length;
  const selectedChoice = services.chooseEffectChoice(
    state,
    defendingPlayer,
    attack.source,
    "avoid_attack",
    choices
  );
  const defense =
    selectedChoice === undefined
      ? undefined
      : defensesByChoice.get(selectedChoice);
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

  const paymentResult = commitDefensePaymentPlan(
    state,
    defendingPlayer,
    defense.card,
    defense.paymentPlan
  );
  if (!paymentResult.ok) {
    restoreDefenseMutationSnapshot(
      state,
      attack.defenseUsage,
      mutationSnapshot
    );
    return paymentResult;
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

  if (!moveDefenseCard(state, defendingPlayer, defense)) {
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
      return { ok: true, avoided: true, gameEnd: branchResult.gameEnd };
    }
  }

  if (redirectsAttack && attack.kind === "redirectable") {
    if (resolveRedirectedAttack === undefined) {
      restoreDefenseMutationSnapshot(
        state,
        attack.defenseUsage,
        mutationSnapshot
      );
      return {
        ok: false,
        error: "Redirect defense requires the Attack Resolution callback",
      };
    }
    const redirectResult = resolveRedirectedAttack({
      attackingPlayer: defendingPlayer,
      targetPlayer: attack.attackingPlayer,
      amountComponents: attack.amountComponents,
      effectId: attack.effectId,
      source: {
        ...attack.source,
        playerId: defendingPlayer.playerId,
      },
      unavoidable: false,
      originalSource: attack.originalSource,
      defenseUsage: attack.defenseUsage,
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
  const destinationZoneName =
    defense.destination === "discardSelf"
      ? `${defendingPlayer.playerId}.discard`
      : defense.destination === "topdeckSelf"
        ? `${defendingPlayer.playerId}.deck`
        : undefined;
  if (destinationZoneName === undefined) {
    return false;
  }
  const moveResult = movePhysicalCard(
    state,
    defense.card.instanceId,
    destinationZoneName,
    defense.destination === "discardSelf" ? "back" : "front"
  );
  if (!moveResult.ok) {
    return false;
  }

  if (defense.destination === "discardSelf") {
    recordGameEvent(state, {
      type: "defenseCardMoved",
      playerId: defendingPlayer.playerId,
      cardInstanceId: moveResult.move.card.instanceId,
      definitionId: moveResult.move.card.definitionId,
      destination: "discard",
    });
    return true;
  }

  recordGameEvent(state, {
    type: "defenseCardMoved",
    playerId: defendingPlayer.playerId,
    cardInstanceId: moveResult.move.card.instanceId,
    definitionId: moveResult.move.card.definitionId,
    destination: "deckTop",
  });
  return true;
}

function findLegalDefenses(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseUsage: AttackDefenseUsage
): LegalDefense[] {
  const legalDefenses: LegalDefense[] = [];
  for (const { card } of listDefenseCardLocations(
    state,
    defendingPlayer.playerId
  )) {
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
    if (defenseEffect === undefined) {
      continue;
    }

    const paymentPlanResult = buildDefensePaymentPlan(
      defendingPlayer,
      card,
      defenseEffect.costs
    );
    if (!paymentPlanResult.ok) {
      continue;
    }

    legalDefenses.push({
      card,
      destination: defenseEffect.destination,
      effect: defenseEffect,
      paymentPlan: paymentPlanResult.plan,
    });
  }

  return legalDefenses;
}

export function buildDefensePaymentPlan(
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  costs: readonly RuntimeEffectCost[] | undefined
): DefensePaymentPlanResult {
  let remainingChips = defendingPlayer.chips;
  let remainingLife = defendingPlayer.life.current;
  const reservedCardInstanceIds = new Set<CardInstance["instanceId"]>();
  const steps: DefensePaymentStep[] = [];

  for (const cost of costs ?? []) {
    switch (cost.costId) {
      case "discard_other_hand_card": {
        const card = defendingPlayer.hand.find(
          (candidate) =>
            candidate.instanceId !== defenseCard.instanceId &&
            !reservedCardInstanceIds.has(candidate.instanceId)
        );
        if (card === undefined) {
          return {
            ok: false,
            reason: `Player ${defendingPlayer.playerId} does not have another hand card to discard`,
          };
        }

        reservedCardInstanceIds.add(card.instanceId);
        steps.push(
          Object.freeze({
            kind: "discardOtherHandCard",
            cardInstanceId: card.instanceId,
          })
        );
        break;
      }
      case "spend_chips": {
        if (remainingChips < cost.amount) {
          return {
            ok: false,
            reason: `Player ${defendingPlayer.playerId} cannot spend ${cost.amount} chips`,
          };
        }

        const chipsBefore = remainingChips;
        remainingChips -= cost.amount;
        steps.push(
          Object.freeze({
            kind: "spendChips",
            amount: cost.amount,
            chipsBefore,
            chipsAfter: remainingChips,
          })
        );
        break;
      }
      case "pay_life": {
        if (remainingLife - cost.amount < 1) {
          return {
            ok: false,
            reason: `Player ${defendingPlayer.playerId} cannot pay ${cost.amount} life`,
          };
        }

        const lifeBefore = remainingLife;
        remainingLife -= cost.amount;
        steps.push(
          Object.freeze({
            kind: "payLife",
            amount: cost.amount,
            lifeBefore,
            lifeAfter: remainingLife,
          })
        );
        break;
      }
    }
  }

  return {
    ok: true,
    plan: Object.freeze({
      playerId: defendingPlayer.playerId,
      defenseCardInstanceId: defenseCard.instanceId,
      startingChips: defendingPlayer.chips,
      startingLife: defendingPlayer.life.current,
      steps: Object.freeze(steps),
    }),
  };
}

function commitDefensePaymentPlan(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  plan: DefensePaymentPlan
): { ok: true } | { ok: false; error: string } {
  const validationError = validateDefensePaymentPlan(
    state,
    defendingPlayer,
    defenseCard,
    plan
  );
  if (validationError !== undefined) {
    return { ok: false, error: validationError };
  }

  for (const step of plan.steps) {
    switch (step.kind) {
      case "discardOtherHandCard": {
        const paidCardIndex = defendingPlayer.hand.findIndex(
          (card) => card.instanceId === step.cardInstanceId
        );
        if (paidCardIndex < 0) {
          return {
            ok: false,
            error: `Defense payment plan lost card ${step.cardInstanceId} after validation`,
          };
        }

        const [paidCard] = defendingPlayer.hand.splice(paidCardIndex, 1);
        if (paidCard === undefined) {
          return {
            ok: false,
            error: `Defense payment plan could not remove card ${step.cardInstanceId}`,
          };
        }

        defendingPlayer.discard.push(paidCard);
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          targetCardInstanceId: paidCard.instanceId,
          targetDefinitionId: paidCard.definitionId,
          effectId: "discard_other_hand_card",
        });
        break;
      }
      case "spendChips":
        defendingPlayer.chips = step.chipsAfter;
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          effectId: "spend_chips",
          amount: step.amount,
          chipsBefore: step.chipsBefore,
          chipsAfter: step.chipsAfter,
        });
        break;
      case "payLife":
        defendingPlayer.life.current = step.lifeAfter;
        recordGameEvent(state, {
          type: "defenseCostPaid",
          playerId: defendingPlayer.playerId,
          cardInstanceId: defenseCard.instanceId,
          definitionId: defenseCard.definitionId,
          effectId: "pay_life",
          amount: step.amount,
          lifeBefore: step.lifeBefore,
          lifeAfter: step.lifeAfter,
        });
        break;
    }
  }

  return { ok: true };
}

function validateDefensePaymentPlan(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  plan: DefensePaymentPlan
): string | undefined {
  if (plan.playerId !== defendingPlayer.playerId) {
    return `Defense payment plan belongs to player ${plan.playerId}, not ${defendingPlayer.playerId}`;
  }
  if (plan.defenseCardInstanceId !== defenseCard.instanceId) {
    return `Defense payment plan belongs to card ${plan.defenseCardInstanceId}, not ${defenseCard.instanceId}`;
  }
  if (
    listDefenseCardLocations(state, defendingPlayer.playerId).filter(
      (location) => location.card.instanceId === defenseCard.instanceId
    ).length !== 1
  ) {
    return `Defense card ${defenseCard.instanceId} is not uniquely present in a Defense source`;
  }
  if (defendingPlayer.chips !== plan.startingChips) {
    return `Defense payment plan expected ${plan.startingChips} chips, found ${defendingPlayer.chips}`;
  }
  if (defendingPlayer.life.current !== plan.startingLife) {
    return `Defense payment plan expected ${plan.startingLife} life, found ${defendingPlayer.life.current}`;
  }

  let expectedChips = plan.startingChips;
  let expectedLife = plan.startingLife;
  const plannedDiscardIds = new Set<CardInstance["instanceId"]>();

  for (const step of plan.steps) {
    if (step.kind === "discardOtherHandCard") {
      if (step.cardInstanceId === defenseCard.instanceId) {
        return "Defense payment plan cannot discard the Defense card as a cost";
      }
      if (plannedDiscardIds.has(step.cardInstanceId)) {
        return `Defense payment plan repeats discard card ${step.cardInstanceId}`;
      }
      plannedDiscardIds.add(step.cardInstanceId);
      if (
        defendingPlayer.hand.filter(
          (card) => card.instanceId === step.cardInstanceId
        ).length !== 1
      ) {
        return `Defense payment card ${step.cardInstanceId} is not uniquely present in hand`;
      }
      continue;
    }

    if (step.kind === "spendChips") {
      if (
        !Number.isSafeInteger(step.amount) ||
        step.amount < 0 ||
        step.chipsBefore !== expectedChips ||
        step.chipsAfter !== step.chipsBefore - step.amount ||
        step.chipsAfter < 0
      ) {
        return "Defense payment plan has an inconsistent chip step";
      }
      expectedChips = step.chipsAfter;
      continue;
    }

    if (
      !Number.isSafeInteger(step.amount) ||
      step.amount < 0 ||
      step.lifeBefore !== expectedLife ||
      step.lifeAfter !== step.lifeBefore - step.amount ||
      step.lifeAfter < 1
    ) {
      return "Defense payment plan has an inconsistent life step";
    }
    expectedLife = step.lifeAfter;
  }

  return undefined;
}
