export interface GuardResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function captureGuard(check: () => string | undefined): GuardResult;
export function runGuardCli(moduleUrl: string, run: () => GuardResult): void;
