import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCurrentRuntimeDataPack,
  loadV0DataPack,
  validateExecutableDataPack,
  type CardDefinition,
  type LoadedDataPack,
  type TokenDefinition,
} from "../src/index.js";
import {
  getEffectRuntimeCatalogEntry,
  getEffectRuntimeHandler,
  isEffectRuntimeCatalogEntrySupportedInMode,
} from "../src/engine/effect-runtime-registry.js";

const rootDir = process.cwd();

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
        {
          effectId: "add_power",
          timing: "onPlay",
          amount: "2",
        },
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
    result.errors.filter((error) => error.includes("invalid power amount"))
      .length,
    3
  );
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
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("invalid power amount"))
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
          destination: "deckTop",
        },
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
      error.includes("unsupported gain destination deckTop")
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

test("combat effects are registered and reject invalid shapes through runtime handlers", () => {
  const combatEffectIds = [
    "deal_damage",
    "attack_damage",
    "multi_target_attack",
    "mayhem_attack",
  ];

  for (const effectId of combatEffectIds) {
    const handler = getEffectRuntimeHandler(effectId);
    assert.ok(handler, `${effectId} should be registered`);
    assert.notDeepEqual(
      handler.validateShape("Fixture", {
        effectId,
        timing: "onPlay",
        amount: 0,
        target: {
          selector: "unsupported",
        },
      }),
      []
    );
  }
});

