import type { CardDefinition } from "./data.js";
import {
  getPhysicalCardLedger,
  grantTemporaryControl,
} from "./control-ledger.js";
import { recordCardMoved } from "./event-recorder.js";
import type {
  EffectCycleOutcome,
  EffectExecutionResult,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import { preserveEffectCycleOutcome } from "./effect-runtime-registry.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";
import { runControlledPowerMutation } from "./trigger-dispatch.js";

export interface CardPlayResolutionServices {
  executeOnPlayEffects(
    state: GameState,
    player: PlayerState,
    definition: CardDefinition,
    source: EffectSourceContext
  ): EffectExecutionResult;
  executeWizardPropertyOnPlayCardEffects(
    state: GameState,
    player: PlayerState,
    definition: CardDefinition
  ): EffectExecutionResult;
  executeControlledCardOnPlayCardEffects(
    state: GameState,
    player: PlayerState,
    card: CardInstance
  ): EffectExecutionResult;
  executeControlledCardAfterControllerPlaysCardEffects(
    state: GameState,
    player: PlayerState,
    card: CardInstance
  ): EffectExecutionResult;
}

export interface CardPlayResolutionOptions {
  readonly nonOngoingDestination?: {
    readonly zone: "ownerDiscardAfterResolution";
    readonly ownerId: PlayerState["playerId"];
  };
  readonly ongoingOwnerId?: CardInstance["ownerId"];
  readonly forceOngoingDiscard?: {
    readonly zone: "ownerDiscardAfterResolution";
    readonly ownerId: PlayerState["playerId"];
  };
  readonly sourceZone?: string;
  readonly ownerBefore?: CardInstance["ownerId"];
}

/** Resolves the effects and lifecycle of one already-selected card. */
export function resolveCardPlay(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  services: CardPlayResolutionServices,
  options: CardPlayResolutionOptions = {}
): EffectExecutionResult {
  let cycleOutcome: EffectCycleOutcome | undefined;
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    return {
      ok: false,
      error: `Missing card definition ${card.definitionId}`,
    };
  }

  const placeAndRecord = (): string => {
    const destinationZone = placeResolvedCard(
      state,
      player,
      card,
      definition,
      options
    );
    if (options.sourceZone !== undefined) {
      recordCardMoved(state, player, card, {
        sourceZone: options.sourceZone,
        destinationZone,
        ownerBefore: options.ownerBefore ?? card.ownerId,
        ownerAfter: card.ownerId,
      });
    }
    return destinationZone;
  };
  const persistsAsOngoing =
    definition.engine.isOngoing && options.forceOngoingDiscard === undefined;
  const placementResult = persistsAsOngoing
    ? runControlledPowerMutation(state, player.playerId, placeAndRecord)
    : { ok: true as const, value: placeAndRecord() };
  if (!placementResult.ok) {
    return placementResult;
  }
  if (placementResult.gameEnd !== undefined) {
    return placementResult;
  }

  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: player.playerId,
    card,
    cardInstanceId: card.instanceId,
    definitionId: card.definitionId,
  };
  const effectResult = services.executeOnPlayEffects(
    state,
    player,
    definition,
    source
  );
  if (!effectResult.ok) {
    return effectResult;
  }
  cycleOutcome ??= effectResult.cycleOutcome;
  if (effectResult.gameEnd !== undefined) {
    return preserveEffectCycleOutcome(
      finishResolvedCard(
        state,
        player,
        card,
        definition,
        options,
        effectResult
      ),
      cycleOutcome
    );
  }

  const wizardPropertyResult = services.executeWizardPropertyOnPlayCardEffects(
    state,
    player,
    definition
  );
  if (!wizardPropertyResult.ok) {
    return wizardPropertyResult;
  }
  cycleOutcome ??= wizardPropertyResult.cycleOutcome;

  if (wizardPropertyResult.gameEnd === undefined) {
    const controlledCardResult =
      services.executeControlledCardOnPlayCardEffects(state, player, card);
    if (!controlledCardResult.ok) {
      return controlledCardResult;
    }
    cycleOutcome ??= controlledCardResult.cycleOutcome;
    if (controlledCardResult.gameEnd !== undefined) {
      return preserveEffectCycleOutcome(
        finishResolvedCard(
          state,
          player,
          card,
          definition,
          options,
          controlledCardResult
        ),
        cycleOutcome
      );
    }
    const afterControllerPlayResult =
      services.executeControlledCardAfterControllerPlaysCardEffects(
        state,
        player,
        card
      );
    if (!afterControllerPlayResult.ok) {
      return afterControllerPlayResult;
    }
    cycleOutcome ??= afterControllerPlayResult.cycleOutcome;
    if (afterControllerPlayResult.gameEnd !== undefined) {
      return preserveEffectCycleOutcome(
        finishResolvedCard(
          state,
          player,
          card,
          definition,
          options,
          afterControllerPlayResult
        ),
        cycleOutcome
      );
    }
  }

  const result = finishResolvedCard(
    state,
    player,
    card,
    definition,
    options,
    wizardPropertyResult
  );
  return preserveEffectCycleOutcome(result, cycleOutcome);
}

