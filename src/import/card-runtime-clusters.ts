import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type CardClusterDecisionStatus = "needsClusterDecision" | "clustered";
export type CardRuntimeStatus = "missingRuntime" | "fullRuntime";

export interface CardClusterDecision {
  cardId: string;
  status: CardClusterDecisionStatus;
  clusterId?: string;
  notes?: string;
}

export interface CardClusterDecisionFile {
  schemaVersion: 1;
  decisions: CardClusterDecision[];
}

export interface CardRuntimeClusterItem {
  cardId: string;
  sourceGroup: CardSourceGroup;
  visibleNameRu?: string;
  visibleTextRu?: string;
  draftTextPath?: string;
  runtimeStatus: CardRuntimeStatus;
  compositionMembership: string[];
  focusedTestRefs: string[];
  decisionStatus: CardClusterDecisionStatus;
  clusterId?: string;
  notes?: string;
}

export interface CardRuntimeClusterReport {
  items: CardRuntimeClusterItem[];
  summary: {
    totalCards: number;
    fullRuntime: number;
    missingRuntime: number;
    needsClusterDecision: number;
    clustered: number;
  };
  generatedAt: string;
}

export interface SyncCardClusterDecisionsResult {
  addedCardIds: string[];
  decisionFilePath: string;
}

interface CardDraftSource {
  sourceGroup: CardSourceGroup;
  draftDir: string;
}

interface CardDraftItem {
  cardId: string;
  sourceGroup: CardSourceGroup;
  visibleNameRu: string | undefined;
  visibleTextRu: string | undefined;
  draftTextPath: string | undefined;
}

type CardSourceGroup = "main" | "legend" | "starter" | "familiar" | "special";

interface CompositionMembership {
  label: string;
  filePath: string;
  derivedFromToken: boolean;
}

interface RuntimeCardRecord {
  cardId: string;
  filePath: string;
  record: Record<string, unknown>;
}

const decisionFilePath =
  ".scratch/krutagidon-card-runtime-clusters/card-cluster-decisions.json";
const matrixOutputPath =
  ".scratch/krutagidon-card-runtime-clusters/card-runtime-cluster-matrix.md";

const cardDraftSources: CardDraftSource[] = [
  {
    sourceGroup: "main",
    draftDir: "data/import/cards/main/drafts",
  },
  {
    sourceGroup: "legend",
    draftDir: "data/import/cards/legend/drafts",
  },
  {
    sourceGroup: "starter",
    draftDir: "data/import/cards/starter/drafts",
  },
  {
    sourceGroup: "familiar",
    draftDir: "data/import/cards/familiar/drafts",
  },
  {
    sourceGroup: "special",
    draftDir: "data/import/cards/special/drafts",
  },
];