test("economy and draw effects are registered and reject invalid shapes through runtime handlers", () => {
  const effectIds = [
    "gain_chips",
    "gain_chips_per_player_with_status",
    "draw_cards",
  ];

  for (const effectId of effectIds) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }

  assert.notDeepEqual(
    getEffectRuntimeHandler("gain_chips")?.validateShape("Fixture", {
      effectId: "gain_chips",
      timing: "onPlay",
      amount: 0,
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("draw_cards")?.validateShape("Fixture", {
      effectId: "draw_cards",
      timing: "onPlay",
      amount: "1",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("gain_chips_per_player_with_status")?.validateShape(
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

test("top-deck and Wild Magic effects are registered and reject invalid shapes through runtime handlers", () => {
  const effectIds = [
    "reveal_top_card",
    "play_top_card",
    "play_top_card_from_foe_deck",
    "wild_magic_choice",
  ];

  for (const effectId of effectIds) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }

  assert.notDeepEqual(
    getEffectRuntimeHandler("reveal_top_card")?.validateShape("Fixture", {
      effectId: "reveal_top_card",
      timing: "onPlay",
      source: "unsupportedDeck",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("play_top_card")?.validateShape("Fixture", {
      effectId: "play_top_card",
      timing: "onPlay",
      source: "activePlayerDeck",
      destination: "unsupportedDestination",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("play_top_card_from_foe_deck")?.validateShape(
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
    getEffectRuntimeHandler("wild_magic_choice")?.validateShape("Fixture", {
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

test("life and Dingler status effects are registered and reject invalid shapes through runtime handlers", () => {
  const effectIds = [
    "heal",
    "set_life",
    "gain_status",
    "remove_status",
    "toggle_status",
  ];

  for (const effectId of effectIds) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }

  assert.notDeepEqual(
    getEffectRuntimeHandler("heal")?.validateShape("Fixture", {
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
    getEffectRuntimeHandler("set_life")?.validateShape("Fixture", {
      effectId: "set_life",
      timing: "onPlay",
      lifeTotal: 0,
      target: {
        selector: "mainMarketCard",
      },
    }),
    []
  );
  for (const effectId of ["gain_status", "remove_status", "toggle_status"]) {
    assert.notDeepEqual(
      getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
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
});

test("Mega Mayhem life and Dingler status effects are registered and reject invalid shapes through runtime handlers", () => {
  const effectIds = [
    "mega_mayhem_set_life",
    "mega_mayhem_each_player_toggle_dingler",
  ];

  for (const effectId of effectIds) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }

  assert.deepEqual(
    getEffectRuntimeHandler("mega_mayhem_set_life")?.validateShape("Fixture", {
      effectId: "mega_mayhem_set_life",
      timing: "onMayhemResolve",
      lifeTotal: 5,
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("mega_mayhem_set_life")?.validateShape("Fixture", {
      effectId: "mega_mayhem_set_life",
      timing: "onPlay",
      lifeTotal: 0,
      targetSelector: "activePlayer",
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler(
      "mega_mayhem_each_player_toggle_dingler"
    )?.validateShape("Fixture", {
      effectId: "mega_mayhem_each_player_toggle_dingler",
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler(
      "mega_mayhem_each_player_toggle_dingler"
    )?.validateShape("Fixture", {
      effectId: "mega_mayhem_each_player_toggle_dingler",
      timing: "onPlay",
      targetSelector: "activePlayer",
      statusId: "wizard",
    }),
    []
  );
});

test("Mega Mayhem destroy-top-main-deck effect is registered and rejects invalid shape through runtime handler", () => {
  const effectId =
    "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem";

  assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  assert.deepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
    }),
    []
  );
});

test("Mayhem discard-top-deck destroy effect is registered and rejects invalid shape through runtime handler", () => {
  const effectId =
    "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none";

  assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  assert.deepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
      amount: 1,
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
      amount: -1,
    }),
    []
  );
});

test("Mayhem discard-deck destroy effect is registered and rejects invalid shape through runtime handler", () => {
  const effectId = "mayhem_each_player_discard_deck_then_destroy_from_discard";

  assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  assert.deepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onMayhemResolve",
      targetSelector: "eachPlayerClockwiseFromActive",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
      effectId,
      timing: "onPlay",
      targetSelector: "activePlayer",
    }),
    []
  );
});

test("Mayhem hand-redraw choice effect is registered and rejects unsupported options through runtime handler", () => {
  const effectId = "mayhem_each_player_choose_discard_hand_draw_or_take_damage";

  assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  assert.deepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
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
    getEffectRuntimeHandler(effectId)?.validateShape("Fixture", {
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

test("wizard property setup effects are registered and reject invalid shapes through runtime handlers", () => {
  const setupEffectIds = [
    "replace_starting_card",
    "start_with_basic_trophy",
    "force_starting_player",
    "set_starting_life_total",
    "set_resurrection_life_total",
  ];

  for (const effectId of setupEffectIds) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }

  assert.deepEqual(
    getEffectRuntimeHandler("replace_starting_card")?.validateShape("Token", {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "esw2_dbg__starter_001",
      toDefinitionId: "esw2_dbg__starter_004",
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler("start_with_basic_trophy")?.validateShape("Token", {
      effectId: "start_with_basic_trophy",
      timing: "setup",
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler("force_starting_player")?.validateShape("Token", {
      effectId: "force_starting_player",
      timing: "setup",
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler("set_starting_life_total")?.validateShape("Token", {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 25,
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler("set_resurrection_life_total")?.validateShape(
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
    getEffectRuntimeHandler("replace_starting_card")?.validateShape("Token", {
      effectId: "replace_starting_card",
      timing: "setup",
      fromDefinitionId: "",
      toDefinitionId: 42,
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("force_starting_player")?.validateShape("Token", {
      effectId: "force_starting_player",
      timing: "setup",
      targetSelector: "chosenFoe",
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("set_starting_life_total")?.validateShape("Token", {
      effectId: "set_starting_life_total",
      timing: "setup",
      lifeTotal: 0,
    }),
    []
  );
  assert.notDeepEqual(
    getEffectRuntimeHandler("set_resurrection_life_total")?.validateShape(
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

test("wizard property effective-value modifier is registered and rejects invalid shapes through runtime handlers", () => {
  assert.equal(
    getEffectRuntimeCatalogEntry("modify_effective_value")?.effectId,
    "modify_effective_value"
  );

  const handler = getEffectRuntimeHandler("modify_effective_value");
  assert.ok(handler);

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
  ]) {
    assert.deepEqual(handler.validateShape("Token", effect), []);
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
    assert.notDeepEqual(handler.validateShape("Token", effect), []);
  }
});

test("executable data-pack validation rejects invalid effective-value modifier shape through the catalog", () => {
  const dataPack = withFixtureToken({
    schemaVersion: 1,
    tokenId: "wizard-property-fixture-invalid-effective-value",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
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
        error.includes("unsupported effective-value operation multiply")
      );
    })
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

test("effect runtime catalog marks fixture-only effects by validation mode", () => {
  const fixturePowerEntry = getEffectRuntimeCatalogEntry(
    "fixture_add_power_equal_to_target_cost"
  );
  assert.ok(fixturePowerEntry);
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(fixturePowerEntry, "fixture"),
    true
  );
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(fixturePowerEntry, "combat"),
    false
  );

  const fixtureModifierEntry = getEffectRuntimeCatalogEntry(
    "fixture_modify_effective_value"
  );
  assert.ok(fixtureModifierEntry);
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(fixtureModifierEntry, "fixture"),
    true
  );
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(fixtureModifierEntry, "combat"),
    false
  );

  const combatEntry = getEffectRuntimeCatalogEntry("add_power");
  assert.ok(combatEntry);
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(combatEntry, "fixture"),
    true
  );
  assert.equal(
    isEffectRuntimeCatalogEntrySupportedInMode(combatEntry, "combat"),
    true
  );
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
      ],
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
      ],
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
      ],
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
  assert.equal(
    getEffectRuntimeCatalogEntry("topdeck_gained_card")?.effectId,
    "topdeck_gained_card"
  );

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
    "Token wizard-property-fixture-topdeck-validation uses unsupported topdeck-gained-card timing onPlay",
    "Token wizard-property-fixture-topdeck-validation uses unsupported topdeck-gained-card destination discard",
    "Token wizard-property-fixture-topdeck-validation uses unsupported topdeck-gained-card filter cardDefinitionIds",
  ]);
});

test("temporary hand-limit effect validates supported and invalid shapes", () => {
  const effectId = "temporary_hand_limit_by_gained_card_type";

  assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  assert.deepEqual(
    getEffectRuntimeHandler(effectId)?.validateShape("Token", {
      effectId,
      timing: "endTurn",
      amount: 1,
      cardTypes: ["spell"],
    }),
    []
  );

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
    "Token wizard-property-fixture-temporary-hand-limit-validation uses unsupported temporary-hand-limit timing onGainCard",
    "Token wizard-property-fixture-temporary-hand-limit-validation uses invalid hand limit amount 0",
    "Token wizard-property-fixture-temporary-hand-limit-validation uses unsupported temporary-hand-limit filter cardTypes",
    "Token wizard-property-fixture-temporary-hand-limit-validation uses unsupported temporary-hand-limit filter cardDefinitionIds",
  ]);
});

test("wand attack replacement effects validate supported and invalid shapes", () => {
  const modifyDamageEffectId = "modify_owned_wand_attack_damage";
  const preventDefenseEffectId = "prevent_defense_against_owned_wand_attacks";

  for (const effectId of [modifyDamageEffectId, preventDefenseEffectId]) {
    assert.equal(getEffectRuntimeCatalogEntry(effectId)?.effectId, effectId);
  }
  assert.deepEqual(
    getEffectRuntimeHandler(modifyDamageEffectId)?.validateShape("Token", {
      effectId: modifyDamageEffectId,
      timing: "attackReplacement",
      amount: 1,
      cardTags: ["wand"],
    }),
    []
  );
  assert.deepEqual(
    getEffectRuntimeHandler(preventDefenseEffectId)?.validateShape("Token", {
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
    "Token wizard-property-fixture-wand-attack-replacement-validation uses unsupported wand-attack replacement timing onPlay",
    "Token wizard-property-fixture-wand-attack-replacement-validation uses invalid wand attack damage amount 0",
    "Token wizard-property-fixture-wand-attack-replacement-validation uses unsupported wand-attack replacement filter cardTags",
    "Token wizard-property-fixture-wand-attack-replacement-validation uses unsupported wand-attack replacement filter cardDefinitionIds",
    "Token wizard-property-fixture-wand-attack-replacement-validation uses unsupported wand-attack replacement field targetSelector",
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

test("executable data-pack validation rejects unsupported play-top destinations", () => {
  const card = createFixtureCard("fixture-unsupported-play-top-destination");
  const dataPack = withFixtureCard({
    ...card,
    engine: {
      ...card.engine,
      playableInV0: true,
      effects: [
        {
          effectId: "play_top_card",
          timing: "onPlay",
          source: "activePlayerDeck",
          destination: "unsupportedDestination",
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-play-top-destination") &&
        error.includes("unsupportedDestination")
      );
    })
  );
});

test("executable data-pack validation rejects redirect defense branches", () => {
  assert.equal(
    getEffectRuntimeCatalogEntry("avoid_attack")?.effectId,
    "avoid_attack"
  );

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
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return (
        error.includes("fixture-unsupported-redirect-defense") &&
        error.includes("redirectTarget")
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

function withFixtureToken(token: TokenDefinition): LoadedDataPack {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map(),
    tokenDefinitions: new Map([[token.tokenId, token]]),
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
