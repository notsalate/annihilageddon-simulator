import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { isPlainRecord } from "../common.js";
import {
  evaluateCrossSourceCoverage,
  hasAppropriateRuntimeComposition,
  readCrossSourceCoveragePlan,
  type CrossSourceBlocker,
  type CrossSourceCoveragePlanEntry,
} from "./cross-source-runtime-coverage.js";
import { createCardRuntimeClusterReport } from "./card-runtime-clusters.js";

export type RuntimeCoverageStatus =
  | "missingRuntime"
  | "reviewNeeded"
  | "partial"
  | "placeholder"
  | "fullyPlayableCandidate";

export type RuntimeCoverageObjectKind =
  | "card"
  | "wizardProperty"
  | "deadWizardToken";

export type CardCompletionStatus =
  | "cardComplete"
  | "missingRuntime"
  | "unavailable"
  | "notApplicable";

export type CrossSourceCoverageStatus = "blocked" | "crossSourceComplete";

export interface RuntimeCoverageInventoryItem {
  id: string;
  objectKind: RuntimeCoverageObjectKind;
  sourceGroupOrTokenKind: string;
  draftPresence: "present" | "missing";
  runtimePresence: "present" | "missing";
  compositionMembership: string[];
  missingAppropriateComposition: boolean;
  legacyRuntimeSchema: string | undefined;
  legacyPlayableInV0: boolean | undefined;
  runtimeMappingStatus: string | undefined;
  coverageStatus: RuntimeCoverageStatus;
  visibleNameRu: string | undefined;
  visibleTextRu: string | undefined;
  mechanicSignals: string[];
  suspectedBlockers: string[];
  focusedTestRefs: string[];
  cardCompletion: CardCompletionStatus;
  crossSourceStatus: CrossSourceCoverageStatus;
  primaryMechanicCluster: string | undefined;
  crossSourceBlockers: string[];
  crossSourceBlockerCodes: CrossSourceBlocker[];
}

export interface RuntimeCoverageMechanicCluster {
  clusterId: string;
  title: string;
  itemIds: string[];
  sharedMechanicSurface: string;
  suspectedBlockers: string[];
  suggestedFocusedTestCoverage: string[];
}

export interface RuntimeCoverageInventory {
  items: RuntimeCoverageInventoryItem[];
  clusters: RuntimeCoverageMechanicCluster[];
  recommendedNextIssueOrder: string[];
  summary: Record<RuntimeCoverageStatus, number>;
  crossSourceSummary: Record<
    CrossSourceCoverageStatus | "cardComplete" | "missingRuntime",
    number
  >;
  crossSourceIntegrityBlockers: string[];
  generatedAt: string;
}

export interface RuntimeCoverageSource {
  objectKind: RuntimeCoverageObjectKind;
  sourceGroupOrTokenKind: string;
  draftDir: string;
  runtimeDirs: string[];
}

export interface RuntimeCoverageRawRecord {
  id: string | undefined;
  objectKind: RuntimeCoverageObjectKind;
  sourceGroupOrTokenKind: string;
  filePath: string;
  value: Record<string, unknown>;
}

export interface RuntimeCoverageCompositionMembership {
  label: string;
  role: string | undefined;
  entryKind: "card" | "token";
  count: number | undefined;
}

export interface RuntimeCoverageCompositionReference {
  id: string;
  count: number | undefined;
  filePath: string;
}

export interface RuntimeCoverageActivePackData {
  packId: string | undefined;
  reachableIds: Set<string>;
  structuralStatus: "complete" | "blocked";
  missingReferences: string[];
}

export interface RuntimeCoverageSnapshot {
  canonicalRecords: RuntimeCoverageRawRecord[];
  runtimeRecords: RuntimeCoverageRawRecord[];
  runtimeById: Map<string, Record<string, unknown>>;
  compositionsById: Map<string, RuntimeCoverageCompositionMembership[]>;
  compositionReferences: RuntimeCoverageCompositionReference[];
  focusedTestRefsById: Map<string, string[]>;
  crossSourcePlan: Map<string, CrossSourceCoveragePlanEntry>;
  cardCompletionById: Map<string, CardCompletionStatus>;
  activePack: RuntimeCoverageActivePackData;
}

const runtimeCoverageSnapshots = new WeakMap<
  RuntimeCoverageInventory,
  RuntimeCoverageSnapshot
>();

