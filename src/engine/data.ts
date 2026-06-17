import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type CardKind =
  | "starter"
  | "normal"
  | "legend"
  | "mayhem"
  | "megaMayhem"
  | "wildMagic"
  | "limpWand";

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

export type TokenKind = "deadWizardToken";

export interface TokenDefinition {
  schemaVersion: number;
  tokenId: string;
  runtimeSchema: "krutagidon.tokenDefinition.v0";
  kind: TokenKind;
  victoryPoints: number;
  effects: unknown[];
}

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
  decks: {
    starterDeck: string;
    mainDeck: string;
    legendDeck: string;
    wildMagicStack: string;
    limpWandStack: string;
  };
  tokenStacks?: {
    deadWizardTokens: string;
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
  };
  tokenStacks: {
    deadWizardTokens: TokenStackComposition | undefined;
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

export function loadV0DataPack(
  rootDir: string,
  manifestPath = "data/decks/v0-first-batch-data-pack.json",
): LoadedDataPack {
  const manifest = readJsonFile<DataPackManifest>(rootDir, manifestPath);
  const cardDefinitions = loadCardDefinitions(rootDir, manifest.cardsPath);
  const tokenDefinitions =
    manifest.tokensPath === undefined ? new Map<string, TokenDefinition>() : loadTokenDefinitions(rootDir, manifest.tokensPath);

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
    },
    tokenStacks: {
      deadWizardTokens:
        manifest.tokenStacks?.deadWizardTokens === undefined
          ? undefined
          : readJsonFile<TokenStackComposition>(rootDir, manifest.tokenStacks.deadWizardTokens),
    },
  };
}

export function validateExecutableDataPack(dataPack: LoadedDataPack): DataPackValidationResult {
  const errors: string[] = [];

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
      if (typeof effectId !== "string" || !isSupportedExecutableEffectId(effectId)) {
        errors.push(`Card ${definition.cardId} uses unsupported effect id ${String(effectId)}`);
        continue;
      }

      errors.push(...validateSupportedEffectShape(definition.cardId, effectId, effect));
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

function loadTokenDefinitions(rootDir: string, tokensPath: string): ReadonlyMap<string, TokenDefinition> {
  const absoluteTokensPath = path.resolve(rootDir, tokensPath);
  const tokens = new Map<string, TokenDefinition>();

  for (const fileName of readdirSync(absoluteTokensPath).sort()) {
    if (!fileName.endsWith(".json") || fileName.startsWith("_")) {
      continue;
    }

    const token = readJsonFile<TokenDefinition>(absoluteTokensPath, fileName);
    tokens.set(token.tokenId, token);
  }

  return tokens;
}

function readJsonFile<T>(rootDir: string, filePath: string): T {
  const absolutePath = path.resolve(rootDir, filePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

function isSupportedExecutableEffectId(effectId: string): boolean {
  return (
    effectId === "add_power" ||
    effectId === "draw_cards" ||
    effectId === "fixture_add_power_equal_to_target_cost" ||
    effectId === "fixture_gain_card" ||
    effectId === "fixture_discard_card" ||
    effectId === "fixture_destroy_card" ||
    effectId === "fixture_reveal_top_card" ||
    effectId === "fixture_play_top_card" ||
    effectId === "fixture_deal_damage" ||
    effectId === "fixture_heal" ||
    effectId === "fixture_single_target_attack" ||
    effectId === "fixture_multi_target_attack" ||
    effectId === "fixture_mayhem_attack" ||
    effectId === "fixture_avoid_attack" ||
    effectId === "fixture_modify_effective_value"
  );
}

function validateSupportedEffectShape(cardId: string, effectId: string, effect: Record<string, unknown>): string[] {
  if (effectId === "fixture_reveal_top_card" && effect["source"] !== "activePlayerDeck") {
    return [`Card ${cardId} uses unsupported reveal source ${String(effect["source"])}`];
  }

  if (effectId === "fixture_play_top_card") {
    const errors: string[] = [];
    if (effect["source"] !== "activePlayerDeck") {
      errors.push(`Card ${cardId} uses unsupported play-top source ${String(effect["source"])}`);
    }

    if (effect["destination"] !== "play") {
      errors.push(`Card ${cardId} uses unsupported play-top destination ${String(effect["destination"])}`);
    }

    return errors;
  }

  if (effectId === "fixture_deal_damage") {
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

  if (effectId === "fixture_heal") {
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

  if (effectId === "fixture_single_target_attack") {
    const errors: string[] = [];
    const amount = effect["amount"];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
      errors.push(`Card ${cardId} uses invalid attack damage amount ${String(amount)}`);
    }

    const target = effect["target"];
    if (!isEffectRecord(target) || target["selector"] !== "opponentPlayer") {
      const selector = isEffectRecord(target) ? target["selector"] : target;
      errors.push(`Card ${cardId} uses unsupported attack target ${String(selector)}`);
    }

    return errors;
  }

  if (effectId === "fixture_multi_target_attack") {
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

  if (effectId === "fixture_mayhem_attack") {
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

  if (effectId === "fixture_avoid_attack") {
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
