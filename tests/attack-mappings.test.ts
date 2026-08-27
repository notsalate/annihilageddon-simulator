import assert from "node:assert/strict";
import test from "node:test";

import {
  attackBearingRuntimeEffectIds,
  isAttackBearingRuntimeEffectId,
  isAttackSemantics,
  initializeGame,
  type AttackSemantics,
  type GameState,
  type RuntimeEffect,
} from "../src/index.js";
import {
  resolvePlayerControlledAttack,
  type PlayerControlledAttackAdapters,
} from "../src/engine/attack-resolution.js";
import {
  loadCurrentRuntimeDataPack,
  validateExecutableDataPack,
} from "../src/engine/data.js";
import {
  validateRuntimeEffectCatalogPayload,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import {
  createGameScenario,
  givenRuntimeCard,
  play,
  resolveMayhemThroughMarket,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();
const playableRuntimeDataPackPath =
  "tests/fixtures/playable-runtime-data-pack.json";

function getAttackSemantics(
  effect: RuntimeEffect
): AttackSemantics | undefined {
  return "attackSemantics" in effect ? effect.attackSemantics : undefined;
}

function listAttackMappings() {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  return [...dataPack.cardDefinitions.values()].flatMap((definition) =>
    definition.engine.effects
      .filter((effect) => isAttackBearingRuntimeEffectId(effect.effectId))
      .map((effect) => ({ definition, effect }))
  );
}

test("production attack-bearing mappings declare explicit AttackSemantics", () => {
  const mappings = listAttackMappings();

  assert.ok(mappings.length > 0);
  assert.equal(
    mappings.every(({ effect }) => getAttackSemantics(effect) !== undefined),
    true
  );
  assert.equal(
    mappings.every(({ effect }) =>
      isAttackSemantics(getAttackSemantics(effect))
    ),
    true
  );

  const effectIds = new Set(mappings.map(({ effect }) => effect.effectId));
  for (const effectId of attackBearingRuntimeEffectIds) {
    assert.equal(
      effectIds.has(effectId),
      true,
      `production attack mapping inventory is missing ${effectId}`
    );
  }
});

test("attack mappings preserve the canonical resolver classification", () => {
  const mappings = listAttackMappings();
  const firstMapping = (effectId: string) => {
    const mapping = mappings.find(({ effect }) => effect.effectId === effectId);
    assert.ok(mapping, `production mapping is missing ${effectId}`);
    const semantics = getAttackSemantics(mapping.effect);
    assert.ok(semantics, `${effectId} is missing AttackSemantics`);
    return semantics;
  };

  assert.deepEqual(
    firstMapping("attack_transfer_controlled_dead_wizard_token"),
    {
      resolver: "playerControlled",
      instanceMode: "single",
      defenseWindowMode: "COLLECT_ALL_FIRST",
      targetApplications: "single",
      attackText: "shared",
      continuation: "none",
    }
  );
  assert.equal(
    firstMapping("multi_target_attack").targetApplications,
    "allInOneInstance"
  );
  assert.equal(
    firstMapping("sequential_attack_damage").instanceMode,
    "sequential"
  );
  assert.equal(
    firstMapping("sequential_attack_damage").continuation,
    "fixedCount"
  );
  assert.equal(firstMapping("directional_chain_attack").instanceMode, "chain");
  assert.equal(firstMapping("directional_chain_attack").continuation, "onKill");
  assert.deepEqual(firstMapping("mayhem_attack"), {
    resolver: "mayhem",
    instanceMode: "single",
    defenseWindowMode: "MAYHEM",
    targetApplications: "allInOneInstance",
    attackText: "mayhem",
    continuation: "none",
  });
});

test("supported intake rejects an attack mapping without semantics", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const candidate = listAttackMappings()[0];
  assert.ok(candidate);

  const brokenEffect = {
    ...candidate.effect,
    attackSemantics: undefined,
  } as unknown as RuntimeEffect;
  const brokenDefinition = {
    ...candidate.definition,
    engine: {
      ...candidate.definition.engine,
      effects: candidate.definition.engine.effects.map((effect) =>
        effect === candidate.effect ? brokenEffect : effect
      ),
    },
  };
  const brokenPack = {
    ...dataPack,
    cardDefinitions: new Map([
      ...dataPack.cardDefinitions,
      [brokenDefinition.cardId, brokenDefinition],
    ]),
  };

  const result = validateExecutableDataPack(brokenPack);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /must declare AttackSemantics/u);
  }
});

test("attack semantics reject contradictory resolver and defense mode", () => {
  const mappings = listAttackMappings();
  const candidate = mappings.find(
    ({ effect }) => effect.effectId === "attack_damage"
  );
  assert.ok(candidate);

  const semantics = getAttackSemantics(candidate.effect);
  assert.ok(semantics);
  const contradictory = {
    ...semantics,
    resolver: "mayhem",
    defenseWindowMode: "PER_TARGET",
  } satisfies AttackSemantics;
  const result = validateRuntimeEffectCatalogPayload(
    candidate.definition.cardId,
    candidate.effect.effectId,
    { ...candidate.effect, attackSemantics: contradictory },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /contradictory AttackSemantics/u);
  }
});

