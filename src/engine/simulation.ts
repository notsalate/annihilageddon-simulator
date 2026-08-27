import {
  applyAction,
  listLegalActions,
  type GameAction,
  type LegalAction,
} from "./actions.js";
import { assertNever, isPlainRecord } from "../common.js";
import type {
  ChoicePolicy,
  ChoicePolicyState,
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
import type { EndOfTurnGameEndReason } from "./end-conditions.js";

export type GameEndReason = EndOfTurnGameEndReason | "maxTurnsReached";

export interface RunSingleGameOptions {
  rootDir: string;
  seed: number;
  maxTurns: number;
  playerCount?: number;
  deadWizardTokenCount?: number;
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
  getChoicePolicyState?: () => ChoicePolicyState | undefined;
}

interface PlayerBotBinding {
  readonly strategy: BotStrategy;
  readonly chooseAction: BotStrategy["chooseAction"];
  readonly chooseEffectChoice: BotStrategy["chooseEffectChoice"];
  readonly getChoicePolicyState: BotStrategy["getChoicePolicyState"];
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
  deadWizardTokenCount?: number;
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

export interface SimulationFailureReplaySetupCandidate {
  readonly instanceId: string;
  readonly definitionId: string;
}

export interface SimulationFailureReplaySetupChoice {
  readonly type: "setupChoiceSelected";
  readonly playerId: string;
  readonly setupChoiceKind: "familiar" | "wizardProperty";
  readonly policyId: string;
  readonly candidates?: readonly SimulationFailureReplaySetupCandidate[];
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
  readonly candidateInstanceIds?: unknown;
  readonly candidateDefinitionIds?: unknown;
  readonly chosenInstanceId?: unknown;
}

interface SimulationFailureSetupCandidate {
  readonly playerCount?: unknown;
  readonly deadWizardTokenCount?: unknown;
}

export function createSimulationFailureReplay(
  report: Pick<SimulationFailureReport, "actions" | "choices">
): SimulationFailureReplay {
  const choices: SimulationFailureReplayChoice[] = [];
  for (const event of report.choices) {
    if (event.type === "setupChoiceSelected") {
      if (
        event.setupChoiceKind !== "familiar" &&
        event.setupChoiceKind !== "wizardProperty"
      ) {
        continue;
      }
      const candidates = getReplaySetupCandidates(event);
      if (
        event.setupChoiceKind === "wizardProperty" &&
        candidates === undefined
      ) {
        throw new Error(
          `${event.setupChoiceKind} setup replay event is missing candidates`
        );
      }
      if (event.chosenInstanceId === undefined) {
        throw new Error(
          `${event.setupChoiceKind} setup replay event is missing choiceId`
        );
      }
      choices.push({
        type: event.type,
        playerId: event.playerId,
        setupChoiceKind: event.setupChoiceKind,
        policyId: event.policyId ?? "provided",
        ...(candidates === undefined ? {} : { candidates }),
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

function getReplaySetupCandidates(
  event: Extract<GameEvent, { type: "setupChoiceSelected" }>
): SimulationFailureReplaySetupCandidate[] | undefined {
  return parseReplaySetupCandidates(
    event.candidateInstanceIds,
    event.candidateDefinitionIds,
    "Setup replay event"
  );
}

export function parseSimulationFailureReplayReport(reportText: string): {
  runtimeData: SimulationFailureReport["runtimeData"];
  replay: SimulationFailureReplay;
  playerCount?: number;
  deadWizardTokenCount?: number;
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
  const setupValue = readReplaySetup(reportText);
  const playerCount = readReplayPlayerCount(setupValue);
  const deadWizardTokenCount = readReplayDeadWizardTokenCount(setupValue);
  const choicesValue: unknown = JSON.parse(
    readJsonSection(reportText, "choices")
  );
  return {
    runtimeData: runtimeDataValue,
    replay: {
      actions: actionsValue,
      choices: readReplayChoices(choicesValue),
    },
    ...(playerCount === undefined ? {} : { playerCount }),
    ...(deadWizardTokenCount === undefined ? {} : { deadWizardTokenCount }),
  };
}

function readReplaySetup(
  reportText: string
): SimulationFailureSetupCandidate | undefined {
  const setupSection = readOptionalJsonSection(reportText, "setup");
  if (setupSection === undefined) {
    return undefined;
  }

  const setupValue: unknown = JSON.parse(setupSection);
  if (!isSimulationFailureSetupCandidate(setupValue)) {
    throw new Error("Report setup has an invalid shape");
  }
  return setupValue;
}

function readReplayPlayerCount(
  setupValue: SimulationFailureSetupCandidate | undefined
): number | undefined {
  if (setupValue === undefined) {
    return undefined;
  }

  const value = setupValue.playerCount;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 2) {
    throw new Error("Report setup playerCount has an invalid shape");
  }
  return value;
}

function readReplayDeadWizardTokenCount(
  setupValue: SimulationFailureSetupCandidate | undefined
): number | undefined {
  if (setupValue === undefined) {
    return undefined;
  }

  const value = setupValue.deadWizardTokenCount;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Report setup deadWizardTokenCount has an invalid shape");
  }
  return value;
}

function isSimulationFailureSetupCandidate(
  value: unknown
): value is SimulationFailureSetupCandidate {
  return isPlainRecord(value);
}

function readOptionalJsonSection(
  reportText: string,
  section: string
): string | undefined {
  const marker = `${section}:\n${"`".repeat(3)}json\n`;
  return reportText.includes(marker)
    ? readJsonSection(reportText, section)
    : undefined;
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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
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
      if (
        record.setupChoiceKind !== "familiar" &&
        record.setupChoiceKind !== "wizardProperty"
      ) {
        continue;
      }
      if (
        typeof record.playerId !== "string" ||
        typeof record.policyId !== "string" ||
        typeof record.chosenInstanceId !== "string"
      ) {
        throw new Error(
          `Report ${record.setupChoiceKind} setup choice has an invalid shape`
        );
      }
      const candidates = readReplaySetupCandidates(record);
      if (
        record.setupChoiceKind === "wizardProperty" &&
        candidates === undefined
      ) {
        throw new Error(
          `Report ${record.setupChoiceKind} setup choice has no candidates`
        );
      }
      choices.push({
        type: "setupChoiceSelected",
        playerId: record.playerId,
        setupChoiceKind: record.setupChoiceKind,
        policyId: record.policyId,
        ...(candidates === undefined ? {} : { candidates }),
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

function readReplaySetupCandidates(
  record: SimulationFailureReplayChoiceCandidate
): SimulationFailureReplaySetupCandidate[] | undefined {
  return parseReplaySetupCandidates(
    record.candidateInstanceIds,
    record.candidateDefinitionIds,
    "Report setup choice"
  );
}

function parseReplaySetupCandidates(
  instanceIds: unknown,
  definitionIds: unknown,
  context: string
): SimulationFailureReplaySetupCandidate[] | undefined {
  if (instanceIds === undefined && definitionIds === undefined) {
    return undefined;
  }
  if (!isStringArray(instanceIds) || !isStringArray(definitionIds)) {
    throw new Error(`${context} has invalid candidate metadata`);
  }
  if (instanceIds.length !== definitionIds.length) {
    throw new Error(`${context} has mismatched candidate metadata`);
  }
  return instanceIds.map((instanceId, index) => {
    const definitionId = definitionIds[index];
    if (definitionId === undefined) {
      throw new Error(`${context} has sparse candidate metadata`);
    }
    return { instanceId, definitionId };
  });
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
  gameEndReasons?: GameEndReason[];
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
  getChoicePolicyState(): ChoicePolicyState;
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
      if (
        expected.candidates !== undefined &&
        !sameSetupCandidates(request.choices, expected.candidates)
      ) {
        throw new SimulationReplayError(
          `Replay ${request.setupChoiceKind} candidates do not match for ${request.player.playerId}`
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
          `Replay ${request.setupChoiceKind} choice ${expected.chosenInstanceId} is not legal for ${request.player.playerId}`
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
    getChoicePolicyState(): ChoicePolicyState {
      return { actionIndex, choiceIndex };
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

function sameSetupCandidates(
  choices: readonly {
    readonly choiceId: string;
    readonly candidateDefinitionId: string;
  }[],
  candidates: readonly SimulationFailureReplaySetupCandidate[]
): boolean {
  return (
    choices.length === candidates.length &&
    choices.every(
      (choice, index) =>
        choice.choiceId === candidates[index]?.instanceId &&
        choice.candidateDefinitionId === candidates[index]?.definitionId
    )
  );
}

function createReplayBotFactory(
  replayController: SimulationReplayController
): (playerId: PlayerId) => BotStrategy {
  return () => ({
    chooseAction: () => replayController.nextAction(),
    getChoicePolicyState: () => replayController.getChoicePolicyState(),
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
    | NonNullable<BotStrategy["chooseEffectChoice"]>
    | NonNullable<BotStrategy["getChoicePolicyState"]>,
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
    const getChoicePolicyState = strategy.getChoicePolicyState;
    const callbacks: ReadonlyArray<
      readonly [
        "chooseAction" | "chooseEffectChoice" | "getChoicePolicyState",
        (
          | BotStrategy["chooseAction"]
          | NonNullable<BotStrategy["chooseEffectChoice"]>
          | NonNullable<BotStrategy["getChoicePolicyState"]>
        ),
      ]
    > = [
      ["chooseAction", chooseAction],
      ...(chooseEffectChoice === undefined
        ? []
        : ([["chooseEffectChoice", chooseEffectChoice]] as const)),
      ...(getChoicePolicyState === undefined
        ? []
        : ([["getChoicePolicyState", getChoicePolicyState]] as const)),
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
    const binding = {
      strategy,
      chooseAction,
      chooseEffectChoice,
      getChoicePolicyState,
    };
    botBindingsByPlayerId.set(playerId, binding);
    return binding;
  }

  let initializedState: GameState | undefined;
  const effectChoiceStrategy: ChoicePolicy = Object.assign(
    (request: ChoiceRequest) => {
      const binding = getBotBindingForPlayer(request.player.playerId);
      return binding.chooseEffectChoice?.call(binding.strategy, request);
    },
    {
      getState: (): ChoicePolicyState | undefined => {
        if (initializedState === undefined) {
          return undefined;
        }
        const policyStates: Array<{
          readonly playerId: PlayerId;
          readonly state: ChoicePolicyState;
        }> = [];
        for (const player of initializedState.players) {
          const binding = getBotBindingForPlayer(player.playerId);
          if (binding.chooseEffectChoice === undefined) {
            continue;
          }
          if (binding.getChoicePolicyState === undefined) {
            return undefined;
          }
          const state = binding.getChoicePolicyState.call(binding.strategy);
          if (state === undefined) {
            return undefined;
          }
          policyStates.push({ playerId: player.playerId, state });
        }
        return policyStates;
      },
    }
  );
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
    ...(options.deadWizardTokenCount === undefined
      ? {}
      : { deadWizardTokenCount: options.deadWizardTokenCount }),
    effectChoiceStrategy,
  });
  initializedState = state;
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
            result.winnerPlayerId,
            result.gameEndReasons
          )
        );
      }
      actionsApplied += 1;
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
    ...(options.deadWizardTokenCount === undefined
      ? []
      : ["--deadWizardTokenCount", String(options.deadWizardTokenCount)]),
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
      ...(options.deadWizardTokenCount === undefined
        ? {}
        : { deadWizardTokenCount: options.deadWizardTokenCount }),
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
  winnerPlayerId?: PlayerId,
  endReasons?: readonly GameEndReason[]
): SingleGameResult {
  const adjudication = adjudicateGame(state);
  const winnerIds =
    winnerPlayerId === undefined ? adjudication.winnerIds : [winnerPlayerId];

  return {
    seed: state.seed,
    endReason,
    isGameEnd,
    turnsElapsed: state.turn.number - 1,
    ...(endReasons === undefined || endReasons.length <= 1
      ? {}
      : { gameEndReasons: [...endReasons] }),
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
