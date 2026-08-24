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

export interface CrossSourceCoveragePlanEntry {
  id: string;
  objectKind: CrossSourceObjectKind;
  primaryMechanicCluster: string;
  semanticMappings: CrossSourceSemanticMapping[];
  unresolvedMechanics: string[];
}

export interface CrossSourceSemanticMapping {
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
}

const planPath = "config/runtime-coverage/cross-source-mechanics.json";

export function readCrossSourceCoveragePlan(
  rootDir: string
): Map<string, CrossSourceCoveragePlanEntry> {
  const absolutePath = path.resolve(rootDir, planPath);
  if (!existsSync(absolutePath)) {
    return new Map();
  }

  const parsed = getRecord(JSON.parse(readFileSync(absolutePath, "utf8")));
  const entries = Array.isArray(parsed["entries"]) ? parsed["entries"] : [];
  const plan = new Map<string, CrossSourceCoveragePlanEntry>();

  for (const entry of entries) {
    const decoded = decodePlanEntry(entry);
    if (decoded !== undefined) {
      plan.set(decoded.id, decoded);
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
    return {
      status: "blocked",
      primaryMechanicCluster: undefined,
      blockers: ["missing cross-source mechanic mapping"],
    };
  }

  const blockers = new Set<string>();
  if (planEntry.objectKind !== input.objectKind) {
    blockers.add(
      `cross-source mapping object kind ${planEntry.objectKind} does not match ${input.objectKind}`
    );
  }
  if (planEntry.primaryMechanicCluster.trim() === "") {
    blockers.add("missing primary mechanic cluster");
  }
  for (const mechanic of planEntry.unresolvedMechanics) {
    blockers.add(`unresolved mechanic: ${mechanic}`);
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
    validateSemanticMapping(input, mapping, blockers);
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
  validateRuntime(input, blockers);

  return {
    status: blockers.size === 0 ? "crossSourceComplete" : "blocked",
    primaryMechanicCluster: planEntry.primaryMechanicCluster,
    blockers: Array.from(blockers).sort(),
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
      return membership.role === "mainDeck";
    }
    if (sourceGroupOrTokenKind === "legend") {
      return membership.role === "legendDeck";
    }
    if (sourceGroupOrTokenKind === "starter") {
      return (
        membership.role === "starterDeck" ||
        membership.role === "starterDeckTemplate" ||
        membership.role === "starterReplacement"
      );
    }
    if (sourceGroupOrTokenKind === "familiar") {
      return membership.role === "familiarPool";
    }
    if (sourceGroupOrTokenKind === "special") {
      return (
        membership.role === "limpWandStack" ||
        membership.role === "wildMagicStack"
      );
    }
    return false;
  });
}

function decodePlanEntry(
  value: unknown
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
        .map(decodeSemanticMapping)
        .filter(
          (mapping): mapping is CrossSourceSemanticMapping =>
            mapping !== undefined
        )
    : [];
  const unresolvedMechanics = getStringArray(record["unresolvedMechanics"]);

  return {
    id,
    objectKind,
    primaryMechanicCluster,
    semanticMappings,
    unresolvedMechanics,
  };
}

function decodeSemanticMapping(
  value: unknown
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
        .map(decodeTestRef)
        .filter((ref): ref is CrossSourceTestRef => ref !== undefined)
    : [];

  return { draftPoint, runtimeRefs, testRefs };
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

function decodeTestRef(value: unknown): CrossSourceTestRef | undefined {
  const record = getRecord(value);
  const file = getString(record["file"]);
  const name = getString(record["name"]);
  return file === undefined || name === undefined ? undefined : { file, name };
}

function validateSemanticMapping(
  input: {
    rootDir: string;
    id: string;
    runtime: Record<string, unknown> | undefined;
  },
  mapping: CrossSourceSemanticMapping,
  blockers: Set<string>
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
    if (!hasFocusedTestReference(input.rootDir, input.id, testRef)) {
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
  if (actualQuantity !== expectedQuantity) {
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
  blockers: Set<string>
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
    blockers.add("runtime has no effects");
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
  return Object.entries(expectedFields).every(([fieldName, expectedValue]) =>
    matchesRuntimeValue(effect[fieldName], expectedValue)
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
    const definitionIsUsed =
      invocation.includes(id) ||
      idBindings.some((binding) =>
        new RegExp(`\\b${escapeRegExp(binding)}\\b`).test(invocation)
      );
    return definitionIsUsed && hasAssertionForSeamResult(testBody, call);
  });
}

interface RuntimeSeamCall {
  start: number;
  end: number;
}

const runtimeSeamNames = [
  "applyAction",
  "calculateEffectiveCardCost",
  "calculateEffectiveCardVictoryPoints",
  "calculateEffectivePlayerMaxLife",
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
    `\\b(?:${runtimeSeamNames.join("|")})\\s*\\(`,
    "g"
  );
  for (const match of testBody.matchAll(expression)) {
    const start = match.index;
    if (start === undefined) {
      continue;
    }
    const end = findInvocationEnd(testBody, start + match[0].length - 1);
    if (end !== undefined) {
      calls.push({ start, end });
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
  const bindingMatch =
    /\b(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*$/.exec(
      testBody.slice(0, call.start)
    );
  const resultBinding = bindingMatch?.[1];
  if (resultBinding === undefined) {
    return false;
  }
  return new RegExp(
    `\\bassert\\s*\\.\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*\\([^;]*\\b${escapeRegExp(resultBinding)}\\b`,
    "s"
  ).test(testBody.slice(call.end));
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
  if (entries.length === 0) {
    return undefined;
  }
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
