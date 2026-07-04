import type { GameEvent } from "./setup.js";
import type { SingleGameResult } from "./simulation.js";

export interface FormatSingleGameDebugTraceOptions {
  cardNames?: ReadonlyMap<string, string>;
  tokenNames?: ReadonlyMap<string, string>;
}

export function formatSingleGameDebugTrace(
  result: SingleGameResult,
  options: FormatSingleGameDebugTraceOptions = {}
): string {
  const lines = [formatSummary(result), "", "Setup"];

  let currentGroupIdentity: string | undefined;
  for (const event of result.eventLog) {
    if (event.type === "gameInitialized") {
      lines.push("- Game initialized.");
      continue;
    }

    const formatted = formatEvent(event, options);
    if (formatted === undefined) {
      continue;
    }

    const groupIdentity = getTraceGroupIdentity(event);
    if (groupIdentity !== currentGroupIdentity) {
      currentGroupIdentity = groupIdentity;
      const header = formatTraceHeader(event);
      if (header !== undefined) {
        lines.push("", header);
      }
    }

    lines.push(formatted);
  }

  return lines.join("\n");
}

function formatSummary(result: SingleGameResult): string {
  const turnWord = result.turnsElapsed === 1 ? "turn" : "turns";
  const stopKind = result.isGameEnd ? "game end" : "technical stop";
  return `Game seed ${result.seed}: ${result.endReason} after ${result.turnsElapsed} ${turnWord} (${stopKind})`;
}

function formatEvent(
  event: GameEvent,
  options: FormatSingleGameDebugTraceOptions
): string | undefined {
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
    const effectSource =
      event.effectId === undefined ? "" : ` via ${event.effectId}`;
    return `- Move: ${formatCard(event, options)} ${formatZone(event.sourceZone)} -> ${formatZone(event.destinationZone)}${ownerDelta}${effectSource}.`;
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

  if (
    event.type === "effectDamageDealt" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    const lifeDelta =
      event.targetLifeBefore === undefined ||
      event.targetLifeAfter === undefined
        ? ""
        : ` Life ${event.targetLifeBefore} -> ${event.targetLifeAfter}.`;
    return `- Damage: ${event.playerId} deals ${event.amount ?? 0} to ${event.targetPlayerId} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${lifeDelta}`;
  }

  if (
    event.type === "effectLifeHealed" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    const lifeDelta =
      event.targetLifeBefore === undefined ||
      event.targetLifeAfter === undefined
        ? ""
        : ` Life ${event.targetLifeBefore} -> ${event.targetLifeAfter}.`;
    return `- Healing: ${event.playerId} heals ${event.targetPlayerId} for ${event.amount ?? 0} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${lifeDelta}`;
  }

  if (
    event.type === "effectLifeSet" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    const lifeDelta =
      event.targetLifeBefore === undefined ||
      event.targetLifeAfter === undefined
        ? ""
        : ` Life ${event.targetLifeBefore} -> ${event.targetLifeAfter}.`;
    return `- Life set: ${event.playerId} sets ${event.targetPlayerId} to ${event.amount ?? 0} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${lifeDelta}`;
  }

  if (event.type === "playerDied" && event.playerId !== undefined) {
    const lifeSuffix =
      event.lifeAfter === undefined
        ? ""
        : ` after reaching ${event.lifeAfter} life`;
    return `- Death: ${event.playerId} is defeated${lifeSuffix}.`;
  }

  if (
    event.type === "trophyControlChanged" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    return `- Trophy: Basic Trophy moves to ${event.playerId} after defeating ${event.targetPlayerId} with ${formatCard(event, options)}.`;
  }

  if (event.type === "deadWizardTokenGained" && event.playerId !== undefined) {
    return `- DWT: ${event.playerId} gains ${formatToken(event, options)}.`;
  }

  if (event.type === "playerResurrected" && event.playerId !== undefined) {
    if (event.lifeBefore !== undefined && event.lifeAfter !== undefined) {
      return `- Resurrection: ${event.playerId} life ${event.lifeBefore} -> ${event.lifeAfter}.`;
    }

    return `- Resurrection: ${event.playerId} returns at ${event.amount ?? 0} life.`;
  }

  if (event.type === "defenseCostPaid" && event.playerId !== undefined) {
    if (
      event.effectId === "spend_chips" &&
      event.chipsBefore !== undefined &&
      event.chipsAfter !== undefined
    ) {
      return `- Defense cost: ${event.playerId} pays ${event.amount ?? 0} chips with ${formatCard(event, options)}. Chips ${event.chipsBefore} -> ${event.chipsAfter}.`;
    }

    if (
      event.effectId === "pay_life" &&
      event.lifeBefore !== undefined &&
      event.lifeAfter !== undefined
    ) {
      return `- Defense cost: ${event.playerId} pays ${event.amount ?? 0} life with ${formatCard(event, options)}. Life ${event.lifeBefore} -> ${event.lifeAfter}.`;
    }

    if (event.effectId === "discard_other_hand_card") {
      return `- Defense cost: ${event.playerId} discards ${formatTargetCard(event, options)} for ${formatCard(event, options)}.`;
    }
  }

  if (event.type === "marketFlowCardAdded") {
    return `- Market Flow: added ${formatCard(event, options)} to market.`;
  }

  if (event.type === "marketChipAdded") {
    return `- Market chip: ${formatCard(event, options)} gains +${event.amount ?? 0} market chip.`;
  }

  if (event.type === "mayhemResolved" && event.playerId !== undefined) {
    return `- Mayhem: ${formatCard(event, options)} resolves for ${event.playerId}.`;
  }

  if (
    event.type === "mayhemDestroyed" ||
    event.type === "megaMayhemDestroyed"
  ) {
    return `- Market Flow: ${formatCard(event, options)} is destroyed.`;
  }

  return undefined;
}

function getTraceGroupIdentity(event: GameEvent): string {
  if (event.actionSequence !== undefined) {
    return `action:${event.actionSequence}`;
  }

  return `turn:${event.turnNumber ?? "?"}:${event.playerId ?? "<unknown-player>"}`;
}

function formatTraceHeader(event: GameEvent): string | undefined {
  if (event.actionSequence !== undefined && event.playerId !== undefined) {
    const actionIdentity =
      event.actionIdentity === undefined ? "" : ` (${event.actionIdentity})`;
    return `Turn ${event.turnNumber ?? "?"}, Action ${event.actionSequence} - ${event.playerId}${actionIdentity}`;
  }

  if (event.playerId !== undefined) {
    return `Turn ${event.turnNumber ?? "?"} - ${event.playerId}`;
  }

  return undefined;
}

function formatCard(
  event: GameEvent,
  options: FormatSingleGameDebugTraceOptions
): string {
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

function formatTargetCard(
  event: GameEvent,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionId = event.targetDefinitionId ?? "<unknown-card>";
  const label = options.cardNames?.get(definitionId) ?? definitionId;
  if (event.targetCardInstanceId === undefined) {
    return label;
  }

  return `${label} (${event.targetCardInstanceId})`;
}

function formatToken(
  event: GameEvent,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionId = event.tokenDefinitionId ?? "<unknown-token>";
  const label = options.tokenNames?.get(definitionId) ?? definitionId;
  if (event.tokenInstanceId === undefined) {
    return label;
  }

  return `${label} (${event.tokenInstanceId})`;
}
