import type { CardDefinition, TokenDefinition } from "./data.js";
import type {
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  StatusInstance,
  TokenInstance,
  TemporaryCardControl,
  TrophyLikeInstance,
} from "./setup.js";
import { clearFaceUpState } from "./deck-lifecycle.js";
import type {
  PhysicalCardDiagnosticsSink,
  PhysicalCardPointSearchReason,
} from "./physical-card-diagnostics.js";
import { copyRuntimeEffectVerification } from "./runtime-effect-verification.js";
import type { RandomSource } from "./rng.js";

export interface ControlledObjectView {
  playerId: PlayerId;
  cards: readonly ControlledCardObject[];
  tokens: readonly ControlledTokenObject[];
  wizardProperties: readonly ControlledTokenObject[];
  statuses: readonly StatusInstance[];
  trophyLikeObjects: readonly TrophyLikeInstance[];
}

export interface ControlledCardObject {
  sourceType: "controlledCard";
  card: CardInstance;
  definition: CardDefinition;
}

export interface ControlledTokenObject {
  sourceType: "controlledToken";
  token: TokenInstance;
  definition: TokenDefinition;
}

export interface CardLocation {
  card: CardInstance;
  zoneName: string;
}

export type PhysicalCardZoneCardinality = "many" | "zeroOrOne";

export interface PhysicalCardZoneDescriptor {
  readonly zoneName: string;
  readonly cardinality: PhysicalCardZoneCardinality;
  readonly scoringEligible: boolean;
  readonly expectedOwnerId?: CardInstance["ownerId"];
  read(instrument?: boolean): readonly CardInstance[];
}

export interface PhysicalCardZoneReplacement {
  readonly zoneName: string;
  readonly cards: readonly CardInstance[];
}

interface PhysicalCardZoneStorageDescriptor extends PhysicalCardZoneDescriptor {
  /** Internal raw view used by the Ledger; callers must not mutate it. */
  readRaw(): readonly CardInstance[];
  replace(cards: readonly CardInstance[]): void;
}

export interface PhysicalCardLocationSnapshot {
  readonly positions: ReadonlyMap<
    CardInstance["instanceId"],
    { readonly zoneName: string; readonly index: number }
  >;
}

export interface PhysicalCardLocation {
  readonly card: CardInstance;
  readonly zoneName: string;
  readonly index: number;
  readonly expectedOwnerId?: CardInstance["ownerId"];
}

export interface PhysicalCardMove {
  readonly card: CardInstance;
  readonly sourceZoneName: string;
  readonly destinationZoneName: string;
}

export type PhysicalCardMoveResult =
  | { readonly ok: true; readonly move: PhysicalCardMove }
  | { readonly ok: false; readonly reason: string };

export type PhysicalCardRemoveResult =
  | {
      readonly ok: true;
      readonly card: CardInstance;
      readonly sourceZoneName: string;
    }
  | { readonly ok: false; readonly reason: string };

type PhysicalCardLedgerState = Pick<
  GameState,
  "players" | "common" | "physicalCardDiagnostics"
>;

export interface PhysicalCardLedgerCardZoneBinding {
  readonly card: CardInstance;
  readonly zoneName: string;
}

interface PhysicalCardLedgerClonedMembership {
  readonly cards: readonly CardInstance[];
  readonly zoneNames: readonly string[];
}

const physicalCardLedgers = new WeakMap<object, PhysicalCardLedger>();
const physicalCardLedgersByCommonState = new WeakMap<
  object,
  PhysicalCardLedger
>();
const physicalCardZoneTagStride = 1024;
let nextPhysicalCardBranchIdentity = 1;
const physicalCardLedgerTags = new WeakMap<CardInstance, number>();

/**
 * Owns physical card membership and all runtime mutations of built-in card
 * zones. Stable IDs enter this module only at explicit external boundaries;
 * internal operations use the live CardInstance reference.
 */
export class PhysicalCardLedger {
  private readonly descriptors: readonly PhysicalCardZoneStorageDescriptor[];
  private readonly descriptorsByName: ReadonlyMap<
    string,
    PhysicalCardZoneStorageDescriptor
  >;
  private readonly branchIdentity = nextPhysicalCardBranchIdentity++;
  private readonly zoneIndexesByName: ReadonlyMap<string, number>;
  private readonly state: PhysicalCardLedgerState;

  constructor(
    state: PhysicalCardLedgerState,
    cardZoneBindings?: readonly PhysicalCardLedgerCardZoneBinding[],
    clonedMembership?: PhysicalCardLedgerClonedMembership
  ) {
    this.state = state;
    this.descriptors = listBuiltinPhysicalCardZoneDescriptors(
      state,
      state.physicalCardDiagnostics === undefined
        ? undefined
        : () => state.physicalCardDiagnostics
    );
    this.descriptorsByName = new Map(
      this.descriptors.map((descriptor) => [descriptor.zoneName, descriptor])
    );
    this.zoneIndexesByName = new Map(
      this.descriptors.map((descriptor, index) => [descriptor.zoneName, index])
    );
    if (clonedMembership !== undefined) {
      if (cardZoneBindings !== undefined) {
        throw new Error("Cloned Ledger membership cannot include bindings");
      }
      this.seedClonedMembership(clonedMembership);
    } else if (cardZoneBindings === undefined) {
      this.rebuildMembership();
    } else {
      const bindingZonesByCard = new Map<CardInstance, string>();
      for (const binding of cardZoneBindings) {
        this.assertBranchCard(binding.card);
        const descriptor = this.requireDescriptor(binding.zoneName);
        if (bindingZonesByCard.has(binding.card)) {
          throw new Error(
            `Duplicate physical card binding for ${binding.card.instanceId}`
          );
        }
        bindingZonesByCard.set(binding.card, descriptor.zoneName);
      }
      const cardsByObject = new Map<CardInstance, string>();
      const cardsById = new Map<string, string>();
      for (const descriptor of this.descriptors) {
        for (const card of descriptor.readRaw()) {
          const boundZoneName = bindingZonesByCard.get(card);
          if (boundZoneName === undefined) {
            throw new Error(
              `Physical card ${card.instanceId} is missing from ${descriptor.zoneName}`
            );
          }
          if (boundZoneName !== descriptor.zoneName) {
            throw new Error(
              `Physical card ${card.instanceId} is bound to ${boundZoneName}, not ${descriptor.zoneName}`
            );
          }
          const previousObjectZone = cardsByObject.get(card);
          if (previousObjectZone !== undefined) {
            throw new Error(
              `card ${card.instanceId} appears in multiple zones: ${previousObjectZone}, ${descriptor.zoneName}`
            );
          }
          const previousIdZone = cardsById.get(card.instanceId);
          if (previousIdZone !== undefined) {
            throw new Error(
              `card ${card.instanceId} appears in multiple zones: ${previousIdZone}, ${descriptor.zoneName}`
            );
          }
          cardsByObject.set(card, descriptor.zoneName);
          cardsById.set(card.instanceId, descriptor.zoneName);
          this.setCardZone(card, descriptor.zoneName);
        }
      }
      if (cardsByObject.size !== bindingZonesByCard.size) {
        for (const [card, zoneName] of bindingZonesByCard) {
          if (!cardsByObject.has(card)) {
            throw new Error(
              `Physical card ${card.instanceId} is missing from ${zoneName}`
            );
          }
        }
      }
    }
  }

