import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeCurrentRuntimeDataPack,
  loadCurrentRuntimeDataPack,
} from "../src/index.js";

const rootDir = process.cwd();

test("current runtime cards preserve source.image metadata", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  assert.equal(dataPack.cardDefinitions.size, 30);

  for (const [cardId, definition] of dataPack.cardDefinitions) {
    assert.equal(typeof definition.source.image, "string");
    assert.ok(definition.source.image.trim().length > 0);
    const cardPath = findCardJson(cardId);
    const json = JSON.parse(readFileSync(cardPath, "utf8")) as {
      source: { image: string };
    };
    assert.equal(definition.source.image, json.source.image);
    assert.ok(existsSync(path.join(rootDir, definition.source.image)));
  }

  assert.equal(
    dataPack.cardDefinitions.get("esw2_dbg__starter_003")?.source.image,
    "assets/cards/starter/Затравка. Сырная палочка.png"
  );
});

test("runtime source metadata validates image and keeps optional links", () => {
  const tempRoot = mkdtempSync(
    path.join(os.tmpdir(), "runtime-source-metadata-")
  );
  const card = createCard("fixture-source", {
    image: "assets/cards/fixture.png",
    draft: "draft.json",
    text: "text.md",
  });
  writeFixturePack(tempRoot, card);

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.value.cardDefinitions.get(card.cardId)?.source,
      card.source
    );
  }

  for (const source of [
    undefined,
    {},
    { image: "" },
    { image: "   " },
    { image: 42 },
    { image: "ok", draft: "   " },
    { image: "ok", text: 42 },
  ]) {
    const malformed = createCard(
      "fixture-source",
      source as Record<string, unknown>
    );
    writeFixturePack(tempRoot, malformed);
    const decoded = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
    assert.equal(decoded.ok, false);
    if (!decoded.ok) {
      assert.ok(decoded.errors.some((error) => error.includes("source")));
    }
  }
});

function createCard(
  cardId: string,
  source: Record<string, unknown>
): Record<string, unknown> & {
  cardId: string;
  source: Record<string, unknown>;
} {
  return {
    schemaVersion: 1,
    cardId,
    source,
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

function findCardJson(cardId: string): string {
  const pending = [path.join(rootDir, "data", "cards")];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.name === `${cardId}.json`) return entryPath;
    }
  }
  assert.fail(`Missing runtime card JSON for ${cardId}`);
}

function writeFixturePack(root: string, card: Record<string, unknown>): void {
  writeJson(root, "manifest.json", {
    schemaVersion: 1,
    packId: "fixture-source",
    runtimeSchema: "krutagidon.dataPack.v0",
    mappingStatus: "fixture",
    cardDefinitionPaths: ["cards"],
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
  writeJson(root, "cards/card.json", card);
  const composition = {
    schemaVersion: 1,
    deckId: "fixture",
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
    writeJson(root, file, composition);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), "utf8");
}
