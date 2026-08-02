import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeCurrentRuntimeDataPack,
  loadCurrentRuntimeDataPack,
  loadV0DataPack,
  validateExecutableDataPack,
  type AttackOutcomeBranch,
  type CardDefinition,
  type DecodeResult,
  type EffectTiming,
  type LoadedDataPack,
  type AvoidAttackRuntimeEffect,
  type DoubleOwnedAttackDamageRuntimeEffect,
  type IncreaseHandLimitAtMaxLifeRuntimeEffect,
  type ModifyOwnedWandAttackDamageRuntimeEffect,
  type OngoingAddPowerRuntimeEffect,
  type OngoingAddPowerWhenPlayingLimpWandRuntimeEffect,
  type OngoingAddPowerWhenPlayingWandRuntimeEffect,
  type OngoingAddPowerPerDeadWizardTokenRuntimeEffect,
  type OngoingFirstAttackDamageAddPowerRuntimeEffect,
  type OngoingHandRefillBonusRuntimeEffect,
  type PreventDefenseAgainstOwnedWandAttacksRuntimeEffect,
  type RuntimeEffect,
  type RuntimeEffectForId,
  type RuntimeEffectPayloadMap,
  type RuntimeEffectCondition,
  type RuntimeEffectCost,
  type RuntimeEffectId,
  type RuntimeEffectSelectorTarget,
  type RuntimeEffectTarget,
  type TargetSelector,
  type TokenDefinition,
} from "../src/index.js";
import {
  type EffectRuntimeCatalogOperationOverridesForTesting,
  type EffectRuntimeServices,
  validateRuntimeEffectCatalogPayload,
} from "../src/engine/effect-runtime-registry.js";

const rootDir = process.cwd();

function validateRawRuntimeEffect<Id extends RuntimeEffectId>(
  effectId: Id,
  subjectId: string,
  raw: unknown
): string[] {
  const decoded = validateRuntimeEffectCatalogPayload(
    subjectId,
    effectId,
    raw,
    effectId.startsWith("fixture_") ? "fixture" : "combat",
    effectId === "temporary_hand_limit_by_gained_card_type" ||
    effectId === "force_starting_player" ||
    effectId === "replace_starting_card" ||
    effectId === "start_with_basic_trophy" ||
    effectId === "set_starting_life_total" ||
    effectId === "set_resurrection_life_total"
      ? "wizardProperty"
      : "card"
  );
  return decoded.ok ? [] : [...decoded.errors];
}

function asMalformedRuntimeEffect(raw: unknown): RuntimeEffect {
  return raw as RuntimeEffect;
}

test("runtime effect payload map narrows touched effect contracts", () => {
  type IsAssignable<From, To> = [From] extends [To] ? true : false;
  type Expect<T extends true> = T;
  type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <
      Value,
    >() => Value extends Right ? 1 : 2
      ? true
      : false;

  const assertions: [
    Expect<
      Equal<
        RuntimeEffectPayloadMap["avoid_attack"],
        RuntimeEffectForId<"avoid_attack">
      >
    >,
    Expect<
      Equal<
        IsAssignable<
          { effectId: "avoid_attack"; timing: "onDefense" },
          RuntimeEffectForId<"avoid_attack">
        >,
        false
      >
    >,
    Expect<
      Equal<
        IsAssignable<
          {
            effectId: "ongoing_first_attack_damage_add_power";
            timing: "afterFirstAttackDamageEachTurn";
            amount: number;
          },
          RuntimeEffectForId<"ongoing_first_attack_damage_add_power">
        >,
        false
      >
    >,
    Expect<
      Equal<
        IsAssignable<
          {
            effectId: "ongoing_add_power_when_playing_wand";
            timing: "onPlayCard";
            amount: number;
            cardTags: ["limpWand"];
          },
          RuntimeEffectForId<"ongoing_add_power_when_playing_wand">
        >,
        false
      >
    >,
    Expect<
      Equal<RuntimeEffectPayloadMap["avoid_attack"], AvoidAttackRuntimeEffect>
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["increase_hand_limit_at_max_life"],
        IncreaseHandLimitAtMaxLifeRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_hand_refill_bonus"],
        OngoingHandRefillBonusRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_add_power"],
        OngoingAddPowerRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_add_power_when_playing_wand"],
        OngoingAddPowerWhenPlayingWandRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_add_power_when_playing_limp_wand"],
        OngoingAddPowerWhenPlayingLimpWandRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_add_power_per_dead_wizard_token"],
        OngoingAddPowerPerDeadWizardTokenRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["ongoing_first_attack_damage_add_power"],
        OngoingFirstAttackDamageAddPowerRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["modify_owned_wand_attack_damage"],
        ModifyOwnedWandAttackDamageRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["double_owned_attack_damage"],
        DoubleOwnedAttackDamageRuntimeEffect
      >
    >,
    Expect<
      Equal<
        RuntimeEffectPayloadMap["prevent_defense_against_owned_wand_attacks"],
        PreventDefenseAgainstOwnedWandAttacksRuntimeEffect
      >
    >,
    Expect<
      Equal<
        "redirectAttack" extends keyof RuntimeEffectForId<"ongoing_add_power">
          ? true
          : false,
        false
      >
    >,
    Expect<
      Equal<
        "cardTags" extends keyof RuntimeEffectForId<"avoid_attack">
          ? true
          : false,
        false
      >
    >,
  ] = [
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ];

  assert.equal(assertions.every(Boolean), true);
});

test("effect runtime catalog rejects foreign fields on concrete payloads", () => {
  const cases: Array<{
    effectId: RuntimeEffectId;
    effect: object;
    field: string;
  }> = [
    {
      effectId: "ongoing_add_power",
      effect: {
        effectId: "ongoing_add_power",
        timing: "whileControlled",
        amount: 1,
        redirectAttack: true,
      },
      field: "redirectAttack",
    },
    {
      effectId: "avoid_attack",
      effect: {
        effectId: "avoid_attack",
        timing: "onDefense",
        destination: "discardSelf",
        cardTags: ["wandCard"],
      },
      field: "cardTags",
    },
    {
      effectId: "modify_owned_wand_attack_damage",
      effect: {
        effectId: "modify_owned_wand_attack_damage",
        timing: "attackReplacement",
        amount: 1,
        cardTags: ["wandAttackCard"],
        destination: "discardSelf",
      },
      field: "destination",
    },
  ];

  for (const candidate of cases) {
    const resolution = validateRuntimeEffectCatalogPayload(
      `Foreign field ${candidate.field}`,
      candidate.effectId,
      candidate.effect,
      "fixture",
      "card"
    );
    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.ok(
        resolution.errors.some((error) => error.includes(candidate.field)),
        resolution.errors.join("; ")
      );
    }
  }
});

test("effect runtime catalog returns the validated concrete payload", () => {
  const rawEffect = {
    effectId: "avoid_attack",
    timing: "onDefense",
    destination: "discardSelf",
    redirectAttack: true,
  } as const;
  const resolution = validateRuntimeEffectCatalogPayload(
    "Fixture defense",
    rawEffect.effectId,
    rawEffect,
    "fixture",
    "card"
  );

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    return;
  }

  const narrowed: RuntimeEffectForId<"avoid_attack"> = resolution.value;
  assert.equal(narrowed.destination, "discardSelf");
  assert.equal(narrowed.redirectAttack, true);
});

test("effect runtime catalog rejects malformed touched payloads before narrowing", () => {
  const cases: Array<{ effectId: RuntimeEffectId; effect: object }> = [
    {
      effectId: "avoid_attack",
      effect: {
        effectId: "avoid_attack",
        timing: "onDefense",
        destination: "redirectTarget",
      },
    },
    {
      effectId: "avoid_attack",
      effect: {
        effectId: "avoid_attack",
        timing: "onDefense",
        destination: "discardSelf",
        redirectAttack: "yes",
      },
    },
    {
      effectId: "ongoing_add_power",
      effect: {
        effectId: "ongoing_add_power",
        timing: "onPlay",
        amount: 1,
      },
    },
    {
      effectId: "ongoing_hand_refill_bonus",
      effect: {
        effectId: "ongoing_hand_refill_bonus",
        timing: "endTurn",
        amount: 0,
      },
    },
    {
      effectId: "ongoing_add_power_when_playing_wand",
      effect: {
        effectId: "ongoing_add_power_when_playing_wand",
        timing: "onPlayCard",
        amount: 1,
        cardTags: ["limpWand"],
      },
    },
  ];

  for (const [index, candidate] of cases.entries()) {
    const resolution = validateRuntimeEffectCatalogPayload(
      `Malformed touched payload ${index}`,
      candidate.effectId,
      candidate.effect,
      "fixture",
      "card"
    );
    assert.equal(resolution.ok, false);
  }
});

test("runtime data decoder exposes a narrowed successful decoded value", () => {
  const result: DecodeResult<LoadedDataPack> =
    decodeCurrentRuntimeDataPack(rootDir);

  if (result.ok) {
    assert.equal(result.value.manifest.runtimeSchema, "krutagidon.dataPack.v0");
    assert.ok(result.value.cardDefinitions.size > 0);
  } else {
    const errors: string[] = result.errors;
    assert.fail(
      `Expected current runtime data to decode: ${errors.join("; ")}`
    );
  }
});

