import assert from "node:assert/strict";
import test from "node:test";

import { formatDraftValidationResult, validateCardDraft, validateWizardPropertyDraft } from "../src/index.js";

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

function hasMessage(messages: { message: string }[], expectedText: string): boolean {
  return messages.some((message) => message.message.includes(expectedText));
}
