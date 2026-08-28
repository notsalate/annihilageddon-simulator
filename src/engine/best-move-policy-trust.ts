import type { TurnLineEvaluationPolicy } from "./best-move-analysis.js";

const trustedReadOnlyPolicies = new WeakSet<TurnLineEvaluationPolicy>();

export function registerTrustedReadOnlyPolicy<
  TPolicy extends TurnLineEvaluationPolicy,
>(policy: TPolicy): TPolicy {
  Object.freeze(policy);
  trustedReadOnlyPolicies.add(policy);
  return policy;
}

export function isTrustedReadOnlyPolicy(
  policy: TurnLineEvaluationPolicy
): boolean {
  return trustedReadOnlyPolicies.has(policy);
}
