import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DraftImportKind = "card" | "deadWizardToken" | "wizardProperty";

export interface DraftImportSource {
  kind: DraftImportKind;
  textPath: string;
}

export interface DraftImportBlocker {
  source: string;
  field: string;
  message: string;
}

export interface DraftImportGeneratedFile {
  source: string;
  draftPath: string;
  draft: unknown;
}

export interface DraftImportHarnessResult {
  generated: DraftImportGeneratedFile[];
  blockers: DraftImportBlocker[];
}

export interface RunDraftImportHarnessOptions {
  rootDir: string;
  sources: DraftImportSource[];
  blockersReportPath?: string;
}

interface ParsedMarkdown {
  heading: string | undefined;
  fields: Map<string, string>;
  sections: Map<string, string[]>;
  notes: string[];
}

const cardTypeByVisibleType = new Map([
  ["волшебник", "wizardCard"],
  ["тварь", "creature"],
  ["заклинание", "spell"],
  ["сокровище", "treasure"],
  ["место", "location"],
  ["фамильяр", "familiar"],
  ["легенда", "legend"],
]);

const cardKindBySourceGroup = new Map([
  ["main", "normal"],
  ["legend", "legend"],
  ["starter", "starter"],
  ["familiar", "familiar"],
]);
const knownFieldKeys = new Set([
  "cardkind",
  "cost",
  "source image path",
  "sourceimage",
  "sourceimages",
  "sourcelabel",
  "textru",
  "visible card kind",
  "visible card types",
  "visible cost",
  "visible markers",
  "visible russian name",
  "visible type",
  "visible vp",
  "vp",
  "quantity",
]);
const plainSectionKeys = new Set([
  "clarifications",
  "classification / разъяснения",
]);

export function runDraftImportHarness(
  options: RunDraftImportHarnessOptions
): DraftImportHarnessResult {
  const generated: DraftImportGeneratedFile[] = [];
  const blockers: DraftImportBlocker[] = [];

  for (const source of options.sources) {
    const absoluteTextPath = path.resolve(options.rootDir, source.textPath);
    const relativeTextPath = toPosixPath(
      path.relative(options.rootDir, absoluteTextPath)
    );
    const markdown = parseMarkdown(readFileSync(absoluteTextPath, "utf8"));
    const sourceBlockers: DraftImportBlocker[] = [];
    const draft = createDraft(
      source.kind,
      relativeTextPath,
      markdown,
      sourceBlockers
    );

    blockers.push(...sourceBlockers);
    if (sourceBlockers.length === 0) {
      const draftPath = draftPathForSource(
        options.rootDir,
        source.kind,
        absoluteTextPath
      );
      mkdirSync(path.dirname(draftPath), { recursive: true });
      writeJsonFile(draftPath, draft);
      generated.push({
        source: relativeTextPath,
        draftPath: toPosixPath(path.relative(options.rootDir, draftPath)),
        draft,
      });
    }
  }

  if (options.blockersReportPath !== undefined) {
    const blockersReportPath = path.resolve(
      options.rootDir,
      options.blockersReportPath
    );
    mkdirSync(path.dirname(blockersReportPath), { recursive: true });
    writeJsonFile(blockersReportPath, {
      schemaVersion: 1,
      blockers,
    });
  }

  return {
    generated,
    blockers,
  };
}

function createDraft(
  kind: DraftImportKind,
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[]
): unknown {
  switch (kind) {
    case "card":
      return createCardDraft(sourceTextPath, markdown, blockers);
    case "deadWizardToken":
      return createDeadWizardTokenDraft(sourceTextPath, markdown, blockers);
    case "wizardProperty":
      return createWizardPropertyDraft(sourceTextPath, markdown, blockers);
  }
}

function createCardDraft(
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[]
): unknown {
  const cardId = path.basename(sourceTextPath, ".md");
  const sourceGroup = sourceTextPath.split("/").at(-3);
  const cardKind = inferCardKind(sourceGroup, markdown);
  const typeRu = readField(markdown, "visible type");
  const textRu = readRulesText(markdown);
  const nameRu = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "visible Russian name",
    "visible.nameRu"
  );
  const sourceImage = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "source image path",
    "source.image"
  );
  const cost = readOptionalIntegerField(
    sourceTextPath,
    markdown,
    blockers,
    "cost",
    "visible.cost"
  );
  const victoryPoints = readOptionalIntegerField(
    sourceTextPath,
    markdown,
    blockers,
    "VP",
    "visible.victoryPoints"
  );
  const cardTypes =
    readStringListField(markdown, "visible card types") ??
    inferCardTypes(typeRu, cardKind);
  const markers =
    readStringListField(markdown, "visible markers") ?? inferMarkers(textRu);
  const notes = collectNotes(markdown);
  const compositionQuantity = readOptionalIntegerField(
    sourceTextPath,
    markdown,
    blockers,
    "quantity",
    "composition.quantity"
  );

  if (cardKind === undefined) {
    blockers.push({
      source: sourceTextPath,
      field: "visible.cardKind",
      message: "card kind cannot be inferred from source path or visible type",
    });
  }

  if (textRu === undefined || textRu.trim().length === 0) {
    blockers.push({
      source: sourceTextPath,
      field: "visible.textRu",
      message: "visible rules text is required",
    });
  }

  const draft: Record<string, unknown> = {
    schemaVersion: 1,
    draftKind: "cardDraft",
    cardId,
    source: {
      image: sourceImage ?? "",
      text: sourceTextPath,
    },
    visible: {
      nameRu: nameRu ?? "",
      cost,
      victoryPoints,
      typeRu: typeRu ?? null,
      cardKind: cardKind ?? "normal",
      cardTypes,
      textRu: textRu ?? "",
      markers,
      uncertainty: [],
    },
    notes,
  };

  if (compositionQuantity !== null) {
    draft["composition"] = {
      quantity: compositionQuantity,
    };
  }

  return draft;
}

