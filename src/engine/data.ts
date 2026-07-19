import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isPlainRecord } from "../common.js";
import {
  resolveEffectRuntimeCatalogEntry,
  type EffectRuntimeMode,
  type EffectRuntimeSourceKind,
} from "./effect-runtime-registry.js";
import {
  isEffectTiming,
  isRuntimeEffectCondition,
  isRuntimeEffectCost,
  isRuntimeEffectTarget,
  isRuntimeEffectTargetSelector,
  isRuntimeEffectId,
  isWildMagicOption,
  type RuntimeEffect,
  type AttackOutcomeBranch,
  type RuntimeEffectFields,
  type WildMagicOption,
} from "./runtime-effect.js";

type RuntimeJsonDecoder<T> = (value: unknown) => DecodeResult<T>;

const CANONICAL_STARTER_TEMPLATE = new Map([
  ["esw2_dbg__starter_001", 6],
  ["esw2_dbg__starter_002", 3],
  ["esw2_dbg__starter_003", 1],
]);
const CARD_KINDS = new Set<string>([
  "starter",
  "normal",
  "legend",
  "mayhem",
  "megaMayhem",
  "wildMagic",
  "limpWand",
  "familiar",
]);
const TOKEN_KINDS = new Set<string>(["deadWizardToken", "wizardProperty"]);

export type CardKind =
  | "starter"
  | "normal"
  | "legend"
  | "mayhem"
  | "megaMayhem"
  | "wildMagic"
  | "limpWand"
  | "familiar";

export interface RuntimeSourceMetadata {
  image: string;
  draft?: string;
  text?: string;
}

export interface CardDefinition {
  schemaVersion: number;
  cardId: string;
  source: RuntimeSourceMetadata;
  visible: {
    nameRu: string;
    cost: number | null;
    victoryPoints: number | null;
    typeRu: string | null;
    cardKind: CardKind;
    cardTypes: string[];
    markers: string[];
  };
  engine: {
    runtimeSchema: "krutagidon.cardDefinition.v0";
    mappingStatus: string;
    playableInV0: boolean;
    cardKind: CardKind;
    cardTypes: string[];
    tags?: string[];
    cost: number;
    victoryPoints: number;
    isOngoing: boolean;
    marketChipMarker: boolean;
    effects: RuntimeEffect[];
    unsupportedMechanics: string[];
  };
}

export interface DeckComposition {
  schemaVersion: number;
  deckId: string;
  runtimeSchema: "krutagidon.deckComposition.v0";
  role: string;
  mappingStatus: string;
  entries: DeckEntry[];
}

export interface DeckEntry {
  cardId: string;
  count: number;
}

export type TokenKind = "deadWizardToken" | "wizardProperty";

interface BaseTokenDefinition {
  schemaVersion: number;
  tokenId: string;
  runtimeSchema: "krutagidon.tokenDefinition.v0";
  kind: TokenKind;
  source: RuntimeSourceMetadata;
}

export interface DeadWizardTokenDefinition extends BaseTokenDefinition {
  kind: "deadWizardToken";
  victoryPoints: number;
  effects: RuntimeEffect[];
}

export interface WizardPropertyDefinition extends BaseTokenDefinition {
  kind: "wizardProperty";
  visible?: {
    textRu: string;
    sourceLabel?: string;
  };
  clarifications?: string[];
  engine?: {
    mappingStatus: string;
    playableInV0: boolean;
    effects: RuntimeEffect[];
    unsupportedMechanics: string[];
  };
}

export type TokenDefinition =
  | DeadWizardTokenDefinition
  | WizardPropertyDefinition;

export interface TokenStackComposition {
  schemaVersion: number;
  stackId: string;
  runtimeSchema: "krutagidon.tokenStack.v0";
  role: string;
  mappingStatus: string;
  entries: TokenStackEntry[];
}

export interface TokenStackEntry {
  tokenId: string;
  count: number;
}

export interface DataPackManifest {
  schemaVersion: number;
  packId: string;
  runtimeSchema: "krutagidon.dataPack.v0";
  mappingStatus: string;
  cardDefinitionPaths: string[];
  tokenDefinitionPaths?: string[];
  decks?: {
    starterDeck: string;
    mainDeck: string;
    legendDeck: string;
  };
  cardStacks?: {
    wildMagicStack: string;
    limpWandStack: string;
  };
  tokenStacks?: {
    deadWizardTokens: string;
    wizardProperties?: string;
  };
  pools?: {
    familiarPool?: string;
  };
  needsData?: unknown[];
}

export interface LoadedDataPack {
  manifest: DataPackManifest;
  cardDefinitions: ReadonlyMap<string, CardDefinition>;
  tokenDefinitions: ReadonlyMap<string, TokenDefinition>;
  decks: {
    starterDeck: DeckComposition;
    mainDeck: DeckComposition;
    legendDeck: DeckComposition;
    wildMagicStack: DeckComposition;
    limpWandStack: DeckComposition;
    familiarPool: DeckComposition | undefined;
  };
  tokenStacks: {
    deadWizardTokens: TokenStackComposition | undefined;
    wizardProperties: TokenStackComposition | undefined;
  };
}

export type DecodeResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      errors: string[];
    };

export type DataPackValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errors: string[];
    };

export interface DataPackValidationOptions {
  mode?: EffectRuntimeMode;
}

export function loadCurrentRuntimeDataPack(
  rootDir: string,
  manifestPath = "data/packs/current-runtime.json"
): LoadedDataPack {
  const result = decodeCurrentRuntimeDataPack(rootDir, manifestPath);
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }

  return result.value;
}

