import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSingleGameDebugTrace,
  type SingleGameResult,
} from "../src/index.js";
import { markCardDefinitionId, markPlayerId } from "../src/domain/types.js";
import { initializeGame } from "../src/engine/setup.js";
import type {
  GameEvent,
  GameEventDestination,
  GameEventSourceType,
  GameEventDraft,
} from "../src/engine/setup.js";
import { recordGameEvent } from "../src/engine/event-recorder.js";

test("recordGameEvent enriches a closed event draft", () => {
  const state = initializeGame({ rootDir: process.cwd(), seed: 90117 });
  const player = state.players[0];
  assert.ok(player);
  recordGameEvent(state, {
    type: "turnStarted",
    playerId: player.playerId,
  });
  const event = state.eventLog.at(-1);
  assert.ok(event);
  assert.equal(event.type, "turnStarted");
  assert.equal(event.playerId, player.playerId);
  assert.equal(event.turnNumber, state.turn.number);
  assert.ok(event.eventSequence !== undefined);
});

const knownGameEventType: GameEvent["type"] = "cardMoved";
type HasDeclaredGameEventTypes = string extends GameEvent["type"]
  ? false
  : true;
const hasDeclaredGameEventTypes: HasDeclaredGameEventTypes = true;
const knownEventSourceType: GameEventSourceType = "wizardProperty";
const knownEventDestination: GameEventDestination = "deckTop";
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type AssertTrue<T extends true> = T;
type AssertFalse<T extends false> = T;
type InvalidTurnStartedDraft = {
  type: "turnStarted";
  playerId: ReturnType<typeof markPlayerId>;
  eventSequence: number;
};
type TurnStartedDraftRejectsMetadata = AssertFalse<
  IsAssignable<InvalidTurnStartedDraft, GameEventDraft>
>;
type IncompleteDamageEvent = {
  type: "effectDamageDealt";
  playerId: ReturnType<typeof markPlayerId>;
  cardInstanceId: "card-1";
  definitionId: ReturnType<typeof markCardDefinitionId>;
  effectId: "deal_damage";
  sourceType: "card";
};
type CompleteDamageEvent = IncompleteDamageEvent & {
  targetPlayerId: ReturnType<typeof markPlayerId>;
  amount: number;
};
type InitializedEventWithForeignPayload = {
  type: "gameInitialized";
  targetPlayerId: ReturnType<typeof markPlayerId>;
  amount: number;
};
type IncompleteDamageIsRejected = AssertFalse<
  IsAssignable<IncompleteDamageEvent, GameEvent>
>;
type CompleteDamageIsAccepted = AssertTrue<
  IsAssignable<CompleteDamageEvent, GameEvent>
>;
type InitializedEventRejectsForeignPayload = AssertFalse<
  IsAssignable<InitializedEventWithForeignPayload, GameEvent>
>;

type IncompleteEffectChoiceEvent = {
  type: "effectChoiceSelected";
  playerId: ReturnType<typeof markPlayerId>;
  cardInstanceId: string;
  definitionId: ReturnType<typeof markCardDefinitionId>;
  effectId: string;
  sourceType: "card";
};
type IncompleteEffectChoiceRejected = AssertFalse<
  IsAssignable<IncompleteEffectChoiceEvent, GameEvent>
>;

type CardEffectChoiceWithoutKind = {
  type: "effectChoiceSelected";
  playerId: ReturnType<typeof markPlayerId>;
  cardInstanceId: string;
  definitionId: ReturnType<typeof markCardDefinitionId>;
  effectId: string;
  sourceType: "card";
  targetCardInstanceId: string;
  targetDefinitionId: string;
};
type CardEffectChoiceWithoutKindRejected = AssertFalse<
  IsAssignable<CardEffectChoiceWithoutKind, GameEvent>
>;
type SelectedCardEffectChoiceEvent = CardEffectChoiceWithoutKind & {
  choiceKind: "cardTarget";
};
type SelectedCardEffectChoiceAccepted = AssertTrue<
  IsAssignable<SelectedCardEffectChoiceEvent, GameEvent>
>;
type CardEffectChoiceWithForeignPlayerTarget = SelectedCardEffectChoiceEvent & {
  targetPlayerId: ReturnType<typeof markPlayerId>;
};
type CardEffectChoiceRejectsForeignPlayerTarget = AssertFalse<
  IsAssignable<CardEffectChoiceWithForeignPlayerTarget, GameEvent>
>;
type OptionEffectChoiceWithForeignCardTarget = {
  type: "effectChoiceSelected";
  playerId: ReturnType<typeof markPlayerId>;
  cardInstanceId: string;
  definitionId: ReturnType<typeof markCardDefinitionId>;
  effectId: string;
  sourceType: "card";
  choiceKind: "option";
  choiceId: string;
  choiceIds: string[];
  legalChoiceCount: number;
  targetCardInstanceId: string;
};
type OptionEffectChoiceRejectsForeignCardTarget = AssertFalse<
  IsAssignable<OptionEffectChoiceWithForeignCardTarget, GameEvent>
