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

test("draft import harness keeps mayhem cards in main source group", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-main-mayhem-")
  );
  const cardTextPath = "data/import/cards/main/texts/esw2_dbg__main_059.md";
  writeSource(
    rootDir,
    cardTextPath,
    [
      "# esw2_dbg__main_059",
      "- source image path: `assets/cards/main/esw2_dbg__main_059.png`",
      "- visible Russian name: `2O`",
      "- cost: `None`",
      "- VP: `None`",
      "- visible type: `Беспредел`",
      "",
      "## Visible Russian rules text",
      "",
      "- `Каждый колдун должен либо сбросить все карты с руки и взять 5 карт, либо отхватить 5 урона.`",
      "",
      "## Classification / Разъяснения",
      "",
      "- quantity: `1`",
    ].join("\n")
  );

  const result = runDraftImportHarness({
    rootDir,
    sources: [{ kind: "card", textPath: cardTextPath }],
  });

  assert.equal(result.blockers.length, 0);
  const cardDraft = readJson(
    rootDir,
    "data/import/cards/main/drafts/esw2_dbg__main_059.json"
  );
  assert.equal(cardDraft["cardId"], "esw2_dbg__main_059");
  assert.equal(readNested(cardDraft, ["visible", "cardKind"]), "mayhem");
  assert.deepEqual(readNested(cardDraft, ["visible", "cardTypes"]), []);
  assert.deepEqual(cardDraft["composition"], { quantity: 1 });
  assert.equal(validateDraft(cardDraft).ok, true);
});

test("draft import harness supports legend source text dialect", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-legend-")
  );
  const legendTextPath =
    "data/import/cards/legend/texts/esw2_dbg__legend_001.md";
  const megaMayhemTextPath =
    "data/import/cards/legend/texts/esw2_dbg__mega_mayhem_001.md";
  writeSource(rootDir, legendTextPath, createLegendMarkdown());
  writeSource(rootDir, megaMayhemTextPath, createMegaMayhemMarkdown());

  const result = runDraftImportHarness({
    rootDir,
    sources: [
      { kind: "card", textPath: legendTextPath },
      { kind: "card", textPath: megaMayhemTextPath },
    ],
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    result.generated.map((file) => file.draftPath),
    [
      "data/import/cards/legend/drafts/esw2_dbg__legend_001.json",
      "data/import/cards/legend/drafts/esw2_dbg__mega_mayhem_001.json",
    ]
  );

  const legendDraft = readJson(
    rootDir,
    "data/import/cards/legend/drafts/esw2_dbg__legend_001.json"
  );
  const megaMayhemDraft = readJson(
    rootDir,
    "data/import/cards/legend/drafts/esw2_dbg__mega_mayhem_001.json"
  );

  assert.equal(readNested(legendDraft, ["visible", "cost"]), 10);
  assert.equal(readNested(legendDraft, ["visible", "victoryPoints"]), 4);
  assert.deepEqual(readNested(legendDraft, ["visible", "cardTypes"]), [
    "legend",
    "creature",
  ]);
  assert.deepEqual(legendDraft["composition"], { quantity: 1 });
  assert.deepEqual(legendDraft["notes"], [
    "cardKind = `legend`; cardTypes = [`legend`, `creature`].",
    "Если вялых палочек в стопке не хватает, выдается столько сколько хватает.",
  ]);
  assert.equal(
    readNested(megaMayhemDraft, ["visible", "cardKind"]),
    "megaMayhem"
  );
  assert.deepEqual(readNested(megaMayhemDraft, ["visible", "cardTypes"]), []);
  assert.equal(readNested(megaMayhemDraft, ["visible", "cost"]), null);
  assert.equal(readNested(megaMayhemDraft, ["visible", "victoryPoints"]), null);
  assert.equal(validateDraft(legendDraft).ok, true);
  assert.equal(validateDraft(megaMayhemDraft).ok, true);
});