test("runtime data decoder exposes typed effects after the raw JSON boundary", () => {
  const result = decodeCurrentRuntimeDataPack(rootDir);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const effects: RuntimeEffect[] = [
    ...result.value.cardDefinitions.values(),
  ].flatMap((definition) => definition.engine.effects);

  assert.ok(effects.length > 0);
  assert.ok(effects.every((effect) => !("rawOnly" in effect)));
  assert.equal(typeof effects[0]?.effectId, "string");
  const timing: EffectTiming | undefined = effects[0]?.timing;
  assert.equal(typeof timing, "string");
});

test("runtime effect decoder rejects rawOnly fields", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-effect-fields-"));
  const effect = {
    effectId: "modify_effective_value",
    timing: "whileControlled",
    valueKind: "cardCost",
    operation: "add",
    amount: 1,
    countedCardTypes: ["treasure"],
    target: { targetType: "card", cardTypes: ["treasure"] },
    rawOnly: "discard me",
  };
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-effect-fields",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
    needsData: [],
  });
  writeJsonFile(tempRoot, "cards/fixture-card.json", {
    ...createFixtureCard("fixture-card"),
    engine: { ...createFixtureCard("fixture-card").engine, effects: [effect] },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ]) {
    writeJsonFile(tempRoot, file, emptyDeck);
  }

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) => error.includes("uses unsupported field rawOnly"))
    );
  }
});

test("runtime data boundary rejects malformed nested Wild Magic options", () => {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-wild-magic-option-")
  );
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-wild-magic-option",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  writeJsonFile(tempRoot, "cards/esw2_dbg__wild_magic.json", {
    ...createFixtureCard("esw2_dbg__wild_magic"),
    engine: {
      ...createFixtureCard("esw2_dbg__wild_magic").engine,
      cardKind: "wildMagic",
      effects: [
        {
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [
            { effectId: "add_power", timing: "onPlay", amount: "oops" },
          ],
        } as never,
      ],
    },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ]) {
    writeJsonFile(tempRoot, file, emptyDeck);
  }

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("options[0].amount must be a positive integer")));
  }
});

test("runtime data boundary rejects malformed nested attack branches", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-attack-branch-"));
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-attack-branch",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  const card = createFixtureCard("fixture-attack-branch");
  writeJsonFile(tempRoot, "cards/card.json", {
    ...card,
    engine: {
      ...card.engine,
      effects: [
        {
          effectId: "attack_damage",
          timing: "onPlay",
          amount: 1,
          onDamageDealt: [
            { effectId: "gain_chips", amount: "oops" },
            { effectId: "gain_chips", amount: 2, target: "rawOnly" },
          ],
        },
      ],
    },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ]) {
    writeJsonFile(tempRoot, file, emptyDeck);
  }

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("onDamageDealt")));
    assert.ok(
      result.errors.some((error) => error.includes("uses unsupported field target"))
    );
  }
});

test("executable validation rejects malformed nested add-power branches", () => {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-attack-branch-validation-")
  );
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-attack-branch-validation",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  const card = createFixtureCard("fixture-attack-branch-validation");
  writeJsonFile(tempRoot, "cards/card.json", {
    ...card,
    engine: {
      ...card.engine,
      effects: [
        {
          effectId: "attack_damage",
          timing: "onPlay",
          amount: 1,
          targetSelector: "chosenFoe",
          onDamageDealt: [{ effectId: "add_power", amount: "oops" }],
        },
      ],
    },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ])
    writeJsonFile(tempRoot, file, emptyDeck);

  const decoded = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(decoded.ok, false);
  if (!decoded.ok)
    assert.ok(
      decoded.errors.some((error) =>
        error.includes("effectId is not a supported attack outcome")
      )
    );
});

test("runtime data decoder rejects raw-only fields from nested Wild Magic options", () => {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-wild-magic-raw-only-")
  );
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-wild-magic-raw-only",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  writeJsonFile(tempRoot, "cards/esw2_dbg__wild_magic.json", {
    ...createFixtureCard("esw2_dbg__wild_magic"),
    engine: {
      ...createFixtureCard("esw2_dbg__wild_magic").engine,
      cardKind: "wildMagic",
      effects: [
        {
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [
            { effectId: "add_power", amount: 2, rawOnly: "discard me" },
          ],
        },
      ],
    },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ]) {
    writeJsonFile(tempRoot, file, emptyDeck);
  }

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) => error.includes("options[0] uses unsupported field rawOnly"))
    );
  }
});

test("runtime data decoder rejects raw-only fields from nested attack branches", () => {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), "runtime-attack-branch-raw-only-")
  );
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-attack-branch-raw-only",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  const card = createFixtureCard("fixture-attack-branch-raw-only");
  writeJsonFile(tempRoot, "cards/card.json", {
    ...card,
    engine: {
      ...card.engine,
      effects: [
        {
          effectId: "attack_damage",
          timing: "onPlay",
          amount: 1,
          onDamageDealt: [
            { effectId: "gain_chips", amount: 2, rawOnly: "discard me" },
          ],
        },
      ],
    },
  });
  const emptyDeck = {
    schemaVersion: 1,
    deckId: "empty",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  for (const file of [
    "decks/starter.json",
    "decks/main.json",
    "decks/legend.json",
    "stacks/wild.json",
    "stacks/limp.json",
  ])
    writeJsonFile(tempRoot, file, emptyDeck);
  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.includes("onDamageDealt[0] uses unsupported field rawOnly")
      )
    );
  }
});

test("runtime effect conditions are exposed as a typed union", () => {
  const condition: RuntimeEffectCondition = {
    conditionId: "control_count",
    cardTypes: ["treasure"],
    minimumCount: 2,
  };

  assert.equal(condition.conditionId, "control_count");
});

test("runtime effect costs are exposed as a typed union", () => {
  const cost: RuntimeEffectCost = {
    costId: "spend_chips",
    amount: 2,
  };

  assert.equal(cost.costId, "spend_chips");
});

test("discard-other-card defense cost rejects unsupported quantities", () => {
  const result = validateRuntimeEffectCatalogPayload(
    "Fixture defense",
    "avoid_attack",
    {
      effectId: "avoid_attack",
      timing: "onDefense",
      destination: "discardSelf",
      costs: [{ costId: "discard_other_hand_card", amount: 2 }],
    },
    "fixture",
    "card"
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) => error.includes("costs[0].amount")),
      result.errors.join("; ")
    );
  }
});

test("effect runtime catalog accepts only decoded runtime effect ids", () => {
  const result = decodeCurrentRuntimeDataPack(rootDir);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const effect = [...result.value.cardDefinitions.values()]
    .flatMap((definition) => definition.engine.effects)
    .at(0);
  assert.ok(effect);

  const effectId: RuntimeEffectId = effect.effectId;
  const validation = validateRuntimeEffectCatalogPayload(
    "Decoded runtime effect",
    effectId,
    effect,
    "combat",
    "card"
  );
  assert.equal(validation.ok, true);

  type CatalogEffectIdParameter = Parameters<
    typeof validateRuntimeEffectCatalogPayload
  >[1];
  const rawStringIsRejectedAtTheDecoderBoundary: Assert<
    string extends CatalogEffectIdParameter ? false : true
  > = true;
  assert.equal(rawStringIsRejectedAtTheDecoderBoundary, true);
});

test("runtime services accept decoded effect ids", () => {
  type AttackEffectId = Parameters<
    EffectRuntimeServices["resolvePlayerControlledAttack"]
  >[0]["effectId"];
  const rawStringIsRejectedByRuntimeServices: Assert<
    string extends AttackEffectId ? false : true
  > = true;

  assert.equal(rawStringIsRejectedByRuntimeServices, true);
});

test("test-only catalog operations retain the concrete effect type", () => {
  type AddPowerExecute = NonNullable<
    EffectRuntimeCatalogOperationOverridesForTesting<"add_power">["execute"]
  >;
  type AddPowerEffect = Parameters<AddPowerExecute>[2];
  const anotherEffectIdIsRejectedByTheAddPowerOperation: Assert<
    "gain_chips" extends AddPowerEffect["effectId"] ? false : true
  > = true;

  assert.equal(anotherEffectIdIsRejectedByTheAddPowerOperation, true);
});

test("executable validation applies catalog source kinds", () => {
  const effectId = "temporary_hand_limit_by_gained_card_type";
  const effect = {
    effectId,
    timing: "endTurn",
    amount: 1,
    cardTypes: ["spell"],
  };

  const wizardPropertyResult = validateExecutableDataPack(
    withFixtureToken({
      schemaVersion: 1,
      tokenId: "wizard-property-fixture-source-kind-validation",
      runtimeSchema: "krutagidon.tokenDefinition.v0",
      kind: "wizardProperty",
      visible: {
        textRu: "За полученное заклинание добери на 1 карту больше.",
      },
      engine: {
        mappingStatus: "fixture",
        playableInV0: true,
        effects: [effect],
        unsupportedMechanics: [],
      },
    })
  );
  assert.deepEqual(wizardPropertyResult, { ok: true });

  const deadWizardTokenResult = validateExecutableDataPack(
    withFixtureToken({
      schemaVersion: 1,
      tokenId: "dead-wizard-token-fixture-source-kind-validation",
      runtimeSchema: "krutagidon.tokenDefinition.v0",
      kind: "deadWizardToken",
      victoryPoints: 0,
      effects: [effect],
    })
  );
  assert.deepEqual(deadWizardTokenResult, {
    ok: false,
    errors: [
      "Token dead-wizard-token-fixture-source-kind-validation uses token-only effect id temporary_hand_limit_by_gained_card_type",
    ],
  });
});

