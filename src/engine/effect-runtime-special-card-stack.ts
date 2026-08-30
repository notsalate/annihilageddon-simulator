import { recordGameEvent } from "./event-recorder.js";
import { getPhysicalCardLedger } from "./control-ledger.js";
import type {
  EffectChoice,
  EffectExecutionResult,
  EffectRuntimeServices,
  EffectSourceContext,
} from "./effect-runtime-registry.js";
import type { RuntimeEffectId } from "./runtime-effect.js";
import type { CardInstance, GameState, PlayerState } from "./setup.js";

export type LimpWandGainDestination =
  | "discard"
  | "hand"
  | "deckTop"
  | "deckBottom";

export function gainLimpWandsFromCommonStack(
  state: GameState,
  player: PlayerState,
  amount: number,
  destination: LimpWandGainDestination,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: Pick<EffectRuntimeServices, "moveCardToPlayerZone">
): EffectExecutionResult {
  const destinationZone = `${player.playerId}.${
    destination === "deckTop" || destination === "deckBottom"
      ? "deck"
      : destination
  }`;

  for (let index = 0; index < amount; index += 1) {
    const limpWand = getPhysicalCardLedger(state).readZone("limpWandStack")[0];
    if (limpWand === undefined) {
      break;
    }

    const moved = services.moveCardToPlayerZone(
      state,
      limpWand,
      player,
      destinationZone,
      effectId,
      source,
      destination === "deckTop"
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot move Limp Wand ${limpWand.instanceId}`,
      };
    }

    recordGameEvent(state, {
      type: "effectCardGained",
      playerId: player.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: limpWand.instanceId,
      targetDefinitionId: limpWand.definitionId,
      effectId,
      destination,
      sourceType: source.sourceType,
    });
  }

  return { ok: true };
}

export function transferUpToLimpWandsToPlayer(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  amount: number,
  effectId: RuntimeEffectId,
  source: EffectSourceContext,
  services: Pick<
    EffectRuntimeServices,
    "chooseEffectChoice" | "moveCardToPlayerZone"
  >
): EffectExecutionResult {
  const ledger = getPhysicalCardLedger(state);
  for (let index = 0; index < amount; index += 1) {
    const cards = [
      ...ledger.readZone(`${sourcePlayer.playerId}.hand`),
      ...ledger.readZone(`${sourcePlayer.playerId}.discard`),
      ...ledger.readZone("limpWandStack"),
    ].filter((card) => isLimpWand(state, card));
    const choice = services.chooseEffectChoice(
      state,
      sourcePlayer,
      source,
      effectId,
      buildLimpWandTransferChoices(cards)
    );
    if (choice?.choiceKind !== "cardTarget") {
      break;
    }
    const limpWand = choice.cards[0];
    if (limpWand === undefined) {
      return { ok: false, error: "Limp Wand transfer requires one card" };
    }
    const moved = services.moveCardToPlayerZone(
      state,
      limpWand,
      targetPlayer,
      `${targetPlayer.playerId}.discard`,
      effectId,
      source
    );
    if (!moved) {
      return {
        ok: false,
        error: `Cannot transfer Limp Wand ${limpWand.instanceId}`,
      };
    }
    recordGameEvent(state, {
      type: "effectCardGained",
      playerId: targetPlayer.playerId,
      cardInstanceId: source.cardInstanceId,
      definitionId: source.definitionId,
      targetCardInstanceId: limpWand.instanceId,
      targetDefinitionId: limpWand.definitionId,
      effectId,
      destination: "discard",
      sourceType: source.sourceType,
    });
  }

  return { ok: true };
}

function isLimpWand(state: GameState, card: CardInstance): boolean {
  return (
    state.cardDefinitions.get(card.definitionId)?.engine.cardKind === "limpWand"
  );
}

function buildLimpWandTransferChoices(
  cards: readonly CardInstance[]
): EffectChoice[] {
  return [
    { choiceKind: "option", choiceId: "done" },
    ...cards.map((card) => ({
      choiceKind: "cardTarget" as const,
      choiceId: `transfer_${card.instanceId}`,
      cards: [card],
      amount: 1,
    })),
  ];
}