>;
type ValidOptionEffectChoice = Omit<
  OptionEffectChoiceWithForeignCardTarget,
  "targetCardInstanceId"
>;
type ValidOptionEffectChoiceAccepted = AssertTrue<
  IsAssignable<ValidOptionEffectChoice, GameEvent>
>;
test("event payload types reject incomplete choices", () => {
  assert.equal(knownGameEventType, "cardMoved");
  assert.equal(hasDeclaredGameEventTypes, true);
  assert.equal(knownEventSourceType, "wizardProperty");
  assert.equal(knownEventDestination, "deckTop");
  const turnStartedDraftRejectsMetadata: TurnStartedDraftRejectsMetadata = false;
  const incompleteDamageIsRejected: IncompleteDamageIsRejected = false;
  const completeDamageIsAccepted: CompleteDamageIsAccepted = true;
  const initializedEventRejectsForeignPayload: InitializedEventRejectsForeignPayload = false;
  const incompleteEffectChoiceRejected: IncompleteEffectChoiceRejected = false;
  const cardEffectChoiceWithoutKindRejected: CardEffectChoiceWithoutKindRejected = false;
  const selectedCardEffectChoiceAccepted: SelectedCardEffectChoiceAccepted = true;
  const cardEffectChoiceRejectsForeignPlayerTarget: CardEffectChoiceRejectsForeignPlayerTarget = false;
  const optionEffectChoiceRejectsForeignCardTarget: OptionEffectChoiceRejectsForeignCardTarget = false;
  const validOptionEffectChoiceAccepted: ValidOptionEffectChoiceAccepted = true;
  assert.equal(turnStartedDraftRejectsMetadata, false);
  assert.equal(incompleteDamageIsRejected, false);
  assert.equal(completeDamageIsAccepted, true);
  assert.equal(initializedEventRejectsForeignPayload, false);
  assert.equal(incompleteEffectChoiceRejected, false);
  assert.equal(cardEffectChoiceWithoutKindRejected, false);
  assert.equal(selectedCardEffectChoiceAccepted, true);
  assert.equal(cardEffectChoiceRejectsForeignPlayerTarget, false);
  assert.equal(optionEffectChoiceRejectsForeignCardTarget, false);
  assert.equal(validOptionEffectChoiceAccepted, true);
});

test("single-game debug trace summarizes card play and effect resolution in game terms", () => {
  const result: SingleGameResult = {
    seed: 60615,
    endReason: "maxTurnsReached",
    isGameEnd: false,
    turnsElapsed: 1,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: [
      { type: "gameInitialized" },
      {
        type: "botActionSelected",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
      },
      {
        type: "effectAddPowerApplied",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
        cardInstanceId: "card-7",
        definitionId: markCardDefinitionId("fixture-power-card"),
        effectId: "add_power",
        amount: 2,
        powerBefore: 0,
        powerAfter: 2,
        sourceType: "card",
      },
      {
        type: "effectChipsGained",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
        cardInstanceId: "card-8",
        definitionId: markCardDefinitionId("fixture-chip-card"),
        effectId: "gain_chips",
        amount: 1,
        chipsBefore: 0,
        chipsAfter: 1,
        sourceType: "card",
      },
      {
        type: "marketChipsGained",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
        cardInstanceId: "card-9",
        definitionId: markCardDefinitionId("fixture-market-card"),
        amount: 2,
        chipsBefore: 1,
        chipsAfter: 3,
      },
      {
        type: "cardMoved",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
        cardInstanceId: "card-10",
        definitionId: markCardDefinitionId("fixture-moved-card"),
        sourceZone: "mainMarket",
        destinationZone: "player-1.discard",
        ownerBefore: "common",
        ownerAfter: markPlayerId("player-1"),
      },
      {
        type: "cardPlayed",
        playerId: markPlayerId("player-1"),
        turnNumber: 1,
        actionSequence: 1,
        actionIdentity: "playCard",
        cardInstanceId: "card-7",
        definitionId: markCardDefinitionId("fixture-power-card"),
      },
    ],
  };

  assert.equal(
    formatSingleGameDebugTrace(result, {
      cardNames: new Map([
        ["fixture-power-card", "Мощный тестовый посох"],
        ["fixture-chip-card", "Чиповый тестовый посох"],
        ["fixture-market-card", "Рыночная карта"],
        ["fixture-moved-card", "Купленная карта"],
      ]),
    }),
    [
      "Game seed 60615: maxTurnsReached after 1 turn (technical stop)",
      "",
      "Setup",
      "- Game initialized.",
      "",
      "Turn 1, Action 1 - player-1 (playCard)",
      "- Bot selected playCard.",
      "- Effect add_power from Мощный тестовый посох (card-7): player-1 power 0 -> 2.",
      "- Effect gain_chips from Чиповый тестовый посох (card-8): player-1 chips 0 -> 1.",
      "- Market chips from Рыночная карта (card-9): player-1 chips 1 -> 3.",
      "- Move: Купленная карта (card-10) main market -> player-1 discard, owner common -> player-1.",
      "- Played Мощный тестовый посох (card-7).",
    ].join("\n")
  );
});

