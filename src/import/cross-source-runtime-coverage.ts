import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isPlainRecord } from "../common.js";
import { validateRuntimeEffectCatalogPayload } from "../engine/effect-runtime-registry.js";
import { isRuntimeEffectId } from "../engine/runtime-effect.js";

export type CrossSourceObjectKind =
  | "card"
  | "wizardProperty"
  | "deadWizardToken";

export type CrossSourceCoverageStatus = "blocked" | "crossSourceComplete";

export type CrossSourceCapabilityId = `capability:${string}`;
export type CrossSourceEvidenceId = `evidence:${string}`;

export type CrossSourceExecutionSeam =
  | "applyAction"
  | "calculateEffectiveCardCost"
  | "calculateEffectiveCardVictoryPoints"
  | "calculateEffectivePlayerMaxLife"
  | "createGameScenario"
  | "gainDeadWizardToken"
  | "initializeGame"
  | "runMarketFlow"
  | "scoreGame";

export type CrossSourceBlockerCode =
  | "missing-coverage-plan"
  | "object-kind-mismatch"
  | "missing-primary-mechanic-cluster"
  | "legacy-unresolved-mechanic"
  | "required-capability-uncovered"
  | "unresolved-capability"
  | "invalid-capability-id"
  | "invalid-evidence-id"
  | "duplicate-capability-id"
  | "duplicate-evidence-id"
  | "mapping-capability-unrequired"
  | "unmapped-canonical-draft-point"
  | "stale-canonical-draft-point"
  | "missing-runtime-reference"
  | "missing-focused-test-reference"
  | "runtime-field-mismatch"
  | "runtime-effect-missing"
  | "runtime-effect-fields-mismatch"
  | "focused-test-reference-invalid"
  | "focused-test-not-found"
  | "execution-evidence-missing"
  | "execution-object-kind-mismatch"
  | "execution-seam-missing"
  | "execution-seam-not-allowed"
  | "execution-action-path-missing"
  | "execution-action-path-not-allowed"
  | "execution-subject-not-used"
  | "observation-evidence-missing"
  | "observation-assertion-missing"
  | "missing-composition"
  | "missing-canonical-quantity"
  | "composition-count-missing"
  | "composition-quantity-mismatch"
  | "missing-runtime"
  | "runtime-card-id-mismatch"
  | "runtime-kind-mismatch"
  | "runtime-no-effects"
  | "invalid-runtime-effect-id"
  | "runtime-source-timing-policy"
  | "legacy-unclassified";

export interface CrossSourceBlocker {
  code: CrossSourceBlockerCode;
  message: string;
  capabilityId?: CrossSourceCapabilityId | undefined;
  evidenceId?: CrossSourceEvidenceId | undefined;
}

export type CrossSourceTestSubject =
  | { kind: "binding"; name: string }
  | { kind: "literal"; value: string };

export interface CrossSourceExecutionEvidence {
  seam: CrossSourceExecutionSeam;
  objectKind: CrossSourceObjectKind;
  subject: CrossSourceTestSubject;
}

export interface CrossSourceObservationEvidence {
  kind: "assertion";
  target: string;
}

export interface CrossSourceCoveragePlanEntry {
  id: string;
  objectKind: CrossSourceObjectKind;
  primaryMechanicCluster: string;
  semanticMappings: CrossSourceSemanticMapping[];
  requiredCapabilities?: CrossSourceCapabilityId[] | undefined;
  unresolvedCapabilities?: CrossSourceCapabilityId[] | undefined;
  /** @deprecated Only accepted for schemaVersion 1 fixture plans. */
  unresolvedMechanics?: string[] | undefined;
  /** @internal */
  evidenceMode?: "legacy" | "typed" | undefined;
}

/** The merged coverage plan preserves duplicate IDs so the audit can block them. */
export class CrossSourceCoveragePlan extends Map<
  string,
  CrossSourceCoveragePlanEntry
> {
  readonly duplicateIds = new Set<string>();
}

export interface CrossSourceSemanticMapping {
  capabilityId?: CrossSourceCapabilityId | undefined;
  evidenceId?: CrossSourceEvidenceId | undefined;
  draftPoint: CrossSourceDraftPoint;
  runtimeRefs: CrossSourceRuntimeRef[];
  testRefs: CrossSourceTestRef[];
}

type CrossSourceRuntimeValue =
  | null
  | string
  | number
  | boolean
  | CrossSourceRuntimeValue[]
  | { [key: string]: CrossSourceRuntimeValue };

export interface CrossSourceDraftPoint {
  path: string;
  value: CrossSourceRuntimeValue;
}

export interface CrossSourceEffectRuntimeRef {
  kind: "effect";
  effectId: string;
  timing: string;
  fields: Record<string, CrossSourceRuntimeValue>;
}

export interface CrossSourceFieldRuntimeRef {
  kind: "field";
  path: string;
  value: CrossSourceRuntimeValue;
}

export type CrossSourceRuntimeRef =
  | CrossSourceEffectRuntimeRef
  | CrossSourceFieldRuntimeRef;

export interface CrossSourceTestRef {
  file: string;
  name: string;
  execution?: CrossSourceExecutionEvidence | undefined;
  observation?: CrossSourceObservationEvidence | undefined;
}

export interface CrossSourceCompositionMembership {
  role: string | undefined;
  entryKind: "card" | "token";
  count: number | undefined;
}

export interface CrossSourceCoverageEvaluation {
  status: CrossSourceCoverageStatus;
  primaryMechanicCluster: string | undefined;
  blockers: string[];
  blockerCodes: CrossSourceBlocker[];
}

const planPaths = [
  "config/runtime-coverage/cross-source-mechanics.json",
  "config/runtime-coverage/card-semantic-evidence.json",
] as const;

