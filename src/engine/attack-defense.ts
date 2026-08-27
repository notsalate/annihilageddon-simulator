import {
  listDefenseCardLocations,
  listPhysicalCardLocations,
  movePhysicalCard,
} from "./control-ledger.js";
import { clearFaceUpState } from "./deck-lifecycle.js";
import { installGameEventLog } from "./game-events.js";
import { recordGameEvent } from "./event-recorder.js";
import {
  capturePhysicalCardZoneState,
  restorePhysicalCardZoneState,
  type PhysicalCardZoneStateSnapshot,
} from "./physical-card-zone-snapshot.js";
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
  validateDefenseEffects?(
    state: GameState,
    player: PlayerState,
    effects: readonly RuntimeEffect[],
    source: EffectSourceContext,
    excludedCardInstanceId: CardInstance["instanceId"]
  ): EffectExecutionResult;
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
      readonly selection?: "seeded";
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
  readonly destination:
    | "discardSelf"
    | "topdeckSelf"
    | "topdeckSelfFaceUp"
    | "keep";
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

interface DefenseObjectMutationSnapshot {
  object: object;
  value: object;
}

interface DefenseMutationSnapshot {
  activePlayerId: GameState["activePlayerId"];
  turn: GameState["turn"];
  physicalCardZones: PhysicalCardZoneStateSnapshot;
  players: DefensePlayerMutationSnapshot[];
  common: {
    deadWizardTokenStatus: GameState["common"]["deadWizardTokens"]["status"];
    deadWizardTokenDrawStack: GameState["common"]["deadWizardTokens"]["drawStack"];
  };
  deadWizardTokenAttackQueues: GameState["deadWizardTokenResolution"]["attackQueues"];
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
):
  | { readonly ok: true; readonly snapshot: DefenseMutationSnapshot }
  | { readonly ok: false; readonly error: string } {
  const physicalCardZoneResult = capturePhysicalCardZoneState(state);
  if (!physicalCardZoneResult.ok) {
    return {
      ok: false,
      error: `Cannot snapshot Defense card zones: ${physicalCardZoneResult.reason}`,
    };
  }
  const mutableObjects = collectDefenseMutableObjects(state).map((object) => ({
    object,
    value: structuredClone(object),
  }));
  return {
    ok: true,
    snapshot: {
      activePlayerId: state.activePlayerId,
      turn: structuredClone(state.turn),
      physicalCardZones: physicalCardZoneResult.snapshot,
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
      deadWizardTokenAttackQueues: structuredClone(
        state.deadWizardTokenResolution.attackQueues
      ),
      mutableObjects,
      rng: state.rng.fork(),
      eventLogLength,
      defendedPlayerIds: new Set(defenseUsage.defendedPlayerIds),
      usedDefenseCardInstanceIds: new Set(
        defenseUsage.usedDefenseCardInstanceIds
      ),
    },
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
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  for (const mutableObject of snapshot.mutableObjects) {
    clearFaceUpState(mutableObject.object);
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
  const physicalCardZoneResult = restorePhysicalCardZoneState(
    state,
    snapshot.physicalCardZones
  );
  state.common.deadWizardTokens =
    snapshot.common.deadWizardTokenStatus === "notInDataPack"
      ? { status: "notInDataPack", drawStack: [] }
      : {
          status: snapshot.common.deadWizardTokenStatus,
          drawStack: [...snapshot.common.deadWizardTokenDrawStack],
        };
  state.deadWizardTokenResolution.attackQueues = structuredClone(
    snapshot.deadWizardTokenAttackQueues
  );
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
  return physicalCardZoneResult.ok
    ? { ok: true }
    : {
        ok: false,
        error: `Defense card-zone rollback failed: ${physicalCardZoneResult.reason}`,
      };
}

function rollbackDefenseFailure(
  state: GameState,
  defenseUsage: AttackDefenseUsage,
  snapshot: DefenseMutationSnapshot,
  failure: { readonly ok: false; readonly error: string }
): { readonly ok: false; readonly error: string } {
  const rollbackResult = restoreDefenseMutationSnapshot(
    state,
    defenseUsage,
    snapshot
  );
  return rollbackResult.ok ? failure : rollbackResult;
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
  if (state.turn.defenseDisabledPlayerIds.includes(defendingPlayer.playerId)) {
    return { ok: true, avoided: false };
  }

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
  const defensesByChoice = new Map<string, LegalDefense>(
    legalDefenses.map((defense) => [defense.card.instanceId, defense])
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
      : defensesByChoice.get(selectedChoice.choiceId);
  if (defense === undefined) {
    return { ok: true, avoided: false };
  }

  const defenseSource: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: defendingPlayer.playerId,
    ...(attack.kind === "redirectable"
      ? { currentAttackerPlayerId: attack.attackingPlayer.playerId }
      : {}),
    cardInstanceId: defense.card.instanceId,
    definitionId: defense.card.definitionId,
  };
  const branchEffects = defense.effect.branchEffects;
  if (
    branchEffects !== undefined &&
    services.validateDefenseEffects !== undefined
  ) {
    const validationResult = services.validateDefenseEffects(
      state,
      defendingPlayer,
      branchEffects,
      defenseSource,
      defense.card.instanceId
    );
    if (!validationResult.ok) {
      state.eventLog.splice(eventLogLengthBeforeChoice);
      installGameEventLog(state);
      return validationResult;
    }
  }

  const mutationSnapshotResult = createDefenseMutationSnapshot(
    state,
    attack.defenseUsage,
    eventLogLengthBeforeChoice
  );
  if (!mutationSnapshotResult.ok) {
    state.eventLog.splice(eventLogLengthBeforeChoice);
    installGameEventLog(state);
    return mutationSnapshotResult;
  }
  const mutationSnapshot = mutationSnapshotResult.snapshot;
  const attackId = attack.attackId ?? attack.defenseUsage.attackId;
  recordGameEvent(state, {
    type: "defenseChoiceSelected",
    playerId: defendingPlayer.playerId,
    ...(attackId === undefined ? {} : { attackId }),
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
    return rollbackDefenseFailure(
      state,
      attack.defenseUsage,
      mutationSnapshot,
      paymentResult
    );
  }

  attack.defenseUsage.defendedPlayerIds.add(defendingPlayer.playerId);
  attack.defenseUsage.usedDefenseCardInstanceIds.add(defense.card.instanceId);

  const redirectsAttack =
    defense.effect.redirectAttack === true ||
    (defense.effect.redirectAttackIf === "dingler" &&
      attack.kind === "redirectable" &&
      attack.attackingPlayer.statuses.some(
        (status) => status.statusId === "dingler"
      ));

  if (!moveDefenseCard(state, defendingPlayer, defense)) {
    return rollbackDefenseFailure(
      state,
      attack.defenseUsage,
      mutationSnapshot,
      {
        ok: false,
        error: `Cannot move defense ${defense.card.instanceId}`,
      }
    );
  }

  if (branchEffects !== undefined) {
    const branchResult = services.executeDefenseEffects(
      state,
      defendingPlayer,
      branchEffects,
      defenseSource
    );
    if (!branchResult.ok) {
      return rollbackDefenseFailure(
        state,
        attack.defenseUsage,
        mutationSnapshot,
        branchResult
      );
    }
    if (branchResult.gameEnd !== undefined) {
      return { ok: true, avoided: true, gameEnd: branchResult.gameEnd };
    }
  }

  if (
    redirectsAttack &&
    attack.kind === "redirectable" &&
    attack.redirectPolicy === "ignoreOriginalAttacker" &&
    attack.attackingPlayer.playerId === attack.originalSource.playerId
  ) {
    return { ok: true, avoided: false };
  }

  if (redirectsAttack && attack.kind === "redirectable") {
    if (resolveRedirectedAttack === undefined) {
      return rollbackDefenseFailure(
        state,
        attack.defenseUsage,
        mutationSnapshot,
        {
          ok: false,
          error: "Redirect defense requires the Attack Resolution callback",
        }
      );
    }
    const redirectResult = resolveRedirectedAttack({
      ...(attackId === undefined ? {} : { attackId }),
      controlEpoch: attack.controlEpoch + 1,
      attackingPlayer: defendingPlayer,
      targetPlayer: attack.attackingPlayer,
      amountComponents: attack.amountComponents,
      carriedAmount: attack.carriedAmount,
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
      return rollbackDefenseFailure(
        state,
        attack.defenseUsage,
        mutationSnapshot,
        redirectResult
      );
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
      ...(attackId === undefined ? {} : { attackId }),
      damageDealt: 0,
      killed: false,
      avoided: true,
      controlEpoch: attack.controlEpoch,
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
    destination: "discardSelf" | "topdeckSelf" | "topdeckSelfFaceUp" | "keep";
  }
): boolean {
  if (defense.destination === "keep") {
    return true;
  }
  const destinationZoneName =
    defense.destination === "discardSelf"
      ? `${defendingPlayer.playerId}.discard`
      : defense.destination === "topdeckSelf" ||
          defense.destination === "topdeckSelfFaceUp"
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

  if (defense.destination === "topdeckSelfFaceUp") {
    moveResult.move.card.faceUp = true;
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
            ...(cost.rng === "seeded" ? { selection: "seeded" as const } : {}),
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

  const paidCardInstanceIds = new Set<CardInstance["instanceId"]>();
  for (const step of plan.steps) {
    switch (step.kind) {
      case "discardOtherHandCard": {
        const paidCardInstanceId =
          step.selection === "seeded"
            ? selectSeededDefensePaymentCard(
                state,
                defendingPlayer,
                defenseCard,
                paidCardInstanceIds
              )
            : step.cardInstanceId;
        if (paidCardInstanceId === undefined) {
          return {
            ok: false,
            error: "Defense payment plan could not select a hand card",
          };
        }
        const moveResult = movePhysicalCard(
          state,
          paidCardInstanceId,
          `${defendingPlayer.playerId}.discard`,
          "back",
          `${defendingPlayer.playerId}.hand`
        );
        if (!moveResult.ok) {
          return {
            ok: false,
            error: `Defense payment plan could not move card ${step.cardInstanceId}: ${moveResult.reason}`,
          };
        }
        const paidCard = moveResult.move.card;
        paidCardInstanceIds.add(paidCard.instanceId);
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

function selectSeededDefensePaymentCard(
  state: GameState,
  defendingPlayer: PlayerState,
  defenseCard: CardInstance,
  paidCardInstanceIds: ReadonlySet<CardInstance["instanceId"]>
): CardInstance["instanceId"] | undefined {
  const candidates = defendingPlayer.hand.filter(
    (card) =>
      card.instanceId !== defenseCard.instanceId &&
      !paidCardInstanceIds.has(card.instanceId)
  );
  if (candidates.length === 0) {
    return undefined;
  }
  const selected = candidates[state.rng.nextInt(candidates.length)];
  return selected?.instanceId;
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
