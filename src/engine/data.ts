import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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

export type TokenDefinition = DeadWizardTokenDefinition | WizardPropertyDefinition;

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
  cardsPath: string;
  tokensPath?: string;
  tokenDefinitionPaths?: string[];
  decks: {
    starterDeck: string;
    mainDeck: string;
    legendDeck: string;
    wildMagicStack: string;
    limpWandStack: string;
    familiarPool?: string;
  };
  tokenStacks?: {
    deadWizardTokens: string;
    wizardProperties?: string;
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
  manifestPath = "data/decks/v0-first-batch-data-pack.json",
): LoadedDataPack {
  const manifest = readJsonFile<DataPackManifest>(rootDir, manifestPath);
  const cardDefinitions = loadCardDefinitions(rootDir, manifest.cardsPath);
  const tokenDefinitionPaths = [
    ...(manifest.tokensPath === undefined ? [] : [manifest.tokensPath]),
    ...(manifest.tokenDefinitionPaths ?? []),
  ];
  const tokenDefinitions = loadTokenDefinitions(rootDir, tokenDefinitionPaths);

  return {
    manifest,
    cardDefinitions,
    tokenDefinitions,
    decks: {
      starterDeck: readJsonFile<DeckComposition>(rootDir, manifest.decks.starterDeck),
      mainDeck: readJsonFile<DeckComposition>(rootDir, manifest.decks.mainDeck),
      legendDeck: readJsonFile<DeckComposition>(rootDir, manifest.decks.legendDeck),
      wildMagicStack: readJsonFile<DeckComposition>(rootDir, manifest.decks.wildMagicStack),
      limpWandStack: readJsonFile<DeckComposition>(rootDir, manifest.decks.limpWandStack),
      familiarPool:
        manifest.decks.familiarPool === undefined
          ? undefined
          : readJsonFile<DeckComposition>(rootDir, manifest.decks.familiarPool),
    },
    tokenStacks: {
      deadWizardTokens:
        manifest.tokenStacks?.deadWizardTokens === undefined
          ? undefined
          : readJsonFile<TokenStackComposition>(rootDir, manifest.tokenStacks.deadWizardTokens),
      wizardProperties:
        manifest.tokenStacks?.wizardProperties === undefined
          ? undefined
          : readJsonFile<TokenStackComposition>(rootDir, manifest.tokenStacks.wizardProperties),
    },
  };
}

export function validateExecutableDataPack(
  dataPack: LoadedDataPack,
  options: DataPackValidationOptions = {},
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
        `Card ${definition.cardId} has unsupported mechanics ${definition.engine.unsupportedMechanics.join(", ")}`,
      );
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect)) {
        continue;
      }

      const effectId = effect["effectId"];
      if (typeof effectId !== "string") {
        errors.push(`Card ${definition.cardId} uses unsupported effect id ${String(effectId)}`);
        continue;
      }

      if (mode === "combat" && effectId.startsWith("fixture_")) {
        errors.push(`Card ${definition.cardId} uses fixture effect id ${effectId} in combat data`);
        continue;
      }

      if (!isSupportedExecutableEffectId(effectId, mode)) {
        errors.push(`Card ${definition.cardId} uses unsupported effect id ${effectId}`);
        continue;
      }

      errors.push(...validateSupportedEffectShape(definition.cardId, effectId, effect));
    }
  }

  for (const definition of dataPack.tokenDefinitions.values()) {
    if (definition.kind !== "wizardProperty" || definition.engine === undefined || !definition.engine.playableInV0) {
      continue;
    }

    if (definition.engine.unsupportedMechanics.length > 0) {
      errors.push(
        `Token ${definition.tokenId} has unsupported mechanics ${definition.engine.unsupportedMechanics.join(", ")}`,
      );
    }

    for (const effect of definition.engine.effects) {
      if (!isEffectRecord(effect)) {
        continue;
      }

      const effectId = effect["effectId"];
      if (typeof effectId !== "string") {
        errors.push(`Token ${definition.tokenId} uses unsupported effect id ${String(effectId)}`);
        continue;
      }

      if (mode === "combat" && effectId.startsWith("fixture_")) {
        errors.push(`Token ${definition.tokenId} uses fixture effect id ${effectId} in combat data`);
        continue;
      }

      if (!isSupportedExecutableEffectId(effectId, mode)) {
        errors.push(`Token ${definition.tokenId} uses unsupported effect id ${effectId}`);
        continue;
      }
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
    if (normalizedPath === "data/import" || normalizedPath.startsWith("data/import/")) {
      errors.push(`Manifest ${fieldName} references import-only path ${filePath}`);
    }
  }

  return errors;
}