  get zoneDescriptors(): readonly PhysicalCardZoneDescriptor[] {
    return this.descriptors;
  }

  /** Returns the live array owned by one named zone as a readonly view. */
  readZone(zoneName: string): readonly CardInstance[] {
    return this.requireDescriptor(zoneName).readRaw();
  }

  /** Returns whether a registered card currently occupies a scoring zone. */
  isCardInScoringZone(card: CardInstance): boolean {
    const zoneName = this.getCardZone(card);
    return (
      zoneName !== undefined &&
      this.descriptorsByName.get(zoneName)?.scoringEligible === true
    );
  }

  /** Lists one player's six physical card zones without visiting other players. */
  listPlayerCards(playerId: PlayerId): readonly CardInstance[] {
    const player = this.state.players.find(
      (candidate) => candidate.playerId === playerId
    );
    if (player === undefined) return [];
    return [
      ...this.readZone(`${playerId}.deck`),
      ...this.readZone(`${playerId}.hand`),
      ...this.readZone(`${playerId}.discard`),
      ...this.readZone(`${playerId}.playedThisTurn`),
      ...this.readZone(`${playerId}.permanents`),
      ...this.readZone(`${playerId}.unboughtFamiliars`),
    ];
  }

  /** Resolves a known branch-local card without consulting its stable ID. */
  locateCard(
    card: CardInstance,
    expectedZoneName?: string
  ): CardLocation | undefined {
    const knownZoneName = this.getCardZone(card);
    if (
      knownZoneName !== undefined &&
      (expectedZoneName === undefined || knownZoneName === expectedZoneName)
    ) {
      if (this.readZone(knownZoneName).includes(card)) {
        return { card, zoneName: knownZoneName };
      }
      this.clearCardZone(card);
    }

    // This fallback keeps hand-built fixtures usable; production mutations are
    // guarded and update cardZones through the Ledger operations below.
    for (const descriptor of this.descriptors) {
      if (
        expectedZoneName !== undefined &&
        descriptor.zoneName !== expectedZoneName
      ) {
        continue;
      }
      if (descriptor.readRaw().includes(card)) {
        this.setCardZone(card, descriptor.zoneName);
        return { card, zoneName: descriptor.zoneName };
      }
    }
    return undefined;
  }

  /** Resolves an externally supplied stable ID without materializing locations. */
  resolveCardLocation(
    cardInstanceId: string,
    reason: PhysicalCardPointSearchReason = "unclassifiedId"
  ): CardLocation | undefined {
    this.state.physicalCardDiagnostics?.recordPointLocationSearch(reason);
    for (const descriptor of this.descriptors) {
      const cards = descriptor.readRaw();
      this.state.physicalCardDiagnostics?.recordPhysicalZonePass(cards.length);
      for (const card of cards) {
        if (card.instanceId === cardInstanceId) {
          this.setCardZone(card, descriptor.zoneName);
          return { card, zoneName: descriptor.zoneName };
        }
      }
    }
    return undefined;
  }

  /** Resolves an ID in one explicitly named zone at an input boundary. */
  findCardInZone(
    zoneName: string,
    cardInstanceId: string
  ): CardInstance | undefined {
    for (const card of this.readZone(zoneName)) {
      if (card.instanceId === cardInstanceId) return card;
    }
    return undefined;
  }

  /** Resolves an ID at a player-scoped input boundary without creating locations. */
  findPlayerCard(
    playerId: PlayerId,
    cardInstanceId: string,
    reason: PhysicalCardPointSearchReason = "unclassifiedId"
  ): CardInstance | undefined {
    this.state.physicalCardDiagnostics?.recordPointLocationSearch(reason);
    const player = this.state.players.find(
      (candidate) => candidate.playerId === playerId
    );
    if (player === undefined) return undefined;
    for (const zoneName of [
      `${playerId}.deck`,
      `${playerId}.hand`,
      `${playerId}.discard`,
      `${playerId}.playedThisTurn`,
      `${playerId}.permanents`,
      `${playerId}.unboughtFamiliars`,
    ]) {
      const cards = this.readZone(zoneName);
      this.state.physicalCardDiagnostics?.recordPhysicalZonePass(cards.length);
      for (const card of cards) {
        if (card.instanceId === cardInstanceId) return card;
      }
    }
    return undefined;
  }

  /** Replaces one zone and refreshes object-identity membership metadata. */
  replaceZone(zoneName: string, cards: readonly CardInstance[]): void {
    this.replaceZoneInternal(zoneName, cards);
  }