function createDeadWizardTokenDraft(
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[]
): unknown {
  const tokenId = path.basename(sourceTextPath, ".md");
  const sourceImage = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "sourceImages",
    "source.image"
  );
  const sourceLabel = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "sourceLabel",
    "visible.sourceLabel"
  );
  const textRu = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "textRu",
    "visible.textRu"
  );
  const victoryPoints = readOptionalIntegerField(
    sourceTextPath,
    markdown,
    blockers,
    "VP",
    "visible.victoryPoints"
  );

  return {
    schemaVersion: 1,
    draftKind: "deadWizardTokenDraft",
    tokenId,
    kind: "deadWizardToken",
    source: {
      image: sourceImage ?? "",
      text: sourceTextPath,
    },
    visible: {
      sourceLabel: sourceLabel ?? "",
      textRu: textRu ?? "",
      victoryPoints,
      uncertainty: [],
    },
    notes: collectNotes(markdown),
  };
}

function createWizardPropertyDraft(
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[]
): unknown {
  const tokenId = path.basename(sourceTextPath, ".md");
  const sourceImage = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "sourceImage",
    "source.image"
  );
  const sourceLabel = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "sourceLabel",
    "visible.sourceLabel"
  );
  const textRu = readRequiredField(
    sourceTextPath,
    markdown,
    blockers,
    "textRu",
    "visible.textRu"
  );

  return {
    schemaVersion: 1,
    draftKind: "wizardPropertyDraft",
    tokenId,
    kind: "wizardProperty",
    source: {
      image: sourceImage ?? "",
      text: sourceTextPath,
    },
    visible: {
      sourceLabel: sourceLabel ?? "",
      textRu: textRu ?? "",
      uncertainty: [],
    },
    notes: collectNotes(markdown),
  };
}

function parseMarkdown(markdown: string): ParsedMarkdown {
  const fields = new Map<string, string>();
  const sections = new Map<string, string[]>();
  const notes: string[] = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let heading: string | undefined;
  let currentSection: string | undefined;
  let pendingListField: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      heading = trimmed.slice(2).trim();
      currentSection = undefined;
      pendingListField = undefined;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      currentSection = normalizeKey(trimmed.slice(3));
      pendingListField = undefined;
      sections.set(currentSection, []);
      continue;
    }

    const fieldMatch = /^-?\s*([^:]+):\s*(.*)$/.exec(trimmed);
    if (fieldMatch !== null) {
      const rawKey = fieldMatch[1];
      const rawValue = fieldMatch[2];
      if (rawKey !== undefined && rawValue !== undefined) {
        const key = normalizeKey(rawKey);
        if (knownFieldKeys.has(key)) {
          const value = cleanValue(rawValue);
          fields.set(key, value);
          pendingListField = value.length === 0 ? key : undefined;
          continue;
        }

        if (rawValue.trim().length === 0 && plainSectionKeys.has(key)) {
          currentSection = key;
          pendingListField = undefined;
          sections.set(currentSection, []);
          continue;
        }
      }
    }

    if (pendingListField !== undefined && trimmed.length > 0) {
      fields.set(
        pendingListField,
        cleanValue(trimmed.startsWith("- ") ? trimmed.slice(2) : trimmed)
      );
      pendingListField = undefined;
      continue;
    }

    if (currentSection !== undefined && trimmed.length > 0) {
      const sectionLines = sections.get(currentSection);
      if (sectionLines !== undefined) {
        sectionLines.push(
          trimmed.startsWith("- ")
            ? cleanValue(trimmed.slice(2))
            : cleanValue(trimmed)
        );
      }
    }

    if (
      currentSection === "classification / разъяснения" &&
      trimmed.startsWith("- ")
    ) {
      const note = cleanValue(trimmed.slice(2));
      if (note !== "None") {
        notes.push(note);
      }
    }
  }

  return {
    heading,
    fields,
    sections,
    notes,
  };
}

