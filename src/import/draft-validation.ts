import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const allowedCardKinds = new Set(["starter", "normal", "legend", "mayhem", "megaMayhem", "wildMagic", "limpWand", "familiar"]);
const allowedCardTypes = new Set(["wizardCard", "creature", "spell", "treasure", "location", "familiar", "legend"]);
const allowedMarkers = new Set(["ongoing", "attack", "defense", "activate", "marketChipMarker"]);
const forbiddenRuntimeFields = new Set(["engine", "effects", "runtimeSchema", "playableInV0", "mappingStatus"]);
const numberedImportIdCategories = new Set([
  "main",
  "legend",
  "mega_mayhem",
  "starter",
  "familiar",
  "wizard_property",
  "dead_wizard_token",
]);
const singletonImportIds = new Map([
  ["esw2_dbg__wild_magic", "wild_magic"],
  ["esw2_dbg__limp_wand", "limp_wand"],
]);
const defaultDraftInputPaths = [
  "data/import/cards/main/drafts",
  "data/import/cards/legend/drafts",
  "data/import/cards/starter/drafts",
  "data/import/cards/familiar/drafts",
  "data/import/cards/special/drafts",
  "data/import/tokens/wizard-property/drafts",
  "data/import/tokens/dead-wizard-token/drafts",
];

export interface DraftValidationMessage {
  filePath: string;
  message: string;
}

export interface DraftValidationResult {
  ok: boolean;
  filesChecked: number;
  errors: DraftValidationMessage[];
  warnings: DraftValidationMessage[];
}

export interface ValidateCardDraftOptions {
  filePath?: string;
}

export type ValidateDraftOptions = ValidateCardDraftOptions;

export function validateDraft(draft: unknown, options: ValidateDraftOptions = {}): DraftValidationResult {
  const filePath = options.filePath ?? "<draft>";
  if (!isRecord(draft)) {
    return result([message(filePath, "draft must be a JSON object")], []);
  }

  if (draft["draftKind"] === "cardDraft") {
    return validateCardDraft(draft, options);
  }

  if (draft["draftKind"] === "wizardPropertyDraft") {
    return validateWizardPropertyDraft(draft, options);
  }

  if (draft["draftKind"] === "deadWizardTokenDraft") {
    return validateDeadWizardTokenDraft(draft, options);
  }

  const errors = [message(filePath, "draftKind must be one of cardDraft, wizardPropertyDraft, deadWizardTokenDraft")];
  for (const fieldName of forbiddenRuntimeFields) {
    if (fieldName in draft) {
      errors.push(message(filePath, `draft contains forbidden runtime field '${fieldName}'`));
    }
  }

  return result(errors, []);
}

export function validateCardDraft(draft: unknown, options: ValidateCardDraftOptions = {}): DraftValidationResult {
  const filePath = options.filePath ?? "<draft>";
  const errors: DraftValidationMessage[] = [];
  const warnings: DraftValidationMessage[] = [];

  if (!isRecord(draft)) {
    errors.push(message(filePath, "draft must be a JSON object"));
    return result(errors, warnings);
  }

  for (const fieldName of forbiddenRuntimeFields) {
    if (fieldName in draft) {
      errors.push(message(filePath, `draft contains forbidden runtime field '${fieldName}'`));
    }
  }

  if (draft["schemaVersion"] !== 1) {
    errors.push(message(filePath, "schemaVersion must be 1"));
  }

  if (draft["draftKind"] !== "cardDraft") {
    errors.push(message(filePath, "draftKind must be 'cardDraft'"));
  }

  if (!isNonEmptyString(draft["cardId"])) {
    errors.push(message(filePath, "cardId is required"));
  } else {
    validateNewImportIdStyle(draft["cardId"], "cardId", expectedCardIdCategories(draft["visible"]), filePath, errors);
  }

  validateSource(draft["source"], filePath, errors, warnings);
  validateVisible(draft["visible"], filePath, errors, warnings);

  return result(errors, warnings);
}