  private replaceZoneInternal(
    zoneName: string,
    cards: readonly CardInstance[],
    knownDetachedCard?: CardInstance
  ): void {
    const descriptor = this.requireDescriptor(zoneName);
    if (descriptor.cardinality === "zeroOrOne" && cards.length > 1) {
      throw new Error(`Destination zone ${zoneName} is already occupied`);
    }
    const normalizedZoneName = descriptor.zoneName;
    const seenCards = new Set<CardInstance>();
    const seenCardInstanceIds = new Set<CardInstance["instanceId"]>();
    const staleBindings = new Set<CardInstance>();
    const cardsToRegister: CardInstance[] = [];
    for (const card of cards) {
      this.ensureBranchCardOwnership(card);
      if (seenCards.has(card)) {
        throw new Error(`Duplicate physical card object ${card.instanceId}`);
      }
      if (seenCardInstanceIds.has(card.instanceId)) {
        throw new Error(
          `Duplicate physical card instance ID ${card.instanceId}`
        );
      }
      seenCards.add(card);
      seenCardInstanceIds.add(card.instanceId);
      const registeredZoneName = this.getCardZone(card);
      if (
        registeredZoneName !== undefined &&
        registeredZoneName !== normalizedZoneName
      ) {
        if (this.readZone(registeredZoneName).includes(card)) {
          throw new Error(
            `Physical card ${card.instanceId} already belongs to ${registeredZoneName}`
          );
        }
        // Keep hand-built fixtures usable when they moved an array item
        // without going through the Ledger. Production zones are guarded
        // against this direct mutation.
        staleBindings.add(card);
      }
      if (registeredZoneName === undefined && card !== knownDetachedCard) {
        this.assertNoDuplicateInstanceId(card, normalizedZoneName);
      }
      if (registeredZoneName === undefined || staleBindings.has(card)) {
        cardsToRegister.push(card);
      }
    }
    for (const card of cardsToRegister) this.assertBranchCard(card);
    for (const card of staleBindings) this.clearCardZone(card);
    const previousCards = [...this.readZone(normalizedZoneName)];
    descriptor.replace(cards);
    for (const card of previousCards) {
      if (!seenCards.has(card)) {
        this.clearCardZone(card);
      }
    }
    for (const card of cards) {
      this.setCardZone(card, normalizedZoneName);
    }
  }

  /** Replaces the complete physical inventory after validating it atomically. */
  replaceZones(replacements: readonly PhysicalCardZoneReplacement[]): void {
    const zoneNames = this.listZoneNames();
    const replacementsByName = new Map<string, PhysicalCardZoneReplacement>();
    const seenCards = new Set<CardInstance>();
    const seenCardInstanceIds = new Set<CardInstance["instanceId"]>();
    const cardsToRegister: CardInstance[] = [];
    for (const replacement of replacements) {
      const zoneName = this.requireZoneName(replacement.zoneName);
      const descriptor = this.requireDescriptor(zoneName);
      if (
        descriptor.cardinality === "zeroOrOne" &&
        replacement.cards.length > 1
      ) {
        throw new Error(`Destination zone ${zoneName} is already occupied`);
      }
      if (replacementsByName.has(zoneName)) {
        throw new Error(`Duplicate physical card zone replacement ${zoneName}`);
      }
      replacementsByName.set(zoneName, replacement);
      for (const card of replacement.cards) {
        if (seenCards.has(card)) {
          throw new Error(`Duplicate physical card object ${card.instanceId}`);
        }
        if (seenCardInstanceIds.has(card.instanceId)) {
          throw new Error(
            `Duplicate physical card instance ID ${card.instanceId}`
          );
        }
        const existingOwner = this.getCardBranchIdentity(card);
        if (
          existingOwner !== undefined &&
          existingOwner !== this.branchIdentity
        ) {
          throw new Error(
            `Physical card ${card.instanceId} belongs to another Ledger branch`
          );
        }
        seenCards.add(card);
        seenCardInstanceIds.add(card.instanceId);
        cardsToRegister.push(card);
      }
    }
    if (replacementsByName.size !== zoneNames.length) {
      const missingZone = zoneNames.find(
        (candidate) => !replacementsByName.has(candidate)
      );
      throw new Error(
        `Physical card zone replacement is missing ${missingZone ?? "a zone"}`
      );
    }

    const previousCards = zoneNames.flatMap((zoneName) =>
      this.readZone(zoneName)
    );
    for (const card of cardsToRegister) this.assertBranchCard(card);
    for (const zoneName of zoneNames) {
      const replacement = replacementsByName.get(zoneName);
      if (replacement === undefined) {
        throw new Error(
          `Physical card zone replacement is missing ${zoneName}`
        );
      }
      this.requireDescriptor(zoneName).replace(replacement.cards);
    }
    for (const card of previousCards) this.clearCardZone(card);
    for (const replacement of replacements) {
      for (const card of replacement.cards) {
        this.setCardZone(card, replacement.zoneName);
      }
    }
  }

  /** Removes a known card from its current zone without an ID lookup. */
  removeCard(
    card: CardInstance,
    expectedSourceZoneName?: string
  ): PhysicalCardRemoveResult {
    const location = this.locateCard(card, expectedSourceZoneName);
    if (location === undefined) {
      return {
        ok: false,
        reason:
          expectedSourceZoneName === undefined
            ? `Missing card ${card.instanceId}`
            : `Missing card ${card.instanceId} in ${expectedSourceZoneName}`,
      };
    }
    const cards = this.readZone(location.zoneName);
    const index = cards.indexOf(card);
    if (index < 0) {
      return { ok: false, reason: `Missing card ${card.instanceId}` };
    }
    clearFaceUpState(card);
    this.replaceZone(location.zoneName, [
      ...cards.slice(0, index),
      ...cards.slice(index + 1),
    ]);
    return { ok: true, card, sourceZoneName: location.zoneName };
  }

  /** Reorders a known card inside one Ledger-owned zone. */
  reorderCard(
    card: CardInstance,
    zoneName: string,
    placement: "front" | "back"
  ): PhysicalCardMoveResult {
    const descriptor = this.descriptorsByName.get(zoneName);
    if (descriptor === undefined) {
      return { ok: false, reason: `Missing destination zone ${zoneName}` };
    }
    const location = this.locateCard(card, zoneName);
    if (location === undefined) {
      return { ok: false, reason: `Missing card ${card.instanceId}` };
    }
    const remaining = descriptor
      .readRaw()
      .filter((candidate) => candidate !== card);
    clearFaceUpState(card);
    this.replaceZone(
      zoneName,
      placement === "front" ? [card, ...remaining] : [...remaining, card]
    );
    return {
      ok: true,
      move: {
        card,
        sourceZoneName: zoneName,
        destinationZoneName: zoneName,
      },
    };
  }