export function decodeCurrentRuntimeDataPack(
  rootDir: string,
  manifestPath = "data/packs/current-runtime.json"
): DecodeResult<LoadedDataPack> {
  const manifestResult = decodeJsonFile(
    rootDir,
    manifestPath,
    "manifest",
    decodeDataPackManifest
  );
  if (!manifestResult.ok) {
    return manifestResult;
  }

  const manifest = manifestResult.value;
  const errors: string[] = [];
  const cardDefinitions = loadCardDefinitions(rootDir, manifest);
  const tokenDefinitions = loadTokenDefinitions(rootDir, manifest);
  const deckPaths = decodeManifestSection(manifest.decks, "decks");
  const cardStackPaths = decodeManifestSection(
    manifest.cardStacks,
    "cardStacks"
  );

  collectDecodeErrors(errors, cardDefinitions);
  collectDecodeErrors(errors, tokenDefinitions);
  collectDecodeErrors(errors, deckPaths);
  collectDecodeErrors(errors, cardStackPaths);

  const starterDeck = decodeRequiredManifestJsonFile(
    rootDir,
    deckPaths,
    "starterDeck",
    "decks.starterDeck",
    decodeDeckComposition
  );
  const mainDeck = decodeRequiredManifestJsonFile(
    rootDir,
    deckPaths,
    "mainDeck",
    "decks.mainDeck",
    decodeDeckComposition
  );
  const legendDeck = decodeRequiredManifestJsonFile(
    rootDir,
    deckPaths,
    "legendDeck",
    "decks.legendDeck",
    decodeDeckComposition
  );
  const wildMagicStack = decodeRequiredManifestJsonFile(
    rootDir,
    cardStackPaths,
    "wildMagicStack",
    "cardStacks.wildMagicStack",
    decodeDeckComposition
  );
  const limpWandStack = decodeRequiredManifestJsonFile(
    rootDir,
    cardStackPaths,
    "limpWandStack",
    "cardStacks.limpWandStack",
    decodeDeckComposition
  );
  const familiarPool =
    manifest.pools?.familiarPool === undefined
      ? undefined
      : decodeJsonFile(
          rootDir,
          manifest.pools.familiarPool,
          "pools.familiarPool",
          decodeDeckComposition
        );
  const deadWizardTokens =
    manifest.tokenStacks?.deadWizardTokens === undefined
      ? undefined
      : decodeJsonFile(
          rootDir,
          manifest.tokenStacks.deadWizardTokens,
          "tokenStacks.deadWizardTokens",
          decodeTokenStackComposition
        );
  const wizardProperties =
    manifest.tokenStacks?.wizardProperties === undefined
      ? undefined
      : decodeJsonFile(
          rootDir,
          manifest.tokenStacks.wizardProperties,
          "tokenStacks.wizardProperties",
          decodeTokenStackComposition
        );

  collectOptionalDecodeErrors(errors, starterDeck);
  collectOptionalDecodeErrors(errors, mainDeck);
  collectOptionalDecodeErrors(errors, legendDeck);
  collectOptionalDecodeErrors(errors, wildMagicStack);
  collectOptionalDecodeErrors(errors, limpWandStack);
  collectOptionalDecodeErrors(errors, familiarPool);
  collectOptionalDecodeErrors(errors, deadWizardTokens);
  collectOptionalDecodeErrors(errors, wizardProperties);

  if (
    errors.length > 0 ||
    !cardDefinitions.ok ||
    !tokenDefinitions.ok ||
    !deckPaths.ok ||
    !cardStackPaths.ok ||
    !starterDeck ||
    !starterDeck.ok ||
    !mainDeck ||
    !mainDeck.ok ||
    !legendDeck ||
    !legendDeck.ok ||
    !wildMagicStack ||
    !wildMagicStack.ok ||
    !limpWandStack ||
    !limpWandStack.ok ||
    familiarPool?.ok === false ||
    deadWizardTokens?.ok === false ||
    wizardProperties?.ok === false
  ) {
    return decodeFailure(errors);
  }

  return decodeSuccess({
    manifest,
    cardDefinitions: cardDefinitions.value,
    tokenDefinitions: tokenDefinitions.value,
    decks: {
      starterDeck: starterDeck.value,
      mainDeck: mainDeck.value,
      legendDeck: legendDeck.value,
      wildMagicStack: wildMagicStack.value,
      limpWandStack: limpWandStack.value,
      familiarPool: familiarPool?.value,
    },
    tokenStacks: {
      deadWizardTokens: deadWizardTokens?.value,
      wizardProperties: wizardProperties?.value,
    },
  });
}

/** @deprecated Use loadCurrentRuntimeDataPack. */
export function loadV0DataPack(
  rootDir: string,
  manifestPath = "data/packs/current-runtime.json"
): LoadedDataPack {
  return loadCurrentRuntimeDataPack(rootDir, manifestPath);
}

export function validateExecutableDataPack(
  dataPack: LoadedDataPack,
  options: DataPackValidationOptions = {}
): DataPackValidationResult {
  const errors: string[] = [];
  const mode = options.mode ?? "combat";

  errors.push(...validateManifestRuntimePaths(dataPack.manifest));
  errors.push(...validateSetupDataPackCompatibility(dataPack));

  for (const definition of dataPack.cardDefinitions.values()) {
    if (
      dataPack.manifest.mappingStatus === "supported" &&
      definition.engine.mappingStatus !== "supported"
    ) {
      errors.push(
        `Card ${definition.cardId} has non-supported mappingStatus ${definition.engine.mappingStatus} in supported data pack`
      );
    }

    if (!definition.engine.playableInV0) {
      continue;
    }

    if (definition.engine.unsupportedMechanics.length > 0) {
      errors.push(
        `Card ${definition.cardId} has unsupported mechanics ${definition.engine.unsupportedMechanics.join(", ")}`
      );
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect)) {
        continue;
      }

      const effectId = effect["effectId"];
      if (typeof effectId !== "string") {
        errors.push(
          `Card ${definition.cardId} uses unsupported effect id ${String(effectId)}`
        );
        continue;
      }

      errors.push(
        ...validateRuntimeEffectDefinition(
          `Card ${definition.cardId}`,
          effectId,
          effect,
          mode,
          "card"
        )
      );
    }
  }

  for (const definition of dataPack.tokenDefinitions.values()) {
    if (definition.kind === "deadWizardToken") {
      for (const effect of definition.effects) {
        if (!isEffectRecord(effect)) {
          continue;
        }

        const effectId = effect["effectId"];
        if (typeof effectId !== "string") {
          errors.push(
            `Token ${definition.tokenId} uses unsupported effect id ${String(effectId)}`
          );
          continue;
        }

        errors.push(
          ...validateRuntimeEffectDefinition(
            `Token ${definition.tokenId}`,
            effectId,
            effect,
            mode,
            definition.kind
          )
        );
      }
      continue;
    }

    if (
      definition.kind !== "wizardProperty" ||
      definition.engine === undefined ||
      !definition.engine.playableInV0
    ) {
      continue;
    }

    if (definition.engine.unsupportedMechanics.length > 0) {
      errors.push(
        `Token ${definition.tokenId} has unsupported mechanics ${definition.engine.unsupportedMechanics.join(", ")}`
      );
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect)) {
        continue;
      }

      const effectId = effect["effectId"];
      if (typeof effectId !== "string") {
        errors.push(
          `Token ${definition.tokenId} uses unsupported effect id ${String(effectId)}`
        );
        continue;
      }

      errors.push(
        ...validateRuntimeEffectDefinition(
          `Token ${definition.tokenId}`,
          effectId,
          effect,
          mode,
          "wizardProperty"
        )
      );
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return { ok: true };
}

export function isIncompleteFullOnlyDataPack(
  dataPack: Pick<LoadedDataPack, "manifest">
): boolean {
  return dataPack.manifest.mappingStatus === "incomplete-full-only";
}

function validateManifestRuntimePaths(manifest: DataPackManifest): string[] {
  const errors: string[] = [];

  for (const [fieldName, filePath] of collectManifestPaths(manifest)) {
    const normalizedPath = filePath.replaceAll("\\", "/");
    if (
      normalizedPath === "data/import" ||
      normalizedPath.startsWith("data/import/")
    ) {
      errors.push(
        `Manifest ${fieldName} references import-only path ${filePath}`
      );
    }
  }

  return errors;
}