export const runtimeCoverageSources: ReadonlyArray<RuntimeCoverageSource> = [
  {
    objectKind: "card",
    sourceGroupOrTokenKind: "main",
    draftDir: "data/import/cards/main/drafts",
    runtimeDirs: ["data/cards"],
  },
  {
    objectKind: "card",
    sourceGroupOrTokenKind: "legend",
    draftDir: "data/import/cards/legend/drafts",
    runtimeDirs: ["data/cards"],
  },
  {
    objectKind: "card",
    sourceGroupOrTokenKind: "starter",
    draftDir: "data/import/cards/starter/drafts",
    runtimeDirs: ["data/cards"],
  },
  {
    objectKind: "card",
    sourceGroupOrTokenKind: "familiar",
    draftDir: "data/import/cards/familiar/drafts",
    runtimeDirs: ["data/cards"],
  },
  {
    objectKind: "card",
    sourceGroupOrTokenKind: "special",
    draftDir: "data/import/cards/special/drafts",
    runtimeDirs: ["data/cards"],
  },
  {
    objectKind: "wizardProperty",
    sourceGroupOrTokenKind: "wizardProperty",
    draftDir: "data/import/tokens/wizard-property/drafts",
    runtimeDirs: ["data/tokens/wizard-property"],
  },
  {
    objectKind: "deadWizardToken",
    sourceGroupOrTokenKind: "deadWizardToken",
    draftDir: "data/import/tokens/dead-wizard-token/drafts",
    runtimeDirs: ["data/tokens/dead-wizard"],
  },
];

export const runtimeCoverageCompositionDirectories = [
  "data/decks",
  "data/stacks",
  "data/pools",
] as const;

export function createRuntimeCoverageInventory(
  rootDir: string
): RuntimeCoverageInventory {
  const snapshot = createRuntimeCoverageSnapshot(rootDir);
  const items = runtimeCoverageSources
    .flatMap((source) => collectDraftItems(rootDir, source, snapshot))
    .sort((left, right) => left.id.localeCompare(right.id));
  const clusters = createMechanicClusters(items);
  const summary = summarizeStatuses(items);
  const crossSourceIntegrityBlockers = collectCrossSourceIntegrityBlockers(
    snapshot.runtimeById,
    snapshot.compositionsById
  );

  const report = {
    items,
    clusters,
    recommendedNextIssueOrder: clusters.map((cluster) => cluster.clusterId),
    summary,
    crossSourceSummary: summarizeCrossSourceStatuses(items),
    crossSourceIntegrityBlockers,
    generatedAt: new Date().toISOString(),
  };
  runtimeCoverageSnapshots.set(report, snapshot);
  return report;
}

export function getRuntimeCoverageSnapshot(
  report: RuntimeCoverageInventory
): RuntimeCoverageSnapshot {
  const snapshot = runtimeCoverageSnapshots.get(report);
  if (snapshot === undefined) {
    throw new Error("runtime coverage inventory has no source snapshot");
  }
  return snapshot;
}

