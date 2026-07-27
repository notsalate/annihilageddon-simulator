import { readdirSync } from "node:fs";
import path from "node:path";

export function collectCompiledTestSuites(testsRoot: string): string[] {
  const suites: string[] = [];
  collectTestSuites(testsRoot, "", suites);
  return suites.sort();
}

export function assertTestSuiteRegistryComplete(
  registeredSuites: readonly string[],
  compiledSuites: readonly string[]
): void {
  const registrationCounts = new Map<string, number>();
  for (const suite of registeredSuites) {
    registrationCounts.set(suite, (registrationCounts.get(suite) ?? 0) + 1);
  }

  const compiledSuiteSet = new Set(compiledSuites);
  const missingRegistrations = compiledSuites
    .filter((suite) => !registrationCounts.has(suite))
    .sort();
  const registrationsWithoutCompiledFiles = [...registrationCounts.keys()]
    .filter((suite) => !compiledSuiteSet.has(suite))
    .sort();
  const duplicateRegistrations = [...registrationCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([left], [right]) => left.localeCompare(right));

  if (
    missingRegistrations.length === 0 &&
    registrationsWithoutCompiledFiles.length === 0 &&
    duplicateRegistrations.length === 0
  ) {
    return;
  }

  const message = ["Test suite registry validation failed."];
  appendSuiteSection(message, "Missing registrations", missingRegistrations);
  appendSuiteSection(
    message,
    "Registrations without compiled files",
    registrationsWithoutCompiledFiles
  );
  if (duplicateRegistrations.length > 0) {
    message.push(
      "Duplicate registrations:",
      ...duplicateRegistrations.map(
        ([suite, count]) => `  - ${suite} (${count} entries)`
      )
    );
  }

  throw new Error(message.join("\n"));
}

function collectTestSuites(
  currentDirectory: string,
  relativeDirectory: string,
  suites: string[]
): void {
  const entries = readdirSync(currentDirectory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name)
  );

  for (const entry of entries) {
    const relativePath =
      relativeDirectory === ""
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      collectTestSuites(
        path.join(currentDirectory, entry.name),
        relativePath,
        suites
      );
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      suites.push(relativePath);
    }
  }
}

function appendSuiteSection(
  message: string[],
  title: string,
  suites: readonly string[]
): void {
  if (suites.length > 0) {
    message.push(`${title}:`, ...suites.map((suite) => `  - ${suite}`));
  }
}