function validateSetupDataPackCompatibility(
  dataPack: LoadedDataPack
): string[] {
  const errors: string[] = [];
  const allowsIncompleteSetup = isIncompleteFullOnlyDataPack(dataPack);

  if (
    !allowsIncompleteSetup &&
    totalDeckEntryCount(dataPack.decks.starterDeck) === 0
  ) {
    errors.push(
      "Data pack manifest must include starter cards outside incomplete-full-only"
    );
  }

  if (
    !allowsIncompleteSetup ||
    totalDeckEntryCount(dataPack.decks.starterDeck) > 0
  ) {
    errors.push(
      ...validateCanonicalStarterTemplate(dataPack.decks.starterDeck)
    );
  }

  if (
    !allowsIncompleteSetup &&
    totalDeckEntryCount(dataPack.decks.mainDeck) === 0
  ) {
    errors.push(
      "Data pack manifest must include main-deck cards outside incomplete-full-only"
    );
  }

  if (
    !allowsIncompleteSetup &&
    totalDeckEntryCount(dataPack.decks.legendDeck) === 0
  ) {
    errors.push(
      "Data pack manifest must include legend-deck cards outside incomplete-full-only"
    );
  }

  if (dataPack.decks.familiarPool === undefined) {
    if (!allowsIncompleteSetup) {
      errors.push(
        "Data pack manifest must define familiar pool outside incomplete-full-only"
      );
    }
  } else if (
    !allowsIncompleteSetup &&
    totalDeckEntryCount(dataPack.decks.familiarPool) < 2
  ) {
    errors.push(
      "Data pack familiar pool must include at least two setup candidates outside incomplete-full-only"
    );
  }

  if (dataPack.tokenStacks.wizardProperties === undefined) {
    if (!allowsIncompleteSetup) {
      errors.push(
        "Data pack manifest must define wizard property stack outside incomplete-full-only"
      );
    }
  } else if (
    !allowsIncompleteSetup &&
    totalTokenStackEntryCount(dataPack.tokenStacks.wizardProperties) === 0
  ) {
    errors.push(
      "Data pack wizard property stack must include at least one token outside incomplete-full-only"
    );
  }

  return errors;
}

function validateCanonicalStarterTemplate(deck: DeckComposition): string[] {
  const errors: string[] = [];
  const actualCounts = new Map<string, number>();
  for (const entry of deck.entries) {
    actualCounts.set(
      entry.cardId,
      (actualCounts.get(entry.cardId) ?? 0) + entry.count
    );
  }

  const expectedTotal = [...CANONICAL_STARTER_TEMPLATE.values()].reduce(
    (total, count) => total + count,
    0
  );
  const actualTotal = totalDeckEntryCount(deck);
  if (actualTotal !== expectedTotal) {
    errors.push(
      `Raw starter template ${deck.deckId} must contain ${expectedTotal} cards before setup modifiers; got ${actualTotal}`
    );
  }

  for (const [cardId, expectedCount] of CANONICAL_STARTER_TEMPLATE) {
    const actualCount = actualCounts.get(cardId) ?? 0;
    if (actualCount !== expectedCount) {
      errors.push(
        `Raw starter template ${deck.deckId} must contain ${expectedCount} ${cardId}; got ${actualCount}`
      );
    }
  }

  for (const cardId of actualCounts.keys()) {
    if (!CANONICAL_STARTER_TEMPLATE.has(cardId)) {
      errors.push(
        `Raw starter template ${deck.deckId} must not include unexpected starter card ${cardId}`
      );
    }
  }

  return errors;
}

function collectManifestPaths(manifest: DataPackManifest): [string, string][] {
  const paths: [string, string][] = [];

  for (const [index, filePath] of manifest.cardDefinitionPaths.entries()) {
    paths.push([`cardDefinitionPaths[${index}]`, filePath]);
  }

  if (manifest.decks !== undefined) {
    paths.push(["decks.starterDeck", manifest.decks.starterDeck]);
    paths.push(["decks.mainDeck", manifest.decks.mainDeck]);
    paths.push(["decks.legendDeck", manifest.decks.legendDeck]);
  }

  if (manifest.cardStacks !== undefined) {
    paths.push([
      "cardStacks.wildMagicStack",
      manifest.cardStacks.wildMagicStack,
    ]);
    paths.push(["cardStacks.limpWandStack", manifest.cardStacks.limpWandStack]);
  }

  for (const [index, filePath] of (
    manifest.tokenDefinitionPaths ?? []
  ).entries()) {
    paths.push([`tokenDefinitionPaths[${index}]`, filePath]);
  }

  if (manifest.tokenStacks?.deadWizardTokens !== undefined) {
    paths.push([
      "tokenStacks.deadWizardTokens",
      manifest.tokenStacks.deadWizardTokens,
    ]);
  }

  if (manifest.tokenStacks?.wizardProperties !== undefined) {
    paths.push([
      "tokenStacks.wizardProperties",
      manifest.tokenStacks.wizardProperties,
    ]);
  }

  if (manifest.pools?.familiarPool !== undefined) {
    paths.push(["pools.familiarPool", manifest.pools.familiarPool]);
  }

  return paths;
}

function totalDeckEntryCount(deck: DeckComposition): number {
  return deck.entries.reduce((total, entry) => total + entry.count, 0);
}

function totalTokenStackEntryCount(stack: TokenStackComposition): number {
  return stack.entries.reduce((total, entry) => total + entry.count, 0);
}

function loadCardDefinitions(
  rootDir: string,
  manifest: DataPackManifest
): DecodeResult<ReadonlyMap<string, CardDefinition>> {
  const errors: string[] = [];
  if (manifest.cardDefinitionPaths.length === 0) {
    errors.push(
      "Runtime data manifest cardDefinitionPaths: Data pack manifest does not define any card definition paths"
    );
  }

  const cards = new Map<string, CardDefinition>();
  const cardSourcePaths = new Map<string, string>();

  for (const cardDefinitionsPath of manifest.cardDefinitionPaths) {
    const pathResult = decodeRuntimePath(
      "cardDefinitionPaths",
      cardDefinitionsPath
    );
    if (!pathResult.ok) {
      errors.push(...pathResult.errors);
      continue;
    }

    const absoluteCardsPath = path.resolve(rootDir, cardDefinitionsPath);
    let fileNames: string[];
    try {
      fileNames = readdirSync(absoluteCardsPath).sort();
    } catch (error) {
      errors.push(
        formatDecodeError(
          "cardDefinitionPaths",
          cardDefinitionsPath,
          errorMessage(error)
        )
      );
      continue;
    }

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
        continue;
      }

      const relativeFilePath = normalizeRuntimeFilePath(
        path.join(cardDefinitionsPath, fileName)
      );
      const card = decodeJsonFile(
        rootDir,
        relativeFilePath,
        "cardDefinitionPaths",
        decodeCardDefinition
      );
      if (!card.ok) {
        errors.push(...card.errors);
        continue;
      }

      const existingSourcePath = cardSourcePaths.get(card.value.cardId);
      if (existingSourcePath !== undefined) {
        errors.push(
          formatDecodeError(
            "cardDefinitionPaths",
            relativeFilePath,
            `Duplicate runtime cardId ${card.value.cardId}: ${existingSourcePath} conflicts with ${relativeFilePath}`
          )
        );
        continue;
      }
      cards.set(card.value.cardId, card.value);
      cardSourcePaths.set(card.value.cardId, relativeFilePath);
    }
  }

  if (errors.length > 0) {
    return decodeFailure(errors);
  }

  return decodeSuccess(cards);
}

