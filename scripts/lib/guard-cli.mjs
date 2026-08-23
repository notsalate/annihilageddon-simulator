import path from "node:path";
import { fileURLToPath } from "node:url";

export function captureGuard(check) {
  try {
    const message = check();
    return {
      status: 0,
      stdout:
        message === undefined || message.length === 0 ? "" : `${message}\n`,
      stderr: "",
    };
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: `${String(error)}\n`,
    };
  }
}

export function runGuardCli(moduleUrl, run) {
  const entrypoint = process.argv[1];
  if (
    entrypoint === undefined ||
    path.resolve(entrypoint) !== path.resolve(fileURLToPath(moduleUrl))
  ) {
    return;
  }

  const result = run();
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
