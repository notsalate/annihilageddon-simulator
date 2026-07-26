import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  loadCurrentRuntimeDataPack,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
} from "../src/index.js";
import { grantTemporaryControl } from "../src/engine/control-ledger.js";
import {
  calculateEndTurnDrawCount,
  executeControlledCardOnPlayCardEffects,
  executeEffect,
} from "../src/engine/effect-runtime.js";
import { getEffectRuntimeHandler } from "../src/engine/effect-runtime-registry.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";

import {
  createGameScenario,
  givenRuntimeCard,
  play,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeHandler } from "./helpers/with-temporary-effect-runtime-handler.js";

const rootDir = process.cwd();

test("trigger dispatch reads runtime mode from state before invoking the catalog operation", () => {
  const observedModes: string[] = [];
  const originalHandler = getEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand"
  );

  const results = withTemporaryEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand",
    {
      ...originalHandler,
      executeOnPlayCard(_effect, context) {
        observedModes.push(context.source.runtimeMode);
        return { status: "resolved", result: { ok: true } };
      },
    },
    () => {
      const fixtureState = initializeGame({
        rootDir,
        dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
        seed: 23007,
      });
      const fixtureController = mustGetPlayer(fixtureState, 0);
      fixtureController.permanents = [];
      addControlledEffectCard(
        fixtureState,
        fixtureController,
        fixtureController,
        "fixture-mode-trigger",
        fixtureController.permanents,
        [
          {
            effectId: "ongoing_add_power_when_playing_wand",
            timing: "onPlayCard",
            amount: 1,
            cardTags: ["wandCard"],
          },
        ]
      );
      const fixturePlayedCard = addControlledEffectCard(
        fixtureState,
        fixtureController,
        fixtureController,
        "fixture-mode-played-wand",
        fixtureController.playedThisTurn,
        [],
        { isOngoing: false, tags: ["wandCard"] }
      );
      const fixturePlayedDefinition = mustGetDefinition(
        fixtureState,
        fixturePlayedCard
      );

      const combatState = initializeGame({ rootDir, seed: 23008 });
      const combatController = mustGetPlayer(combatState, 0);
      combatController.permanents = [];
      addControlledEffectCard(
        combatState,
        combatController,
        combatController,
        "combat-mode-trigger",
        combatController.permanents,
        [
          {
            effectId: "ongoing_add_power_when_playing_wand",
            timing: "onPlayCard",
            amount: 1,
            cardTags: ["wandCard"],
          },
        ]
      );
      const combatPlayedCard = addControlledEffectCard(
        combatState,
        combatController,
        combatController,
        "combat-mode-played-wand",
        combatController.playedThisTurn,
        [],
        { isOngoing: false, tags: ["wandCard"] }
      );
      const combatPlayedDefinition = mustGetDefinition(
        combatState,
        combatPlayedCard
      );

      return [
        dispatchControlledCardOperation(fixtureState, fixtureController, {
          kind: "onPlayCard",
          playedCard: fixturePlayedCard,
          playedDefinition: fixturePlayedDefinition,
        }),
        dispatchControlledCardOperation(combatState, combatController, {
          kind: "onPlayCard",
          playedCard: combatPlayedCard,
          playedDefinition: combatPlayedDefinition,
        }),
      ];
    }
  );

  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.deepEqual(observedModes, ["fixture", "combat"]);
});