export function formatRuntimeCoverageInventoryMarkdown(
  report: RuntimeCoverageInventory
): string {
  const lines = [
    "# v0.5 Runtime Coverage Audit Report",
    "",
    "Generated from canonical draft JSON, current runtime JSON, and deck/stack/pool composition files.",
    'Old `runtimeSchema = "krutagidon.cardDefinition.v0"` and `playableInV0` values are reported as legacy facts, not current coverage truth.',
    "",
    "## Summary",
    "",
  ];

  for (const status of [
    "missingRuntime",
    "reviewNeeded",
    "partial",
    "placeholder",
    "fullyPlayableCandidate",
  ] as const) {
    lines.push(`- ${status}: ${report.summary[status]}`);
  }

  lines.push("", "## Cross-Source Completion", "");
  for (const status of [
    "cardComplete",
    "missingRuntime",
    "blocked",
    "crossSourceComplete",
  ] as const) {
    lines.push(
      `- crossSourceStatus: ${status}: ${report.crossSourceSummary[status]}`
    );
  }
  lines.push(
    `- integrity blockers: ${report.crossSourceIntegrityBlockers.join("; ") || "none"}`
  );

  lines.push("", "## Mechanic Clusters", "");
  for (const cluster of report.clusters) {
    lines.push(`### ${cluster.title}`, "");
    lines.push(`- clusterId: \`${cluster.clusterId}\``);
    lines.push(`- itemIds: ${formatInlineIds(cluster.itemIds)}`);
    lines.push(`- shared mechanic surface: ${cluster.sharedMechanicSurface}`);
    lines.push(
      `- suspected blockers: ${cluster.suspectedBlockers.join("; ") || "none detected"}`
    );
    lines.push(
      `- suggested focused test coverage: ${cluster.suggestedFocusedTestCoverage.join("; ")}`
    );
    lines.push("");
  }

  lines.push("## Recommended Next Issue Order", "");
  report.recommendedNextIssueOrder.forEach((clusterId, index) => {
    lines.push(`${index + 1}. \`${clusterId}\``);
  });

  lines.push("", "## Inventory", "");
  lines.push(
    "| stable ID | object kind | source group/token kind | draft | runtime | composition membership | legacy v0 facts | status | card completion | cross-source status | primary mechanic cluster | cross-source blocker codes | cross-source blockers | mechanic signals | suspected blockers |"
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );

  for (const item of report.items) {
    const legacyFacts = [
      item.legacyRuntimeSchema === undefined
        ? undefined
        : `runtimeSchema=${item.legacyRuntimeSchema}`,
      item.legacyPlayableInV0 === undefined
        ? undefined
        : `playableInV0=${String(item.legacyPlayableInV0)}`,
    ]
      .filter((fact): fact is string => fact !== undefined)
      .join("<br>");

    lines.push(
      [
        code(item.id),
        item.objectKind,
        item.sourceGroupOrTokenKind,
        item.draftPresence,
        item.runtimePresence,
        item.compositionMembership.length === 0
          ? "none"
          : item.compositionMembership.map(code).join("<br>"),
        legacyFacts || "none",
        item.coverageStatus,
        item.cardCompletion,
        item.crossSourceStatus,
        item.primaryMechanicCluster === undefined
          ? "none"
          : code(item.primaryMechanicCluster),
        item.crossSourceBlockerCodes.length === 0
          ? "none"
          : item.crossSourceBlockerCodes
              .map((blocker) =>
                code(
                  `${blocker.code}${blocker.capabilityId === undefined ? "" : `:${blocker.capabilityId}`}`
                )
              )
              .join("<br>"),
        item.crossSourceBlockers.join("<br>") || "none",
        item.mechanicSignals.join("<br>") || "none",
        item.suspectedBlockers.join("<br>") || "none",
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |")
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function writeRuntimeCoverageInventoryMarkdown(
  rootDir: string,
  outputPath: string
): RuntimeCoverageInventory {
  const report = createRuntimeCoverageInventory(rootDir);
  const absoluteOutputPath = path.resolve(rootDir, outputPath);
  mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(
    absoluteOutputPath,
    formatRuntimeCoverageInventoryMarkdown(report),
    "utf8"
  );
  return report;
}

function collectDraftItems(
  rootDir: string,
  source: RuntimeCoverageSource,
  snapshot: RuntimeCoverageSnapshot
): RuntimeCoverageInventoryItem[] {
  return snapshot.canonicalRecords
    .filter(
      (record) =>
        record.objectKind === source.objectKind &&
        record.sourceGroupOrTokenKind === source.sourceGroupOrTokenKind
    )
    .map((record) => {
      const draft = record.value;
      const id = record.id ?? path.basename(record.filePath, ".json");
      const runtime = snapshot.runtimeById.get(id);
      const compositionMembership = snapshot.compositionsById.get(id) ?? [];
      const focusedTestRefs = snapshot.focusedTestRefsById.get(id) ?? [];
      const mechanicSignals = collectMechanicSignals(draft, runtime);
      const suspectedBlockers = collectSuspectedBlockers(
        runtime,
        compositionMembership,
        source
      );
      const coverageStatus = classifyCoverage(
        runtime,
        compositionMembership,
        focusedTestRefs,
        suspectedBlockers
      );
      const visible = getRecord(getRecord(draft)["visible"]);
      const crossSource = evaluateCrossSourceCoverage({
        rootDir,
        id,
        objectKind: source.objectKind,
        sourceGroupOrTokenKind: source.sourceGroupOrTokenKind,
        draft,
        runtime,
        compositionMembership,
        planEntry: snapshot.crossSourcePlan.get(id),
      });

      return {
        id,
        objectKind: source.objectKind,
        sourceGroupOrTokenKind: source.sourceGroupOrTokenKind,
        draftPresence: "present",
        runtimePresence: runtime === undefined ? "missing" : "present",
        compositionMembership: compositionMembership
          .map((membership) => membership.label)
          .sort(),
        missingAppropriateComposition: !hasAppropriateComposition(
          source,
          compositionMembership
        ),
        legacyRuntimeSchema:
          getString(getRecord(runtime)["runtimeSchema"]) ??
          getString(getRecord(getRecord(runtime)["engine"])["runtimeSchema"]),
        legacyPlayableInV0: getBoolean(
          getRecord(getRecord(runtime)["engine"])["playableInV0"]
        ),
        runtimeMappingStatus:
          getString(getRecord(getRecord(runtime)["engine"])["mappingStatus"]) ??
          getString(getRecord(runtime)["mappingStatus"]),
        coverageStatus,
        visibleNameRu:
          getString(visible["nameRu"]) ?? getString(visible["sourceLabel"]),
        visibleTextRu: getString(visible["textRu"]),
        mechanicSignals,
        suspectedBlockers,
        focusedTestRefs,
        cardCompletion:
          source.objectKind === "card"
            ? (snapshot.cardCompletionById.get(id) ?? "unavailable")
            : "notApplicable",
        crossSourceStatus: crossSource.status,
        primaryMechanicCluster: crossSource.primaryMechanicCluster,
        crossSourceBlockers: crossSource.blockers,
        crossSourceBlockerCodes: crossSource.blockerCodes,
      };
    });
}

function createRuntimeCoverageSnapshot(
  rootDir: string
): RuntimeCoverageSnapshot {
  const canonicalRecords = collectCanonicalRecords(rootDir);
  const runtimeRecords = collectRuntimeRecords(rootDir);
  const runtimeById = new Map<string, Record<string, unknown>>();
  for (const record of runtimeRecords) {
    if (record.id !== undefined) {
      runtimeById.set(record.id, record.value);
    }
  }

  const compositionData = collectCompositionData(rootDir);
  return {
    canonicalRecords,
    runtimeRecords,
    runtimeById,
    compositionsById: compositionData.memberships,
    compositionReferences: compositionData.references,
    focusedTestRefsById: collectFocusedTestRefs(rootDir),
    crossSourcePlan: readCrossSourceCoveragePlan(rootDir),
    cardCompletionById: collectCardCompletionById(rootDir),
    activePack: collectActivePackData(rootDir),
  };
}

function collectRuntimeRecords(rootDir: string): RuntimeCoverageRawRecord[] {
  const runtimeSources = runtimeCoverageSources.filter(
    (source, index, sources) =>
      sources.findIndex((candidate) =>
        candidate.runtimeDirs.some((directory) =>
          source.runtimeDirs.includes(directory)
        )
      ) === index
  );
  return runtimeSources.flatMap((source) =>
    collectRuntimeCoverageFiles(rootDir, source.runtimeDirs, ".json").flatMap(
      (filePath) => {
        const value = getRecord(readJson(filePath));
        const id = getObjectId(value);
        return id === undefined
          ? []
          : [
              {
                id,
                objectKind: source.objectKind,
                sourceGroupOrTokenKind: source.sourceGroupOrTokenKind,
                filePath,
                value,
              },
            ];
      }
    )
  );
}

function collectCardCompletionById(
  rootDir: string
): Map<string, CardCompletionStatus> {
  try {
    return new Map(
      createCardRuntimeClusterReport(rootDir).items.map((item) => [
        item.cardId,
        item.runtimeStatus === "fullRuntime"
          ? "cardComplete"
          : "missingRuntime",
      ])
    );
  } catch {
    return new Map();
  }
}

function collectCanonicalRecords(rootDir: string): RuntimeCoverageRawRecord[] {
  return runtimeCoverageSources.flatMap((source) =>
    collectRuntimeCoverageFiles(rootDir, [source.draftDir], ".json").map(
      (filePath) => {
        const value = getRecord(readJson(filePath));
        return {
          id: getObjectId(value),
          objectKind: source.objectKind,
          sourceGroupOrTokenKind: source.sourceGroupOrTokenKind,
          filePath,
          value,
        };
      }
    )
  );
}

function collectCrossSourceIntegrityBlockers(
  runtimeById: Map<string, Record<string, unknown>>,
  compositionsById: Map<string, RuntimeCoverageCompositionMembership[]>
): string[] {
  const blockers = new Set<string>();
  for (const [id, memberships] of compositionsById) {
    if (memberships.length > 0 && !runtimeById.has(id)) {
      blockers.add(`composition reference has no runtime definition: ${id}`);
    }
  }
  return Array.from(blockers).sort();
}

function collectCompositionData(rootDir: string): {
  memberships: Map<string, RuntimeCoverageCompositionMembership[]>;
  references: RuntimeCoverageCompositionReference[];
} {
  const memberships = new Map<string, RuntimeCoverageCompositionMembership[]>();
  const references: RuntimeCoverageCompositionReference[] = [];
  const compositionFiles = collectRuntimeCoverageFiles(
    rootDir,
    ["data/decks", "data/stacks", "data/pools"],
    ".json"
  );

  for (const filePath of compositionFiles) {
    const parsed = getRecord(readJson(filePath));
    const label = `${getCompositionPrefix(filePath)}:${getString(parsed["deckId"]) ?? getString(parsed["stackId"]) ?? path.basename(filePath, ".json")}`;
    const role = getString(parsed["role"]);
    const entries = Array.isArray(parsed["entries"]) ? parsed["entries"] : [];

    for (const entry of entries) {
      const record = getRecord(entry);
      const cardId = getString(record["cardId"]);
      const tokenId = getString(record["tokenId"]);
      const id = cardId ?? tokenId;
      if (id === undefined) {
        continue;
      }

      references.push({
        id,
        count: getNumber(record["count"]),
        filePath,
      });

      const current = memberships.get(id) ?? [];
      current.push({
        label,
        role,
        entryKind: cardId === undefined ? "token" : "card",
        count: getNumber(record["count"]),
      });
      memberships.set(id, current);
    }
  }

  const tokenFiles = collectRuntimeCoverageFiles(
    rootDir,
    ["data/tokens"],
    ".json"
  );
  for (const filePath of tokenFiles) {
    const parsed = getRecord(readJson(filePath));
    const tokenId =
      getString(parsed["tokenId"]) ?? path.basename(filePath, ".json");
    const rawEffects = getRecord(parsed["engine"])["effects"];
    const effects = Array.isArray(rawEffects) ? rawEffects : [];

    for (const effect of effects) {
      const record = getRecord(effect);
      if (record["effectId"] !== "replace_starting_card") {
        continue;
      }

      const toDefinitionId = getString(record["toDefinitionId"]);
      if (toDefinitionId === undefined) {
        continue;
      }

      const current = memberships.get(toDefinitionId) ?? [];
      current.push({
        label: `replacement:${tokenId}`,
        role: "starterReplacement",
        entryKind: "card",
        count: 1,
      });
      memberships.set(toDefinitionId, current);
    }
  }

  return { memberships, references };
}

function collectActivePackData(rootDir: string): RuntimeCoverageActivePackData {
  const manifestPath = path.resolve(rootDir, "data/packs/current-runtime.json");
  if (!existsSync(manifestPath)) {
    return {
      packId: undefined,
      reachableIds: new Set(),
      structuralStatus: "blocked",
      missingReferences: ["active pack manifest is missing"],
    };
  }

  const manifest = getRecord(readJson(manifestPath));
  const reachableIds = new Set<string>();
  const missingReferences: string[] = [];
  const definitionPaths = [
    ...getStringArray(manifest["cardDefinitionPaths"]),
    ...getStringArray(manifest["tokenDefinitionPaths"]),
  ];
  for (const relativePath of definitionPaths) {
    const absolutePath = path.resolve(rootDir, relativePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      missingReferences.push(
        `active pack definition path is missing: ${relativePath}`
      );
      continue;
    }
    for (const filePath of collectRuntimeCoverageFiles(
      rootDir,
      [relativePath],
      ".json"
    )) {
      const value = getRecord(readJson(filePath));
      const id = getObjectId(value);
      if (id !== undefined) {
        reachableIds.add(id);
      }
    }
  }

  const compositionSections = [
    "decks",
    "cardStacks",
    "tokenStacks",
    "pools",
  ] as const;
  for (const sectionName of compositionSections) {
    const section = getRecord(manifest[sectionName]);
    for (const relativePath of getStringArray(Object.values(section))) {
      const absolutePath = path.resolve(rootDir, relativePath);
      if (!existsSync(absolutePath)) {
        missingReferences.push(
          `active pack composition path is missing: ${relativePath}`
        );
        continue;
      }
      const value = getRecord(readJson(absolutePath));
      for (const entry of getArray(value["entries"])) {
        const record = getRecord(entry);
        const id = getString(record["cardId"]) ?? getString(record["tokenId"]);
        if (id !== undefined) {
          reachableIds.add(id);
        }
      }
    }
  }

  return {
    packId: getString(manifest["packId"]),
    reachableIds,
    structuralStatus: missingReferences.length === 0 ? "complete" : "blocked",
    missingReferences,
  };
}

function collectFocusedTestRefs(rootDir: string): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const testFiles = collectRuntimeCoverageFiles(rootDir, ["tests"], ".ts");
  const idPattern = /esw2_dbg__[a-z0-9_]+/g;

  for (const filePath of testFiles) {
    const text = readFileSync(filePath, "utf8");
    for (const match of text.matchAll(idPattern)) {
      const id = match[0];
      const current = refs.get(id) ?? [];
      const relativePath = path
        .relative(rootDir, filePath)
        .replaceAll("\\", "/");
      if (!current.includes(relativePath)) {
        current.push(relativePath);
      }
      refs.set(id, current);
    }
  }

  return refs;
}

function classifyCoverage(
  runtime: Record<string, unknown> | undefined,
  compositionMembership: RuntimeCoverageCompositionMembership[],
  focusedTestRefs: string[],
  suspectedBlockers: string[]
): RuntimeCoverageStatus {
  if (runtime === undefined) {
    return "missingRuntime";
  }

  const runtimeMappingStatus =
    getString(getRecord(getRecord(runtime)["engine"])["mappingStatus"]) ??
    getString(getRecord(runtime)["mappingStatus"]);
  const playableInV0 = getBoolean(
    getRecord(getRecord(runtime)["engine"])["playableInV0"]
  );
  const unsupportedMechanics = getStringArray(
    getRecord(getRecord(runtime)["engine"])["unsupportedMechanics"]
  );
  const needsEffectMapping = getBoolean(
    getRecord(getRecord(runtime)["engine"])["needsEffectMapping"]
  );

  if (
    runtimeMappingStatus !== undefined &&
    /placeholder/i.test(runtimeMappingStatus)
  ) {
    return "placeholder";
  }

  if (
    runtimeMappingStatus === "draft" ||
    playableInV0 === false ||
    needsEffectMapping === true ||
    unsupportedMechanics.length > 0 ||
    suspectedBlockers.length > 0
  ) {
    return "partial";
  }

  if (compositionMembership.length > 0 && focusedTestRefs.length > 0) {
    return "fullyPlayableCandidate";
  }

  return "reviewNeeded";
}

function collectMechanicSignals(
  draft: unknown,
  runtime: Record<string, unknown> | undefined
): string[] {
  const signals = new Set<string>();
  const visible = getRecord(getRecord(draft)["visible"]);
  const textRu = getString(visible["textRu"])?.toLowerCase() ?? "";
  const nameRu = getString(visible["nameRu"])?.toLowerCase() ?? "";
  const markers = getStringArray(visible["markers"]);
  const cardTypes = getStringArray(visible["cardTypes"]);
  const effects = getRuntimeEffects(runtime);

  for (const marker of markers) {
    signals.add(`marker:${marker}`);
  }
  for (const cardType of cardTypes) {
    signals.add(`cardType:${cardType}`);
  }
  for (const effect of effects) {
    signals.add(`effect:${effect}`);
  }
  if (textRu.includes("атака") || markers.includes("attack")) {
    signals.add("surface:attack");
  }
  if (textRu.includes("защит")) {
    signals.add("surface:defense");
  }
  if (textRu.includes("исцели") || textRu.includes("жизни")) {
    signals.add("surface:life");
  }
  if (textRu.includes("чипс")) {
    signals.add("surface:chips");
  }
  if (textRu.includes("уничтож")) {
    signals.add("surface:destroy");
  }
  if (textRu.includes("сброс")) {
    signals.add("surface:discard");
  }
  if (textRu.includes("раскрой")) {
    signals.add("surface:reveal");
  }
  if (textRu.includes("беспредел")) {
    signals.add("surface:mayhem");
  }
  if (textRu.includes("фамильяр")) {
    signals.add("surface:familiar");
  }
  if (nameRu.includes("палоч") || textRu.includes("палоч")) {
    signals.add("surface:wand");
  }
  if (isWandAttackCandidate(nameRu, textRu, effects)) {
    signals.add("cluster:wandAttackCard");
  }

  return Array.from(signals).sort();
}

function collectSuspectedBlockers(
  runtime: Record<string, unknown> | undefined,
  compositionMembership: RuntimeCoverageCompositionMembership[],
  source: RuntimeCoverageSource
): string[] {
  const blockers = new Set<string>();

  if (runtime === undefined) {
    blockers.add("missing runtime mapping");
  }
  if (!hasAppropriateComposition(source, compositionMembership)) {
    blockers.add("missing appropriate deck/stack/pool composition membership");
  }

  for (const mechanic of getStringArray(
    getRecord(getRecord(runtime)["engine"])["unsupportedMechanics"]
  )) {
    blockers.add(`unsupported mechanic: ${mechanic}`);
  }

  return Array.from(blockers).sort();
}

function createMechanicClusters(
  items: RuntimeCoverageInventoryItem[]
): RuntimeCoverageMechanicCluster[] {
  const clusters: RuntimeCoverageMechanicCluster[] = [];
  pushCluster(
    clusters,
    "missing-runtime-cards",
    "Missing Runtime Card Mappings",
    items.filter(
      (item) =>
        item.objectKind === "card" && item.coverageStatus === "missingRuntime"
    ),
    "Draft cards with no current runtime definition.",
    [
      "runtime JSON mapping missing",
      "composition membership may be absent until mapping is selected",
    ],
    [
      "one focused mapping test per promoted shared mechanic before broad card JSON churn",
    ]
  );
  pushCluster(
    clusters,
    "dead-wizard-token-faces",
    "Dead Wizard Token Faces",
    items.filter((item) => item.objectKind === "deadWizardToken"),
    "Dead Wizard Token runtime faces, visible VP penalties, immediate effects, and DWT stack membership.",
    [
      "only neutral/current first token has runtime",
      "token-specific effects need runtime effect mapping",
    ],
    [
      "DWT gain and immediate effect fixture",
      "DWT VP scoring fixture",
      "DWT stack composition fixture",
    ]
  );
  pushCluster(
    clusters,
    "familiar-lifecycle",
    "Familiar Lifecycle",
    items.filter(
      (item) =>
        item.mechanicSignals.includes("surface:familiar") ||
        item.sourceGroupOrTokenKind === "familiar"
    ),
    "Familiar pool, ownership lifecycle, familiar-as-legend modifiers, and familiar-specific defenses/effects.",
    [
      "familiar lifecycle remains partial",
      "wizard property 003 depends on dynamic familiar-as-legend behavior",
    ],
    [
      "setup familiar selection",
      "buy/play familiar",
      "familiar-as-legend effective value interaction",
    ]
  );
  pushCluster(
    clusters,
    "attack-defense-damage",
    "Attack, Defense, and Damage",
    items.filter(
      (item) =>
        item.mechanicSignals.includes("surface:attack") ||
        item.mechanicSignals.includes("surface:defense")
    ),
    "Attack damage, defense windows, target resolution, death, and Trophy credit.",
    [
      "old v0 mappings need focused review",
      "complex redirect/defense branches may remain unsupported",
    ],
    [
      "single-target attack",
      "multi-target attack",
      "defense cost branch",
      "death and Trophy credit",
    ]
  );
  pushCluster(
    clusters,
    "wand-attack-card",
    "Wand Attack Card",
    items.filter((item) =>
      item.mechanicSignals.includes("cluster:wandAttackCard")
    ),
    "Cards that qualify for effects referring to Палочки by visible name plus attack-damage behavior, excluding passive Limp Wand-style cards.",
    [
      "must not use name-only or cardTypes-only matching",
      "missing runtime candidates need attack-damage mapping before qualification",
    ],
    [
      "qualifying wand attack deals attack damage",
      "passive Limp Wand special card does not qualify",
      "owned-wand property replacement path",
    ]
  );
  pushCluster(
    clusters,
    "mayhem-and-market-flow",
    "Mayhem and Market Flow",
    items.filter((item) => item.mechanicSignals.includes("surface:mayhem")),
    "Mayhem and Mega Mayhem reveal/resolve flow, market refill, and event-pile movement.",
    [
      "draft cards without runtime mappings",
      "old first-batch Mayhem mappings need focused review",
    ],
    [
      "main market Mayhem resolve",
      "Legend Mega Mayhem resolve",
      "destroy-event pile movement",
    ]
  );

  return clusters;
}

function pushCluster(
  clusters: RuntimeCoverageMechanicCluster[],
  clusterId: string,
  title: string,
  items: RuntimeCoverageInventoryItem[],
  sharedMechanicSurface: string,
  suspectedBlockers: string[],
  suggestedFocusedTestCoverage: string[]
): void {
  const itemIds = items.map((item) => item.id).sort();
  if (itemIds.length === 0) {
    return;
  }

  clusters.push({
    clusterId,
    title,
    itemIds,
    sharedMechanicSurface,
    suspectedBlockers,
    suggestedFocusedTestCoverage,
  });
}

function summarizeStatuses(
  items: RuntimeCoverageInventoryItem[]
): Record<RuntimeCoverageStatus, number> {
  const summary: Record<RuntimeCoverageStatus, number> = {
    missingRuntime: 0,
    reviewNeeded: 0,
    partial: 0,
    placeholder: 0,
    fullyPlayableCandidate: 0,
  };

  for (const item of items) {
    summary[item.coverageStatus] += 1;
  }

  return summary;
}

function summarizeCrossSourceStatuses(
  items: RuntimeCoverageInventoryItem[]
): Record<
  CrossSourceCoverageStatus | "cardComplete" | "missingRuntime",
  number
> {
  const summary: Record<
    CrossSourceCoverageStatus | "cardComplete" | "missingRuntime",
    number
  > = {
    cardComplete: 0,
    missingRuntime: 0,
    blocked: 0,
    crossSourceComplete: 0,
  };

  for (const item of items) {
    if (item.cardCompletion === "cardComplete") {
      summary.cardComplete += 1;
    } else if (item.cardCompletion === "missingRuntime") {
      summary.missingRuntime += 1;
    }
    summary[item.crossSourceStatus] += 1;
  }

  return summary;
}

function hasAppropriateComposition(
  source: RuntimeCoverageSource,
  compositionMembership: RuntimeCoverageCompositionMembership[]
): boolean {
  return hasAppropriateRuntimeComposition(
    source.objectKind,
    source.sourceGroupOrTokenKind,
    compositionMembership
  );
}

function isWandAttackCandidate(
  nameRu: string,
  textRu: string,
  effects: string[]
): boolean {
  if (!nameRu.includes("палоч")) {
    return false;
  }
  if (
    nameRu.includes("вялая палочка") &&
    !textRu.includes("атака") &&
    !effects.some((effect) => effect.includes("attack"))
  ) {
    return false;
  }

  return (
    effects.some((effect) => effect.includes("attack")) ||
    (textRu.includes("атака") && /урон|урона/.test(textRu))
  );
}

function getRuntimeEffects(
  runtime: Record<string, unknown> | undefined
): string[] {
  const effects = getRecord(getRecord(runtime)["engine"])["effects"];
  if (!Array.isArray(effects)) {
    return [];
  }

  return effects
    .map((effect) => getString(getRecord(effect)["effectId"]))
    .filter((effectId): effectId is string => effectId !== undefined);
}

export function collectRuntimeCoverageFiles(
  rootDir: string,
  inputDirs: readonly string[],
  extension: string
): string[] {
  return inputDirs
    .flatMap((inputDir) => {
      const absoluteInputDir = path.resolve(rootDir, inputDir);
      if (
        !existsSync(absoluteInputDir) ||
        !statSync(absoluteInputDir).isDirectory()
      ) {
        return [];
      }

      return collectFilesRecursive(absoluteInputDir, extension);
    })
    .sort();
}

function collectFilesRecursive(
  absoluteInputDir: string,
  extension: string
): string[] {
  return readdirSync(absoluteInputDir, { withFileTypes: true })
    .flatMap((entry) => {
      const absoluteEntryPath = path.join(absoluteInputDir, entry.name);
      if (entry.name.startsWith("_")) {
        return [];
      }

      if (entry.isDirectory()) {
        return collectFilesRecursive(absoluteEntryPath, extension);
      }

      return entry.isFile() && entry.name.endsWith(extension)
        ? [absoluteEntryPath]
        : [];
    })
    .sort();
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getObjectId(value: unknown): string | undefined {
  const record = getRecord(value);
  return (
    getString(record["id"]) ??
    getString(record["cardId"]) ??
    getString(record["tokenId"])
  );
}

function getCompositionPrefix(filePath: string): string {
  if (filePath.includes(`${path.sep}decks${path.sep}`)) {
    return "deck";
  }
  if (filePath.includes(`${path.sep}stacks${path.sep}`)) {
    return "stack";
  }
  return "pool";
}

function formatInlineIds(ids: string[]): string {
  const visibleIds = ids.slice(0, 20).map(code);
  const remainingCount = ids.length - visibleIds.length;
  return remainingCount === 0
    ? visibleIds.join(", ")
    : `${visibleIds.join(", ")}, ... ${remainingCount} more`;
}

function code(value: string): string {
  return `\`${value}\``;
}

function getRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
