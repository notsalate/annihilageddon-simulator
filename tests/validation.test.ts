import assert from "node:assert/strict";
import test from "node:test";

import {
  loadV0DataPack,
  validateExecutableDataPack,
  type CardDefinition,
  type LoadedDataPack,
  type TokenDefinition,
} from "../src/index.js";
import { getEffectRuntimeHandler } from "../src/engine/effect-runtime-registry.js";

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
  assert.equal(result.errors.filter((error) => error.includes("invalid power amount")).length, 3);
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
  assert.ok(result.errors.some((error) => error.includes("invalid power amount")));
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
  assert.ok(result.errors.some((error) => error.includes("unsupported gain target activePlayerHandCard")));
  assert.ok(result.errors.some((error) => error.includes("unsupported gain destination deckTop")));
  assert.ok(result.errors.some((error) => error.includes("unsupported discard target mainMarketCard")));
  assert.ok(result.errors.some((error) => error.includes("unsupported destroy target mainMarketCard")));
});

test("supported executable attack and defense effects pass executable effect validation", () => {
  const attackCard = createFixtureCard("fixture-supported-attack-effect");
  const defenseCard = createFixtureCard("fixture-supported-defense-effect");
  const dataPack = loadV0DataPack(rootDir);
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
  const card = createFixtureCard("fixture-supported-multi-target-attack-effect");
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
  const combatEffectIds = ["deal_damage", "attack_damage", "multi_target_attack", "mayhem_attack"];

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
      [],
    );
  }
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
      return error.includes("fixture-effect-in-combat-data") && error.includes("fixture_add_power_equal_to_target_cost");
    }),
  );
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
      return error.includes("fixture-unsupported-effect-in-fixture-mode") && error.includes("fixture_not_supported");
    }),
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
      return error.includes("fixture-unsupported-effect") && error.includes("fixture_not_supported");
    }),
  );
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
      return error.includes("fixture-unsupported-mechanic") && error.includes("not-yet-modeled");
    }),
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
      return error.includes("wizard-property-fixture-unsupported") && error.includes("wizard-property-triggered-economy");
    }),
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
  const dataPack = loadV0DataPack(rootDir);
  const result = validateExecutableDataPack({
    ...dataPack,
    manifest: {
      ...dataPack.manifest,
      tokenDefinitionPaths: ["data/import/wizard-property-drafts"],
    },
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return error.includes("tokenDefinitionPaths[0]") && error.includes("data/import/wizard-property-drafts");
    }),
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
      return error.includes("fixture-unsupported-play-top-destination") && error.includes("unsupportedDestination");
    }),
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
        },
      ],
    },
  });

  const result = validateExecutableDataPack(dataPack, { mode: "fixture" });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => {
      return error.includes("fixture-unsupported-redirect-defense") && error.includes("redirectTarget");
    }),
  );
});

function withFixtureCard(card: CardDefinition): LoadedDataPack {
  const dataPack = loadV0DataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map([...dataPack.cardDefinitions, [card.cardId, card]]),
  };
}

function withOnlyFixtureCard(card: CardDefinition): LoadedDataPack {
  const dataPack = loadV0DataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map([[card.cardId, card]]),
  };
}

function withFixtureToken(token: TokenDefinition): LoadedDataPack {
  const dataPack = loadV0DataPack(rootDir);
  return {
    ...dataPack,
    cardDefinitions: new Map(),
    tokenDefinitions: new Map([[token.tokenId, token]]),
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
