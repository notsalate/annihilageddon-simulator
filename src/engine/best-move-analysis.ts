import { applyAction, listLegalActions, type ActionResult, type LegalAction } from "./actions.js";
import { forkGameState } from "./game-state-fork.js";
import type { GameState, RuntimeEffectChoiceRequest } from "./setup.js";

export interface RuntimeEffectChoiceSummary {
  effectId: RuntimeEffectChoiceRequest["effectId"];
  sourceType: RuntimeEffectChoiceRequest["sourceType"];
  cardInstanceId: string;
  definitionId: string;
  choices: readonly {
    choiceIndex: number;
    choiceId: string;
    choiceKind: RuntimeEffectChoiceRequest["choices"][number]["choiceKind"];
  }[];
}

export interface CompletedActionBranch {
  legalAction: LegalAction;
  legalActionIndex: number;
  selectedChoices: readonly [];
  result: Extract<ActionResult, { ok: true }>;
  resultingState: GameState;
}

export interface DeferredActionBranch {
  legalAction: LegalAction;
  legalActionIndex: number;
  choiceRequest: RuntimeEffectChoiceSummary;
}

export interface ImmediateActionBranches {
  completed: CompletedActionBranch[];
  deferred: DeferredActionBranch[];
}

export function enumerateImmediateActionBranches(
  state: GameState
): ImmediateActionBranches {
  const legalActions = listLegalActions(state);
  const completed: CompletedActionBranch[] = [];
  const deferred: DeferredActionBranch[] = [];

  legalActions.forEach((legalAction, legalActionIndex) => {
    const fork = forkGameState(state);
    let firstRequest: RuntimeEffectChoiceSummary | undefined;
    fork.effectChoiceStrategy = (request) => {
      firstRequest ??= summarizeChoiceRequest(request);
      return request.choices[0];
    };

    const actionResult = applyAction(fork, legalAction);
    if (firstRequest !== undefined) {
      deferred.push({ legalAction, legalActionIndex, choiceRequest: firstRequest });
      return;
    }

    if (!actionResult.ok) {
      throw new Error(
        `Analysis failed for action ${describeAction(legalAction)}: ${actionResult.error}`
      );
    }

    completed.push({
      legalAction,
      legalActionIndex,
      selectedChoices: [],
      result: actionResult,
      resultingState: fork,
    });
  });

  return { completed, deferred };
}

function summarizeChoiceRequest(
  request: RuntimeEffectChoiceRequest
): RuntimeEffectChoiceSummary {
  return {
    effectId: request.effectId,
    sourceType: request.sourceType,
    cardInstanceId: request.cardInstanceId,
    definitionId: request.definitionId,
    choices: request.choices.map((choice, choiceIndex) => ({
      choiceIndex,
      choiceId: choice.choiceId,
      choiceKind: choice.choiceKind,
    })),
  };
}

function describeAction(action: LegalAction): string {
  return JSON.stringify(action);
}