function placeResolvedCard(
  state: GameState,
  player: PlayerState,
  card: CardInstance,
  definition: CardDefinition,
  options: CardPlayResolutionOptions
): string {
  if (
    definition.engine.isOngoing &&
    options.forceOngoingDiscard === undefined
  ) {
    card.ownerId = options.ongoingOwnerId ?? card.ownerId;
    getPhysicalCardLedger(state).addCards(`${player.playerId}.permanents`, [
      card,
    ]);
    return `${player.playerId}.permanents`;
  }

  getPhysicalCardLedger(state).addCards(`${player.playerId}.playedThisTurn`, [
    card,
  ]);
  grantTemporaryControl(state, card, player.playerId);
  return `${player.playerId}.playedThisTurn`;
}

function finishResolvedCard(
  state: GameState,
  controller: PlayerState,
  card: CardInstance,
  definition: CardDefinition,
  options: CardPlayResolutionOptions,
  result: EffectExecutionResult
): EffectExecutionResult {
  const movementResult = moveResolvedNonOngoingCardToDestination(
    state,
    controller,
    card,
    definition.engine.isOngoing && options.forceOngoingDiscard === undefined,
    options.forceOngoingDiscard ?? options.nonOngoingDestination
  );
  return movementResult.ok ? result : movementResult;
}

function moveResolvedNonOngoingCardToDestination(
  state: GameState,
  controller: PlayerState,
  card: CardInstance,
  isOngoing: boolean,
  destination:
    | {
        readonly zone: "ownerDiscardAfterResolution";
        readonly ownerId: PlayerState["playerId"];
      }
    | undefined
): EffectExecutionResult {
  if (isOngoing || destination === undefined) {
    return { ok: true };
  }
  if (card.ownerId !== destination.ownerId) {
    return {
      ok: false,
      error: `Cannot move ${card.instanceId} to a discard that does not belong to its owner`,
    };
  }
  const owner = state.players.find(
    (candidate) => candidate.playerId === destination.ownerId
  );
  if (owner === undefined) {
    return {
      ok: false,
      error: `Missing card owner ${destination.ownerId}`,
    };
  }

  const expectedSourceZone = `${controller.playerId}.playedThisTurn`;
  const ledger = getPhysicalCardLedger(state);
  const currentLocation = ledger.locateCard(card);
  if (currentLocation?.zoneName !== expectedSourceZone) {
    return {
      ok: false,
      error: `Cannot move resolved card ${card.instanceId}`,
    };
  }

  const removed = ledger.removeCard(card, expectedSourceZone);
  if (!removed.ok) {
    return {
      ok: false,
      error: `Cannot move resolved card ${card.instanceId}`,
    };
  }

  ledger.addCards(`${owner.playerId}.discard`, [card]);
  recordCardMoved(state, controller, card, {
    sourceZone: removed.sourceZoneName,
    destinationZone: `${owner.playerId}.discard`,
    ownerBefore: currentLocation.card.ownerId,
    ownerAfter: currentLocation.card.ownerId,
  });
  return { ok: true };
}
