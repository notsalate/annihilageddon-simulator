import {
  applyAction,
  listLegalActions,
  type GameAction,
  type LegalAction,
} from "./actions.js";
import { assertNever } from "../common.js";
import type {
  ChoicePolicy,
  ChoiceRequest,
  ChoiceSelection,
  EffectChoiceRequest,
  SetupChoiceRequest,
} from "./choice-policy.js";
import type {
  CardDefinition,
  LoadedDataPack,
  TokenDefinition,
} from "./data.js";
import { calculateEffectiveCardCost } from "./effective-value-runtime.js";
import { recordBotActionSelected } from "./event-recorder.js";
import { adjudicateGame, type AdjudicationResult } from "./adjudication.js";
import {
  findPlayerUnboughtFamiliarCard,
  listLegendMarketCards,
  listMainMarketCards,
} from "./control-ledger.js";
import {
  initializeGame,
  type CardInstance,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerDecisionView,
  type PlayerState,
  type TokenInstance,
} from "./setup.js";
import { assertGameStateInvariants } from "./invariants.js";
import { createPlayerDecisionView } from "./strategy-decision-view.js";
import { intakeRuntimeData } from "./runtime-data-intake.js";

export type GameEndReason =
  | "deadWizardTokensExhausted"
  | "mainDeckExhausted"
  | "legendDeckExhausted"
  | "playerDefeated"
  | "maxTurnsReached";

export interface RunSingleGameOptions {
  rootDir: string;
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  dataPack?: LoadedDataPack;
  bot?: BotStrategy;
  botFactory?: (playerId: PlayerId) => BotStrategy;
  replay?: SimulationFailureReplay;
  validateInvariants?: boolean;
}

export interface BotDecisionContext {
  player: PlayerDecisionView;
  legalActions: readonly BotDecisionAction[];
}

export type BotDecisionAction =
  | Exclude<LegalAction, { type: "buyMarketCard" }>
  | (Extract<LegalAction, { type: "buyMarketCard" }> & {
      readonly cost: number;
    });

export interface BotStrategy {
  chooseAction(context: BotDecisionContext): GameAction;
  chooseEffectChoice?: ChoicePolicy;
}

interface PlayerBotBinding {
  readonly strategy: BotStrategy;
  readonly chooseAction: BotStrategy["chooseAction"];
  readonly chooseEffectChoice: BotStrategy["chooseEffectChoice"];
}

export interface SetupCardSnapshot {
  instanceId: string;
  definitionId: string;
  marketChips: number;
}

export interface SetupTokenSnapshot {
  instanceId: string;
  definitionId: string;
}

export interface SetupPlayerSnapshot {
  playerId: PlayerId;
  handSize: number;
  deckSize: number;
  life: number;
  maxLife: number;
  chips: number;
  hand: SetupCardSnapshot[];
  wizardProperties: SetupTokenSnapshot[];
  statuses: string[];
  unboughtFamiliars: SetupCardSnapshot[];
}

export interface SetupStateSnapshot {
  players: SetupPlayerSnapshot[];
  mainMarket: SetupCardSnapshot[];
  legendMarket: SetupCardSnapshot[];
  mainDeckSize: number;
  legendDeckSize: number;
  wildMagicStackSize: number;
  limpWandStackSize: number;
  deadWizardTokenStackSize: number;
}

export interface SimulationFailureSetup {
  rootDir: string;
  seed: number;
  maxTurns: number;
  playerCount?: number;
  dataPackPath?: string;
  initialState: SetupStateSnapshot;
}

export interface SimulationFailureRuntimeData {
  manifest: LoadedDataPack["manifest"];
  cardDefinitions: readonly CardDefinition[];
  tokenDefinitions: readonly TokenDefinition[];
  decks: LoadedDataPack["decks"];
  tokenStacks: LoadedDataPack["tokenStacks"];
}

export interface SimulationFailureErrorDetails {
  message: string;
  stack: string;
  causeStack?: string;
}

export interface SimulationFailureReproduction {
  command: string;
  args: readonly string[];
}