function loadTokenDefinitions(
  rootDir: string,
  manifest: DataPackManifest
): DecodeResult<ReadonlyMap<string, TokenDefinition>> {
  const errors: string[] = [];
  const tokens = new Map<string, TokenDefinition>();
  const tokenSourcePaths = new Map<string, string>();

  for (const tokenDefinitionsPath of manifest.tokenDefinitionPaths ?? []) {
    const pathResult = decodeRuntimePath(
      "tokenDefinitionPaths",
      tokenDefinitionsPath
    );
    if (!pathResult.ok) {
      errors.push(...pathResult.errors);
      continue;
    }

    const absoluteTokensPath = path.resolve(rootDir, tokenDefinitionsPath);
    let fileNames: string[];
    try {
      fileNames = readdirSync(absoluteTokensPath).sort();
    } catch (error) {
      errors.push(
        formatDecodeError(
          "tokenDefinitionPaths",
          tokenDefinitionsPath,
          errorMessage(error)
        )
      );
      continue;
    }

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
        continue;
      }

      const relativeFilePath = normalizeRuntimeFilePath(
        path.join(tokenDefinitionsPath, fileName)
      );
      const token = decodeJsonFile(
        rootDir,
        relativeFilePath,
        "tokenDefinitionPaths",
        decodeTokenDefinition
      );
      if (!token.ok) {
        errors.push(...token.errors);
        continue;
      }

      const existingSourcePath = tokenSourcePaths.get(token.value.tokenId);
      if (existingSourcePath !== undefined) {
        errors.push(
          formatDecodeError(
            "tokenDefinitionPaths",
            relativeFilePath,
            `Duplicate runtime tokenId ${token.value.tokenId}: ${existingSourcePath} conflicts with ${relativeFilePath}`
          )
        );
        continue;
      }
      tokens.set(token.value.tokenId, token.value);
      tokenSourcePaths.set(token.value.tokenId, relativeFilePath);
    }
  }

  if (errors.length > 0) {
    return decodeFailure(errors);
  }

  return decodeSuccess(tokens);
}

function decodeManifestSection<T>(
  section: T | undefined,
  name: string
): DecodeResult<T> {
  if (section === undefined) {
    return decodeFailure([
      `Runtime data manifest ${name}: Data pack manifest does not define ${name}`,
    ]);
  }

  return decodeSuccess(section);
}

function decodeRuntimePath(
  fieldName: string,
  filePath: string
): DecodeResult<string> {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (
    normalizedPath === "data/import" ||
    normalizedPath.startsWith("data/import/")
  ) {
    return decodeFailure([
      `Runtime data manifest ${fieldName}: Manifest ${fieldName} references import-only path ${filePath}`,
    ]);
  }

  return decodeSuccess(filePath);
}

function decodeRequiredManifestJsonFile<
  T,
  TSection extends Record<TKey, string>,
  TKey extends string,
>(
  rootDir: string,
  section: DecodeResult<TSection>,
  key: TKey,
  sectionName: string,
  decoder: RuntimeJsonDecoder<T>
): DecodeResult<T> | false {
  if (!section.ok) {
    return false;
  }

  return decodeJsonFile(rootDir, section.value[key], sectionName, decoder);
}

function decodeDataPackManifest(
  value: unknown
): DecodeResult<DataPackManifest> {
  const errors: string[] = [];
  const record = expectRuntimeRecord(value, "manifest", errors);
  if (record === undefined) {
    return decodeFailure(errors);
  }

  const schemaVersion = requireNumberField(record, "schemaVersion", errors);
  const packId = requireStringField(record, "packId", errors);
  const runtimeSchema = requireExactStringField(
    record,
    "runtimeSchema",
    "krutagidon.dataPack.v0",
    errors
  );
  const mappingStatus = requireStringField(record, "mappingStatus", errors);
  const cardDefinitionPaths = requireStringArrayField(
    record,
    "cardDefinitionPaths",
    errors
  );
  const tokenDefinitionPaths = optionalStringArrayField(
    record,
    "tokenDefinitionPaths",
    errors
  );
  const needsData = optionalUnknownArrayField(record, "needsData", errors);

  const decks = optionalRecordField(record, "decks", errors);
  let decodedDecks: DataPackManifest["decks"];
  if (decks !== undefined) {
    const starterDeck = requireStringField(
      decks,
      "decks.starterDeck",
      errors,
      "starterDeck"
    );
    const mainDeck = requireStringField(
      decks,
      "decks.mainDeck",
      errors,
      "mainDeck"
    );
    const legendDeck = requireStringField(
      decks,
      "decks.legendDeck",
      errors,
      "legendDeck"
    );
    if (
      starterDeck !== undefined &&
      mainDeck !== undefined &&
      legendDeck !== undefined
    ) {
      decodedDecks = {
        starterDeck,
        mainDeck,
        legendDeck,
      };
    }
  }

  const cardStacks = optionalRecordField(record, "cardStacks", errors);
  let decodedCardStacks: DataPackManifest["cardStacks"];
  if (cardStacks !== undefined) {
    const wildMagicStack = requireStringField(
      cardStacks,
      "cardStacks.wildMagicStack",
      errors,
      "wildMagicStack"
    );
    const limpWandStack = requireStringField(
      cardStacks,
      "cardStacks.limpWandStack",
      errors,
      "limpWandStack"
    );
    if (wildMagicStack !== undefined && limpWandStack !== undefined) {
      decodedCardStacks = {
        wildMagicStack,
        limpWandStack,
      };
    }
  }

  const tokenStacks = optionalRecordField(record, "tokenStacks", errors);
  let decodedTokenStacks: DataPackManifest["tokenStacks"];
  if (tokenStacks !== undefined) {
    const deadWizardTokens = requireStringField(
      tokenStacks,
      "tokenStacks.deadWizardTokens",
      errors,
      "deadWizardTokens"
    );
    const wizardProperties = optionalStringField(
      tokenStacks,
      "tokenStacks.wizardProperties",
      errors,
      "wizardProperties"
    );
    if (deadWizardTokens !== undefined) {
      decodedTokenStacks = {
        deadWizardTokens,
        ...(wizardProperties === undefined ? {} : { wizardProperties }),
      };
    }
  }

  const pools = optionalRecordField(record, "pools", errors);
  let decodedPools: DataPackManifest["pools"];
  if (pools !== undefined) {
    const familiarPool = optionalStringField(
      pools,
      "pools.familiarPool",
      errors,
      "familiarPool"
    );
    decodedPools =
      familiarPool === undefined
        ? {}
        : {
            familiarPool,
          };
  }

  if (
    errors.length > 0 ||
    schemaVersion === undefined ||
    packId === undefined ||
    runtimeSchema === undefined ||
    mappingStatus === undefined ||
    cardDefinitionPaths === undefined
  ) {
    return decodeFailure(errors);
  }

  return decodeSuccess({
    schemaVersion,
    packId,
    runtimeSchema,
    mappingStatus,
    cardDefinitionPaths,
    ...(tokenDefinitionPaths === undefined ? {} : { tokenDefinitionPaths }),
    ...(decodedDecks === undefined ? {} : { decks: decodedDecks }),
    ...(decodedCardStacks === undefined
      ? {}
      : { cardStacks: decodedCardStacks }),
    ...(decodedTokenStacks === undefined
      ? {}
      : { tokenStacks: decodedTokenStacks }),
    ...(decodedPools === undefined ? {} : { pools: decodedPools }),
    ...(needsData === undefined ? {} : { needsData }),
  });
}

