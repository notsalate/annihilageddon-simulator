import assert from "node:assert/strict";
import test from "node:test";

import {
  attackBearingRuntimeEffectIds,
  isAttackBearingRuntimeEffectId,
  isAttackSemantics,
  type AttackSemantics,
  type RuntimeEffect,
} from "../src/index.js";
import {
  loadCurrentRuntimeDataPack,
  validateExecutableDataPack,
} from "../src/engine/data.js";
import { validateRuntimeEffectCatalogPayload } from "../src/engine/effect-runtime-registry.js";

const rootDir = process.cwd();

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