export interface SimulationFailureReplayEffectChoice {
  readonly type: "effectChoiceSelected" | "effectChoiceSkipped";
  readonly playerId: string;
  readonly effectId: string;
  readonly choiceId?: string;
}

export interface SimulationFailureReplaySetupChoice {
  readonly type: "setupChoiceSelected";
  readonly playerId: string;
  readonly setupChoiceKind: "familiar";
  readonly policyId: string;
  readonly chosenInstanceId: string;
}

export type SimulationFailureReplayChoice =
  | SimulationFailureReplayEffectChoice
  | SimulationFailureReplaySetupChoice;

export interface SimulationFailureReplay {
  readonly actions: readonly GameAction[];
  readonly choices: readonly SimulationFailureReplayChoice[];
}

export interface SimulationFailureReport {
  seed: number;
  setup: SimulationFailureSetup;
  runtimeData: SimulationFailureRuntimeData;
  turnNumber: number;
  activePlayerId: PlayerId;
  actions: readonly GameAction[];
  choices: readonly GameEvent[];
  error: SimulationFailureErrorDetails;
  eventLog: readonly GameEvent[];
  reproduction: SimulationFailureReproduction;
}

interface SimulationFailureRuntimeDataCandidate {
  readonly manifest?: unknown;
  readonly cardDefinitions?: unknown;
  readonly tokenDefinitions?: unknown;
  readonly decks?: unknown;
  readonly tokenStacks?: unknown;
}

interface GameActionCandidate {
  readonly type?: unknown;
  readonly cardInstanceId?: unknown;
  readonly cardType?: unknown;
  readonly enabled?: unknown;
  readonly tokenInstanceId?: unknown;
  readonly source?: unknown;
}

interface SimulationFailureReplayChoiceCandidate {
  readonly type?: unknown;
  readonly playerId?: unknown;
  readonly effectId?: unknown;
  readonly choiceId?: unknown;
  readonly setupChoiceKind?: unknown;
  readonly policyId?: unknown;
  readonly chosenInstanceId?: unknown;
}

export function createSimulationFailureReplay(
  report: Pick<SimulationFailureReport, "actions" | "choices">
): SimulationFailureReplay {
  const choices: SimulationFailureReplayChoice[] = [];
  for (const event of report.choices) {
    if (event.type === "setupChoiceSelected") {
      if (event.setupChoiceKind !== "familiar") {
        continue;
      }
      if (event.chosenInstanceId === undefined) {
        throw new Error("Familiar setup replay event is missing choiceId");
      }
      choices.push({
        type: event.type,
        playerId: event.playerId,
        setupChoiceKind: event.setupChoiceKind,
        policyId: event.policyId ?? "provided",
        chosenInstanceId: event.chosenInstanceId,
      });
      continue;
    }
    if (event.type === "effectChoiceSkipped") {
      choices.push({
        type: event.type,
        playerId: event.playerId,
        effectId: event.effectId,
      });
      continue;
    }
    if (event.type !== "effectChoiceSelected") {
      continue;
    }
    if (event.choiceId === undefined) {
      throw new Error("Effect choice replay event is missing choiceId");
    }
    choices.push({
      type: event.type,
      playerId: event.playerId,
      effectId: event.effectId,
      choiceId: event.choiceId,
    });
  }
  return {
    actions: [...report.actions],
    choices,
  };
}

export function parseSimulationFailureReplayReport(reportText: string): {
  runtimeData: SimulationFailureReport["runtimeData"];
  replay: SimulationFailureReplay;
} {
  const runtimeDataValue: unknown = JSON.parse(
    readJsonSection(reportText, "runtimeData")
  );
  if (!isSimulationFailureRuntimeData(runtimeDataValue)) {
    throw new Error("Report runtimeData has an invalid shape");
  }
  const actionsValue: unknown = JSON.parse(
    readJsonSection(reportText, "actions")
  );
  if (!isGameActionArray(actionsValue)) {
    throw new Error("Report actions have an invalid shape");
  }
  const choicesValue: unknown = JSON.parse(
    readJsonSection(reportText, "choices")
  );
  return {
    runtimeData: runtimeDataValue,
    replay: {
      actions: actionsValue,
      choices: readReplayChoices(choicesValue),
    },
  };
}

