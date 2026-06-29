import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCardRuntimeClusterReport,
  syncCardClusterDecisions,
  writeCardRuntimeClusterMatrix,
} from "../src/index.js";

test("card runtime clusters report fails when draft cards are missing manual decisions", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-card-runtime-clusters-missing-")
  );

  writeCardDraft(rootDir, "main", "esw2_dbg__main_001", {
    nameRu: "Тестовая атака",
    textRu: "Атака: нанеси 2 урона.",
  });

  assert.throws(
    () => createCardRuntimeClusterReport(rootDir),
    /Missing card cluster decisions: esw2_dbg__main_001/
  );
});

test("card runtime clusters bootstrap decisions with needsClusterDecision status", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-card-runtime-clusters-bootstrap-")
  );

  writeCardDraft(rootDir, "main", "esw2_dbg__main_002");
  writeCardDraft(rootDir, "legend", "esw2_dbg__legend_001");

  const result = syncCardClusterDecisions(rootDir);

  assert.deepEqual(result.addedCardIds, [
    "esw2_dbg__legend_001",
    "esw2_dbg__main_002",
  ]);

  const decisions = JSON.parse(
    readFileSync(
      path.join(
        rootDir,
        ".scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json"
      ),
      "utf8"
    )
  );

  assert.equal(decisions.schemaVersion, 1);
  assert.deepEqual(decisions.decisions, [
    {
      cardId: "esw2_dbg__legend_001",
      status: "needsClusterDecision",
    },
    {
      cardId: "esw2_dbg__main_002",
      status: "needsClusterDecision",
    },
  ]);
});

test("card runtime clusters bootstrap ignores draft templates", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-card-runtime-clusters-template-")
  );

  writeCardDraft(rootDir, "main", "esw2_dbg__main_004");
  writeJson(rootDir, "data/import/cards/main/drafts/_template.json", {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId: "esw2_dbg__template_only",
    visible: {
      nameRu: "Шаблон",
      textRu: "Не должен попадать в decisions",
    },
  });

  const result = syncCardClusterDecisions(rootDir);

  assert.deepEqual(result.addedCardIds, ["esw2_dbg__main_004"]);
});

test("card runtime clusters matrix combines drafts, runtime, compositions, and manual decisions", () => {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), "krutagidon-card-runtime-clusters-matrix-")
  );

  writeCardDraft(rootDir, "main", "esw2_dbg__main_003", {
    nameRu: "Боевая карта",
    textRu: "Атака: нанеси 4 урона врагу.",
  });
  writeCardDraft(rootDir, "starter", "esw2_dbg__starter_001", {
    nameRu: "Стартовая карта",
    textRu: "+1 мощи",
  });

  writeJson(rootDir, "data/cards/main/esw2_dbg__main_003.json", {
    schemaVersion: 1,
    cardId: "esw2_dbg__main_003",
    engine: {
      effects: [{ effectId: "attack_damage", timing: "onPlay", amount: 4 }],
    },
  });
  writeJson(rootDir, "data/decks/main-deck.json", {
    deckId: "main-deck",
    role: "mainDeck",
    entries: [{ cardId: "esw2_dbg__main_003", count: 2 }],
  });
  writeJson(
    rootDir,
    ".scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json",
    {
      schemaVersion: 1,
      decisions: [
        {
          cardId: "esw2_dbg__main_003",
          status: "clustered",
          clusterId: "attack-cards",
          notes: "Полный runtime уже есть.",
        },
        {
          cardId: "esw2_dbg__starter_001",
          status: "needsClusterDecision",
        },
      ],
    }
  );

  const report = writeCardRuntimeClusterMatrix(rootDir);
  const markdown = readFileSync(
    path.join(
      rootDir,
      ".scratch/krutagidon-card-runtime-clusters/card-runtime-cluster-matrix.md"
    ),
    "utf8"
  );

  assert.equal(report.summary.totalCards, 2);
  assert.equal(report.summary.runtimePresent, 1);
  assert.equal(report.summary.inCurrentCompositions, 1);
  assert.equal(report.summary.clustered, 1);
  assert.equal(report.summary.needsClusterDecision, 1);
  assert.match(markdown, /Card Runtime Cluster Matrix/);
  assert.match(markdown, /esw2_dbg__main_003/);
  assert.match(markdown, /deck:main-deck/);
  assert.match(markdown, /attack-cards/);
  assert.match(markdown, /Атака: нанеси 4 урона врагу\./);
  assert.match(markdown, /needsClusterDecision/);
});

function writeCardDraft(
  rootDir: string,
  sourceGroup: "main" | "legend" | "starter" | "familiar" | "special",
  cardId: string,
  overrides: Partial<{
    nameRu: string;
    textRu: string;
  }> = {}
): void {
  writeJson(rootDir, `data/import/cards/${sourceGroup}/drafts/${cardId}.json`, {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId,
    source: {
      image: `assets/cards/${sourceGroup}/${cardId}.png`,
      text: `data/import/cards/${sourceGroup}/texts/${cardId}.md`,
    },
    visible: {
      nameRu: overrides.nameRu ?? "Тестовая карта",
      cost: 3,
      victoryPoints: 1,
      typeRu: "Заклинание",
      cardKind: "normal",
      cardTypes: ["spell"],
      textRu: overrides.textRu ?? "+2 мощи",
      markers: [],
      uncertainty: [],
    },
    notes: [],
    composition: {
      quantity: 2,
    },
  });
}

function writeJson(
  rootDir: string,
  relativePath: string,
  value: unknown
): void {
  writeText(rootDir, relativePath, JSON.stringify(value));
}

function writeText(rootDir: string, relativePath: string, text: string): void {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
}