export function readCrossSourceCoveragePlan(
  rootDir: string
): CrossSourceCoveragePlan {
  const plan = new CrossSourceCoveragePlan();

  for (const planPath of planPaths) {
    const absolutePath = path.resolve(rootDir, planPath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const parsed = getRecord(JSON.parse(readFileSync(absolutePath, "utf8")));
    const typedEvidence = (getNumber(parsed["schemaVersion"]) ?? 0) >= 2;
    const entries = Array.isArray(parsed["entries"]) ? parsed["entries"] : [];
    for (const entry of entries) {
      const decoded = decodePlanEntry(entry, typedEvidence);
      if (decoded !== undefined) {
        if (plan.has(decoded.id)) {
          plan.duplicateIds.add(decoded.id);
          continue;
        }
        plan.set(decoded.id, decoded);
      }
    }
  }

  return plan;
}

export function evaluateCrossSourceCoverage(input: {
  rootDir: string;
  id: string;
  objectKind: CrossSourceObjectKind;
  sourceGroupOrTokenKind: string;
  draft: unknown;
  runtime: Record<string, unknown> | undefined;
  compositionMembership: CrossSourceCompositionMembership[];
  planEntry: CrossSourceCoveragePlanEntry | undefined;
}): CrossSourceCoverageEvaluation {
  const planEntry = input.planEntry;
  if (planEntry === undefined) {
    const blockers = [
      createBlocker(
        "missing-coverage-plan",
        "missing cross-source mechanic mapping"
      ),
    ];
    return {
      status: "blocked",
      primaryMechanicCluster: undefined,
      blockers: ["missing cross-source mechanic mapping"],
      blockerCodes: blockers,
    };
  }

  const blockers = new Set<string>();
  const typedBlockers: CrossSourceBlocker[] = [];
  if (planEntry.objectKind !== input.objectKind) {
    blockers.add(
      `cross-source mapping object kind ${planEntry.objectKind} does not match ${input.objectKind}`
    );
  }
  if (planEntry.primaryMechanicCluster.trim() === "") {
    blockers.add("missing primary mechanic cluster");
  }
  for (const mechanic of planEntry.unresolvedMechanics ?? []) {
    blockers.add(`unresolved mechanic: ${mechanic}`);
  }

  const typedEvidence = isTypedEvidencePlan(planEntry);
  if (typedEvidence) {
    validateTypedPlanEntry(planEntry, input.objectKind, typedBlockers);
  }

  const draftPoints = collectDraftSemanticPoints(input.draft);
  const mappingsByDraftPoint = new Map(
    planEntry.semanticMappings.map((mapping) => [
      draftPointKey(mapping.draftPoint),
      mapping,
    ])
  );
  for (const point of draftPoints) {
    const mapping = mappingsByDraftPoint.get(draftPointKey(point));
    if (mapping === undefined) {
      blockers.add(`unmapped canonical draft point: ${point.path}`);
      continue;
    }
    validateSemanticMapping(
      input,
      mapping,
      blockers,
      typedBlockers,
      typedEvidence
    );
  }
  for (const mapping of planEntry.semanticMappings) {
    if (
      !draftPoints.some((point) => sameDraftPoint(point, mapping.draftPoint))
    ) {
      blockers.add(
        `cross-source mapping references missing canonical draft point: ${mapping.draftPoint.path}`
      );
    }
  }

  validateComposition(input, blockers);
  validateRuntime(input, blockers, planEntry);

  const blockerCodes = [
    ...typedBlockers,
    ...classifyLegacyBlockers(Array.from(blockers)),
  ];
  for (const blocker of typedBlockers) {
    blockers.add(blocker.message);
  }
  const uniqueBlockerCodes = Array.from(
    new Map(
      blockerCodes.map((blocker) => [
        `${blocker.code}\u0000${blocker.message}\u0000${blocker.capabilityId ?? ""}\u0000${blocker.evidenceId ?? ""}`,
        blocker,
      ])
    ).values()
  ).sort((left, right) =>
    `${left.code}\u0000${left.message}`.localeCompare(
      `${right.code}\u0000${right.message}`
    )
  );

  return {
    status:
      blockers.size === 0 && typedBlockers.length === 0
        ? "crossSourceComplete"
        : "blocked",
    primaryMechanicCluster: planEntry.primaryMechanicCluster,
    blockers: Array.from(blockers).sort(),
    blockerCodes: uniqueBlockerCodes,
  };
}

export function hasAppropriateRuntimeComposition(
  objectKind: CrossSourceObjectKind,
  sourceGroupOrTokenKind: string,
  compositionMembership: readonly CrossSourceCompositionMembership[]
): boolean {
  return compositionMembership.some((membership) => {
    if (objectKind === "deadWizardToken") {
      return (
        membership.entryKind === "token" &&
        membership.role === "deadWizardTokens"
      );
    }
    if (objectKind === "wizardProperty") {
      return (
        membership.entryKind === "token" &&
        membership.role === "wizardProperties"
      );
    }
    if (sourceGroupOrTokenKind === "main") {
      return membership.entryKind === "card" && membership.role === "mainDeck";
    }
    if (sourceGroupOrTokenKind === "legend") {
      return (
        membership.entryKind === "card" && membership.role === "legendDeck"
      );
    }
    if (sourceGroupOrTokenKind === "starter") {
      return (
        membership.entryKind === "card" &&
        (membership.role === "starterDeck" ||
          membership.role === "starterDeckTemplate" ||
          membership.role === "starterReplacement")
      );
    }
    if (sourceGroupOrTokenKind === "familiar") {
      return (
        membership.entryKind === "card" && membership.role === "familiarPool"
      );
    }
    if (sourceGroupOrTokenKind === "special") {
      return (
        membership.entryKind === "card" &&
        (membership.role === "limpWandStack" ||
          membership.role === "wildMagicStack")
      );
    }
    return false;
  });
}

function decodePlanEntry(
  value: unknown,
  typedEvidence: boolean
): CrossSourceCoveragePlanEntry | undefined {
  const record = getRecord(value);
  const id = getString(record["id"]);
  const objectKind = getCrossSourceObjectKind(record["objectKind"]);
  const primaryMechanicCluster = getString(record["primaryMechanicCluster"]);
  if (
    id === undefined ||
    objectKind === undefined ||
    primaryMechanicCluster === undefined
  ) {
    return undefined;
  }

  const semanticMappings = Array.isArray(record["semanticMappings"])
    ? record["semanticMappings"]
        .map((mapping) => decodeSemanticMapping(mapping, typedEvidence))
        .filter(
          (mapping): mapping is CrossSourceSemanticMapping =>
            mapping !== undefined
        )
    : [];
  const requiredCapabilities = decodeStableIdArray(
    record["requiredCapabilities"]
  );
  const unresolvedCapabilities = decodeStableIdArray(
    record["unresolvedCapabilities"]
  );
  const unresolvedMechanics = getStringArray(record["unresolvedMechanics"]);

  return {
    id,
    objectKind,
    primaryMechanicCluster,
    semanticMappings,
    requiredCapabilities,
    unresolvedCapabilities,
    unresolvedMechanics,
    evidenceMode: typedEvidence ? "typed" : "legacy",
  };
}

function decodeSemanticMapping(
  value: unknown,
  typedEvidence: boolean
): CrossSourceSemanticMapping | undefined {
  const record = getRecord(value);
  const draftPoint = decodeDraftPoint(record["draftPoint"]);
  if (draftPoint === undefined) {
    return undefined;
  }
  const runtimeRefs = Array.isArray(record["runtimeRefs"])
    ? record["runtimeRefs"]
        .map(decodeRuntimeRef)
        .filter((ref): ref is CrossSourceRuntimeRef => ref !== undefined)
    : [];
  const testRefs = Array.isArray(record["testRefs"])
    ? record["testRefs"]
        .map((testRef) => decodeTestRef(testRef, typedEvidence))
        .filter((ref): ref is CrossSourceTestRef => ref !== undefined)
    : [];

  const capabilityId = decodeCapabilityId(record["capabilityId"]);
  const evidenceId = decodeEvidenceId(record["evidenceId"]);

  return { capabilityId, evidenceId, draftPoint, runtimeRefs, testRefs };
}

function decodeDraftPoint(value: unknown): CrossSourceDraftPoint | undefined {
  const record = getRecord(value);
  const pathValue = getString(record["path"]);
  const valueValue = getRuntimeValue(record["value"]);
  if (pathValue === undefined || valueValue === undefined) {
    return undefined;
  }
  return { path: pathValue, value: valueValue };
}

function decodeRuntimeRef(value: unknown): CrossSourceRuntimeRef | undefined {
  const record = getRecord(value);
  if (record["kind"] === "field") {
    const path = getString(record["path"]);
    const fieldValue = getRuntimeValue(record["value"]);
    return path === undefined || fieldValue === undefined
      ? undefined
      : { kind: "field", path, value: fieldValue };
  }
  if (record["kind"] !== "effect") {
    return undefined;
  }
  const effectId = getString(record["effectId"]);
  const timing = getString(record["timing"]);
  const fields = getRuntimeReferenceFields(record["fields"]);
  return effectId === undefined || timing === undefined || fields === undefined
    ? undefined
    : { kind: "effect", effectId, timing, fields };
}

function decodeTestRef(
  value: unknown,
  typedEvidence: boolean
): CrossSourceTestRef | undefined {
  const record = getRecord(value);
  const file = getString(record["file"]);
  const name = getString(record["name"]);
  if (file === undefined || name === undefined) {
    return undefined;
  }
  return {
    file,
    name,
    execution: typedEvidence
      ? decodeExecutionEvidence(record["execution"])
      : undefined,
    observation: typedEvidence
      ? decodeObservationEvidence(record["observation"])
      : undefined,
  };
}

function isTypedEvidencePlan(planEntry: CrossSourceCoveragePlanEntry): boolean {
  return (
    planEntry.evidenceMode === "typed" ||
    planEntry.requiredCapabilities !== undefined ||
    planEntry.unresolvedCapabilities !== undefined ||
    planEntry.semanticMappings.some(
      (mapping) =>
        mapping.capabilityId !== undefined || mapping.evidenceId !== undefined
    )
  );
}

function validateTypedPlanEntry(
  planEntry: CrossSourceCoveragePlanEntry,
  objectKind: CrossSourceObjectKind,
  blockers: CrossSourceBlocker[]
): void {
  const requiredCapabilities = planEntry.requiredCapabilities;
  if (requiredCapabilities === undefined) {
    blockers.push(
      createBlocker(
        "required-capability-uncovered",
        "typed evidence plan does not declare required capabilities"
      )
    );
  }

  const required = new Set(requiredCapabilities ?? []);
  const seenCapabilities = new Set<CrossSourceCapabilityId>();
  const seenMappedCapabilities = new Set<CrossSourceCapabilityId>();
  const seenEvidence = new Set<CrossSourceEvidenceId>();
  const coveredCapabilities = new Set<CrossSourceCapabilityId>();

  for (const capabilityId of requiredCapabilities ?? []) {
    if (!isStableCoverageId(capabilityId, "capability")) {
      blockers.push(
        createBlocker(
          "invalid-capability-id",
          `invalid required capability ID ${capabilityId}`,
          { capabilityId }
        )
      );
    }
    if (seenCapabilities.has(capabilityId)) {
      blockers.push(
        createBlocker(
          "duplicate-capability-id",
          `duplicate required capability ID ${capabilityId}`,
          { capabilityId }
        )
      );
    }
    seenCapabilities.add(capabilityId);
  }

  for (const capabilityId of planEntry.unresolvedCapabilities ?? []) {
    if (!isStableCoverageId(capabilityId, "capability")) {
      blockers.push(
        createBlocker(
          "invalid-capability-id",
          `invalid unresolved capability ID ${capabilityId}`,
          { capabilityId }
        )
      );
      continue;
    }
    blockers.push(
      createBlocker(
        "unresolved-capability",
        `unresolved capability ${capabilityId}`,
        { capabilityId }
      )
    );
  }

  for (const mapping of planEntry.semanticMappings) {
    const capabilityId = mapping.capabilityId;
    const evidenceId = mapping.evidenceId;
    if (capabilityId === undefined) {
      blockers.push(
        createBlocker(
          "invalid-capability-id",
          `semantic mapping for ${mapping.draftPoint.path} has no capability ID`
        )
      );
    } else {
      if (!isStableCoverageId(capabilityId, "capability")) {
        blockers.push(
          createBlocker(
            "invalid-capability-id",
            `invalid semantic mapping capability ID ${capabilityId}`,
            { capabilityId }
          )
        );
      }
      if (!required.has(capabilityId)) {
        blockers.push(
          createBlocker(
            "mapping-capability-unrequired",
            `semantic mapping references undeclared capability ${capabilityId}`,
            { capabilityId }
          )
        );
      }
      if (seenMappedCapabilities.has(capabilityId)) {
        blockers.push(
          createBlocker(
            "duplicate-capability-id",
            `duplicate semantic capability ID ${capabilityId}`,
            { capabilityId }
          )
        );
      }
      seenMappedCapabilities.add(capabilityId);
      coveredCapabilities.add(capabilityId);
    }

    if (evidenceId === undefined) {
      blockers.push(
        createBlocker(
          "invalid-evidence-id",
          `semantic mapping for ${mapping.draftPoint.path} has no evidence ID`
        )
      );
    } else {
      if (!isStableCoverageId(evidenceId, "evidence")) {
        blockers.push(
          createBlocker(
            "invalid-evidence-id",
            `invalid semantic mapping evidence ID ${evidenceId}`,
            { evidenceId }
          )
        );
      }
      if (seenEvidence.has(evidenceId)) {
        blockers.push(
          createBlocker(
            "duplicate-evidence-id",
            `duplicate semantic evidence ID ${evidenceId}`,
            { evidenceId }
          )
        );
      }
      seenEvidence.add(evidenceId);
    }
  }

  for (const capabilityId of required) {
    if (!coveredCapabilities.has(capabilityId)) {
      blockers.push(
        createBlocker(
          "required-capability-uncovered",
          `required capability ${capabilityId} has no semantic evidence mapping`,
          { capabilityId }
        )
      );
    }
  }

  for (const mapping of planEntry.semanticMappings) {
    for (const testRef of mapping.testRefs) {
      if (
        testRef.execution !== undefined &&
        testRef.execution.objectKind !== objectKind
      ) {
        blockers.push(
          createBlocker(
            "execution-object-kind-mismatch",
            `execution object kind ${testRef.execution.objectKind} does not match ${objectKind}`,
            {
              capabilityId: mapping.capabilityId,
              evidenceId: mapping.evidenceId,
            }
          )
        );
      }
    }
  }
}

function decodeExecutionEvidence(
  value: unknown
): CrossSourceExecutionEvidence | undefined {
  const record = getRecord(value);
  const seam = getExecutionSeam(record["seam"]);
  const objectKind = getCrossSourceObjectKind(record["objectKind"]);
  const subject = decodeTestSubject(record["subject"]);
  return seam === undefined || objectKind === undefined || subject === undefined
    ? undefined
    : { seam, objectKind, subject };
}

function decodeObservationEvidence(
  value: unknown
): CrossSourceObservationEvidence | undefined {
  const record = getRecord(value);
  const target = getString(record["target"]);
  return record["kind"] === "assertion" && target !== undefined
    ? { kind: "assertion", target }
    : undefined;
}

function decodeTestSubject(value: unknown): CrossSourceTestSubject | undefined {
  const record = getRecord(value);
  if (record["kind"] === "binding") {
    const name = getString(record["name"]);
    return name === undefined ? undefined : { kind: "binding", name };
  }
  if (record["kind"] === "literal") {
    const subjectValue = getString(record["value"]);
    return subjectValue === undefined
      ? undefined
      : { kind: "literal", value: subjectValue };
  }
  return undefined;
}

function validateTypedTestReference(
  rootDir: string,
  id: string,
  testRef: CrossSourceTestRef,
  blockers: CrossSourceBlocker[],
  metadata: Pick<CrossSourceBlocker, "capabilityId" | "evidenceId">
): boolean {
  const addBlocker = (code: CrossSourceBlockerCode, message: string): void => {
    blockers.push(createBlocker(code, message, metadata));
  };
  let valid = true;
  const execution = testRef.execution;
  const observation = testRef.observation;
  if (execution === undefined) {
    addBlocker(
      "execution-evidence-missing",
      `focused test ${testRef.file}#${testRef.name} has no execution evidence`
    );
    valid = false;
  }
  if (observation === undefined) {
    addBlocker(
      "observation-evidence-missing",
      `focused test ${testRef.file}#${testRef.name} has no observation evidence`
    );
    valid = false;
  }
  if (execution === undefined || observation === undefined) {
    return false;
  }

  if (!isExecutionSeamAllowed(execution.objectKind, execution.seam)) {
    addBlocker(
      "execution-seam-not-allowed",
      `execution seam ${execution.seam} is not allowed for ${execution.objectKind}`
    );
    valid = false;
  }

  if (
    !testRef.file.startsWith("tests/") ||
    testRef.file.includes("..") ||
    !testRef.file.endsWith(".test.ts")
  ) {
    addBlocker(
      "focused-test-reference-invalid",
      `focused test file reference is invalid: ${testRef.file}`
    );
    return false;
  }
  const absolutePath = path.resolve(rootDir, testRef.file);
  if (!existsSync(absolutePath)) {
    addBlocker(
      "focused-test-not-found",
      `focused test file does not exist: ${testRef.file}`
    );
    return false;
  }
  const text = readFileSync(absolutePath, "utf8");
  const namedTestBody = findNamedTestBody(text, testRef.name);
  const cardSemanticEvidenceCase =
    execution.objectKind === "card" && execution.seam === "applyAction"
      ? findCardSemanticEvidenceCase(text, id, testRef.name)
      : false;
  const testBody =
    namedTestBody ?? (cardSemanticEvidenceCase ? text : undefined);
  if (testBody === undefined) {
    addBlocker(
      "focused-test-not-found",
      `focused test is not named in ${testRef.file}: ${testRef.name}`
    );
    return false;
  }

  const observationTarget = observation.target.trim();
  const cardEvidenceWrapper =
    execution.objectKind === "card" &&
    execution.seam === "applyAction" &&
    observation.kind === "assertion" &&
    observationTarget === "assertCardRuntimeEvidence"
      ? namedTestBody === undefined && cardSemanticEvidenceCase
        ? findNamedFunctionBody(text, "runCardSemanticEvidence")
        : findCardSemanticEvidenceWrapper(text, testBody, id)
      : undefined;
  const evidenceBody = cardEvidenceWrapper ?? testBody;
  const calls = findRuntimeSeamCalls(evidenceBody).filter(
    (call) => call.name === execution.seam
  );
  if (calls.length === 0) {
    addBlocker(
      "execution-seam-missing",
      `focused test ${testRef.file}#${testRef.name} does not call execution seam ${execution.seam}`
    );
    return false;
  }

  const subjectUsed = calls.some((call) =>
    cardEvidenceWrapper !== undefined
      ? hasParameterizedRuntimeCardInstanceReference(evidenceBody, call)
      : executionSubjectIsUsed(testBody, id, call, execution.subject)
  );
  if (!subjectUsed) {
    addBlocker(
      "execution-subject-not-used",
      `focused test ${testRef.file}#${testRef.name} does not pass the claimed object to ${execution.seam}`
    );
    valid = false;
  }

  if (
    execution.seam === "applyAction" &&
    !calls.some(
      (call) =>
        (cardEvidenceWrapper !== undefined
          ? hasParameterizedRuntimeCardInstanceReference(evidenceBody, call)
          : executionSubjectIsUsed(testBody, id, call, execution.subject)) &&
        isApplyActionPathAllowed(
          evidenceBody,
          call,
          execution.objectKind,
          (code, message) => addBlocker(code, message)
        )
    )
  ) {
    valid = false;
  }

  if (observation.kind !== "assertion" || observationTarget === "") {
    addBlocker(
      "observation-evidence-missing",
      `focused test ${testRef.file}#${testRef.name} has an empty assertion target`
    );
    return false;
  }
  const observed =
    cardEvidenceWrapper !== undefined
      ? hasCardSemanticEvidenceObservation(
          text,
          evidenceBody,
          calls,
          observationTarget,
          (code, message) => addBlocker(code, message)
        )
      : (() => {
          const normalizedTarget = normalizeSourceSnippet(observationTarget);
          return calls.some((call) =>
            getAssertionsAfter(testBody, call.end).some((assertion) =>
              normalizeSourceSnippet(assertion).includes(normalizedTarget)
            )
          );
        })();
  if (!observed) {
    if (cardEvidenceWrapper === undefined) {
      addBlocker(
        "observation-assertion-missing",
        `focused test ${testRef.file}#${testRef.name} does not assert ${observationTarget} after ${execution.seam}`
      );
    }
    valid = false;
  }
  return valid;
}

function findCardSemanticEvidenceWrapper(
  sourceText: string,
  testBody: string,
  id: string
): string | undefined {
  const invocation = new RegExp(
    `\\brunCardSemanticEvidence\\s*\\(\\s*(["'])${escapeRegExp(id)}\\1\\s*,`,
    "u"
  );
  if (!invocation.test(testBody)) {
    return undefined;
  }
  return findNamedFunctionBody(sourceText, "runCardSemanticEvidence");
}

function findCardSemanticEvidenceCase(
  sourceText: string,
  id: string,
  testName: string
): boolean {
  return new RegExp(
    `\\{\\s*definitionId\\s*:\\s*(["'])${escapeRegExp(id)}\\1\\s*,\\s*seed\\s*:\\s*\\d+\\s*,\\s*testName\\s*:\\s*(["'])${escapeRegExp(testName)}\\2\\s*,?\\s*\\}`,
    "u"
  ).test(sourceText);
}

function hasParameterizedRuntimeCardInstanceReference(
  testBody: string,
  call: RuntimeSeamCall
): boolean {
  return hasRuntimeCardInstanceReference(testBody, undefined, call);
}

function hasRuntimeCardInstanceReference(
  testBody: string,
  id: string | undefined,
  call: RuntimeSeamCall
): boolean {
  const binding = findGivenRuntimeCardBinding(testBody, id);
  if (binding === undefined) {
    return false;
  }
  return new RegExp(
    "\\b" + escapeRegExp(binding) + "\\.instanceId\\b",
    "u"
  ).test(call.invocation);
}

function findGivenRuntimeCardBinding(
  testBody: string,
  id?: string
): string | undefined {
  const setup = new RegExp(
    "\\b(?:const|let)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*givenRuntimeCard\\s*\\([\\s\\S]*?\\)",
    "u"
  ).exec(testBody);
  if (setup?.[1] === undefined || !/\bdefinitionId\b/u.test(setup[0])) {
    return undefined;
  }
  if (
    id !== undefined &&
    !new RegExp(
      "\\bdefinitionId\\s*:\\s*([\"'])" + escapeRegExp(id) + "\\1",
      "u"
    ).test(setup[0])
  ) {
    return undefined;
  }
  return setup[1];
}

function hasCardSemanticEvidenceObservation(
  sourceText: string,
  wrapperBody: string,
  calls: RuntimeSeamCall[],
  observationTarget: string,
  addBlocker: (code: CrossSourceBlockerCode, message: string) => void
): boolean {
  const applyAction = calls.find((call) => call.name === "applyAction");
  const observesAfterAction =
    applyAction !== undefined &&
    new RegExp(
      `\\b${escapeRegExp(observationTarget)}\\s*\\(\\s*scenario\\s*,\\s*card\\s*,\\s*definitionId(?:\\s*,\\s*[^)]*)?\\s*\\)`,
      "u"
    ).test(wrapperBody.slice(applyAction.end));
  if (!observesAfterAction) {
    addBlocker(
      "observation-assertion-missing",
      `card semantic evidence helper does not call ${observationTarget} after applyAction`
    );
    return false;
  }

  const helperBody = findNamedFunctionBody(
    sourceText,
    "assertCardRuntimeEvidence"
  );
  const helperHasMappingAssertions =
    helperBody !== undefined &&
    /\bassertCardRuntimeExecutionEvidence\s*\(/u.test(helperBody) &&
    /\breadCrossSourceCoveragePlan\s*\(/u.test(helperBody) &&
    /\bsemanticMappings\b/u.test(helperBody) &&
    /\bruntimeRefs\b/u.test(helperBody) &&
    /\bcardDefinitions\b/u.test(helperBody) &&
    /\beventLog\b/u.test(helperBody) &&
    /\bassert\.(?:ok|equal|deepEqual)\b/u.test(helperBody);
  if (!helperHasMappingAssertions) {
    addBlocker(
      "observation-assertion-missing",
      "card semantic evidence helper does not assert mapped runtime references"
    );
    return false;
  }
  return true;
}

function executionSubjectIsUsed(
  testBody: string,
  id: string,
  call: RuntimeSeamCall,
  subject: CrossSourceTestSubject
): boolean {
  if (subject.kind === "literal") {
    const idBindings = findStableIdBindings(testBody, id);
    return (
      subject.value === id &&
      (call.invocation.includes(id) ||
        idBindings.some((binding) =>
          invocationUsesBinding(call.invocation, binding)
        ) ||
        (call.name === "scoreGame" &&
          hasScoredDefinitionReference(testBody.slice(0, call.end), id)) ||
        (call.name === "applyAction" &&
          hasRuntimeCardInstanceReference(testBody, id, call)) ||
        ((call.name === "initializeGame" ||
          call.name === "createGameScenario") &&
          hasKnownRuntimeDefinitionReference(testBody, id)))
    );
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/u.test(subject.name)) {
    return false;
  }
  const boundIds = findStableIdBindings(testBody, id);
  if (!boundIds.includes(subject.name)) {
    return false;
  }
  return invocationUsesBinding(call.invocation, subject.name);
}

function hasKnownRuntimeDefinitionReference(
  testBody: string,
  id: string
): boolean {
  const setupCallNames = [
    "givenWizardProperty",
    "givenDeadWizardToken",
    "createDeadWizardToken",
    "createDeadWizardTokenInStack",
    "givenRuntimeCard",
    "createCardInstance",
    "createToken",
    "markCardDefinitionId",
    "markTokenDefinitionId",
    "tokenDefinitions.get",
    "cardDefinitions.get",
  ];
  const escapedId = escapeRegExp(id);
  const knownCallReference = setupCallNames.some((name) =>
    new RegExp(
      `${escapeRegExp(name)}\\s*\\([^;]*["']${escapedId}["']`,
      "u"
    ).test(testBody)
  );
  const knownLookupReference = [
    "tokenDefinitions.get",
    "cardDefinitions.get",
  ].some((name) => {
    const lookup = new RegExp(
      `${escapeRegExp(name)}\\s*\\(\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\.([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\)`,
      "u"
    ).exec(testBody);
    if (lookup?.[1] === undefined) {
      return false;
    }
    return new RegExp(
      `\\b${escapeRegExp(lookup[1])}\\s*:\\s*["']${escapedId}["']`,
      "u"
    ).test(testBody);
  });
  const knownSetupFieldReference = new RegExp(
    `\\b(?:tokenId|cardId|definitionId)\\s*:\\s*["']${escapedId}["']`,
    "u"
  ).test(testBody);
  return knownCallReference || knownLookupReference || knownSetupFieldReference;
}

function invocationUsesBinding(invocation: string, binding: string): boolean {
  const escapedBinding = escapeRegExp(binding);
  return new RegExp(
    `(?:[,{(]\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*:\\s*)${escapedBinding}\\b`,
    "u"
  ).test(invocation);
}

const applyActionObjectKinds: Readonly<
  Record<string, CrossSourceObjectKind | undefined>
> = {
  playCard: "card",
  buyMarketCard: "card",
  activatePermanent: "card",
  setCardEffectiveType: "card",
  activateWizardProperty: "wizardProperty",
  activateDeadWizardToken: "deadWizardToken",
};

function isApplyActionPathAllowed(
  testBody: string,
  call: RuntimeSeamCall,
  objectKind: CrossSourceObjectKind,
  addBlocker: (code: CrossSourceBlockerCode, message: string) => void
): boolean {
  const actionType = getApplyActionType(testBody, call);
  if (actionType === undefined) {
    addBlocker(
      "execution-action-path-missing",
      `focused test applyAction call does not expose a literal action path for ${objectKind}`
    );
    return false;
  }
  const expectedObjectKind = applyActionObjectKinds[actionType];
  if (expectedObjectKind !== objectKind) {
    addBlocker(
      "execution-action-path-not-allowed",
      `applyAction path ${actionType} is not allowed for ${objectKind}`
    );
    return false;
  }
  return true;
}

function getApplyActionType(
  testBody: string,
  call: RuntimeSeamCall
): string | undefined {
  const inlineType = /\btype\s*:\s*(["'])([a-zA-Z_$][a-zA-Z0-9_$]*)\1/u.exec(
    call.invocation
  )?.[2];
  if (inlineType !== undefined) {
    return inlineType;
  }

  const actionBinding =
    /^[^(]+\(\s*[^,]+,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/u.exec(
      call.invocation
    )?.[1];
  if (actionBinding === undefined) {
    return undefined;
  }
  const declaration = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRegExp(actionBinding)}(?:\\s*:\\s*[^=;]+)?\\s*=\\s*\\{([\\s\\S]*?)\\}`,
    "u"
  ).exec(testBody.slice(0, call.start))?.[1];
  return declaration === undefined
    ? undefined
    : /\btype\s*:\s*(["'])([a-zA-Z_$][a-zA-Z0-9_$]*)\1/u.exec(declaration)?.[2];
}

const allowedExecutionSeams: Record<
  CrossSourceObjectKind,
  ReadonlySet<CrossSourceExecutionSeam>
> = {
  card: new Set([
    "applyAction",
    "calculateEffectiveCardCost",
    "calculateEffectiveCardVictoryPoints",
    "createGameScenario",
    "initializeGame",
    "runMarketFlow",
    "scoreGame",
  ]),
  wizardProperty: new Set([
    "applyAction",
    "calculateEffectiveCardVictoryPoints",
    "calculateEffectivePlayerMaxLife",
    "createGameScenario",
    "initializeGame",
    "scoreGame",
  ]),
  deadWizardToken: new Set([
    "applyAction",
    "calculateEffectiveCardVictoryPoints",
    "calculateEffectivePlayerMaxLife",
    "createGameScenario",
    "gainDeadWizardToken",
    "initializeGame",
    "scoreGame",
  ]),
};

function isExecutionSeamAllowed(
  objectKind: CrossSourceObjectKind,
  seam: CrossSourceExecutionSeam
): boolean {
  return allowedExecutionSeams[objectKind].has(seam);
}

function normalizeSourceSnippet(value: string): string {
  return value.replaceAll("?", "").replaceAll(/\s+/gu, "");
}

function validateSemanticMapping(
  input: {
    rootDir: string;
    id: string;
    runtime: Record<string, unknown> | undefined;
  },
  mapping: CrossSourceSemanticMapping,
  blockers: Set<string>,
  typedBlockers: CrossSourceBlocker[],
  typedEvidence: boolean
): void {
  if (mapping.runtimeRefs.length === 0) {
    blockers.add(
      `canonical draft point ${mapping.draftPoint.path} has no runtime reference`
    );
  }
  if (mapping.testRefs.length === 0) {
    blockers.add(
      `canonical draft point ${mapping.draftPoint.path} has no focused test reference`
    );
  }

  const effects = getRawRuntimeEffects(input.runtime);
  for (const runtimeRef of mapping.runtimeRefs) {
    if (runtimeRef.kind === "field") {
      const actualValue = getRuntimeFieldValue(input.runtime, runtimeRef.path);
      if (!matchesRuntimeValue(actualValue, runtimeRef.value)) {
        blockers.add(
          `runtime field ${runtimeRef.path} does not match ${JSON.stringify(runtimeRef.value)} for canonical draft point ${mapping.draftPoint.path}`
        );
      }
      continue;
    }

    const matchingEffects = effects.filter((effect) => {
      const record = getRecord(effect);
      return (
        record["effectId"] === runtimeRef.effectId &&
        record["timing"] === runtimeRef.timing
      );
    });
    if (matchingEffects.length === 0) {
      blockers.add(
        `runtime effect ${runtimeRef.effectId}@${runtimeRef.timing} is missing for canonical draft point ${mapping.draftPoint.path}`
      );
      continue;
    }
    if (
      !matchingEffects.some((effect) =>
        hasExpectedRuntimeFields(getRecord(effect), runtimeRef.fields)
      )
    ) {
      blockers.add(
        `runtime effect ${runtimeRef.effectId}@${runtimeRef.timing} has mismatched fields for canonical draft point ${mapping.draftPoint.path}`
      );
    }
  }
  for (const testRef of mapping.testRefs) {
    const focusedTestValid = typedEvidence
      ? validateTypedTestReference(
          input.rootDir,
          input.id,
          testRef,
          typedBlockers,
          {
            capabilityId: mapping.capabilityId,
            evidenceId: mapping.evidenceId,
          }
        )
      : hasFocusedTestReference(input.rootDir, input.id, testRef);
    if (!focusedTestValid) {
      blockers.add(
        `focused test reference is missing for canonical draft point ${mapping.draftPoint.path}: ${testRef.file}#${testRef.name}`
      );
    }
  }
}

function validateComposition(
  input: {
    objectKind: CrossSourceObjectKind;
    sourceGroupOrTokenKind: string;
    draft: unknown;
    compositionMembership: CrossSourceCompositionMembership[];
  },
  blockers: Set<string>
): void {
  const expectedQuantity = getNumber(
    getRecord(getRecord(input.draft)["composition"])["quantity"]
  );
  const appropriateMemberships = input.compositionMembership.filter(
    (membership) =>
      hasAppropriateRuntimeComposition(
        input.objectKind,
        input.sourceGroupOrTokenKind,
        [membership]
      )
  );
  if (appropriateMemberships.length === 0) {
    blockers.add("missing appropriate deck/stack/pool composition membership");
    return;
  }
  if (expectedQuantity === undefined) {
    blockers.add("missing canonical composition quantity");
    return;
  }
  if (
    appropriateMemberships.some((membership) => membership.count === undefined)
  ) {
    blockers.add("composition entry is missing count");
    return;
  }
  const actualQuantity = appropriateMemberships.reduce(
    (total, membership) => total + (membership.count ?? 0),
    0
  );
  const starterTemplateUsesPerPlayerQuantity =
    input.sourceGroupOrTokenKind === "starter" &&
    appropriateMemberships.some(
      (membership) => membership.role === "starterDeckTemplate"
    ) &&
    expectedQuantity === actualQuantity * 5;
  if (
    actualQuantity !== expectedQuantity &&
    !starterTemplateUsesPerPlayerQuantity
  ) {
    blockers.add(
      `composition quantity ${actualQuantity} does not match canonical quantity ${expectedQuantity}`
    );
  }
}

function validateRuntime(
  input: {
    id: string;
    objectKind: CrossSourceObjectKind;
    runtime: Record<string, unknown> | undefined;
  },
  blockers: Set<string>,
  planEntry: CrossSourceCoveragePlanEntry
): void {
  if (input.runtime === undefined) {
    blockers.add("missing runtime mapping");
    return;
  }
  if (
    input.objectKind === "card" &&
    getString(input.runtime["cardId"]) !== input.id
  ) {
    blockers.add("runtime card ID does not match canonical card ID");
  }
  if (
    input.objectKind !== "card" &&
    getString(input.runtime["kind"]) !== input.objectKind
  ) {
    blockers.add(
      `runtime kind ${getString(input.runtime["kind"]) ?? "missing"} does not match ${input.objectKind}`
    );
  }

  const effects = getRawRuntimeEffects(input.runtime);
  if (effects.length === 0) {
    if (!isExplicitNoEffectCard(input.objectKind, planEntry)) {
      blockers.add("runtime has no effects");
    }
    return;
  }
  for (const [index, effect] of effects.entries()) {
    const record = getRecord(effect);
    const effectId = getString(record["effectId"]);
    if (effectId === undefined || !isRuntimeEffectId(effectId)) {
      blockers.add(`runtime effect at index ${index} has an invalid effect id`);
      continue;
    }
    const result = validateRuntimeEffectCatalogPayload(
      input.id,
      effectId,
      record,
      "combat",
      input.objectKind
    );
    if (!result.ok) {
      for (const error of result.errors) {
        blockers.add(
          `runtime effect ${effectId} violates source/timing policy: ${error}`
        );
      }
    }
  }
}

function isExplicitNoEffectCard(
  objectKind: CrossSourceObjectKind,
  planEntry: CrossSourceCoveragePlanEntry
): boolean {
  if (objectKind !== "card") {
    return false;
  }
  return planEntry.semanticMappings.some((mapping) =>
    mapping.runtimeRefs.some(
      (runtimeRef) =>
        runtimeRef.kind === "field" &&
        runtimeRef.path === "engine.effects" &&
        Array.isArray(runtimeRef.value) &&
        runtimeRef.value.length === 0
    )
  );
}

function collectDraftSemanticPoints(draft: unknown): CrossSourceDraftPoint[] {
  const record = getRecord(draft);
  const visible = getRecord(record["visible"]);
  const points: CrossSourceDraftPoint[] = [];
  const textRu = getString(visible["textRu"]);
  if (textRu !== undefined && textRu.trim() !== "") {
    points.push({ path: "visible.textRu", value: textRu });
  }
  const victoryPoints = getNumber(visible["victoryPoints"]);
  if (victoryPoints !== undefined) {
    points.push({ path: "visible.victoryPoints", value: victoryPoints });
  }
  for (const field of ["cost", "cardKind", "cardTypes"] as const) {
    const value = getRuntimeValue(visible[field]);
    if (value !== undefined) {
      points.push({ path: `visible.${field}`, value });
    }
  }
  const markers = getRuntimeValue(visible["markers"]);
  if (Array.isArray(markers) && markers.length > 0) {
    points.push({ path: "visible.markers", value: markers });
  }
  const notes = Array.isArray(record["notes"]) ? record["notes"] : [];
  notes.forEach((note, index) => {
    if (typeof note === "string" && note.trim() !== "") {
      points.push({ path: `notes[${index}]`, value: note });
    }
  });
  return points;
}

function getRawRuntimeEffects(
  runtime: Record<string, unknown> | undefined
): unknown[] {
  if (runtime === undefined) {
    return [];
  }
  if (getString(runtime["kind"]) === "deadWizardToken") {
    return Array.isArray(runtime["effects"]) ? runtime["effects"] : [];
  }
  const engineEffects = getRecord(runtime["engine"])["effects"];
  return Array.isArray(engineEffects) ? engineEffects : [];
}

function hasExpectedRuntimeFields(
  effect: Record<string, unknown>,
  expectedFields: Record<string, CrossSourceRuntimeValue>
): boolean {
  const actualFields = Object.fromEntries(
    Object.entries(effect).filter(
      ([fieldName]) => fieldName !== "effectId" && fieldName !== "timing"
    )
  );
  return (
    Object.keys(actualFields).length === Object.keys(expectedFields).length &&
    matchesRuntimeValue(actualFields, expectedFields)
  );
}

function getRuntimeFieldValue(
  runtime: Record<string, unknown> | undefined,
  fieldPath: string
): unknown {
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(fieldPath)) {
    return undefined;
  }
  return fieldPath.split(".").reduce<unknown>((value, segment) => {
    return getRecord(value)[segment];
  }, runtime);
}

function hasFocusedTestReference(
  rootDir: string,
  id: string,
  testRef: CrossSourceTestRef
): boolean {
  if (
    !testRef.file.startsWith("tests/") ||
    testRef.file.includes("..") ||
    !testRef.file.endsWith(".test.ts")
  ) {
    return false;
  }
  const absolutePath = path.resolve(rootDir, testRef.file);
  if (!existsSync(absolutePath)) {
    return false;
  }
  const text = readFileSync(absolutePath, "utf8");
  const testBody = findNamedTestBody(text, testRef.name);
  if (testBody === undefined) {
    return false;
  }

  const idBindings = findStableIdBindings(testBody, id);
  return findRuntimeSeamCalls(testBody).some((call) => {
    const invocation = testBody.slice(call.start, call.end);
    const stateBinding = getStateBinding(testBody, call);
    const setupUsesDefinition =
      stateBinding !== undefined &&
      (testBody.includes(id) || idBindings.length > 0);
    const definitionIsUsed =
      invocation.includes(id) ||
      idBindings.some((binding) =>
        new RegExp(`\\b${escapeRegExp(binding)}\\b`).test(invocation)
      ) ||
      setupUsesDefinition ||
      (call.name === "scoreGame" &&
        hasScoredDefinitionReference(testBody.slice(0, call.end), id));
    return definitionIsUsed && hasAssertionForSeamResult(testBody, call);
  });
}

function hasScoredDefinitionReference(testPrefix: string, id: string): boolean {
  const escapedId = escapeRegExp(id);
  return new RegExp(
    `\\bmark(?:Card|Token)DefinitionId\\s*\\(\\s*(["'])${escapedId}\\1\\s*\\)`,
    "u"
  ).test(testPrefix);
}

interface RuntimeSeamCall {
  name: (typeof runtimeSeamNames)[number];
  start: number;
  end: number;
  invocation: string;
}

const runtimeSeamNames: readonly CrossSourceExecutionSeam[] = [
  "applyAction",
  "calculateEffectiveCardCost",
  "calculateEffectiveCardVictoryPoints",
  "calculateEffectivePlayerMaxLife",
  "createGameScenario",
  "gainDeadWizardToken",
  "initializeGame",
  "runMarketFlow",
  "scoreGame",
] as const;

function findStableIdBindings(testBody: string, id: string): string[] {
  const bindings = new Set<string>();
  const expression = new RegExp(
    `\\b(?:const|let)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(["'])${escapeRegExp(id)}\\2`,
    "g"
  );
  for (const match of testBody.matchAll(expression)) {
    const binding = match[1];
    if (binding !== undefined) {
      bindings.add(binding);
    }
  }
  return Array.from(bindings);
}

function findRuntimeSeamCalls(testBody: string): RuntimeSeamCall[] {
  const calls: RuntimeSeamCall[] = [];
  const expression = new RegExp(
    `\\b(${runtimeSeamNames.join("|")})\\s*\\(`,
    "g"
  );
  for (const match of testBody.matchAll(expression)) {
    const start = match.index;
    const name = match[1];
    if (start === undefined || !isRuntimeSeamName(name)) {
      continue;
    }
    const end = findInvocationEnd(testBody, start + match[0].length - 1);
    if (end !== undefined) {
      calls.push({
        name,
        start,
        end,
        invocation: testBody.slice(start, end),
      });
    }
  }
  return calls;
}

function findInvocationEnd(
  text: string,
  openingParenthesis: number
): number | undefined {
  let depth = 0;
  for (let index = openingParenthesis; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") depth -= 1;
    if (depth === 0) {
      return index + 1;
    }
  }
  return undefined;
}

function hasAssertionForSeamResult(
  testBody: string,
  call: RuntimeSeamCall
): boolean {
  const assertions = getAssertionsAfter(testBody, call.end);
  if (assertions.length === 0) {
    return false;
  }

  const stateBinding = getStateBinding(testBody, call);
  if (stateBinding !== undefined) {
    const stateAccess = new RegExp(
      `\\b${escapeRegExp(stateBinding)}\\s*(?:\\.|\\[)`
    );
    return assertions.some((assertion) => stateAccess.test(assertion));
  }

  const bindingMatch =
    /\b(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*$/.exec(
      testBody.slice(0, call.start)
    );
  const resultBinding = bindingMatch?.[1];
  if (resultBinding !== undefined) {
    const resultReference = new RegExp(`\\b${escapeRegExp(resultBinding)}\\b`);
    return assertions.some((assertion) => resultReference.test(assertion));
  }
  return assertions.some((assertion) => assertion.includes(call.invocation));
}

function isRuntimeSeamName(
  value: string | undefined
): value is (typeof runtimeSeamNames)[number] {
  return runtimeSeamNames.some((name) => name === value);
}

function getAssertionsAfter(testBody: string, callEnd: number): string[] {
  return Array.from(
    testBody
      .slice(callEnd)
      .matchAll(/\bassert\s*\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^;]*\)/gs),
    (match) => match[0]
  );
}