test("runtime effect target selectors are exposed as a literal union", () => {
  const target: RuntimeEffectSelectorTarget = { selector: "opponentPlayer" };
  const selector: TargetSelector = target.selector;

  const effectTarget: RuntimeEffectTarget = target;

  assert.equal(selector, "opponentPlayer");
  assert.deepEqual(effectTarget, target);
});

type Assert<T extends true> = T;

test("current runtime manifest omits manual report metadata", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(rootDir, "data/packs/current-runtime.json"), "utf8")
  ) as Record<string, unknown>;

  for (const fieldName of [
    "counts",
    "unsupportedCards",
    "needsData",
    "notes",
  ]) {
    assert.equal(fieldName in manifest, false);
  }
});

test("runtime data decoder aggregates file and section errors", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-data-decode-"));
  mkdirSync(path.join(tempRoot, "cards"));
  mkdirSync(path.join(tempRoot, "tokens"));
  mkdirSync(path.join(tempRoot, "decks"));
  mkdirSync(path.join(tempRoot, "stacks"));

  writeFileSync(
    path.join(tempRoot, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      packId: "fixture-invalid-runtime",
      runtimeSchema: "krutagidon.dataPack.v0",
      mappingStatus: "fixture",
      cardDefinitionPaths: ["cards"],
      tokenDefinitionPaths: ["tokens"],
      decks: {
        starterDeck: "decks/starter.json",
        mainDeck: "decks/main.json",
        legendDeck: "decks/legend.json",
      },
      cardStacks: {
        wildMagicStack: "stacks/wild.json",
        limpWandStack: "stacks/limp.json",
      },
      tokenStacks: {
        deadWizardTokens: "tokens/dead-stack.json",
      },
      needsData: [],
    }),
    "utf8"
  );
  writeFileSync(path.join(tempRoot, "decks", "starter.json"), "{", "utf8");
  writeFileSync(path.join(tempRoot, "stacks", "wild.json"), "{", "utf8");

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.startsWith("Runtime data decks.starterDeck decks/starter.json:")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.startsWith(
          "Runtime data cardStacks.wildMagicStack stacks/wild.json:"
        )
      )
    );
  }
});

test("runtime data decoder rejects invalid manifest field shapes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-manifest-shape-"));
  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: "1",
    packId: "fixture-invalid-manifest",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: 42,
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
    needsData: [],
  });

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.includes("schemaVersion must be a finite number")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("decks.mainDeck must be a string")
      )
    );
  }
});

test("runtime data decoder rejects invalid decoded field shapes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-data-shape-"));
  const validDeck = {
    schemaVersion: 1,
    deckId: "fixture-valid",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };
  const validTokenStack = {
    schemaVersion: 1,
    stackId: "fixture-valid",
    runtimeSchema: "krutagidon.tokenStack.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };

  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-invalid-shape",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: [],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
    tokenStacks: {
      deadWizardTokens: "token-stacks/dead-wizards.json",
    },
    needsData: [],
  });
  writeJsonFile(tempRoot, "cards/fixture-card.json", createFixtureCard("c1"));
  writeJsonFile(tempRoot, "decks/starter.json", {
    ...validDeck,
    deckId: "fixture-invalid-starter",
    entries: [{ cardId: "c1", count: "1" }],
  });
  writeJsonFile(tempRoot, "decks/main.json", validDeck);
  writeJsonFile(tempRoot, "decks/legend.json", validDeck);
  writeJsonFile(tempRoot, "stacks/wild.json", validDeck);
  writeJsonFile(tempRoot, "stacks/limp.json", validDeck);
  writeJsonFile(tempRoot, "token-stacks/dead-wizards.json", {
    ...validTokenStack,
    entries: [{ tokenId: "dead-wizard", count: "1" }],
  });

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.startsWith("Runtime data decks.starterDeck decks/starter.json:")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("entries[0].count must be a finite number")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.startsWith(
          "Runtime data tokenStacks.deadWizardTokens token-stacks/dead-wizards.json:"
        )
      )
    );
  }
});

test("runtime data decoder rejects invalid card and token definition field shapes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-object-shape-"));
  const invalidCard = createFixtureCard("bad-card");
  const validDeck = {
    schemaVersion: 1,
    deckId: "fixture-valid",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [],
  };

  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-invalid-runtime-object",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: ["tokens"],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
    },
  });
  writeJsonFile(tempRoot, "cards/bad-card.json", {
    ...invalidCard,
    visible: {
      ...invalidCard.visible,
      cardKind: "unknown",
    },
    engine: {
      ...invalidCard.engine,
      playableInV0: "yes",
      effects: [
        {
          effectId: "add_power",
          timing: "unsupported_timing",
          amount: 1,
        },
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
          target: {
            selector: "unsupported_selector",
          },
        },
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
          targetSelector: "unsupported_selector",
        },
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
          condition: {
            conditionId: "unsupported_condition",
          },
        },
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
          costs: [{ costId: "unsupported_cost" }],
        },
      ],
    },
  });
  writeJsonFile(tempRoot, "tokens/bad-token.json", {
    schemaVersion: 1,
    tokenId: "bad-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    visible: {
      textRu: 7,
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: false,
      effects: "none",
      unsupportedMechanics: [],
    },
  });
  writeJsonFile(tempRoot, "decks/starter.json", validDeck);
  writeJsonFile(tempRoot, "decks/main.json", validDeck);
  writeJsonFile(tempRoot, "decks/legend.json", validDeck);
  writeJsonFile(tempRoot, "stacks/wild.json", validDeck);
  writeJsonFile(tempRoot, "stacks/limp.json", validDeck);

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.startsWith(
          "Runtime data cardDefinitionPaths cards/bad-card.json:"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          "visible.cardKind contains unsupported card kind unknown"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("engine.playableInV0 must be a boolean")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          "engine.effects[0].timing"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("engine.effects[1] uses unsupported field target")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          "engine.effects[2] uses unsupported field targetSelector"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          "engine.effects[3].condition uses an unsupported condition shape"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("engine.effects[4] uses unsupported field costs")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.startsWith(
          "Runtime data tokenDefinitionPaths tokens/bad-token.json:"
        )
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("visible.textRu must be a string")
      )
    );
    assert.ok(
      result.errors.some((error) =>
        error.includes("engine.effects must be an array")
      )
    );
  }
});

test("runtime data decoder does not pass raw object fields through", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "runtime-data-raw-"));
  const baseFixtureCard = createFixtureCard("runtime-card");
  const fixtureCard = {
    ...baseFixtureCard,
    engine: {
      ...baseFixtureCard.engine,
      effects: [
        {
          effectId: "conditional_activation_gain_chips",
          timing: "activation",
          amount: 1,
          activationLimit: "oncePerTurnWhileControlled",
          condition: {
            conditionId: "control_count",
            cardTypes: ["treasure"],
            minimumCount: 2,
          },
        },
        {
          effectId: "attack_damage",
          timing: "onPlay",
          amount: 1,
          target: { selector: "opponentPlayer" },
          costs: [{ costId: "spend_chips", amount: 1 }],
        },
      ],
    },
  };
  const validDeck = {
    schemaVersion: 1,
    deckId: "fixture-valid",
    runtimeSchema: "krutagidon.deckComposition.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [{ cardId: "runtime-card", count: 1, rawOnly: true }],
    rawOnly: true,
  };
  const validTokenStack = {
    schemaVersion: 1,
    stackId: "fixture-valid-tokens",
    runtimeSchema: "krutagidon.tokenStack.v0",
    role: "fixture",
    mappingStatus: "fixture",
    entries: [{ tokenId: "dead-token", count: 1, rawOnly: true }],
    rawOnly: true,
  };

  writeJsonFile(tempRoot, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-raw-fields",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
    tokenDefinitionPaths: ["tokens"],
    decks: {
      starterDeck: "decks/starter.json",
      mainDeck: "decks/main.json",
      legendDeck: "decks/legend.json",
      rawOnly: true,
    },
    cardStacks: {
      wildMagicStack: "stacks/wild.json",
      limpWandStack: "stacks/limp.json",
      rawOnly: true,
    },
    tokenStacks: {
      deadWizardTokens: "token-stacks/dead-wizards.json",
      rawOnly: true,
    },
    pools: {
      rawOnly: true,
    },
    rawOnly: true,
  });
  writeJsonFile(tempRoot, "cards/runtime-card.json", {
    ...fixtureCard,
    visible: {
      ...fixtureCard.visible,
      rawOnly: true,
    },
    engine: {
      ...fixtureCard.engine,
      rawOnly: true,
    },
    rawOnly: true,
  });
  writeJsonFile(tempRoot, "tokens/dead-token.json", {
    schemaVersion: 1,
    tokenId: "dead-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    victoryPoints: 0,
    effects: [],
    rawOnly: true,
  });
  writeJsonFile(tempRoot, "decks/starter.json", validDeck);
  writeJsonFile(tempRoot, "decks/main.json", validDeck);
  writeJsonFile(tempRoot, "decks/legend.json", validDeck);
  writeJsonFile(tempRoot, "stacks/wild.json", validDeck);
  writeJsonFile(tempRoot, "stacks/limp.json", validDeck);
  writeJsonFile(tempRoot, "token-stacks/dead-wizards.json", validTokenStack);

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");

  assert.equal(result.ok, true);
  if (result.ok) {
    const decodedCard = result.value.cardDefinitions.get("runtime-card");
    const decodedToken = result.value.tokenDefinitions.get("dead-token");

    assert.equal("rawOnly" in result.value.manifest, false);
    assert.equal("rawOnly" in result.value.manifest.decks!, false);
    assert.equal("rawOnly" in result.value.manifest.cardStacks!, false);
    assert.equal("rawOnly" in result.value.manifest.tokenStacks!, false);
    assert.equal("rawOnly" in result.value.manifest.pools!, false);
    assert.equal(decodedCard === undefined, false);
    assert.equal(decodedToken === undefined, false);
    assert.equal("rawOnly" in decodedCard!, false);
    assert.equal("rawOnly" in decodedCard!.visible, false);
    assert.equal("rawOnly" in decodedCard!.engine, false);
    const [conditionalEffect, costedEffect] = decodedCard!.engine.effects;
    assert.deepEqual(
      conditionalEffect?.effectId === "conditional_activation_gain_chips"
        ? conditionalEffect.condition
        : undefined,
      {
        conditionId: "control_count",
        cardTypes: ["treasure"],
        minimumCount: 2,
      }
    );
    assert.deepEqual(
      costedEffect?.effectId === "attack_damage"
        ? costedEffect.costs
        : undefined,
      [{ costId: "spend_chips", amount: 1 }]
    );
    assert.equal("rawOnly" in decodedToken!, false);
    assert.equal("rawOnly" in result.value.decks.starterDeck, false);
    assert.equal(
      "rawOnly" in result.value.decks.starterDeck.entries[0]!,
      false
    );
    assert.equal(
      "rawOnly" in result.value.tokenStacks.deadWizardTokens!,
      false
    );
    assert.equal(
      "rawOnly" in result.value.tokenStacks.deadWizardTokens!.entries[0]!,
      false
    );
  }
});