export function validateWizardPropertyDraft(draft: unknown, options: ValidateDraftOptions = {}): DraftValidationResult {
  const filePath = options.filePath ?? "<draft>";
  const errors: DraftValidationMessage[] = [];
  const warnings: DraftValidationMessage[] = [];

  if (!isRecord(draft)) {
    errors.push(message(filePath, "draft must be a JSON object"));
    return result(errors, warnings);
  }

  for (const fieldName of forbiddenRuntimeFields) {
    if (fieldName in draft) {
      errors.push(message(filePath, `draft contains forbidden runtime field '${fieldName}'`));
    }
  }

  if (draft["schemaVersion"] !== 1) {
    errors.push(message(filePath, "schemaVersion must be 1"));
  }

  if (draft["draftKind"] !== "wizardPropertyDraft") {
    errors.push(message(filePath, "draftKind must be 'wizardPropertyDraft'"));
  }

  if (!isNonEmptyString(draft["tokenId"])) {
    errors.push(message(filePath, "tokenId is required"));
  } else {
    validateNewImportIdStyle(draft["tokenId"], "tokenId", ["wizard_property"], filePath, errors);
  }

  if (draft["kind"] !== "wizardProperty") {
    errors.push(message(filePath, "kind must be 'wizardProperty'"));
  }

  validateSource(draft["source"], filePath, errors, warnings);
  validateWizardPropertyVisible(draft["visible"], filePath, errors, warnings);

  return result(errors, warnings);
}

export function validateDeadWizardTokenDraft(draft: unknown, options: ValidateDraftOptions = {}): DraftValidationResult {
  const filePath = options.filePath ?? "<draft>";
  const errors: DraftValidationMessage[] = [];
  const warnings: DraftValidationMessage[] = [];

  if (!isRecord(draft)) {
    errors.push(message(filePath, "draft must be a JSON object"));
    return result(errors, warnings);
  }

  for (const fieldName of forbiddenRuntimeFields) {
    if (fieldName in draft) {
      errors.push(message(filePath, `draft contains forbidden runtime field '${fieldName}'`));
    }
  }

  if (draft["schemaVersion"] !== 1) {
    errors.push(message(filePath, "schemaVersion must be 1"));
  }

  if (draft["draftKind"] !== "deadWizardTokenDraft") {
    errors.push(message(filePath, "draftKind must be 'deadWizardTokenDraft'"));
  }

  if (!isNonEmptyString(draft["tokenId"])) {
    errors.push(message(filePath, "tokenId is required"));
  } else {
    validateNewImportIdStyle(draft["tokenId"], "tokenId", ["dead_wizard_token"], filePath, errors);
  }

  if (draft["kind"] !== "deadWizardToken") {
    errors.push(message(filePath, "kind must be 'deadWizardToken'"));
  }

  validateSource(draft["source"], filePath, errors, warnings);
  validateDeadWizardTokenVisible(draft["visible"], filePath, errors, warnings);

  return result(errors, warnings);
}

export function validateDraftFiles(
  rootDir: string,
  inputPaths = defaultDraftInputPaths,
): DraftValidationResult {
  const errors: DraftValidationMessage[] = [];
  const warnings: DraftValidationMessage[] = [];
  let filesChecked = 0;

  for (const inputPath of inputPaths) {
    const absoluteInputPath = path.resolve(rootDir, inputPath);
    const draftFiles = collectJsonFiles(absoluteInputPath);

    for (const draftFile of draftFiles) {
      filesChecked += 1;
      const displayPath = path.relative(rootDir, draftFile).replaceAll("\\", "/");
      let parsed: unknown;

      try {
        parsed = JSON.parse(readFileSync(draftFile, "utf8"));
      } catch (error) {
        errors.push(message(displayPath, `JSON is not readable: ${errorMessage(error)}`));
        continue;
      }

      const draftResult = validateDraft(parsed, { filePath: displayPath });
      errors.push(...draftResult.errors);
      warnings.push(...draftResult.warnings);
    }
  }

  return {
    ok: errors.length === 0,
    filesChecked,
    errors,
    warnings,
  };
}

