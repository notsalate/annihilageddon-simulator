import {
  enumerateTurnLines,
  initializeGame,
  rankTurnLines,
  type AnalysisLimits,
  type RankedTurnLine,
} from "../index.js";
import {
  getBestMovePolicy,
  type BestMoveCriterionId,
} from "../engine/best-move-policies.js";
import type { LegalAction } from "../engine/actions.js";

export interface BestMoveArgs extends AnalysisLimits {
  seed: number;
  playerCount: number;
  criterion: BestMoveCriterionId;
  top: number;
}
const defaults: BestMoveArgs = {
  seed: 60615,
  playerCount: 2,
  criterion: "victory-points",
  maxChoiceDepth: 32,
  maxBranchesPerAction: 4096,
  maxActionsPerLine: 128,
  maxTurnLines: 100000,
  top: 10,
};
export function parseBestMoveArgs(args: readonly string[]): BestMoveArgs {
  const values: Record<string, string> = {};
  const supported = new Set([
    "seed",
    "playerCount",
    "criterion",
    "maxChoiceDepth",
    "maxBranchesPerAction",
    "maxActionsPerLine",
    "maxTurnLines",
    "top",
  ]);
  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i];
    if (
      arg === undefined ||
      !arg.startsWith("--") ||
      !supported.has(arg.slice(2))
    )
      throw new Error(`Unsupported argument: ${String(arg)}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${arg} requires a value`);
    values[arg.slice(2)] = value;
  }
  const criterion = values["criterion"] ?? defaults.criterion;
  if (criterion !== "victory-points")
    throw new Error(
      `Unknown criterion "${criterion}". Available criteria: victory-points`
    );
  const parse = (key: string, fallback: number): number => {
    const raw = values[key];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw))
      throw new Error(`${key} must be a positive safe integer`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${key} must be a positive safe integer`);
    return value;
  };
  return {
    seed: parse("seed", defaults.seed),
    playerCount: parse("playerCount", defaults.playerCount),
    criterion,
    maxChoiceDepth: parse("maxChoiceDepth", defaults.maxChoiceDepth),
    maxBranchesPerAction: parse(
      "maxBranchesPerAction",
      defaults.maxBranchesPerAction
    ),
    maxActionsPerLine: parse("maxActionsPerLine", defaults.maxActionsPerLine),
    maxTurnLines: parse("maxTurnLines", defaults.maxTurnLines),
    top: parse("top", defaults.top),
  };
}

export interface BestMoveReportInput {
  seed: number;
  playerCount: number;
  initialPlayerId: string;
  initialTurnNumber: number;
  criterionId: string;
  limits: AnalysisLimits;
  top?: number;
  rankedLines: readonly RankedLineInput[];
}
export interface RankedLineInput {
  rank: number;
  score: number;
  components?: Readonly<Record<string, number>>;
  terminalReason: "endTurn" | "gameEnd";
  gameEndReason?: string;
  steps: readonly {
    action: LegalAction;
    selectedChoices: readonly {
      requestIndex: number;
      effectId: string;
      choiceIndex: number;
      choiceId: string;
      choiceKind: string;
    }[];
  }[];
}
export interface BestMoveReport {
  seed: number;
  playerCount: number;
  initialPlayerId: string;
  initialTurnNumber: number;
  criterionId: string;
  limits: AnalysisLimits;
  totalLineCount: number;
  reportedLineCount: number;
  best: BestMoveLineSummary | null;
  alternatives: BestMoveLineSummary[];
}
export interface BestMoveLineSummary {
  rank: number;
  score: number;
  components?: Readonly<Record<string, number>>;
  terminalReason: "endTurn" | "gameEnd";
  gameEndReason?: string;
  steps: readonly {
    action: Record<string, string>;
    selectedChoices: readonly {
      requestIndex: number;
      effectId: string;
      choiceIndex: number;
      choiceId: string;
      choiceKind: string;
    }[];
  }[];
}
export function formatBestMoveAnalysis(
  input: BestMoveReportInput
): BestMoveReport {
  const [bestLine, ...remainingLines] = input.rankedLines;
  const best = bestLine === undefined ? null : formatLine(bestLine);
  const alternatives = remainingLines
    .slice(0, input.top ?? remainingLines.length)
    .map(formatLine);
  return {
    seed: input.seed,
    playerCount: input.playerCount,
    initialPlayerId: input.initialPlayerId,
    initialTurnNumber: input.initialTurnNumber,
    criterionId: input.criterionId,
    limits: input.limits,
    totalLineCount: input.rankedLines.length,
    reportedLineCount: alternatives.length + (best === null ? 0 : 1),
    best,
    alternatives,
  };
}
function formatLine(line: RankedLineInput): BestMoveLineSummary {
  return {
    rank: line.rank,
    score: line.score,
    ...(line.components === undefined
      ? {}
      : { components: { ...line.components } }),
    terminalReason: line.terminalReason,
    ...(line.gameEndReason === undefined
      ? {}
      : { gameEndReason: line.gameEndReason }),
    steps: line.steps.map((step) => ({
      action: stableAction(step.action),
      selectedChoices: step.selectedChoices.map(
        ({ requestIndex, effectId, choiceIndex, choiceId, choiceKind }) => ({
          requestIndex,
          effectId,
          choiceIndex,
          choiceId,
          choiceKind,
        })
      ),
    })),
  };
}
function stableAction(action: LegalAction): Record<string, string> {
  switch (action.type) {
    case "playCard":
    case "activatePermanent":
      return { type: action.type, cardInstanceId: action.cardInstanceId };
    case "activateWizardProperty":
      return { type: action.type, tokenInstanceId: action.tokenInstanceId };
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

if (process.argv[1]?.endsWith("run-best-move-analysis.js")) {
  try {
    const args = parseBestMoveArgs(process.argv.slice(2));
    const state = initializeGame({
      rootDir: process.cwd(),
      seed: args.seed,
      playerCount: args.playerCount,
    });
    const lines = enumerateTurnLines(state, args);
    const ranked = rankTurnLines(
      state,
      lines,
      getBestMovePolicy(args.criterion),
      state.activePlayerId
    );
    const rankedLines = ranked.rankedLines.map((entry: RankedTurnLine) => ({
      rank: entry.rank,
      score: entry.score,
      ...(entry.components === undefined
        ? {}
        : { components: entry.components }),
      terminalReason: entry.line.terminalReason,
      ...(entry.line.gameEndReason === undefined
        ? {}
        : { gameEndReason: entry.line.gameEndReason }),
      steps: entry.line.steps,
    }));
    console.log(
      JSON.stringify(
        formatBestMoveAnalysis({
          seed: args.seed,
          playerCount: args.playerCount,
          initialPlayerId: state.activePlayerId,
          initialTurnNumber: state.turn.number,
          criterionId: ranked.criterionId,
          limits: args,
          top: args.top,
          rankedLines,
        }),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