function getStateBinding(
  testBody: string,
  call: RuntimeSeamCall
): string | undefined {
  if (call.name === "createGameScenario") {
    const resultBinding =
      /\b(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*$/.exec(
        testBody.slice(0, call.start)
      )?.[1];
    if (resultBinding === undefined) {
      return undefined;
    }
    const stateBinding = new RegExp(
      `\\b(?:const|let)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*${escapeRegExp(resultBinding)}\\.state\\b`
    ).exec(testBody.slice(call.end));
    return stateBinding?.[1] ?? resultBinding;
  }
  if (call.name === "initializeGame") {
    const resultBinding =
      /\b(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*$/.exec(
        testBody.slice(0, call.start)
      );
    return resultBinding?.[1];
  }
  if (
    call.name !== "applyAction" &&
    call.name !== "gainDeadWizardToken" &&
    call.name !== "runMarketFlow"
  ) {
    return undefined;
  }
  const argumentMatch =
    /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/.exec(
      call.invocation
    );
  return argumentMatch?.[1];
}

function findNamedTestBody(text: string, name: string): string | undefined {
  const testStart = new RegExp(
    `\\btest\\s*\\(\\s*(["'])${escapeRegExp(name)}\\1\\s*,\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`,
    "g"
  ).exec(text);
  if (testStart === null) {
    return undefined;
  }
  const bodyStart = testStart.index + testStart[0].length - 1;
  return findBalancedBlockBody(text, bodyStart);
}

function findBalancedBlockBody(
  text: string,
  bodyStart: number
): string | undefined {
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) {
      return text.slice(bodyStart + 1, index);
    }
  }
  return undefined;
}