function readJsonSection(reportText: string, section: string): string {
  const codeFence = "`".repeat(3);
  const marker = `${section}:\n${codeFence}json\n`;
  const start = reportText.indexOf(marker);
  if (start < 0) {
    throw new Error(`Report does not contain ${section}`);
  }
  const contentStart = start + marker.length;
  const contentEnd = reportText.indexOf(`\n${codeFence}`, contentStart);
  if (contentEnd < 0) {
    throw new Error(`Report section ${section} is not closed`);
  }
  return reportText.slice(contentStart, contentEnd);
}

function isSimulationFailureRuntimeData(
  value: unknown
): value is SimulationFailureReport["runtimeData"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as SimulationFailureRuntimeDataCandidate;
  return (
    "manifest" in value &&
    "cardDefinitions" in value &&
    "tokenDefinitions" in value &&
    "decks" in value &&
    "tokenStacks" in value &&
    Array.isArray(record.cardDefinitions) &&
    Array.isArray(record.tokenDefinitions)
  );
}

function isGameActionArray(value: unknown): value is GameAction[] {
  return Array.isArray(value) && value.every(isGameAction);
}

function isGameAction(value: unknown): value is GameAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as GameActionCandidate;
  switch (record.type) {
    case "endTurn":
      return true;
    case "playCard":
    case "activatePermanent":
      return typeof record.cardInstanceId === "string";
    case "activateWizardProperty":
      return typeof record.tokenInstanceId === "string";
    case "setCardEffectiveType":
      return (
        typeof record.cardInstanceId === "string" &&
        typeof record.cardType === "string" &&
        typeof record.enabled === "boolean"
      );
    case "buyMarketCard":
      return (
        typeof record.cardInstanceId === "string" &&
        (record.source === "mainMarket" ||
          record.source === "legendMarket" ||
          record.source === "wildMagicStack" ||
          record.source === "familiar")
      );
    default:
      return false;
  }
}

function readReplayChoices(value: unknown): SimulationFailureReplay["choices"] {
  if (!Array.isArray(value)) {
    throw new Error("Report choices have an invalid shape");
  }

  const choices: SimulationFailureReplayChoice[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Report choice has an invalid shape");
    }
    const record = entry as SimulationFailureReplayChoiceCandidate;
    if (record.type === "setupChoiceSelected") {
      if (record.setupChoiceKind !== "familiar") {
        continue;
      }
      if (
        typeof record.playerId !== "string" ||
        typeof record.policyId !== "string" ||
        typeof record.chosenInstanceId !== "string"
      ) {
        throw new Error("Report familiar setup choice has an invalid shape");
      }
      choices.push({
        type: "setupChoiceSelected",
        playerId: record.playerId,
        setupChoiceKind: "familiar",
        policyId: record.policyId,
        chosenInstanceId: record.chosenInstanceId,
      });
      continue;
    }
    if (
      record.type !== "effectChoiceSelected" &&
      record.type !== "effectChoiceSkipped"
    ) {
      continue;
    }
    if (
      typeof record.playerId !== "string" ||
      typeof record.effectId !== "string"
    ) {
      throw new Error("Report effect choice has an invalid shape");
    }
    if (record.type === "effectChoiceSkipped") {
      choices.push({
        type: "effectChoiceSkipped",
        playerId: record.playerId,
        effectId: record.effectId,
      });
      continue;
    }
    if (typeof record.choiceId !== "string") {
      throw new Error("Report selected effect choice has no choiceId");
    }
    choices.push({
      type: "effectChoiceSelected",
      playerId: record.playerId,
      effectId: record.effectId,
      choiceId: record.choiceId,
    });
  }
  return choices;
}

