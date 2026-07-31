import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCurrentRuntimeDataPack,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type RuntimeEffect,
} from "../src/index.js";
import {
  calculateEndTurnDrawCount,
  executeControlledCardOnPlayCardEffects,
  executeEffect,
  executeWizardPropertyOnPlayCardEffects,
} from "../src/engine/effect-runtime.js";
import { dispatchControlledCardOperation } from "../src/engine/trigger-dispatch.js";

import {
  choosePlayerTargetForEffect,
  createGameScenario,
  givenRuntimeCard,
  givenTemporaryControl,
  play,
} from "./helpers/game-scenario.js";
import { withTemporaryEffectRuntimeOperations } from "./helpers/with-temporary-effect-runtime-operations.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

test("trigger dispatch reads runtime mode from state before invoking the catalog operation", () => {
  const observedModes: string[] = [];

  const results = withTemporaryEffectRuntimeOperations(
    "ongoing_add_power_when_playing_wand",
    {
      executeOnPlayCard(_effect, context) {
        observedModes.push(context.source.runtimeMode);
        return { status: "resolved", result: { ok: true } };
      },
    },
    () => {
      const fixtureScenario = createGameScenario({
        rootDir,
        dataPackPath: playableRuntimeDataPackPath,
        seed: 23007,
      });
      const fixtureController = fixtureScenario.activePlayer;
      fixtureController.permanents = [];
      givenRuntimeCard(fixtureScenario, {
        player: fixtureController,
        zone: "permanents",
        cardId: "fixture-trigger-dispatch-fixture-mode-trigger",
        isOngoing: true,
        effects: [
          {
            effectId: "ongoing_add_power_when_playing_wand",
            timing: "onPlayCard",
            amount: 1,
            cardTags: ["wandCard"],
          },
        ],
      });
      const fixturePlayedCard = givenRuntimeCard(fixtureScenario, {
        player: fixtureController,
        zone: "playedThisTurn",
        cardId: "fixture-trigger-dispatch-fixture-mode-played-wand",
        isOngoing: false,
        effects: [],
        tags: ["wandCard"],
      });
      const fixturePlayedDefinition = mustGetDefinition(
        fixtureScenario.state,
        fixturePlayedCard
      );

      const combatScenario = createGameScenario({ rootDir, seed: 23008 });
      const combatController = combatScenario.activePlayer;
      combatController.permanents = [];
      givenRuntimeCard(combatScenario, {
        player: combatController,
        zone: "permanents",
        cardId: "fixture-trigger-dispatch-combat-mode-trigger",
        isOngoing: true,
        effects: [
          {
            effectId: "ongoing_add_power_when_playing_wand",
            timing: "onPlayCard",
            amount: 1,
            cardTags: ["wandCard"],
          },
        ],
      });
      const combatPlayedCard = givenRuntimeCard(combatScenario, {
        player: combatController,
        zone: "playedThisTurn",
        cardId: "fixture-trigger-dispatch-combat-mode-played-wand",
        isOngoing: false,
        effects: [],
        tags: ["wandCard"],
      });
      const combatPlayedDefinition = mustGetDefinition(
        combatScenario.state,
        combatPlayedCard
      );

      return [
        dispatchControlledCardOperation(
          fixtureScenario.state,
          fixtureController,
          {
            kind: "onPlayCard",
            playedCard: fixturePlayedCard,
            playedDefinition: fixturePlayedDefinition,
          }
        ),
        dispatchControlledCardOperation(
          combatScenario.state,
          combatController,
          {
            kind: "onPlayCard",
            playedCard: combatPlayedCard,
            playedDefinition: combatPlayedDefinition,
          }
        ),
      ];
    }
  );

  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.deepEqual(observedModes, ["fixture", "combat"]);
});