function findNamedFunctionBody(text: string, name: string): string | undefined {
  const functionStart = new RegExp(
    `\\bfunction\\s+${escapeRegExp(name)}\\s*\\(`,
    "u"
  ).exec(text);
  if (functionStart === null) {
    return undefined;
  }
  const bodyStart = text.indexOf(
    "{",
    functionStart.index + functionStart[0].length
  );
  if (bodyStart < 0) {
    return undefined;
  }
  return findBalancedBlockBody(text, bodyStart);
}

function sameDraftPoint(
  left: CrossSourceDraftPoint,
  right: CrossSourceDraftPoint
): boolean {
  return (
    left.path === right.path && matchesRuntimeValue(left.value, right.value)
  );
}

function draftPointKey(point: CrossSourceDraftPoint): string {
  return `${point.path}\u0000${JSON.stringify(point.value)}`;
}

function createBlocker(
  code: CrossSourceBlockerCode,
  message: string,
  metadata: Pick<CrossSourceBlocker, "capabilityId" | "evidenceId"> = {}
): CrossSourceBlocker {
  return { code, message, ...metadata };
}

function classifyLegacyBlockers(
  blockers: readonly string[]
): CrossSourceBlocker[] {
  return blockers.map((message) => {
    if (message === "missing cross-source mechanic mapping") {
      return createBlocker("missing-coverage-plan", message);
    }
    if (message.startsWith("cross-source mapping object kind ")) {
      return createBlocker("object-kind-mismatch", message);
    }
    if (message === "missing primary mechanic cluster") {
      return createBlocker("missing-primary-mechanic-cluster", message);
    }
    if (message.startsWith("unresolved mechanic: ")) {
      return createBlocker("legacy-unresolved-mechanic", message);
    }
    if (message.startsWith("unmapped canonical draft point: ")) {
      return createBlocker("unmapped-canonical-draft-point", message);
    }
    if (
      message.startsWith(
        "cross-source mapping references missing canonical draft point: "
      )
    ) {
      return createBlocker("stale-canonical-draft-point", message);
    }
    if (message.endsWith("has no runtime reference")) {
      return createBlocker("missing-runtime-reference", message);
    }
    if (message.endsWith("has no focused test reference")) {
      return createBlocker("missing-focused-test-reference", message);
    }
    if (
      message.includes("does not match") &&
      message.startsWith("runtime field ")
    ) {
      return createBlocker("runtime-field-mismatch", message);
    }
    if (
      message.startsWith("runtime effect ") &&
      message.includes(" is missing for canonical draft point ")
    ) {
      return createBlocker("runtime-effect-missing", message);
    }
    if (
      message.startsWith("runtime effect ") &&
      message.includes("has mismatched fields")
    ) {
      return createBlocker("runtime-effect-fields-mismatch", message);
    }
    if (
      message === "missing appropriate deck/stack/pool composition membership"
    ) {
      return createBlocker("missing-composition", message);
    }
    if (message === "missing canonical composition quantity") {
      return createBlocker("missing-canonical-quantity", message);
    }
    if (message === "composition entry is missing count") {
      return createBlocker("composition-count-missing", message);
    }
    if (message.startsWith("composition quantity ")) {
      return createBlocker("composition-quantity-mismatch", message);
    }
    if (message === "missing runtime mapping") {
      return createBlocker("missing-runtime", message);
    }
    if (message === "runtime card ID does not match canonical card ID") {
      return createBlocker("runtime-card-id-mismatch", message);
    }
    if (message.startsWith("runtime kind ")) {
      return createBlocker("runtime-kind-mismatch", message);
    }
    if (message === "runtime has no effects") {
      return createBlocker("runtime-no-effects", message);
    }
    if (message.includes("has an invalid effect id")) {
      return createBlocker("invalid-runtime-effect-id", message);
    }
    if (message.includes("violates source/timing policy")) {
      return createBlocker("runtime-source-timing-policy", message);
    }
    return createBlocker("legacy-unclassified", message);
  });
}

