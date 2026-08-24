import type { GameEventForTrace } from "./setup.js";
import type {
  SetupCardSnapshot,
  SetupPlayerSnapshot,
  SetupStateSnapshot,
  SetupTokenSnapshot,
  SingleGameResult,
} from "./simulation.js";

export interface FormatSingleGameDebugTraceOptions {
  cardNames?: ReadonlyMap<string, string>;
  cardTexts?: ReadonlyMap<string, string>;
  tokenNames?: ReadonlyMap<string, string>;
  tokenTexts?: ReadonlyMap<string, string>;
}

export function formatSingleGameDebugTrace(
  result: SingleGameResult,
  options: FormatSingleGameDebugTraceOptions = {}
): string {
  const lines = [formatSummary(result), "", "Setup"];
  if (result.setupState !== undefined) {
    lines.push(...formatSetupState(result.setupState, options));
  }
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

    if (isSetupTraceEvent(event)) {
      lines.push(formatted);
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

function formatSetupState(
  setupState: SetupStateSnapshot,
  options: FormatSingleGameDebugTraceOptions
): string[] {
  return [
    "- Post-setup state:",
    ...setupState.players.map((player) => formatSetupPlayer(player, options)),
    `  - main market (${setupState.mainMarket.length}): ${formatSetupCards(setupState.mainMarket, options)}.`,
    `  - legend market (${setupState.legendMarket.length}): ${formatSetupCards(setupState.legendMarket, options)}.`,
    `  - stacks: main deck ${setupState.mainDeckSize}, legend deck ${setupState.legendDeckSize}, wild magic ${setupState.wildMagicStackSize}, limp wand ${setupState.limpWandStackSize}, DWT ${setupState.deadWizardTokenStackSize}.`,
  ];
}

function formatSetupPlayer(
  player: SetupPlayerSnapshot,
  options: FormatSingleGameDebugTraceOptions
): string {
  const parts = [
    `life ${player.life}/${player.maxLife}`,
    `chips ${player.chips}`,
    `hand ${player.handSize} [${formatSetupCards(player.hand, options)}]`,
    `deck ${player.deckSize}`,
    `wizard properties [${formatSetupTokens(player.wizardProperties, options)}]`,
  ];
  if (player.unboughtFamiliar !== undefined) {
    parts.push(`familiar ${formatSetupCard(player.unboughtFamiliar, options)}`);
  }
  if (player.statuses.length > 0) {
    parts.push(`statuses [${player.statuses.join(", ")}]`);
  }

  return `  - ${player.playerId}: ${parts.join(", ")}.`;
}

function formatSetupCards(
  cards: readonly SetupCardSnapshot[],
  options: FormatSingleGameDebugTraceOptions
): string {
  return cards.length === 0
    ? "none"
    : cards.map((card) => formatSetupCard(card, options)).join(", ");
}

function formatSetupCard(
  card: SetupCardSnapshot,
  options: FormatSingleGameDebugTraceOptions
): string {
  const label = options.cardNames?.get(card.definitionId) ?? card.definitionId;
  const chipSuffix = card.marketChips > 0 ? ` +${card.marketChips} chip` : "";
  return `${label} (${card.instanceId})${chipSuffix}`;
}

function formatSetupTokens(
  tokens: readonly SetupTokenSnapshot[],
  options: FormatSingleGameDebugTraceOptions
): string {
  return tokens.length === 0
    ? "none"
    : tokens.map((token) => formatSetupToken(token, options)).join(", ");
}

function formatSetupToken(
  token: SetupTokenSnapshot,
  options: FormatSingleGameDebugTraceOptions
): string {
  const label =
    options.tokenNames?.get(token.definitionId) ?? token.definitionId;
  return `${label} (${token.instanceId})`;
}

function formatEvent(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string | undefined {
  if (event.type === "setupChoiceSelected" && event.playerId !== undefined) {
    const candidates = (event.candidateDefinitionIds ?? [])
      .map((id) => formatDefinitionLabel(id, event, options))
      .join(", ");
    const chosen =
      event.chosenDefinitionId === undefined
        ? "<unknown-choice>"
        : formatDefinitionLabel(event.chosenDefinitionId, event, options);
    const textSuffix =
      event.chosenDefinitionId === undefined
        ? ""
        : formatDefinitionTextSuffix(event.chosenDefinitionId, event, options);
    return `- Setup choice (${event.setupChoiceKind ?? "unknown"}): ${event.playerId} candidates [${candidates}] -> ${chosen} via ${event.policyId ?? "<unknown-policy>"}.${textSuffix}`;
  }

  if (event.type === "botActionSelected") {
    return `- Bot selected ${event.actionIdentity ?? "an action"}.`;
  }

  if (event.type === "effectAddPowerApplied" && event.playerId !== undefined) {
    return event.powerBefore !== undefined && event.powerAfter !== undefined
      ? `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} power ${event.powerBefore} -> ${event.powerAfter}.`
      : `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} gains +${event.amount ?? 0} power.`;
  }

  if (event.type === "effectChipsGained" && event.playerId !== undefined) {
    return event.chipsBefore !== undefined && event.chipsAfter !== undefined
      ? `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} chips ${event.chipsBefore} -> ${event.chipsAfter}.`
      : `- Effect ${event.effectId ?? "<unknown>"} from ${formatCard(event, options)}: ${event.playerId} gains +${event.amount ?? 0} chips.`;
  }

  if (event.type === "marketChipsGained" && event.playerId !== undefined) {
    return `- Market chips from ${formatCard(event, options)}: ${event.playerId} chips ${event.chipsBefore} -> ${event.chipsAfter}.`;
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
    return `- Played ${formatCard(event, options)}.${formatTextSuffix(event, options)}`;
  }

  if (event.type === "cardBought") {
    return `- Bought ${formatCard(event, options)} -> ${event.destination ?? "<unknown-zone>"}${formatPaymentSummary(event)}.`;
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
    return `- Damage: ${event.playerId} deals ${event.amount ?? 0} to ${event.targetPlayerId} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${formatTargetLifeDelta(event)}`;
  }

  if (
    event.type === "effectLifeHealed" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    return `- Healing: ${event.playerId} heals ${event.targetPlayerId} for ${event.amount ?? 0} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${formatTargetLifeDelta(event)}`;
  }

  if (
    event.type === "effectLifeSet" &&
    event.playerId !== undefined &&
    event.targetPlayerId !== undefined
  ) {
    return `- Life set: ${event.playerId} sets ${event.targetPlayerId} to ${event.amount ?? 0} with ${formatCard(event, options)} via ${event.effectId ?? "<unknown>"}.${formatTargetLifeDelta(event)}`;
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

  if (
    event.type === "deadWizardTokenFaceResolved" &&
    event.playerId !== undefined
  ) {
    return `- DWT: ${formatToken(event, options)} resolves for ${event.playerId}.`;
  }

  if (event.type === "playerResurrected" && event.playerId !== undefined) {
    return `- Resurrection: ${event.playerId} life ${event.lifeBefore} -> ${event.lifeAfter}.`;
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

  if (event.type === "endTurnCleanupMoved" && event.playerId !== undefined) {
    return `- End turn cleanup: ${event.playerId} moves ${event.amount ?? 0} card(s) ${formatZone(event.sourceZone)} -> ${formatZone(event.destinationZone)}${formatTargetDefinitionList(event, options)}.`;
  }

  if (event.type === "handDrawn" && event.playerId !== undefined) {
    const requestedCount = event.amount ?? 0;
    const drawnCount = event.legalChoiceCount ?? 0;
    const handSizeAfter = event.choiceId ?? "?";
    return `- New hand: ${event.playerId} drew ${drawnCount}/${requestedCount} card(s); hand size ${handSizeAfter}${formatTargetDefinitionList(event, options)}.`;
  }

  if (event.type === "marketEventCardOpened") {
    const prefix =
      event.sourceType === "setup" ? "Setup Market Flow" : "Market Flow";
    return `- ${prefix}: opened event card ${formatCard(event, options)} for ${formatMarketName(event.destinationZone)}.${formatTextSuffix(event, options)}`;
  }

  if (event.type === "marketFlowCardAdded") {
    const prefix =
      event.sourceType === "setup" ? "Setup Market Flow" : "Market Flow";
    return `- ${prefix}: added ${formatCard(event, options)} to ${formatMarketName(event.destinationZone)}.`;
  }

  if (event.type === "marketChipAdded") {
    const prefix =
      event.sourceType === "setup" ? "Setup market chip" : "Market chip";
    return `- ${prefix}: ${formatCard(event, options)} gains +${event.amount ?? 0} market chip.`;
  }

  if (event.type === "mayhemResolved" && event.playerId !== undefined) {
    return `- Mayhem: ${formatCard(event, options)} resolves for ${event.playerId}.`;
  }

  if (
    event.type === "mayhemDestroyed" ||
    event.type === "megaMayhemDestroyed"
  ) {
    const prefix =
      event.sourceType === "setup" ? "Setup Market Flow" : "Market Flow";
    return `- ${prefix}: ${formatCard(event, options)} is destroyed.`;
  }

  return undefined;
}

function isSetupTraceEvent(event: GameEventForTrace): boolean {
  return (
    event.type === "setupChoiceSelected" ||
    event.sourceType === "setup" ||
    event.turnNumber === undefined
  );
}

function getTraceGroupIdentity(event: GameEventForTrace): string {
  return event.actionSequence === undefined
    ? `turn:${event.turnNumber ?? "?"}:${event.playerId ?? "<unknown-player>"}`
    : `action:${event.actionSequence}:turn:${event.turnNumber ?? "?"}`;
}

function formatTraceHeader(event: GameEventForTrace): string | undefined {
  if (isPreActionMarketFlowEvent(event)) {
    return `Turn ${event.turnNumber ?? "?"} — before ${event.playerId ?? "active player"} actions`;
  }
  if (event.actionSequence !== undefined && event.playerId !== undefined) {
    const actionIdentity =
      event.actionIdentity === undefined ? "" : ` (${event.actionIdentity})`;
    return `Turn ${event.turnNumber ?? "?"}, Action ${event.actionSequence} - ${event.playerId}${actionIdentity}`;
  }
  if (event.playerId !== undefined) {
    return `Turn ${event.turnNumber ?? "?"} - ${event.playerId}`;
  }
  if (event.turnNumber !== undefined) {
    return `Turn ${event.turnNumber} — before active player actions`;
  }
  return undefined;
}

function isPreActionMarketFlowEvent(event: GameEventForTrace): boolean {
  return (
    event.actionIdentity === "endTurn" &&
    [
      "marketEventCardOpened",
      "marketFlowCardAdded",
      "marketChipAdded",
      "mayhemDestroyed",
      "megaMayhemDestroyed",
    ].includes(event.type)
  );
}

function formatCard(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionId = event.definitionId ?? "<unknown-card>";
  const label = options.cardNames?.get(definitionId) ?? definitionId;
  return event.cardInstanceId === undefined
    ? label
    : `${label} (${event.cardInstanceId})`;
}

function formatTargetCard(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionId = event.targetDefinitionId ?? "<unknown-card>";
  const label = options.cardNames?.get(definitionId) ?? definitionId;
  return event.targetCardInstanceId === undefined
    ? label
    : `${label} (${event.targetCardInstanceId})`;
}

function formatToken(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionId = event.tokenDefinitionId ?? "<unknown-token>";
  const label = options.tokenNames?.get(definitionId) ?? definitionId;
  return event.tokenInstanceId === undefined
    ? label
    : `${label} (${event.tokenInstanceId})`;
}

function formatDefinitionLabel(
  definitionId: string,
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  return event.setupChoiceKind === "wizardProperty"
    ? (options.tokenNames?.get(definitionId) ?? definitionId)
    : (options.cardNames?.get(definitionId) ?? definitionId);
}

function formatTextSuffix(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const text =
    event.definitionId === undefined
      ? undefined
      : options.cardTexts?.get(event.definitionId);
  return text === undefined ? "" : formatTextBlock(text);
}

function formatDefinitionTextSuffix(
  definitionId: string,
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const text =
    event.setupChoiceKind === "wizardProperty"
      ? options.tokenTexts?.get(definitionId)
      : options.cardTexts?.get(definitionId);
  return text === undefined ? "" : formatTextBlock(text);
}

function formatTextBlock(text: string): string {
  if (!text.includes("\n")) {
    return `\n  Text: ${text}`;
  }

  return ["", "  Text:", ...text.split("\n").map((line) => `    ${line}`)].join(
    "\n"
  );
}

function formatTargetLifeDelta(event: GameEventForTrace): string {
  return event.targetLifeBefore === undefined ||
    event.targetLifeAfter === undefined
    ? ""
    : ` Life ${event.targetLifeBefore} -> ${event.targetLifeAfter}.`;
}

function formatPaymentSummary(event: GameEventForTrace): string {
  const parts: string[] = [];
  if (event.powerBefore !== undefined && event.powerAfter !== undefined) {
    parts.push(
      `power ${event.powerBefore} -> ${event.powerAfter}`,
      `spent ${event.powerBefore - event.powerAfter} power`
    );
  }
  if (event.chipsBefore !== undefined && event.chipsAfter !== undefined) {
    const chipsSpent = event.chipsBefore - event.chipsAfter;
    parts.push(`chips ${event.chipsBefore} -> ${event.chipsAfter}`);
    if (chipsSpent > 0) {
      parts.push(`spent ${chipsSpent} chips`);
    }
  }
  if (event.amount !== undefined) {
    parts.push(`effective cost ${event.amount}`);
  }
  if (event.sourceZone !== undefined) {
    parts.push(`source ${formatMarketName(event.sourceZone)}`);
  }
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

function formatTargetDefinitionList(
  event: GameEventForTrace,
  options: FormatSingleGameDebugTraceOptions
): string {
  const definitionIds = event.targetDefinitionIds ?? [];
  if (definitionIds.length === 0) {
    return "";
  }

  const cards = definitionIds.map((definitionId, index) => {
    const label = options.cardNames?.get(definitionId) ?? definitionId;
    const instanceId = event.targetCardInstanceIds?.[index];
    return instanceId === undefined ? label : `${label} (${instanceId})`;
  });
  return `: ${cards.join(", ")}`;
}

function formatMarketName(zone: string | undefined): string {
  if (zone === "mainMarket") {
    return "main market";
  }
  if (zone === "legendMarket") {
    return "legend market";
  }
  return formatZone(zone);
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