test("controlled trigger dispatch preserves Control Ledger order and card source attribution", () => {
  const scenario = createGameScenario({ rootDir, seed: 23001 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const owner = scenario.foes[0];
  assert.ok(owner);
  controller.permanents = [];
  owner.discard = [];
  state.turn.power = 0;

  const permanent = givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-ordered-permanent",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ],
  });
  const temporary = givenRuntimeCard(scenario, {
    player: owner,
    zone: "discard",
    cardId: "fixture-trigger-dispatch-ordered-temporary",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 2,
        cardTags: ["wandCard"],
      },
    ],
  });
  givenTemporaryControl(scenario, temporary, controller);
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-ordered-played-wand",
    isOngoing: false,
    effects: [],
    tags: ["wandCard"],
  });

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
  const scenario = createGameScenario({ rootDir, seed: 23003 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const owner = scenario.foes[0];
  assert.ok(owner);
  controller.permanents = [];
  owner.discard = [];
  state.turn.power = 0;

  const trigger = givenRuntimeCard(scenario, {
    player: owner,
    zone: "discard",
    cardId: "fixture-trigger-dispatch-wand-on-play",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["wandCard"],
      },
    ],
  });
  givenTemporaryControl(scenario, trigger, controller);
  const nonWand = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-played-non-wand",
    isOngoing: false,
    effects: [],
  });
  const wand = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-played-wand",
    isOngoing: false,
    effects: [],
    tags: ["wandCard"],
  });

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
  const scenario = createGameScenario({ rootDir, seed: 23004 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  target.hand = [];
  target.life.current = 20;
  state.turn.power = 0;
  state.turn.damagingAttackPlayerIds = [];

  const trigger = givenRuntimeCard(scenario, {
    player: target,
    zone: "discard",
    cardId: "fixture-trigger-dispatch-first-attack-power",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ],
  });
  givenTemporaryControl(scenario, trigger, controller);
  choosePlayerTargetForEffect(scenario, "attack_damage", target);

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
  const scenario = createGameScenario({ rootDir, seed: 23006 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const target = scenario.foes[0];
  assert.ok(target);
  state.activePlayerId = controller.playerId;
  controller.permanents = [];
  controller.wizardProperties = [];
  target.hand = [];
  target.life.current = 20;
  state.turn.damagingAttackPlayerIds = [];

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-invalid-first-attack-trigger",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: 1,
      } as unknown as RuntimeEffect,
    ],
  });
  choosePlayerTargetForEffect(scenario, "attack_damage", target);

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
  const scenario = createGameScenario({ rootDir, seed: 23005 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const owner = scenario.foes[0];
  assert.ok(owner);
  controller.permanents = [];
  controller.wizardProperties = [];
  controller.statuses = [];
  owner.discard = [];
  controller.life.current = controller.life.max;

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-end-turn-refill",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 2,
      },
    ],
  });
  const maxLife = givenRuntimeCard(scenario, {
    player: owner,
    zone: "discard",
    cardId: "fixture-trigger-dispatch-end-turn-max-life",
    isOngoing: true,
    effects: [
      {
        effectId: "increase_hand_limit_at_max_life",
        timing: "endTurn",
        amount: 1,
      },
    ],
  });
  givenTemporaryControl(scenario, maxLife, controller);

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
  const scenario = createGameScenario({ rootDir, seed: 23002 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  controller.permanents = [];
  for (const suffix of ["first-error", "second-skipped"] as const) {
    givenRuntimeCard(scenario, {
      player: controller,
      zone: "permanents",
      cardId: `fixture-trigger-dispatch-${suffix}`,
      isOngoing: true,
      effects: [
        {
          effectId: "ongoing_add_power_when_playing_wand",
          timing: "onPlayCard",
          amount: 1,
          cardTags: ["wandCard"],
        },
      ],
    });
  }
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-error-played-wand",
    isOngoing: false,
    effects: [],
    tags: ["wandCard"],
  });
  const executedDefinitionIds: string[] = [];

  const result = withTemporaryEffectRuntimeOperations(
    "ongoing_add_power_when_playing_wand",
    {
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
  const scenario = createGameScenario({ rootDir, seed: 23009 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  controller.permanents = [];
  for (const suffix of ["first-game-end", "second-skipped"] as const) {
    givenRuntimeCard(scenario, {
      player: controller,
      zone: "permanents",
      cardId: `fixture-trigger-dispatch-${suffix}`,
      isOngoing: true,
      effects: [
        {
          effectId: "ongoing_add_power_when_playing_wand",
          timing: "onPlayCard",
          amount: 1,
          cardTags: ["wandCard"],
        },
      ],
    });
  }
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-game-end-played-wand",
    isOngoing: false,
    effects: [],
    tags: ["wandCard"],
  });
  const executedDefinitionIds: string[] = [];

  const result = withTemporaryEffectRuntimeOperations(
    "ongoing_add_power_when_playing_wand",
    {
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

test("current runtime Ultimate Tronado adds power after its controller's first damaging attack", () => {
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
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

test("on-play dispatch decodes malformed timing before applicability", () => {
  const scenario = createGameScenario({ rootDir, seed: 23010 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  controller.permanents = [];
  state.turn.power = 0;

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-malformed-on-play-timing",
    isOngoing: false,
    effects: [
      {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "endTurn",
        amount: 1,
        cardTags: ["wandCard"],
      } as unknown as RuntimeEffect,
    ],
  });
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-trigger-dispatch-malformed-on-play-wand",
    isOngoing: false,
    effects: [],
    tags: ["wandCard"],
  });

  const result = dispatchControlledCardOperation(state, controller, {
    kind: "onPlayCard",
    playedCard,
    playedDefinition: mustGetDefinition(state, playedCard),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timing must be onPlayCard/);
  assert.equal(state.turn.power, 0);
});

test("after-attack dispatch decodes malformed timing before applicability", () => {
  const scenario = createGameScenario({ rootDir, seed: 23011 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  controller.permanents = [];
  state.turn.power = 0;

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-malformed-after-attack-timing",
    isOngoing: false,
    effects: [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "endTurn",
        amount: "totalDamageDealtByThatAttack",
      } as unknown as RuntimeEffect,
    ],
  });

  const result = dispatchControlledCardOperation(state, controller, {
    kind: "afterPlayerAttackDamage",
    totalDamageDealt: 2,
    attackSource: {
      sourceType: "card",
      runtimeMode: state.runtimeMode,
      playerId: controller.playerId,
      cardInstanceId: "fixture-malformed-after-attack-source",
      definitionId: "fixture-malformed-after-attack-source",
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timing must be afterFirstAttackDamageEachTurn/);
  assert.equal(state.turn.power, 0);
});

test("end-turn dispatch decodes malformed timing before applicability", () => {
  const scenario = createGameScenario({ rootDir, seed: 23012 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  controller.permanents = [];

  givenRuntimeCard(scenario, {
    player: controller,
    zone: "permanents",
    cardId: "fixture-trigger-dispatch-malformed-end-turn-timing",
    isOngoing: true,
    effects: [
      {
        effectId: "ongoing_hand_refill_bonus",
        timing: "onPlayCard",
        amount: 2,
      } as unknown as RuntimeEffect,
    ],
  });

  const result = dispatchControlledCardOperation(state, controller, {
    kind: "collectEndTurnDrawModifier",
    currentBaseDrawCount: 5,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /timing must be endTurn/);
});

test("wizard-property on-play decodes before source-specific applicability", () => {
  const scenario = createGameScenario({ rootDir, seed: 23013 });
  const state = scenario.state;
  const controller = scenario.activePlayer;
  const token = controller.wizardProperties[0];
  assert.ok(token);
  const definition = state.tokenDefinitions.get(token.definitionId);
  assert.equal(definition?.kind, "wizardProperty");
  if (definition?.kind !== "wizardProperty") return;
  assert.ok(definition.engine);

  const tokenDefinitions = new Map(state.tokenDefinitions);
  tokenDefinitions.set(token.definitionId, {
    ...definition,
    engine: {
      ...definition.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "gain_chips",
          timing: "onPlayCard",
          amount: 1,
          isOngoing: false,
        } as unknown as RuntimeEffect,
      ],
    },
  });
  state.tokenDefinitions = tokenDefinitions;
  const playedCard = givenRuntimeCard(scenario, {
    player: controller,
    zone: "playedThisTurn",
    cardId: "fixture-wizard-property-malformed-on-play-source",
    isOngoing: true,
    effects: [],
  });
  const chipsBefore = controller.chips;

  const result = executeWizardPropertyOnPlayCardEffects(
    state,
    controller,
    mustGetDefinition(state, playedCard)
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /isOngoing must be true/);
  assert.equal(controller.chips, chipsBefore);
});

function mustGetDefinition(
  state: GameState,
  card: CardInstance
): CardDefinition {
  const definition = state.cardDefinitions.get(card.definitionId);
  assert.ok(definition);
  return definition;
}