export function formatDraftValidationResult(validation: DraftValidationResult): string {
  const lines = [`Draft validation: ${validation.filesChecked} file(s)`];

  for (const error of validation.errors) {
    lines.push(`ERROR ${error.filePath}: ${error.message}`);
  }

  for (const warning of validation.warnings) {
    lines.push(`WARNING ${warning.filePath}: ${warning.message}`);
  }

  if (validation.ok) {
    lines.push(`Ready for runtime mapping: 0 error(s), ${validation.warnings.length} warning(s)`);
  } else {
    lines.push(
      `Not ready for runtime mapping: ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`,
    );
  }

  return lines.join("\n");
}

function validateSource(
  source: unknown,
  filePath: string,
  errors: DraftValidationMessage[],
  warnings: DraftValidationMessage[],
): void {
  if (!isRecord(source)) {
    errors.push(message(filePath, "source is required"));
    return;
  }

  if (!isNonEmptyString(source["text"])) {
    errors.push(message(filePath, "source.text is required"));
  }

  if (!isNonEmptyString(source["image"])) {
    warnings.push(message(filePath, "source.image is missing"));
  }
}

function validateVisible(
  visible: unknown,
  filePath: string,
  errors: DraftValidationMessage[],
  warnings: DraftValidationMessage[],
): void {
  if (!isRecord(visible)) {
    errors.push(message(filePath, "visible is required"));
    return;
  }

  if (!isString(visible["nameRu"])) {
    errors.push(message(filePath, "visible.nameRu must be a string"));
  }

  if (!isNumberOrNull(visible["cost"])) {
    errors.push(message(filePath, "visible.cost must be a number or null"));
  }

  if (!isNumberOrNull(visible["victoryPoints"])) {
    errors.push(message(filePath, "visible.victoryPoints must be a number or null"));
  }

  if (!isStringOrNull(visible["typeRu"])) {
    errors.push(message(filePath, "visible.typeRu must be a string or null"));
  }

  if (!isString(visible["textRu"]) || visible["textRu"].trim().length === 0) {
    errors.push(message(filePath, "visible.textRu is required"));
  }

  validateAllowedString(visible["cardKind"], allowedCardKinds, "visible.cardKind", filePath, errors);
  validateStringArray(visible["cardTypes"], "visible.cardTypes", allowedCardTypes, filePath, errors);
  validateStringArray(visible["markers"], "visible.markers", allowedMarkers, filePath, errors);

  const uncertainty = visible["uncertainty"];
  if (!Array.isArray(uncertainty) || !uncertainty.every(isString)) {
    errors.push(message(filePath, "visible.uncertainty must be an array of strings"));
  } else if (uncertainty.length > 0) {
    warnings.push(message(filePath, "visible.uncertainty has entries"));
  }
}

function validateWizardPropertyVisible(
  visible: unknown,
  filePath: string,
  errors: DraftValidationMessage[],
  warnings: DraftValidationMessage[],
): void {
  if (!isRecord(visible)) {
    errors.push(message(filePath, "visible is required"));
    return;
  }

  if (!isNonEmptyString(visible["sourceLabel"])) {
    errors.push(message(filePath, "visible.sourceLabel is required"));
  }

  if (!isString(visible["textRu"]) || visible["textRu"].trim().length === 0) {
    errors.push(message(filePath, "visible.textRu is required"));
  }

  const uncertainty = visible["uncertainty"];
  if (!Array.isArray(uncertainty) || !uncertainty.every(isString)) {
    errors.push(message(filePath, "visible.uncertainty must be an array of strings"));
  } else if (uncertainty.length > 0) {
    warnings.push(message(filePath, "visible.uncertainty has entries"));
  }
}

