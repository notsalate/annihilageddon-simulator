import {
  ActionExecutionError,
  applyAction,
  listLegalActions,
  type ActionResult,
  type LegalAction,
} from "./actions.js";
import { isTrustedReadOnlyPolicy } from "./best-move-policy-trust.js";
import {
  capturePhysicalCardLocationSnapshot,
  countPhysicalCardLocationChanges,
} from "./control-ledger.js";
import { forkGameState, forkGameStateForAnalyzer } from "./game-state-fork.js";
import type { ChoicePolicy, EffectChoiceRequest } from "./choice-policy.js";
import type { GameState } from "./setup.js";

export interface AnalysisLimits {
  maxChoiceDepth: number;
  maxBranchesPerAction: number;
  maxActionsPerLine: number;
  maxTurnLines: number;
}

export type AnalyzerDiagnosticPhase = "enumeration" | "ranking";

export interface AnalyzerDiagnosticOperationCounters {
  actionApplications: number;
  gameStateClones: number;
  choicePathReplays: number;
  choicePathExpansions: number;
  choiceBranchesGenerated: number;
  intermediateStates: number;
  terminalStates: number;
  pathCopyOperations: number;
  pathItemsCopied: number;
  eventLogCopyOperations: number;
  eventLogEntriesCopied: number;
  pointLocationSearches: number;
  physicalZonePasses: number;
  physicalCardsViewed: number;
  fullLocationListsBuilt: number;
  locationRecordsCreated: number;
  physicalLocationChanges: number;
}

export interface AnalyzerDiagnosticBranchSearchDistribution {
  branchAttempts: number;
  totalPointLocationSearches: number;
  averagePointLocationSearches: number;
  buckets: {
    zero: number;
    one: number;
    twoToThree: number;
    fourToSeven: number;
    eightOrMore: number;
  };
}

export interface AnalyzerDiagnosticEvaluationPolicyCounters {
  invocations: number;
  timeMs: number;
  operations: AnalyzerDiagnosticOperationCounters;
  isolatedStateClones: number;
  isolatedPathCopyOperations: number;
  isolatedPathItemsCopied: number;
  isolatedEventLogCopyOperations: number;
  isolatedEventLogEntriesCopied: number;
}

export interface AnalyzerDiagnosticCounters {
  total: AnalyzerDiagnosticOperationCounters;
  branchSearchDistribution: AnalyzerDiagnosticBranchSearchDistribution;
  phases: {
    enumeration: AnalyzerDiagnosticOperationCounters;
    ranking: AnalyzerDiagnosticOperationCounters;
    evaluationPolicy: AnalyzerDiagnosticEvaluationPolicyCounters;
  };
}

export interface AnalyzerDiagnosticsOptions {
  now?: () => number;
}

type MutableAnalyzerDiagnosticCounters = {
  total: AnalyzerDiagnosticOperationCounters;
  phases: {
    enumeration: AnalyzerDiagnosticOperationCounters;
    ranking: AnalyzerDiagnosticOperationCounters;
    evaluationPolicy: AnalyzerDiagnosticEvaluationPolicyCounters;
  };
};

function createOperationCounters(): AnalyzerDiagnosticOperationCounters {
  return {
    actionApplications: 0,
    gameStateClones: 0,
    choicePathReplays: 0,
    choicePathExpansions: 0,
    choiceBranchesGenerated: 0,
    intermediateStates: 0,
    terminalStates: 0,
    pathCopyOperations: 0,
    pathItemsCopied: 0,
    eventLogCopyOperations: 0,
    eventLogEntriesCopied: 0,
    pointLocationSearches: 0,
    physicalZonePasses: 0,
    physicalCardsViewed: 0,
    fullLocationListsBuilt: 0,
    locationRecordsCreated: 0,
    physicalLocationChanges: 0,
  };
}

function createEvaluationPolicyCounters(): AnalyzerDiagnosticEvaluationPolicyCounters {
  return {
    invocations: 0,
    timeMs: 0,
    operations: createOperationCounters(),
    isolatedStateClones: 0,
    isolatedPathCopyOperations: 0,
    isolatedPathItemsCopied: 0,
    isolatedEventLogCopyOperations: 0,
    isolatedEventLogEntriesCopied: 0,
  };
}

/** Collects optional Analyzer work counters without changing the analysis contract. */
export class AnalyzerDiagnosticsSession {
  private readonly counters: MutableAnalyzerDiagnosticCounters = {
    total: createOperationCounters(),
    phases: {
      enumeration: createOperationCounters(),
      ranking: createOperationCounters(),
      evaluationPolicy: createEvaluationPolicyCounters(),
    },
  };

