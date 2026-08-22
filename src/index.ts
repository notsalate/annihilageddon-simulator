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
  RuntimeSourceMetadata,
  DeadWizardTokenDefinition,
  DeckComposition,
  LoadedDataPack,
  TokenDefinition,
  TokenKind,
  TokenStackComposition,
  WizardPropertyDefinition,
} from "./engine/data.js";
export type {
  AvoidAttackRuntimeEffect,
  DoubleOwnedAttackDamageRuntimeEffect,
  EffectTiming,
  IncreaseHandLimitAtMaxLifeRuntimeEffect,
  ModifyOwnedWandAttackDamageRuntimeEffect,
  OngoingAddPowerRuntimeEffect,
  OngoingAddPowerWhenPlayingLimpWandRuntimeEffect,
  OngoingAddPowerWhenPlayingWandRuntimeEffect,
  OngoingAddPowerPerDeadWizardTokenRuntimeEffect,
  OngoingFirstAttackDamageAddPowerRuntimeEffect,
  OngoingHandRefillBonusRuntimeEffect,
  PreventDefenseAgainstOwnedWandAttacksRuntimeEffect,
  RuntimeEffect,
  RuntimeEffectForId,
  RuntimeEffectPayloadMap,
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
  intakeRuntimeData,
  RuntimeDataIntakeError,
} from "./engine/runtime-data-intake.js";
export type {
  RuntimeDataFilesystemSource,
  RuntimeDataIntakeErrorKind,
  RuntimeDataIntakeOptions,
  RuntimeDataPreloadedSource,
  RuntimeDataSource,
  VerifiedRuntimeDataPack,
} from "./engine/runtime-data-intake.js";
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
  ChoiceCardTargetView,
  ChoiceDefenseView,
  ChoiceDirectionalPlayerTargetView,
  ChoiceKind,
  ChoiceOptionView,
  ChoicePlayerTargetView,
  ChoicePlayerView,
  ChoicePolicy,
  ChoiceRequest,
  ChoiceSelection,
  ChoiceView,
} from "./engine/choice-policy.js";
export type {
  CardInstance,
  CommonState,
  GameState,
  PlayerDecisionView,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TrophyLikeInstance,
} from "./engine/setup.js";
export { initializeGame } from "./engine/setup.js";
export { forkGameState } from "./engine/game-state-fork.js";
export type {
  AnalysisChoiceSelection,
  AnalysisActionStep,
  AnalyzedTurnLine,
  RankedTurnLine,
  RankedTurnLinesResult,
  TurnLineEvaluation,
  TurnLineEvaluationContext,
  TurnLineEvaluationPolicy,
  AnalysisError,
  AnalysisLimits,
  AnalysisLimitError,
  CompletedActionBranch,
} from "./engine/best-move-analysis.js";
export {
  victoryPointsPolicy,
  BEST_MOVE_POLICIES,
  getBestMovePolicy,
} from "./engine/best-move-policies.js";
export {
  enumerateActionBranches,
  enumerateImmediateActionBranches,
  enumerateTurnLines,
  rankTurnLines,
} from "./engine/best-move-analysis.js";
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
export {
  calculateEffectiveCardCost,
  calculateEffectiveCardVictoryPoints,
  calculateEffectivePlayerVictoryPoints,
  calculateEffectivePlayerMaxLife,
  calculateEffectiveTokenVictoryPoints,
} from "./engine/effective-value-runtime.js";
export type { AdjudicationResult, PlayerScore } from "./engine/adjudication.js";
export {
  adjudicateGame,
  determineWinnerIds,
  scoreGame,
} from "./engine/adjudication.js";
export type {
  BotDecisionContext,
  BotStrategy,
  GameEndReason,
  RunSingleGameOptions,
  SetupCardSnapshot,
  SetupPlayerSnapshot,
  SetupStateSnapshot,
  SetupTokenSnapshot,
  SingleGameResult,
} from "./engine/simulation.js";
export {
  baselineBot,
  getGameEndReason,
  runSingleGame,
} from "./engine/simulation.js";
export type {
  CompactGameSummary,
  MassSimulationAggregate,
  MassSimulationResult,
  RunMassSimulationOptions,
} from "./engine/mass-simulation.js";
export { runMassSimulation } from "./engine/mass-simulation.js";
export type {
  AnalyzerBenchmarkMetrics,
  AnalyzerBenchmarkProfile,
  AnalyzerBenchmarkProfileId,
  AnalyzerBenchmarkResult,
  AnalyzerBenchmarkRole,
  AnalyzerBenchmarkSample,
  AnalyzerBenchmarkTimings,
  AnalyzerBenchmarkWorkload,
  CreateAnalyzerBenchmarkWorkloadOptions,
  RunAnalyzerBenchmarkOptions,
} from "./engine/analyzer-benchmark.js";
export {
  ANALYZER_BENCHMARK_CONTRACT_VERSION,
  ANALYZER_BENCHMARK_PROFILES,
  ANALYZER_REFERENCE_PROFILES,
  ANALYZER_REFERENCE_WORKLOAD_VERSION,
  createAnalyzerBenchmarkWorkload,
  runAnalyzerBenchmark,
} from "./engine/analyzer-benchmark.js";
export type {
  CreateSimulationBenchmarkWorkloadOptions,
  RunSimulationBenchmarkOptions,
  SimulationBenchmarkDependencies,
  SimulationBenchmarkResult,
  SimulationBenchmarkRole,
  SimulationBenchmarkSample,
  SimulationBenchmarkStage,
  SimulationBenchmarkTimings,
  SimulationBenchmarkWorkload,
  SimulationBenchmarkMetrics,
  SimulationCoverage,
  SimulationCoverageKey,
} from "./engine/simulation-benchmark.js";
export {
  SIMULATION_BENCHMARK_CONTRACT_VERSION,
  SIMULATION_BENCHMARK_STAGES,
  SIMULATION_REFERENCE_STAGES,
  SIMULATION_REFERENCE_COVERAGE,
  SIMULATION_REFERENCE_WORKLOAD_VERSION,
  createSimulationBenchmarkWorkload,
  runSimulationBenchmark,
} from "./engine/simulation-benchmark.js";
export type {
  BenchmarkClock,
  BenchmarkEnvironmentFingerprint,
} from "./engine/benchmark-support.js";
export type {
  PerformanceBenchmarkKind,
  PerformanceBaselineEntry,
  PerformanceCalibrationMetric,
  PerformanceCalibrationPair,
  PerformanceCalibrationResult,
  PerformanceComparisonReport,
  PerformanceEpochBaseline,
  PerformanceEpochCalibrationMetadata,
  PerformanceMeasurement,
  PerformanceMetricDelta,
  PerformanceStage,
  PerformanceTolerance,
  PerformanceVerdict,
  PerformancePairComparison,
} from "./engine/performance-epoch.js";
export {
  PERFORMANCE_CALIBRATION_COMPARISON_COUNT,
  PERFORMANCE_EPOCH,
  PERFORMANCE_EPOCH_SCHEMA_VERSION,
  PERFORMANCE_MEASUREMENT_COUNT,
  PERFORMANCE_STAGES,
  PERFORMANCE_WARMUP_COUNT,
  assertPerformanceCalibrationResult,
  assertPerformanceEpochBaseline,
  calibratePerformance,
  comparePerformance,
  createPerformanceBaselineEntry,
  findPerformanceBaselineEntry,
  getAcceptedPerformanceEpochCommit,
  parsePerformanceMeasurement,
  toPerformanceMeasurement,
} from "./engine/performance-epoch.js";
export type { FormatSingleGameDebugTraceOptions } from "./engine/debug-trace.js";
export { formatSingleGameDebugTrace } from "./engine/debug-trace.js";
export {
  formatMassSimulationSummary,
  formatSingleGameSummary,
  runSimulationMenu,
} from "./cli/simulation-menu.js";
