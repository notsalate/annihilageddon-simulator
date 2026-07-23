import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
} from "../src/index.js";
import {
  createAttackAmountState,
  resolveAttackAmount,
} from "../src/engine/attack-resolution.js";
import {
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import {
  createAttackDefenseUsage,
  type DefenseAttackContext,
  type EffectChoice,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  grantTemporaryControl,
} from "../src/engine/control-ledger.js";
import { reconcileActivePlayerControlledPower } from "../src/engine/controlled-power.js";
import { executeEffect } from "../src/engine/effect-runtime.js";
import {
  markCardDefinitionId,
  markCardInstanceId,
} from "../src/domain/types.js";
import * as defenseFixtures from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();

const {
  addFixtureDefenseCardToHand,
  selectFirstFixtureDefense,
} = defenseFixtures;

test("attack replacement uses only controlled ongoing cards", () => {
  assert.equal(resolveAttackWithDoubleModifier(false), 2);
  assert.equal(resolveAttackWithDoubleModifier(true), 4);
});

test("after-attack trigger uses only controlled ongoing cards", () => {
  assert.equal(runFirstAttackPowerScenario(false), 0);
  assert.equal(runFirstAttackPowerScenario(true), 2);
});

test("passive controlled power uses only controlled ongoing cards", () => {
  assert.equal(reconcilePassivePower(false), 0);
  assert.equal(reconcilePassivePower(true), 3);
});

test("fixture defense selector skips production defenses and supports exact fixture identity", () => {
  const state = initializeGame({ rootDir, seed: 47004 });
  const defender = mustGetPlayer(state, 1);
  defender.hand = [];

  const productionDefense: CardInstance = {
    instanceId: markCardInstanceId("production-defense-instance"),
    definitionId: markCardDefinitionId("esw2_dbg__production-defense"),
    ownerId: defender.playerId,
    marketChips: 0,
  };
  const firstFixture = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const secondFixture = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf"
  );
  const choices: EffectChoice[] = [
    { choiceKind: "defense", choiceId: "decline", card: undefined },
    {
      choiceKind: "defense",
      choiceId: productionDefense.instanceId,
      card: productionDefense,
    },
    {
      choiceKind: "defense",
      choiceId: firstFixture.instanceId,
      card: firstFixture,
    },
    {
      choiceKind: "defense",
      choiceId: secondFixture.instanceId,
      card: secondFixture,
    },
  ];
  const request = {
    player: defender,
    effectId: "avoid_attack" as const,
    sourceType: "card" as const,
    cardInstanceId: "fixture-selector-source",
    definitionId: "fixture-selector-source",
    choices,
  };

  const firstSelection = selectFirstFixtureDefense(request);
  assert.equal(firstSelection?.choiceId, firstFixture.instanceId);

  const exactFactory = (
    defenseFixtures as unknown as Record<string, unknown>
  )["selectFixtureDefenseByInstanceId"];
  assert.equal(typeof exactFactory, "function");
  const exactSelector = (
    exactFactory as (
      instanceId: CardInstance["instanceId"]
    ) => NonNullable<GameState["effectChoiceStrategy"]>
  )(secondFixture.instanceId);
  assert.equal(exactSelector(request)?.choiceId, secondFixture.instanceId);
});

test("defense fixture ids remain unique after the first fixture leaves hand", () => {
  const state = initializeGame({ rootDir, seed: 47005 });
  const defender = mustGetPlayer(state, 1);
  defender.hand = [];
  defender.discard = [];

  const first = addFixtureDefenseCardToHand(state, defender, "discardSelf");
  defender.hand.splice(defender.hand.indexOf(first), 1);
  defender.discard.push(first);
  const second = addFixtureDefenseCardToHand(state, defender, "discardSelf");

  assert.notEqual(first.instanceId, second.instanceId);
  assert.notEqual(first.definitionId, second.definitionId);
});

