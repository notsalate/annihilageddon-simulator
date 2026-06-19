import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatDraftValidationResult,
  validateCardDraft,
  validateDraft,
  validateDraftFiles,
  validateWizardPropertyDraft,
} from "../src/index.js";

test("valid cardDraft passes draft validation", () => {
  const validation = validateCardDraft(createValidCardDraft());

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

test("cardDraft reports missing required fields", () => {
  const validation = validateCardDraft(
    {
      draftKind: "cardDraft",
      source: {},
      visible: {},
    },
    { filePath: "missing.json" },
  );

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "schemaVersion"));
  assert.ok(hasMessage(validation.errors, "cardId"));
  assert.ok(hasMessage(validation.errors, "source.text"));
  assert.ok(hasMessage(validation.errors, "visible.textRu"));
  assert.ok(hasMessage(validation.errors, "visible.cardKind"));
});

test("cardDraft rejects runtime-only fields", () => {
  const validation = validateCardDraft({
    ...createValidCardDraft(),
    engine: {},
    runtimeSchema: "krutagidon.cardDefinition.v0",
    playableInV0: false,
    mappingStatus: "draft",
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "engine"));
  assert.ok(hasMessage(validation.errors, "runtimeSchema"));
  assert.ok(hasMessage(validation.errors, "playableInV0"));
  assert.ok(hasMessage(validation.errors, "mappingStatus"));
});

test("cardDraft rejects invalid card type and marker values", () => {
  const validation = validateCardDraft({
    ...createValidCardDraft(),
    visible: {
      ...createValidCardDraft().visible,
      cardKind: "unsupportedKind",
      cardTypes: ["wizardCard", "unknownType"],
      markers: ["attack", "unknownMarker"],
    },
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "visible.cardKind"));
  assert.ok(hasMessage(validation.errors, "unknownType"));
  assert.ok(hasMessage(validation.errors, "unknownMarker"));
});

