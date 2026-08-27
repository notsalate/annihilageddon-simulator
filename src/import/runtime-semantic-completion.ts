import { isPlainRecord } from "../common.js";
import {
  isAttackBearingRuntimeEffectId,
  isAttackSemantics,
} from "../engine/runtime-effect.js";
import {
  createRuntimeCoverageInventory,
  getRuntimeCoverageSnapshot,
  type RuntimeCoverageInventory,
  type RuntimeCoverageInventoryItem,
  type RuntimeCoverageRawRecord,
  type RuntimeCoverageProductionDwtStackData,
  type RuntimeCoverageObjectKind,
} from "./runtime-coverage-inventory.js";
import { type CrossSourceCoveragePlanEntry } from "./cross-source-runtime-coverage.js";

export type RuntimeSemanticCompletionStatus = "PASS" | "BLOCKED";
export type RuntimeSemanticObjectStatus = "complete" | "blocked";

export type RuntimeSemanticCompletionBlockerCode =
  | "duplicate-canonical-id"
  | "duplicate-runtime-id"
  | "missing-canonical-draft"
  | "runtime-without-canonical-draft"
  | "missing-runtime-definition"
  | "composition-without-runtime"
  | "missing-appropriate-composition"
  | "composition-quantity-mismatch"
  | "production-placeholder"
  | "active-pack-unreachable"
  | "required-capability-open"
  | "false-semantic-evidence"
  | "missing-focused-test-evidence"
  | "missing-attack-semantics"
  | "missing-lifecycle-evidence"
  | "production-stack-quantity-mismatch"
  | "production-stack-neutral-entry"
  | "production-stack-dwt003-count"
  | "active-pack-missing-reference";

export type RuntimeLifecycleClass =
  | "direct"
  | "deferred"
  | "ongoing"
  | "pre-respawn"
  | "contextual"
  | "transfer";

export interface RuntimeSemanticCompletionBlocker {
  code: RuntimeSemanticCompletionBlockerCode;
  message: string;
  id?: string;
  objectKind?: RuntimeCoverageObjectKind;
}

export interface RuntimeSemanticCompletionItem {
  id: string;
  objectKind: RuntimeCoverageObjectKind;
  structuralStatus: RuntimeSemanticObjectStatus;
  semanticStatus: RuntimeSemanticObjectStatus;
  semanticComplete: boolean;
  requiredCapabilities: string[];
  evidenceIds: string[];
  lifecycleClasses: RuntimeLifecycleClass[];
  focusedTestEvidence: string[];
  blockerCodes: RuntimeSemanticCompletionBlockerCode[];
  blockers: string[];
}

export interface RuntimeSemanticKindSummary {
  expected: number;
  actual: number;
  structuralComplete: number;
  semanticComplete: number;
}

export interface RuntimeSemanticProductionStackSummary {
  expectedPhysicalCount: 30;
  physicalCount: number;
  namedDefinitionCount: number;
  neutralCount: number;
  dwt003Count: number;
  structuralStatus: RuntimeSemanticObjectStatus;
}

export interface RuntimeSemanticActivePackSummary {
  packId: string | undefined;
  structuralStatus: RuntimeSemanticObjectStatus;
  reachableByKind: Record<RuntimeCoverageObjectKind, number>;
}

export interface RuntimeSemanticCompletionReport {
  status: RuntimeSemanticCompletionStatus;
  structuralStatus: RuntimeSemanticObjectStatus;
  semanticStatus: RuntimeSemanticObjectStatus;
  byKind: Record<RuntimeCoverageObjectKind, RuntimeSemanticKindSummary>;
  productionStack: RuntimeSemanticProductionStackSummary;
  activePack: RuntimeSemanticActivePackSummary;
  items: RuntimeSemanticCompletionItem[];
  blockers: RuntimeSemanticCompletionBlocker[];
  inventory: RuntimeCoverageInventory;
}

type CanonicalRecord = RuntimeCoverageRawRecord & { id: string };
type RuntimeRecord = RuntimeCoverageRawRecord & { id: string };