export function createLoadedDataPackFromSimulationFailureReport(
  runtimeData: SimulationFailureRuntimeData
): LoadedDataPack {
  return {
    manifest: runtimeData.manifest,
    cardDefinitions: new Map(
      runtimeData.cardDefinitions.map((definition) => [
        definition.cardId,
        definition,
      ])
    ),
    tokenDefinitions: new Map(
      runtimeData.tokenDefinitions.map((definition) => [
        definition.tokenId,
        definition,
      ])
    ),
    decks: runtimeData.decks,
    tokenStacks: runtimeData.tokenStacks,
  };
}

export class SimulationExecutionError extends Error {
  override name = "SimulationExecutionError";

  constructor(
    readonly report: SimulationFailureReport,
    cause?: unknown
  ) {
    super(report.error.message, cause === undefined ? undefined : { cause });
  }
}

export interface SingleGameResult extends AdjudicationResult {
  seed: number;
  endReason: GameEndReason;
  isGameEnd: boolean;
  turnsElapsed: number;
  eventLog: GameEvent[];
  setupState?: SetupStateSnapshot;
}

export const baselineBot: BotStrategy = {
  chooseAction({ legalActions }: BotDecisionContext): GameAction {
    const playAction = legalActions.find(
      (action) => action.type === "playCard"
    );
    if (playAction !== undefined) {
      return playAction;
    }

    const buyActions = legalActions
      .filter(
        (
          action
        ): action is Extract<BotDecisionAction, { type: "buyMarketCard" }> => {
          return action.type === "buyMarketCard";
        }
      )
      .sort((left, right) => right.cost - left.cost);
    const buyAction = buyActions[0];
    if (buyAction !== undefined) {
      return buyAction;
    }

    return { type: "endTurn" };
  },
};

function createBaselineBot(): BotStrategy {
  return {
    chooseAction(context) {
      return baselineBot.chooseAction(context);
    },
  };
}

function mustGetActivePlayer(state: GameState): PlayerState {
  const player = state.players.find(
    (candidate) => candidate.playerId === state.activePlayerId
  );
  if (player === undefined) {
    throw new Error(`Active player ${state.activePlayerId} is missing`);
  }
  return player;
}

function createBotDecisionActions(
  state: GameState,
  legalActions: readonly LegalAction[]
): BotDecisionAction[] {
  const activePlayer = mustGetActivePlayer(state);
  return legalActions.map((action) =>
    action.type === "buyMarketCard"
      ? { ...action, cost: getBuyActionCost(state, activePlayer, action) }
      : action
  );
}

function getBuyActionCost(
  state: GameState,
  activePlayer: PlayerState,
  action: Extract<LegalAction, { type: "buyMarketCard" }>
): number {
  if (action.source === "wildMagicStack") {
    return 3;
  }
  const card =
    action.source === "mainMarket"
      ? listMainMarketCards(state).find(
          (candidate) => candidate.instanceId === action.cardInstanceId
        )
      : action.source === "legendMarket"
        ? listLegendMarketCards(state).find(
            (candidate) => candidate.instanceId === action.cardInstanceId
          )
        : findPlayerUnboughtFamiliarCard(activePlayer, action.cardInstanceId);
  if (card === undefined) {
    throw new Error(`Legal buy target ${action.cardInstanceId} is missing`);
  }
  return calculateEffectiveCardCost(
    state,
    activePlayer.playerId,
    mustGetCardDefinition(state, card),
    card
  );
}

