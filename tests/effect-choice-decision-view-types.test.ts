import assert from "node:assert/strict";
import test from "node:test";

import type {
  BotDecisionContext,
  RuntimeEffectChoiceRequest,
} from "../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Type extends true> = Type;
type AssertFalse<Type extends false> = Type;
type IsReadonly<Type, Key extends keyof Type> = Equal<
  Pick<Type, Key>,
  Readonly<Pick<Type, Key>>
>;

type DecisionChoice = RuntimeEffectChoiceRequest["choices"][number];
type PlayerTargetChoice = Extract<
  DecisionChoice,
  { choiceKind: "playerTarget" }
>;
type DirectionalPlayerTargetChoice = Extract<
  DecisionChoice,
  { choiceKind: "directionalPlayerTarget" }
>;
type CardTargetChoice = Extract<DecisionChoice, { choiceKind: "cardTarget" }>;
type DefenseChoice = Extract<DecisionChoice, { choiceKind: "defense" }>;
type BotBuyAction = Extract<
  BotDecisionContext["legalActions"][number],
  { type: "buyMarketCard" }
>;

type DecisionChoiceDoesNotExposeHiddenStateAssertions = [
  AssertFalse<
    "deck" extends keyof RuntimeEffectChoiceRequest["player"] ? true : false
  >,
  AssertFalse<"state" extends keyof BotDecisionContext ? true : false>,
  AssertFalse<"players" extends keyof PlayerTargetChoice ? true : false>,
  AssertFalse<"cards" extends keyof CardTargetChoice ? true : false>,
  AssertFalse<"card" extends keyof DefenseChoice ? true : false>,
  AssertFalse<
    "targetDefinitionIds" extends keyof CardTargetChoice ? true : false
  >,
  Assert<"cost" extends keyof BotBuyAction ? true : false>,
];

type DecisionChoiceReadonlyAssertions = [
  Assert<IsReadonly<PlayerTargetChoice, "targetPlayerIds">>,
  Assert<IsReadonly<DirectionalPlayerTargetChoice, "targetPlayerIds">>,
  Assert<IsReadonly<CardTargetChoice, "targetCardInstanceIds">>,
  Assert<IsReadonly<DefenseChoice, "targetCardInstanceId">>,
];

function assertDecisionChoiceViewsAreReadonly(
  _assertions?: DecisionChoiceReadonlyAssertions
): void {}

function assertDecisionChoicesDoNotExposeHiddenState(
  _assertions?: DecisionChoiceDoesNotExposeHiddenStateAssertions
): void {}

test("decision choice views are immutable at the strategy boundary", () => {
  assertDecisionChoiceViewsAreReadonly();
  assert.equal(true, true);
});

test("decision choices expose stable target identifiers without hidden state", () => {
  assertDecisionChoicesDoNotExposeHiddenState();
  assert.equal(true, true);
});