const expectedCounts: Record<RuntimeCoverageObjectKind, number> = {
  card: 134,
  wizardProperty: 10,
  deadWizardToken: 29,
};

const contextualLifecycleEffectIds: ReadonlySet<string> = new Set([
  "dead_wizard_token_damage_equal_chips",
  "dead_wizard_token_damage_per_discard_legend",
  "dead_wizard_token_damage_equal_highest_hand_cost",
]);

const lifecycleEvidenceByDwt: Readonly<
  Record<string, readonly RuntimeLifecycleClass[]>
> = {
  esw2_dbg__dead_wizard_token_026: [
    "direct",
    "deferred",
    "ongoing",
    "pre-respawn",
  ],
  esw2_dbg__dead_wizard_token_027: ["direct", "deferred", "pre-respawn"],
  esw2_dbg__dead_wizard_token_028: ["direct", "deferred", "pre-respawn"],
};

const requiredLifecycleClassesByDwt: Readonly<
  Record<string, readonly RuntimeLifecycleClass[]>
> = {
  esw2_dbg__dead_wizard_token_013: ["deferred", "contextual"],
  esw2_dbg__dead_wizard_token_014: ["deferred", "contextual"],
  esw2_dbg__dead_wizard_token_025: ["deferred", "contextual"],
};

function toStableRecord(
  record: RuntimeCoverageRawRecord
): Array<RuntimeCoverageRawRecord & { id: string }> {
  return record.id === undefined
    ? []
    : [record as RuntimeCoverageRawRecord & { id: string }];
}