test("supported executable fixture data pack passes executable effect validation", () => {
  const card = createFixtureCard("fixture-supported-effect");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("executable data-pack validation rejects invalid add-power amount", () => {
  const card = createFixtureCard("fixture-invalid-add-power");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1.5,
        },
        asMalformedRuntimeEffect({
          effectId: "add_power",
          timing: "onPlay",
          amount: "2",
        }),
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 0,
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.equal(
    result.errors.filter((error) => error.includes("amount must be a positive integer"))
      .length,
    3
  );
});

test("executable data-pack validation rejects an add-power selector", () => {
  const card = createFixtureCard("fixture-add-power-with-selector");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        asMalformedRuntimeEffect({
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
          targetSelector: "chosenFoe",
        }),
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) =>
        error.includes("uses unsupported field targetSelector")
      )
    );
  }
});

test("executable data-pack validation rejects invalid add-power Wild Magic option amount", () => {
  const card = createFixtureCard("fixture-invalid-wild-magic-add-power-option");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "wild_magic_choice",
          timing: "onPlay",
          options: [
            {
              effectId: "add_power",
              timing: "onPlay",
              amount: "2",
            },
          ],
        } as never,
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("options[0].amount must be a positive integer"))
  );
});

test("supported executable healing effect passes executable effect validation", () => {
  const card = createFixtureCard("fixture-supported-healing-effect");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "heal",
          timing: "onPlay",
          amount: 3,
          target: {
            selector: "activePlayer",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("supported executable damage effect passes executable effect validation", () => {
  const card = createFixtureCard("fixture-supported-damage-effect");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "deal_damage",
          timing: "onPlay",
          amount: 4,
          target: {
            selector: "opponentPlayer",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("supported executable card movement and deck effects pass executable effect validation", () => {
  const card = createFixtureCard("fixture-supported-core-movement-effects");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "gain_card",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
          destination: "discard",
        },
        {
          effectId: "discard_card",
          timing: "onPlay",
          target: {
            selector: "activePlayerHandCard",
          },
        },
        {
          effectId: "destroy_card",
          timing: "onPlay",
          target: {
            selector: "activePlayerHandCard",
          },
        },
        {
          effectId: "reveal_top_card",
          timing: "onPlay",
          source: "activePlayerDeck",
        },
        {
          effectId: "play_top_card",
          timing: "onPlay",
          source: "activePlayerDeck",
          destination: "play",
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("executable data-pack validation rejects invalid core movement effect shapes", () => {
  const card = createFixtureCard("fixture-invalid-core-movement-effects");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "gain_card",
          timing: "onPlay",
          target: {
            selector: "activePlayerHandCard",
          },
          destination: "discard",
        },
        asMalformedRuntimeEffect({
          effectId: "gain_card",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
          destination: "deckTop",
        }),
        {
          effectId: "discard_card",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
        },
        {
          effectId: "destroy_card",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("unsupported gain target activePlayerHandCard")
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("destination must be discard")
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("unsupported discard target mainMarketCard")
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("unsupported destroy target mainMarketCard")
    )
  );
});

test("supported executable attack and defense effects pass executable effect validation", () => {
  const attackCard = createFixtureCard("fixture-supported-attack-effect");
  const defenseCard = createFixtureCard("fixture-supported-defense-effect");
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const attackDataPack: LoadedDataPack = {
    ...dataPack,
    cardDefinitions: new Map([
      [
        attackCard.cardId,
        {
          ...attackCard,
          engine: {
            ...attackCard.engine,
            playableInV0: true,
            effects: [
              {
                effectId: "attack_damage",
                timing: "onPlay",
                amount: 4,
                target: {
                  selector: "opponentPlayer",
                },
              },
            ],
          },
        },
      ],
      [
        defenseCard.cardId,
        {
          ...defenseCard,
          engine: {
            ...defenseCard.engine,
            playableInV0: true,
            effects: [
              {
                effectId: "avoid_attack",
                timing: "onDefense",
                destination: "discardSelf",
              },
            ],
          },
        },
      ],
    ]),
  };

  const result = validateExecutableDataPack(attackDataPack);

  assert.deepEqual(result, { ok: true });
});

test("supported executable multi-target attack passes executable effect validation", () => {
  const card = createFixtureCard(
    "fixture-supported-multi-target-attack-effect"
  );
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "multi_target_attack",
          timing: "onPlay",
          amount: 4,
          target: {
            selector: "opponentPlayers",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("supported executable Mayhem attack passes executable effect validation", () => {
  const card = createFixtureCard("fixture-supported-mayhem-attack-effect");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "mayhem_attack",
          timing: "onPlay",
          amount: 4,
          target: {
            selector: "allPlayers",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);
  assert.deepEqual(result, { ok: true });
});

test("multi-target and Mayhem attacks require one nested target representation", () => {
  const cases = [
    {
      effectId: "multi_target_attack",
      selector: "opponentPlayers",
      conflictingSelector: "allPlayers",
      foreignSelector: "allPlayers",
    },
    {
      effectId: "mayhem_attack",
      selector: "allPlayers",
      conflictingSelector: "opponentPlayers",
      foreignSelector: "opponentPlayers",
    },
  ] as const;

  for (
    const { effectId, selector, conflictingSelector, foreignSelector } of cases
  ) {
    const payload = {
      effectId,
      timing: "onPlay",
      amount: 4,
      target: { selector },
    };

    assert.deepEqual(validateRawRuntimeEffect(effectId, "Fixture", payload), []);
    assert.ok(
      validateRawRuntimeEffect(effectId, "Fixture", {
        ...payload,
        targetSelector: conflictingSelector,
      }).some((error) => error.includes("unsupported field targetSelector"))
    );
    assert.ok(
      validateRawRuntimeEffect(effectId, "Fixture", {
        effectId,
        timing: "onPlay",
        amount: 4,
        targetSelector: selector,
      }).some((error) => error.includes("target is required"))
    );
    assert.ok(
      validateRawRuntimeEffect(effectId, "Fixture", {
        ...payload,
        target: { selector: foreignSelector },
      }).some((error) => error.includes(`must use selector ${selector}`))
    );
  }
});

test("executable data-pack validation rejects conflicting attack and status targets before execution", () => {
  const cases = [
    {
      cardId: "fixture-conflicting-attack-targets",
      effectId: "attack_damage",
      payload: {
        effectId: "attack_damage",
        timing: "onPlay",
        amount: 2,
        target: { selector: "opponentPlayer" },
        targetSelector: "eachFoe",
      },
    },
    {
      cardId: "fixture-conflicting-status-targets",
      effectId: "gain_status",
      payload: {
        effectId: "gain_status",
        timing: "onPlay",
        statusId: "dingler",
        target: { selector: "opponentPlayer" },
        targetSelector: "eachPlayerClockwiseFromActive",
      },
    },
  ] as const;

  const results = cases.map(({ cardId, effectId, payload }) => {
    const card = createFixtureCard(cardId);
    const dataPack = withOnlyFixtureCard({
      ...card,
      engine: {
        ...card.engine,
        effects: [asMalformedRuntimeEffect(payload)],
      },
    });

    return validateExecutableDataPack(dataPack);
  });

  assert.deepEqual(results, [
    {
      ok: false,
      errors: [
        "Card fixture-conflicting-attack-targets target and targetSelector cannot both be provided",
      ],
    },
    {
      ok: false,
      errors: [
        "Card fixture-conflicting-status-targets target and targetSelector cannot both be provided",
      ],
    },
  ]);
});

test("combat effect decoders reject invalid concrete payloads", () => {
  const combatEffectIds = [
    "deal_damage",
    "attack_damage",
    "attack_damage_equal_to_controlled_card_cost",
    "multi_target_attack",
    "mayhem_attack",
  ] as const satisfies readonly RuntimeEffectId[];

  for (const effectId of combatEffectIds) {
    assert.notDeepEqual(
      validateRawRuntimeEffect(effectId, "Fixture", {
        effectId,
        timing: "onPlay",
        amount: 0,
        target: {
          selector: "unsupported" as never,
        },
      }),
      []
    );
  }
});

test("controlled-object power decoder rejects invalid payloads", () => {
  assert.notDeepEqual(
    validateRawRuntimeEffect("add_power_per_controlled_object", "Fixture", {
      effectId: "add_power_per_controlled_object",
      timing: "onPlay",
      amount: 0,
    }),
    []
  );
});

test("ongoing controlled power decoder owns its passive payload", () => {
  assert.deepEqual(
    validateRawRuntimeEffect("ongoing_add_power", "Fixture", {
      effectId: "ongoing_add_power",
      timing: "whileControlled",
      amount: 1,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("ongoing_add_power", "Fixture", {
      effectId: "ongoing_add_power",
      timing: "onPlay",
      amount: 0,
    }),
    []
  );
});

test("DWT ongoing power decoder owns its typed passive payload", () => {
  const effect: OngoingAddPowerPerDeadWizardTokenRuntimeEffect = {
    effectId: "ongoing_add_power_per_dead_wizard_token",
    timing: "whileControlled",
    amount: 1,
  };

  assert.deepEqual(
    validateRawRuntimeEffect(effect.effectId, "Fixture", effect),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(effect.effectId, "Fixture", {
      ...effect,
      timing: "onPlay",
    }),
    []
  );
});

test("Wand play power decoder owns its typed trigger payload", () => {
  const effect: OngoingAddPowerWhenPlayingWandRuntimeEffect = {
    effectId: "ongoing_add_power_when_playing_wand",
    timing: "onPlayCard",
    amount: 1,
    cardTags: ["wandCard"],
  };

  assert.deepEqual(
    validateRawRuntimeEffect(effect.effectId, "Fixture", effect),
    []
  );
});

test("catalog decoders reject invalid economy and draw payloads", () => {

  assert.notDeepEqual(
    validateRawRuntimeEffect("gain_chips", "Fixture", {
      effectId: "gain_chips",
      timing: "onPlay",
      amount: 0,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("draw_cards", "Fixture", {
      effectId: "draw_cards",
      timing: "onPlay",
      amount: "1",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "gain_chips_per_player_with_status",
      "Fixture",
      {
        effectId: "gain_chips_per_player_with_status",
        timing: "onPlay",
        amountPerPlayer: 1,
        status: "wizard",
      }
    ),
    []
  );
});

test("catalog decoders reject invalid top-deck and Wild Magic payloads", () => {

  assert.notDeepEqual(
    validateRawRuntimeEffect("reveal_top_card", "Fixture", {
      effectId: "reveal_top_card",
      timing: "onPlay",
      source: "unsupportedDeck",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("play_top_card", "Fixture", {
      effectId: "play_top_card",
      timing: "onPlay",
      source: "activePlayerDeck",
      destination: "unsupportedDestination",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "play_top_card_from_foe_deck",
      "Fixture",
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "unsupportedFoe",
      }
    ),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("wild_magic_choice", "Fixture", {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          effectId: "add_power",
          amount: "2",
        },
      ],
    }),
    []
  );
});

test("catalog decoders reject invalid life and Dingler status payloads", () => {

  assert.notDeepEqual(
    validateRawRuntimeEffect("heal", "Fixture", {
      effectId: "heal",
      timing: "onPlay",
      amount: 0,
      target: {
        selector: "mainMarketCard",
      },
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("set_life", "Fixture", {
      effectId: "set_life",
      timing: "onPlay",
      lifeTotal: 0,
      target: {
        selector: "mainMarketCard",
      },
    }),
    []
  );
  for (const effectId of [
    "gain_status",
    "remove_status",
    "toggle_status",
  ] as const satisfies readonly RuntimeEffectId[]) {
    assert.notDeepEqual(
      validateRawRuntimeEffect(effectId, "Fixture", {
        effectId,
        timing: "onPlay",
        statusId: "wizard",
        target: {
          selector: "mainMarketCard",
        },
      }),
      []
    );
  }
  assert.deepEqual(
    validateRawRuntimeEffect(
      "add_power_per_player_with_status",
      "Fixture",
      {
        effectId: "add_power_per_player_with_status",
        timing: "onPlay",
        statusId: "dingler",
        amountPerPlayer: 1,
      }
    ),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "add_power_per_player_with_status",
      "Fixture",
      {
        effectId: "add_power_per_player_with_status",
        timing: "onPlay",
        statusId: "wizard",
        amountPerPlayer: 0,
      }
    ),
    []
  );
});

test("catalog decoders reject invalid Mega Mayhem life and status payloads", () => {

  assert.deepEqual(
    validateRawRuntimeEffect("mega_mayhem_set_life", "Fixture", {
      effectId: "mega_mayhem_set_life",
      timing: "onMayhemResolve",
      lifeTotal: 5,
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("mega_mayhem_set_life", "Fixture", {
      effectId: "mega_mayhem_set_life",
      timing: "onPlay",
      lifeTotal: 0,
      targetSelector: "activePlayer",
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(
      "mega_mayhem_each_player_toggle_dingler",
      "Fixture",
      {
      effectId: "mega_mayhem_each_player_toggle_dingler",
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "mega_mayhem_each_player_toggle_dingler",
      "Fixture",
      {
      effectId: "mega_mayhem_each_player_toggle_dingler",
      timing: "onPlay",
      targetSelector: "activePlayer",
      statusId: "wizard",
    }),
    []
  );
});

test("catalog decoder rejects an invalid Mega Mayhem destroy-top payload", () => {
  const effectId =
    "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem";
  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      deathCondition: {
        effectId: "destroyed_card_kind_is",
        cardKind: "mayhem",
      },
      destroyedCardSource: "mainDeck",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
    }),
    []
  );
});

test("catalog decoder rejects an invalid Mayhem discard-top payload", () => {
  const effectId =
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none";
  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      chooser: "affectedPlayer",
      choice: "destroyBothOrDestroyNone",
      amount: 1,
      sourceZone: "deck",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
      amount: -1,
    }),
    []
  );
});

test("catalog decoder rejects an invalid Mayhem discard-deck payload", () => {
  const effectId = "mayhem_each_player_discard_deck_then_destroy_from_discard";
  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      chooser: "affectedPlayer",
      destroyAmount: 1,
      destroySourceZone: "discard",
      discardSourceZone: "deck",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
    }),
    []
  );
});

test("catalog decoder rejects unsupported Mayhem hand-redraw options", () => {
  const effectId = "mayhem_each_player_choose_discard_hand_draw_or_take_damage";
  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      options: [
        {
          effectId: "discard_hand_then_draw_cards",
          drawAmount: 5,
        },
        {
          effectId: "take_damage",
          amount: 5,
        },
      ],
      chooser: "affectedPlayer",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(effectId, "Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      options: [
        {
          effectId: "discard_hand_then_draw_cards",
          drawAmount: 5,
        },
        {
          effectId: "take_damage",
          amount: 3,
        },
      ],
      chooser: "affectedPlayer",
    }),
    []
  );
});

test("catalog decoders reject invalid Mayhem battle and vote payloads", () => {
  const battleEffectId = "mayhem_each_player_battle_highest_hand_cost";
  const voteEffectId = "mayhem_each_player_vote_dingler";
  const recoveryEffectId =
    "mayhem_each_dingler_choose_pay_life_or_chip_to_remove_status";
  const lowestLifeEffectId =
    "mayhem_lowest_life_players_gain_dingler_and_set_to_max_life";
  assert.deepEqual(
    validateRawRuntimeEffect(battleEffectId, "Fixture", {
      effectId: battleEffectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      chooser: "affectedPlayer",
      winnerDrawAmount: 2,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(battleEffectId, "Fixture", {
      effectId: battleEffectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
      chooser: "activePlayer",
      winnerDrawAmount: 0,
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(voteEffectId, "Fixture", {
      effectId: voteEffectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      chooser: "affectedPlayer",
      voteTargetSelector: "anyPlayer",
      statusId: "dingler",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(voteEffectId, "Fixture", {
      effectId: voteEffectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
      chooser: "activePlayer",
      voteTargetSelector: "opponentPlayer",
      statusId: "loser",
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(recoveryEffectId, "Fixture", {
      effectId: recoveryEffectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      chooser: "affectedPlayer",
      statusId: "dingler",
      lifeCost: 5,
      chipCost: 1,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(recoveryEffectId, "Fixture", {
      effectId: recoveryEffectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
      chooser: "activePlayer",
      statusId: "loser",
      lifeCost: 0,
      chipCost: 0,
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(lowestLifeEffectId, "Fixture", {
      effectId: lowestLifeEffectId,
      timing: "onMayhemResolve",
      statusId: "dingler",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(lowestLifeEffectId, "Fixture", {
      effectId: lowestLifeEffectId,
      timing: "onPlay",
      statusId: "loser",
    }),
    []
  );
});

test("catalog decoders reject invalid wizard-property setup payloads", () => {

  assert.deepEqual(
    validateRawRuntimeEffect("replace_starting_card", "Token", {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "esw2_dbg__starter_001",
      toDefinitionId: "esw2_dbg__starter_004",
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect("start_with_basic_trophy", "Token", {
      effectId: "start_with_basic_trophy",
      timing: "setup",
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect("force_starting_player", "Token", {
      effectId: "force_starting_player",
      timing: "setup",
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect("set_starting_life_total", "Token", {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 25,
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(
      "set_resurrection_life_total",
      "Token",
      {
        effectId: "set_resurrection_life_total",
        timing: "replacement",
        lifeTotal: 25,
        unlessStatusId: "loser",
      }
    ),
    []
  );

  assert.notDeepEqual(
    validateRawRuntimeEffect("replace_starting_card", "Token", {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "",
      toDefinitionId: 42,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("force_starting_player", "Token", {
      effectId: "force_starting_player",
      timing: "setup",
      targetSelector: "chosenFoe",
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect("set_starting_life_total", "Token", {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 0,
    }),
    []
  );
  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "set_resurrection_life_total",
      "Token",
      {
        effectId: "set_resurrection_life_total",
        timing: "replacement",
        lifeTotal: "25",
        unlessStatusId: 5,
      }
    ),
    []
  );
});

test("wizard property effective-value decoder accepts and rejects exact payloads", () => {

  for (const effect of [
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardVictoryPoints",
      operation: "add",
      amount: 1,
      target: {
        targetType: "card",
        cardTypes: ["treasure"],
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardVictoryPoints",
      operation: "add",
      amountPerOwnedCard: 1,
      countedCardTypes: ["treasure"],
      target: {
        targetType: "card",
        cardTypes: ["treasure"],
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "tokenVictoryPoints",
      operation: "add",
      amount: 1,
      target: {
        targetType: "token",
        definitionId: "fixture-token",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "playerMaxLife",
      operation: "add",
      amount: -10,
      target: {
        targetType: "player",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "playerVictoryPoints",
      operation: "add",
      amount: -5,
      target: {
        targetType: "player",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "invertNegative",
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    },
  ]) {
    assert.deepEqual(
      validateRawRuntimeEffect("modify_effective_value", "Token", effect),
      []
    );
  }

  for (const effect of [
    {
      effectId: "modify_effective_value",
      timing: "onPlay",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "handLimit",
      operation: "add",
      amount: 1,
      target: {
        targetType: "player",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "multiply",
      amount: 2,
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: 1.5,
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    },
    {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
      target: {
        targetType: "player",
      },
    },
  ]) {
    assert.notDeepEqual(
      validateRawRuntimeEffect("modify_effective_value", "Token", effect),
      []
    );
  }
});

test("effective-value decoder rejects add with both fixed and owned-card amounts", () => {
  assert.deepEqual(
    validateRawRuntimeEffect("modify_effective_value", "Token", {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
      amountPerOwnedCard: -2,
      countedCardTypes: ["treasure"],
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    }),
    ["Token uses add operation with both amount and amountPerOwnedCard"]
  );
});

test("effective-value decoder rejects fields that do not belong to invertNegative", () => {
  assert.deepEqual(
    validateRawRuntimeEffect("modify_effective_value", "Token", {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "invertNegative",
      amount: -1,
      amountPerOwnedCard: -2,
      countedCardTypes: ["treasure"],
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    }),
    [
      "Token uses invertNegative with amount",
      "Token uses invertNegative with amountPerOwnedCard",
      "Token uses invertNegative with countedCardTypes",
    ]
  );
});

test("effective-value decoder rejects counted-card types without an owned-card amount", () => {
  assert.deepEqual(
    validateRawRuntimeEffect("modify_effective_value", "Token", {
      effectId: "modify_effective_value",
      timing: "whileControlled",
      valueKind: "cardCost",
      operation: "add",
      amount: -1,
      countedCardTypes: ["treasure"],
      target: {
        targetType: "card",
        definitionId: "fixture-card",
      },
    }),
    ["Token uses countedCardTypes without amountPerOwnedCard"]
  );
});

test("executable data-pack validation rejects invalid effective-value modifier shape through the catalog", () => {
  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-invalid-effective-value",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    visible: {
      textRu: "Твоя скидка на сокровища считается неверно.",
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "modify_effective_value",
          timing: "whileControlled",
          valueKind: "cardCost",
          operation: "multiply",
          amount: -1,
          target: {
            targetType: "card",
            cardTypes: ["treasure"],
          },
        },
      ],
      unsupportedMechanics: [],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("wizard-property-fixture-invalid-effective-value") &&
        error.includes("operation must be one of add, invertNegative")
      );
    })
  );
});

test("executable data-pack validation rejects malformed dead wizard token effects", () => {
  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "dead-wizard-token-invalid-effective-value",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: 0,
    effects: [
      {
        effectId: "modify_effective_value",
        timing: "whileControlled",
        valueKind: "cardCost",
        operation: "add",
        amount: "oops",
        target: {
          targetType: "card",
          definitionId: "fixture-card",
        },
      } as never,
    ],
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("dead-wizard-token-invalid-effective-value") &&
        error.includes("amount must be a safe integer")
      );
    })
  );
});

test("executable data-pack validation rejects unsupported attack outcome ids", () => {
  const card = createFixtureCard("fixture-unsupported-attack-outcome");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      effects: [
        {
          effectId: "attack_damage",
          timing: "onPlay",
          amount: 1,
          target: { selector: "opponentPlayer" },
          onDamageDealt: [
            {
              effectId: "add_power",
              amount: 2,
            } as unknown as AttackOutcomeBranch,
          ],
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("effectId is not a supported attack outcome")
    )
  );
});

test("combat data-pack validation rejects fixture effect ids", () => {
  const card = createFixtureCard("fixture-effect-in-combat-data");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "fixture_add_power_equal_to_target_cost",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-effect-in-combat-data") &&
        error.includes("fixture_add_power_equal_to_target_cost")
      );
    })
  );
});

test("public catalog validation enforces fixture-only modes", () => {
  const fixturePower = {
    effectId: "fixture_add_power_equal_to_target_cost",
    target: { selector: "mainMarketCard" },
  } as const;
  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Fixture power",
      fixturePower.effectId,
      fixturePower,
      "fixture",
      "card"
    ).ok,
    true
  );
  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Fixture power",
      fixturePower.effectId,
      fixturePower,
      "combat",
      "card"
    ).ok,
    false
  );

  const fixtureModifier = {
    effectId: "fixture_modify_effective_value",
    timing: "whileControlled",
    valueKind: "playerMaxLife",
    operation: "add",
    amount: 1,
    target: { targetType: "player" },
  } as const;
  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Fixture modifier",
      fixtureModifier.effectId,
      fixtureModifier,
      "fixture",
      "card"
    ).ok,
    true
  );
  assert.equal(
    validateRuntimeEffectCatalogPayload(
      "Fixture modifier",
      fixtureModifier.effectId,
      fixtureModifier,
      "combat",
      "card"
    ).ok,
    false
  );

  const addPower = {
    effectId: "add_power",
    timing: "onPlay",
    amount: 1,
  } as const;
  for (const mode of ["fixture", "combat"] as const) {
    assert.equal(
      validateRuntimeEffectCatalogPayload(
        `Add power ${mode}`,
        addPower.effectId,
        addPower,
        mode,
        "card"
      ).ok,
      true
    );
  }
});

test("effect runtime catalog validates supported, unknown, and fixture-only effects", () => {
  const card = createFixtureCard("fixture-effect-runtime-catalog");
  const dataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
        },
        {
          effectId: "effect_not_in_catalog",
          timing: "onPlay",
        },
        {
          effectId: "fixture_add_power_equal_to_target_cost",
          timing: "onPlay",
          target: {
            selector: "mainMarketCard",
          },
        },
      ] as never[],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "Card fixture-effect-runtime-catalog uses unsupported effect id effect_not_in_catalog",
    "Card fixture-effect-runtime-catalog uses fixture effect id fixture_add_power_equal_to_target_cost in combat data",
  ]);
});

test("fixture mode does not allow unsupported fixture effect ids", () => {
  const dataPack = withFixtureCard({
    ...createFixtureCard("fixture-unsupported-effect-in-fixture-mode"),
    engine: {
      ...createFixtureCard("fixture-unsupported-effect-in-fixture-mode").engine,
      playableInV0: true,
      effects: [
        {
          effectId: "fixture_not_supported",
          timing: "onPlay",
        },
      ] as never[],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-effect-in-fixture-mode") &&
        error.includes("fixture_not_supported")
      );
    })
  );
});

test("executable data-pack validation rejects unsupported effect ids", () => {
  const dataPack = withFixtureCard({
    ...createFixtureCard("fixture-unsupported-effect"),
    engine: {
      ...createFixtureCard("fixture-unsupported-effect").engine,
      playableInV0: true,
      effects: [
        {
          effectId: "fixture_not_supported",
          timing: "onPlay",
        },
      ] as never[],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-effect") &&
        error.includes("fixture_not_supported")
      );
    })
  );
});

test("topdeck gained card replacement validates supported and invalid shapes", () => {

  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-topdeck-validation",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    visible: {
      textRu:
        "Когда ты получаешь карту, можешь положить её на верх своей колоды.",
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: "topdeck_gained_card",
          timing: "onGainCard",
          optional: true,
          cardTypes: ["creature"],
        },
        {
          effectId: "topdeck_gained_card",
          timing: "onPlay",
          optional: true,
          cardTypes: ["creature"],
        },
        {
          effectId: "topdeck_gained_card",
          timing: "onGainCard",
          optional: true,
          destination: "discard",
          cardTypes: ["creature"],
        },
        {
          effectId: "topdeck_gained_card",
          timing: "onGainCard",
          optional: true,
          cardDefinitionIds: ["fixture-card"],
        },
      ],
      unsupportedMechanics: [],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "Token wizard-property-fixture-topdeck-validation.timing must be onGainCard",
    "Token wizard-property-fixture-topdeck-validation.destination must be deckTop",
    "Token wizard-property-fixture-topdeck-validation uses unsupported field cardDefinitionIds",
  ]);
});

test("temporary hand-limit effect validates supported and invalid shapes", () => {
  const effectId = "temporary_hand_limit_by_gained_card_type";
  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Token", {
      effectId,
      timing: "endTurn",
      amount: 1,
      cardTypes: ["spell"],
    }),
    []
  );

  assert.deepEqual(
    validateRawRuntimeEffect(effectId, "Token", {
      effectId,
      timing: "endTurn",
      amount: 1,
      cardTypes: ["spel"],
    }),
    ["Token uses unknown temporary-hand-limit card type spel"]
  );

  const card = createFixtureCard("fixture-temporary-hand-limit-on-card-source");
  const cardDataPack = withOnlyFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      effects: [
        {
          effectId,
          timing: "endTurn",
          amount: 1,
          cardTypes: ["spell"],
        },
      ],
    },
  });
  const cardResult = validateExecutableDataPack(cardDataPack);

  assert.equal(cardResult.ok, false);
  assert.deepEqual(cardResult.errors, [
    "Card fixture-temporary-hand-limit-on-card-source uses token-only effect id temporary_hand_limit_by_gained_card_type",
  ]);

  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-temporary-hand-limit-validation",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    visible: {
      textRu: "За каждое полученное заклинание добери на 1 карту больше.",
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId,
          timing: "onGainCard",
          amount: 1,
          cardTypes: ["spell"],
        },
        {
          effectId,
          timing: "endTurn",
          amount: 0,
          cardTypes: ["spell"],
        },
        {
          effectId,
          timing: "endTurn",
          amount: 1,
          cardTypes: [],
        },
        {
          effectId,
          timing: "endTurn",
          amount: 1,
          cardTypes: ["spell"],
          cardDefinitionIds: ["fixture-card"],
        },
      ],
      unsupportedMechanics: [],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "Token wizard-property-fixture-temporary-hand-limit-validation.timing must be endTurn",
    "Token wizard-property-fixture-temporary-hand-limit-validation.amount must be a positive integer",
    "Token wizard-property-fixture-temporary-hand-limit-validation.cardTypes must not be empty",
    "Token wizard-property-fixture-temporary-hand-limit-validation uses unsupported field cardDefinitionIds",
  ]);
});

