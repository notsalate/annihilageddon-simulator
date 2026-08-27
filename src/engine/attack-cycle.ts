import { isPlainRecord } from "../common.js";
import type { ChoicePolicyState } from "./choice-policy.js";
import type { EffectSourceContext } from "./effect-runtime-registry.js";
import type {
  CardInstance,
  GameState,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./setup.js";
import type { RuntimeEffectForId } from "./runtime-effect.js";

export type AttackChainDirection = "left" | "right";

export interface AttackChainRecurrenceCursor {
  readonly direction: AttackChainDirection;
  readonly targetIndex: number;
  readonly targetPlayerId: PlayerState["playerId"];
  readonly effect?: RuntimeEffectForId<"directional_chain_attack">;
  readonly choicePolicyState?: ChoicePolicyState;
}

/**
 * Projects the mutable rules state used by a directional AttackChain.
 * Event history and attack counters are deliberately absent: both change for
 * every AttackInstance without changing what the next continuation can do.
 */
export function createAttackChainRecurrenceKey(
  state: GameState,
  cursor: AttackChainRecurrenceCursor,
  source?: Pick<
    EffectSourceContext,
    | "sourceType"
    | "runtimeMode"
    | "playerId"
    | "cardInstanceId"
    | "definitionId"
  >
): string {
  return stableSerialize({
    version: 1,
    cursor,
    source,
    seed: state.seed,
    runtimeMode: state.runtimeMode,
    activePlayerId: state.activePlayerId,
    turn: projectTurn(state),
    players: state.players.map(projectPlayer),
    common: projectCommon(state),
    deadWizardTokenResolution: {
      attackQueues: state.deadWizardTokenResolution.attackQueues.map(
        (queue) => ({
          faces: queue.faces.map((face) => ({
            playerId: face.playerId,
            tokenInstanceId: face.tokenInstanceId,
            tokenDefinitionId: face.tokenDefinitionId,
            ...(face.deathKillerPlayerId === undefined
              ? {}
              : { deathKillerPlayerId: face.deathKillerPlayerId }),
            ...(face.deadWizardTokenWasDinglerAtGain === undefined
              ? {}
              : {
                  deadWizardTokenWasDinglerAtGain:
                    face.deadWizardTokenWasDinglerAtGain,
                }),
            ...(face.deadWizardTokenProjectionEffectIds === undefined
              ? {}
              : {
                  deadWizardTokenProjectionEffectIds:
                    face.deadWizardTokenProjectionEffectIds,
                }),
          })),
        })
      ),
    },
    rng: state.rng.snapshot(),
  });
}

function projectTurn(state: GameState): unknown {
  return {
    number: state.turn.number,
    power: state.turn.power,
    controlledPowerBonus: state.turn.controlledPowerBonus,
    activatedCardIds: state.turn.activatedCardIds,
    gainedCards: state.turn.gainedCards,
    mainMarketCardHandReplacementSourceCardIds:
      state.turn.mainMarketCardHandReplacementSourceCardIds,
    pendingMarketFlowEndReasons: state.turn.pendingMarketFlowEndReasons,
    ...(state.turn.pendingSpecialWinnerPlayerId === undefined
      ? {}
      : {
          pendingSpecialWinnerPlayerId: state.turn.pendingSpecialWinnerPlayerId,
        }),
    ...(state.turn.rememberedDestroyedLegendCost === undefined
      ? {}
      : {
          rememberedDestroyedLegendCost:
            state.turn.rememberedDestroyedLegendCost,
        }),
    damagingAttackPlayerIds: state.turn.damagingAttackPlayerIds,
    ...(state.turn.nextAttackUnavoidablePlayerId === undefined
      ? {}
      : {
          nextAttackUnavoidablePlayerId:
            state.turn.nextAttackUnavoidablePlayerId,
        }),
    defenseDisabledPlayerIds: state.turn.defenseDisabledPlayerIds,
    ...(state.turn.deadWizardTokenKillReplacement === undefined
      ? {}
      : {
          deadWizardTokenKillReplacement:
            state.turn.deadWizardTokenKillReplacement,
        }),
    temporaryCardControls: state.turn.temporaryCardControls,
  };
}

function projectPlayer(player: PlayerState): unknown {
  return {
    playerId: player.playerId,
    deck: player.deck.map(projectCard),
    hand: player.hand.map(projectCard),
    discard: player.discard.map(projectCard),
    playedThisTurn: player.playedThisTurn.map(projectCard),
    permanents: player.permanents.map(projectCard),
    unboughtFamiliars: player.unboughtFamiliars.map(projectCard),
    effectiveCardTypeSelections: player.effectiveCardTypeSelections,
    deadWizardTokens: player.deadWizardTokens.map(projectToken),
    wizardProperties: player.wizardProperties.map(projectToken),
    statuses: player.statuses.map(projectStatus),
    trophyLikeObjects: player.trophyLikeObjects.map(projectTrophy),
    chips: player.chips,
    life: player.life,
  };
}

function projectCommon(state: GameState): unknown {
  return {
    market: state.common.market.map(projectCard),
    legendMarket: state.common.legendMarket.map(projectCard),
    mainDeck: state.common.mainDeck.map(projectCard),
    legendDeck: state.common.legendDeck.map(projectCard),
    wildMagicStack: state.common.wildMagicStack.map(projectCard),
    limpWandStack: state.common.limpWandStack.map(projectCard),
    destroyedPile: state.common.destroyedPile.map(projectCard),
    destroyedMayhem: state.common.destroyedMayhem.map(projectCard),
    destroyedMegaMayhem: state.common.destroyedMegaMayhem.map(projectCard),
    deadWizardTokens: {
      status: state.common.deadWizardTokens.status,
      drawStack: state.common.deadWizardTokens.drawStack.map(projectToken),
    },
  };
}

function projectCard(card: CardInstance): unknown {
  return {
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    ownerId: card.ownerId,
    marketChips: card.marketChips,
    faceUp: card.faceUp === true,
  };
}

function projectToken(token: TokenInstance): unknown {
  return {
    instanceId: token.instanceId,
    definitionId: token.definitionId,
    ownerId: token.ownerId,
  };
}

function projectStatus(status: StatusInstance): unknown {
  return {
    instanceId: status.instanceId,
    statusId: status.statusId,
    ownerId: status.ownerId,
    effects: status.effects,
  };
}

function projectTrophy(trophy: TrophyLikeInstance): unknown {
  return {
    instanceId: trophy.instanceId,
    trophyId: trophy.trophyId,
    ownerId: trophy.ownerId,
    effects: trophy.effects,
  };
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (Object.is(value, -0)) return "number:-0";
    if (Number.isNaN(value)) return "number:NaN";
    if (value === Number.POSITIVE_INFINITY) return "number:+Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number:-Infinity";
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(
    "Attack-chain recurrence state contains unsupported data"
  );
}