test("controlled trigger dispatch preserves Control Ledger order and card source attribution", () => {
  const state = initializeGame({ rootDir, seed: 23001 });
  const controller = mustGetPlayer(state, 0);
  const owner = mustGetPlayer(state, 1);
  controller.permanents = [];
  owner.discard = [];
  state.turn.power = 0;

  const permanent = addControlledEffectCard(
    state,
    controller,
    controller,
    "ordered-permanent",
    controller.permanents,
    [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ]
  );
  const temporary = addControlledEffectCard(
    state,
    controller,
    owner,
    "ordered-temporary",
    owner.discard,
    [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 2,
        cardTags: ["wandCard"],
      },
    ]
  );
  grantTemporaryControl(state, temporary.instanceId, controller.playerId);
  const playedCard = addControlledEffectCard(
    state,
    controller,
    controller,
    "ordered-played-wand",
    controller.playedThisTurn,
    [],
    { isOngoing: false, tags: ["wandCard"] }
  );

  const result = dispatchControlledCardOperation(state, controller, {
    kind: "onPlayCard",
    playedCard,
    playedDefinition: mustGetDefinition(state, playedCard),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.turn.power, 3);
  assert.equal(temporary.ownerId, owner.playerId);
  const triggerEvents = state.eventLog.filter(
    (event) =>
      event.type === "effectAddPowerApplied" &&
      event.effectId === "ongoing_add_power_when_playing_wand"
  );
  assert.deepEqual(
    triggerEvents.map((event) => ({
      playerId: event.playerId,
      cardInstanceId: event.cardInstanceId,
      definitionId: event.definitionId,
      sourceType: event.sourceType,
      amount: event.amount,
    })),
    [
      {
        playerId: controller.playerId,
        cardInstanceId: permanent.instanceId,
        definitionId: permanent.definitionId,
        sourceType: "card",
        amount: 1,
      },
      {
        playerId: controller.playerId,
        cardInstanceId: temporary.instanceId,
        definitionId: temporary.definitionId,
        sourceType: "card",
        amount: 2,
      },
    ]
  );
});

test("on-play compatibility wrapper leaves Wand applicability inside Trigger Dispatch and the catalog", () => {
  const state = initializeGame({ rootDir, seed: 23003 });
  const controller = mustGetPlayer(state, 0);
  const owner = mustGetPlayer(state, 1);
  controller.permanents = [];
  owner.discard = [];
  state.turn.power = 0;

  const trigger = addControlledEffectCard(
    state,
    controller,
    owner,
    "wand-on-play",
    owner.discard,
    [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ]
  );
  grantTemporaryControl(state, trigger.instanceId, controller.playerId);
  const nonWand = addControlledEffectCard(
    state,
    controller,
    controller,
    "played-non-wand",
    controller.playedThisTurn,
    [],
    { isOngoing: false }
  );
  const wand = addControlledEffectCard(
    state,
    controller,
    controller,
    "played-wand",
    controller.playedThisTurn,
    [],
    { isOngoing: false, tags: ["wandCard"] }
  );

  assert.deepEqual(
    executeControlledCardOnPlayCardEffects(state, controller, nonWand),
    { ok: true }
  );
  assert.equal(state.turn.power, 0);

  assert.deepEqual(
    executeControlledCardOnPlayCardEffects(state, controller, wand),
    { ok: true }
  );
  assert.equal(state.turn.power, 1);
  assert.ok(
    state.eventLog.some(
      (event) =>
        event.type === "effectAddPowerApplied" &&
        event.effectId === "ongoing_add_power_when_playing_wand" &&
        event.cardInstanceId === trigger.instanceId &&
        event.definitionId === trigger.definitionId &&
        event.sourceType === "card"
    )
  );
});

test("after-attack dispatch attributes a wizard-property attack trigger to the controlled card", () => {
  const state = initializeGame({ rootDir, seed: 23004 });
  const controller = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  target.hand = [];
  target.life.current = 20;
  state.turn.power = 0;
  state.turn.damagingAttackPlayerIds = [];

  const trigger = addControlledEffectCard(
    state,
    controller,
    target,
    "first-attack-power",
    target.discard,
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ]
  );
  grantTemporaryControl(state, trigger.instanceId, controller.playerId);
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined;

  const result = executeEffect(
    state,
    controller,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    {
      sourceType: "wizardProperty",
      runtimeMode: "fixture",
      playerId: controller.playerId,
      cardInstanceId: "fixture-wizard-property-attack-source",
      definitionId: "fixture-wizard-property-attack-source",
    }
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(target.life.current, 18);
  assert.equal(state.turn.power, 2);
  const triggerEvent = state.eventLog.find(
    (event) =>
      event.type === "effectAddPowerApplied" &&
      event.effectId === "ongoing_first_attack_damage_add_power"
  );
  assert.ok(triggerEvent);
  assert.equal(triggerEvent.sourceType, "card");
  assert.equal(triggerEvent.cardInstanceId, trigger.instanceId);
  assert.equal(triggerEvent.definitionId, trigger.definitionId);
});

