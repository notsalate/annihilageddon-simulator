import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

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
  generatedAt: string;
}

interface DraftSourceConfig {
  objectKind: RuntimeCoverageObjectKind;
  sourceGroupOrTokenKind: string;
  draftDir: string;
  runtimeDirs: string[];
}

interface CompositionMembership {
  label: string;
  role: string | undefined;
  entryKind: "card" | "token";
}

const draftSources: DraftSourceConfig[] = [
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
    runtimeDirs: ["data/tokens"],
  },
  {
    objectKind: "deadWizardToken",
    sourceGroupOrTokenKind: "deadWizardToken",
    draftDir: "data/import/tokens/dead-wizard-token/drafts",
    runtimeDirs: ["data/tokens"],
  },
];

export function createRuntimeCoverageInventory(
  rootDir: string
): RuntimeCoverageInventory {
  const runtimeById = collectRuntimeObjects(rootDir);
  const compositionsById = collectCompositionMembership(rootDir);
  const focusedTestRefsById = collectFocusedTestRefs(rootDir);
  const items = draftSources
    .flatMap((source) =>
      collectDraftItems(
        rootDir,
        source,
        runtimeById,
        compositionsById,
        focusedTestRefsById
      )
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const clusters = createMechanicClusters(items);
  const summary = summarizeStatuses(items);

  return {
    items,
    clusters,
    recommendedNextIssueOrder: clusters.map((cluster) => cluster.clusterId),
    summary,
    generatedAt: new Date().toISOString(),
  };
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
    "| stable ID | object kind | source group/token kind | draft | runtime | composition membership | legacy v0 facts | status | mechanic signals | suspected blockers |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

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
  source: DraftSourceConfig,
  runtimeById: Map<string, Record<string, unknown>>,
  compositionsById: Map<string, CompositionMembership[]>,
  focusedTestRefsById: Map<string, string[]>
): RuntimeCoverageInventoryItem[] {
  return collectFiles(rootDir, [source.draftDir], ".json").map((draftPath) => {
    const draft = readJson(draftPath);
    const id = getObjectId(draft) ?? path.basename(draftPath, ".json");
    const runtime = runtimeById.get(id);
    const compositionMembership = compositionsById.get(id) ?? [];
    const focusedTestRefs = focusedTestRefsById.get(id) ?? [];
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
    };
  });
}

function collectRuntimeObjects(
  rootDir: string
): Map<string, Record<string, unknown>> {
  const runtimeById = new Map<string, Record<string, unknown>>();

  for (const filePath of collectFiles(
    rootDir,
    ["data/cards", "data/tokens"],
    ".json"
  )) {
    const parsed = readJson(filePath);
    const id = getObjectId(parsed);
    if (id !== undefined) {
      runtimeById.set(id, getRecord(parsed));
    }
  }

  return runtimeById;
}

function collectCompositionMembership(
  rootDir: string
): Map<string, CompositionMembership[]> {
  const memberships = new Map<string, CompositionMembership[]>();
  const compositionFiles = collectFiles(
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

      const current = memberships.get(id) ?? [];
      current.push({
        label,
        role,
        entryKind: cardId === undefined ? "token" : "card",
      });
      memberships.set(id, current);
    }
  }

  const tokenFiles = collectFiles(rootDir, ["data/tokens"], ".json");
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
      });
      memberships.set(toDefinitionId, current);
    }
  }

  return memberships;
}

function collectFocusedTestRefs(rootDir: string): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const testFiles = collectFiles(rootDir, ["tests"], ".ts");
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
  compositionMembership: CompositionMembership[],
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
  compositionMembership: CompositionMembership[],
  source: DraftSourceConfig
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

function hasAppropriateComposition(
  source: DraftSourceConfig,
  compositionMembership: CompositionMembership[]
): boolean {
  if (compositionMembership.length === 0) {
    return false;
  }

  return compositionMembership.some((membership) => {
    if (source.objectKind === "deadWizardToken") {
      return (
        membership.entryKind === "token" &&
        membership.role === "deadWizardTokens"
      );
    }
    if (source.objectKind === "wizardProperty") {
      return (
        membership.entryKind === "token" &&
        membership.role === "wizardProperties"
      );
    }
    if (source.sourceGroupOrTokenKind === "main") {
      return membership.role === "mainDeck";
    }
    if (source.sourceGroupOrTokenKind === "legend") {
      return membership.role === "legendDeck";
    }
    if (source.sourceGroupOrTokenKind === "starter") {
      return (
        membership.role === "starterDeck" ||
        membership.role === "starterDeckTemplate" ||
        membership.role === "starterReplacement"
      );
    }
    if (source.sourceGroupOrTokenKind === "familiar") {
      return membership.role === "familiarPool";
    }
    if (source.sourceGroupOrTokenKind === "special") {
      return (
        membership.role === "limpWandStack" ||
        membership.role === "wildMagicStack"
      );
    }
    return false;
  });
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

function collectFiles(
  rootDir: string,
  inputDirs: string[],
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
