import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeEffectChoiceRequest } from "../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Type extends true> = Type;
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

type DecisionChoiceReadonlyAssertions = [
  Assert<IsReadonly<PlayerTargetChoice, "players">>,
  Assert<IsReadonly<PlayerTargetChoice["players"][number]["life"], "current">>,
  Assert<IsReadonly<DirectionalPlayerTargetChoice, "players">>,
  Assert<IsReadonly<CardTargetChoice, "cards">>,
  Assert<IsReadonly<CardTargetChoice["cards"][number], "marketChips">>,
  Assert<IsReadonly<NonNullable<DefenseChoice["card"]>, "marketChips">>,
];

function assertDecisionChoiceViewsAreReadonly(
  _assertions?: DecisionChoiceReadonlyAssertions
): void {}

test("decision choice views are immutable at the strategy boundary", () => {
  assertDecisionChoiceViewsAreReadonly();
  assert.equal(true, true);
});
