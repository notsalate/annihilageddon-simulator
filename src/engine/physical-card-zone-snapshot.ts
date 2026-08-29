import {
  getPhysicalCardLedger,
  type PhysicalCardZoneDescriptor,
} from "./control-ledger.js";
import type { CardInstance, GameState } from "./setup.js";

interface PhysicalCardZoneMoveSnapshot {
  readonly descriptor: PhysicalCardZoneDescriptor;
  readonly cards: readonly CardInstance[];
}

export interface PhysicalCardZoneStateSnapshot {
  readonly zones: readonly PhysicalCardZoneMoveSnapshot[];
}

export type PhysicalCardZoneStateSnapshotResult =
  | { readonly ok: true; readonly snapshot: PhysicalCardZoneStateSnapshot }
  | { readonly ok: false; readonly reason: string };

export type PhysicalCardZoneStateRestoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** Captures every Ledger-owned physical zone for a local savepoint. */
export function capturePhysicalCardZoneState(
  state: GameState
): PhysicalCardZoneStateSnapshotResult {
  const ledger = getPhysicalCardLedger(state);
  const descriptors = ledger.zoneDescriptors;
  try {
    for (const descriptor of descriptors) ledger.readZone(descriptor.zoneName);
  } catch (error) {
    return { ok: false, reason: describePhysicalCardZoneError(error) };
  }
  if (
    new Set(descriptors.map((descriptor) => descriptor.zoneName)).size !==
    descriptors.length
  ) {
    return {
      ok: false,
      reason: "Physical card zone snapshot found duplicate descriptors",
    };
  }

  const zones: PhysicalCardZoneMoveSnapshot[] = [];
  for (const descriptor of descriptors) {
    zones.push({
      descriptor,
      cards: [...ledger.readZone(descriptor.zoneName)],
    });
  }
  return { ok: true, snapshot: { zones } };
}

/** Restores every captured physical zone and reports failures without throwing. */
export function restorePhysicalCardZoneState(
  state: GameState,
  snapshot: PhysicalCardZoneStateSnapshot
): PhysicalCardZoneStateRestoreResult {
  const ledger = getPhysicalCardLedger(state);
  const descriptors = ledger.zoneDescriptors;
  try {
    for (const descriptor of descriptors) ledger.readZone(descriptor.zoneName);
  } catch (error) {
    return { ok: false, reason: describePhysicalCardZoneError(error) };
  }
  const descriptorsByName = new Map(
    descriptors.map((descriptor) => [descriptor.zoneName, descriptor])
  );
  const snapshotsByName = new Map(
    snapshot.zones.map((zone) => [zone.descriptor.zoneName, zone])
  );
  if (descriptorsByName.size !== descriptors.length) {
    return {
      ok: false,
      reason: "Physical card zone restore found duplicate descriptors",
    };
  }
  if (snapshotsByName.size !== snapshot.zones.length) {
    return {
      ok: false,
      reason: "Physical card zone restore found duplicate snapshots",
    };
  }
  for (const descriptor of descriptors) {
    if (!snapshotsByName.has(descriptor.zoneName)) {
      return {
        ok: false,
        reason: `Physical card zone restore found unknown zone ${descriptor.zoneName}`,
      };
    }
  }
  for (const zone of snapshot.zones) {
    const descriptor = descriptorsByName.get(zone.descriptor.zoneName);
    if (descriptor === undefined) {
      return {
        ok: false,
        reason: `Physical card zone restore is missing zone ${zone.descriptor.zoneName}`,
      };
    }
    if (descriptor.cardinality === "zeroOrOne" && zone.cards.length > 1) {
      return {
        ok: false,
        reason: `Physical card zone restore violates singleton zone ${descriptor.zoneName}`,
      };
    }
  }

  const errors: string[] = [];
  for (const zone of snapshot.zones) {
    const descriptor = descriptorsByName.get(zone.descriptor.zoneName);
    if (descriptor === undefined) {
      return {
        ok: false,
        reason: `Physical card zone restore is missing zone ${zone.descriptor.zoneName}`,
      };
    }
    try {
      ledger.replaceZone(descriptor.zoneName, zone.cards);
      const restoredCards = ledger.readZone(descriptor.zoneName);
      if (
        restoredCards.length !== zone.cards.length ||
        restoredCards.some((card, index) => card !== zone.cards[index])
      ) {
        errors.push(`Cannot restore physical card zone ${descriptor.zoneName}`);
      }
    } catch (error) {
      errors.push(
        `${descriptor.zoneName}: ${describePhysicalCardZoneError(error)}`
      );
    }
  }
  return errors.length === 0
    ? { ok: true }
    : { ok: false, reason: errors.join("; ") };
}

function describePhysicalCardZoneError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Cannot access physical card zone";
}