function validateDeadWizardTokenVisible(
  visible: unknown,
  filePath: string,
  errors: DraftValidationMessage[],
  warnings: DraftValidationMessage[],
): void {
  if (!isRecord(visible)) {
    errors.push(message(filePath, "visible is required"));
    return;
  }

  if (!isNonEmptyString(visible["sourceLabel"])) {
    errors.push(message(filePath, "visible.sourceLabel is required"));
  }

  if (!isString(visible["textRu"]) || visible["textRu"].trim().length === 0) {
    errors.push(message(filePath, "visible.textRu is required"));
  }

  if (!isNumberOrNull(visible["victoryPoints"])) {
    errors.push(message(filePath, "visible.victoryPoints must be a number or null"));
  }

  const uncertainty = visible["uncertainty"];
  if (!Array.isArray(uncertainty) || !uncertainty.every(isString)) {
    errors.push(message(filePath, "visible.uncertainty must be an array of strings"));
  } else if (uncertainty.length > 0) {
    warnings.push(message(filePath, "visible.uncertainty has entries"));
  }
}

function validateAllowedString(
  value: unknown,
  allowedValues: ReadonlySet<string>,
  fieldName: string,
  filePath: string,
  errors: DraftValidationMessage[],
): void {
  if (!isString(value) || !allowedValues.has(value)) {
    errors.push(message(filePath, `${fieldName} must be one of ${Array.from(allowedValues).join(", ")}`));
  }
}

function validateNewImportIdStyle(
  id: string,
  fieldName: string,
  expectedCategories: string[],
  filePath: string,
  errors: DraftValidationMessage[],
): void {
  const category = parseNewImportIdCategory(id);
  if (category === undefined) {
    errors.push(message(filePath, `${fieldName} must use new import ID style esw2_dbg__<category>_<number>`));
    return;
  }

  if (expectedCategories.length > 0 && !expectedCategories.includes(category)) {
    errors.push(
      message(
        filePath,
        `${fieldName} category '${category}' does not match draft category; expected ${expectedCategories.join(" or ")}`,
      ),
    );
  }
}

function parseNewImportIdCategory(id: string): string | undefined {
  const singletonCategory = singletonImportIds.get(id);
  if (singletonCategory !== undefined) {
    return singletonCategory;
  }

  const match = /^esw2_dbg__(.+)_([0-9]{3})$/.exec(id);
  if (match === null) {
    return undefined;
  }

  const category = match[1];
  if (category === undefined) {
    return undefined;
  }

  return numberedImportIdCategories.has(category) ? category : undefined;
}

function expectedCardIdCategories(visible: unknown): string[] {
  if (!isRecord(visible)) {
    return [];
  }

  switch (visible["cardKind"]) {
    case "normal":
      return ["main"];
    case "legend":
      return ["legend"];
    case "starter":
      return ["starter"];
    case "familiar":
      return ["familiar"];
    case "wildMagic":
      return ["wild_magic"];
    case "limpWand":
      return ["limp_wand"];
    default:
      return [];
  }
}

function validateStringArray(
  value: unknown,
  fieldName: string,
  allowedValues: ReadonlySet<string>,
  filePath: string,
  errors: DraftValidationMessage[],
): void {
  if (!Array.isArray(value)) {
    errors.push(message(filePath, `${fieldName} must be an array`));
    return;
  }

  for (const item of value) {
    if (!isString(item) || !allowedValues.has(item)) {
      errors.push(message(filePath, `${fieldName} contains unsupported value ${String(item)}`));
    }
  }
}

function collectJsonFiles(absoluteInputPath: string): string[] {
  if (!existsSync(absoluteInputPath)) {
    return [];
  }

  const inputStat = statSync(absoluteInputPath);
  if (inputStat.isFile()) {
    return absoluteInputPath.endsWith(".json") ? [absoluteInputPath] : [];
  }

  return readdirSync(absoluteInputPath)
    .filter((fileName) => fileName.endsWith(".json") && !fileName.startsWith("_"))
    .sort()
    .map((fileName) => path.join(absoluteInputPath, fileName));
}

function result(errors: DraftValidationMessage[], warnings: DraftValidationMessage[]): DraftValidationResult {
  return {
    ok: errors.length === 0,
    filesChecked: 1,
    errors,
    warnings,
  };
}

function message(filePath: string, messageText: string): DraftValidationMessage {
  return {
    filePath,
    message: messageText,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return isString(value) || value === null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return (typeof value === "number" && Number.isSafeInteger(value)) || value === null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
