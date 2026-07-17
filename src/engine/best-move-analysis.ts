import { applyAction, listLegalActions, type ActionResult, type LegalAction } from "./actions.js";
import { forkGameState } from "./game-state-fork.js";
import type { GameState, RuntimeEffectChoiceRequest } from "./setup.js";

export interface AnalysisLimits {
  maxChoiceDepth: number;
  maxBranchesPerAction: number;
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
  let frontier = 1;

  while (pending.length > 0) {
    const prefix = pending.pop()!;
    frontier -= 1;
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
        throw replayError(action, prefix, `choice index ${selection.choiceIndex} is out of range`);
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
        prefix.selections.some((selection) => !consumed.has(selection.requestIndex))
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
      frontier += next.length;
      if (frontier > limits.maxBranchesPerAction) {
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
    throw replayError(action, { selections: [selection] }, "choice request metadata changed");
  }
  const choice = request.choices[selection.choiceIndex];
  if (
    choice === undefined ||
    choice.choiceId !== selection.choiceId ||
    choice.choiceKind !== selection.choiceKind
  ) {
    throw replayError(action, { selections: [selection] }, "choice metadata changed");
  }
}

function validateLimits(limits: AnalysisLimits): void {
  if (
    !Number.isSafeInteger(limits.maxChoiceDepth) ||
    limits.maxChoiceDepth < 0 ||
    !Number.isSafeInteger(limits.maxBranchesPerAction) ||
    limits.maxBranchesPerAction < 1
  ) {
    throw new AnalysisLimitError("Analysis limits must be safe positive integers");
  }
}

function replayError(action: LegalAction, prefix: ChoicePrefix, reason: string): AnalysisError {
  return new AnalysisError(
    `Analysis replay failed for action ${describeAction(action)} and choice path ${describePrefix(prefix)}: ${reason}`
  );
}

function describePrefix(prefix: ChoicePrefix): string {
  return JSON.stringify(prefix.selections.map(({ requestIndex, choiceIndex, choiceId, choiceKind }) => ({ requestIndex, choiceIndex, choiceId, choiceKind })));
}

function describeAction(action: LegalAction): string {
  return JSON.stringify(action);
}
