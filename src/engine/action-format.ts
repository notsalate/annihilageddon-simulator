import type { LegalAction } from "./actions.js";

/** Returns the stable public representation used by reports and fingerprints. */
export function stableAction(action: LegalAction): Record<string, string> {
  switch (action.type) {
    case "playCard":
    case "activatePermanent":
      return { type: action.type, cardInstanceId: action.cardInstanceId };
    case "activateWizardProperty":
      return { type: action.type, tokenInstanceId: action.tokenInstanceId };
    case "setCardEffectiveType":
      return {
        type: action.type,
        cardInstanceId: action.cardInstanceId,
        cardType: action.cardType,
        enabled: action.enabled ? "true" : "false",
      };
    case "buyMarketCard":
      return {
        type: action.type,
        cardInstanceId: action.cardInstanceId,
        source: action.source,
      };
    case "endTurn":
      return { type: action.type };
  }
}
