import {
  applyAction,
  listLegalActions,
  type ActionResult,
  type LegalAction,
} from "./actions.js";
import { forkGameState } from "./game-state-fork.js";
import type { GameState, RuntimeEffectChoiceRequest } from "./setup.js";

export interface AnalysisLimits {
  maxChoiceDepth: number;
  maxBranchesPerAction: number;
  maxActionsPerLine: number;
  maxTurnLines: number;
}

export interface AnalysisChoiceSelection {
  requestIndex: number;
  effectId: RuntimeEffectChoiceRequest["effectId"];
  sourceType: RuntimeEffectChoiceRequest["sourceType"];
  cardInstanceId: string;
  definitionId: string;
  choiceIndex: number;
  choiceId: string;
  choiceKind: RuntimeEffectChoiceRequest["choices"][number]["choiceKind"];
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
  winnerPlayerId?: Extract<ActionResult, { ok: true }>["winnerPlayerId"];
  terminalState: GameState;
}

/** Internal action boundary shared by the production walk and fixture tests. */
export interface TurnLineActionAdapter {
  listLegalActions(state: GameState): readonly LegalAction[];
  enumerateActionBranches(
    state: GameState,
    action: LegalAction,
    legalActionIndex: number,
    limits: AnalysisLimits
  ): CompletedActionBranch[];
}

export interface TurnLineEvaluationContext {
  readonly sourceState: Readonly<GameState>;
  readonly line: Readonly<AnalyzedTurnLine>;
  readonly perspectivePlayerId: GameState["activePlayerId"];
}

export interface TurnLineEvaluation {
  readonly score: number;
  /** Orders outcomes before score; higher values win. */
  readonly rankPriority?: number;
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

type PendingRankedTurnLine = RankedTurnLine & {
  readonly rankPriority: number;
};

export class AnalysisError extends Error {
  override name = "AnalysisError";
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
    readonly request: RuntimeEffectChoiceRequest
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

const engineTurnLineActionAdapter: TurnLineActionAdapter = {
  listLegalActions,
  enumerateActionBranches,
};

/** Enumerates paths with depth-first replay; choices and actions retain source order. */
export function enumerateActionBranches(
  source: GameState,
  action: LegalAction,
  legalActionIndex: number,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS
): CompletedActionBranch[] {
  validateLimits(limits);
  const pending: ChoicePrefix[] = [{ selections: [] }];
  const completed: CompletedActionBranch[] = [];
  let generatedBranches = 0;

  while (pending.length > 0) {
    const prefix = pending.pop()!;
    const fork = forkGameState(source);
    const consumed = new Set<number>();
    let requestIndex = 0;
    fork.effectChoiceStrategy = (request) => {
      const selection = prefix.selections.find(
        (candidate) => candidate.requestIndex === requestIndex
      );
      const currentRequestIndex = requestIndex;
      requestIndex += 1;
      if (selection === undefined) {
        if (request.choices.length === 0) {
          return undefined;
        }
        throw new ExpandChoicePath(currentRequestIndex, request);
      }
      consumed.add(selection.requestIndex);
      validateSelection(selection, request, action, currentRequestIndex);
      const choice = request.choices[selection.choiceIndex];
      if (choice === undefined) {
        throw replayError(
          action,
          prefix,
          `choice index ${selection.choiceIndex} is out of range`
        );
      }
      return choice;
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
    } catch (error) {
      if (!(error instanceof ExpandChoicePath)) {
        throw error;
      }
      if (error.request.choices.length === 0) {
        throw replayError(action, prefix, "empty choice request cannot expand");
      }
      if (prefix.selections.length >= limits.maxChoiceDepth) {
        throw new AnalysisLimitError(
          `Analysis choice depth exceeded ${limits.maxChoiceDepth} for action ${describeAction(action)}`
        );
      }
      const next = error.request.choices.map((choice, choiceIndex) => ({
        selections: [
          ...prefix.selections,
          {
            requestIndex: error.requestIndex,
            effectId: error.request.effectId,
            sourceType: error.request.sourceType,
            cardInstanceId: error.request.cardInstanceId,
            definitionId: error.request.definitionId,
            choiceIndex,
            choiceId: choice.choiceId,
            choiceKind: choice.choiceKind,
          },
        ],
      }));
      generatedBranches += next.length;
      if (generatedBranches > limits.maxBranchesPerAction) {
        throw new AnalysisLimitError(
          `Analysis branch limit exceeded ${limits.maxBranchesPerAction} for action ${describeAction(action)}`
        );
      }
      // Stack order is reversed so pop() processes the stable array order.
      pending.push(...next.reverse());
    }
  }

  return completed;
}

export function enumerateImmediateActionBranches(
  state: GameState,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS
): CompletedActionBranch[] {
  return listLegalActions(state).flatMap((action, legalActionIndex) =>
    enumerateActionBranches(state, action, legalActionIndex, limits)
  );
}

/** Enumerates the current player's legal histories until endTurn or game end. */
export function enumerateTurnLines(
  source: GameState,
  limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS
): AnalyzedTurnLine[] {
  return enumerateTurnLinesWithActionAdapter(
    source,
    limits,
    engineTurnLineActionAdapter
  );
}

/** Runs the same turn-line walk against an explicit action boundary. */
export function enumerateTurnLinesWithActionAdapter(
  source: GameState,
  limits: AnalysisLimits,
  actionAdapter: TurnLineActionAdapter
): AnalyzedTurnLine[] {
  validateLimits(limits);
  const initialPlayerId = source.activePlayerId;
  const initialTurnNumber = source.turn.number;
  const lines: AnalyzedTurnLine[] = [];

  const visit = (state: GameState, steps: AnalysisActionStep[]): void => {
    for (const [legalActionIndex, action] of actionAdapter
      .listLegalActions(state)
      .entries()) {
      if (steps.length + 1 > limits.maxActionsPerLine) {
        throw new AnalysisLimitError(
          `Analysis action limit exceeded ${limits.maxActionsPerLine} after ${steps.length} steps; last action ${describeAction(action)}`
        );
      }
      const branches = actionAdapter.enumerateActionBranches(
        state,
        action,
        legalActionIndex,
        limits
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
            ...(branch.result.winnerPlayerId === undefined
              ? {}
              : { winnerPlayerId: branch.result.winnerPlayerId }),
            terminalState: branch.resultingState,
          });
          continue;
        }

        visit(branch.resultingState, nextSteps);
      }
    }
  };

  visit(source, []);
  return lines;
}