function readRequiredField(
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[],
  sourceField: string,
  draftField: string
): string | undefined {
  const value = readField(markdown, sourceField);
  if (value === undefined || value.trim().length === 0) {
    blockers.push({
      source: sourceTextPath,
      field: draftField,
      message: `${sourceField} is required in source text`,
    });
    return undefined;
  }

  return value;
}

function readField(
  markdown: ParsedMarkdown,
  sourceField: string
): string | undefined {
  const fieldValue = markdown.fields.get(normalizeKey(sourceField));
  if (fieldValue !== undefined && fieldValue.length > 0) {
    return fieldValue;
  }

  const sectionValue = markdown.sections
    .get(normalizeKey(sourceField))
    ?.join("\n");
  return sectionValue !== undefined && sectionValue.length > 0
    ? sectionValue
    : undefined;
}

function readRulesText(markdown: ParsedMarkdown): string | undefined {
  return (
    readField(markdown, "Visible Russian rules text") ??
    readField(markdown, "textRu")
  );
}

function readOptionalIntegerField(
  sourceTextPath: string,
  markdown: ParsedMarkdown,
  blockers: DraftImportBlocker[],
  sourceField: string,
  draftField: string
): number | null {
  const value = readField(markdown, sourceField);
  if (value === undefined || value.trim().length === 0 || value === "None") {
    return null;
  }

  if (!/^-?\d+$/.test(value)) {
    blockers.push({
      source: sourceTextPath,
      field: draftField,
      message: `${sourceField} must be an integer when present`,
    });
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    blockers.push({
      source: sourceTextPath,
      field: draftField,
      message: `${sourceField} must be a safe integer when present`,
    });
    return null;
  }

  return parsed;
}

function inferCardKind(
  sourceGroup: string | undefined,
  markdown: ParsedMarkdown
): string | undefined {
  const explicitKind =
    readField(markdown, "visible card kind") ?? readField(markdown, "cardKind");
  if (explicitKind !== undefined) {
    return explicitKind;
  }

  if (sourceGroup !== undefined) {
    const fromGroup = cardKindBySourceGroup.get(sourceGroup);
    if (fromGroup !== undefined) {
      return fromGroup;
    }
  }

  const typeRu = readField(markdown, "visible type")?.toLowerCase();
  if (typeRu === "беспредел") {
    return "mayhem";
  }

  if (typeRu === "мегабеспредел") {
    return "megaMayhem";
  }

  return undefined;
}

function inferCardTypes(
  typeRu: string | undefined,
  cardKind: string | undefined
): string[] {
  if (
    cardKind === "wildMagic" ||
    cardKind === "limpWand" ||
    cardKind === "mayhem" ||
    cardKind === "megaMayhem"
  ) {
    return [];
  }

  if (cardKind === "legend") {
    return ["legend"];
  }

  if (typeRu === undefined) {
    return [];
  }

  const cardType = cardTypeByVisibleType.get(typeRu.toLowerCase());
  return cardType === undefined ? [] : [cardType];
}

function inferMarkers(textRu: string | undefined): string[] {
  if (textRu === undefined) {
    return [];
  }

  const markers: string[] = [];
  const lowerText = textRu.toLowerCase();
  if (lowerText.includes("атака:")) {
    markers.push("attack");
  }
  if (lowerText.includes("защита:")) {
    markers.push("defense");
  }
  if (lowerText.includes("постоянка")) {
    markers.push("ongoing");
  }
  if (lowerText.includes("активация:")) {
    markers.push("activate");
  }

  return markers;
}

function collectNotes(markdown: ParsedMarkdown): string[] {
  const notes = [...markdown.notes];
  const clarifications =
    markdown.sections.get("clarifications") ??
    markdown.sections.get("classification / разъяснения") ??
    [];
  for (const clarification of clarifications) {
    if (clarification !== "None" && !notes.includes(clarification)) {
      notes.push(clarification);
    }
  }

  return notes;
}

function readStringListField(
  markdown: ParsedMarkdown,
  sourceField: string
): string[] | undefined {
  const key = normalizeKey(sourceField);
  const value =
    markdown.fields.get(key) ?? markdown.sections.get(key)?.join("\n");
  if (value === undefined) {
    return undefined;
  }

  if (value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function draftPathForSource(
  rootDir: string,
  kind: DraftImportKind,
  absoluteTextPath: string
): string {
  const sourceDir = path.dirname(absoluteTextPath);
  const sourceId = path.basename(absoluteTextPath, ".md");

  if (
    kind === "card" ||
    kind === "deadWizardToken" ||
    kind === "wizardProperty"
  ) {
    return path.join(path.dirname(sourceDir), "drafts", `${sourceId}.json`);
  }

  return path.join(rootDir, "data", "import", "drafts", `${sourceId}.json`);
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cleanValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "``") {
    return "";
  }

  return trimmed.replace(/^`(.*)`$/, "$1");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function toPosixPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}
