import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { validateDraft } from "./draft-validation.js";

const maxGapIdsPerArea = 10;

export interface ImportCompletenessAreaReport {
  label: string;
  rawCount: number;
  draftCount: number;
  validDraftCount: number;
  invalidDraftCount: number;
  errorCount: number;
  warningCount: number;
  runtimeCount: number;
  missingDraftIds: string[];
  missingRuntimeIds: string[];
  runtimeWithoutValidDraftIds: string[];
}

export interface ImportCompletenessReport {
  areas: ImportCompletenessAreaReport[];
  validationErrorCount: number;
  validationWarningCount: number;
}

interface ImportAreaConfig {
  label: string;
  rawDir: string;
  draftDir: string;
  runtimeDir: string;
  runtimeKind?: string;
}

const importAreas: ImportAreaConfig[] = [
  {
    label: "cards",
    rawDir: "data/import/card-texts",
    draftDir: "data/import/card-drafts",
    runtimeDir: "data/cards",
  },
  {
    label: "wizard properties",
    rawDir: "data/import/wizard-property-texts",
    draftDir: "data/import/wizard-property-drafts",
    runtimeDir: "data/tokens",
    runtimeKind: "wizardProperty",
  },
  {
    label: "dead wizard tokens",
    rawDir: "data/import/DWT-texts",
    draftDir: "data/import/dead-wizard-token-drafts",
    runtimeDir: "data/tokens",
    runtimeKind: "deadWizardToken",
  },
];

export function createImportCompletenessReport(rootDir: string): ImportCompletenessReport {
  const areas = importAreas.map((area) => createAreaReport(rootDir, area));

  return {
    areas,
    validationErrorCount: areas.reduce((sum, area) => sum + area.errorCount, 0),
    validationWarningCount: areas.reduce((sum, area) => sum + area.warningCount, 0),
  };
}

export function formatImportCompletenessReport(report: ImportCompletenessReport): string {
  const lines = ["Import completeness:"];

  for (const area of report.areas) {
    lines.push(
      `${area.label}: raw ${area.rawCount}, drafts ${area.draftCount} (valid ${area.validDraftCount}, invalid ${area.invalidDraftCount}, warnings ${area.warningCount}), runtime ${area.runtimeCount}`,
    );
  }

  lines.push(`draft validation: ${report.validationErrorCount} error(s), ${report.validationWarningCount} warning(s)`);
  pushGapLine(lines, "missing drafts", report.areas, (area) => area.missingDraftIds);
  pushGapLine(lines, "missing runtime", report.areas, (area) => area.missingRuntimeIds);
  pushGapLine(lines, "runtime without valid draft", report.areas, (area) => area.runtimeWithoutValidDraftIds);

  return lines.join("\n");
}

function createAreaReport(rootDir: string, area: ImportAreaConfig): ImportCompletenessAreaReport {
  const rawIds = collectIdsFromFiles(rootDir, area.rawDir, ".md");
  const draftFiles = collectFiles(rootDir, area.draftDir, ".json");
  const runtimeIds = collectRuntimeIds(rootDir, area.runtimeDir, area.runtimeKind);
  const draftIds = new Set<string>();
  const validDraftIds = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (const draftFile of draftFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(draftFile, "utf8"));
    } catch {
      errorCount += 1;
      continue;
    }

    const draftId = getDraftId(parsed);
    if (draftId !== undefined) {
      draftIds.add(draftId);
    }

    const validation = validateDraft(parsed, { filePath: path.relative(rootDir, draftFile).replaceAll("\\", "/") });
    errorCount += validation.errors.length;
    warningCount += validation.warnings.length;
    if (validation.ok) {
      if (draftId !== undefined) {
        validDraftIds.add(draftId);
      }
    }
  }

  const validDraftIdList = Array.from(validDraftIds).sort();

  return {
    label: area.label,
    rawCount: rawIds.length,
    draftCount: draftFiles.length,
    validDraftCount: validDraftIds.size,
    invalidDraftCount: draftFiles.length - validDraftIds.size,
    errorCount,
    warningCount,
    runtimeCount: runtimeIds.length,
    missingDraftIds: rawIds.filter((id) => !draftIds.has(id)),
    missingRuntimeIds: validDraftIdList.filter((id) => !runtimeIds.includes(id)),
    runtimeWithoutValidDraftIds: runtimeIds.filter((id) => !validDraftIds.has(id)),
  };
}

function collectIdsFromFiles(rootDir: string, inputDir: string, extension: string): string[] {
  return collectFiles(rootDir, inputDir, extension).map((filePath) => path.basename(filePath, extension)).sort();
}

function collectRuntimeIds(rootDir: string, inputDir: string, runtimeKind: string | undefined): string[] {
  const ids: string[] = [];

  for (const filePath of collectFiles(rootDir, inputDir, ".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }

    const id = getObjectId(parsed);
    if (id === undefined) {
      continue;
    }

    if (!isRecord(parsed) || (runtimeKind !== undefined && parsed["kind"] !== runtimeKind)) {
      continue;
    }

    ids.push(id);
  }

  return ids.sort();
}

function collectFiles(rootDir: string, inputDir: string, extension: string): string[] {
  const absoluteInputDir = path.resolve(rootDir, inputDir);
  if (!existsSync(absoluteInputDir) || !statSync(absoluteInputDir).isDirectory()) {
    return [];
  }

  return collectFilesRecursive(absoluteInputDir, extension).sort();
}

function collectFilesRecursive(absoluteInputDir: string, extension: string): string[] {
  return readdirSync(absoluteInputDir, { withFileTypes: true })
    .flatMap((entry) => {
      const absoluteEntryPath = path.join(absoluteInputDir, entry.name);
      if (entry.name.startsWith("_")) {
        return [];
      }

      if (entry.isDirectory()) {
        return collectFilesRecursive(absoluteEntryPath, extension);
      }

      return entry.isFile() && entry.name.endsWith(extension) ? [absoluteEntryPath] : [];
    })
    .sort();
}

function getDraftId(draft: unknown): string | undefined {
  return getObjectId(draft);
}

function getObjectId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isString(value["id"])) {
    return value["id"];
  }

  if (isString(value["cardId"])) {
    return value["cardId"];
  }

  if (isString(value["tokenId"])) {
    return value["tokenId"];
  }

  return undefined;
}

function pushGapLine(
  lines: string[],
  prefix: string,
  areas: ImportCompletenessAreaReport[],
  selectIds: (area: ImportCompletenessAreaReport) => string[],
): void {
  const parts: string[] = [];
  for (const area of areas) {
    const ids = selectIds(area);
    if (ids.length > 0) {
      parts.push(`${area.label} ${formatIdList(ids)}`);
    }
  }

  if (parts.length > 0) {
    lines.push(`${prefix}: ${parts.join("; ")}`);
  }
}

function formatIdList(ids: string[]): string {
  const visibleIds = ids.slice(0, maxGapIdsPerArea);
  const remainingCount = ids.length - visibleIds.length;
  if (remainingCount === 0) {
    return visibleIds.join(", ");
  }

  return `${visibleIds.join(", ")}, ... ${remainingCount} more`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