test("wand attack replacement effects validate supported and invalid shapes", () => {
  const modifyDamageEffectId: RuntimeEffectId =
    "modify_owned_wand_attack_damage";
  const preventDefenseEffectId: RuntimeEffectId =
    "prevent_defense_against_owned_wand_attacks";
  assert.deepEqual(
    validateRawRuntimeEffect(modifyDamageEffectId, "Token", {
      effectId: modifyDamageEffectId,
      timing: "attackReplacement",
      amount: 1,
      cardTags: ["wand"],
    }),
    []
  );
  assert.deepEqual(
    validateRawRuntimeEffect(preventDefenseEffectId, "Token", {
      effectId: preventDefenseEffectId,
      timing: "attackReplacement",
      cardDefinitionIds: ["esw2_dbg__starter_004"],
    }),
    []
  );

  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-wand-attack-replacement-validation",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    visible: {
      textRu: "Твои атаки жезла получают +1 и их нельзя защитить.",
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: true,
      effects: [
        {
          effectId: modifyDamageEffectId,
          timing: "onPlay",
          amount: 1,
          cardTags: ["wand"],
        },
        {
          effectId: modifyDamageEffectId,
          timing: "attackReplacement",
          amount: 0,
          cardTags: ["wand"],
        },
        {
          effectId: modifyDamageEffectId,
          timing: "attackReplacement",
          amount: 1,
          cardTags: [],
        },
        {
          effectId: preventDefenseEffectId,
          timing: "attackReplacement",
          cardDefinitionIds: [42],
        },
        {
          effectId: preventDefenseEffectId,
          timing: "attackReplacement",
          cardTags: ["wand"],
          targetSelector: "chosenFoe",
        },
      ],
      unsupportedMechanics: [],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "Token wizard-property-fixture-wand-attack-replacement-validation.timing must be attackReplacement",
    "Token wizard-property-fixture-wand-attack-replacement-validation.amount must be a positive integer",
    "Token wizard-property-fixture-wand-attack-replacement-validation.cardTags must not be empty",
    "Token wizard-property-fixture-wand-attack-replacement-validation.cardDefinitionIds[0] must be a non-empty string",
    "Token wizard-property-fixture-wand-attack-replacement-validation uses unsupported field targetSelector",
  ]);
});