  private readonly now: () => number;
  private branchSearchAttempts = 0;
  private branchSearchTotal = 0;
  private readonly branchSearchBuckets = {
    zero: 0,
    one: 0,
    twoToThree: 0,
    fourToSeven: 0,
    eightOrMore: 0,
  };
  private activeBranchPointLocationSearches: number | undefined;
  private currentPhase:
    | AnalyzerDiagnosticPhase
    | "evaluationPolicy"
    | undefined;

  constructor(options: AnalyzerDiagnosticsOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  withPhase<T>(phase: AnalyzerDiagnosticPhase, operation: () => T): T {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;
    try {
      return operation();
    } finally {
      this.currentPhase = previousPhase;
    }
  }

  measureEvaluationPolicy<T>(operation: () => T): T {
    const previousPhase = this.currentPhase;
    this.currentPhase = "evaluationPolicy";
    const startedAt = this.now();
    this.counters.phases.evaluationPolicy.invocations += 1;
    try {
      return operation();
    } finally {
      this.counters.phases.evaluationPolicy.timeMs += Math.max(
        0,
        this.now() - startedAt
      );
      this.currentPhase = previousPhase;
    }
  }

  recordActionApplication(isChoicePathReplay: boolean): void {
    this.activeBranchPointLocationSearches = 0;
    this.incrementOperation("actionApplications");
    if (isChoicePathReplay) {
      this.incrementOperation("choicePathReplays");
    }
  }

  completeActionApplication(): void {
    if (this.activeBranchPointLocationSearches === undefined) return;
    this.recordBranchSearchCount(this.activeBranchPointLocationSearches);
    this.activeBranchPointLocationSearches = undefined;
  }

  recordPointLocationSearch(): void {
    this.incrementOperation("pointLocationSearches");
    if (this.activeBranchPointLocationSearches !== undefined) {
      this.activeBranchPointLocationSearches += 1;
    }
  }

  recordPhysicalZonePass(cardsViewed: number): void {
    this.incrementOperation("physicalZonePasses");
    this.incrementOperation("physicalCardsViewed", cardsViewed);
  }

  recordFullLocationList(locationRecords: number): void {
    this.incrementOperation("fullLocationListsBuilt");
    this.incrementOperation("locationRecordsCreated", locationRecords);
  }

  recordPhysicalLocationChanges(changes: number): void {
    this.incrementOperation("physicalLocationChanges", changes);
  }

  recordChoicePathExpansion(branchCount: number): void {
    this.incrementOperation("choicePathExpansions");
    this.incrementOperation("choiceBranchesGenerated", branchCount);
  }

  recordGameStateClone(
    source: Readonly<GameState>,
    isolatedForEvaluationPolicy = false,
    eventLogWasCloned = true
  ): void {
    this.incrementOperation("gameStateClones");
    if (eventLogWasCloned) {
      this.recordEventLogCopy(
        source.eventLog.length,
        isolatedForEvaluationPolicy
      );
    }
    if (isolatedForEvaluationPolicy) {
      this.counters.phases.evaluationPolicy.isolatedStateClones += 1;
    }
  }

  recordStateResult(terminal: boolean): void {
    this.incrementOperation(terminal ? "terminalStates" : "intermediateStates");
  }

  recordPathCopy(
    itemsCopied: number,
    isolatedForEvaluationPolicy = false
  ): void {
    this.incrementOperation("pathCopyOperations");
    this.incrementOperation("pathItemsCopied", itemsCopied);
    if (isolatedForEvaluationPolicy) {
      this.counters.phases.evaluationPolicy.isolatedPathCopyOperations += 1;
      this.counters.phases.evaluationPolicy.isolatedPathItemsCopied +=
        itemsCopied;
    }
  }

  snapshot(): AnalyzerDiagnosticCounters {
    const activeBranch = this.activeBranchPointLocationSearches;
    const branchAttempts =
      this.branchSearchAttempts + (activeBranch === undefined ? 0 : 1);
    const totalPointLocationSearches =
      this.branchSearchTotal + (activeBranch ?? 0);
    const buckets = { ...this.branchSearchBuckets };
    if (activeBranch !== undefined) {
      incrementBranchSearchBucket(buckets, activeBranch);
    }
    return {
      total: { ...this.counters.total },
      branchSearchDistribution: {
        branchAttempts,
        totalPointLocationSearches,
        averagePointLocationSearches:
          branchAttempts === 0
            ? 0
            : totalPointLocationSearches / branchAttempts,
        buckets,
      },
      phases: {
        enumeration: { ...this.counters.phases.enumeration },
        ranking: { ...this.counters.phases.ranking },
        evaluationPolicy: {
          ...this.counters.phases.evaluationPolicy,
          operations: { ...this.counters.phases.evaluationPolicy.operations },
        },
      },
    };
  }

  private recordEventLogCopy(
    entriesCopied: number,
    isolatedForEvaluationPolicy: boolean
  ): void {
    this.incrementOperation("eventLogCopyOperations");
    this.incrementOperation("eventLogEntriesCopied", entriesCopied);
    if (isolatedForEvaluationPolicy) {
      this.counters.phases.evaluationPolicy.isolatedEventLogCopyOperations += 1;
      this.counters.phases.evaluationPolicy.isolatedEventLogEntriesCopied +=
        entriesCopied;
    }
  }

  private incrementOperation(
    name: keyof AnalyzerDiagnosticOperationCounters,
    amount = 1
  ): void {
    this.counters.total[name] += amount;
    if (this.currentPhase === "enumeration") {
      this.counters.phases.enumeration[name] += amount;
    } else if (this.currentPhase === "ranking") {
      this.counters.phases.ranking[name] += amount;
    } else if (this.currentPhase === "evaluationPolicy") {
      this.counters.phases.evaluationPolicy.operations[name] += amount;
    }
  }

  private recordBranchSearchCount(searches: number): void {
    this.branchSearchAttempts += 1;
    this.branchSearchTotal += searches;
    incrementBranchSearchBucket(this.branchSearchBuckets, searches);
  }
}

function incrementBranchSearchBucket(
  buckets: AnalyzerDiagnosticBranchSearchDistribution["buckets"],
  searches: number
): void {
  if (searches === 0) {
    buckets.zero += 1;
  } else if (searches === 1) {
    buckets.one += 1;
  } else if (searches <= 3) {
    buckets.twoToThree += 1;
  } else if (searches <= 7) {
    buckets.fourToSeven += 1;
  } else {
    buckets.eightOrMore += 1;
  }
}

export function createAnalyzerDiagnostics(
  options: AnalyzerDiagnosticsOptions = {}
): AnalyzerDiagnosticsSession {
  return new AnalyzerDiagnosticsSession(options);
}

export interface AnalysisChoiceSelection {
  requestIndex: number;
  effectId: EffectChoiceRequest["effectId"];
  sourceType: EffectChoiceRequest["sourceType"];
  cardInstanceId: string;
  definitionId: string;
  choiceIndex: number;
  choiceId: string;
  choiceKind: EffectChoiceRequest["choices"][number]["choiceKind"];
}

export interface CompletedActionBranch {
  legalAction: LegalAction;
  legalActionIndex: number;
  selectedChoices: AnalysisChoiceSelection[];
  result: Extract<ActionResult, { ok: true }>;
  resultingState: GameState;
}

export interface AnalysisActionStep {
  legalActionIndex: number;
  action: LegalAction;
  selectedChoices: AnalysisChoiceSelection[];
}

export interface AnalyzedTurnLine {
  initialPlayerId: GameState["activePlayerId"];
  initialTurnNumber: number;
  steps: AnalysisActionStep[];
  terminalReason: "endTurn" | "gameEnd";
  gameEndReason?: Extract<ActionResult, { ok: true }>["gameEndReason"];
  gameEndReasons?: Extract<ActionResult, { ok: true }>["gameEndReasons"];
  winnerPlayerId?: Extract<ActionResult, { ok: true }>["winnerPlayerId"];
  terminalState: GameState;
}

export interface TurnLineEvaluationContext {
  readonly sourceState: Readonly<GameState>;
  readonly line: Readonly<AnalyzedTurnLine>;
  readonly perspectivePlayerId: GameState["activePlayerId"];
}

export interface TurnLineEvaluation {
  readonly score: number;
  readonly components?: Readonly<Record<string, number>>;
}

export interface TurnLineEvaluationPolicy {
  readonly id: string;
  readonly evaluate: (context: TurnLineEvaluationContext) => TurnLineEvaluation;
}

export interface RankedTurnLine {
  readonly line: AnalyzedTurnLine;
  readonly enumerationIndex: number;
  readonly score: number;
  readonly components?: Readonly<Record<string, number>>;
  readonly rank: number;
}

export interface RankedTurnLinesResult {
  readonly criterionId: string;
  readonly perspectivePlayerId: GameState["activePlayerId"];
  readonly rankedLines: readonly RankedTurnLine[];
  readonly best: RankedTurnLine | undefined;
}

export class AnalysisError extends Error {
  override name = "AnalysisError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class AnalysisLimitError extends AnalysisError {
  override name = "AnalysisLimitError";
}

interface ChoicePrefix {
  selections: AnalysisChoiceSelection[];
}

class ExpandChoicePath extends Error {
  constructor(
    readonly requestIndex: number,
    readonly request: EffectChoiceRequest
  ) {
    super("Analyzer choice path expansion");
  }
}

const DEFAULT_ANALYSIS_LIMITS: AnalysisLimits = {
  maxChoiceDepth: 32,
  maxBranchesPerAction: 4096,
  maxActionsPerLine: 128,
  maxTurnLines: 100_000,
};

/** Enumerates paths with depth-first replay; choices and actions retain source order. */
export function enumerateActionBranches(
  source: GameState,
  action: LegalAction,
  legalActionIndex: number,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS,
  diagnostics?: AnalyzerDiagnosticsSession
): CompletedActionBranch[] {
  const operation = () =>
    enumerateActionBranchesCore(
      source,
      action,
      legalActionIndex,
      limits,
      diagnostics
    );
  return diagnostics === undefined
    ? operation()
    : diagnostics.withPhase("enumeration", operation);
}

function enumerateActionBranchesCore(
  source: GameState,
  action: LegalAction,
  legalActionIndex: number,
  limits: AnalysisLimits,
  diagnostics: AnalyzerDiagnosticsSession | undefined
): CompletedActionBranch[] {
  validateLimits(limits);
  const pending: ChoicePrefix[] = [{ selections: [] }];
  const completed: CompletedActionBranch[] = [];
  let generatedBranches = 0;

  while (pending.length > 0) {
    const prefix = pending.pop()!;
    diagnostics?.recordActionApplication(prefix.selections.length > 0);
    const fork =
      diagnostics === undefined
        ? forkAnalyzerState(source, diagnostics)
        : withPhysicalCardDiagnostics([source], diagnostics, () =>
            forkAnalyzerState(source, diagnostics)
          );
    const locationSnapshot =
      diagnostics === undefined
        ? undefined
        : capturePhysicalCardLocationSnapshot(fork);
    const consumed = new Set<number>();
    let requestIndex = 0;
    fork.effectChoiceStrategy = (request) => {
      if (request.requestKind === "setup") {
        throw new AnalysisError(
          "Setup choice unexpectedly reached current-turn analysis"
        );
      }
      const effectRequest: EffectChoiceRequest = request;
      const selection = prefix.selections.find(
        (candidate) => candidate.requestIndex === requestIndex
      );
      const currentRequestIndex = requestIndex;
      requestIndex += 1;
      if (selection === undefined) {
        if (effectRequest.choices.length === 0) {
          return undefined;
        }
        throw new ExpandChoicePath(currentRequestIndex, effectRequest);
      }
      consumed.add(selection.requestIndex);
      validateSelection(selection, effectRequest, action, currentRequestIndex);
      const choice = effectRequest.choices[selection.choiceIndex];
      if (choice === undefined) {
        throw replayError(
          action,
          prefix,
          `choice index ${selection.choiceIndex} is out of range`
        );
      }
      const replaySelection = {
        choiceId: choice.choiceId,
        choiceIndex: selection.choiceIndex,
      };
      return replaySelection;
    };

    try {
      const result = applyAction(fork, action);
      if (!result.ok) {
        throw new AnalysisError(
          `Analysis failed for action ${describeAction(action)} and choice path ${describePrefix(prefix)}: ${result.error}`
        );
      }
      if (
        consumed.size !== prefix.selections.length ||
        prefix.selections.some(
          (selection) => !consumed.has(selection.requestIndex)
        )
      ) {
        throw replayError(action, prefix, "choice path was not fully consumed");
      }
      completed.push({
        legalAction: action,
        legalActionIndex,
        selectedChoices: prefix.selections,
        result,
        resultingState: fork,
      });
      diagnostics?.recordStateResult(
        action.type === "endTurn" || result.gameEndReason !== undefined
      );
    } catch (error) {
      const choiceExpansion =
        error instanceof ActionExecutionError &&
        error.cause instanceof ExpandChoicePath
          ? error.cause
          : error instanceof ExpandChoicePath
            ? error
            : undefined;
      if (
        choiceExpansion === undefined &&
        error instanceof ActionExecutionError
      ) {
        throw new AnalysisError(
          `Analysis failed for action ${describeAction(action)} and choice path ${describePrefix(prefix)}: ${error.message}`,
          { cause: error }
        );
      }
      if (choiceExpansion === undefined) {
        throw error;
      }
      if (choiceExpansion.request.choices.length === 0) {
        throw replayError(action, prefix, "empty choice request cannot expand");
      }
      if (prefix.selections.length >= limits.maxChoiceDepth) {
        throw new AnalysisLimitError(
          `Analysis choice depth exceeded ${limits.maxChoiceDepth} for action ${describeAction(action)}`
        );
      }
      const next = choiceExpansion.request.choices.map(
        (choice, choiceIndex) => ({
          selections: [
            ...prefix.selections,
            {
              requestIndex: choiceExpansion.requestIndex,
              effectId: choiceExpansion.request.effectId,
              sourceType: choiceExpansion.request.sourceType,
              cardInstanceId: choiceExpansion.request.cardInstanceId,
              definitionId: choiceExpansion.request.definitionId,
              choiceIndex,
              choiceId: choice.choiceId,
              choiceKind: choice.choiceKind,
            },
          ],
        })
      );
      diagnostics?.recordChoicePathExpansion(next.length);
      diagnostics?.recordPathCopy(
        next.reduce(
          (total, candidate) => total + candidate.selections.length,
          0
        )
      );
      generatedBranches += next.length;
      if (generatedBranches > limits.maxBranchesPerAction) {
        throw new AnalysisLimitError(
          `Analysis branch limit exceeded ${limits.maxBranchesPerAction} for action ${describeAction(action)}`
        );
      }
      // Stack order is reversed so pop() processes the stable array order.
      pending.push(...next.reverse());
    } finally {
      try {
        if (diagnostics !== undefined && locationSnapshot !== undefined) {
          diagnostics.recordPhysicalLocationChanges(
            countPhysicalCardLocationChanges(
              locationSnapshot,
              capturePhysicalCardLocationSnapshot(fork)
            )
          );
        }
      } finally {
        if (diagnostics !== undefined) {
          delete fork.physicalCardDiagnostics;
        }
        diagnostics?.completeActionApplication();
      }
    }
  }

  return completed;
}

export function enumerateImmediateActionBranches(
  state: GameState,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS,
  diagnostics?: AnalyzerDiagnosticsSession
): CompletedActionBranch[] {
  const legalActions =
    diagnostics === undefined
      ? listLegalActions(state)
      : withPhysicalCardDiagnostics([state], diagnostics, () =>
          listLegalActions(state)
        );
  return legalActions.flatMap((action, legalActionIndex) =>
    enumerateActionBranches(
      state,
      action,
      legalActionIndex,
      limits,
      diagnostics
    )
  );
}

/** Enumerates the current player's legal histories until endTurn or game end. */
export function enumerateTurnLines(
  source: GameState,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS,
  diagnostics?: AnalyzerDiagnosticsSession
): AnalyzedTurnLine[] {
  const operation = (): AnalyzedTurnLine[] => {
    validateLimits(limits);
    const initialPlayerId = source.activePlayerId;
    const initialTurnNumber = source.turn.number;
    const lines: AnalyzedTurnLine[] = [];

    const visit = (
      state: GameState,
      steps: AnalysisActionStep[],
      visitedEffectiveTypeSelections: ReadonlySet<string> | undefined
    ): void => {
      const legalActions =
        diagnostics === undefined
          ? listLegalActions(state)
          : withPhysicalCardDiagnostics([state], diagnostics, () =>
              listLegalActions(state)
            );
      for (const [legalActionIndex, action] of legalActions.entries()) {
        if (steps.length + 1 > limits.maxActionsPerLine) {
          throw new AnalysisLimitError(
            `Analysis action limit exceeded ${limits.maxActionsPerLine} after ${steps.length} steps; last action ${describeAction(action)}`
          );
        }
        const branches = enumerateActionBranches(
          state,
          action,
          legalActionIndex,
          limits,
          diagnostics
        );
        for (const branch of branches) {
          const nextSteps = [
            ...steps,
            {
              legalActionIndex: branch.legalActionIndex,
              action: branch.legalAction,
              selectedChoices: branch.selectedChoices,
            },
          ];
          diagnostics?.recordPathCopy(nextSteps.length);
          if (
            action.type !== "endTurn" &&
            (branch.resultingState.activePlayerId !== initialPlayerId ||
              branch.resultingState.turn.number !== initialTurnNumber)
          ) {
            throw new AnalysisError(
              `Analysis engine contract violated after action ${describeAction(action)}: active player or turn changed`
            );
          }
          const terminalReason =
            action.type === "endTurn"
              ? "endTurn"
              : branch.result.gameEndReason !== undefined
                ? "gameEnd"
                : undefined;
          if (terminalReason !== undefined) {
            if (lines.length >= limits.maxTurnLines) {
              throw new AnalysisLimitError(
                `Analysis turn-line limit exceeded ${limits.maxTurnLines}; last action ${describeAction(action)}`
              );
            }
            lines.push({
              initialPlayerId,
              initialTurnNumber,
              steps: nextSteps,
              terminalReason,
              ...(branch.result.gameEndReason === undefined
                ? {}
                : { gameEndReason: branch.result.gameEndReason }),
              ...(branch.result.gameEndReasons === undefined
                ? {}
                : { gameEndReasons: [...branch.result.gameEndReasons] }),
              ...(branch.result.winnerPlayerId === undefined
                ? {}
                : { winnerPlayerId: branch.result.winnerPlayerId }),
              terminalState: branch.resultingState,
            });
            continue;
          }

          // Effective-type changes are the only reversible non-terminal action;
          // track only their contiguous run so cycle protection stays cheap.
          if (action.type !== "setCardEffectiveType") {
            visit(branch.resultingState, nextSteps, undefined);
            continue;
          }

          const currentSelectionKey = getEffectiveTypeSelectionKey(state);
          const nextSelectionKey = getEffectiveTypeSelectionKey(
            branch.resultingState
          );
          const currentPathSelections =
            visitedEffectiveTypeSelections ?? new Set([currentSelectionKey]);
          if (currentPathSelections.has(nextSelectionKey)) {
            continue;
          }
          const nextPathSelections = new Set(currentPathSelections);
          nextPathSelections.add(nextSelectionKey);
          visit(branch.resultingState, nextSteps, nextPathSelections);
        }
      }
    };

    visit(source, [], undefined);
    return lines;
  };
  return diagnostics === undefined
    ? operation()
    : diagnostics.withPhase("enumeration", operation);
}

/** Replays one analyzed line from its original state and selected choices. */
export function replayAnalyzedTurnLine(
  source: GameState,
  line: AnalyzedTurnLine
): GameState {
  if (
    source.activePlayerId !== line.initialPlayerId ||
    source.turn.number !== line.initialTurnNumber
  ) {
    throw new AnalysisError(
      "Analysis replay requires the source player and turn to match the line"
    );
  }

  const replay = forkGameState(source);
  for (const [stepIndex, step] of line.steps.entries()) {
    replayActionStep(replay, step.action, step.selectedChoices, stepIndex);
  }
  return replay;
}

function replayActionStep(
  state: GameState,
  action: LegalAction,
  selections: readonly AnalysisChoiceSelection[],
  stepIndex: number
): Extract<ActionResult, { ok: true }> {
  let requestIndex = 0;
  const replayChoicePolicy: ChoicePolicy = (request) => {
    if (request.requestKind === "setup") {
      throw new AnalysisError(
        `Analysis replay reached setup choice at step ${stepIndex}`
      );
    }

    const currentRequestIndex = requestIndex;
    const selection = selections[requestIndex];
    requestIndex += 1;
    if (selection === undefined) {
      if (request.choices.length === 0) {
        return undefined;
      }
      throw replayError(
        action,
        { selections: [] },
        "choice path ended before the request was consumed"
      );
    }

    validateSelection(selection, request, action, currentRequestIndex);
    return {
      choiceId: selection.choiceId,
      choiceIndex: selection.choiceIndex,
    };
  };
  state.effectChoiceStrategy = replayChoicePolicy;

  let result: ActionResult;
  try {
    result = applyAction(state, action);
  } catch (error) {
    if (error instanceof ActionExecutionError) {
      throw new AnalysisError(
        `Analysis replay failed at step ${stepIndex} for action ${describeAction(action)}: ${error.message}`,
        { cause: error }
      );
    }
    throw error;
  }
  if (!result.ok) {
    throw new AnalysisError(
      `Analysis replay failed at step ${stepIndex} for action ${describeAction(action)}: ${result.error}`
    );
  }
  if (requestIndex !== selections.length) {
    throw replayError(
      action,
      { selections: [...selections] },
      "choice path was not fully consumed"
    );
  }
  return result;
}

export function rankTurnLines(
  sourceState: GameState,
  lines: readonly AnalyzedTurnLine[],
  policy: TurnLineEvaluationPolicy,
  perspectivePlayerId: GameState["activePlayerId"],
  diagnostics?: AnalyzerDiagnosticsSession
): RankedTurnLinesResult {
  const operation = (): RankedTurnLinesResult => {
    const policyIsTrustedReadOnly = isTrustedReadOnlyPolicy(policy);
    const ranked = lines.map((line, enumerationIndex) => {
      const evaluate = () => {
        const evaluationSourceState = policyIsTrustedReadOnly
          ? sourceState
          : forkAnalyzerState(sourceState, diagnostics, true);
        const evaluationLine = policyIsTrustedReadOnly
          ? line
          : cloneAnalyzedTurnLine(line, diagnostics);
        const evaluatePolicy = () =>
          policy.evaluate({
            sourceState: evaluationSourceState,
            line: evaluationLine,
            perspectivePlayerId,
          });
        return diagnostics === undefined
          ? evaluatePolicy()
          : measurePhysicalCardLocationChanges(
              [evaluationSourceState, evaluationLine.terminalState],
              diagnostics,
              evaluatePolicy
            );
      };
      const evaluation =
        diagnostics === undefined
          ? evaluate()
          : diagnostics.measureEvaluationPolicy(evaluate);
      assertFiniteEvaluation(
        policy.id,
        enumerationIndex,
        evaluation.score,
        "score"
      );
      if (evaluation.components !== undefined) {
        for (const [name, value] of Object.entries(evaluation.components)) {
          assertFiniteEvaluation(
            policy.id,
            enumerationIndex,
            value,
            `component ${name}`
          );
        }
      }
      return {
        line,
        enumerationIndex,
        score: evaluation.score,
        ...(evaluation.components === undefined
          ? {}
          : { components: evaluation.components }),
        rank: 0,
      } satisfies RankedTurnLine;
    });

    ranked.sort(
      (left, right) =>
        right.score - left.score ||
        left.enumerationIndex - right.enumerationIndex
    );
    const rankedLines = ranked.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
    return {
      criterionId: policy.id,
      perspectivePlayerId,
      rankedLines,
      best: rankedLines[0],
    };
  };
  return diagnostics === undefined
    ? operation()
    : withPhysicalCardDiagnostics(
        [sourceState, ...lines.map((line) => line.terminalState)],
        diagnostics,
        () => diagnostics.withPhase("ranking", operation)
      );
}

function withPhysicalCardDiagnostics<T>(
  states: readonly GameState[],
  diagnostics: AnalyzerDiagnosticsSession,
  operation: () => T
): T {
  const uniqueStates = [...new Set(states)];
  const previousDiagnostics = uniqueStates.map(
    (state) => state.physicalCardDiagnostics
  );
  for (const state of uniqueStates) {
    state.physicalCardDiagnostics = diagnostics;
  }
  try {
    return operation();
  } finally {
    for (const [index, state] of uniqueStates.entries()) {
      const previous = previousDiagnostics[index];
      if (previous === undefined) {
        delete state.physicalCardDiagnostics;
      } else {
        state.physicalCardDiagnostics = previous;
      }
    }
  }
}

function measurePhysicalCardLocationChanges<T>(
  states: readonly GameState[],
  diagnostics: AnalyzerDiagnosticsSession,
  operation: () => T
): T {
  const uniqueStates = [...new Set(states)];
  const snapshots = uniqueStates.map(capturePhysicalCardLocationSnapshot);
  try {
    return operation();
  } finally {
    for (const [index, state] of uniqueStates.entries()) {
      const before = snapshots[index];
      if (before === undefined) continue;
      diagnostics.recordPhysicalLocationChanges(
        countPhysicalCardLocationChanges(
          before,
          capturePhysicalCardLocationSnapshot(state)
        )
      );
    }
  }
}

function forkAnalyzerState(
  source: GameState,
  diagnostics: AnalyzerDiagnosticsSession | undefined,
  isolatedForEvaluationPolicy = false
): GameState {
  diagnostics?.recordGameStateClone(
    source,
    isolatedForEvaluationPolicy,
    isolatedForEvaluationPolicy
  );
  return isolatedForEvaluationPolicy
    ? forkGameState(source)
    : forkGameStateForAnalyzer(source);
}

function cloneAnalyzedTurnLine(
  line: AnalyzedTurnLine,
  diagnostics?: AnalyzerDiagnosticsSession
): AnalyzedTurnLine {
  diagnostics?.recordPathCopy(
    line.steps.reduce(
      (total, step) => total + 1 + step.selectedChoices.length,
      0
    ),
    true
  );
  return {
    initialPlayerId: line.initialPlayerId,
    initialTurnNumber: line.initialTurnNumber,
    steps: line.steps.map((step) => ({
      legalActionIndex: step.legalActionIndex,
      action: { ...step.action },
      selectedChoices: step.selectedChoices.map((choice) => ({ ...choice })),
    })),
    terminalReason: line.terminalReason,
    ...(line.gameEndReason === undefined
      ? {}
      : { gameEndReason: line.gameEndReason }),
    ...(line.gameEndReasons === undefined
      ? {}
      : { gameEndReasons: [...line.gameEndReasons] }),
    ...(line.winnerPlayerId === undefined
      ? {}
      : { winnerPlayerId: line.winnerPlayerId }),
    terminalState: forkAnalyzerState(line.terminalState, diagnostics, true),
  };
}

function getEffectiveTypeSelectionKey(state: GameState): string {
  const activePlayer = state.players.find(
    (player) => player.playerId === state.activePlayerId
  );
  if (activePlayer === undefined) {
    return "<missing-active-player>";
  }
  const selections: Array<[string, string]> =
    activePlayer.effectiveCardTypeSelections.map(
      ({ cardInstanceId, cardType }) => [cardInstanceId, cardType]
    );
  return JSON.stringify(
    selections.sort(([leftCardId, leftType], [rightCardId, rightType]) =>
      leftCardId === rightCardId
        ? leftType.localeCompare(rightType)
        : leftCardId.localeCompare(rightCardId)
    )
  );
}

function assertFiniteEvaluation(
  policyId: string,
  enumerationIndex: number,
  value: number,
  label: string
): void {
  if (!Number.isFinite(value)) {
    throw new AnalysisError(
      `Evaluation policy ${policyId} returned non-finite ${label} at enumeration index ${enumerationIndex}`
    );
  }
}

function validateSelection(
  selection: AnalysisChoiceSelection,
  request: EffectChoiceRequest,
  action: LegalAction,
  requestIndex: number
): void {
  if (
    selection.requestIndex !== requestIndex ||
    selection.effectId !== request.effectId ||
    selection.sourceType !== request.sourceType ||
    selection.cardInstanceId !== request.cardInstanceId ||
    selection.definitionId !== request.definitionId
  ) {
    throw replayError(
      action,
      { selections: [selection] },
      "choice request metadata changed"
    );
  }
  const choice = request.choices[selection.choiceIndex];
  if (
    choice === undefined ||
    choice.choiceId !== selection.choiceId ||
    choice.choiceKind !== selection.choiceKind
  ) {
    throw replayError(
      action,
      { selections: [selection] },
      "choice metadata changed"
    );
  }
}

function validateLimits(limits: AnalysisLimits): void {
  if (
    !Number.isSafeInteger(limits.maxChoiceDepth) ||
    limits.maxChoiceDepth < 0 ||
    !Number.isSafeInteger(limits.maxBranchesPerAction) ||
    limits.maxBranchesPerAction < 1 ||
    !Number.isSafeInteger(limits.maxActionsPerLine) ||
    limits.maxActionsPerLine < 1 ||
    !Number.isSafeInteger(limits.maxTurnLines) ||
    limits.maxTurnLines < 1
  ) {
    throw new AnalysisLimitError(
      "Analysis limits must be safe positive integers"
    );
  }
}

function replayError(
  action: LegalAction,
  prefix: ChoicePrefix,
  reason: string
): AnalysisError {
  return new AnalysisError(
    `Analysis replay failed for action ${describeAction(action)} and choice path ${describePrefix(prefix)}: ${reason}`
  );
}

function describePrefix(prefix: ChoicePrefix): string {
  return JSON.stringify(
    prefix.selections.map(
      ({ requestIndex, choiceIndex, choiceId, choiceKind }) => ({
        requestIndex,
        choiceIndex,
        choiceId,
        choiceKind,
      })
    )
  );
}

function describeAction(action: LegalAction): string {
  return JSON.stringify(action);
}
