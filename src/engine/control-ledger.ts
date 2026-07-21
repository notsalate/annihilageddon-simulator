import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TemporaryCardControl,
  TrophyLikeInstance,
} from "./setup.js";

export interface ControlledObjectView {
  playerId: PlayerId;
  cards: readonly ControlledCardObject[];
  tokens: readonly ControlledTokenObject[];
  wizardProperties: readonly ControlledTokenObject[];
  statuses: readonly StatusInstance[];
  trophyLikeObjects: readonly TrophyLikeInstance[];
}

export interface ControlledCardObject {
  sourceType: "controlledCard";
  card: CardInstance;
  definition: CardDefinition;
}

export interface ControlledTokenObject {
  sourceType: "controlledToken";
  token: TokenInstance;
  definition: TokenDefinition;
}

export interface CardLocation {
  card: CardInstance;
  zoneName: string;
}

export function buildControlledObjectView(
  state: GameState,
  playerId: PlayerId
): ControlledObjectView {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return {
    playerId,
    cards: getControlledCards(state, player).map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    })),
    tokens: player.deadWizardTokens.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    wizardProperties: player.wizardProperties.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    statuses: [...player.statuses],
    trophyLikeObjects: [...player.trophyLikeObjects],
  };
}

export function grantTemporaryControl(
  state: GameState,
  cardInstanceId: CardInstance["instanceId"],
  controllerId: PlayerId
): void {
  const existing = state.turn.temporaryCardControls.find(
    (control) => control.cardInstanceId === cardInstanceId
  );
  if (existing !== undefined) {
    existing.controllerId = controllerId;
    return;
  }

  state.turn.temporaryCardControls.push({ cardInstanceId, controllerId });
}

export function releaseTemporaryControls(state: GameState): void {
  state.turn.temporaryCardControls = [];
}

export function cloneTemporaryControls(
  controls: readonly TemporaryCardControl[]
): TemporaryCardControl[] {
  return controls.map((control) => ({ ...control }));
}

export function getControlledCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  const controlledCards = [...player.permanents];
  const controlledIds = new Set(controlledCards.map((card) => card.instanceId));

  for (const control of state.turn.temporaryCardControls) {
    if (
      control.controllerId !== player.playerId ||
      controlledIds.has(control.cardInstanceId)
    ) {
      continue;
    }

    const location = findCardLocation(state, control.cardInstanceId);
    if (location === undefined) {
      continue;
    }

    controlledCards.push(location.card);
    controlledIds.add(location.card.instanceId);
  }

  return controlledCards;
}

export function findCardLocation(
  state: GameState,
  cardInstanceId: string
): CardLocation | undefined {
  for (const player of state.players) {
    if (player.unboughtFamiliar?.instanceId === cardInstanceId) {
      return {
        card: player.unboughtFamiliar,
        zoneName: `${player.playerId}.unboughtFamiliar`,
      };
    }

    const playerZones: Array<[string, readonly CardInstance[]]> = [
      [`${player.playerId}.deck`, player.deck],
      [`${player.playerId}.hand`, player.hand],
      [`${player.playerId}.discard`, player.discard],
      [`${player.playerId}.playedThisTurn`, player.playedThisTurn],
      [`${player.playerId}.permanents`, player.permanents],
    ];
    for (const [zoneName, zone] of playerZones) {
      const card = zone.find(
        (candidate) => candidate.instanceId === cardInstanceId
      );
      if (card !== undefined) {
        return { card, zoneName };
      }
    }
  }

  const commonZones: Array<[string, readonly CardInstance[]]> = [
    ["mainMarket", state.common.market],
    ["legendMarket", state.common.legendMarket],
    ["mainDeck", state.common.mainDeck],
    ["legendDeck", state.common.legendDeck],
    ["wildMagicStack", state.common.wildMagicStack],
    ["limpWandStack", state.common.limpWandStack],
    ["destroyedPile", state.common.destroyedPile],
    ["destroyedMayhem", state.common.destroyedMayhem],
    ["destroyedMegaMayhem", state.common.destroyedMegaMayhem],
  ];
  for (const [zoneName, zone] of commonZones) {
    const card = zone.find(
      (candidate) => candidate.instanceId === cardInstanceId
    );
    if (card !== undefined) {
      return { card, zoneName };
    }
  }

  return undefined;
}

function mustGetCardDefinition(
  state: GameState,
  definitionId: CardInstance["definitionId"]
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }
  return definition;
}

function mustGetTokenDefinition(
  state: GameState,
  definitionId: TokenInstance["definitionId"]
): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }
  return definition;
}