test("executable data-pack validation rejects unsupported mechanics", () => {
  const card = createFixtureCard("fixture-unsupported-mechanic");
  const dataPack = withFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      unsupportedMechanics: ["not-yet-modeled"],
      effects: [
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: 1,
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-mechanic") &&
        error.includes("not-yet-modeled")
      );
    })
  );
});

test("executable data-pack validation rejects wizard property tokens with unsupported mechanics", () => {
  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-unsupported",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    visible: {
      textRu: "Получив волшебника, получи 1 чипсину.",
    },
    engine: {
      mappingStatus: "draft",
      playableInV0: true,
      effects: [],
      unsupportedMechanics: ["wizard-property-triggered-economy"],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("wizard-property-fixture-unsupported") &&
        error.includes("wizard-property-triggered-economy")
      );
    })
  );
});

test("draft wizard property tokens are not treated as executable", () => {
  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-draft",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    visible: {
      textRu: "Получив волшебника, получи 1 чипсину.",
    },
    engine: {
      mappingStatus: "draft",
      playableInV0: false,
      effects: [],
      unsupportedMechanics: ["wizard-property-triggered-economy"],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.deepEqual(result, { ok: true });
});

test("executable data-pack validation rejects manifest references to import-only data", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const result = validateExecutableDataPack({
    ...dataPack,
    manifest: {
      ...dataPack.manifest,
      tokenDefinitionPaths: ["data/import/tokens/wizard-property/drafts"],
    },
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("tokenDefinitionPaths[0]") &&
        error.includes("data/import/tokens/wizard-property/drafts")
      );
    })
  );
});

