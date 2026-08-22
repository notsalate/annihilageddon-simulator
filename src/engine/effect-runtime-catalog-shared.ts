import type { EffectTiming } from "./runtime-effect.js";

export const effectRuntimeModes = ["combat", "fixture"] as const;
export type EffectRuntimeMode = (typeof effectRuntimeModes)[number];
export type EffectRuntimeSupportedModes = readonly [
  EffectRuntimeMode,
  ...EffectRuntimeMode[],
];

export const effectRuntimeSourceKinds = [
  "card",
  "wizardProperty",
  "deadWizardToken",
] as const;
export type EffectRuntimeSourceKind = (typeof effectRuntimeSourceKinds)[number];
export type EffectRuntimeSupportedSourceKinds = readonly [
  EffectRuntimeSourceKind,
  ...EffectRuntimeSourceKind[],
];
export type EffectRuntimeSupportedTimings = readonly [
  EffectTiming,
  ...EffectTiming[],
];

export const allEffectRuntimeModes: EffectRuntimeSupportedModes =
  effectRuntimeModes;

export const immediateEffectTimings = [
  "activation",
  "onDefense",
  "onGainCard",
  "onMayhemResolve",
  "onPlay",
  "onPlayCard",
] as const satisfies EffectRuntimeSupportedTimings;

export const fixtureEffectTimings = [
  "setup",
  ...immediateEffectTimings,
] as const satisfies EffectRuntimeSupportedTimings;
