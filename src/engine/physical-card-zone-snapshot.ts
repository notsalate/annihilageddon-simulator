import {
  listPhysicalCardZoneDescriptors,
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
  let descriptors: readonly PhysicalCardZoneDescriptor[];
  try {
    descriptors = listPhysicalCardZoneDescriptors(state);
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
    const snapshotResult = createPhysicalCardZoneMoveSnapshot(descriptor);
    if (!snapshotResult.ok) {
      return snapshotResult;
    }
    zones.push(snapshotResult.snapshot);
  }
  return { ok: true, snapshot: { zones } };
}

/** Restores every captured physical zone and reports failures without throwing. */
export function restorePhysicalCardZoneState(
  state: GameState,
  snapshot: PhysicalCardZoneStateSnapshot
): PhysicalCardZoneStateRestoreResult {
  let descriptors: readonly PhysicalCardZoneDescriptor[];
  try {
    descriptors = listPhysicalCardZoneDescriptors(state);
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
    const error = restorePhysicalCardZoneMoveSnapshot(zone, descriptor);
    if (error !== undefined) {
      errors.push(error);
    }
  }
  return errors.length === 0
    ? { ok: true }
    : { ok: false, reason: errors.join("; ") };
}

function createPhysicalCardZoneMoveSnapshot(
  descriptor: PhysicalCardZoneDescriptor,
  existingCards?: readonly CardInstance[]
):
  | { readonly ok: true; readonly snapshot: PhysicalCardZoneMoveSnapshot }
  | { readonly ok: false; readonly reason: string } {
  let cards: readonly CardInstance[];
  try {
    cards = existingCards ?? descriptor.read();
  } catch (error) {
    return { ok: false, reason: describePhysicalCardZoneError(error) };
  }
  return {
    ok: true,
    snapshot: {
      descriptor,
      cards: [...cards],
    },
  };
}

function restorePhysicalCardZoneMoveSnapshot(
  snapshot: PhysicalCardZoneMoveSnapshot,
  descriptor = snapshot.descriptor
): string | undefined {
  try {
    descriptor.replace(snapshot.cards);
    const restoredCards = descriptor.read();
    if (
      restoredCards.length !== snapshot.cards.length ||
      restoredCards.some((card, index) => card !== snapshot.cards[index])
    ) {
      return `Cannot restore physical card zone ${descriptor.zoneName}`;
    }
    return undefined;
  } catch (error) {
    return `${descriptor.zoneName}: ${describePhysicalCardZoneError(error)}`;
  }
}

function describePhysicalCardZoneError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Cannot access physical card zone";
}