test("loader rejects import-only card definition paths before reading draft data", () => {
  assert.throws(
    () =>
      loadCurrentRuntimeDataPack(
        rootDir,
        "tests/fixtures/import-card-path-data-pack.json"
      ),
    /Manifest cardDefinitionPaths references import-only path data\/import\/cards\/main\/drafts/
  );
});

test("loader rejects duplicate runtime card ids with both conflicting paths", () => {
  const fixtureRootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-duplicate-card-id-")
  );

  writeRuntimeManifest(fixtureRootDir, {
    cardDefinitionPaths: ["runtime/cards-a", "runtime/cards-b"],
  });
  writeRuntimeCard(
    fixtureRootDir,
    "runtime/cards-a/first.json",
    "duplicate-card"
  );
  writeRuntimeCard(
    fixtureRootDir,
    "runtime/cards-b/second.json",
    "duplicate-card"
  );

  assert.throws(
    () => loadCurrentRuntimeDataPack(fixtureRootDir, "runtime/pack.json"),
    /Duplicate runtime cardId duplicate-card.*runtime\/cards-a\/first\.json.*runtime\/cards-b\/second\.json/s
  );
});

test("loader rejects duplicate runtime token ids with both conflicting paths", () => {
  const fixtureRootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-duplicate-token-id-")
  );

  writeRuntimeManifest(fixtureRootDir, {
    cardDefinitionPaths: ["runtime/cards"],
    tokenDefinitionPaths: ["runtime/tokens-a", "runtime/tokens-b"],
  });
  writeRuntimeCard(
    fixtureRootDir,
    "runtime/cards/only-card.json",
    "unique-card"
  );
  writeRuntimeToken(
    fixtureRootDir,
    "runtime/tokens-a/first.json",
    "duplicate-token"
  );
  writeRuntimeToken(
    fixtureRootDir,
    "runtime/tokens-b/second.json",
    "duplicate-token"
  );

  assert.throws(
    () => loadCurrentRuntimeDataPack(fixtureRootDir, "runtime/pack.json"),
    /Duplicate runtime tokenId duplicate-token.*runtime\/tokens-a\/first\.json.*runtime\/tokens-b\/second\.json/s
  );
});