function mustGetCardDefinition(
  state: GameState,
  card: CardInstance
): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${card.definitionId}`);
  }
  return definition;
}

class SimulationReplayError extends Error {
  override name = "SimulationReplayError";
}

interface SimulationReplayController {
  nextAction(): GameAction;
  chooseSetupChoice(request: SetupChoiceRequest): ChoiceSelection | undefined;
  chooseEffectChoice(request: EffectChoiceRequest): ChoiceSelection | undefined;
  getIncompleteHistoryError(): SimulationReplayError | undefined;
}

function createSimulationReplayController(
  replay: SimulationFailureReplay
): SimulationReplayController {
  let actionIndex = 0;
  let choiceIndex = 0;

  return {
    nextAction(): GameAction {
      const action = replay.actions[actionIndex];
      if (action === undefined) {
        throw new SimulationReplayError(
          `Replay action history ended before action ${actionIndex + 1}`
        );
      }
      actionIndex += 1;
      return action;
    },
    chooseSetupChoice(
      request: SetupChoiceRequest
    ): ChoiceSelection | undefined {
      const expected = replay.choices[choiceIndex];
      if (
        expected === undefined ||
        expected.type !== "setupChoiceSelected" ||
        expected.playerId !== request.player.playerId ||
        expected.setupChoiceKind !== request.setupChoiceKind
      ) {
        throw new SimulationReplayError(
          `Replay setup choice ${choiceIndex + 1} does not match ${request.setupChoiceKind} for ${request.player.playerId}`
        );
      }
      choiceIndex += 1;
      if (expected.policyId === "alwaysPickFirst") {
        return undefined;
      }
      if (
        !request.choices.some(
          (choice) => choice.choiceId === expected.chosenInstanceId
        )
      ) {
        throw new SimulationReplayError(
          `Replay familiar setup choice ${expected.chosenInstanceId} is not legal for ${request.player.playerId}`
        );
      }
      return { choiceId: expected.chosenInstanceId };
    },
    chooseEffectChoice(
      request: EffectChoiceRequest
    ): ChoiceSelection | undefined {
      const expected = replay.choices[choiceIndex];
      if (expected === undefined || expected.type === "setupChoiceSelected") {
        throw new SimulationReplayError(
          `Replay choice history ended before ${request.effectId}`
        );
      }
      if (
        expected.playerId !== request.player.playerId ||
        expected.effectId !== request.effectId
      ) {
        throw new SimulationReplayError(
          `Replay choice ${choiceIndex + 1} does not match ${request.effectId} for ${request.player.playerId}`
        );
      }
      choiceIndex += 1;
      if (expected.type === "effectChoiceSkipped") {
        return undefined;
      }
      if (
        expected.choiceId === undefined ||
        !request.choices.some((choice) => choice.choiceId === expected.choiceId)
      ) {
        throw new SimulationReplayError(
          `Replay choice ${expected.choiceId ?? "<missing>"} is not legal for ${request.effectId}`
        );
      }
      return { choiceId: expected.choiceId };
    },
    getIncompleteHistoryError(): SimulationReplayError | undefined {
      if (actionIndex !== replay.actions.length) {
        return new SimulationReplayError(
          `Replay stopped after ${actionIndex} of ${replay.actions.length} actions`
        );
      }
      if (choiceIndex !== replay.choices.length) {
        return new SimulationReplayError(
          `Replay stopped after ${choiceIndex} of ${replay.choices.length} choices`
        );
      }
      return undefined;
    },
  };
}

function createReplayBotFactory(
  replayController: SimulationReplayController
): (playerId: PlayerId) => BotStrategy {
  return () => ({
    chooseAction: () => replayController.nextAction(),
    chooseEffectChoice: (request) =>
      request.requestKind === "setup"
        ? replayController.chooseSetupChoice(request)
        : replayController.chooseEffectChoice(request),
  });
}

function rejectSuccessfulReplay(
  replayController: SimulationReplayController | undefined
): never | undefined {
  if (replayController === undefined) {
    return undefined;
  }
  throw new SimulationReplayError(
    "Replay completed without reproducing the recorded failure"
  );
}

export function runSingleGame(options: RunSingleGameOptions): SingleGameResult {
  const { bot, botFactory, dataPack } = options;
  if (dataPack !== undefined && options.dataPackPath !== undefined) {
    throw new Error("dataPack and dataPackPath cannot be used together");
  }
  if (
    options.replay !== undefined &&
    (bot !== undefined || botFactory !== undefined)
  ) {
    throw new Error("Replay cannot be combined with bot or botFactory");
  }
  if (bot !== undefined && bot !== baselineBot) {
    throw new Error("Custom multiplayer bot must use botFactory");
  }
  const replayController =
    options.replay === undefined
      ? undefined
      : createSimulationReplayController(options.replay);
  const strategyFactory =
    replayController === undefined
      ? (botFactory ??
        (bot === undefined || bot === baselineBot
          ? () => createBaselineBot()
          : () => bot))
      : createReplayBotFactory(replayController);
  const botBindingsByPlayerId = new Map<PlayerId, PlayerBotBinding>();
  const playerIdByStrategy = new WeakMap<BotStrategy, PlayerId>();
  const playerIdByCallback = new Map<
    | BotStrategy["chooseAction"]
    | NonNullable<BotStrategy["chooseEffectChoice"]>,
    PlayerId
  >();

  function getBotBindingForPlayer(playerId: PlayerId): PlayerBotBinding {
    const existingBinding = botBindingsByPlayerId.get(playerId);
    if (existingBinding !== undefined) {
      return existingBinding;
    }

    const strategy = strategyFactory(playerId);
    const assignedStrategyPlayerId = playerIdByStrategy.get(strategy);
    if (
      assignedStrategyPlayerId !== undefined &&
      assignedStrategyPlayerId !== playerId
    ) {
      throw new Error(
        `BotStrategy object is already assigned to ${assignedStrategyPlayerId}; create a separate strategy for ${playerId}`
      );
    }
    const chooseAction = strategy.chooseAction;
    const chooseEffectChoice = strategy.chooseEffectChoice;
    const callbacks: ReadonlyArray<
      readonly [
        "chooseAction" | "chooseEffectChoice",
        (
          | BotStrategy["chooseAction"]
          | NonNullable<BotStrategy["chooseEffectChoice"]>
        ),
      ]
    > = [
      ["chooseAction", chooseAction],
      ...(chooseEffectChoice === undefined
        ? []
        : ([["chooseEffectChoice", chooseEffectChoice]] as const)),
    ];
    for (const [callbackName, callback] of callbacks) {
      const assignedPlayerId = playerIdByCallback.get(callback);
      if (assignedPlayerId !== undefined && assignedPlayerId !== playerId) {
        throw new Error(
          `${callbackName} callback is already assigned to ${assignedPlayerId}; create a separate callback for ${playerId}`
        );
      }
    }
    for (const [, callback] of callbacks) {
      playerIdByCallback.set(callback, playerId);
    }
    playerIdByStrategy.set(strategy, playerId);
    const binding = { strategy, chooseAction, chooseEffectChoice };
    botBindingsByPlayerId.set(playerId, binding);
    return binding;
  }

  const effectChoiceStrategy = (request: ChoiceRequest) => {
    const binding = getBotBindingForPlayer(request.player.playerId);
    return binding.chooseEffectChoice?.call(binding.strategy, request);
  };
  const runtimeDataPack =
    dataPack === undefined
      ? intakeRuntimeData({
          rootDir: options.rootDir,
          ...(options.dataPackPath === undefined
            ? {}
            : { dataPackPath: options.dataPackPath }),
        })
      : intakeRuntimeData({ dataPack });
  const state = initializeGame({
    dataPack: runtimeDataPack,
    seed: options.seed,
    ...(options.playerCount === undefined
      ? {}
      : { playerCount: options.playerCount }),
    effectChoiceStrategy,
  });
  const setupState = snapshotSetupState(state);
  if (options.validateInvariants) {
    assertGameStateInvariants(state);
  }
  const actionLimit = options.maxTurns * 200;
  let actionsApplied = 0;
  let checkDeadWizardTokenExhaustion = true;
  const actionHistory: GameAction[] = [];

  while (true) {
    try {
      if (options.validateInvariants) {
        assertGameStateInvariants(state);
      }
      const endReason = getGameEndReason(state, {
        checkDeadWizardTokenExhaustion,
      });
      if (endReason !== undefined) {
        return (
          rejectSuccessfulReplay(replayController) ??
          summarizeGame(state, endReason, true, setupState)
        );
      }

      if (state.turn.number > options.maxTurns) {
        return (
          rejectSuccessfulReplay(replayController) ??
          summarizeGame(state, "maxTurnsReached", false, setupState)
        );
      }

      if (actionsApplied >= actionLimit) {
        throw new Error(`Bot exceeded ${actionLimit} actions before maxTurns`);
      }

      const activePlayer = mustGetActivePlayer(state);
      const legalActions = listLegalActions(state);
      const binding = getBotBindingForPlayer(activePlayer.playerId);
      const selectedAction = binding.chooseAction.call(binding.strategy, {
        player: createPlayerDecisionView(activePlayer),
        legalActions: createBotDecisionActions(state, legalActions),
      });
      actionHistory.push(selectedAction);
      if (!isLegalAction(selectedAction, legalActions)) {
        throw new Error(`Bot selected illegal action ${selectedAction.type}`);
      }

      recordBotActionSelected(state, selectedAction);
      const result = applyAction(state, selectedAction);
      if (!result.ok) {
        throw new Error(`Legal action failed: ${result.error}`);
      }
      if (options.validateInvariants) {
        assertGameStateInvariants(state);
      }
      if (result.gameEndReason !== undefined) {
        return (
          rejectSuccessfulReplay(replayController) ??
          summarizeGame(
            state,
            result.gameEndReason,
            true,
            setupState,
            result.winnerPlayerId
          )
        );
      }
      actionsApplied += 1;
      checkDeadWizardTokenExhaustion = selectedAction.type === "endTurn";
    } catch (error) {
      const replayFailure =
        replayController === undefined || error instanceof SimulationReplayError
          ? undefined
          : replayController.getIncompleteHistoryError();
      throw createSimulationExecutionError(
        state,
        options,
        setupState,
        runtimeDataPack,
        actionHistory,
        replayFailure ?? error
      );
    }
  }
}

function createSimulationExecutionError(
  state: GameState,
  options: RunSingleGameOptions,
  setupState: SetupStateSnapshot,
  dataPack: LoadedDataPack,
  actionHistory: readonly GameAction[],
  failure: unknown
): SimulationExecutionError {
  const error = getSimulationFailureErrorDetails(failure);
  const reproductionArgs = [
    "--seed",
    String(options.seed),
    "--maxTurns",
    String(options.maxTurns),
    ...(options.playerCount === undefined
      ? []
      : ["--playerCount", String(options.playerCount)]),
    "--replayReport",
    "<report-path>",
  ];
  const report: SimulationFailureReport = {
    seed: options.seed,
    setup: {
      rootDir: options.rootDir,
      seed: options.seed,
      maxTurns: options.maxTurns,
      ...(options.playerCount === undefined
        ? {}
        : { playerCount: options.playerCount }),
      ...(options.dataPackPath === undefined
        ? {}
        : { dataPackPath: options.dataPackPath }),
      initialState: setupState,
    },
    runtimeData: {
      manifest: dataPack.manifest,
      cardDefinitions: [...state.cardDefinitions.values()],
      tokenDefinitions: [...state.tokenDefinitions.values()],
      decks: dataPack.decks,
      tokenStacks: dataPack.tokenStacks,
    },
    turnNumber: state.turn.number,
    activePlayerId: state.activePlayerId,
    actions: [...actionHistory],
    choices: state.eventLog.filter(isChoiceEvent),
    error,
    eventLog: [...state.eventLog],
    reproduction: {
      command: ["npm run simulate:single --", ...reproductionArgs]
        .map((part) => quoteCommandArgument(part))
        .join(" "),
      args: reproductionArgs,
    },
  };
  return new SimulationExecutionError(
    report,
    failure instanceof Error ? failure : undefined
  );
}

function getSimulationFailureErrorDetails(
  failure: unknown
): SimulationFailureErrorDetails {
  if (!(failure instanceof Error)) {
    return { message: String(failure), stack: "" };
  }

  const causeStack =
    failure.cause instanceof Error ? failure.cause.stack : undefined;
  return {
    message: failure.message,
    stack: failure.stack ?? "",
    ...(causeStack === undefined ? {} : { causeStack }),
  };
}

function isChoiceEvent(event: GameEvent): boolean {
  return (
    event.type === "effectChoiceSelected" ||
    event.type === "effectChoiceSkipped" ||
    event.type === "defenseChoiceSelected" ||
    event.type === "wildMagicChoiceSelected" ||
    event.type === "wildMagicChoiceSkipped" ||
    event.type === "setupChoiceSelected"
  );
}

function quoteCommandArgument(value: string): string {
  return /[\s"]/.test(value) ? JSON.stringify(value) : value;
}

function summarizeGame(
  state: GameState,
  endReason: GameEndReason,
  isGameEnd: boolean,
  setupState: SetupStateSnapshot,
  winnerPlayerId?: PlayerId
): SingleGameResult {
  const adjudication = adjudicateGame(state);
  const winnerIds =
    winnerPlayerId === undefined ? adjudication.winnerIds : [winnerPlayerId];

  return {
    seed: state.seed,
    endReason,
    isGameEnd,
    turnsElapsed: state.turn.number - 1,
    players: adjudication.players,
    winnerIds,
    isTie: winnerIds.length > 1,
    eventLog: [...state.eventLog],
    setupState,
  };
}

function snapshotSetupState(state: GameState): SetupStateSnapshot {
  return {
    players: state.players.map((player) => {
      return {
        playerId: player.playerId,
        handSize: player.hand.length,
        deckSize: player.deck.length,
        life: player.life.current,
        maxLife: player.life.max,
        chips: player.chips,
        hand: player.hand.map(snapshotCard),
        wizardProperties: player.wizardProperties.map(snapshotToken),
        statuses: player.statuses.map((status) => status.statusId),
        unboughtFamiliars: player.unboughtFamiliars.map(snapshotCard),
      };
    }),
    mainMarket: state.common.market.map(snapshotCard),
    legendMarket: state.common.legendMarket.map(snapshotCard),
    mainDeckSize: state.common.mainDeck.length,
    legendDeckSize: state.common.legendDeck.length,
    wildMagicStackSize: state.common.wildMagicStack.length,
    limpWandStackSize: state.common.limpWandStack.length,
    deadWizardTokenStackSize: state.common.deadWizardTokens.drawStack.length,
  };
}

function snapshotCard(card: CardInstance): SetupCardSnapshot {
  return {
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    marketChips: card.marketChips,
  };
}

function snapshotToken(token: TokenInstance): SetupTokenSnapshot {
  return {
    instanceId: token.instanceId,
    definitionId: token.definitionId,
  };
}

export function getGameEndReason(
  state: GameState,
  options: { checkDeadWizardTokenExhaustion?: boolean } = {}
): GameEndReason | undefined {
  if (
    options.checkDeadWizardTokenExhaustion !== false &&
    state.common.deadWizardTokens.status === "available" &&
    state.common.deadWizardTokens.drawStack.length === 0
  ) {
    return "deadWizardTokensExhausted";
  }

  return undefined;
}

function isLegalAction(
  action: GameAction,
  legalActions: readonly LegalAction[]
): boolean {
  return legalActions.some((legalAction) => {
    switch (action.type) {
      case "playCard":
        return (
          legalAction.type === "playCard" &&
          legalAction.cardInstanceId === action.cardInstanceId
        );
      case "buyMarketCard":
        return (
          legalAction.type === "buyMarketCard" &&
          legalAction.cardInstanceId === action.cardInstanceId &&
          legalAction.source === action.source
        );
      case "activatePermanent":
        return (
          legalAction.type === "activatePermanent" &&
          legalAction.cardInstanceId === action.cardInstanceId
        );
      case "activateWizardProperty":
        return (
          legalAction.type === "activateWizardProperty" &&
          legalAction.tokenInstanceId === action.tokenInstanceId
        );
      case "activateDeadWizardToken":
        return (
          legalAction.type === "activateDeadWizardToken" &&
          legalAction.tokenInstanceId === action.tokenInstanceId
        );
      case "setCardEffectiveType":
        return (
          legalAction.type === "setCardEffectiveType" &&
          legalAction.cardInstanceId === action.cardInstanceId &&
          legalAction.cardType === action.cardType &&
          legalAction.enabled === action.enabled
        );
      case "endTurn":
        return legalAction.type === "endTurn";
      default:
        return assertNever(action);
    }
  });
}
