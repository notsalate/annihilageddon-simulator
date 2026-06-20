import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { getEffectRuntimeHandler } from "./effect-runtime-registry.js";

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
  mode?: "combat" | "fixture";
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

      if (mode === "combat" && effectId.startsWith("fixture_")) {
        errors.push(
          `Card ${definition.cardId} uses fixture effect id ${effectId} in combat data`
        );
        continue;
      }

      if (!isSupportedExecutableEffectId(effectId, mode)) {
        errors.push(
          `Card ${definition.cardId} uses unsupported effect id ${effectId}`
        );
        continue;
      }

      errors.push(
        ...validateSupportedEffectShape(
          `Card ${definition.cardId}`,
          effectId,
          effect
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

      if (mode === "combat" && effectId.startsWith("fixture_")) {
        errors.push(
          `Token ${definition.tokenId} uses fixture effect id ${effectId} in combat data`
        );
        continue;
      }

      if (!isSupportedExecutableEffectId(effectId, mode)) {
        errors.push(
          `Token ${definition.tokenId} uses unsupported effect id ${effectId}`
        );
        continue;
      }

      errors.push(
        ...validateSupportedEffectShape(
          `Token ${definition.tokenId}`,
          effectId,
          effect
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

function isSupportedExecutableEffectId(
  effectId: string,
  mode: "combat" | "fixture"
): boolean {
  if (getEffectRuntimeHandler(effectId) !== undefined) {
    return true;
  }

  return (
    effectId === "heal" ||
    effectId === "set_life" ||
    effectId === "mega_mayhem_set_life" ||
    effectId ===
      "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" ||
    effectId === "mega_mayhem_each_player_toggle_dingler" ||
    effectId ===
      "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" ||
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" ||
    effectId === "mayhem_each_player_discard_deck_then_destroy_from_discard" ||
    effectId === "avoid_attack" ||
    effectId === "reveal_top_card" ||
    effectId === "play_top_card" ||
    effectId === "draw_cards" ||
    effectId === "wild_magic_choice" ||
    effectId === "play_top_card_from_foe_deck" ||
    effectId === "modify_effective_value" ||
    effectId === "gain_chips" ||
    effectId === "gain_chips_per_player_with_status" ||
    effectId === "gain_status" ||
    effectId === "remove_status" ||
    effectId === "toggle_status" ||
    effectId === "topdeck_gained_card" ||
    effectId === "temporary_hand_limit_by_gained_card_type" ||
    effectId === "replace_starting_card" ||
    effectId === "start_with_basic_trophy" ||
    effectId === "force_starting_player" ||
    effectId === "set_starting_life_total" ||
    effectId === "set_resurrection_life_total" ||
    effectId === "modify_owned_wand_attack_damage" ||
    effectId === "prevent_defense_against_owned_wand_attacks" ||
    (mode === "fixture" &&
      (effectId === "fixture_add_power_equal_to_target_cost" ||
        effectId === "fixture_modify_effective_value"))
  );
}

function validateSupportedEffectShape(
  subjectId: string,
  effectId: string,
  effect: Record<string, unknown>
): string[] {
  const runtimeHandler = getEffectRuntimeHandler(effectId);
  if (runtimeHandler !== undefined) {
    return runtimeHandler.validateShape(subjectId, effect);
  }

  if (
    effectId === "reveal_top_card" &&
    effect["source"] !== "activePlayerDeck"
  ) {
    return [
      `${subjectId} uses unsupported reveal source ${String(effect["source"])}`,
    ];
  }

  if (effectId === "play_top_card") {
    const errors: string[] = [];
    if (effect["source"] !== "activePlayerDeck") {
      errors.push(
        `${subjectId} uses unsupported play-top source ${String(effect["source"])}`
      );
    }

    if (effect["destination"] !== "play") {
      errors.push(
        `${subjectId} uses unsupported play-top destination ${String(effect["destination"])}`
      );
    }

    return errors;
  }

  if (effectId === "wild_magic_choice") {
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return [`${subjectId} uses wild_magic_choice without options`];
    }

    const errors: string[] = [];
    for (const option of options) {
      if (!isEffectRecord(option)) {
        errors.push(`${subjectId} uses invalid Wild Magic option`);
        continue;
      }

      const optionEffectId = option["effectId"];
      if (
        optionEffectId !== "add_power" &&
        optionEffectId !== "play_top_card_from_foe_deck"
      ) {
        errors.push(
          `${subjectId} uses unsupported Wild Magic option ${String(optionEffectId)}`
        );
        continue;
      }

      if (typeof optionEffectId === "string") {
        errors.push(
          ...validateSupportedEffectShape(subjectId, optionEffectId, option)
        );
      }
    }

    return errors;
  }

  if (effectId === "play_top_card_from_foe_deck") {
    if (effect["targetSelector"] !== "chosenFoe") {
      return [
        `${subjectId} uses unsupported foe-deck target ${String(effect["targetSelector"])}`,
      ];
    }

    return [];
  }

  if (effectId === "heal") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      errors.push(`${subjectId} uses invalid healing amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "activePlayer") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(
        `${subjectId} uses unsupported healing target ${String(selector)}`
      );
    }

    return errors;
  }

  if (effectId === "set_life") {
    const errors: string[] = [];
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      errors.push(`${subjectId} uses invalid life total ${String(lifeTotal)}`);
    }

    const target = effect["target"];
    const targetSelector = effect["targetSelector"];
    if (
      (!isEffectRecord(target) || target["selector"] !== "activePlayer") &&
      targetSelector !== "eachPlayerClockwiseFromActive"
    ) {
      const selector = isEffectRecord(target)
        ? target["selector"]
        : targetSelector;
      errors.push(
        `${subjectId} uses unsupported set-life target ${String(selector)}`
      );
    }

    return errors;
  }

  if (effectId === "mega_mayhem_set_life") {
    const errors: string[] = [];
    const lifeTotal = effect["lifeTotal"];
    if (
      typeof lifeTotal !== "number" ||
      !Number.isSafeInteger(lifeTotal) ||
      lifeTotal < 1
    ) {
      errors.push(`${subjectId} uses invalid life total ${String(lifeTotal)}`);
    }

    if (effect["timing"] !== "onMayhemResolve") {
      errors.push(
        `${subjectId} uses unsupported MegaMayhem timing ${String(effect["timing"])}`
      );
    }

    if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
      errors.push(
        `${subjectId} uses unsupported MegaMayhem target ${String(effect["targetSelector"])}`
      );
    }

    return errors;
  }

  if (
    effectId ===
      "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" ||
    effectId === "mega_mayhem_each_player_toggle_dingler" ||
    effectId === "toggle_status" ||
    effectId ===
      "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" ||
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" ||
    effectId === "mayhem_each_player_discard_deck_then_destroy_from_discard"
  ) {
    const errors: string[] = [];
    if (effect["timing"] !== "onMayhemResolve") {
      errors.push(
        `${subjectId} uses unsupported Mayhem timing ${String(effect["timing"])}`
      );
    }

    if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
      errors.push(
        `${subjectId} uses unsupported Mayhem target ${String(effect["targetSelector"])}`
      );
    }

    if (effectId === "toggle_status" && effect["statusId"] !== "dingler") {
      errors.push(
        `${subjectId} uses unsupported status ${String(effect["statusId"])}`
      );
    }

    return errors;
  }

  if (effectId === "avoid_attack") {
    const destination = effect["destination"];
    if (
      effect["timing"] !== "onDefense" ||
      (destination !== "discardSelf" && destination !== "topdeckSelf")
    ) {
      return [
        `${subjectId} uses unsupported defense branch ${String(destination)}`,
      ];
    }

    return [];
  }

  return [];
}

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}