test("after-attack dispatch propagates catalog errors without consuming first-attack eligibility", () => {
  const state = initializeGame({ rootDir, seed: 23006 });
  const controller = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  target.hand = [];
  target.life.current = 20;
  state.turn.damagingAttackPlayerIds = [];

  addControlledEffectCard(
    state,
    controller,
    controller,
    "invalid-first-attack-trigger",
    controller.permanents,
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: 1,
      } as unknown as RuntimeEffect,
    ]
  );
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined;

  const result = executeEffect(
    state,
    controller,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    {
      sourceType: "card",
      runtimeMode: "fixture",
      playerId: controller.playerId,
      cardInstanceId: "fixture-invalid-trigger-attack",
      definitionId: "fixture-invalid-trigger-attack",
    }
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amount must be totalDamageDealtByThatAttack/);
  assert.equal(
    state.turn.damagingAttackPlayerIds.includes(controller.playerId),
    false
  );
});

test("end-turn dispatch returns a typed aggregate for controlled refill and max-life effects", () => {
  const state = initializeGame({ rootDir, seed: 23005 });
  const controller = mustGetPlayer(state, 0);
  const owner = mustGetPlayer(state, 1);
  controller.permanents = [];
  controller.wizardProperties = [];
  controller.statuses = [];
  owner.discard = [];
  controller.life.current = controller.life.max;

  addControlledEffectCard(
    state,
    controller,
    controller,
    "end-turn-refill",
    controller.permanents,
    [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 2,
      },
    ]
  );
  const maxLife = addControlledEffectCard(
    state,
    controller,
    owner,
    "end-turn-max-life",
    owner.discard,
    [
      {
        effectId: "increase_hand_limit_at_max_life",
        timing: "endTurn",
        amount: 1,
      },
    ]
  );
  grantTemporaryControl(state, maxLife.instanceId, controller.playerId);

  assert.deepEqual(
    dispatchControlledCardOperation(state, controller, {
      kind: "collectEndTurnDrawModifier",
      currentBaseDrawCount: 5,
    }),
    { ok: true, drawCount: 8 }
  );
  assert.equal(calculateEndTurnDrawCount(state, controller), 8);

  controller.life.current -= 1;
  assert.deepEqual(
    dispatchControlledCardOperation(state, controller, {
      kind: "collectEndTurnDrawModifier",
      currentBaseDrawCount: 5,
    }),
    { ok: true, drawCount: 7 }
  );
  assert.equal(calculateEndTurnDrawCount(state, controller), 7);
});

test("controlled trigger dispatch stops after the first catalog execution error", () => {
  const state = initializeGame({ rootDir, seed: 23002 });
  const controller = mustGetPlayer(state, 0);
  controller.permanents = [];
  for (const suffix of ["first-error", "second-skipped"] as const) {
    addControlledEffectCard(
      state,
      controller,
      controller,
      suffix,
      controller.permanents,
      [
        {
          effectId: "ongoing_add_power_when_playing_wand",
          timing: "onPlayCard",
          amount: 1,
          cardTags: ["wandCard"],
        },
      ]
    );
  }
  const playedCard = addControlledEffectCard(
    state,
    controller,
    controller,
    "error-played-wand",
    controller.playedThisTurn,
    [],
    { isOngoing: false, tags: ["wandCard"] }
  );
  const executedDefinitionIds: string[] = [];
  const originalHandler = getEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand"
  );

  const result = withTemporaryEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand",
    {
      ...originalHandler,
      executeOnPlayCard(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return {
          status: "resolved",
          result: { ok: false, error: "fixture trigger failure" },
        };
      },
    },
    () =>
      dispatchControlledCardOperation(state, controller, {
        kind: "onPlayCard",
        playedCard,
        playedDefinition: mustGetDefinition(state, playedCard),
      })
  );

  assert.deepEqual(result, { ok: false, error: "fixture trigger failure" });
  assert.deepEqual(executedDefinitionIds, [
    "fixture-trigger-dispatch-first-error",
  ]);
});