export function createRuntimeSemanticCompletionReport(
  rootDir: string
): RuntimeSemanticCompletionReport {
  const inventory = createRuntimeCoverageInventory(rootDir);
  const snapshot = getRuntimeCoverageSnapshot(inventory);
  const canonicalRecords = snapshot.canonicalRecords.flatMap(toStableRecord);
  const runtimeRecords = snapshot.runtimeRecords.flatMap(toStableRecord);
  const compositionReferences = snapshot.compositionReferences;
  const activePack = snapshot.activePack;
  const plan = snapshot.crossSourcePlan;
  const blockers: RuntimeSemanticCompletionBlocker[] = [];
  const items: RuntimeSemanticCompletionItem[] = [];

  addDuplicateBlockers(canonicalRecords, "duplicate-canonical-id", blockers);
  addDuplicateBlockers(runtimeRecords, "duplicate-runtime-id", blockers);

  for (const [id, records] of groupById(canonicalRecords)) {
    if (records.length !== 1) {
      continue;
    }
    const canonical = records[0];
    if (canonical === undefined) {
      continue;
    }
    const runtime = runtimeRecords.find((candidate) => candidate.id === id);
    const inventoryItem = findInventoryItem(
      inventory.items,
      id,
      canonical.objectKind
    );
    const itemBlockers: RuntimeSemanticCompletionBlocker[] = [];

    if (runtime === undefined) {
      itemBlockers.push(
        itemBlocker(
          "missing-runtime-definition",
          `canonical ${canonical.objectKind} ${id} has no runtime definition`,
          canonical
        )
      );
    }
    if (inventoryItem?.missingAppropriateComposition === true) {
      itemBlockers.push(
        itemBlocker(
          "missing-appropriate-composition",
          `canonical ${canonical.objectKind} ${id} is not in an appropriate composition`,
          canonical
        )
      );
    }
    if (!activePack.reachableIds.has(id)) {
      itemBlockers.push(
        itemBlocker(
          "active-pack-unreachable",
          `canonical ${canonical.objectKind} ${id} is not reachable from the active pack`,
          canonical
        )
      );
    }
    if (runtime !== undefined) {
      itemBlockers.push(...validateRuntimeShape(canonical, runtime));
    }

    const semantic = evaluateSemanticEvidence({
      canonical,
      runtime,
      inventoryItem,
      planEntry: plan.get(id),
    });
    itemBlockers.push(...semantic.blockers);
    blockers.push(...itemBlockers);

    const structuralBlockers = itemBlockers.filter((blocker) =>
      isStructuralBlocker(blocker.code)
    );
    const semanticBlockers = itemBlockers.filter((blocker) =>
      isSemanticBlocker(blocker.code)
    );
    items.push({
      id,
      objectKind: canonical.objectKind,
      structuralStatus:
        structuralBlockers.length === 0 ? "complete" : "blocked",
      semanticStatus: semanticBlockers.length === 0 ? "complete" : "blocked",
      semanticComplete: semanticBlockers.length === 0,
      requiredCapabilities: semantic.requiredCapabilities,
      evidenceIds: semantic.evidenceIds,
      lifecycleClasses: semantic.lifecycleClasses,
      focusedTestEvidence: semantic.focusedTestEvidence,
      blockerCodes: uniqueBlockerCodes(itemBlockers),
      blockers: uniqueMessages(itemBlockers),
    });
  }

  for (const runtime of runtimeRecords) {
    if (
      canonicalRecords.some(
        (canonical) =>
          canonical.id === runtime.id &&
          canonical.objectKind === runtime.objectKind
      )
    ) {
      continue;
    }
    if (!isNeutralRuntimeId(runtime.id)) {
      blockers.push({
        code: "runtime-without-canonical-draft",
        message: `active runtime ${runtime.id} has no canonical draft`,
        id: runtime.id,
        objectKind: runtime.objectKind,
      });
    }
  }

  for (const reference of compositionReferences) {
    if (!runtimeRecords.some((runtime) => runtime.id === reference.id)) {
      blockers.push({
        code: "composition-without-runtime",
        message: `composition ${reference.filePath} references missing runtime ${reference.id}`,
        id: reference.id,
      });
    }
  }
  for (const missingReference of activePack.missingReferences) {
    blockers.push({
      code: "active-pack-missing-reference",
      message: missingReference,
    });
  }

  const productionStack = collectProductionStackSummary(
    snapshot.productionDwtStack
  );
  blockers.push(...productionStack.blockers);

  const byKind = createKindSummaries(items);
  const structuralStatus =
    blockers.some((blocker) => isStructuralBlocker(blocker.code)) ||
    Object.values(byKind).some(
      (summary) => summary.expected !== summary.actual
    ) ||
    productionStack.summary.structuralStatus === "blocked" ||
    activePack.structuralStatus === "blocked"
      ? "blocked"
      : "complete";
  const semanticStatus =
    blockers.some((blocker) => isSemanticBlocker(blocker.code)) ||
    Object.values(byKind).some(
      (summary) =>
        summary.actual !== summary.expected ||
        summary.semanticComplete !== summary.expected
    )
      ? "blocked"
      : "complete";

  return {
    status:
      structuralStatus === "complete" && semanticStatus === "complete"
        ? "PASS"
        : "BLOCKED",
    structuralStatus,
    semanticStatus,
    byKind,
    productionStack: productionStack.summary,
    activePack: {
      packId: activePack.packId,
      structuralStatus: activePack.structuralStatus,
      reachableByKind: countReachableByKind(
        activePack.reachableIds,
        canonicalRecords
      ),
    },
    items: items.sort((left, right) => left.id.localeCompare(right.id)),
    blockers: uniqueBlockers(blockers),
    inventory,
  };
}