  /** Moves a known card between Ledger-owned zones. */
  moveCard(
    card: CardInstance,
    destinationZoneName: string,
    placement: "front" | "back",
    expectedSourceZoneName?: string
  ): PhysicalCardMoveResult {
    const destination = this.descriptorsByName.get(destinationZoneName);
    if (destination === undefined) {
      return {
        ok: false,
        reason: `Missing destination zone ${destinationZoneName}`,
      };
    }
    const source = this.locateCard(card, expectedSourceZoneName);
    if (source === undefined) {
      return {
        ok: false,
        reason:
          expectedSourceZoneName === undefined
            ? `Missing card ${card.instanceId}`
            : `Missing card ${card.instanceId} in ${expectedSourceZoneName}`,
      };
    }
    if (source.zoneName === destinationZoneName) {
      return {
        ok: false,
        reason: `Card ${card.instanceId} already belongs to ${destinationZoneName}`,
      };
    }
    const destinationCards = destination.readRaw();
    if (
      destination.cardinality === "zeroOrOne" &&
      destinationCards.length > 0
    ) {
      return {
        ok: false,
        reason: `Destination zone ${destinationZoneName} is already occupied`,
      };
    }
    const sourceCards = this.readZone(source.zoneName);
    const sourceIndex = sourceCards.indexOf(card);
    if (sourceIndex < 0) {
      return { ok: false, reason: `Missing card ${card.instanceId}` };
    }
    clearFaceUpState(card);
    this.replaceZone(source.zoneName, [
      ...sourceCards.slice(0, sourceIndex),
      ...sourceCards.slice(sourceIndex + 1),
    ]);
    this.replaceZoneInternal(
      destinationZoneName,
      placement === "front"
        ? [card, ...destinationCards]
        : [...destinationCards, card],
      card
    );
    return {
      ok: true,
      move: {
        card,
        sourceZoneName: source.zoneName,
        destinationZoneName,
      },
    };
  }

  /** Inserts a detached branch-local card into a Ledger zone. */
  insertDetachedCard(
    card: CardInstance,
    destinationZoneName: string,
    placement: "front" | "back"
  ): PhysicalCardMoveResult {
    if (this.locateCard(card) !== undefined) {
      return {
        ok: false,
        reason: `Card ${card.instanceId} is already registered in a physical zone`,
      };
    }
    const destination = this.descriptorsByName.get(destinationZoneName);
    if (destination === undefined) {
      return {
        ok: false,
        reason: `Missing destination zone ${destinationZoneName}`,
      };
    }
    const destinationCards = destination.readRaw();
    if (
      destination.cardinality === "zeroOrOne" &&
      destinationCards.length > 0
    ) {
      return {
        ok: false,
        reason: `Destination zone ${destinationZoneName} is already occupied`,
      };
    }
    this.ensureBranchCardOwnership(card);
    this.assertNoDuplicateInstanceId(card, destinationZoneName);
    clearFaceUpState(card);
    this.replaceZoneInternal(
      destinationZoneName,
      placement === "front"
        ? [card, ...destinationCards]
        : [...destinationCards, card],
      card
    );
    return {
      ok: true,
      move: {
        card,
        sourceZoneName: "detached",
        destinationZoneName,
      },
    };
  }

  takeAll(zoneName: string): CardInstance[] {
    const cards = [...this.readZone(zoneName)];
    for (const card of cards) clearFaceUpState(card);
    this.replaceZone(zoneName, []);
    return cards;
  }

  takeTop(zoneName: string): CardInstance | undefined {
    const card = this.readZone(zoneName)[0];
    if (card === undefined) return undefined;
    const removed = this.removeCard(card, zoneName);
    if (!removed.ok) throw new Error(removed.reason);
    return card;
  }

  addCards(
    zoneName: string,
    cards: readonly CardInstance[],
    placement: "front" | "back" = "back"
  ): void {
    const current = this.readZone(zoneName);
    this.replaceZone(
      zoneName,
      placement === "front" ? [...cards, ...current] : [...current, ...cards]
    );
  }