function decodeCardDefinition(value: unknown): DecodeResult<CardDefinition> {
  const errors: string[] = [];
  const record = expectRuntimeRecord(value, "card definition", errors);
  if (record === undefined) {
    return decodeFailure(errors);
  }

  const schemaVersion = requireNumberField(record, "schemaVersion", errors);
  const cardId = requireStringField(record, "cardId", errors);
  const source = decodeRuntimeSourceMetadata(record, errors);

  const visible = requireRecordField(record, "visible", errors);
  let decodedVisible: CardDefinition["visible"] | undefined;
  if (visible !== undefined) {
    const nameRu = requireStringField(
      visible,
      "visible.nameRu",
      errors,
      "nameRu"
    );
    const cost = requireNumberOrNullField(
      visible,
      "visible.cost",
      errors,
      "cost"
    );
    const victoryPoints = requireNumberOrNullField(
      visible,
      "visible.victoryPoints",
      errors,
      "victoryPoints"
    );
    const typeRu = requireStringOrNullField(
      visible,
      "visible.typeRu",
      errors,
      "typeRu"
    );
    const cardKind = requireCardKindField(
      visible,
      "visible.cardKind",
      errors,
      "cardKind"
    );
    const cardTypes = requireStringArrayField(
      visible,
      "visible.cardTypes",
      errors,
      "cardTypes"
    );
    const markers = requireStringArrayField(
      visible,
      "visible.markers",
      errors,
      "markers"
    );
    if (
      nameRu !== undefined &&
      cost !== undefined &&
      victoryPoints !== undefined &&
      typeRu !== undefined &&
      cardKind !== undefined &&
      cardTypes !== undefined &&
      markers !== undefined
    ) {
      decodedVisible = {
        nameRu,
        cost,
        victoryPoints,
        typeRu,
        cardKind,
        cardTypes,
        markers,
      };
    }
  }

  const engine = requireRecordField(record, "engine", errors);
  let decodedEngine: CardDefinition["engine"] | undefined;
  if (engine !== undefined) {
    const runtimeSchema = requireExactStringField(
      engine,
      "engine.runtimeSchema",
      "krutagidon.cardDefinition.v0",
      errors,
      "runtimeSchema"
    );
    const mappingStatus = requireStringField(
      engine,
      "engine.mappingStatus",
      errors,
      "mappingStatus"
    );
    const playableInV0 = requireBooleanField(
      engine,
      "engine.playableInV0",
      errors,
      "playableInV0"
    );
    const cardKind = requireCardKindField(
      engine,
      "engine.cardKind",
      errors,
      "cardKind"
    );
    const cardTypes = requireStringArrayField(
      engine,
      "engine.cardTypes",
      errors,
      "cardTypes"
    );
    const tags = optionalStringArrayField(
      engine,
      "engine.tags",
      errors,
      "tags"
    );
    const engineCost = requireNumberOrNullField(
      engine,
      "engine.cost",
      errors,
      "cost"
    );
    const victoryPoints = requireNumberField(
      engine,
      "engine.victoryPoints",
      errors,
      "victoryPoints"
    );
    const isOngoing = requireBooleanField(
      engine,
      "engine.isOngoing",
      errors,
      "isOngoing"
    );
    const marketChipMarker = requireBooleanField(
      engine,
      "engine.marketChipMarker",
      errors,
      "marketChipMarker"
    );
    const effects = requireRuntimeEffectArrayField(
      engine,
      "engine.effects",
      errors,
      "effects"
    );
    const unsupportedMechanics = requireUnsupportedMechanicsField(
      engine,
      "engine.unsupportedMechanics",
      errors,
      "unsupportedMechanics"
    );
    if (
      runtimeSchema !== undefined &&
      mappingStatus !== undefined &&
      playableInV0 !== undefined &&
      cardKind !== undefined &&
      cardTypes !== undefined &&
      engineCost !== undefined &&
      victoryPoints !== undefined &&
      isOngoing !== undefined &&
      marketChipMarker !== undefined &&
      effects !== undefined &&
      unsupportedMechanics !== undefined
    ) {
      decodedEngine = {
        runtimeSchema,
        mappingStatus,
        playableInV0,
        cardKind,
        cardTypes,
        ...(tags === undefined ? {} : { tags }),
        cost: engineCost ?? 0,
        victoryPoints,
        isOngoing,
        marketChipMarker,
        effects,
        unsupportedMechanics,
      };
    }
  }

  if (
    errors.length > 0 ||
    schemaVersion === undefined ||
    cardId === undefined ||
    source === undefined ||
    decodedVisible === undefined ||
    decodedEngine === undefined
  ) {
    return decodeFailure(errors);
  }

  return decodeSuccess({
    schemaVersion,
    cardId,
    source,
    visible: decodedVisible,
    engine: decodedEngine,
  });
}

function decodeRuntimeSourceMetadata(
  record: Record<string, unknown>,
  errors: string[]
): RuntimeSourceMetadata | undefined {
  const source = requireRecordField(record, "source", errors);
  if (source === undefined) {
    return undefined;
  }

  const image = requireNonEmptyStringField(
    source,
    "source.image",
    errors,
    "image"
  );
  const draft = optionalNonEmptyStringField(
    source,
    "source.draft",
    errors,
    "draft"
  );
  const text = optionalNonEmptyStringField(
    source,
    "source.text",
    errors,
    "text"
  );
  if (
    image === undefined ||
    (source["draft"] !== undefined && draft === undefined) ||
    (source["text"] !== undefined && text === undefined)
  ) {
    return undefined;
  }

  return {
    image,
    ...(draft === undefined ? {} : { draft }),
    ...(text === undefined ? {} : { text }),
  };
}

