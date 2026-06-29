import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  getEffectRuntimeCatalogEntry,
  isEffectRuntimeCatalogEntrySupportedInMode,
  type EffectRuntimeMode,
} from "./effect-runtime-registry.js";

export type CardKind =
  | "starter"
  | "normal"
  | "legend"
  | "mayhem"
  | "megaMayhem"
  | "wildMagic"
  | "limpWand"
  | "familiar";

export interface CardDefinition {
  schemaVersion: number;
  cardId: string;
  visible: {
    nameRu: string;
    cost: number;
    victoryPoints: number;
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
    effects: unknown[];
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
}

export interface DeadWizardTokenDefinition extends BaseTokenDefinition {
  kind: "deadWizardToken";
  victoryPoints: number;
  effects: unknown[];
}

export interface WizardPropertyDefinition extends BaseTokenDefinition {
  kind: "wizardProperty";
  visible?: {
    textRu: string;
    sourceLabel?: string;
    sourceImage?: string;
  };
  clarifications?: string[];
  engine?: {
    mappingStatus: string;
    playableInV0: boolean;
    effects: unknown[];
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
  needsData: unknown[];
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

export function loadV0DataPack(
  rootDir: string,
  manifestPath = "data/packs/v0-first-batch.json"
): LoadedDataPack {
  const manifest = readJsonFile<DataPackManifest>(rootDir, manifestPath);
  const cardDefinitions = loadCardDefinitions(rootDir, manifest);
  const tokenDefinitions = loadTokenDefinitions(rootDir, manifest);
  const deckPaths = requireManifestSection(manifest.decks, "decks");
  const cardStackPaths = requireManifestSection(
    manifest.cardStacks,
    "cardStacks"
  );

  return {
    manifest,
    cardDefinitions,
    tokenDefinitions,
    decks: {
      starterDeck: readJsonFile<DeckComposition>(
        rootDir,
        deckPaths.starterDeck
      ),
      mainDeck: readJsonFile<DeckComposition>(rootDir, deckPaths.mainDeck),
      legendDeck: readJsonFile<DeckComposition>(rootDir, deckPaths.legendDeck),
      wildMagicStack: readJsonFile<DeckComposition>(
        rootDir,
        cardStackPaths.wildMagicStack
      ),
      limpWandStack: readJsonFile<DeckComposition>(
        rootDir,
        cardStackPaths.limpWandStack
      ),
      familiarPool:
        manifest.pools?.familiarPool === undefined
          ? undefined
          : readJsonFile<DeckComposition>(rootDir, manifest.pools.familiarPool),
    },
    tokenStacks: {
      deadWizardTokens:
        manifest.tokenStacks?.deadWizardTokens === undefined
          ? undefined
          : readJsonFile<TokenStackComposition>(
              rootDir,
              manifest.tokenStacks.deadWizardTokens
            ),
      wizardProperties:
        manifest.tokenStacks?.wizardProperties === undefined
          ? undefined
          : readJsonFile<TokenStackComposition>(
              rootDir,
              manifest.tokenStacks.wizardProperties
            ),
    },
  };
}

export function validateExecutableDataPack(
  dataPack: LoadedDataPack,
  options: DataPackValidationOptions = {}
): DataPackValidationResult {
  const errors: string[] = [];
  const mode = options.mode ?? "combat";

  errors.push(...validateManifestRuntimePaths(dataPack.manifest));

  for (const definition of dataPack.cardDefinitions.values()) {
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
          mode
        )
      );
    }
  }

  for (const definition of dataPack.tokenDefinitions.values()) {
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
          mode
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

function loadCardDefinitions(
  rootDir: string,
  manifest: DataPackManifest
): ReadonlyMap<string, CardDefinition> {
  if (manifest.cardDefinitionPaths.length === 0) {
    throw new Error(
      "Data pack manifest does not define any card definition paths"
    );
  }

  const cards = new Map<string, CardDefinition>();

  for (const cardDefinitionsPath of manifest.cardDefinitionPaths) {
    assertRuntimePath("cardDefinitionPaths", cardDefinitionsPath);
    const absoluteCardsPath = path.resolve(rootDir, cardDefinitionsPath);

    for (const fileName of readdirSync(absoluteCardsPath).sort()) {
      if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
        continue;
      }

      const card = readJsonFile<CardDefinition>(absoluteCardsPath, fileName);
      cards.set(card.cardId, card);
    }
  }

  return cards;
}

function loadTokenDefinitions(
  rootDir: string,
  manifest: DataPackManifest
): ReadonlyMap<string, TokenDefinition> {
  const tokens = new Map<string, TokenDefinition>();

  for (const tokenDefinitionsPath of manifest.tokenDefinitionPaths ?? []) {
    assertRuntimePath("tokenDefinitionPaths", tokenDefinitionsPath);
    const absoluteTokensPath = path.resolve(rootDir, tokenDefinitionsPath);

    for (const fileName of readdirSync(absoluteTokensPath).sort()) {
      if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
        continue;
      }

      const token = readJsonFile<TokenDefinition>(absoluteTokensPath, fileName);
      tokens.set(token.tokenId, token);
    }
  }

  return tokens;
}

function requireManifestSection<T>(section: T | undefined, name: string): T {
  if (section === undefined) {
    throw new Error(`Data pack manifest does not define ${name}`);
  }

  return section;
}

function assertRuntimePath(fieldName: string, filePath: string): void {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (
    normalizedPath === "data/import" ||
    normalizedPath.startsWith("data/import/")
  ) {
    throw new Error(
      `Manifest ${fieldName} references import-only path ${filePath}`
    );
  }
}

function readJsonFile<T>(rootDir: string, filePath: string): T {
  const absolutePath = path.resolve(rootDir, filePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

function validateRuntimeEffectDefinition(
  subjectId: string,
  effectId: string,
  effect: Record<string, unknown>,
  mode: EffectRuntimeMode
): string[] {
  const catalogEntry = getEffectRuntimeCatalogEntry(effectId);
  if (catalogEntry !== undefined) {
    if (!isEffectRuntimeCatalogEntrySupportedInMode(catalogEntry, mode)) {
      if (mode === "combat" && effectId.startsWith("fixture_")) {
        return [
          `${subjectId} uses fixture effect id ${effectId} in combat data`,
        ];
      }

      return [
        `${subjectId} uses effect id ${effectId} outside supported ${mode} mode`,
      ];
    }

    return catalogEntry.handler.validateShape(subjectId, effect);
  }

  return [`${subjectId} uses unsupported effect id ${effectId}`];
}

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}