test("declining defense does not create a rollback snapshot", () => {
  const state = initializeGame({ rootDir, seed: 47006 });
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);
  attacker.hand = [];
  defender.hand = [];
  addFixtureDefenseCardToHand(state, defender, "discardSelf");

  const originalFork = state.rng.fork.bind(state.rng);
  let forkCalls = 0;
  (state.rng as { fork(): GameState["rng"] }).fork = () => {
    forkCalls += 1;
    return originalFork();
  };

  const source = fixtureSource(attacker, "decline-snapshot");
  const attack: DefenseAttackContext = {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2),
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage: createAttackDefenseUsage(),
  };
  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find((choice) => choice.choiceId === "decline");
    },
    executeDefenseEffects() {
      return { ok: true };
    },
    resolveRedirectedAttack() {
      throw new Error("decline must not redirect");
    },
  };

  const result = resolveDefenseWindow(state, defender, attack, services);

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(forkCalls, 0);
});

function resolveAttackWithDoubleModifier(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47001 : 47000 });
  const attacker = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  state.turn.temporaryCardControls = [];

  const modifier = registerControlledCard(
    state,
    attacker,
    isOngoing,
    "double-attack",
    [
      {
        effectId: "double_owned_attack_damage",
        timing: "attackReplacement",
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, modifier.instanceId, attacker.playerId);
  }

  return resolveAttackAmount(
    state,
    attacker,
    target,
    createAttackAmountState(2)
  ).total;
}

function runFirstAttackPowerScenario(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47003 : 47002 });
  state.runtimeMode = "fixture";
  const attacker = mustGetPlayer(state, 0);
  const target = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  state.turn.damagingAttackPlayerIds = [];
  attacker.permanents = [];
  attacker.playedThisTurn = [];
  attacker.wizardProperties = [];
  target.hand = [];
  target.wizardProperties = [];
  target.life.current = 20;

  const trigger = registerControlledCard(
    state,
    attacker,
    isOngoing,
    "first-attack-trigger",
    [
      {
        effectId: "ongoing_first_attack_damage_add_power",
        timing: "afterFirstAttackDamageEachTurn",
        amount: "totalDamageDealtByThatAttack",
      },
    ]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, trigger.instanceId, attacker.playerId);
  }
  state.effectChoiceStrategy = ({ effectId, choices }) =>
    effectId === "attack_damage"
      ? choices.find((choice) => choice.choiceId === target.playerId)
      : undefined;

  const result = executeEffect(
    state,
    attacker,
    {
      effectId: "attack_damage",
      amount: 2,
      targetSelector: "chosenFoe",
    },
    fixtureSource(attacker, `first-attack-${String(isOngoing)}`)
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(target.life.current, 18);
  return state.turn.power;
}

function reconcilePassivePower(isOngoing: boolean): number {
  const state = initializeGame({ rootDir, seed: isOngoing ? 47008 : 47007 });
  const controller = mustGetPlayer(state, 0);
  state.activePlayerId = controller.playerId;
  state.turn.power = 0;
  state.turn.controlledPowerBonus = 0;
  controller.permanents = [];
  controller.playedThisTurn = [];

  const passive = registerControlledCard(
    state,
    controller,
    isOngoing,
    "passive-power",
    [{ effectId: "ongoing_add_power", timing: "whileControlled", amount: 3 }]
  );
  if (!isOngoing) {
    grantTemporaryControl(state, passive.instanceId, controller.playerId);
  }

  reconcileActivePlayerControlledPower(state);
  return state.turn.power;
}

function registerControlledCard(
  state: GameState,
  controller: PlayerState,
  isOngoing: boolean,
  suffix: string,
  effects: RuntimeEffect[]
): CardInstance {
  const cardId = `fixture-review-${suffix}-${isOngoing ? "ongoing" : "single"}`;
  const definition: CardDefinition = {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: `Fixture review ${suffix}`,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: isOngoing ? ["ongoing"] : [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing,
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
    ownerId: controller.playerId,
    marketChips: 0,
  };
  if (isOngoing) {
    controller.permanents.push(card);
  } else {
    controller.playedThisTurn.push(card);
  }
  return card;
}

function fixtureSource(
  player: PlayerState,
  suffix: string
): EffectSourceContext {
  return {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: `fixture-review-source-${suffix}`,
    definitionId: `fixture-review-source-${suffix}`,
  };
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
