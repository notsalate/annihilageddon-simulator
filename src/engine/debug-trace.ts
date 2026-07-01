import type { GameEvent } from "./setup.js";
import type { SingleGameResult } from "./simulation.js";

export interface FormatSingleGameDebugTraceOptions {
  cardNames?: ReadonlyMap<string, string>;
  tokenNames?: ReadonlyMap<string, string>;
}

export function formatSingleGameDebugTrace(
  result: SingleGameResult,
  options: FormatSingleGameDebugTraceOptions = {},
): string {
  const lines = [
    formatSummary(result),
    "",
    "Setup",
  ];

  let currentTurnPlayer: string | undefined;
  for (const event of result.eventLog) {
    if (event.type === "gameInitialized") {
      lines.push("- Game initialized.");
      continue;
    }

    const formatted = formatEvent(event, options);
    if (formatted === undefined) {
      continue;
    }

    if (event.playerId !== undefined && getTurnHeaderIdentity(event) !== currentTurnPlayer) {
      currentTurnPlayer = getTurnHeaderIdentity(event);
      lines.push("", `${formatTurnHeader(event)} - ${event.playerId}`);
    }

    lines.push(formatted);
  }

  lines.push(
    "",
    "Missing instrumentation",
    "- turn number for each event",
    "- before/after hand, played, discard, deck, market and destroyed zones",
    "- before/after life totals and remaining state-changing effects",
  );

  return lines.join("\n");
}

function formatSummary(result: SingleGameResult): string {
  const turnWord = result.turnsElapsed === 1 ? "turn" : "turns";
  const stopKind = result.isGameEnd ? "game end" : "technical stop";
  return `Game seed ${result.seed}: ${result.endReason} after ${result.turnsElapsed} ${turnWord} (${stopKind})`;
}

function formatEvent(event: GameEvent, options: FormatSingleGameDebugTraceOptions): string | undefined {
  if (event.type === "botActionSelected") {
    return `- Bot selected ${event.actionIdentity ?? "an action"}.`;
  }

  if (event.type === "effectAddPowerApplied" && event.playerId !== undefined) {
    if (event.powerBefore !== undefined && event.powerAfter !== undefined) {
      return `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} power ${event.powerBefore} -> ${event.powerAfter}.`;
    }

    return `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} gains +${event.amount ?? 0} power.`;
  }

  if (event.type === "effectChipsGained" && event.playerId !== undefined) {
    if (event.chipsBefore !== undefined && event.chipsAfter !== undefined) {
      return `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} chips ${event.chipsBefore} -> ${event.chipsAfter}.`;
    }

    return `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} gains +${event.amount ?? 0} chips.`;
  }

  if (event.type === "marketChipsGained" && event.playerId !== undefined) {
    if (event.chipsBefore !== undefined && event.chipsAfter !== undefined) {
      return `- Market chips from ${formatCard(event, options)}: ${event.playerId} chips ${event.chipsBefore} -> ${event.chipsAfter}.`;
    }

    return `- Market chips from ${formatCard(event, options)}: ${event.playerId} gains +${event.amount ?? 0} chips.`;
  }

  if (event.type === "cardMoved") {
    const ownerDelta =
      event.ownerBefore === undefined || event.ownerAfter === undefined
        ? ""
        : `, owner ${event.ownerBefore} -> ${event.ownerAfter}`;
    return `- Move: ${formatCard(event, options)} ${formatZone(event.sourceZone)} -> ${formatZone(event.destinationZone)}${ownerDelta}.`;
  }

  if (event.type === "cardPlayed") {
    return `- Played ${formatCard(event, options)}.`;
  }

  if (event.type === "cardBought") {
    return `- Bought ${formatCard(event, options)} -> ${event.destination ?? "<unknown-zone>"}.`;
  }

  if (event.type === "effectCardGained" && event.playerId !== undefined) {
    return `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} chooses ${formatTargetCard(event, options)} -> ${event.destination ?? "<unknown-zone>"}.`;
  }

  if (event.type === "defenseChoiceSelected" && event.playerId !== undefined) {
    return `- Defense: ${event.playerId} chooses ${formatCard(event, options)} for ${event.effectId ?? "<unknown>"}.`;
  }

  if (event.type === "defenseCardMoved") {
    return `- Zone move: ${formatCard(event, options)} -> ${event.destination ?? "<unknown-zone>"}.`;
  }

  if (event.type === "effectDamageDealt" && event.playerId !== undefined && event.targetPlayerId !== undefined) {
    return `- Damage: ${event.playerId} deals ${event.amount ?? 0} to ${event.targetPlayerId} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.`;
  }

  if (event.type === "playerDied" && event.playerId !== undefined) {
    return `- Death: ${event.playerId} is defeated.`;
  }

  if (event.type === "trophyControlChanged" && event.playerId !== undefined && event.targetPlayerId !== undefined) {
    return `- Trophy: Basic Trophy moves to ${event.playerId} after defeating ${event.targetPlayerId} with ${formatCard(event, options)}.`;
  }

  if (event.type === "deadWizardTokenGained" && event.playerId !== undefined) {
    return `- DWT: ${event.playerId} gains ${formatToken(event, options)}.`;
  }

  if (event.type === "playerResurrected" && event.playerId !== undefined) {
    return `- Resurrection: ${event.playerId} returns at ${event.amount ?? 0} life.`;
  }

  return undefined;
}

function getTurnHeaderIdentity(event: GameEvent): string {
  return `${event.turnNumber ?? "?"}:${event.playerId ?? "<unknown-player>"}`;
}

function formatTurnHeader(event: GameEvent): string {
  return `Turn ${event.turnNumber ?? "?"}`;
}

function formatCard(event: GameEvent, options: FormatSingleGameDebugTraceOptions): string {
  const definitionId = event.definitionId ?? "<unknown-card>";
  const label = options.cardNames?.get(definitionId) ?? definitionId;
  if (event.cardInstanceId === undefined) {
    return label;
  }

  return `${label} (${event.cardInstanceId})`;
}

function formatZone(zone: string | undefined): string {
  if (zone === undefined) {
    return "<unknown-zone>";
  }

  if (zone === "mainMarket") {
    return "main market";
  }

  if (zone === "legendMarket") {
    return "legend market";
  }

  const playerZone = zone.match(/^(player-\d+)\.(.+)$/);
  if (playerZone === null) {
    return zone;
  }

  const [, playerId, zoneName] = playerZone;
  if (playerId === undefined || zoneName === undefined) {
    return zone;
  }

  return `${playerId} ${formatPlayerZoneName(zoneName)}`;
}

function formatPlayerZoneName(zoneName: string): string {
  if (zoneName === "playedThisTurn") {
    return "played this turn";
  }

  if (zoneName === "deckTop") {
    return "deck top";
  }

  if (zoneName === "unboughtFamiliar") {
    return "unbought familiar";
  }

  return zoneName;
}

function formatTargetCard(event: GameEvent, options: FormatSingleGameDebugTraceOptions): string {
  const definitionId = event.targetDefinitionId ?? "<unknown-card>";
  const label = options.cardNames?.get(definitionId) ?? definitionId;
  if (event.targetCardInstanceId === undefined) {
    return label;
  }

  return `${label} (${event.targetCardInstanceId})`;
}

function formatToken(event: GameEvent, options: FormatSingleGameDebugTraceOptions): string {
  const definitionId = event.tokenDefinitionId ?? "<unknown-token>";
  const label = options.tokenNames?.get(definitionId) ?? definitionId;
  if (event.tokenInstanceId === undefined) {
    return label;
  }

  return `${label} (${event.tokenInstanceId})`;
}