export function rankTurnLines(
  sourceState: GameState,
  lines: readonly AnalyzedTurnLine[],
  policy: TurnLineEvaluationPolicy,
  perspectivePlayerId: GameState["activePlayerId"]
): RankedTurnLinesResult {
  const ranked = lines.map((line, enumerationIndex) => {
    const evaluation = policy.evaluate({
      sourceState: forkGameState(sourceState),
      line: cloneAnalyzedTurnLine(line),
      perspectivePlayerId,
    });
    assertFiniteEvaluation(
      policy.id,
      enumerationIndex,
      evaluation.score,
      "score"
    );
    const rankPriority = evaluation.rankPriority ?? 0;
    assertFiniteEvaluation(
      policy.id,
      enumerationIndex,
      rankPriority,
      "rank priority"
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
      rankPriority,
      score: evaluation.score,
      ...(evaluation.components === undefined
        ? {}
        : { components: evaluation.components }),
      rank: 0,
    } satisfies PendingRankedTurnLine;
  });

  ranked.sort(
    (left, right) =>
      right.rankPriority - left.rankPriority ||
      right.score - left.score ||
      left.enumerationIndex - right.enumerationIndex
  );
  const rankedLines = ranked.map(
    ({ rankPriority: _rankPriority, ...entry }, index) => ({
      ...entry,
      rank: index + 1,
    })
  );
  return {
    criterionId: policy.id,
    perspectivePlayerId,
    rankedLines,
    best: rankedLines[0],
  };
}

function cloneAnalyzedTurnLine(line: AnalyzedTurnLine): AnalyzedTurnLine {
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
    ...(line.winnerPlayerId === undefined
      ? {}
      : { winnerPlayerId: line.winnerPlayerId }),
    terminalState: forkGameState(line.terminalState),
  };
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
  request: RuntimeEffectChoiceRequest,
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