function collectManifestPaths(manifest: DataPackManifest): [string, string][] {
  const paths: [string, string][] = [
    ["cardsPath", manifest.cardsPath],
    ["decks.starterDeck", manifest.decks.starterDeck],
    ["decks.mainDeck", manifest.decks.mainDeck],
    ["decks.legendDeck", manifest.decks.legendDeck],
    ["decks.wildMagicStack", manifest.decks.wildMagicStack],
    ["decks.limpWandStack", manifest.decks.limpWandStack],
  ];

  if (manifest.decks.familiarPool !== undefined) {
    paths.push(["decks.familiarPool", manifest.decks.familiarPool]);
  }

  if (manifest.tokensPath !== undefined) {
    paths.push(["tokensPath", manifest.tokensPath]);
  }

  for (const [index, filePath] of (manifest.tokenDefinitionPaths ?? []).entries()) {
    paths.push([`tokenDefinitionPaths[${index}]`, filePath]);
  }

  if (manifest.tokenStacks?.deadWizardTokens !== undefined) {
    paths.push(["tokenStacks.deadWizardTokens", manifest.tokenStacks.deadWizardTokens]);
  }

  if (manifest.tokenStacks?.wizardProperties !== undefined) {
    paths.push(["tokenStacks.wizardProperties", manifest.tokenStacks.wizardProperties]);
  }

  return paths;
}

function loadCardDefinitions(rootDir: string, cardsPath: string): ReadonlyMap<string, CardDefinition> {
  const absoluteCardsPath = path.resolve(rootDir, cardsPath);
  const cards = new Map<string, CardDefinition>();

  for (const fileName of readdirSync(absoluteCardsPath).sort()) {
    if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
      continue;
    }

    const card = readJsonFile<CardDefinition>(absoluteCardsPath, fileName);
    cards.set(card.cardId, card);
  }

  return cards;
}