test("attack mappings reject semantics that do not belong to their effect id", () => {
  const mappings = listAttackMappings();
  const candidate = mappings.find(
    ({ effect }) => effect.effectId === "attack_damage"
  );
  assert.ok(candidate);

  const semantics = getAttackSemantics(candidate.effect);
  assert.ok(semantics);
  const behaviorallyMismatched = {
    ...semantics,
    instanceMode: "chain",
    continuation: "onKill",
  } satisfies AttackSemantics;
  const result = validateRuntimeEffectCatalogPayload(
    candidate.definition.cardId,
    candidate.effect.effectId,
    { ...candidate.effect, attackSemantics: behaviorallyMismatched },
    "combat",
    "card"
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /incompatible with attack_damage/u);
  }
});

test("multi-target mapping creates one AttackInstance for all applications", () => {
  const mapping = findFirstMapping("multi_target_attack");
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 43501,
    playerCount: 3,
  });
  const card = givenRuntimeCard(scenario, { effects: [mapping.effect] });

  assert.equal(play(scenario, card).ok, true);

  const attacks = scenario.state.eventLog.filter(
    (event) =>
      event.type === "attackCreated" &&
      event.effectId === mapping.effect.effectId
  );
  const targetApplications = scenario.state.eventLog.filter(
    (event) =>
      event.type === "attackTargetStarted" &&
      event.effectId === mapping.effect.effectId
  );
  assert.equal(attacks.length, 1);
  assert.equal(targetApplications.length, 2);
  assert.equal(
    new Set(
      targetApplications.map((event) =>
        event.type === "attackTargetStarted" ? event.attackId : undefined
      )
    ).size,
    1
  );
});

test("sequential mapping creates one AttackInstance per printed attack", () => {
  const mapping = findFirstMapping("sequential_attack_damage");
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 43502,
    playerCount: 2,
  });
  const card = givenRuntimeCard(scenario, { effects: [mapping.effect] });

  assert.equal(play(scenario, card).ok, true);

  const attacks = scenario.state.eventLog.filter(
    (event) =>
      event.type === "attackCreated" &&
      event.effectId === mapping.effect.effectId
  );
  assert.equal(attacks.length, 4);
  assert.equal(
    new Set(
      attacks.map((event) =>
        event.type === "attackCreated" ? event.attackId : undefined
      )
    ).size,
    4
  );
});

test("shared mapping materializes COLLECT_ALL_FIRST on AttackInstance", () => {
  const mapping = findFirstMapping(
    "attack_transfer_controlled_dead_wizard_token"
  );
  const semantics = getAttackSemantics(mapping.effect);
  assert.ok(semantics);
  if (semantics.defenseWindowMode !== "COLLECT_ALL_FIRST") {
    assert.fail("shared attack mapping must use COLLECT_ALL_FIRST");
  }

  const state = initializeGame({ rootDir, seed: 43503, playerCount: 2 });
  const attacker = state.players[0];
  const target = state.players[1];
  assert.ok(attacker);
  assert.ok(target);
  const source: EffectSourceContext = {
    sourceType: "card",
    runtimeMode: state.runtimeMode,
    playerId: attacker.playerId,
    cardInstanceId: "fixture-attack-mapping-shared",
    definitionId: "fixture-attack-mapping-shared",
  };
  let observedDefenseWindowMode: string | undefined;

  const result = resolvePlayerControlledAttack(
    {
      state,
      attackingPlayer: attacker,
      source,
      effectId: mapping.effect.effectId,
      defenseWindowMode: semantics.defenseWindowMode,
      attackSemantics: semantics,
      unavoidable: false,
      targetPlan: { kind: "orderedPlayers", players: [target] },
      impact: {
        kind: "shared",
        resolve(_state, attack) {
          observedDefenseWindowMode = attack.defenseWindowMode;
          return { ok: true };
        },
      },
    },
    createNoopAttackAdapters()
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(observedDefenseWindowMode, "COLLECT_ALL_FIRST");
});

test("Mayhem mapping creates one AttackInstance for the global resolution", () => {
  const mapping = findFirstMapping("mayhem_attack");
  const scenario = createGameScenario({
    rootDir,
    dataPackPath: playableRuntimeDataPackPath,
    seed: 43504,
    playerCount: 3,
  });
  const source = givenRuntimeCard(scenario, {
    cardKind: "mayhem",
    effects: [mapping.effect],
  });

  assert.equal(
    resolveMayhemThroughMarket(scenario, source, "mainDeck").ok,
    true
  );

  const decisionPhases = scenario.state.eventLog.filter(
    (event) =>
      event.type === "mayhemDecisionPhaseStarted" &&
      event.effectId === mapping.effect.effectId
  );
  assert.equal(decisionPhases.length, 1);
  assert.ok(decisionPhases[0]?.attackId);
});

function findFirstMapping(effectId: string) {
  const mapping = listAttackMappings().find(
    ({ effect }) => effect.effectId === effectId
  );
  assert.ok(mapping, `production mapping is missing ${effectId}`);
  return mapping;
}

function createNoopAttackAdapters(): PlayerControlledAttackAdapters {
  return {
    resolveTargets(intent) {
      return intent.targetPlan.kind === "orderedPlayers"
        ? { ok: true, players: intent.targetPlan.players }
        : { ok: false, error: "test target plan is not ordered" };
    },
    resolveDefenseWindow() {
      return { ok: true, avoided: false };
    },
    dealAttackDamage() {
      return { damageDealt: 0, killed: false };
    },
    executeOnHitEffect() {
      return { ok: true };
    },
    executeOutcomeBranch() {
      return { ok: true };
    },
    applyAfterAttackDamage() {
      return { ok: true };
    },
    closeAttackInstance(_state: GameState, _attack, result) {
      return result;
    },
  };
}
