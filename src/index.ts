export { assertNever, isPlainRecord } from "./common.js";
export type {
  CardDefinitionId,
  CardInstanceId,
  PlayerId,
  TokenDefinitionId,
  TokenInstanceId,
} from "./domain/types.js";
export {
  createCardDefinitionId,
  createCardInstanceId,
  createPlayerId,
  createTokenDefinitionId,
  createTokenInstanceId,
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "./domain/types.js";
export type { RandomSource } from "./engine/rng.js";
export { createSeededRng } from "./engine/rng.js";
export type {
  CardDefinition,
  DecodeResult,
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
export type {
  EffectTiming,
  RuntimeEffect,
  AttackOutcomeBranch,
  RuntimeEffectCondition,
  RuntimeEffectCost,
  RuntimeEffectId,
  RuntimeEffectSelectorTarget,
  RuntimeEffectTarget,
  RuntimeEffectTargetSelector,
  WildMagicOption,
  TargetSelector,
} from "./engine/runtime-effect.js";
export {
  decodeCurrentRuntimeDataPack,
  loadCurrentRuntimeDataPack,
  loadV0DataPack,
  validateExecutableDataPack,
} from "./engine/data.js";
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
export type {
  ImportCompletenessAreaReport,
  ImportCompletenessReport,
} from "./import/import-completeness.js";
export {
  createImportCompletenessReport,
  formatImportCompletenessReport,
} from "./import/import-completeness.js";
export type {
  CardClusterDecision,
  CardClusterDecisionFile,
  CardClusterDecisionStatus,
  CardRuntimeClusterItem,
  CardRuntimeClusterReport,
  SyncCardClusterDecisionsResult,
} from "./import/card-runtime-clusters.js";
export {
  createCardRuntimeClusterReport,
  formatCardRuntimeClusterMarkdown,
  syncCardClusterDecisions,
  writeCardRuntimeClusterMatrix,
} from "./import/card-runtime-clusters.js";
export type {
  RuntimeCoverageInventory,
  RuntimeCoverageInventoryItem,
  RuntimeCoverageMechanicCluster,
  RuntimeCoverageObjectKind,
  RuntimeCoverageStatus,
} from "./import/runtime-coverage-inventory.js";
export {
  createRuntimeCoverageInventory,
  formatRuntimeCoverageInventoryMarkdown,
  writeRuntimeCoverageInventoryMarkdown,
} from "./import/runtime-coverage-inventory.js";
export type {
  DraftImportBlocker,
  DraftImportGeneratedFile,
  DraftImportHarnessResult,
  DraftImportKind,
  DraftImportSource,
  RunDraftImportHarnessOptions,
} from "./import/draft-generator.js";
export { runDraftImportHarness } from "./import/draft-generator.js";
export type {
  CardInstance,
  CommonState,
  GameState,
  PlayerState,
  RuntimeEffectChoice,
  RuntimeEffectChoiceRequest,
  RuntimeEffectChoiceStrategy,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./engine/setup.js";
export { initializeGame } from "./engine/setup.js";
export { assertGameStateInvariants } from "./engine/invariants.js";
export type {
  ActionResult,
  GameAction,
  LegalAction,
} from "./engine/actions.js";
export { applyAction, listLegalActions } from "./engine/actions.js";
export type {
  MarketFlowEndReason,
  MarketFlowMode,
  MarketFlowResult,
  RunMarketFlowOptions,
} from "./engine/market-flow.js";
export { runMarketFlow } from "./engine/market-flow.js";
export type {
  ControlledObjectView,
  EffectiveValueKind,
  EffectiveValueTarget,
} from "./engine/effective-values.js";
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
  SetupCardSnapshot,
  SetupPlayerSnapshot,
  SetupStateSnapshot,
  SetupTokenSnapshot,
  SingleGameResult,
} from "./engine/simulation.js";
export {
  baselineBot,
  determineWinnerIds,
  getGameEndReason,
  runSingleGame,
  scoreGame,
} from "./engine/simulation.js";
export type {
  CompactGameSummary,
  MassSimulationAggregate,
  MassSimulationResult,
  RunMassSimulationOptions,
} from "./engine/mass-simulation.js";
export { runMassSimulation } from "./engine/mass-simulation.js";
export type { FormatSingleGameDebugTraceOptions } from "./engine/debug-trace.js";
export { formatSingleGameDebugTrace } from "./engine/debug-trace.js";
export {
  formatMassSimulationSummary,
  formatSingleGameSummary,
  runSimulationMenu,
} from "./cli/simulation-menu.js";