function decodeTokenDefinition(value: unknown): DecodeResult<TokenDefinition> {
  const errors: string[] = [];
  const record = expectRuntimeRecord(value, "token definition", errors);
  if (record === undefined) {
    return decodeFailure(errors);
  }

  const schemaVersion = requireNumberField(record, "schemaVersion", errors);
  const tokenId = requireStringField(record, "tokenId", errors);
  const runtimeSchema = requireExactStringField(
    record,
    "runtimeSchema",
    "krutagidon.tokenDefinition.v0",
    errors
  );
  const source = decodeRuntimeSourceMetadata(record, errors);
  const kind = requireTokenKindField(record, "kind", errors);

  if (kind === "deadWizardToken") {
    const victoryPoints = requireNumberField(record, "victoryPoints", errors);
    const effects = requireRuntimeEffectArrayField(record, "effects", errors);
    if (
      errors.length > 0 ||
      schemaVersion === undefined ||
      tokenId === undefined ||
      runtimeSchema === undefined ||
      source === undefined ||
      victoryPoints === undefined ||
      effects === undefined
    ) {
      return decodeFailure(errors);
    }

    return decodeSuccess({
      schemaVersion,
      tokenId,
      runtimeSchema,
      kind,
      source,
      victoryPoints,
      effects,
    });
  } else if (kind === "wizardProperty") {
    const visible = optionalRecordField(record, "visible", errors);
    let decodedVisible: WizardPropertyDefinition["visible"];
    if (visible !== undefined) {
      if (Object.prototype.hasOwnProperty.call(visible, "sourceImage")) {
        errors.push(
          "visible.sourceImage is not supported; use source.image instead"
        );
      }
      const textRu = requireStringField(
        visible,
        "visible.textRu",
        errors,
        "textRu"
      );
      const sourceLabel = optionalStringField(
        visible,
        "visible.sourceLabel",
        errors,
        "sourceLabel"
      );
      if (textRu !== undefined) {
        decodedVisible = {
          textRu,
          ...(sourceLabel === undefined ? {} : { sourceLabel }),
        };
      }
    }
    const clarifications = optionalStringArrayField(
      record,
      "clarifications",
      errors
    );

    const engine = optionalRecordField(record, "engine", errors);
    let decodedEngine: WizardPropertyDefinition["engine"];
    if (engine !== undefined) {
      const mappingStatus = requireStringField(
        engine,
        "engine.mappingStatus",
        errors,
        "mappingStatus"
      );
      const playableInV0 = requireBooleanField(
        engine,
        "engine.playableInV0",
        errors,
        "playableInV0"
      );
      const effects = requireRuntimeEffectArrayField(
        engine,
        "engine.effects",
        errors,
        "effects"
      );
      const unsupportedMechanics = requireStringArrayField(
        engine,
        "engine.unsupportedMechanics",
        errors,
        "unsupportedMechanics"
      );
      if (
        mappingStatus !== undefined &&
        playableInV0 !== undefined &&
        effects !== undefined &&
        unsupportedMechanics !== undefined
      ) {
        decodedEngine = {
          mappingStatus,
          playableInV0,
          effects,
          unsupportedMechanics,
        };
      }
    }

    if (
      errors.length > 0 ||
      schemaVersion === undefined ||
      tokenId === undefined ||
      runtimeSchema === undefined ||
      source === undefined
    ) {
      return decodeFailure(errors);
    }

    return decodeSuccess({
      schemaVersion,
      tokenId,
      runtimeSchema,
      kind,
      source,
      ...(decodedVisible === undefined ? {} : { visible: decodedVisible }),
      ...(clarifications === undefined ? {} : { clarifications }),
      ...(decodedEngine === undefined ? {} : { engine: decodedEngine }),
    });
  }

  return decodeFailure(errors);
}

function decodeDeckComposition(value: unknown): DecodeResult<DeckComposition> {
  const errors: string[] = [];
  const record = expectRuntimeRecord(value, "deck composition", errors);
  if (record === undefined) {
    return decodeFailure(errors);
  }

  const schemaVersion = requireNumberField(record, "schemaVersion", errors);
  const deckId = requireStringField(record, "deckId", errors);
  const runtimeSchema = requireExactStringField(
    record,
    "runtimeSchema",
    "krutagidon.deckComposition.v0",
    errors
  );
  const role = requireStringField(record, "role", errors);
  const mappingStatus = requireStringField(record, "mappingStatus", errors);

  const entries = requireArrayField(record, "entries", errors);
  const decodedEntries: DeckEntry[] = [];
  if (entries !== undefined) {
    for (const [index, entry] of entries.entries()) {
      const entryRecord = expectRuntimeRecord(
        entry,
        `entries[${index}]`,
        errors
      );
      if (entryRecord === undefined) {
        continue;
      }
      const cardId = requireStringField(
        entryRecord,
        `entries[${index}].cardId`,
        errors,
        "cardId"
      );
      const count = requireNumberField(
        entryRecord,
        `entries[${index}].count`,
        errors,
        "count"
      );
      if (cardId !== undefined && count !== undefined) {
        decodedEntries.push({
          cardId,
          count,
        });
      }
    }
  }

  if (
    errors.length > 0 ||
    schemaVersion === undefined ||
    deckId === undefined ||
    runtimeSchema === undefined ||
    role === undefined ||
    mappingStatus === undefined ||
    entries === undefined
  ) {
    return decodeFailure(errors);
  }

  return decodeSuccess({
    schemaVersion,
    deckId,
    runtimeSchema,
    role,
    mappingStatus,
    entries: decodedEntries,
  });
}

function decodeTokenStackComposition(
  value: unknown
): DecodeResult<TokenStackComposition> {
  const errors: string[] = [];
  const record = expectRuntimeRecord(value, "token stack composition", errors);
  if (record === undefined) {
    return decodeFailure(errors);
  }

  const schemaVersion = requireNumberField(record, "schemaVersion", errors);
  const stackId = requireStringField(record, "stackId", errors);
  const runtimeSchema = requireExactStringField(
    record,
    "runtimeSchema",
    "krutagidon.tokenStack.v0",
    errors
  );
  const role = requireStringField(record, "role", errors);
  const mappingStatus = requireStringField(record, "mappingStatus", errors);

  const entries = requireArrayField(record, "entries", errors);
  const decodedEntries: TokenStackEntry[] = [];
  if (entries !== undefined) {
    for (const [index, entry] of entries.entries()) {
      const entryRecord = expectRuntimeRecord(
        entry,
        `entries[${index}]`,
        errors
      );
      if (entryRecord === undefined) {
        continue;
      }
      const tokenId = requireStringField(
        entryRecord,
        `entries[${index}].tokenId`,
        errors,
        "tokenId"
      );
      const count = requireNumberField(
        entryRecord,
        `entries[${index}].count`,
        errors,
        "count"
      );
      if (tokenId !== undefined && count !== undefined) {
        decodedEntries.push({
          tokenId,
          count,
        });
      }
    }
  }

  if (
    errors.length > 0 ||
    schemaVersion === undefined ||
    stackId === undefined ||
    runtimeSchema === undefined ||
    role === undefined ||
    mappingStatus === undefined ||
    entries === undefined
  ) {
    return decodeFailure(errors);
  }

  return decodeSuccess({
    schemaVersion,
    stackId,
    runtimeSchema,
    role,
    mappingStatus,
    entries: decodedEntries,
  });
}

function decodeJsonFile<T>(
  rootDir: string,
  filePath: string,
  sectionName: string,
  decoder: RuntimeJsonDecoder<T>
): DecodeResult<T> {
  const absolutePath = path.resolve(rootDir, filePath);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
  } catch (error) {
    return decodeFailure([
      formatDecodeError(sectionName, filePath, errorMessage(error)),
    ]);
  }

  const decoded = decoder(value);
  if (!decoded.ok) {
    return decodeFailure(
      decoded.errors.map((error) =>
        formatDecodeError(sectionName, filePath, error)
      )
    );
  }

  return decoded;
}

