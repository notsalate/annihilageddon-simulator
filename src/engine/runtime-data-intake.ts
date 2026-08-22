import { statSync } from "node:fs";
import path from "node:path";

import {
  decodeCurrentRuntimeDataPack,
  validateExecutableDataPack,
  type DataPackValidationOptions,
  type LoadedDataPack,
} from "./data.js";
import type { EffectRuntimeMode } from "./effect-runtime-registry.js";
import { markRuntimeEffectTreeVerified } from "./runtime-effect-verification.js";

const DEFAULT_MANIFEST_PATH = "data/packs/current-runtime.json";

export interface RuntimeDataFilesystemSource {
  rootDir: string;
  dataPackPath?: string;
  dataPack?: never;
}

export interface RuntimeDataPreloadedSource {
  dataPack: LoadedDataPack;
  rootDir?: never;
  dataPackPath?: never;
}

export type RuntimeDataSource =
  | RuntimeDataFilesystemSource
  | RuntimeDataPreloadedSource;

export interface RuntimeDataIntakeOptions {
  mode?: EffectRuntimeMode;
}

export type RuntimeDataIntakeErrorKind = "source" | "decode" | "validation";

declare const verifiedRuntimeDataPackBrand: unique symbol;

export type VerifiedRuntimeDataPack = LoadedDataPack & {
  readonly [verifiedRuntimeDataPackBrand]: true;
};

export class RuntimeDataIntakeError extends Error {
  override readonly name = "RuntimeDataIntakeError";

  constructor(
    readonly kind: RuntimeDataIntakeErrorKind,
    readonly errors: readonly string[]
  ) {
    super(`Runtime Data ${kind} failed:\n${errors.join("\n")}`);
  }
}

const verifiedDataPacks = new WeakSet<object>();

export function intakeRuntimeData(
  source: RuntimeDataSource,
  options: RuntimeDataIntakeOptions = {}
): VerifiedRuntimeDataPack {
  if ("dataPack" in source) {
    if (isVerifiedRuntimeDataPack(source.dataPack)) {
      return source.dataPack;
    }

    return validateAndFreeze(source.dataPack, options.mode, true);
  }

  const manifestPath = source.dataPackPath ?? DEFAULT_MANIFEST_PATH;
  assertFilesystemSource(source.rootDir, manifestPath);

  let decoded: ReturnType<typeof decodeCurrentRuntimeDataPack>;
  try {
    decoded = decodeCurrentRuntimeDataPack(source.rootDir, manifestPath);
  } catch (error) {
    throw new RuntimeDataIntakeError("source", [errorMessage(error)]);
  }

  if (!decoded.ok) {
    throw new RuntimeDataIntakeError("decode", decoded.errors);
  }

  return validateAndFreeze(decoded.value, options.mode, false);
}

export function isVerifiedRuntimeDataPack(
  dataPack: LoadedDataPack
): dataPack is VerifiedRuntimeDataPack {
  return verifiedDataPacks.has(dataPack);
}

function validateAndFreeze(
  dataPack: LoadedDataPack,
  requestedMode: EffectRuntimeMode | undefined,
  cloneSource: boolean
): VerifiedRuntimeDataPack {
  const mode =
    requestedMode ??
    (dataPack.manifest.mappingStatus === "fixture" ? "fixture" : "combat");
  const validationOptions: DataPackValidationOptions = {
    mode,
    allowFixtureSetupGaps: dataPack.manifest.mappingStatus === "fixture",
    allowFixtureCatalogGaps: dataPack.manifest.mappingStatus === "fixture",
  };
  const validation = validateExecutableDataPack(dataPack, validationOptions);
  if (!validation.ok) {
    throw new RuntimeDataIntakeError("validation", validation.errors);
  }

  const immutableDataPack = createImmutableDataPack(dataPack, cloneSource);
  verifiedDataPacks.add(immutableDataPack);
  return immutableDataPack;
}

function createImmutableDataPack(
  dataPack: LoadedDataPack,
  cloneSource: boolean
): VerifiedRuntimeDataPack {
  const cloned = cloneSource ? structuredClone(dataPack) : dataPack;
  const immutable = {
    manifest: freezeDeep(cloned.manifest),
    cardDefinitions: createReadonlyMap(cloned.cardDefinitions),
    tokenDefinitions: createReadonlyMap(cloned.tokenDefinitions),
    decks: freezeDeep(cloned.decks),
    tokenStacks: freezeDeep(cloned.tokenStacks),
  } satisfies LoadedDataPack;

  if (cloneSource) {
    markDataPackRuntimeEffectsVerified(immutable);
  }

  return Object.freeze(immutable) as VerifiedRuntimeDataPack;
}

function markDataPackRuntimeEffectsVerified(dataPack: LoadedDataPack): void {
  for (const definition of dataPack.cardDefinitions.values()) {
    for (const effect of definition.engine.effects) {
      markRuntimeEffectTreeVerified(effect);
    }
  }

  for (const definition of dataPack.tokenDefinitions.values()) {
    const effects =
      definition.kind === "deadWizardToken"
        ? definition.effects
        : definition.engine?.effects;
    if (effects === undefined) {
      continue;
    }

    for (const effect of effects) {
      markRuntimeEffectTreeVerified(effect);
    }
  }
}

function createReadonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const map = new Map<K, V>();
  for (const [key, value] of source) {
    map.set(key, freezeDeep(value));
  }

  const view: ReadonlyMap<K, V> = {
    get size() {
      return map.size;
    },
    get(key) {
      return map.get(key);
    },
    has(key) {
      return map.has(key);
    },
    entries() {
      return map.entries();
    },
    keys() {
      return map.keys();
    },
    values() {
      return map.values();
    },
    forEach(callback, thisArg) {
      map.forEach((value, key) => {
        callback.call(thisArg, value, key, view);
      });
    },
    [Symbol.iterator]() {
      return map[Symbol.iterator]();
    },
  };

  return Object.freeze(view);
}

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    freezeDeep(child, seen);
  }

  return Object.freeze(value);
}

function assertFilesystemSource(rootDir: string, manifestPath: string): void {
  try {
    if (!statSync(rootDir).isDirectory()) {
      throw new Error(`Runtime data root is not a directory: ${rootDir}`);
    }

    const absoluteManifestPath = path.resolve(rootDir, manifestPath);
    if (!statSync(absoluteManifestPath).isFile()) {
      throw new Error(`Runtime data manifest is not a file: ${manifestPath}`);
    }
  } catch (error) {
    throw new RuntimeDataIntakeError("source", [errorMessage(error)]);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