  shuffleZone(zoneName: string, rng: RandomSource): void {
    const cards = [...this.readZone(zoneName)];
    for (const card of cards) clearFaceUpState(card);
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = rng.nextInt(index + 1);
      const card = cards[index];
      const swapCard = cards[swapIndex];
      if (card === undefined || swapCard === undefined) {
        throw new Error("Unexpected sparse array during shuffle");
      }
      cards[index] = swapCard;
      cards[swapIndex] = card;
    }
    this.replaceZone(zoneName, cards);
  }

  refillDeck(playerId: PlayerId, rng: RandomSource): boolean {
    const deckZoneName = `${playerId}.deck`;
    const discardZoneName = `${playerId}.discard`;
    if (
      this.readZone(deckZoneName).length > 0 ||
      this.readZone(discardZoneName).length === 0
    ) {
      return false;
    }
    this.addCards(deckZoneName, this.takeAll(discardZoneName));
    this.shuffleZone(deckZoneName, rng);
    return true;
  }

  drawCards(
    playerId: PlayerId,
    count: number,
    rng: RandomSource,
    onReshuffle?: () => void
  ): { readonly cards: CardInstance[]; readonly reshuffleCount: number } {
    const deckZoneName = `${playerId}.deck`;
    const cards: CardInstance[] = [];
    let reshuffleCount = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.refillDeck(playerId, rng)) {
        reshuffleCount += 1;
        onReshuffle?.();
      }
      const card = this.takeTop(deckZoneName);
      if (card === undefined) break;
      cards.push(card);
    }
    return { cards, reshuffleCount };
  }

  /** Checks exact object membership, stable-ID uniqueness, and zone metadata. */
  assertConsistent(): void {
    this.rebuildMembership();
  }

  private listZoneNames(): readonly string[] {
    return this.descriptors.map((descriptor) => descriptor.zoneName);
  }

  private requireZoneName(zoneName: string): string {
    return this.requireDescriptor(zoneName).zoneName;
  }

  private requireDescriptor(
    zoneName: string
  ): PhysicalCardZoneStorageDescriptor {
    const descriptor = this.descriptorsByName.get(zoneName);
    if (descriptor === undefined) {
      throw new Error(`Missing physical card zone ${zoneName}`);
    }
    return descriptor;
  }

  private assertNoDuplicateInstanceId(
    card: CardInstance,
    destinationZoneName: string
  ): void {
    for (const descriptor of this.descriptors) {
      for (const existingCard of descriptor.readRaw()) {
        if (existingCard.instanceId !== card.instanceId) continue;
        if (existingCard === card) {
          if (descriptor.zoneName === destinationZoneName) return;
          throw new Error(
            `Physical card ${card.instanceId} already belongs to ${descriptor.zoneName}`
          );
        }
        throw new Error(
          `Duplicate physical card instance ID ${card.instanceId}`
        );
      }
    }
  }

  private seedClonedMembership(
    clonedMembership: PhysicalCardLedgerClonedMembership
  ): void {
    if (clonedMembership.cards.length !== clonedMembership.zoneNames.length) {
      throw new Error("Cloned Ledger membership has mismatched lengths");
    }
    for (const [index, card] of clonedMembership.cards.entries()) {
      const zoneName = clonedMembership.zoneNames[index];
      if (zoneName === undefined) {
        throw new Error(`Missing cloned Ledger zone for ${card.instanceId}`);
      }
      this.requireDescriptor(zoneName);
      if (this.hasCardLedgerTag(card)) {
        throw new Error(
          `Duplicate physical card binding for ${card.instanceId}`
        );
      }
      // clonePhysicalCardLedger has already materialized fresh card objects;
      // they cannot belong to another branch, so the clone fast-path only
      // needs to seed the local zone index.
      this.setCardZone(card, zoneName);
    }
  }

  private rebuildMembership(): void {
    const zonesByCard = new Map<CardInstance, string[]>();
    const zonesById = new Map<string, string[]>();
    for (const descriptor of this.descriptors) {
      for (const card of descriptor.readRaw()) {
        const cardZones = zonesByCard.get(card) ?? [];
        cardZones.push(descriptor.zoneName);
        zonesByCard.set(card, cardZones);
        const idZones = zonesById.get(card.instanceId) ?? [];
        idZones.push(descriptor.zoneName);
        zonesById.set(card.instanceId, idZones);
        this.assertBranchCard(card);
        this.setCardZone(card, descriptor.zoneName);
      }
    }
    for (const [card, zones] of zonesByCard) {
      if (zones.length > 1) {
        throw new Error(
          `card ${card.instanceId} appears in multiple zones: ${zones.join(", ")}`
        );
      }
    }
    for (const [cardInstanceId, zones] of zonesById) {
      if (zones.length > 1) {
        throw new Error(
          `card ${cardInstanceId} appears in multiple zones: ${zones.join(", ")}`
        );
      }
    }
  }

  private assertBranchCard(card: CardInstance): void {
    this.ensureBranchCardOwnership(card);
    if (!this.hasCardLedgerTag(card)) {
      this.writeCardLedgerTag(
        card,
        this.branchIdentity * physicalCardZoneTagStride
      );
    }
  }

  private ensureBranchCardOwnership(card: CardInstance): void {
    const existingOwner = this.getCardBranchIdentity(card);
    if (existingOwner !== undefined && existingOwner !== this.branchIdentity) {
      throw new Error(
        `Physical card ${card.instanceId} belongs to another Ledger branch`
      );
    }
  }

  private getCardBranchIdentity(card: CardInstance): number | undefined {
    const tag = physicalCardLedgerTags.get(card);
    return tag === undefined
      ? undefined
      : Math.floor(tag / physicalCardZoneTagStride);
  }

  private hasCardLedgerTag(card: CardInstance): boolean {
    return this.getCardBranchIdentity(card) === this.branchIdentity;
  }

  private getCardZone(card: CardInstance): string | undefined {
    const tag = physicalCardLedgerTags.get(card);
    if (
      tag === undefined ||
      Math.floor(tag / physicalCardZoneTagStride) !== this.branchIdentity
    ) {
      return undefined;
    }
    const zoneIndex = tag % physicalCardZoneTagStride;
    return zoneIndex === 0
      ? undefined
      : this.descriptors[zoneIndex - 1]?.zoneName;
  }

  private setCardZone(card: CardInstance, zoneName: string): void {
    this.ensureBranchCardOwnership(card);
    const zoneIndex = this.zoneIndexesByName.get(zoneName);
    if (zoneIndex === undefined) {
      throw new Error(`Missing physical card zone ${zoneName}`);
    }
    this.writeCardLedgerTag(
      card,
      this.branchIdentity * physicalCardZoneTagStride + zoneIndex + 1
    );
  }

  private clearCardZone(card: CardInstance): void {
    if (this.hasCardLedgerTag(card)) {
      this.writeCardLedgerTag(
        card,
        this.branchIdentity * physicalCardZoneTagStride
      );
    }
  }

  private writeCardLedgerTag(card: CardInstance, tag: number): void {
    physicalCardLedgerTags.set(card, tag);
  }
}

export function getPhysicalCardLedger(
  state: PhysicalCardLedgerState
): PhysicalCardLedger {
  const existing = physicalCardLedgers.get(state);
  if (existing !== undefined) return existing;
  const commonStateLedger = physicalCardLedgersByCommonState.get(state.common);
  if (commonStateLedger !== undefined) {
    physicalCardLedgers.set(state, commonStateLedger);
    return commonStateLedger;
  }
  const ledger = new PhysicalCardLedger(state);
  physicalCardLedgers.set(state, ledger);
  physicalCardLedgersByCommonState.set(state.common, ledger);
  return ledger;
}

export function installPhysicalCardLedger(
  state: GameState,
  cardZoneBindings?: readonly PhysicalCardLedgerCardZoneBinding[]
): PhysicalCardLedger {
  const ledger = new PhysicalCardLedger(state, cardZoneBindings);
  physicalCardLedgers.set(state, ledger);
  physicalCardLedgersByCommonState.set(state.common, ledger);
  return ledger;
}

/** Installs membership already produced while cloning a Ledger branch. */
export function installClonedPhysicalCardLedger(
  state: GameState,
  cards: readonly CardInstance[],
  zoneNames: readonly string[]
): PhysicalCardLedger {
  const ledger = new PhysicalCardLedger(state, undefined, { cards, zoneNames });
  physicalCardLedgers.set(state, ledger);
  physicalCardLedgersByCommonState.set(state.common, ledger);
  return ledger;
}