test("cardDraft reports uncertainty and missing source image as warnings", () => {
  const draft = createValidCardDraft();
  const validation = validateCardDraft({
    ...draft,
    source: {
      text: draft.source.text,
    },
    visible: {
      ...draft.visible,
      uncertainty: ["OCR сомневается в типе."],
    },
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.ok(hasMessage(validation.warnings, "source.image"));
  assert.ok(hasMessage(validation.warnings, "visible.uncertainty"));
});

test("draft validation formatter reports runtime mapping readiness", () => {
  const validation = validateCardDraft(
    {
      ...createValidCardDraft(),
      engine: {},
    },
    { filePath: "data/import/card-drafts/example.json" },
  );

  const output = formatDraftValidationResult(validation);

  assert.match(output, /Draft validation: 1 file\(s\)/);
  assert.match(output, /ERROR data\/import\/card-drafts\/example\.json: draft contains forbidden runtime field 'engine'/);
  assert.match(output, /Not ready for runtime mapping: 1 error\(s\), 0 warning\(s\)/);
});

test("valid wizardPropertyDraft passes draft validation without card-only fields", () => {
  const validation = validateWizardPropertyDraft(createValidWizardPropertyDraft());

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

test("valid deadWizardTokenDraft passes draft validation", () => {
  const validation = validateDraft(createValidDeadWizardTokenDraft());

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

test("deadWizardTokenDraft rejects runtime-only fields", () => {
  const validation = validateDraft({
    ...createValidDeadWizardTokenDraft(),
    effects: [],
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    playableInV0: true,
    mappingStatus: "mapped",
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "effects"));
  assert.ok(hasMessage(validation.errors, "runtimeSchema"));
  assert.ok(hasMessage(validation.errors, "playableInV0"));
  assert.ok(hasMessage(validation.errors, "mappingStatus"));
});

test("deadWizardTokenDraft reports missing visible text", () => {
  const validation = validateDraft({
    ...createValidDeadWizardTokenDraft(),
    visible: {
      sourceLabel: "Жетон мертвого волшебника 1",
      textRu: "",
      victoryPoints: null,
      uncertainty: [],
    },
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "visible.textRu"));
});

test("deadWizardTokenDraft allows visible victory points as number or null", () => {
  const draftWithoutVictoryPoints = createValidDeadWizardTokenDraft();
  const draftWithVictoryPoints = {
    ...draftWithoutVictoryPoints,
    visible: {
      ...draftWithoutVictoryPoints.visible,
      victoryPoints: -2,
    },
  };

  assert.equal(validateDraft(draftWithVictoryPoints).ok, true);
  assert.equal(validateDraft(draftWithoutVictoryPoints).ok, true);
});

test("deadWizardTokenDraft reports uncertainty and missing source image as warnings", () => {
  const draft = createValidDeadWizardTokenDraft();
  const validation = validateDraft({
    ...draft,
    source: {
      text: draft.source.text,
    },
    visible: {
      ...draft.visible,
      uncertainty: ["Не удалось уверенно прочитать VP."],
    },
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.ok(hasMessage(validation.warnings, "source.image"));
  assert.ok(hasMessage(validation.warnings, "visible.uncertainty"));
});

test("draft file validation includes dead wizard token drafts by default", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "krutagidon-draft-validation-"));
  mkdirSync(path.join(rootDir, "data", "import", "dead-wizard-token-drafts"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "data", "import", "dead-wizard-token-drafts", "dwt-001.json"),
    JSON.stringify(createValidDeadWizardTokenDraft()),
    "utf8",
  );

  const validation = validateDraftFiles(rootDir);

  assert.equal(validation.ok, true);
  assert.equal(validation.filesChecked, 1);
  assert.deepEqual(validation.errors, []);
});

test("wizardPropertyDraft rejects runtime-only fields", () => {
  const validation = validateWizardPropertyDraft({
    ...createValidWizardPropertyDraft(),
    engine: {},
    runtimeSchema: "krutagidon.tokenDefinition.v0",
    playableInV0: true,
    mappingStatus: "mapped",
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "engine"));
  assert.ok(hasMessage(validation.errors, "runtimeSchema"));
  assert.ok(hasMessage(validation.errors, "playableInV0"));
  assert.ok(hasMessage(validation.errors, "mappingStatus"));
});

test("wizardPropertyDraft reports missing visible text", () => {
  const validation = validateWizardPropertyDraft({
    ...createValidWizardPropertyDraft(),
    visible: {
      sourceLabel: "Свойство 1",
      textRu: "",
      uncertainty: [],
    },
  });

  assert.equal(validation.ok, false);
  assert.ok(hasMessage(validation.errors, "visible.textRu"));
});

function createValidCardDraft() {
  return {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId: "esw2_dbg__main_001",
    source: {
      image: "assets/cards/raw/example.jpg",
      text: "data/import/card-texts/esw2_dbg__main_001.md",
    },
    visible: {
      nameRu: "Тестовая карта",
      cost: 3,
      victoryPoints: 1,
      typeRu: "Заклинание",
      cardKind: "normal",
      cardTypes: ["spell"],
      textRu: "+2 мощи",
      markers: [],
      uncertainty: [],
    },
    notes: [],
  };
}

function createValidWizardPropertyDraft() {
  return {
    schemaVersion: 1,
    draftKind: "wizardPropertyDraft",
    tokenId: "esw2_dbg__wizard_property_001",
    kind: "wizardProperty",
    source: {
      image: "assets/wizard-property/raw/Свойство 1.jpg",
      text: "data/import/wizard-property-texts/wp_001.md",
    },
    visible: {
      sourceLabel: "Свойство 1",
      textRu: "Получив волшебника, получи 1 чипсину.",
      uncertainty: [],
    },
    notes: [],
  };
}

function createValidDeadWizardTokenDraft() {
  return {
    schemaVersion: 1,
    draftKind: "deadWizardTokenDraft",
    tokenId: "esw2_dbg__dead_wizard_token_001",
    kind: "deadWizardToken",
    source: {
      image: "assets/DWT/raw/example.jpg",
      text: "data/import/DWT-texts/esw2_dbg__dead_wizard_token_001.md",
    },
    visible: {
      sourceLabel: "Жетон мертвого волшебника 1",
      textRu: "Получив этот жетон, сделай видимое действие.",
      victoryPoints: null,
      uncertainty: [],
    },
    notes: [],
  };
}

function hasMessage(messages: { message: string }[], expectedText: string): boolean {
  return messages.some((message) => message.message.includes(expectedText));
}
