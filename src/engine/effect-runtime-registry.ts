import type { GameState, PlayerState, TokenInstance } from "./setup.js";
import type { TokenDefinition } from "./data.js";

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

export interface EffectRuntimeHandler {
  effectId: string;
  validateShape(subjectId: string, effect: Record<string, unknown>): string[];
  execute(
    state: GameState,
    player: PlayerState,
    effect: Record<string, unknown>,
    source: EffectSourceContext,
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

export const effectRuntimeRegistry = new Map<string, EffectRuntimeHandler>([
  [addPowerHandler.effectId, addPowerHandler],
]);

export function getEffectRuntimeHandler(effectId: string): EffectRuntimeHandler | undefined {
  return effectRuntimeRegistry.get(effectId);
}