test("compatibility v0 loader delegates to current runtime manifest by default", () => {
  const dataPack = loadV0DataPack(rootDir);

  assert.equal(dataPack.manifest.packId, "current-runtime-data-pack");
  assert.equal(dataPack.manifest.decks?.mainDeck, "data/decks/main-deck.json");
});

test("executable data-pack validation allows incomplete-full-only packs without optional setup surfaces", () => {
  const result = validateExecutableDataPack(
    createSetupValidationDataPack("incomplete-full-only", {
      omitFamiliarPool: true,
      omitWizardPropertyStack: true,
      emptyStarterDeck: true,
      emptyMainDeck: true,
      emptyLegendDeck: true,
    })
  );

  assert.deepEqual(result, { ok: true });
});

test("executable data-pack validation keeps optional setup tolerance out of strict packs", () => {
  const result = validateExecutableDataPack(
    createSetupValidationDataPack("fixture", {
      omitFamiliarPool: true,
      omitWizardPropertyStack: true,
      emptyStarterDeck: true,
      emptyMainDeck: true,
      emptyLegendDeck: true,
    })
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("must define familiar pool outside incomplete-full-only")
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        "must define wizard property stack outside incomplete-full-only"
      )
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("must include starter cards outside incomplete-full-only")
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        "must include main-deck cards outside incomplete-full-only"
      )
    )
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        "must include legend-deck cards outside incomplete-full-only"
      )
    )
  );
});

test("executable data-pack validation rejects partial card mappings in supported packs", () => {
  const partialCard = createFixtureCard(
    "fixture-partial-card-in-supported-pack"
  );
  const dataPack = withOnlyFixtureCard({
    ...partialCard,
    engine: {
      ...partialCard.engine,
      mappingStatus: "partial",
      playableInV0: false,
    },
  });

  const result = validateExecutableDataPack({
    ...dataPack,
    manifest: {
      ...dataPack.manifest,
      mappingStatus: "supported",
    },
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        "fixture-partial-card-in-supported-pack has non-supported mappingStatus partial in supported data pack"
      )
    )
  );
});

test("executable data-pack validation rejects unsupported play-top destinations", () => {
  const card = createFixtureCard("fixture-unsupported-play-top-destination");
  const dataPack = withFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        asMalformedRuntimeEffect({
          effectId: "play_top_card",
          timing: "onPlay",
          source: "activePlayerDeck",
          destination: "unsupportedDestination",
        }),
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-play-top-destination") &&
        error.includes("destination must be play")
      );
    })
  );
});

test("executable data-pack validation rejects redirect defense branches", () => {

  const card = createFixtureCard("fixture-unsupported-redirect-defense");
  const dataPack = withFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "avoid_attack",
          timing: "onDefense",
          destination: "redirectTarget",
        } as never,
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-redirect-defense") &&
        error.includes("destination must be one of discardSelf, topdeckSelf")
      );
    })
  );
});

test("executable data-pack validation rejects a non-boolean redirectAttack guard", () => {
  const card = createFixtureCard("fixture-invalid-redirect-attack-guard");
  const dataPack = withFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "avoid_attack",
          timing: "onDefense",
          destination: "discardSelf",
          redirectAttack: "yes",
        } as never,
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-invalid-redirect-attack-guard") &&
        error.includes("redirectAttack")
      );
    })
  );
});

function withFixtureCard(card: CardDefinition): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map([
      ...dataPack.cardDefinitions,
      [card.cardId, card],
    ]),
  };
}

function withOnlyFixtureCard(card: CardDefinition): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map([[card.cardId, card]]),
  };
}

function withFixtureToken(token: unknown): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const fixtureToken = token as TokenDefinition & {
    source?: TokenDefinition["source"];
  };
  const normalizedToken = {
    ...fixtureToken,
    source: fixtureToken.source ?? { image: "assets/tokens/fixture.png" },
  } as TokenDefinition;
  return {
    ...dataPack,
    cardDefinitions: new Map(),
    tokenDefinitions: new Map([[normalizedToken.tokenId, normalizedToken]]),
  };
}

function createSetupValidationDataPack(
  mappingStatus: string,
  options: {
    omitFamiliarPool?: boolean;
    omitWizardPropertyStack?: boolean;
    emptyStarterDeck?: boolean;
    emptyMainDeck?: boolean;
    emptyLegendDeck?: boolean;
  }
): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const manifestTokenStacks = options.omitWizardPropertyStack
    ? dataPack.manifest.tokenStacks === undefined
      ? undefined
      : {
          deadWizardTokens: dataPack.manifest.tokenStacks.deadWizardTokens,
        }
    : dataPack.manifest.tokenStacks;
  const manifest = {
    ...dataPack.manifest,
    mappingStatus,
    ...(options.omitFamiliarPool ? {} : { pools: dataPack.manifest.pools }),
    ...(manifestTokenStacks === undefined
      ? {}
      : { tokenStacks: manifestTokenStacks }),
  };

  return {
    ...dataPack,
    cardDefinitions: new Map(),
    tokenDefinitions: new Map(),
    manifest,
    decks: {
      ...dataPack.decks,
      familiarPool: options.omitFamiliarPool
        ? undefined
        : dataPack.decks.familiarPool,
      starterDeck: options.emptyStarterDeck
        ? {
            ...dataPack.decks.starterDeck,
            entries: [],
          }
        : dataPack.decks.starterDeck,
      mainDeck: options.emptyMainDeck
        ? {
            ...dataPack.decks.mainDeck,
            entries: [],
          }
        : dataPack.decks.mainDeck,
      legendDeck: options.emptyLegendDeck
        ? {
            ...dataPack.decks.legendDeck,
            entries: [],
          }
        : dataPack.decks.legendDeck,
    },
    tokenStacks: {
      ...dataPack.tokenStacks,
      wizardProperties: options.omitWizardPropertyStack
        ? undefined
        : dataPack.tokenStacks.wizardProperties,
    },
  };
}

function createFixtureCard(cardId: string): CardDefinition {
  return {
    schemaVersion: 1,
    cardId,
    source: { image: `assets/cards/fixtures/${cardId}.png` },
    visible: {
      nameRu: cardId,
      cost: 0,
      victoryPoints: 0,
      typeRu: null,
      cardKind: "normal",
      cardTypes: [],
      markers: [],
    },
    engine: {
      runtimeSchema: "krutagidon.cardDefinition.v0",
      mappingStatus: "fixture",
      playableInV0: true,
      cardKind: "normal",
      cardTypes: [],
      cost: 0,
      victoryPoints: 0,
      isOngoing: false,
      marketChipMarker: false,
      effects: [],
      unsupportedMechanics: [],
    },
  };
}

function writeRuntimeManifest(
  fixtureRootDir: string,
  overrides: Partial<{
    cardDefinitionPaths: string[];
    tokenDefinitionPaths: string[];
  }>
): void {
  writeJsonFile(fixtureRootDir, "runtime/decks/starter.json", {
    entries: [],
  });
  writeJsonFile(fixtureRootDir, "runtime/decks/main.json", {
    entries: [],
  });
  writeJsonFile(fixtureRootDir, "runtime/decks/legend.json", {
    entries: [],
  });
  writeJsonFile(fixtureRootDir, "runtime/stacks/wild-magic.json", {
    entries: [],
  });
  writeJsonFile(fixtureRootDir, "runtime/stacks/limp-wand.json", {
    entries: [],
  });
  writeJsonFile(fixtureRootDir, "runtime/pack.json", {
    schemaVersion: 1,
    packId: "duplicate-runtime-id-fixture",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: overrides.cardDefinitionPaths ?? ["runtime/cards"],
    needsData: [],
    decks: {
      starterDeck: "runtime/decks/starter.json",
      mainDeck: "runtime/decks/main.json",
      legendDeck: "runtime/decks/legend.json",
    },
    cardStacks: {
      wildMagicStack: "runtime/stacks/wild-magic.json",
      limpWandStack: "runtime/stacks/limp-wand.json",
    },
    ...(overrides.tokenDefinitionPaths === undefined
      ? {}
      : { tokenDefinitionPaths: overrides.tokenDefinitionPaths }),
  });
}

function writeRuntimeCard(
  fixtureRootDir: string,
  relativePath: string,
  cardId: string
): void {
  writeJsonFile(fixtureRootDir, relativePath, createFixtureCard(cardId));
}

function writeRuntimeToken(
  fixtureRootDir: string,
  relativePath: string,
  tokenId: string
): void {
  writeJsonFile(fixtureRootDir, relativePath, {
    schemaVersion: 1,
    tokenId,
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    visible: {
      textRu: "Fixture token",
    },
    engine: {
      mappingStatus: "fixture",
      playableInV0: false,
      effects: [],
      unsupportedMechanics: [],
    },
  });
}

function writeJsonFile(
  fixtureRootDir: string,
  relativePath: string,
  value: unknown
): void {
  const absolutePath = path.join(fixtureRootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, JSON.stringify(value), "utf8");
}
