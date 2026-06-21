import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDraftImportHarness, validateDraft } from "../src/index.js";

test("draft import harness generates one card draft and one token draft from source text", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-")
  );
  const cardTextPath = "data/import/cards/main/texts/esw2_dbg__main_001.md";
  const tokenTextPath =
    "data/import/tokens/dead-wizard-token/texts/esw2_dbg__dead_wizard_token_001.md";
  writeSource(rootDir, cardTextPath, createCardMarkdown());
  writeSource(rootDir, tokenTextPath, createDeadWizardTokenMarkdown());

  const result = runDraftImportHarness({
    rootDir,
    sources: [
      { kind: "card", textPath: cardTextPath },
      { kind: "deadWizardToken", textPath: tokenTextPath },
    ],
    blockersReportPath: ".scratch/tmp/draft-import-blockers.json",
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    result.generated.map((file) => file.draftPath),
    [
      "data/import/cards/main/drafts/esw2_dbg__main_001.json",
      "data/import/tokens/dead-wizard-token/drafts/esw2_dbg__dead_wizard_token_001.json",
    ]
  );

  const cardDraft = readJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_001.json"
  );
  const tokenDraft = readJson(
    rootDir,
    "data/import/tokens/dead-wizard-token/drafts/esw2_dbg__dead_wizard_token_001.json"
  );

  assert.equal(validateDraft(cardDraft).ok, true);
  assert.equal(validateDraft(tokenDraft).ok, true);
  assertNoRuntimeFields(cardDraft);
  assertNoRuntimeFields(tokenDraft);
  assert.deepEqual(cardDraft["composition"], { quantity: 2 });
  assert.deepEqual(tokenDraft["notes"], [
    "Runtime DWT behavior назначается отдельным mapping-шагом.",
  ]);
  assert.equal(readNested(cardDraft, ["source", "text"]), cardTextPath);
  assert.equal(readNested(tokenDraft, ["source", "text"]), tokenTextPath);
  assert.equal(
    existsSync(
      path.join(rootDir, ".scratch", "tmp", "draft-import-blockers.json")
    ),
    true
  );
});

test("draft import harness writes blockers when source text is insufficient", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-blockers-")
  );
  const cardTextPath = "data/import/cards/main/texts/esw2_dbg__main_002.md";
  writeSource(
    rootDir,
    cardTextPath,
    [
      "# esw2_dbg__main_002",
      "- source image path: `assets/cards/main/esw2_dbg__main_002.png`",
      "- cost: `5abc`",
    ].join("\n")
  );

  const result = runDraftImportHarness({
    rootDir,
    sources: [{ kind: "card", textPath: cardTextPath }],
    blockersReportPath: ".scratch/tmp/draft-import-blockers.json",
  });

  assert.equal(result.generated.length, 0);
  assert.ok(
    result.blockers.some((blocker) => blocker.field === "visible.nameRu")
  );
  assert.ok(
    result.blockers.some((blocker) => blocker.field === "visible.textRu")
  );
  assert.ok(
    result.blockers.some((blocker) => blocker.field === "visible.cost")
  );
  assert.equal(
    existsSync(
      path.join(
        rootDir,
        "data",
        "import",
        "cards",
        "main",
        "drafts",
        "esw2_dbg__main_002.json"
      )
    ),
    false
  );

  const report = readJson(rootDir, ".scratch/tmp/draft-import-blockers.json");
  assert.deepEqual(report["blockers"], result.blockers);
});

test("draft import harness infers markers only when visible markers are absent", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-markers-")
  );
  const inferredTextPath = "data/import/cards/main/texts/esw2_dbg__main_003.md";
  const explicitTextPath = "data/import/cards/main/texts/esw2_dbg__main_004.md";
  writeSource(
    rootDir,
    inferredTextPath,
    createCardMarkdown().replace("- visible markers: `attack`\n", "")
  );
  writeSource(
    rootDir,
    explicitTextPath,
    createCardMarkdown()
      .replaceAll("esw2_dbg__main_001", "esw2_dbg__main_004")
      .replace("- visible markers: `attack`", "- visible markers: ``")
  );

  const result = runDraftImportHarness({
    rootDir,
    sources: [
      { kind: "card", textPath: inferredTextPath },
      { kind: "card", textPath: explicitTextPath },
    ],
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    readNested(
      readJson(
        rootDir,
        "data/import/cards/main/drafts/esw2_dbg__main_003.json"
      ),
      ["visible", "markers"]
    ),
    ["attack"]
  );
  assert.deepEqual(
    readNested(
      readJson(
        rootDir,
        "data/import/cards/main/drafts/esw2_dbg__main_004.json"
      ),
      ["visible", "markers"]
    ),
    []
  );
});

function createCardMarkdown(): string {
  return [
    "# esw2_dbg__main_001",
    "- source image path: `assets/cards/main/esw2_dbg__main_001.png`",
    "- visible Russian name: `Сосочный проколист`",
    "- cost: `5`",
    "- VP: `1`",
    "- visible type: `Волшебник`",
    "- visible card kind: `normal`",
    "- visible card types: `wizardCard`",
    "- visible markers: `attack`",
    "",
    "## Visible Russian rules text",
    "",
    "- `+2 мощи`",
    "- `Атака: нанеси 7 урона каждому врагу.`",
    "",
    "## Classification / Разъяснения",
    "",
    "- `Количество берется из source text.`",
    "- quantity: `2`",
  ].join("\n");
}

function createDeadWizardTokenMarkdown(): string {
  return [
    "# esw2_dbg__dead_wizard_token_001",
    "",
    "sourceImages:",
    "- assets/dead-wizard-token/esw2_dbg__dead_wizard_token_001.png",
    "",
    "sourceLabel: Жетон мертвого волшебника 1",
    "",
    "VP: -3",
    "",
    "textRu:",
    "Получив этот жетон, не получай немедленный эффект.",
    "",
    "clarifications:",
    "- Runtime DWT behavior назначается отдельным mapping-шагом.",
  ].join("\n");
}

function writeSource(
  rootDir: string,
  relativePath: string,
  contents: string
): void {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${contents}\n`, "utf8");
}

function readJson(
  rootDir: string,
  relativePath: string
): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(rootDir, relativePath), "utf8")
  ) as Record<string, unknown>;
}

function assertNoRuntimeFields(value: Record<string, unknown>): void {
  for (const fieldName of [
    "engine",
    "runtimeSchema",
    "playableInV0",
    "mappingStatus",
    "effects",
  ]) {
    assert.equal(fieldName in value, false, fieldName);
  }
}

function readNested(value: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    assert.equal(typeof current, "object");
    assert.notEqual(current, null);
    assert.equal(Array.isArray(current), false);
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
