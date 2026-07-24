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

export function getControlledOngoingCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  return getControlledCards(state, player).filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition?.engine.playableInV0 === true &&
      definition.engine.isOngoing
    );
  });
}

export function findCardLocation(
  state: GameState,
  cardInstanceId: string
): CardLocation | undefined {
  const location = findRemovableCardLocation(state, cardInstanceId);
  if (location === undefined) {
    return undefined;
  }
  return { card: location.card, zoneName: location.zoneName };
}

export function removeCardFromLocation(
  state: GameState,
  cardInstanceId: string
): CardLocation | undefined {
  const location = findRemovableCardLocation(state, cardInstanceId);
  if (location === undefined) {
    return undefined;
  }
  location.remove();
  return { card: location.card, zoneName: location.zoneName };
}

interface RemovableCardLocation extends CardLocation {
  remove(): void;
}

function findRemovableCardLocation(
  state: GameState,
  cardInstanceId: string
): RemovableCardLocation | undefined {
  for (const player of state.players) {
    const familiar = player.unboughtFamiliar;
    if (familiar?.instanceId === cardInstanceId) {
      return {
        card: familiar,
        zoneName: `${player.playerId}.unboughtFamiliar`,
        remove() {
          player.unboughtFamiliar = undefined;
        },
      };
    }
  }

  for (const { zoneName, zone } of listPhysicalCardZones(state)) {
    const index = zone.findIndex(
      (candidate) => candidate.instanceId === cardInstanceId
    );
    if (index < 0) {
      continue;
    }
    const card = zone[index];
    if (card === undefined) {
      continue;
    }
    return {
      card,
      zoneName,
      remove() {
        zone.splice(index, 1);
      },
    };
  }

  return undefined;
}

function listPhysicalCardZones(
  state: GameState
): Array<{ zoneName: string; zone: CardInstance[] }> {
  return [
    ...state.players.flatMap((player) => [
      { zoneName: `${player.playerId}.deck`, zone: player.deck },
      { zoneName: `${player.playerId}.hand`, zone: player.hand },
      { zoneName: `${player.playerId}.discard`, zone: player.discard },
      {
        zoneName: `${player.playerId}.playedThisTurn`,
        zone: player.playedThisTurn,
      },
      { zoneName: `${player.playerId}.permanents`, zone: player.permanents },
    ]),
    { zoneName: "mainMarket", zone: state.common.market },
    { zoneName: "legendMarket", zone: state.common.legendMarket },
    { zoneName: "mainDeck", zone: state.common.mainDeck },
    { zoneName: "legendDeck", zone: state.common.legendDeck },
    { zoneName: "wildMagicStack", zone: state.common.wildMagicStack },
    { zoneName: "limpWandStack", zone: state.common.limpWandStack },
    { zoneName: "destroyedPile", zone: state.common.destroyedPile },
    { zoneName: "destroyedMayhem", zone: state.common.destroyedMayhem },
    {
      zoneName: "destroyedMegaMayhem",
      zone: state.common.destroyedMegaMayhem,
    },
  ];
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