test("controlled trigger dispatch stops after the first catalog game-end result", () => {
  const state = initializeGame({ rootDir, seed: 23009 });
  const controller = mustGetPlayer(state, 0);
  controller.permanents = [];
  for (const suffix of ["first-game-end", "second-skipped"] as const) {
    addControlledEffectCard(
      state,
      controller,
      controller,
      suffix,
      controller.permanents,
      [
        {
          effectId: "ongoing_add_power_when_playing_wand",
          timing: "onPlayCard",
          amount: 1,
          cardTags: ["wandCard"],
        },
      ]
    );
  }
  const playedCard = addControlledEffectCard(
    state,
    controller,
    controller,
    "game-end-played-wand",
    controller.playedThisTurn,
    [],
    { isOngoing: false, tags: ["wandCard"] }
  );
  const executedDefinitionIds: string[] = [];
  const originalHandler = getEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand"
  );

  const result = withTemporaryEffectRuntimeHandler(
    "ongoing_add_power_when_playing_wand",
    {
      ...originalHandler,
      executeOnPlayCard(_effect, context) {
        executedDefinitionIds.push(context.source.definitionId);
        return {
          status: "resolved",
          result: {
            ok: true,
            gameEnd: {
              reason: "playerDefeated",
              winnerPlayerId: controller.playerId,
            },
          },
        };
      },
    },
    () =>
      dispatchControlledCardOperation(state, controller, {
        kind: "onPlayCard",
        playedCard,
        playedDefinition: mustGetDefinition(state, playedCard),
      })
  );

  assert.deepEqual(result, {
    ok: true,
    gameEnd: {
      reason: "playerDefeated",
      winnerPlayerId: controller.playerId,
    },
  });
  assert.deepEqual(executedDefinitionIds, [
    "fixture-trigger-dispatch-first-game-end",
  ]);
});

function mustGetDefinition(
  state: GameState,
  card: CardInstance
): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  assert.ok(definition);
  return definition;
}

function addControlledEffectCard(
  state: GameState,
  controller: PlayerState,
  owner: PlayerState,
  suffix: string,
  zone: CardInstance[],
  effects: RuntimeEffect[],
  options: { isOngoing?: boolean; tags?: string[]; cardId?: string } = {}
): CardInstance {
  const cardId = options.cardId ?? `fixture-trigger-dispatch-${suffix}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture trigger ${suffix}`,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: options.isOngoing === false ? [] : ["ongoing"],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      ...(options.tags === undefined ? {} : { tags: options.tags }),
      cost: 0,
      victoryPoints: 0,
      isOngoing: options.isOngoing ?? true,
      marketChipMarker: false,
      effects,
      unsupportedMechanics: [],
    },
  };
  state.cardDefinitions = new Map([
    ...state.cardDefinitions,
    [definition.cardId, definition],
  ]);
  const card: CardInstance = {
    instanceId: markCardInstanceId(`${cardId}-instance`),
    definitionId: markCardDefinitionId(cardId),
    ownerId: owner.playerId,
    marketChips: 0,
  };
  zone.push(card);
  if (owner.playerId !== controller.playerId) {
    assert.equal(card.ownerId, owner.playerId);
  }
  return card;
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}

test("current runtime Ultimate Tronado adds power after its controller's first damaging attack", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: "tests/fixtures/playable-runtime-data-pack.json",
    seed: 60615,
  });
  const activePlayer = scenario.activePlayer;
  const targetPlayer = scenario.foes[0];
  assert.ok(targetPlayer);
  for (const player of scenario.state.players) {
    player.wizardProperties = [];
    player.hand = [];
  }
  const runtimeDefinition = loadCurrentRuntimeDataPack(
    rootDir
  ).cardDefinitions.get("esw2_dbg__legend_012");
  assert.ok(runtimeDefinition);
  scenario.state.cardDefinitions = new Map([
    ...scenario.state.cardDefinitions,
    [runtimeDefinition.cardId, runtimeDefinition],
  ]);
  givenRuntimeCard(scenario, {
    player: activePlayer,
    definitionId: runtimeDefinition.cardId,
    zone: "permanents",
    instanceId: "fixture-current-runtime-ultimate-tronado",
  });
  targetPlayer.life.current = 20;
  const attack = givenRuntimeCard(scenario, {
    effects: [
      {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 3,
        target: { selector: "opponentPlayer" },
      },
    ],
  });

  assert.equal(play(scenario, attack).ok, true);
  assert.equal(targetPlayer.life.current, 17);
  assert.equal(scenario.state.turn.power, 3);
});
