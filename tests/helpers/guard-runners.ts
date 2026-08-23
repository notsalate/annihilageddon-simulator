import type * as CompletionReconciliationGuard from "../../scripts/check-completion-reconciliation.mjs";
import type * as EngineTypedAccessGuard from "../../scripts/check-engine-typed-access.mjs";
import type * as EngineUnknownArraysGuard from "../../scripts/check-engine-unknown-arrays.mjs";
import type * as JsonParseAssertionsGuard from "../../scripts/check-json-parse-assertions.mjs";

const completionReconciliationModule: unknown = await loadGuardModule(
  "check-completion-reconciliation.mjs"
);
const engineTypedAccessModule: unknown = await loadGuardModule(
  "check-engine-typed-access.mjs"
);
const engineUnknownArraysModule: unknown = await loadGuardModule(
  "check-engine-unknown-arrays.mjs"
);
const jsonParseAssertionsModule: unknown = await loadGuardModule(
  "check-json-parse-assertions.mjs"
);

if (!isCompletionReconciliationGuard(completionReconciliationModule)) {
  throw new Error("completion reconciliation guard has an invalid interface");
}
if (!isEngineTypedAccessGuard(engineTypedAccessModule)) {
  throw new Error("engine typed-access guard has an invalid interface");
}
if (!isEngineUnknownArraysGuard(engineUnknownArraysModule)) {
  throw new Error("engine unknown-array guard has an invalid interface");
}
if (!isJsonParseAssertionsGuard(jsonParseAssertionsModule)) {
  throw new Error("JSON parse assertion guard has an invalid interface");
}

export const { runCompletionReconciliationGuard } =
  completionReconciliationModule;
export const { runEngineTypedAccessGuard } = engineTypedAccessModule;
export const { runEngineUnknownArraysGuard } = engineUnknownArraysModule;
export const { runJsonParseAssertionsGuard } = jsonParseAssertionsModule;

function loadGuardModule(fileName: string): Promise<unknown> {
  return import(new URL(`../../../scripts/${fileName}`, import.meta.url).href);
}

function isCompletionReconciliationGuard(
  value: unknown
): value is typeof CompletionReconciliationGuard {
  return (
    typeof value === "object" &&
    value !== null &&
    "runCompletionReconciliationGuard" in value &&
    typeof value.runCompletionReconciliationGuard === "function"
  );
}

function isEngineTypedAccessGuard(
  value: unknown
): value is typeof EngineTypedAccessGuard {
  return (
    typeof value === "object" &&
    value !== null &&
    "runEngineTypedAccessGuard" in value &&
    typeof value.runEngineTypedAccessGuard === "function"
  );
}

function isEngineUnknownArraysGuard(
  value: unknown
): value is typeof EngineUnknownArraysGuard {
  return (
    typeof value === "object" &&
    value !== null &&
    "runEngineUnknownArraysGuard" in value &&
    typeof value.runEngineUnknownArraysGuard === "function"
  );
}

function isJsonParseAssertionsGuard(
  value: unknown
): value is typeof JsonParseAssertionsGuard {
  return (
    typeof value === "object" &&
    value !== null &&
    "runJsonParseAssertionsGuard" in value &&
    typeof value.runJsonParseAssertionsGuard === "function"
  );
}