export function buildControlledObjectView(
  state: GameState,
  playerId: PlayerId
): ControlledObjectView {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) {
    throw new Error(`Missing player ${playerId}`);
  }

  return {
    playerId,
    cards: getControlledCards(state, player).map((card) => ({
      sourceType: "controlledCard" as const,
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    })),
    tokens: player.deadWizardTokens.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    wizardProperties: player.wizardProperties.map((token) => ({
      sourceType: "controlledToken" as const,
      token,
      definition: mustGetTokenDefinition(state, token.definitionId),
    })),
    statuses: [...player.statuses],
    trophyLikeObjects: [...player.trophyLikeObjects],
  };
}

export function grantTemporaryControl(
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId
): void {
  const location = getPhysicalCardLedger(state).locateCard(card);
  if (location === undefined) {
    throw new Error(`Cannot control detached card ${card.instanceId}`);
  }
  const existing = state.turn.temporaryCardControls.find(
    (control) => control.card === card
  );
  if (existing !== undefined) {
    existing.controllerId = controllerId;
    return;
  }

  state.turn.temporaryCardControls.push({ card, controllerId });
}

/** Assigns the scoring owner of a card through the Ledger ownership seam. */
export function setCardOwner(
  card: CardInstance,
  ownerId: CardInstance["ownerId"]
): void {
  card.ownerId = ownerId;
}

/** Returns the player that owns a card through the Ledger ownership seam. */
export function findCardOwner(
  state: Pick<GameState, "players">,
  card: Pick<CardInstance, "ownerId">
): PlayerState | undefined {
  return state.players.find((candidate) => candidate.playerId === card.ownerId);
}

export function releaseTemporaryControls(state: GameState): void {
  state.turn.temporaryCardControls = [];
}

export function removeTemporaryCardControl(
  state: GameState,
  card: CardInstance
): void {
  state.turn.temporaryCardControls = state.turn.temporaryCardControls.filter(
    (control) => control.card !== card
  );
}

/** Removes a controlled DWT and clears its ownership when it leaves play. */
export function removeDeadWizardToken(
  player: PlayerState,
  tokenInstanceId: TokenInstance["instanceId"]
): TokenInstance | undefined {
  const tokenIndex = player.deadWizardTokens.findIndex(
    (token) => token.instanceId === tokenInstanceId
  );
  if (tokenIndex < 0) {
    return undefined;
  }

  const [token] = player.deadWizardTokens.splice(tokenIndex, 1);
  if (token === undefined) {
    return undefined;
  }
  token.ownerId = "common";
  return token;
}

export function cloneTemporaryControls(
  controls: readonly TemporaryCardControl[]
): TemporaryCardControl[] {
  return controls.map((control) => ({ ...control }));
}

export function getControlledCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  const controlledCards = [...player.permanents];
  const controlledIds = new Set(controlledCards.map((card) => card.instanceId));

  for (const control of state.turn.temporaryCardControls) {
    if (
      control.controllerId !== player.playerId ||
      controlledIds.has(control.card.instanceId)
    ) {
      continue;
    }

    const location = getPhysicalCardLedger(state).locateCard(control.card);
    if (location === undefined) {
      continue;
    }

    controlledCards.push(location.card);
    controlledIds.add(location.card.instanceId);
  }

  return controlledCards;
}

export function getControlledOngoingCards(
  state: GameState,
  player: PlayerState
): CardInstance[] {
  return getControlledCards(state, player).filter((card) => {
    const definition = state.cardDefinitions.get(card.definitionId);
    return (
      definition?.engine.playableInV0 === true && definition.engine.isOngoing
    );
  });
}

export function replaceOwnedCardDefinitionInPlayerZones(
  player: PlayerState,
  fromDefinitionId: CardInstance["definitionId"],
  createReplacement: () => CardInstance
): boolean {
  const descriptors = listPlayerPhysicalCardZoneDescriptors(player);
  const replacementPriority = (
    descriptor: PhysicalCardZoneDescriptor
  ): number =>
    descriptor.zoneName === `${player.playerId}.hand`
      ? 0
      : descriptor.zoneName === `${player.playerId}.deck`
        ? 1
        : 2;
  const descriptorsInReplacementOrder = [...descriptors].sort(
    (left, right) => replacementPriority(left) - replacementPriority(right)
  );

  for (const descriptor of descriptorsInReplacementOrder) {
    const cards = descriptor.read();
    const index = cards.findIndex(
      (card) =>
        card.ownerId === player.playerId &&
        card.definitionId === fromDefinitionId
    );
    if (index < 0) {
      continue;
    }

    descriptor.replace([
      ...cards.slice(0, index),
      createReplacement(),
      ...cards.slice(index + 1),
    ]);
    return true;
  }

  return false;
}

function listPlayerPhysicalCardZoneDescriptors(
  player: PlayerState,
  getDiagnostics?: () => PhysicalCardDiagnosticsSink | undefined
): readonly PhysicalCardZoneStorageDescriptor[] {
  return [
    createArrayCardZoneDescriptor(
      `${player.playerId}.deck`,
      () => player.deck,
      (cards) => {
        player.deck = cards;
      },
      player.playerId,
      true,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.hand`,
      () => player.hand,
      (cards) => {
        player.hand = cards;
      },
      player.playerId,
      true,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.discard`,
      () => player.discard,
      (cards) => {
        player.discard = cards;
      },
      player.playerId,
      true,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.playedThisTurn`,
      () => player.playedThisTurn,
      (cards) => {
        player.playedThisTurn = cards;
      },
      undefined,
      true,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.permanents`,
      () => player.permanents,
      (cards) => {
        player.permanents = cards;
      },
      undefined,
      true,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      `${player.playerId}.unboughtFamiliars`,
      () => player.unboughtFamiliars,
      (card) => {
        player.unboughtFamiliars = card;
      },
      player.playerId,
      false,
      getDiagnostics
    ),
  ];
}

export function listPhysicalCardZoneDescriptors(
  state: Pick<GameState, "players" | "common" | "physicalCardDiagnostics">
): readonly PhysicalCardZoneDescriptor[] {
  return getPhysicalCardLedger(state).zoneDescriptors;
}

