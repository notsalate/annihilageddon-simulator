import type { GuardResult } from "./lib/guard-cli.mjs";

export function runCompletionReconciliationGuard(
  manifestPath: string | undefined,
  workingDirectory?: string
): GuardResult;