function decodeStableIdArray(
  value: unknown
): CrossSourceCapabilityId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const decoded = value.map((candidate) =>
    typeof candidate === "string" ? candidate : "<invalid-capability-id>"
  );
  return decoded as CrossSourceCapabilityId[];
}

function decodeStableId(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function decodeCapabilityId(
  value: unknown
): CrossSourceCapabilityId | undefined {
  const id = decodeStableId(value);
  return id === undefined ? undefined : (id as CrossSourceCapabilityId);
}

function decodeEvidenceId(value: unknown): CrossSourceEvidenceId | undefined {
  const id = decodeStableId(value);
  return id === undefined ? undefined : (id as CrossSourceEvidenceId);
}

function isStableCoverageId(
  value: string,
  prefix: "capability" | "evidence"
): boolean {
  return new RegExp(`^${prefix}:[a-z0-9][a-z0-9._-]*$`, "u").test(value);
}

function getExecutionSeam(
  value: unknown
): CrossSourceExecutionSeam | undefined {
  return typeof value === "string" &&
    runtimeSeamNames.includes(value as CrossSourceExecutionSeam)
    ? (value as CrossSourceExecutionSeam)
    : undefined;
}

function getCrossSourceObjectKind(
  value: unknown
): CrossSourceObjectKind | undefined {
  return value === "card" ||
    value === "wizardProperty" ||
    value === "deadWizardToken"
    ? value
    : undefined;
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

function getRuntimeValue(value: unknown): CrossSourceRuntimeValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items: CrossSourceRuntimeValue[] = [];
    for (const item of value) {
      const decodedItem = getRuntimeValue(item);
      if (decodedItem === undefined) {
        return undefined;
      }
      items.push(decodedItem);
    }
    return items;
  }
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const decoded: Record<string, CrossSourceRuntimeValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const decodedItem = getRuntimeValue(item);
    if (decodedItem === undefined) {
      return undefined;
    }
    decoded[key] = decodedItem;
  }
  return decoded;
}

function getRuntimeReferenceFields(
  value: unknown
): Record<string, CrossSourceRuntimeValue> | undefined {
  const record = getRecord(value);
  const entries = Object.entries(record);
  const fields: Record<string, CrossSourceRuntimeValue> = {};
  for (const [fieldName, fieldValue] of entries) {
    const decodedValue = getRuntimeValue(fieldValue);
    if (decodedValue === undefined) {
      return undefined;
    }
    fields[fieldName] = decodedValue;
  }
  return fields;
}

function matchesRuntimeValue(
  actual: unknown,
  expected: CrossSourceRuntimeValue
): boolean {
  if (
    expected === null ||
    typeof expected === "string" ||
    typeof expected === "number" ||
    typeof expected === "boolean"
  ) {
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matchesRuntimeValue(actual[index], item))
    );
  }
  if (!isPlainRecord(actual)) {
    return false;
  }
  return Object.entries(expected).every(([key, value]) =>
    matchesRuntimeValue(actual[key], value)
  );
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