function loadTokenDefinitions(rootDir: string, tokenDefinitionPaths: string[]): ReadonlyMap<string, TokenDefinition> {
  const tokens = new Map<string, TokenDefinition>();

  for (const tokensPath of tokenDefinitionPaths) {
    const absoluteTokensPath = path.resolve(rootDir, tokensPath);

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

function readJsonFile<T>(rootDir: string, filePath: string): T {
  const absolutePath = path.resolve(rootDir, filePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

function isSupportedExecutableEffectId(effectId: string, mode: "combat" | "fixture"): boolean {
  return (
    effectId === "add_power" ||
    effectId === "heal" ||
    effectId === "set_life" ||
    effectId === "mega_mayhem_set_life" ||
    effectId === "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" ||
    effectId === "mega_mayhem_each_player_toggle_dingler" ||
    effectId === "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" ||
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" ||
    effectId === "mayhem_each_player_discard_deck_then_destroy_from_discard" ||
    effectId === "deal_damage" ||
    effectId === "attack_damage" ||
    effectId === "multi_target_attack" ||
    effectId === "mayhem_attack" ||
    effectId === "avoid_attack" ||
    effectId === "gain_card" ||
    effectId === "discard_card" ||
    effectId === "destroy_card" ||
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

function validateSupportedEffectShape(cardId: string, effectId: string, effect: Record<string, unknown>): string[] {
  if (effectId === "reveal_top_card" && effect["source"] !== "activePlayerDeck") {
    return [`Card ${cardId} uses unsupported reveal source ${String(effect["source"])}`];
  }

  if (effectId === "play_top_card") {
    const errors: string[] = [];
    if (effect["source"] !== "activePlayerDeck") {
      errors.push(`Card ${cardId} uses unsupported play-top source ${String(effect["source"])}`);
    }

    if (effect["destination"] !== "play") {
      errors.push(`Card ${cardId} uses unsupported play-top destination ${String(effect["destination"])}`);
    }

    return errors;
  }

  if (effectId === "wild_magic_choice") {
    const options = effect["options"];
    if (!Array.isArray(options)) {
      return [`Card ${cardId} uses wild_magic_choice without options`];
    }

    const errors: string[] = [];
    for (const option of options) {
      if (!isEffectRecord(option)) {
        errors.push(`Card ${cardId} uses invalid Wild Magic option`);
        continue;
      }

      const optionEffectId = option["effectId"];
      if (optionEffectId !== "add_power" && optionEffectId !== "play_top_card_from_foe_deck") {
        errors.push(`Card ${cardId} uses unsupported Wild Magic option ${String(optionEffectId)}`);
      }
    }

    return errors;
  }

  if (effectId === "play_top_card_from_foe_deck") {
    if (effect["targetSelector"] !== "chosenFoe") {
      return [`Card ${cardId} uses unsupported foe-deck target ${String(effect["targetSelector"])}`];
    }

    return [];
  }

  if (effectId === "deal_damage") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid damage amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "opponentPlayer") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported damage target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "heal") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid healing amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "activePlayer") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported healing target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "set_life") {
    const errors: string[] = [];
    const lifeTotal = effect["lifeTotal"];
    if (typeof lifeTotal !== "number" || !Number.isSafeInteger(lifeTotal) || lifeTotal < 1) {
      errors.push(`Card ${cardId} uses invalid life total ${String(lifeTotal)}`);
    }

    const target = effect["target"];
    const targetSelector = effect["targetSelector"];
    if (
      (!isEffectRecord(target) || target["selector"] !== "activePlayer") &&
      targetSelector !== "eachPlayerClockwiseFromActive"
    ) {
      const selector = isEffectRecord(target) ? target["selector"] : targetSelector;
      errors.push(`Card ${cardId} uses unsupported set-life target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "mega_mayhem_set_life") {
    const errors: string[] = [];
    const lifeTotal = effect["lifeTotal"];
    if (typeof lifeTotal !== "number" || !Number.isSafeInteger(lifeTotal) || lifeTotal < 1) {
      errors.push(`Card ${cardId} uses invalid life total ${String(lifeTotal)}`);
    }

    if (effect["timing"] !== "onMayhemResolve") {
      errors.push(`Card ${cardId} uses unsupported MegaMayhem timing ${String(effect["timing"])}`);
    }

    if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
      errors.push(`Card ${cardId} uses unsupported MegaMayhem target ${String(effect["targetSelector"])}`);
    }

    return errors;
  }

  if (
    effectId === "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" ||
    effectId === "mega_mayhem_each_player_toggle_dingler" ||
    effectId === "toggle_status" ||
    effectId === "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" ||
    effectId === "mayhem_each_player_choose_discard_hand_draw_or_take_damage" ||
    effectId === "mayhem_each_player_discard_deck_then_destroy_from_discard"
  ) {
    const errors: string[] = [];
    if (effect["timing"] !== "onMayhemResolve") {
      errors.push(`Card ${cardId} uses unsupported Mayhem timing ${String(effect["timing"])}`);
    }

    if (effect["targetSelector"] !== "eachPlayerClockwiseFromActive") {
      errors.push(`Card ${cardId} uses unsupported Mayhem target ${String(effect["targetSelector"])}`);
    }

    if (effectId === "toggle_status" && effect["statusId"] !== "dingler") {
      errors.push(`Card ${cardId} uses unsupported status ${String(effect["statusId"])}`);
    }

    return errors;
  }

  if (effectId === "attack_damage") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid attack damage amount ${String(amount)}`);
    }

    const target = effect["target"];
    const targetSelector = effect["targetSelector"];
    if (
      (!isEffectRecord(target) || target["selector"] !== "opponentPlayer") &&
      targetSelector !== "chosenFoe" &&
      targetSelector !== "chosenPlayer" &&
      targetSelector !== "eachFoe"
    ) {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported attack target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "multi_target_attack") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid attack damage amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "opponentPlayers") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported multi-target attack target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "mayhem_attack") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid Mayhem attack damage amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "allPlayers") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported Mayhem attack target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "avoid_attack") {
    const destination = effect["destination"];
    if (effect["timing"] !== "onDefense" || (destination !== "discardSelf" && destination !== "topdeckSelf")) {
      return [`Card ${cardId} uses unsupported defense branch ${String(destination)}`];
    }

    return [];
  }

  return [];
}

function isEffectRecord(effect: unknown): effect is Record<string, unknown> {
  return typeof effect === "object" && effect !== null;
}