function listBuiltinPhysicalCardZoneDescriptors(
  state: Pick<GameState, "players" | "common" | "physicalCardDiagnostics">,
  getDiagnostics?: () => PhysicalCardDiagnosticsSink | undefined
): readonly PhysicalCardZoneStorageDescriptor[] {
  return [
    ...state.players.flatMap((player) =>
      listPlayerPhysicalCardZoneDescriptors(player, getDiagnostics)
    ),
    createArrayCardZoneDescriptor(
      "mainMarket",
      () => state.common.market,
      (cards) => {
        state.common.market = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "legendMarket",
      () => state.common.legendMarket,
      (cards) => {
        state.common.legendMarket = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "mainDeck",
      () => state.common.mainDeck,
      (cards) => {
        state.common.mainDeck = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "legendDeck",
      () => state.common.legendDeck,
      (cards) => {
        state.common.legendDeck = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "wildMagicStack",
      () => state.common.wildMagicStack,
      (cards) => {
        state.common.wildMagicStack = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "limpWandStack",
      () => state.common.limpWandStack,
      (cards) => {
        state.common.limpWandStack = cards;
      },
      "common",
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "destroyedPile",
      () => state.common.destroyedPile,
      (cards) => {
        state.common.destroyedPile = cards;
      },
      undefined,
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "destroyedMayhem",
      () => state.common.destroyedMayhem,
      (cards) => {
        state.common.destroyedMayhem = cards;
      },
      undefined,
      false,
      getDiagnostics
    ),
    createArrayCardZoneDescriptor(
      "destroyedMegaMayhem",
      () => state.common.destroyedMegaMayhem,
      (cards) => {
        state.common.destroyedMegaMayhem = cards;
      },
      undefined,
      false,
      getDiagnostics
    ),
  ];
}

/** Lists player-owned cards in scoring zones, including temporarily controlled cards. */
export function listOwnedScoringCards(
  state: GameState,
  playerId: PlayerId
): ControlledCardObject[] {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId
  );
  if (player === undefined) return [];

  const ledger = getPhysicalCardLedger(state);
  const scoringCards: ControlledCardObject[] = [];

  for (const zoneName of [
    `${playerId}.deck`,
    `${playerId}.hand`,
    `${playerId}.discard`,
    `${playerId}.playedThisTurn`,
    `${playerId}.permanents`,
  ]) {
    const zoneCards = ledger.readZone(zoneName);
    state.physicalCardDiagnostics?.recordPhysicalZonePass(zoneCards.length);
    for (const card of zoneCards) {
      if (card.ownerId !== playerId) continue;
      scoringCards.push({
        sourceType: "controlledCard",
        card,
        definition: mustGetCardDefinition(state, card.definitionId),
      });
    }
  }

  if (state.turn.temporaryCardControls.length === 0) {
    return scoringCards;
  }

  const seenCards = new Set(scoringCards.map((object) => object.card));
  for (const control of state.turn.temporaryCardControls) {
    const card = control.card;
    if (card.ownerId !== playerId || seenCards.has(card)) continue;
    if (!ledger.isCardInScoringZone(card)) continue;
    seenCards.add(card);
    scoringCards.push({
      sourceType: "controlledCard",
      card,
      definition: mustGetCardDefinition(state, card.definitionId),
    });
  }

  return scoringCards;
}

export interface PhysicalCardLedgerClone {
  readonly players: GameState["players"];
  readonly common: GameState["common"];
  readonly mainMarketCardHandReplacementSourceCards: GameState["turn"]["mainMarketCardHandReplacementSourceCards"];
  readonly gainedCards: GameState["turn"]["gainedCards"];
  readonly deadWizardTokenKillReplacement: GameState["turn"]["deadWizardTokenKillReplacement"];
  readonly temporaryCardControls: TemporaryCardControl[];
  readonly physicalCards: readonly CardInstance[];
  readonly physicalCardZoneNames: readonly string[];
}

/** Creates an isolated clone of the Ledger-owned cards and control metadata. */
export function clonePhysicalCardLedger(
  source: GameState
): PhysicalCardLedgerClone {
  const sourceLedger = getPhysicalCardLedger(source);
  const sourcePhysicalCards: CardInstance[] = [];
  const sourcePhysicalCardZoneNames: string[] = [];
  for (const descriptor of sourceLedger.zoneDescriptors) {
    for (const card of sourceLedger.readZone(descriptor.zoneName)) {
      sourcePhysicalCards.push(card);
      sourcePhysicalCardZoneNames.push(descriptor.zoneName);
    }
  }
  const physicalCards = new Set(sourcePhysicalCards);
  const clones = new Map<object, object>();
  const clone: Omit<
    PhysicalCardLedgerClone,
    "physicalCards" | "physicalCardZoneNames"
  > = cloneLedgerValue(
    {
      players: source.players,
      common: source.common,
      mainMarketCardHandReplacementSourceCards:
        source.turn.mainMarketCardHandReplacementSourceCards,
      gainedCards: source.turn.gainedCards,
      deadWizardTokenKillReplacement:
        source.turn.deadWizardTokenKillReplacement,
      temporaryCardControls: source.turn.temporaryCardControls,
    },
    physicalCards,
    clones
  );
  const clonedPhysicalCards: CardInstance[] = [];
  for (const sourceCard of sourcePhysicalCards) {
    const clonedCard = clones.get(sourceCard);
    if (clonedCard === undefined) {
      throw new Error(
        `Physical card ${sourceCard.instanceId} was not cloned with its zone`
      );
    }
    clonedPhysicalCards.push(clonedCard as CardInstance);
  }
  return {
    ...clone,
    physicalCards: clonedPhysicalCards,
    physicalCardZoneNames: sourcePhysicalCardZoneNames,
  };
}

type LedgerCloneValue =
  | object
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

interface LedgerCloneObject {
  [key: string]: LedgerCloneValue;
}

function isLedgerCloneArray(value: object): value is LedgerCloneValue[] {
  return Array.isArray(value);
}

function isLedgerCloneMap(
  value: object
): value is Map<LedgerCloneValue, LedgerCloneValue> {
  return value instanceof Map;
}

function isLedgerCloneSet(value: object): value is Set<LedgerCloneValue> {
  return value instanceof Set;
}

function isLedgerCloneObject(value: object): value is LedgerCloneObject {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function cloneLedgerValue<T extends LedgerCloneValue>(
  value: T,
  physicalCards: ReadonlySet<object>,
  clones = new Map<object, object>()
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (physicalCards.has(value)) {
    const existingPhysicalCard = clones.get(value);
    if (existingPhysicalCard !== undefined) {
      return existingPhysicalCard as T;
    }
    const clonedPhysicalCard = { ...(value as CardInstance) };
    clones.set(value, clonedPhysicalCard);
    return clonedPhysicalCard as T;
  }
  const existing = clones.get(value);
  if (existing !== undefined) {
    return existing as T;
  }
  if (isLedgerCloneArray(value)) {
    const clone: LedgerCloneValue[] = [];
    clones.set(value, clone);
    for (const child of value) {
      clone.push(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (isLedgerCloneMap(value)) {
    const clone = new Map<LedgerCloneValue, LedgerCloneValue>();
    clones.set(value, clone);
    for (const [key, child] of value) {
      clone.set(
        cloneLedgerValue(key, physicalCards, clones),
        cloneLedgerValue(child, physicalCards, clones)
      );
    }
    return clone as T;
  }
  if (isLedgerCloneSet(value)) {
    const clone = new Set<LedgerCloneValue>();
    clones.set(value, clone);
    for (const child of value) {
      clone.add(cloneLedgerValue(child, physicalCards, clones));
    }
    return clone as T;
  }
  if (!isLedgerCloneObject(value)) {
    const clone = structuredClone(value);
    clones.set(value, clone);
    return clone;
  }

  const clone: LedgerCloneObject = {};
  clones.set(value, clone);
  copyRuntimeEffectVerification(value, clone);
  for (const [key, child] of Object.entries(value)) {
    clone[key] = cloneLedgerValue(child, physicalCards, clones);
  }
  return clone as T;
}

export function listPhysicalCardLocations(
  state: GameState
): readonly PhysicalCardLocation[] {
  const locations: PhysicalCardLocation[] = [];
  for (const descriptor of listPhysicalCardZoneDescriptors(state)) {
    for (const [index, card] of descriptor.read().entries()) {
      locations.push(
        descriptor.expectedOwnerId === undefined
          ? { card, zoneName: descriptor.zoneName, index }
          : {
              card,
              zoneName: descriptor.zoneName,
              index,
              expectedOwnerId: descriptor.expectedOwnerId,
            }
      );
    }
  }
  state.physicalCardDiagnostics?.recordFullLocationList(locations.length);
  return locations;
}

export function capturePhysicalCardLocationSnapshot(
  state: GameState
): PhysicalCardLocationSnapshot {
  const ledger = getPhysicalCardLedger(state);
  const positions = new Map<
    CardInstance["instanceId"],
    { readonly zoneName: string; readonly index: number }
  >();
  for (const descriptor of ledger.zoneDescriptors) {
    for (const [index, card] of ledger
      .readZone(descriptor.zoneName)
      .entries()) {
      positions.set(card.instanceId, { zoneName: descriptor.zoneName, index });
    }
  }
  return { positions };
}

export function countPhysicalCardLocationChanges(
  before: PhysicalCardLocationSnapshot,
  after: PhysicalCardLocationSnapshot
): number {
  let changes = 0;
  for (const [cardInstanceId, previous] of before.positions) {
    const current = after.positions.get(cardInstanceId);
    if (
      current === undefined ||
      current.zoneName !== previous.zoneName ||
      current.index !== previous.index
    ) {
      changes += 1;
    }
  }
  for (const cardInstanceId of after.positions.keys()) {
    if (!before.positions.has(cardInstanceId)) {
      changes += 1;
    }
  }
  return changes;
}

/** Lists owned cards in one player's Ledger-owned physical zones. */
export function listOwnedPlayerPhysicalCards(
  state: GameState,
  playerId: PlayerId
): readonly CardInstance[] {
  return getPhysicalCardLedger(state)
    .listPlayerCards(playerId)
    .filter((card) => card.ownerId === playerId);
}

/** Lists locations that can supply a voluntary Defense for one player. */
export function listDefenseCardLocations(
  state: GameState,
  playerId: PlayerId
): readonly CardLocation[] {
  return getPhysicalCardLedger(state)
    .readZone(`${playerId}.hand`)
    .filter((card) => card.ownerId === playerId)
    .map((card) => ({ card, zoneName: `${playerId}.hand` }));
}

/** Restores a card detached by a committed nested resolution into a Ledger zone. */
export function insertDetachedCard(
  state: GameState,
  card: CardInstance,
  destinationZoneName: string,
  placement: "front" | "back"
): PhysicalCardMoveResult {
  return getPhysicalCardLedger(state).insertDetachedCard(
    card,
    destinationZoneName,
    placement
  );
}

function createArrayCardZoneDescriptor(
  zoneName: string,
  readStorage: () => CardInstance[],
  replaceStorage: (cards: CardInstance[]) => void,
  expectedOwnerId?: CardInstance["ownerId"],
  scoringEligible = false,
  getDiagnostics?: () => PhysicalCardDiagnosticsSink | undefined
): PhysicalCardZoneStorageDescriptor {
  const read: PhysicalCardZoneStorageDescriptor["read"] =
    getDiagnostics === undefined
      ? () => readStorage().map((card) => card)
      : (instrument = true) => {
          const cards = readStorage().map((card) => card);
          if (instrument) {
            getDiagnostics()?.recordPhysicalZonePass(cards.length);
          }
          return cards;
        };
  const descriptor: PhysicalCardZoneStorageDescriptor = {
    zoneName,
    cardinality: "many",
    scoringEligible,
    ...(expectedOwnerId === undefined ? {} : { expectedOwnerId }),
    read,
    readRaw: readStorage,
    replace(cards) {
      const storage = readStorage();
      Array.prototype.splice.call(storage, 0, storage.length, ...cards);
      replaceStorage(storage);
    },
  };
  return descriptor;
}

function mustGetCardDefinition(
  state: GameState,
  definitionId: CardInstance["definitionId"]
): CardDefinition {
  const definition = state.cardDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing card definition ${definitionId}`);
  }
  return definition;
}

function mustGetTokenDefinition(
  state: GameState,
  definitionId: TokenInstance["definitionId"]
): TokenDefinition {
  const definition = state.tokenDefinitions.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Missing token definition ${definitionId}`);
  }
  return definition;
}
