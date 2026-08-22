import {
  applyAction,
  listLegalActions,
  type GameAction,
  type LegalAction,
} from "./actions.js";
import { assertNever } from "../common.js";
import type { ChoiceRequest, ChoiceSelection } from "./choice-policy.js";
import type {
  CardDefinition,
  LoadedDataPack,
  TokenDefinition,
} from "./data.js";
import { calculateEffectiveCardCost } from "./effective-value-runtime.js";
import { recordBotActionSelected } from "./event-recorder.js";
import { adjudicateGame, type AdjudicationResult } from "./adjudication.js";
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
  chooseEffectChoice?(request: ChoiceRequest): ChoiceSelection | undefined;
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
  unboughtFamiliar?: SetupCardSnapshot;
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
  const card = [
    ...state.common.market,
    ...state.common.legendMarket,
    activePlayer.unboughtFamiliar,
  ].find((candidate) => candidate?.instanceId === action.cardInstanceId);
  if (card === undefined) {
    throw new Error(`Legal buy target ${action.cardInstanceId} is missing`);
  }
  return calculateEffectiveCardCost(
    state,
    activePlayer.playerId,
    mustGetCardDefinition(state, card)
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

export function runSingleGame(options: RunSingleGameOptions): SingleGameResult {
  const { bot, botFactory, dataPack } = options;
  if (dataPack !== undefined && options.dataPackPath !== undefined) {
    throw new Error("dataPack and dataPackPath cannot be used together");
  }
  if (bot !== undefined && bot !== baselineBot) {
    throw new Error("Custom multiplayer bot must use botFactory");
  }
  const strategyFactory =
    botFactory ??
    (bot === undefined || bot === baselineBot
      ? () => createBaselineBot()
      : () => bot);
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
  const actionHistory: GameAction[] = [];

  while (true) {
    try {
      if (options.validateInvariants) {
        assertGameStateInvariants(state);
      }
      const endReason = getGameEndReason(state);
      if (endReason !== undefined) {
        return summarizeGame(state, endReason, true, setupState);
      }

      if (state.turn.number > options.maxTurns) {
        return summarizeGame(state, "maxTurnsReached", false, setupState);
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
        return summarizeGame(
          state,
          result.gameEndReason,
          true,
          setupState,
          result.winnerPlayerId
        );
      }
      actionsApplied += 1;
    } catch (error) {
      throw createSimulationExecutionError(
        state,
        options,
        setupState,
        runtimeDataPack,
        actionHistory,
        error
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
      const familiar = snapshotOptionalCard(player.unboughtFamiliar);
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
        ...(familiar === undefined ? {} : { unboughtFamiliar: familiar }),
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

function snapshotOptionalCard(
  card: CardInstance | undefined
): SetupCardSnapshot | undefined {
  return card === undefined ? undefined : snapshotCard(card);
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

export function getGameEndReason(state: GameState): GameEndReason | undefined {
  if (
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
      case "endTurn":
        return legalAction.type === "endTurn";
      default:
        return assertNever(action);
    }
  });
}
