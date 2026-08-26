import type { PlayerId } from "../domain/types.js";
import type { RuntimeEffectId } from "./runtime-effect.js";

/** Stable discriminator shared by choice views and recorded choice events. */
export type ChoiceKind =
  | "option"
  | "playerTarget"
  | "cardTarget"
  | "defense"
  | "directionalPlayerTarget"
  | "damageDistribution"
  | "familiarSetup"
  | "wizardPropertySetup";

/** The only player information available while resolving an effect choice. */
export interface ChoicePlayerView {
  readonly playerId: PlayerId;
  readonly chips: number;
  readonly life: {
    readonly current: number;
    readonly max: number;
  };
  readonly handSize: number;
  readonly discardSize: number;
  readonly playedThisTurnSize: number;
  readonly permanentsSize: number;
  readonly unboughtFamiliarPresent: boolean;
  readonly deadWizardTokenCount: number;
  readonly wizardPropertyCount: number;
  readonly statusIds: readonly string[];
  readonly trophyIds: readonly string[];
}

export interface ChoiceOptionView {
  readonly choiceKind: "option";
  readonly choiceId: string;
}

export interface ChoicePlayerTargetView {
  readonly choiceKind: "playerTarget";
  readonly choiceId: string;
  readonly targetPlayerIds: readonly PlayerId[];
}

export interface ChoiceCardTargetView {
  readonly choiceKind: "cardTarget";
  readonly choiceId: string;
  readonly targetCardInstanceIds: readonly string[];
  readonly amount: number;
}

export interface ChoiceDefenseView {
  readonly choiceKind: "defense";
  readonly choiceId: string;
  readonly targetCardInstanceId?: string;
}

export interface ChoiceDirectionalPlayerTargetView {
  readonly choiceKind: "directionalPlayerTarget";
  readonly choiceId: string;
  readonly direction: "left" | "right";
  readonly targetPlayerIds: readonly PlayerId[];
}

export interface ChoiceDamageDistributionView {
  readonly choiceKind: "damageDistribution";
  readonly choiceId: string;
  readonly targetPlayerIds: readonly PlayerId[];
  readonly amounts: readonly number[];
  readonly amount: number;
}

export interface ChoiceFamiliarSetupView {
  readonly choiceKind: "familiarSetup";
  readonly choiceId: string;
  readonly candidateDefinitionId: string;
}

export interface ChoiceWizardPropertySetupView {
  readonly choiceKind: "wizardPropertySetup";
  readonly choiceId: string;
  readonly candidateDefinitionId: string;
}

export type ChoiceView =
  | ChoiceOptionView
  | ChoicePlayerTargetView
  | ChoiceCardTargetView
  | ChoiceDefenseView
  | ChoiceDirectionalPlayerTargetView
  | ChoiceDamageDistributionView
  | ChoiceFamiliarSetupView
  | ChoiceWizardPropertySetupView;

/** A strategy returns only the stable identity of its selected legal choice. */
export interface ChoiceSelection {
  readonly choiceId: string;
}

export interface EffectChoiceRequest {
  readonly requestKind: "effect";
  readonly player: ChoicePlayerView;
  readonly effectId: RuntimeEffectId;
  readonly sourceType: "card" | "wizardProperty" | "deadWizardToken";
  readonly cardInstanceId: string;
  readonly definitionId: string;
  readonly choices: readonly ChoiceView[];
}

export type FamiliarSetupChoicePhase = "startingPair" | "thirdFamiliar";

export type WizardPropertySetupChoicePhase = "startingPair";

export interface FamiliarSetupChoiceRequest {
  readonly requestKind: "setup";
  readonly player: ChoicePlayerView;
  readonly setupChoiceKind: "familiar";
  readonly phase: FamiliarSetupChoicePhase;
  readonly choices: readonly ChoiceFamiliarSetupView[];
  readonly effectId?: never;
  readonly sourceType?: never;
  readonly cardInstanceId?: never;
  readonly definitionId?: never;
}

export interface WizardPropertySetupChoiceRequest {
  readonly requestKind: "setup";
  readonly player: ChoicePlayerView;
  readonly setupChoiceKind: "wizardProperty";
  readonly phase: WizardPropertySetupChoicePhase;
  readonly choices: readonly ChoiceWizardPropertySetupView[];
  readonly effectId?: never;
  readonly sourceType?: never;
  readonly cardInstanceId?: never;
  readonly definitionId?: never;
}

export type SetupChoiceRequest =
  | FamiliarSetupChoiceRequest
  | WizardPropertySetupChoiceRequest;

export type ChoiceRequest = EffectChoiceRequest | SetupChoiceRequest;

export type ChoicePolicy = (
  request: ChoiceRequest
) => ChoiceSelection | undefined;

export function isChoiceSelection(value: unknown): value is ChoiceSelection {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 1 &&
    keys[0] === "choiceId" &&
    typeof (value as { readonly choiceId?: unknown }).choiceId === "string"
  );
}