test("single-game debug trace summarizes targeting, zone movement, defense, death, DWT, and Trophy events", () => {
  const result: SingleGameResult = {
    seed: 707,
    endReason: "deadWizardTokensExhausted",
    isGameEnd: true,
    turnsElapsed: 4,
    players: [],
    winnerIds: [],
    isTie: false,
    eventLog: [
      { type: "gameInitialized" },
      {
        type: "cardBought",
        playerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 1,
        actionIdentity: "buyMarketCard:mainMarket",
        cardInstanceId: "card-21",
        definitionId: markCardDefinitionId("fixture-market-card"),
        destination: "discard",
      },
      {
        type: "effectCardGained",
        playerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 1,
        actionIdentity: "buyMarketCard:mainMarket",
        cardInstanceId: "card-7",
        definitionId: markCardDefinitionId("fixture-gain-card"),
        targetCardInstanceId: "card-22",
        targetDefinitionId: "fixture-target-card",
        effectId: "gain_card",
        destination: "deckTop",
        sourceType: "card",
      },
      {
        type: "defenseChoiceSelected",
        playerId: markPlayerId("player-2"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        cardInstanceId: "card-9",
        definitionId: markCardDefinitionId("fixture-defense-card"),
        effectId: "avoid_attack",
      },
      {
        type: "defenseCardMoved",
        playerId: markPlayerId("player-2"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        cardInstanceId: "card-9",
        definitionId: markCardDefinitionId("fixture-defense-card"),
        destination: "discard",
      },
      {
        type: "effectDamageDealt",
        playerId: markPlayerId("player-2"),
        targetPlayerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        cardInstanceId: "card-9",
        definitionId: markCardDefinitionId("fixture-defense-card"),
        effectId: "deal_damage",
        amount: 3,
        targetLifeBefore: 2,
        targetLifeAfter: -1,
        sourceType: "card",
      },
      {
        type: "playerDied",
        playerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        lifeAfter: -1,
      },
      {
        type: "trophyControlChanged",
        playerId: markPlayerId("player-2"),
        targetPlayerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        cardInstanceId: "card-9",
        definitionId: markCardDefinitionId("fixture-defense-card"),
        effectId: "deal_damage",
        sourceType: "card",
      },
      {
        type: "deadWizardTokenGained",
        playerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        tokenInstanceId: "token-4",
        tokenDefinitionId: "fixture-dwt",
      },
      {
        type: "playerResurrected",
        playerId: markPlayerId("player-1"),
        turnNumber: 4,
        actionSequence: 2,
        actionIdentity: "playCard",
        amount: 20,
        lifeBefore: -1,
        lifeAfter: 20,
      },
    ],
  };

  assert.equal(
    formatSingleGameDebugTrace(result, {
      cardNames: new Map([
        ["fixture-market-card", "Рыночная карта"],
        ["fixture-gain-card", "Карта получения"],
        ["fixture-target-card", "Целевая карта"],
        ["fixture-defense-card", "Защитная карта"],
      ]),
      tokenNames: new Map([["fixture-dwt", "Жетон мертвого волшебника"]]),
    }),
    [
      "Game seed 707: deadWizardTokensExhausted after 4 turns (game end)",
      "",
      "Setup",
      "- Game initialized.",
      "",
      "Turn 4, Action 1 - player-1 (buyMarketCard:mainMarket)",
      "- Bought Рыночная карта (card-21) -> discard.",
      "- Effect gain_card from Карта получения (card-7): player-1 chooses Целевая карта (card-22) -> deckTop.",
      "",
      "Turn 4, Action 2 - player-2 (playCard)",
      "- Defense: player-2 chooses Защитная карта (card-9) for avoid_attack.",
      "- Zone move: Защитная карта (card-9) -> discard.",
      "- Damage: player-2 deals 3 to player-1 with Защитная карта (card-9) via deal_damage. Life 2 -> -1.",
      "- Death: player-1 is defeated after reaching -1 life.",
      "- Trophy: Basic Trophy moves to player-2 after defeating player-1 with Защитная карта (card-9).",
      "- DWT: player-1 gains Жетон мертвого волшебника (token-4).",
      "- Resurrection: player-1 life -1 -> 20.",
    ].join("\n")
  );
});