test("draft import harness writes familiar drafts from normalized text path", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-familiar-")
  );
  const familiarTextPath =
    "data/import/cards/familiar/texts/esw2_dbg__familiar_001.md";
  writeSource(rootDir, familiarTextPath, createFamiliarMarkdown());

  const result = runDraftImportHarness({
    rootDir,
    sources: [{ kind: "card", textPath: familiarTextPath }],
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    result.generated.map((file) => file.draftPath),
    ["data/import/cards/familiar/drafts/esw2_dbg__familiar_001.json"]
  );

  const familiarDraft = readJson(
    rootDir,
    "data/import/cards/familiar/drafts/esw2_dbg__familiar_001.json"
  );
  assert.equal(familiarDraft["cardId"], "esw2_dbg__familiar_001");
  assert.equal(readNested(familiarDraft, ["source", "text"]), familiarTextPath);
  assert.equal(readNested(familiarDraft, ["visible", "cardKind"]), "familiar");
  assert.deepEqual(readNested(familiarDraft, ["visible", "cardTypes"]), [
    "familiar",
  ]);
  assert.equal(readNested(familiarDraft, ["visible", "cost"]), 6);
  assert.equal(readNested(familiarDraft, ["visible", "victoryPoints"]), 2);
  assert.deepEqual(familiarDraft["composition"], { quantity: 1 });
  assert.equal(validateDraft(familiarDraft).ok, true);
});