function decodeSuccess<T>(value: T): DecodeResult<T> {
  return {
    ok: true,
    value,
  };
}

function decodeFailure(errors: string[]): DecodeResult<never> {
  return {
    ok: false,
    errors,
  };
}

function collectDecodeErrors<T>(
  errors: string[],
  result: DecodeResult<T>
): void {
  if (!result.ok) {
    errors.push(...result.errors);
  }
}

function collectOptionalDecodeErrors<T>(
  errors: string[],
  result: DecodeResult<T> | false | undefined
): void {
  if (result !== undefined && result !== false && !result.ok) {
    errors.push(...result.errors);
  }
}

function formatDecodeError(
  sectionName: string,
  filePath: string,
  message: string
): string {
  return `Runtime data ${sectionName} ${normalizeRuntimeFilePath(filePath)}: ${message}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectRuntimeRecord(
  value: unknown,
  label: string,
  errors: string[]
): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  return value;
}

function requireRecordField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): Record<string, unknown> | undefined {
  const value = record[key];
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  return value;
}

function optionalRecordField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  return value;
}

function requireArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): unknown[] | undefined {
  const value = record[key];
  if (!isUnknownArray(value)) {
    errors.push(`${label} must be an array`);
    return undefined;
  }

  return value;
}

function requireUnknownArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): ReturnType<typeof requireArrayField> {
  const value = requireArrayField(record, label, errors, key);
  return value === undefined ? undefined : [...value];
}

function requireRuntimeEffectArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): RuntimeEffect[] | undefined {
  const values = requireArrayField(record, label, errors, key);
  if (values === undefined) {
    return undefined;
  }

  const effects: RuntimeEffect[] = [];
  for (const [index, value] of values.entries()) {
    if (!isPlainRecord(value)) {
      errors.push(`${label}[${index}] must be an object`);
      continue;
    }

    if (!isRuntimeEffectId(value["effectId"])) {
      errors.push(`${label}[${index}].effectId must be a supported effect id`);
      continue;
    }

    if (!isEffectTiming(value["timing"])) {
      errors.push(
        `${label}[${index}].timing must be a supported effect timing`
      );
      continue;
    }

    if (
      value["condition"] !== undefined &&
      !isRuntimeEffectCondition(value["condition"])
    ) {
      errors.push(
        `${label}[${index}].condition must use a supported condition shape`
      );
      continue;
    }

    if (
      value["costs"] !== undefined &&
      (!Array.isArray(value["costs"]) ||
        !value["costs"].every(isRuntimeEffectCost))
    ) {
      errors.push(`${label}[${index}].costs must use supported cost shapes`);
      continue;
    }

    if (
      value["target"] !== undefined &&
      !isRuntimeEffectTarget(value["target"])
    ) {
      errors.push(`${label}[${index}].target must use a supported selector`);
      continue;
    }

    if (
      value["targetSelector"] !== undefined &&
      !isRuntimeEffectTargetSelector(value["targetSelector"])
    ) {
      errors.push(
        `${label}[${index}].targetSelector must be a supported selector`
      );
      continue;
    }

    const decodedEffect: Record<string, unknown> = {
      effectId: value["effectId"],
      timing: value["timing"],
    };
    for (const field of runtimeEffectPayloadFields) {
      if (value[field] !== undefined) {
        if (field === "options" && value["effectId"] === "wild_magic_choice") {
          if (!Array.isArray(value[field])) {
            errors.push(`${label}[${index}].options must be an array`);
            continue;
          }
          const options: WildMagicOption[] = [];
          for (const option of value[field]) {
            if (!isWildMagicOption(option)) {
              errors.push(
                `${label}[${index}].options contains malformed Wild Magic option`
              );
              continue;
            }
            options.push(
              option.effectId === "add_power"
                ? { effectId: "add_power", amount: option.amount }
                : {
                    effectId: "play_top_card_from_foe_deck",
                    targetSelector: "chosenFoe",
                  }
            );
          }
          decodedEffect[field] = options;
        } else if (
          field === "branchEffects" ||
          field === "onDamageDealt" ||
          field === "onKill"
        ) {
          const branches =
            field === "branchEffects"
              ? requireRuntimeEffectArrayField(
                  { branchEffects: value[field] },
                  `${label}[${index}].${field}`,
                  errors,
                  "branchEffects"
                )
              : decodeRuntimeEffectBranchArray(
                  value[field],
                  `${label}[${index}].${field}`,
                  errors
                );
          if (branches !== undefined) {
            decodedEffect[field] = branches;
          }
        } else {
          decodedEffect[field] = value[field];
        }
      }
    }
    effects.push(decodedEffect as unknown as RuntimeEffect);
  }

  return effects;
}

function decodeRuntimeEffectBranchArray(
  value: unknown,
  label: string,
  errors: string[]
): AttackOutcomeBranch[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return undefined;
  }

  const branches: AttackOutcomeBranch[] = [];
  for (const [index, branch] of value.entries()) {
    const decoded = decodeAttackOutcomeBranch(
      branch,
      `${label}[${index}]`,
      errors
    );
    if (decoded !== undefined) {
      branches.push(decoded);
    }
  }

  return branches;
}

function decodeAttackOutcomeBranch(
  value: unknown,
  label: string,
  errors: string[]
): AttackOutcomeBranch | undefined {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  const effectId = value["effectId"];
  if (!isAttackOutcomeEffectId(effectId)) {
    errors.push(
      `${label} uses unsupported attack outcome branch ${String(effectId)}`
    );
    return undefined;
  }

  if (effectId !== "gain_status" && value["target"] !== undefined) {
    errors.push(`${label}.target is not supported for ${effectId}`);
    return undefined;
  }

  if (effectId === "gain_chips" || effectId === "return_discard_to_hand") {
    const amount = value["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      errors.push(`${label}.amount must be a positive integer`);
      return undefined;
    }
    return { effectId, amount };
  }

  if (effectId === "gain_status") {
    if (value["statusId"] !== "dingler") {
      errors.push(`${label}.statusId must be dingler`);
      return undefined;
    }
    const target = value["target"];
    if (target !== undefined && target !== "damagedPlayer") {
      errors.push(`${label}.target must be damagedPlayer`);
      return undefined;
    }
    return target === "damagedPlayer"
      ? { effectId, statusId: "dingler", target }
      : { effectId, statusId: "dingler" };
  }

  return { effectId };
}

function isAttackOutcomeEffectId(
  value: unknown
): value is AttackOutcomeBranch["effectId"] {
  return (
    value === "gain_chips" ||
    value === "gain_chips_equal_damage_dealt" ||
    value === "heal_equal_damage_dealt" ||
    value === "return_discard_to_hand" ||
    value === "gain_status"
  );
}

const runtimeEffectPayloadFields = [
  "condition",
  "costs",
  "target",
  "targetSelector",
  "allowDinglerStatusExchange",
  "allowLifeExchange",
  "amount",
  "amountPerOwnedCard",
  "amountPerPlayer",
  "branchEffects",
  "cardDefinitionIds",
  "cardKind",
  "cardTags",
  "cardTypes",
  "chipAmount",
  "chipCost",
  "chooser",
  "costMode",
  "countedCardTypes",
  "destination",
  "emptyChoice",
  "excludeSource",
  "fromDefinitionId",
  "isOngoing",
  "lifeCost",
  "lifeTotal",
  "onDamageDealt",
  "onKill",
  "operation",
  "optional",
  "options",
  "redirectAttack",
  "source",
  "status",
  "statusId",
  "toDefinitionId",
  "unlessStatusId",
  "valueKind",
  "voteTargetSelector",
  "winnerDrawAmount",
] as const satisfies readonly (keyof RuntimeEffectFields)[];

type MissingRuntimeEffectPayloadField = Exclude<
  keyof RuntimeEffectFields,
  (typeof runtimeEffectPayloadFields)[number] | "timing"
>;
const runtimeEffectPayloadFieldsAreComplete: MissingRuntimeEffectPayloadField extends never
  ? true
  : never = true;
void runtimeEffectPayloadFieldsAreComplete;

function optionalUnknownArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): ReturnType<typeof requireArrayField> {
  if (record[key] === undefined) {
    return undefined;
  }

  return requireUnknownArrayField(record, label, errors, key);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function requireStringField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return undefined;
  }

  return value;
}

function optionalStringField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return undefined;
  }

  return value;
}

function requireNonEmptyStringField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0 || (key === "image" && !isCanonicalAssetPath(value))) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function optionalNonEmptyStringField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return requireNonEmptyStringField(record, label, errors, key);
}

function requireStringOrNullField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string | null | undefined {
  const value = record[key];
  if (typeof value !== "string" && value !== null) {
    errors.push(`${label} must be a string or null`);
    return undefined;
  }

  return value;
}

function requireExactStringField<TExpected extends string>(
  record: Record<string, unknown>,
  label: string,
  expectedValue: TExpected,
  errors: string[],
  key = label
): TExpected | undefined {
  const value = requireStringField(record, label, errors, key);
  if (value === undefined) {
    return undefined;
  }

  if (value !== expectedValue) {
    errors.push(`${label} must be ${expectedValue}`);
    return undefined;
  }

  return expectedValue;
}

function requireNumberField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a finite number`);
    return undefined;
  }

  return value;
}