export function formatRuntimeSemanticCompletionMarkdown(
  report: RuntimeSemanticCompletionReport
): string {
  const lines = [
    "# Runtime Semantic Completion Audit",
    "",
    `- status: ${report.status}`,
    "",
    "## Structural status",
    "",
    `- overall: ${report.structuralStatus}`,
    ...formatKindSummaryLines(report.byKind, "structuralComplete"),
    "",
    "## Semantic status",
    "",
    `- overall: ${report.semanticStatus}`,
    ...formatKindSummaryLines(report.byKind, "semanticComplete"),
    "",
    "## Production DWT composition",
    "",
    `- production physical DWT: ${report.productionStack.physicalCount}`,
    `- named definitions: ${report.productionStack.namedDefinitionCount}`,
    `- neutral entries: ${report.productionStack.neutralCount}`,
    `- DWT-003 copies: ${report.productionStack.dwt003Count}`,
    `- structural status: ${report.productionStack.structuralStatus}`,
    "",
    "## Active pack",
    "",
    `- packId: ${report.activePack.packId ?? "missing"}`,
    `- structural status: ${report.activePack.structuralStatus}`,
    `- reachable cards: ${report.activePack.reachableByKind.card}`,
    `- reachable wizard properties: ${report.activePack.reachableByKind.wizardProperty}`,
    `- reachable DWT: ${report.activePack.reachableByKind.deadWizardToken}`,
    "",
    "## Blockers",
    "",
  ];

  if (report.blockers.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...report.blockers.map(
        (blocker) =>
          `- [${blocker.code}]${blocker.id === undefined ? "" : ` ${blocker.id}:`} ${blocker.message}`
      )
    );
  }

  lines.push("", "## Items", "");
  lines.push(
    "| stable ID | object kind | structural | semantic | required capabilities | evidence | focused tests | lifecycle classes | blockers |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const item of report.items) {
    lines.push(
      `| \`${item.id}\` | ${item.objectKind} | ${item.structuralStatus} | ${item.semanticStatus} | ${item.requiredCapabilities.length} | ${item.evidenceIds.length} | ${item.focusedTestEvidence.length} | ${item.lifecycleClasses.join(", ") || "none"} | ${item.blockers.join("<br>") || "none"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function evaluateSemanticEvidence(input: {
  canonical: CanonicalRecord;
  runtime: RuntimeRecord | undefined;
  inventoryItem: RuntimeCoverageInventoryItem | undefined;
  planEntry: CrossSourceCoveragePlanEntry | undefined;
}): {
  requiredCapabilities: string[];
  evidenceIds: string[];
  lifecycleClasses: RuntimeLifecycleClass[];
  focusedTestEvidence: string[];
  blockers: RuntimeSemanticCompletionBlocker[];
} {
  const blockers: RuntimeSemanticCompletionBlocker[] = [];
  const requiredCapabilities = input.planEntry?.requiredCapabilities ?? [];
  const evidenceIds =
    input.planEntry?.semanticMappings
      .map((mapping) => mapping.evidenceId)
      .filter((id) => id !== undefined) ?? [];
  const focusedTestEvidence = [...(input.inventoryItem?.focusedTestRefs ?? [])];

  if (input.inventoryItem === undefined) {
    blockers.push(
      itemBlocker(
        "missing-canonical-draft",
        `inventory has no canonical item for ${input.canonical.id}`,
        input.canonical
      )
    );
  }

  if (input.inventoryItem?.crossSourceStatus !== "crossSourceComplete") {
    const blockerCodes = new Set(
      input.inventoryItem?.crossSourceBlockerCodes.map(
        (blocker) => blocker.code
      )
    );
    const code =
      blockerCodes.has("required-capability-uncovered") ||
      blockerCodes.has("unresolved-capability")
        ? "required-capability-open"
        : "false-semantic-evidence";
    blockers.push(
      itemBlocker(
        code,
        `semantic evidence for ${input.canonical.objectKind} ${input.canonical.id} is blocked by the cross-source audit`,
        input.canonical
      )
    );
  }
  if (focusedTestEvidence.length === 0) {
    blockers.push(
      itemBlocker(
        "missing-focused-test-evidence",
        `${input.canonical.objectKind} ${input.canonical.id} has no executable focused semantic test evidence`,
        input.canonical
      )
    );
  }
  if (input.canonical.objectKind === "card" && input.runtime !== undefined) {
    blockers.push(...validateCardSemanticShape(input.canonical, input.runtime));
  }

  const lifecycleClasses =
    input.canonical.objectKind === "deadWizardToken"
      ? getDwtLifecycleClasses(input.canonical.id, input.runtime)
      : [];
  const missingLifecycleClasses =
    input.canonical.objectKind === "deadWizardToken"
      ? (requiredLifecycleClassesByDwt[input.canonical.id] ?? []).filter(
          (lifecycleClass) => !lifecycleClasses.includes(lifecycleClass)
        )
      : [];
  if (
    input.canonical.objectKind === "deadWizardToken" &&
    (lifecycleClasses.length === 0 || missingLifecycleClasses.length > 0)
  ) {
    blockers.push(
      itemBlocker(
        "missing-lifecycle-evidence",
        `DWT ${input.canonical.id} is missing lifecycle evidence: ${
          missingLifecycleClasses.join(", ") || "applicable class"
        }`,
        input.canonical
      )
    );
  }

  return {
    requiredCapabilities: [...requiredCapabilities],
    evidenceIds: [...new Set(evidenceIds)],
    lifecycleClasses,
    focusedTestEvidence,
    blockers,
  };
}

function validateCardSemanticShape(
  canonical: CanonicalRecord,
  runtime: RuntimeRecord
): RuntimeSemanticCompletionBlocker[] {
  const blockers: RuntimeSemanticCompletionBlocker[] = [];
  const engine = getRecord(runtime.value["engine"]);
  const effects = getArray(engine["effects"]);
  for (const effect of effects) {
    const record = getRecord(effect);
    const effectId = getString(record["effectId"]);
    if (
      effectId !== undefined &&
      isAttackBearingRuntimeEffectId(effectId) &&
      !isAttackSemantics(record["attackSemantics"])
    ) {
      blockers.push(
        itemBlocker(
          "missing-attack-semantics",
          `card ${canonical.id} attack effect ${effectId} has no valid AttackSemantics`,
          canonical
        )
      );
    }
  }
  return blockers;
}

function validateRuntimeShape(
  canonical: CanonicalRecord,
  runtime: RuntimeRecord
): RuntimeSemanticCompletionBlocker[] {
  const blockers: RuntimeSemanticCompletionBlocker[] = [];
  const value = runtime.value;
  if (canonical.objectKind === "deadWizardToken") {
    if (!Array.isArray(value["effects"])) {
      blockers.push(
        itemBlocker(
          "production-placeholder",
          `runtime ${canonical.id} has no token effect definition`,
          canonical
        )
      );
    }
  } else {
    const engine = getRecord(value["engine"]);
    const mappingStatus =
      getString(engine["mappingStatus"]) ?? getString(value["mappingStatus"]);
    const playableInV0 = engine["playableInV0"];
    const unsupportedMechanics = getStringArray(engine["unsupportedMechanics"]);
    if (
      mappingStatus === undefined ||
      /placeholder|partial|draft|unsupported/iu.test(mappingStatus) ||
      playableInV0 === false ||
      unsupportedMechanics.length > 0
    ) {
      blockers.push(
        itemBlocker(
          "production-placeholder",
          `runtime ${canonical.id} is not a production-complete definition`,
          canonical
        )
      );
    }
  }
  if (
    canonical.objectKind === "card" &&
    getString(value["cardId"]) !== canonical.id
  ) {
    blockers.push(
      itemBlocker(
        "false-semantic-evidence",
        `runtime card ID does not match canonical card ID for ${canonical.id}`,
        canonical
      )
    );
  }
  if (
    canonical.objectKind !== "card" &&
    getString(value["tokenId"]) !== canonical.id
  ) {
    blockers.push(
      itemBlocker(
        "false-semantic-evidence",
        `runtime token ID does not match canonical token ID for ${canonical.id}`,
        canonical
      )
    );
  }
  return blockers;
}

function getDwtLifecycleClasses(
  id: string,
  runtime: RuntimeRecord | undefined
): RuntimeLifecycleClass[] {
  const effects = getArray(
    runtime === undefined ? undefined : runtime.value["effects"]
  );
  const classes = new Set<RuntimeLifecycleClass>();
  if (
    effects.some((effect) =>
      ["activation", "scoring"].includes(
        getString(getRecord(effect)["timing"]) ?? ""
      )
    )
  ) {
    classes.add("direct");
  }
  if (
    effects.some(
      (effect) =>
        getString(getRecord(effect)["timing"]) === "onDeadWizardTokenFace"
    )
  ) {
    classes.add("deferred");
  }
  if (
    effects.some((effect) =>
      ["whileControlled", "attackReplacement"].includes(
        getString(getRecord(effect)["timing"]) ?? ""
      )
    )
  ) {
    classes.add("ongoing");
  }
  if (
    effects.some((effect) =>
      contextualLifecycleEffectIds.has(
        getString(getRecord(effect)["effectId"]) ?? ""
      )
    )
  ) {
    classes.add("contextual");
  }
  if (
    effects.some((effect) => {
      const effectId = getString(getRecord(effect)["effectId"]) ?? "";
      return /(?:transfer|exchange)/iu.test(effectId);
    })
  ) {
    classes.add("transfer");
  }
  for (const lifecycleClass of lifecycleEvidenceByDwt[id] ?? []) {
    classes.add(lifecycleClass);
  }
  return [...classes];
}

function collectProductionStackSummary(
  stack: RuntimeCoverageProductionDwtStackData
): {
  summary: RuntimeSemanticProductionStackSummary;
  blockers: RuntimeSemanticCompletionBlocker[];
} {
  const entries = stack.entries;
  const counts = new Map<string, number>();
  const blockers: RuntimeSemanticCompletionBlocker[] = [];
  for (const entry of entries) {
    const record = getRecord(entry);
    const id = getString(record["tokenId"]);
    const count = getNumber(record["count"]);
    if (
      id === undefined ||
      count === undefined ||
      count < 0 ||
      !Number.isInteger(count)
    ) {
      blockers.push({
        code: "production-stack-quantity-mismatch",
        message: "production DWT stack contains an invalid token entry",
      });
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + count);
  }
  const physicalCount = [...counts.values()].reduce(
    (total, count) => total + count,
    0
  );
  const neutralCount = [...counts.entries()]
    .filter(([id]) => /neutral/iu.test(id))
    .reduce((total, [, count]) => total + count, 0);
  const namedDefinitionCount = [...counts.keys()].filter(
    (id) => !/neutral/iu.test(id)
  ).length;
  const dwt003Count = counts.get("esw2_dbg__dead_wizard_token_003") ?? 0;
  if (physicalCount !== 30) {
    blockers.push({
      code: "production-stack-quantity-mismatch",
      message: `production DWT stack has ${physicalCount} physical entries instead of 30`,
    });
  }
  if (neutralCount !== 0) {
    blockers.push({
      code: "production-stack-neutral-entry",
      message: "production DWT stack contains a neutral placeholder",
    });
  }
  if (namedDefinitionCount !== 29) {
    blockers.push({
      code: "production-stack-quantity-mismatch",
      message: `production DWT stack has ${namedDefinitionCount} named definitions instead of 29`,
    });
  }
  if (dwt003Count !== 2) {
    blockers.push({
      code: "production-stack-dwt003-count",
      message: `production DWT stack has ${dwt003Count} copies of DWT-003 instead of 2`,
    });
  }
  return {
    summary: {
      expectedPhysicalCount: 30,
      physicalCount,
      namedDefinitionCount,
      neutralCount,
      dwt003Count,
      structuralStatus: blockers.length === 0 ? "complete" : "blocked",
    },
    blockers,
  };
}

function isNeutralRuntimeId(id: string): boolean {
  return /(?:^|_)neutral$/iu.test(id);
}

function createKindSummaries(
  items: readonly RuntimeSemanticCompletionItem[]
): Record<RuntimeCoverageObjectKind, RuntimeSemanticKindSummary> {
  const result = {} as Record<
    RuntimeCoverageObjectKind,
    RuntimeSemanticKindSummary
  >;
  for (const objectKind of [
    "card",
    "wizardProperty",
    "deadWizardToken",
  ] as const) {
    const kindItems = items.filter((item) => item.objectKind === objectKind);
    result[objectKind] = {
      expected: expectedCounts[objectKind],
      actual: kindItems.length,
      structuralComplete: kindItems.filter(
        (item) => item.structuralStatus === "complete"
      ).length,
      semanticComplete: kindItems.filter((item) => item.semanticComplete)
        .length,
    };
  }
  return result;
}

function formatKindSummaryLines(
  byKind: Record<RuntimeCoverageObjectKind, RuntimeSemanticKindSummary>,
  field: "structuralComplete" | "semanticComplete"
): string[] {
  return (["card", "wizardProperty", "deadWizardToken"] as const).map(
    (objectKind) =>
      `- ${objectKind}: ${field}: ${byKind[objectKind][field]} / ${byKind[objectKind].expected}`
  );
}

function countReachableByKind(
  reachableIds: ReadonlySet<string>,
  canonicalRecords: readonly CanonicalRecord[]
): Record<RuntimeCoverageObjectKind, number> {
  const result: Record<RuntimeCoverageObjectKind, number> = {
    card: 0,
    wizardProperty: 0,
    deadWizardToken: 0,
  };
  for (const record of canonicalRecords) {
    if (reachableIds.has(record.id)) {
      result[record.objectKind] += 1;
    }
  }
  return result;
}

function addDuplicateBlockers(
  records: readonly { id: string; objectKind: RuntimeCoverageObjectKind }[],
  code: "duplicate-canonical-id" | "duplicate-runtime-id",
  blockers: RuntimeSemanticCompletionBlocker[]
): void {
  for (const [id, grouped] of groupById(records)) {
    if (grouped.length > 1) {
      blockers.push({
        code,
        message: `${code === "duplicate-canonical-id" ? "canonical" : "runtime"} ID ${id} appears ${grouped.length} times`,
        id,
        ...(grouped[0]?.objectKind === undefined
          ? {}
          : { objectKind: grouped[0].objectKind }),
      });
    }
  }
}

function groupById<T extends { id: string }>(
  records: readonly T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const current = grouped.get(record.id) ?? [];
    current.push(record);
    grouped.set(record.id, current);
  }
  return grouped;
}

function findInventoryItem(
  items: readonly RuntimeCoverageInventoryItem[],
  id: string,
  objectKind: RuntimeCoverageObjectKind
): RuntimeCoverageInventoryItem | undefined {
  return items.find((item) => item.id === id && item.objectKind === objectKind);
}

function itemBlocker(
  code: RuntimeSemanticCompletionBlockerCode,
  message: string,
  record: Pick<CanonicalRecord, "id" | "objectKind">
): RuntimeSemanticCompletionBlocker {
  return { code, message, id: record.id, objectKind: record.objectKind };
}

function isStructuralBlocker(
  code: RuntimeSemanticCompletionBlockerCode
): boolean {
  return [
    "duplicate-canonical-id",
    "duplicate-runtime-id",
    "missing-canonical-draft",
    "runtime-without-canonical-draft",
    "missing-runtime-definition",
    "composition-without-runtime",
    "missing-appropriate-composition",
    "composition-quantity-mismatch",
    "production-placeholder",
    "active-pack-unreachable",
    "production-stack-quantity-mismatch",
    "production-stack-neutral-entry",
    "production-stack-dwt003-count",
    "active-pack-missing-reference",
  ].includes(code);
}

function isSemanticBlocker(
  code: RuntimeSemanticCompletionBlockerCode
): boolean {
  return !isStructuralBlocker(code);
}

function uniqueBlockerCodes(
  blockers: readonly RuntimeSemanticCompletionBlocker[]
): RuntimeSemanticCompletionBlockerCode[] {
  return [...new Set(blockers.map((blocker) => blocker.code))].sort();
}

function uniqueMessages(
  blockers: readonly RuntimeSemanticCompletionBlocker[]
): string[] {
  return [...new Set(blockers.map((blocker) => blocker.message))].sort();
}

function uniqueBlockers(
  blockers: readonly RuntimeSemanticCompletionBlocker[]
): RuntimeSemanticCompletionBlocker[] {
  return Array.from(
    new Map(
      blockers.map((blocker) => [
        `${blocker.code}\u0000${blocker.id ?? ""}\u0000${blocker.message}`,
        blocker,
      ])
    ).values()
  ).sort((left, right) =>
    `${left.code}\u0000${left.id ?? ""}\u0000${left.message}`.localeCompare(
      `${right.code}\u0000${right.id ?? ""}\u0000${right.message}`
    )
  );
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (candidate): candidate is string => typeof candidate === "string"
      )
    : [];
}