test("draft import harness supports starter and singleton special source text dialects", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-draft-generator-starter-special-")
  );
  const starterTextPath =
    "data/import/cards/starter/texts/esw2_dbg__starter_001.md";
  const limpWandTextPath =
    "data/import/cards/special/texts/esw2_dbg__limp_wand.md";
  const wildMagicTextPath =
    "data/import/cards/special/texts/esw2_dbg__wild_magic.md";
  writeSource(rootDir, starterTextPath, createStarterMarkdown());
  writeSource(rootDir, limpWandTextPath, createLimpWandMarkdown());
  writeSource(rootDir, wildMagicTextPath, createWildMagicMarkdown());

  const result = runDraftImportHarness({
    rootDir,
    sources: [
      { kind: "card", textPath: starterTextPath },
      { kind: "card", textPath: limpWandTextPath },
      { kind: "card", textPath: wildMagicTextPath },
    ],
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    result.generated.map((file) => file.draftPath),
    [
      "data/import/cards/starter/drafts/esw2_dbg__starter_001.json",
      "data/import/cards/special/drafts/esw2_dbg__limp_wand.json",
      "data/import/cards/special/drafts/esw2_dbg__wild_magic.json",
    ]
  );

  const starterDraft = readJson(
    rootDir,
    "data/import/cards/starter/drafts/esw2_dbg__starter_001.json"
  );
  const limpWandDraft = readJson(
    rootDir,
    "data/import/cards/special/drafts/esw2_dbg__limp_wand.json"
  );
  const wildMagicDraft = readJson(
    rootDir,
    "data/import/cards/special/drafts/esw2_dbg__wild_magic.json"
  );

  assert.equal(readNested(starterDraft, ["visible", "cardKind"]), "starter");
  assert.deepEqual(starterDraft["composition"], { quantity: 30 });
  assert.equal(readNested(limpWandDraft, ["visible", "cardKind"]), "limpWand");
  assert.deepEqual(readNested(limpWandDraft, ["visible", "cardTypes"]), []);
  assert.equal(readNested(limpWandDraft, ["visible", "victoryPoints"]), -1);
  assert.deepEqual(limpWandDraft["composition"], { quantity: 15 });
  assert.equal(
    readNested(wildMagicDraft, ["visible", "cardKind"]),
    "wildMagic"
  );
  assert.deepEqual(readNested(wildMagicDraft, ["visible", "cardTypes"]), []);
  assert.equal(readNested(wildMagicDraft, ["visible", "cost"]), 3);
  assert.deepEqual(wildMagicDraft["notes"], [
    "Разыгранная шальной магией карта находится под контролем активного игрока, но не владельцем этой карты (если разыграна не постоянка)",
  ]);
  assert.deepEqual(wildMagicDraft["composition"], { quantity: 15 });
  assert.equal(validateDraft(starterDraft).ok, true);
  assert.equal(validateDraft(limpWandDraft).ok, true);
  assert.equal(validateDraft(wildMagicDraft).ok, true);
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

function createStarterMarkdown(): string {
  return [
    "# esw2_dbg__starter_001",
    "- source image path: `assets/cards/starter/Затравка. Знак.png`",
    "- source label: `Знак`",
    "- quantity: `30`",
    "- visible Russian name: `Знак`",
    "- visible type: `Затравка`",
    "- visible cost: `0`",
    "- visible victory points: `0`",
    "",
    "## Visible Russian rules text",
    "",
    "+1 мощь",
    "",
    "## Classification / Разъяснения",
    "",
    "- None",
  ].join("\n");
}

function createLimpWandMarkdown(): string {
  return [
    "# esw2_dbg__limp_wand",
    "- source image path: `assets/cards/special/Вялая палочка.png`",
    "- source label: `Вялая палочка`",
    "- quantity: `15`",
    "- visible Russian name: `Вялая палочка`",
    "- visible type: `Вялая палочка`",
    "- visible card kind: `limpWand`",
    "- visible card types: ``",
    "- visible cost: `0`",
    "- visible victory points: `-1`",
    "",
    "## Visible Russian rules text",
    "",
    "(Эффекта нет.)",
    "",
    "## Classification / Разъяснения",
    "",
    "- None",
  ].join("\n");
}

function createWildMagicMarkdown(): string {
  return [
    "# esw2_dbg__wild_magic",
    "- source image path: `assets/cards/special/Шальная магия.png`",
    "- source label: `Шальная магия`",
    "- quantity: `15`",
    "- visible Russian name: `Шальная магия`",
    "- visible type: `Шальная магия`",
    "- visible card kind: `wildMagic`",
    "- visible card types: ``",
    "- visible cost: `3`",
    "- visible victory points: `1`",
    "",
    "## Visible Russian rules text",
    "",
    "Выбери одно: +2 мощи",
    "ИЛИ можешь сыграть верхнюю карту из колоды любого врага и затем положить ее в стопку сброса владельца. Если это постоянка, вместо этого оставь ее у себя в игре",
    "",
    "## Classification / Разъяснения",
    "",
    "- Разыгранная шальной магией карта находится под контролем активного игрока, но не владельцем этой карты (если разыграна не постоянка)",
  ].join("\n");
}

function createLegendMarkdown(): string {
  return [
    "# esw2_dbg\\_\\_legend_001",
    "- source image path: `assets/cards/legend/creature/legend.png`",
    "- source label: `Легенда-Тварь. Нарывка`",
    "- quantity: `1`",
    "- visible Russian name: `Нарывка`",
    "- visible type: `Легенда — Тварь`",
    "- visible card kind: `legend`",
    "- visible card types: `legend, creature`",
    "- visible markers: `attack`",
    "- visible cost: `10`",
    "- visible victory points: `4`",
    "",
    "## Visible Russian rules text",
    "",
    "+3 мощи",
    "Атака: каждый враг получает 2 вялые палочки.",
    "",
    "## Classification / Разъяснения",
    "",
    "- `cardKind = `legend`; cardTypes = [`legend`, `creature`].`",
    "- Если вялых палочек в стопке не хватает, выдается столько сколько хватает.",
  ].join("\n");
}

function createMegaMayhemMarkdown(): string {
  return [
    "# esw2_dbg\\_\\_mega_mayhem_001",
    "- source image path: `assets/cards/mega-mayhem/mega.png`",
    "- source label: `МегаБеспредел. MA`",
    "- quantity: `1`",
    "- visible Russian name: `МегаБеспредел MA`",
    "- visible type: `МегаБеспредел`",
    "- visible card kind: `megaMayhem`",
    "- visible card types: ``",
    "- visible markers: `attack`",
    "- visible cost: `null`",
    "- visible victory points: `null`",
    "",
    "## Visible Russian rules text",
    "",
    "Атака: нанеси каждому колдуну столько урона, какова стоимость самой дорогой легенды на барахолке.",
    "",
    "## Classification / Разъяснения",
    "",
    "- `cardKind = `megaMayhem`; cardTypes = [].`",
  ].join("\n");
}

function createFamiliarMarkdown(): string {
  return [
    "# esw2_dbg\\_\\_familiar_001",
    "- source image path: `assets/cards/raw/familiar/familiar.png`",
    "- source label: `Фамильяр. Поехавший нотариус`",
    "- processed marker: `manual_from_uploaded_image`",
    "- quantity: `1`",
    "- visible Russian name: `Поехавший нотариус`",
    "- visible type: `Фамильяр`",
    "- visible card kind: `familiar`",
    "- visible card types: `familiar`",
    "- visible markers: `defense`",
    "- visible cost: `6`",
    "- visible victory points: `2`",
    "",
    "## Visible Russian rules text",
    "",
    "+3 мощи",
    "Защита: можешь сбросить эту карту, чтобы избежать атаки.",
    "",
    "## Classification / Разъяснения",
    "",
    "- `cardKind = `familiar`; cardTypes = [`familiar`].`",
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
