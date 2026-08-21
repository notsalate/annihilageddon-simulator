import type { PlayerId } from "../domain/types.js";
import type { RuntimeEffectId } from "./runtime-effect.js";

/** Stable discriminator shared by choice views and recorded choice events. */
export type ChoiceKind =
  | "option"
  | "playerTarget"
  | "cardTarget"
  | "defense"
  | "directionalPlayerTarget";

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

export type ChoiceView =
  | ChoiceOptionView
  | ChoicePlayerTargetView
  | ChoiceCardTargetView
  | ChoiceDefenseView
  | ChoiceDirectionalPlayerTargetView;

/** A strategy returns only the stable identity of its selected legal choice. */
export interface ChoiceSelection {
  readonly choiceId: string;
}

export interface ChoiceRequest {
  readonly player: ChoicePlayerView;
  readonly effectId: RuntimeEffectId;
  readonly sourceType: "card" | "wizardProperty" | "deadWizardToken";
  readonly cardInstanceId: string;
  readonly definitionId: string;
  readonly choices: readonly ChoiceView[];
}

export type ChoicePolicy = (
  request: ChoiceRequest
) => ChoiceSelection | undefined;
