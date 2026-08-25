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
} from "../src/engine/data.js";

const rootDir = process.cwd();

test("current runtime cards preserve source.image metadata", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  assert.equal(dataPack.cardDefinitions.size, 62);

  for (const [cardId, definition] of dataPack.cardDefinitions) {
    assert.equal(typeof definition.source.image, "string");
    assert.ok(definition.source.image.trim().length > 0);
    const cardPath = findCardJson(cardId);
    const json = JSON.parse(readFileSync(cardPath, "utf8")) as {
      source: { image: string };
    };
    assert.equal(definition.source.image, json.source.image);
  }

  assert.equal(
    dataPack.cardDefinitions.get("esw2_dbg__starter_003")?.source.image,
    "assets/cards/starter/Затравка. Сырная палочка.png"
  );
});

test("current runtime tokens preserve canonical source.image metadata", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  assert.equal(dataPack.tokenDefinitions.size, 30);

  for (const definition of dataPack.tokenDefinitions.values()) {
    const source = (definition as { source?: { image?: unknown } }).source;
    assert.equal(typeof source?.image, "string");
    assert.ok((source?.image as string).trim().length > 0);
  }

  assert.equal(
    (
      dataPack.tokenDefinitions.get("esw2_dbg__dead_wizard_token_001") as
        | { source?: { image?: string } }
        | undefined
    )?.source?.image,
    "assets/dead-wizard-token/DWT_001.png"
  );
  assert.equal(
    (
      dataPack.tokenDefinitions.get("esw2_dbg__wizard_property_001") as
        | { source?: { image?: string } }
        | undefined
    )?.source?.image,
    "assets/wizard-property/wp_001.png"
  );

  for (let index = 1; index <= 10; index += 1) {
    const tokenId = `esw2_dbg__wizard_property_${String(index).padStart(3, "0")}`;
    const runtime = dataPack.tokenDefinitions.get(tokenId);
    assert.ok(runtime);
    const draftPath = path.join(
      rootDir,
      "data/import/tokens/wizard-property/drafts",
      `${tokenId}.json`
    );
    const draft = JSON.parse(readFileSync(draftPath, "utf8")) as {
      source: { image: string };
    };
    assert.equal(runtime.source.image, draft.source.image);
    assert.equal(
      "sourceImage" in ((runtime as { visible?: object }).visible ?? {}),
      false
    );
  }
});

test("every current runtime source.image points to an existing asset", () => {
  const dataPack = loadCurrentRuntimeDataPack(rootDir);
  const definitions = [
    ...dataPack.cardDefinitions.values(),
    ...dataPack.tokenDefinitions.values(),
  ];

  for (const definition of definitions) {
    assert.ok(
      existsSync(path.join(rootDir, definition.source.image)),
      `Missing runtime source image for ${
        "cardId" in definition ? definition.cardId : definition.tokenId
      }: ${definition.source.image}`
    );
  }
});

test("token JSON without canonical source.image is rejected", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "runtime-token-source-"));
  writeFixturePack(tempRoot, createCard("fixture-source", { image: "ok" }));
  const manifestPath = path.join(tempRoot, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  manifest["tokenDefinitionPaths"] = ["tokens"];
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  writeJson(tempRoot, "tokens/token.json", {
    schemaVersion: 1,
    tokenId: "fixture-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    victoryPoints: 0,
    effects: [],
  });
  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.ok(result.errors.some((error) => error.includes("source")));
});

test("token JSON with legacy visible.sourceImage is rejected", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "runtime-token-legacy-"));
  writeTokenFixturePack(tempRoot, {
    schemaVersion: 1,
    tokenId: "fixture-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "wizardProperty",
    source: { image: "assets/dead-wizard-token/DWT_001.png" },
    visible: {
      textRu: "Свойство",
      sourceImage: "assets/wizard-property/Свойство 1.jpg",
    },
  });

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) => error.includes("visible.sourceImage"))
    );
  }
});

test("token source is validated before token kind dispatch", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "runtime-token-order-"));
  writeTokenFixturePack(tempRoot, {
    schemaVersion: 1,
    tokenId: "fixture-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "unsupportedTokenKind",
    source: { image: "" },
  });

  const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors[0] ?? "", /source\.image/);
  }
});

test("malformed token source fields are rejected", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "runtime-token-source-"));
  const malformedSources: unknown[] = [
    undefined,
    {},
    { image: "" },
    { image: "   " },
    { image: 42 },
    { image: "assets/dead-wizard-token/DWT_001.png", draft: "   " },
    { image: "assets/dead-wizard-token/DWT_001.png", text: 42 },
    { image: "tokens/fixture.png" },
  ];

  for (const source of malformedSources) {
    const token: Record<string, unknown> = {
      schemaVersion: 1,
      tokenId: "fixture-token",
      runtimeSchema: "krutagidon.tokenDefinition.v0",
      kind: "deadWizardToken",
      victoryPoints: 0,
      effects: [],
    };
    if (source !== undefined) token["source"] = source;
    writeTokenFixturePack(tempRoot, token);

    const result = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((error) => error.includes("source")));
    }
  }
});

test("token decoding is deterministic without reading image files", () => {
  const tempRoot = mkdtempSync(
    path.join(os.tmpdir(), "runtime-token-determinism-")
  );
  writeTokenFixturePack(tempRoot, {
    schemaVersion: 1,
    tokenId: "fixture-token",
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    kind: "deadWizardToken",
    source: { image: "assets/tokens/image-file-is-not-read.png" },
    victoryPoints: 0,
    effects: [],
  });

  const first = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  const second = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.deepEqual(
      [...first.value.tokenDefinitions],
      [...second.value.tokenDefinitions]
    );
  }
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

test("runtime source image accepts only canonical asset paths", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "runtime-source-path-"));
  const canonical = createCard("fixture-source", {
    image: "assets/cards/fixture.png",
  });
  writeFixturePack(tempRoot, canonical);

  const valid = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
  assert.equal(valid.ok, true);

  for (const image of [
    "fixture.png",
    "data/import/cards/fixture.png",
    "../assets/cards/fixture.png",
    "assets/../outside.png",
    "/assets/cards/fixture.png",
  ]) {
    writeFixturePack(tempRoot, createCard("fixture-source", { image }));
    const decoded = decodeCurrentRuntimeDataPack(tempRoot, "manifest.json");
    assert.equal(decoded.ok, false);
    if (!decoded.ok) {
      assert.ok(decoded.errors.some((error) => error.includes("source.image")));
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

function writeTokenFixturePack(
  root: string,
  token: Record<string, unknown>
): void {
  writeFixturePack(
    root,
    createCard("fixture-source", { image: "assets/cards/fixture.png" })
  );
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  manifest["tokenDefinitionPaths"] = ["tokens"];
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  writeJson(root, "tokens/token.json", token);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), "utf8");
}