export function syncCardClusterDecisions(
  rootDir: string
): SyncCardClusterDecisionsResult {
  const drafts = collectCardDrafts(rootDir);
  const draftIds = new Set(drafts.map((draft) => draft.cardId));
  const existing = readDecisionFile(rootDir);
  validateDecisionFile(existing, draftIds);

  const decisionsById = new Map(
    existing?.decisions.map((decision) => [decision.cardId, decision])
  );
  const addedCardIds = drafts
    .map((draft) => draft.cardId)
    .filter((cardId) => !decisionsById.has(cardId))
    .sort();

  const nextFile: CardClusterDecisionFile = {
    schemaVersion: 1,
    decisions: [
      ...(existing?.decisions ?? []),
      ...addedCardIds.map((cardId) => ({
        cardId,
        status: "needsClusterDecision" as const,
      })),
    ].sort((left, right) => left.cardId.localeCompare(right.cardId)),
  };

  const absolutePath = path.resolve(rootDir, decisionFilePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(nextFile, null, 2)}\n`, "utf8");

  return {
    addedCardIds,
    decisionFilePath,
  };
}

export function createCardRuntimeClusterReport(
  rootDir: string
): CardRuntimeClusterReport {
  const drafts = collectCardDrafts(rootDir);
  const draftIds = new Set(drafts.map((draft) => draft.cardId));
  const decisions = requireDecisionFile(rootDir, draftIds);
  const runtimeCardsById = collectRuntimeCards(rootDir);
  const compositionsById = collectCompositionMembership(rootDir);
  const focusedTestRefsById = collectFocusedTestRefs(rootDir);

  validateRuntimeGuardrails(
    rootDir,
    draftIds,
    runtimeCardsById,
    compositionsById,
    focusedTestRefsById
  );

  const items = drafts
    .map((draft) => {
      const decision = decisions.get(draft.cardId);
      if (decision === undefined) {
        throw new Error(`Missing card cluster decisions: ${draft.cardId}`);
      }

      const runtimeCard = runtimeCardsById.get(draft.cardId);
      const compositionMembership = (compositionsById.get(draft.cardId) ?? [])
        .map((membership) => membership.label)
        .sort();
      const focusedTestRefs = [
        ...(focusedTestRefsById.get(draft.cardId) ?? []),
      ].sort();

      return {
        cardId: draft.cardId,
        sourceGroup: draft.sourceGroup,
        runtimeStatus:
          runtimeCard === undefined
            ? ("missingRuntime" as const)
            : ("fullRuntime" as const),
        compositionMembership,
        focusedTestRefs,
        decisionStatus: decision.status,
        ...(draft.visibleNameRu === undefined
          ? {}
          : { visibleNameRu: draft.visibleNameRu }),
        ...(draft.visibleTextRu === undefined
          ? {}
          : { visibleTextRu: draft.visibleTextRu }),
        ...(draft.draftTextPath === undefined
          ? {}
          : { draftTextPath: draft.draftTextPath }),
        ...(decision.clusterId === undefined
          ? {}
          : { clusterId: decision.clusterId }),
        ...(decision.notes === undefined ? {} : { notes: decision.notes }),
      };
    })
    .sort((left, right) => left.cardId.localeCompare(right.cardId));

  return {
    items,
    summary: {
      totalCards: items.length,
      fullRuntime: items.filter((item) => item.runtimeStatus === "fullRuntime")
        .length,
      missingRuntime: items.filter(
        (item) => item.runtimeStatus === "missingRuntime"
      ).length,
      needsClusterDecision: items.filter(
        (item) => item.decisionStatus === "needsClusterDecision"
      ).length,
      clustered: items.filter((item) => item.decisionStatus === "clustered")
        .length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatCardRuntimeClusterMarkdown(
  report: CardRuntimeClusterReport
): string {
  const lines = [
    "# Card Runtime Cluster Matrix",
    "",
    "Generated from canonical card draft JSON, current runtime card JSON, current compositions, and manual card cluster decisions.",
    "`fullRuntime` requires current runtime card JSON, direct current deck/stack/pool membership, and focused test refs.",
    "`missingRuntime` is normal backlog and is not a process error by itself.",
    "",
    "## Summary",
    "",
    `- total cards: ${report.summary.totalCards}`,
    `- fullRuntime: ${report.summary.fullRuntime}`,
    `- missingRuntime: ${report.summary.missingRuntime}`,
    `- clustered: ${report.summary.clustered}`,
    `- needsClusterDecision: ${report.summary.needsClusterDecision}`,
    "",
    "## Matrix",
    "",
    "| stable ID | source group | visible name | source text | draft text path | runtime status | current compositions | focused tests | cluster decision | cluster ID | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of report.items) {
    lines.push(
      [
        code(item.cardId),
        item.sourceGroup,
        escapeMarkdownTableCell(item.visibleNameRu ?? "none"),
        escapeMarkdownTableCell(item.visibleTextRu ?? "none"),
        code(item.draftTextPath ?? "none"),
        item.runtimeStatus,
        item.compositionMembership.length === 0
          ? "none"
          : item.compositionMembership.map(code).join("<br>"),
        item.focusedTestRefs.length === 0
          ? "none"
          : item.focusedTestRefs.map(code).join("<br>"),
        item.decisionStatus,
        item.clusterId === undefined ? "none" : code(item.clusterId),
        escapeMarkdownTableCell(item.notes ?? "none"),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |")
    );
  }

  lines.push("", `Generated at: ${report.generatedAt}`, "");
  return lines.join("\n");
}

export function writeCardRuntimeClusterMatrix(
  rootDir: string
): CardRuntimeClusterReport {
  const report = createCardRuntimeClusterReport(rootDir);
  const absolutePath = path.resolve(rootDir, matrixOutputPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, formatCardRuntimeClusterMarkdown(report), "utf8");
  return report;
}

function requireDecisionFile(
  rootDir: string,
  draftIds: Set<string>
): Map<string, CardClusterDecision> {
  const parsed = readDecisionFile(rootDir);
  validateDecisionFile(parsed, draftIds);

  const missingCardIds = Array.from(draftIds)
    .filter(
      (cardId) =>
        !parsed?.decisions.some((decision) => decision.cardId === cardId)
    )
    .sort();

  if (parsed === undefined || missingCardIds.length > 0) {
    throw new Error(
      `Missing card cluster decisions: ${missingCardIds.join(", ")}`
    );
  }

  return new Map(
    parsed.decisions.map((decision) => [decision.cardId, decision])
  );
}

function validateDecisionFile(
  parsed: CardClusterDecisionFile | undefined,
  draftIds: Set<string>
): void {
  if (parsed === undefined) {
    return;
  }

  const seen = new Set<string>();
  const unknownCardIds: string[] = [];

  for (const decision of parsed.decisions) {
    if (seen.has(decision.cardId)) {
      throw new Error(`Duplicate card cluster decision: ${decision.cardId}`);
    }
    seen.add(decision.cardId);

    if (!draftIds.has(decision.cardId)) {
      unknownCardIds.push(decision.cardId);
    }

    if (
      decision.status === "clustered" &&
      (decision.clusterId === undefined || decision.clusterId.trim() === "")
    ) {
      throw new Error(
        `Clustered card decision requires clusterId: ${decision.cardId}`
      );
    }
  }

  if (unknownCardIds.length > 0) {
    throw new Error(
      `Card cluster decisions reference non-existent drafts: ${unknownCardIds.sort().join(", ")}`
    );
  }
}

function readDecisionFile(
  rootDir: string
): CardClusterDecisionFile | undefined {
  const absolutePath = path.resolve(rootDir, decisionFilePath);
  if (!safeExists(absolutePath)) {
    return undefined;
  }

  const parsed = getRecord(JSON.parse(readFileSync(absolutePath, "utf8")));
  const rawDecisions = Array.isArray(parsed["decisions"])
    ? parsed["decisions"]
    : [];

  return {
    schemaVersion: 1,
    decisions: rawDecisions.map((rawDecision) => {
      const record = getRecord(rawDecision);
      const clusterId = getOptionalString(record["clusterId"]);
      const notes = getOptionalString(record["notes"]);
      return {
        cardId: requireString(record["cardId"], "decision.cardId"),
        status: requireDecisionStatus(record["status"]),
        ...(clusterId === undefined ? {} : { clusterId }),
        ...(notes === undefined ? {} : { notes }),
      };
    }),
  };
}

function collectCardDrafts(rootDir: string): CardDraftItem[] {
  return cardDraftSources
    .flatMap((source) =>
      collectFiles(rootDir, [source.draftDir], ".json")
        .filter((draftPath) => !path.basename(draftPath).startsWith("_"))
        .map((draftPath) => {
          const draft = getRecord(readJson(draftPath));
          const visible = getRecord(draft["visible"]);
          const sourceRecord = getRecord(draft["source"]);
          return {
            cardId:
              getOptionalString(draft["cardId"]) ??
              path.basename(draftPath, ".json"),
            sourceGroup: source.sourceGroup,
            visibleNameRu: getOptionalString(visible["nameRu"]),
            visibleTextRu: normalizeWhitespace(
              getOptionalString(visible["textRu"])
            ),
            draftTextPath: getOptionalString(sourceRecord["text"]),
          };
        })
    )
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
}

function collectRuntimeCards(rootDir: string): Map<string, RuntimeCardRecord> {
  const runtimeCardsById = new Map<string, RuntimeCardRecord>();

  for (const filePath of collectFiles(rootDir, ["data/cards"], ".json")) {
    const parsed = getRecord(readJson(filePath));
    const cardId = getOptionalString(parsed["cardId"]);
    if (cardId !== undefined) {
      if (runtimeCardsById.has(cardId)) {
        throw new Error(
          `Duplicate runtime card JSON: ${cardId} (${formatRelativePath(
            rootDir,
            filePath
          )})`
        );
      }
      runtimeCardsById.set(cardId, {
        cardId,
        filePath,
        record: parsed,
      });
    }
  }

  return runtimeCardsById;
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
    const label = `${getCompositionPrefix(filePath)}:${getOptionalString(parsed["deckId"]) ?? getOptionalString(parsed["stackId"]) ?? getOptionalString(parsed["poolId"]) ?? path.basename(filePath, ".json")}`;
    const entries = Array.isArray(parsed["entries"]) ? parsed["entries"] : [];

    for (const entry of entries) {
      const record = getRecord(entry);
      const cardId = getOptionalString(record["cardId"]);
      if (cardId === undefined) {
        continue;
      }

      const current = memberships.get(cardId) ?? [];
      current.push({
        label,
        filePath,
        derivedFromToken: false,
      });
      memberships.set(cardId, current);
    }
  }

  for (const filePath of collectFiles(rootDir, ["data/tokens"], ".json")) {
    const parsed = getRecord(readJson(filePath));
    const tokenId =
      getOptionalString(parsed["tokenId"]) ?? path.basename(filePath, ".json");
    const effects = Array.isArray(getRecord(parsed["engine"])["effects"])
      ? (getRecord(parsed["engine"])["effects"] as unknown[])
      : [];

    for (const effect of effects) {
      const record = getRecord(effect);
      if (record["effectId"] !== "replace_starting_card") {
        continue;
      }

      const toDefinitionId = getOptionalString(record["toDefinitionId"]);
      if (toDefinitionId === undefined) {
        continue;
      }

      const current = memberships.get(toDefinitionId) ?? [];
      current.push({
        label: `replacement:${tokenId}`,
        filePath,
        derivedFromToken: true,
      });
      memberships.set(toDefinitionId, current);
    }
  }

  return memberships;
}

function collectFocusedTestRefs(rootDir: string): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const idPattern = /esw2_dbg__[a-z0-9_]+/g;

  for (const filePath of collectFiles(rootDir, ["tests"], ".ts")) {
    const text = readFileSync(filePath, "utf8");
    for (const match of text.matchAll(idPattern)) {
      const cardId = match[0];
      const current = refs.get(cardId) ?? [];
      const relativePath = formatRelativePath(rootDir, filePath);
      if (!current.includes(relativePath)) {
        current.push(relativePath);
      }
      refs.set(cardId, current);
    }
  }

  return refs;
}

function validateRuntimeGuardrails(
  rootDir: string,
  draftIds: Set<string>,
  runtimeCardsById: Map<string, RuntimeCardRecord>,
  compositionsById: Map<string, CompositionMembership[]>,
  focusedTestRefsById: Map<string, string[]>
): void {
  const errors: string[] = [];

  for (const [cardId, runtimeCard] of runtimeCardsById) {
    if (!draftIds.has(cardId)) {
      errors.push(
        `Runtime card JSON without matching draft: ${cardId} (${formatRelativePath(
          rootDir,
          runtimeCard.filePath
        )})`
      );
    }
  }

  for (const [cardId, memberships] of compositionsById) {
    const directMemberships = memberships.filter(
      (membership) => !membership.derivedFromToken
    );
    if (directMemberships.length > 0 && !runtimeCardsById.has(cardId)) {
      errors.push(
        `Composition entries reference missing runtime card definitions: ${cardId} (${directMemberships
          .map((membership) => formatRelativePath(rootDir, membership.filePath))
          .sort()
          .join(", ")})`
      );
    }
  }

  for (const [cardId, runtimeCard] of runtimeCardsById) {
    const reasons = getNonFullRuntimeReasons(
      runtimeCard.record,
      compositionsById.get(cardId) ?? [],
      focusedTestRefsById.get(cardId) ?? []
    );
    if (reasons.length > 0) {
      errors.push(
        `Non-full runtime card JSON is blocked: ${cardId} (${reasons.join(
          "; "
        )}) (${formatRelativePath(rootDir, runtimeCard.filePath)})`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function getNonFullRuntimeReasons(
  runtimeCard: Record<string, unknown>,
  memberships: CompositionMembership[],
  focusedTestRefs: string[]
): string[] {
  const reasons: string[] = [];
  const engine = getRecord(runtimeCard["engine"]);
  const directMemberships = memberships.filter(
    (membership) => !membership.derivedFromToken
  );
  const runtimeMappingStatus =
    getOptionalString(engine["mappingStatus"]) ??
    getOptionalString(runtimeCard["mappingStatus"]);
  const playableInV0 = getOptionalBoolean(engine["playableInV0"]);
  const needsEffectMapping = getOptionalBoolean(engine["needsEffectMapping"]);
  const unsupportedMechanics = getStringArray(engine["unsupportedMechanics"]);

  if (directMemberships.length === 0) {
    reasons.push("missing current deck/stack/pool composition membership");
  }
  if (focusedTestRefs.length === 0) {
    reasons.push("missing focused test refs");
  }
  if (runtimeMappingStatus === "draft") {
    reasons.push("mappingStatus=draft");
  } else if (
    runtimeMappingStatus !== undefined &&
    /placeholder/i.test(runtimeMappingStatus)
  ) {
    reasons.push(`mappingStatus=${runtimeMappingStatus}`);
  }
  if (playableInV0 === false) {
    reasons.push("playableInV0=false");
  }
  if (needsEffectMapping === true) {
    reasons.push("needsEffectMapping=true");
  }
  for (const mechanic of unsupportedMechanics) {
    reasons.push(`unsupported mechanic: ${mechanic}`);
  }

  return reasons;
}

function collectFiles(
  rootDir: string,
  relativeDirs: string[],
  extension: string
): string[] {
  return relativeDirs.flatMap((relativeDir) => {
    const absoluteDir = path.resolve(rootDir, relativeDir);
    if (!safeExists(absoluteDir)) {
      return [];
    }
    return collectFilesRecursive(absoluteDir, extension);
  });
}

function collectFilesRecursive(dirPath: string, extension: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return collectFilesRecursive(absolutePath, extension);
    }
    return absolutePath.endsWith(extension) ? [absolutePath] : [];
  });
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function requireString(value: unknown, label: string): string {
  const stringValue = getOptionalString(value);
  if (stringValue === undefined || stringValue.trim() === "") {
    throw new Error(`Expected string for ${label}`);
  }
  return stringValue;
}

function requireDecisionStatus(value: unknown): CardClusterDecisionStatus {
  if (value === "needsClusterDecision" || value === "clustered") {
    return value;
  }
  throw new Error(`Unsupported card cluster decision status: ${String(value)}`);
}

function getCompositionPrefix(filePath: string): "deck" | "stack" | "pool" {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (normalizedPath.includes("/data/decks/")) {
    return "deck";
  }
  if (normalizedPath.includes("/data/stacks/")) {
    return "stack";
  }
  return "pool";
}

function code(value: string): string {
  return `\`${value}\``;
}

function escapeMarkdownTableCell(value: string): string {
  return normalizeWhitespace(value)?.replaceAll("|", "\\|") ?? "";
}

function normalizeWhitespace(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim();
}

function formatRelativePath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).replaceAll("\\", "/");
}

function safeExists(targetPath: string): boolean {
  try {
    statSync(targetPath);
    return true;
  } catch {
    return false;
  }
}
