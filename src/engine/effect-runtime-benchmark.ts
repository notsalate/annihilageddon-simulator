import {
  getBenchmarkCommit,
  getBenchmarkEnvironmentFingerprint,
  median,
  systemBenchmarkClock,
} from "./benchmark-support.js";
import type { TokenDefinition } from "./data.js";
import { executeEffect } from "./effect-runtime.js";
import { resourceDrawEffectIds } from "./effect-runtime-resources-draw.js";
import { initializeGame, type GameState, type PlayerState } from "./setup.js";
import type {
  EffectSourceContext,
  EffectRuntimeMode,
} from "./effect-runtime-registry.js";
import { decodeRuntimeEffectAtIntake } from "./runtime-data-intake.js";
import type { RuntimeEffect } from "./runtime-effect.js";

export const EFFECT_RUNTIME_BENCHMARK_CONTRACT_VERSION =
  "effect-runtime-typed-execution-v1" as const;
export const EFFECT_RUNTIME_BENCHMARK_ITERATIONS = 20_000;
const MEASUREMENT_COUNT = 3 as const;

export interface EffectRuntimeBenchmarkResult {
  benchmark: "effect-runtime";
  contractVersion: typeof EFFECT_RUNTIME_BENCHMARK_CONTRACT_VERSION;
  commit: string | null;
  environment: ReturnType<typeof getBenchmarkEnvironmentFingerprint>;
  effectId: RuntimeEffect["effectId"];
  iterations: number;
  warmupCount: 1;
  measurementCount: typeof MEASUREMENT_COUNT;
  legacyDecodeSamplesMs: readonly number[];
  typedCatalogSamplesMs: readonly number[];
  legacyDecodeMedianMs: number;
  typedCatalogMedianMs: number;
  speedupRatio: number;
  equivalentResults: boolean;
}

export interface RunEffectRuntimeBenchmarkOptions {
  rootDir: string;
  iterations?: number;
}

interface BenchmarkFixture {
  state: GameState;
  player: PlayerState;
  effect: RuntimeEffect;
  source: EffectSourceContext;
}

export function runEffectRuntimeBenchmark(
  options: RunEffectRuntimeBenchmarkOptions
): EffectRuntimeBenchmarkResult {
  const iterations = options.iterations ?? EFFECT_RUNTIME_BENCHMARK_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError("iterations must be a positive safe integer");
  }

  const legacyFixture = createFixture(options.rootDir, 25301);
  const typedFixture = createFixture(options.rootDir, 25301);
  const legacyEffect = structuredClone(legacyFixture.effect);

  measure(legacyFixture, legacyEffect, iterations, true);
  measure(typedFixture, typedFixture.effect, iterations);

  const legacySamplesMs = Array.from({ length: MEASUREMENT_COUNT }, () =>
    measure(legacyFixture, legacyEffect, iterations, true)
  );
  const typedSamplesMs = Array.from({ length: MEASUREMENT_COUNT }, () =>
    measure(typedFixture, typedFixture.effect, iterations)
  );
  const legacyMedianMs = median(legacySamplesMs);
  const typedMedianMs = median(typedSamplesMs);

  return {
    benchmark: "effect-runtime",
    contractVersion: EFFECT_RUNTIME_BENCHMARK_CONTRACT_VERSION,
    commit: getBenchmarkCommit(),
    environment: getBenchmarkEnvironmentFingerprint(),
    effectId: typedFixture.effect.effectId,
    iterations,
    warmupCount: 1,
    measurementCount: MEASUREMENT_COUNT,
    legacyDecodeSamplesMs: legacySamplesMs,
    typedCatalogSamplesMs: typedSamplesMs,
    legacyDecodeMedianMs: legacyMedianMs,
    typedCatalogMedianMs: typedMedianMs,
    speedupRatio:
      typedMedianMs === 0
        ? Number.POSITIVE_INFINITY
        : legacyMedianMs / typedMedianMs,
    equivalentResults: legacyFixture.player.chips === typedFixture.player.chips,
  };
}

function createFixture(rootDir: string, seed: number): BenchmarkFixture {
  const state = initializeGame({ rootDir, seed });
  const player = state.players[0];
  if (player === undefined) {
    throw new Error("Effect Runtime benchmark requires an active player");
  }

  const tokenFixture = findTokenFixture(state, player);
  if (tokenFixture !== undefined) {
    return tokenFixture;
  }

  const cardFixture = findCardFixture(state, player);
  if (cardFixture !== undefined) {
    return cardFixture;
  }

  throw new Error("Effect Runtime benchmark requires a resource effect");
}

function findTokenFixture(
  state: GameState,
  player: PlayerState
): BenchmarkFixture | undefined {
  for (const definition of state.tokenDefinitions.values()) {
    const effects = getTokenEffects(definition);
    if (effects === undefined) {
      continue;
    }
    const effect = effects.find(isResourceDrawEffect);
    if (effect === undefined) {
      continue;
    }
    return {
      state,
      player,
      effect,
      source: createSource(
        player,
        state.runtimeMode,
        "wizardProperty",
        definition.tokenId
      ),
    };
  }
  return undefined;
}

function findCardFixture(
  state: GameState,
  player: PlayerState
): BenchmarkFixture | undefined {
  for (const definition of state.cardDefinitions.values()) {
    const effect = definition.engine.effects.find(isResourceDrawEffect);
    if (effect === undefined) {
      continue;
    }
    return {
      state,
      player,
      effect,
      source: createSource(
        player,
        state.runtimeMode,
        "card",
        definition.cardId
      ),
    };
  }
  return undefined;
}

function getTokenEffects(
  definition: TokenDefinition
): readonly RuntimeEffect[] | undefined {
  return definition.kind === "deadWizardToken"
    ? definition.effects
    : definition.engine?.effects;
}

function isResourceDrawEffect(effect: RuntimeEffect): boolean {
  return resourceDrawEffectIds.some((effectId) => effectId === effect.effectId);
}

function createSource(
  player: PlayerState,
  runtimeMode: EffectRuntimeMode,
  sourceType: EffectSourceContext["sourceType"],
  definitionId: string
): EffectSourceContext {
  return {
    sourceType,
    runtimeMode,
    playerId: player.playerId,
    cardInstanceId: `benchmark-${definitionId}`,
    definitionId,
  };
}

function measure(
  fixture: BenchmarkFixture,
  effect: RuntimeEffect,
  iterations: number,
  decodeAtIntake = false
): number {
  fixture.state.eventLog.length = 0;
  const startedAt = systemBenchmarkClock.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const executableEffect = decodeAtIntake
      ? decodeEffectAtIntake(fixture, effect)
      : effect;
    const result = executeEffect(
      fixture.state,
      fixture.player,
      executableEffect,
      fixture.source
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
  }
  return systemBenchmarkClock.now() - startedAt;
}

function decodeEffectAtIntake(
  fixture: BenchmarkFixture,
  effect: RuntimeEffect
): RuntimeEffect {
  return decodeRuntimeEffectAtIntake(
    `Benchmark ${effect.effectId}`,
    effect.effectId,
    effect,
    fixture.source.runtimeMode,
    fixture.source.sourceType
  );
}
