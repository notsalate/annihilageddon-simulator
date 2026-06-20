export type { RandomSource } from "./engine/rng.js";
export { createSeededRng } from "./engine/rng.js";
export type {
  CardDefinition,
  DataPackValidationOptions,
  DataPackValidationResult,
  DeadWizardTokenDefinition,
  DeckComposition,
  LoadedDataPack,
  TokenDefinition,
  TokenKind,
  TokenStackComposition,
  WizardPropertyDefinition,
} from "./engine/data.js";
export { loadV0DataPack, validateExecutableDataPack } from "./engine/data.js";
export type {
  DraftValidationMessage,
  DraftValidationResult,
  ValidateCardDraftOptions,
  ValidateDraftOptions,
} from "./import/draft-validation.js";
export {
  formatDraftValidationResult,
  validateCardDraft,
  validateDeadWizardTokenDraft,
  validateDraft,
  validateDraftFiles,
  validateWizardPropertyDraft,
} from "./import/draft-validation.js";
export type { ImportCompletenessAreaReport, ImportCompletenessReport } from "./import/import-completeness.js";
export { createImportCompletenessReport, formatImportCompletenessReport } from "./import/import-completeness.js";
export type {
  CardInstance,
  CommonState,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./engine/setup.js";
export { initializeGame } from "./engine/setup.js";
export type { ActionResult, GameAction, LegalAction } from "./engine/actions.js";
export { applyAction, listLegalActions } from "./engine/actions.js";
export type { MarketFlowEndReason, MarketFlowMode, MarketFlowResult, RunMarketFlowOptions } from "./engine/market-flow.js";
export { runMarketFlow } from "./engine/market-flow.js";
export type { ControlledObjectView, EffectiveValueKind, EffectiveValueTarget } from "./engine/effective-values.js";
export {
  buildControlledObjectView,
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectivePlayerMaxLife,
  calculateEffectiveTokenVictoryPoints,
  calculateEffectiveValue,
} from "./engine/effective-values.js";
export type {
  BotDecisionContext,
  BotStrategy,
  GameEndReason,
  PlayerScore,
  RunSingleGameOptions,
  SingleGameResult,
} from "./engine/simulation.js";
export { baselineBot, determineWinnerIds, getGameEndReason, runSingleGame, scoreGame } from "./engine/simulation.js";
export type {
  CompactGameSummary,
  MassSimulationAggregate,
  MassSimulationResult,
  RunMassSimulationOptions,
} from "./engine/mass-simulation.js";
export { runMassSimulation } from "./engine/mass-simulation.js";
export type { FormatSingleGameDebugTraceOptions } from "./engine/debug-trace.js";
export { formatSingleGameDebugTrace } from "./engine/debug-trace.js";
export { formatMassSimulationSummary, formatSingleGameSummary, runSimulationMenu } from "./cli/simulation-menu.js";