function requireNumberOrNullField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): number | null | undefined {
  const value = record[key];
  if (
    (typeof value !== "number" || !Number.isFinite(value)) &&
    value !== null
  ) {
    errors.push(`${label} must be a finite number or null`);
    return undefined;
  }

  return value;
}

function requireBooleanField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): boolean | undefined {
  const value = record[key];
  if (typeof value !== "boolean") {
    errors.push(`${label} must be a boolean`);
    return undefined;
  }

  return value;
}

function requireStringArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string[] | undefined {
  const value = requireArrayField(record, label, errors, key);
  if (value === undefined) {
    return undefined;
  }

  const strings: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      errors.push(`${label}[${index}] must be a string`);
      continue;
    }

    strings.push(item);
  }

  return strings;
}

function requireUnsupportedMechanicsField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string[] | undefined {
  const value = requireArrayField(record, label, errors, key);
  if (value === undefined) {
    return undefined;
  }

  const mechanics: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item === "string") {
      mechanics.push(item);
      continue;
    }

    if (isPlainRecord(item) && typeof item["mechanic"] === "string") {
      mechanics.push(item["mechanic"]);
      continue;
    }

    errors.push(`${label}[${index}] must be a string or mechanic object`);
  }

  return mechanics;
}

function optionalStringArrayField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): string[] | undefined {
  if (record[key] === undefined) {
    return undefined;
  }

  return requireStringArrayField(record, label, errors, key);
}

function requireCardKindField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): CardKind | undefined {
  const value = requireStringField(record, label, errors, key);
  if (value !== undefined && !CARD_KINDS.has(value)) {
    errors.push(`${label} contains unsupported card kind ${value}`);
    return undefined;
  }

  return value as CardKind | undefined;
}

function requireTokenKindField(
  record: Record<string, unknown>,
  label: string,
  errors: string[],
  key = label
): TokenKind | undefined {
  const value = requireStringField(record, label, errors, key);
  if (value === undefined) {
    return undefined;
  }

  if (!TOKEN_KINDS.has(value)) {
    errors.push(`${label} contains unsupported token kind ${value}`);
    return undefined;
  }

  return value as TokenKind;
}

function normalizeRuntimeFilePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function validateRuntimeEffectDefinition(
  subjectId: string,
  effectId: string,
  effect: Record<string, unknown>,
  mode: EffectRuntimeMode,
  sourceKind: EffectRuntimeSourceKind
): string[] {
  const resolution = resolveEffectRuntimeCatalogEntry(
    subjectId,
    effectId,
    effect,
    mode,
    sourceKind
  );
  if (!resolution.ok) {
    return resolution.errors;
  }

  const catalogEntry = resolution.entry;

  const targetSelector = effect["targetSelector"];
  if (
    targetSelector !== undefined &&
    (!isRuntimeEffectTargetSelector(targetSelector) ||
      !catalogEntry.handler.allowedTargetSelectors?.includes(targetSelector))
  ) {
    return [`${subjectId} ${effectId} uses unsupported target selector`];
  }

  return validateNestedAttackBranches(subjectId, effect, mode, sourceKind);
}

function validateNestedAttackBranches(
  subjectId: string,
  effect: Record<string, unknown>,
  mode: EffectRuntimeMode,
  sourceKind: EffectRuntimeSourceKind
): string[] {
  const errors: string[] = [];
  for (const field of ["branchEffects", "onDamageDealt", "onKill"] as const) {
    const branches = effect[field];
    if (branches === undefined) {
      continue;
    }
    if (!Array.isArray(branches)) {
      errors.push(`${subjectId} ${field} must be an array`);
      continue;
    }
    for (const [index, branch] of branches.entries()) {
      if (!isEffectRecord(branch)) {
        errors.push(`${subjectId} ${field}[${index}] must be an object`);
        continue;
      }
      const nestedId = branch["effectId"];
      const nestedSubjectId = `${subjectId} ${field}[${index}]`;
      if (field === "branchEffects") {
        if (typeof nestedId !== "string") {
          errors.push(
            `${nestedSubjectId} uses unsupported effect id ${String(nestedId)}`
          );
          continue;
        }
        errors.push(
          ...validateRuntimeEffectDefinition(
            nestedSubjectId,
            nestedId,
            branch,
            mode,
            sourceKind
          )
        );
        continue;
      }

      const outcome = decodeAttackOutcomeBranch(
        branch,
        nestedSubjectId,
        errors
      );
      if (outcome === undefined) {
        continue;
      }
    }
  }
  return errors;
}

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return isPlainRecord(effect);
}

function isCanonicalAssetPath(value: string): boolean {
  return (
    value.trim() === value &&
    value.startsWith("assets/") &&
    !value.endsWith("/") &&
    !value.includes("\\") &&
    path.posix.normalize(value) === value &&
    !path.posix.isAbsolute(value)
  );
}
