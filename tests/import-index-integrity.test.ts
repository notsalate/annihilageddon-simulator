import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface IndexedCardSource {
  cardId: string;
  extractionFile: string;
}

interface CardTextIndex {
  entries: IndexedCardSource[];
}

interface CardDraft {
  notes: string[];
}

interface ClusterDecision {
  cardId: string;
  notes?: string;
}

interface ClusterDecisions {
  decisions: ClusterDecision[];
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

test("each card text index entry has canonical text and draft files", () => {
  const indexFiles = ["data/import/cards/legend/texts/index.json"];
  const missing: string[] = [];

  for (const indexFile of indexFiles) {
    const index = readJson<CardTextIndex>(indexFile);

    for (const entry of index.entries) {
      const textFile = `data/import/cards/legend/texts/${entry.cardId}.md`;
      const draftFile = entry.extractionFile
        .replace("/texts/", "/drafts/")
        .replace(/\.md$/, ".json");

      assert.equal(entry.extractionFile, textFile);

      if (!existsSync(path.join(repositoryRoot, entry.extractionFile))) {
        missing.push(`${entry.cardId}: text ${entry.extractionFile}`);
      }

      if (!existsSync(path.join(repositoryRoot, draftFile))) {
        missing.push(`${entry.cardId}: draft ${draftFile}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("wand mapping and Heart of the Mage normalization remain explicit", () => {
  const wandIds = [
    "esw2_dbg__legend_021",
    "esw2_dbg__legend_023",
    "esw2_dbg__legend_024",
  ];
  const wandNote =
    "При создании runtime JSON эта карта обязана получить общие tags `wandCard` и `wandAttackCard`.";
  const heartNote =
    "Печатный бонус протектора игнорируется при runtime mapping: victoryPoints всегда 3, исполняемое условие протектора не создаётся.";
  const decisions = readJson<ClusterDecisions>(
    ".scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json"
  );

  for (const cardId of wandIds) {
    assertCardArtifactsContainNote(cardId, wandNote, decisions);
  }

  assertCardArtifactsContainNote("esw2_dbg__legend_026", heartNote, decisions);
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8")
  ) as T;
}

function assertCardArtifactsContainNote(
  cardId: string,
  note: string,
  decisions: ClusterDecisions
): void {
  const textPath = `data/import/cards/legend/texts/${cardId}.md`;
  const draftPath = `data/import/cards/legend/drafts/${cardId}.json`;
  const sourceText = readFileSync(path.join(repositoryRoot, textPath), "utf8");
  const draft = readJson<CardDraft>(draftPath);
  const decision = decisions.decisions.find(
    (candidate) => candidate.cardId === cardId
  );

  assert.match(sourceText, new RegExp(escapeRegExp(note)));
  assert.ok(draft.notes.includes(note));
  assert.equal(decision?.notes?.includes(note), true);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
