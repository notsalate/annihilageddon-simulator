import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatImportCompletenessReport,
  createImportCompletenessReport,
} from "../src/index.js";

test("import completeness report summarizes raw, draft, runtime, and draft validation gaps", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-import-completeness-")
  );

  writeText(
    rootDir,
    "data/import/cards/main/texts/esw2_dbg__main_001.md",
    "card text"
  );
  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_001.json",
    createValidCardDraft("esw2_dbg__main_001")
  );
  writeJson(rootDir, "data/cards/esw2_dbg__main_001.json", {
    id: "esw2_dbg__main_001",
  });

  writeText(
    rootDir,
    "data/import/cards/main/texts/esw2_dbg__main_002.md",
    "missing draft text"
  );

  writeJson(
    rootDir,
    "data/import/tokens/wizard-property/drafts/esw2_dbg__wizard_property_001.json",
    {
      ...createValidWizardPropertyDraft("esw2_dbg__wizard_property_001"),
      visible: {
        sourceLabel: "Свойство 1",
        textRu: "",
        uncertainty: [],
      },
    }
  );
  writeJson(rootDir, "data/tokens/esw2_dbg__wizard_property_002.json", {
    id: "esw2_dbg__wizard_property_002",
    kind: "wizardProperty",
  });

  writeText(
    rootDir,
    "data/import/tokens/dead-wizard-token/texts/esw2_dbg__dead_wizard_token_001.md",
    "dwt text"
  );
  writeJson(
    rootDir,
    "data/import/tokens/dead-wizard-token/drafts/esw2_dbg__dead_wizard_token_001.json",
    createValidDeadWizardTokenDraft("esw2_dbg__dead_wizard_token_001")
  );

  const report = createImportCompletenessReport(rootDir);
  const output = formatImportCompletenessReport(report);

  assert.match(
    output,
    /cards: raw 2, drafts 1 \(valid 1, invalid 0, warnings 0\), runtime 1/
  );
  assert.match(
    output,
    /wizard properties: raw 0, drafts 1 \(valid 0, invalid 1, warnings 0\), runtime 1/
  );
  assert.match(
    output,
    /dead wizard tokens: raw 1, drafts 1 \(valid 1, invalid 0, warnings 0\), runtime 0/
  );
  assert.match(output, /missing drafts: cards esw2_dbg__main_002/);
  assert.match(
    output,
    /missing runtime: dead wizard tokens esw2_dbg__dead_wizard_token_001/
  );
  assert.match(
    output,
    /runtime without valid draft: wizard properties esw2_dbg__wizard_property_002/
  );
  assert.match(output, /draft validation: 1 error\(s\), 0 warning\(s\)/);
});

test("import completeness report reads runtime cardId and nested tokenId files", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-import-runtime-ids-")
  );

  writeJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_001.json",
    createValidCardDraft("esw2_dbg__main_001")
  );
  writeJson(rootDir, "data/cards/esw2_dbg__main_001.json", {
    cardId: "esw2_dbg__main_001",
  });
  writeJson(
    rootDir,
    "data/import/tokens/wizard-property/drafts/esw2_dbg__wizard_property_001.json",
    createValidWizardPropertyDraft("esw2_dbg__wizard_property_001")
  );
  writeJson(
    rootDir,
    "data/tokens/wizard-property/esw2_dbg__wizard_property_001.json",
    {
      tokenId: "esw2_dbg__wizard_property_001",
      kind: "wizardProperty",
    }
  );

  const output = formatImportCompletenessReport(
    createImportCompletenessReport(rootDir)
  );

  assert.match(
    output,
    /cards: raw 0, drafts 1 \(valid 1, invalid 0, warnings 0\), runtime 1/
  );
  assert.match(
    output,
    /wizard properties: raw 0, drafts 1 \(valid 1, invalid 0, warnings 0\), runtime 1/
  );
  assert.doesNotMatch(output, /missing runtime/);
});

test("import completeness report keeps long gap lists concise", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-import-concise-")
  );

  for (let index = 1; index <= 12; index += 1) {
    writeText(
      rootDir,
      `data/import/cards/main/texts/esw2_dbg__main_${String(index).padStart(3, "0")}.md`,
      "card text"
    );
  }

  const output = formatImportCompletenessReport(
    createImportCompletenessReport(rootDir)
  );

  assert.match(
    output,
    /missing drafts: cards esw2_dbg__main_001, esw2_dbg__main_002/
  );
  assert.match(output, /\.\.\. 2 more/);
  assert.doesNotMatch(output, /esw2_dbg__main_012$/);
});

function createValidCardDraft(cardId: string) {
  return {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId,
    source: {
      image: "assets/cards/spell/example.jpg",
      text: `data/import/cards/main/texts/${cardId}.md`,
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

function createValidWizardPropertyDraft(tokenId: string) {
  return {
    schemaVersion: 1,
    draftKind: "wizardPropertyDraft",
    tokenId,
    kind: "wizardProperty",
    source: {
      image: "assets/wizard-property/example.jpg",
      text: `data/import/tokens/wizard-property/texts/${tokenId}.md`,
    },
    visible: {
      sourceLabel: "Свойство 1",
      textRu: "Получив волшебника, получи 1 чипсину.",
      uncertainty: [],
    },
    notes: [],
  };
}

function createValidDeadWizardTokenDraft(tokenId: string) {
  return {
    schemaVersion: 1,
    draftKind: "deadWizardTokenDraft",
    tokenId,
    kind: "deadWizardToken",
    source: {
      image: "assets/dead-wizard-token/example.jpg",
      text: `data/import/tokens/dead-wizard-token/texts/${tokenId}.md`,
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

function writeText(rootDir: string, relativePath: string, text: string): void {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}

function writeJson(
  rootDir: string,
  relativePath: string,
  value: unknown
): void {
  writeText(rootDir, relativePath, JSON.stringify(value));
}
