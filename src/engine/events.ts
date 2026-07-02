import type { CommonOwner, PlayerId } from "./setup.js";

export type GameEventType =
  | "attackAvoided"
  | "attackTargetStarted"
  | "botActionSelected"
  | "cardActivated"
  | "cardBought"
  | "cardMoved"
  | "cardPlayed"
  | "deadWizardTokenGained"
  | "defenseCardMoved"
  | "defenseChoiceSelected"
  | "dinglerStatusGained"
  | "dinglerStatusRemoved"
  | "discardShuffledIntoDeck"
  | "effectAddPowerApplied"
  | "effectCardDestroyed"
  | "effectCardDiscarded"
  | "effectCardGained"
  | "effectChoiceSelected"
  | "effectChoiceSkipped"
  | "effectDamageDealt"
  | "effectDestroyTopMainDeckSkipped"
  | "effectLifeSet"
  | "effectTopMainDeckCardDestroyed"
  | "gameInitialized"
  | "marketChipAdded"
  | "marketChipsGained"
  | "marketFlowCardAdded"
  | "marketFlowFailed"
  | "mayhemDecisionPhaseStarted"
  | "mayhemDecisionStarted"
  | "mayhemDeckDiscardedThenDiscardCardDestroyed"
  | "mayhemDestroyed"
  | "mayhemDiscardedTopDeckCardsDestroyed"
  | "mayhemHandDiscardedAndRedrawn"
  | "mayhemResolved"
  | "mayhemResolutionPhaseStarted"
  | "mayhemTargetSkipped"
  | "megaMayhemDestroyed"
  | "playerDied"
  | "playerResurrected"
  | "trophyChipGranted"
  | "trophyControlChanged"
  | "turnEnded"
  | "turnStarted"
  | "wizardPropertyActivated";

export interface GameEvent {
  type: GameEventType;
  playerId?: PlayerId;
  targetPlayerId?: PlayerId;
  turnNumber?: number;
  actionIdentity?: string;
  powerBefore?: number;
  powerAfter?: number;
  chipsBefore?: number;
  chipsAfter?: number;
  sourceZone?: string;
  destinationZone?: string;
  ownerBefore?: PlayerId | CommonOwner;
  ownerAfter?: PlayerId | CommonOwner;
  cardInstanceId?: string;
  definitionId?: string;
  targetCardInstanceId?: string;
  targetDefinitionId?: string;
  tokenInstanceId?: string;
  tokenDefinitionId?: string;
  effectId?: string;
  costId?: string;
  choiceId?: string;
  choiceIds?: string[];
  direction?: string;
  legalChoiceCount?: number;
  amount?: number;
  destination?: string;
  targetCardInstanceIds?: string[];
  targetDefinitionIds?: string[];
  sourceType?: string;
}
