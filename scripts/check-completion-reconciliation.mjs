import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = process.argv[2];

if (manifestPath === undefined) {
  console.error("usage: node scripts/check-completion-reconciliation.mjs <manifest.json>");
  process.exitCode = 1;
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`cannot read reconciliation manifest: ${String(error)}`);
    process.exitCode = 1;
  }

  if (manifest !== undefined) {
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(error);
      }
      process.exitCode = 1;
    }
  }
}

function validateManifest(manifest) {
  const errors = [];
  if (!isRecord(manifest)) {
    return ["manifest must be an object"];
  }

  if (!isSha(manifest.codeSha)) {
    errors.push("manifest.codeSha must be a full 40-character commit SHA");
  }
  if (!isSha(manifest.rangeStart)) {
    errors.push("manifest.rangeStart must be a full 40-character commit SHA");
  }
  if (!Array.isArray(manifest.requirements)) {
    return [...errors, "manifest.requirements must be an array"];
  }

  const codeCommit = resolveCommit(
    manifest.codeSha,
    "manifest.codeSha",
    errors
  );
  const rangeStart = resolveCommit(
    manifest.rangeStart,
    "manifest.rangeStart",
    errors
  );
  if (
    codeCommit !== undefined &&
    rangeStart !== undefined &&
    !isAncestor(rangeStart, codeCommit)
  ) {
    errors.push("manifest.rangeStart must be an ancestor of manifest.codeSha");
  }

  for (const requirement of manifest.requirements) {
    if (!isRecord(requirement)) {
      errors.push("requirement must be an object");
      continue;
    }
    if (typeof requirement.id !== "string") {
      errors.push("requirement.id must be a string");
      continue;
    }
    if (requirement.active !== true) {
      continue;
    }
    if (requirement.codeSha !== manifest.codeSha) {
      errors.push(`${requirement.id}: codeSha must match manifest.codeSha`);
    }
    validateTestReferences(requirement, errors);
    validateFixCommits(requirement, rangeStart, codeCommit, errors);
    if (requirement.status === "unresolved") {
      if (manifest.overallVerdict !== "есть открытые требования") {
        errors.push(
          `${requirement.id}: active requirement remains unresolved${formatFindings(requirement.findings)}`
        );
      }
      continue;
    }
    if (requirement.status !== "resolved") {
      errors.push(`${requirement.id}: active requirement needs resolved or unresolved status`);
      continue;
    }
    for (const fieldName of ["findings", "fixCommits", "tests"]) {
      if (!hasEntries(requirement[fieldName])) {
        errors.push(`${requirement.id}: resolved requirement needs ${fieldName}`);
      }
    }
  }

  return errors;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function resolveCommit(reference, label, errors) {
  if (typeof reference !== "string") {
    errors.push(`${label} must resolve to a commit`);
    return undefined;
  }
  const result = spawnSync(
    "git",
    ["rev-parse", "--verify", `${reference}^{commit}`],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (result.status !== 0) {
    errors.push(`${label} must resolve to a commit`);
    return undefined;
  }
  return result.stdout.trim();
}

function isAncestor(ancestor, descendant) {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: process.cwd(),
    }).status === 0
  );
}

function validateTestReferences(requirement, errors) {
  if (!Array.isArray(requirement.tests)) {
    return;
  }
  for (const testReference of requirement.tests) {
    if (!isRegisteredTestReference(testReference)) {
      errors.push(
        `${requirement.id}: test reference ${String(testReference)} must exist and be registered`
      );
    }
  }
}

function validateFixCommits(requirement, rangeStart, codeCommit, errors) {
  if (!Array.isArray(requirement.fixCommits)) {
    return;
  }
  for (const fixCommit of requirement.fixCommits) {
    const resolvedFixCommit = resolveCommit(
      fixCommit,
      `${requirement.id}: fix commit ${String(fixCommit)}`,
      errors
    );
    if (
      resolvedFixCommit !== undefined &&
      codeCommit !== undefined &&
      !isAncestor(resolvedFixCommit, codeCommit)
    ) {
      errors.push(
        `${requirement.id}: fix commit ${String(fixCommit)} must be an ancestor of manifest.codeSha`
      );
    }
    if (
      resolvedFixCommit !== undefined &&
      rangeStart !== undefined &&
      !isAncestor(rangeStart, resolvedFixCommit)
    ) {
      errors.push(
        `${requirement.id}: fix commit ${String(fixCommit)} must be inside manifest range`
      );
    }
  }
}

function isRegisteredTestReference(testReference) {
  if (
    typeof testReference !== "string" ||
    !testReference.startsWith("tests/") ||
    !testReference.endsWith(".test.ts")
  ) {
    return false;
  }
  const repositoryRoot = process.cwd();
  const absoluteTestPath = path.resolve(repositoryRoot, testReference);
  const testsRoot = path.join(repositoryRoot, "tests");
  if (
    !absoluteTestPath.startsWith(`${testsRoot}${path.sep}`) ||
    !existsSync(absoluteTestPath)
  ) {
    return false;
  }
  const compiledTestPath = testReference
    .slice("tests/".length)
    .replace(/\.ts$/, ".js");
  const registry = readFileSync(path.join(testsRoot, "run-tests.ts"), "utf8");
  return registry.includes(`"${compiledTestPath}"`);
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function formatFindings(value) {
  return hasEntries(value) ? ` (${value.join(", ")})` : "";
}
