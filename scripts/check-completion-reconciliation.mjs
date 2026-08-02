import { readFileSync } from "node:fs";

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
  if (!Array.isArray(manifest.requirements)) {
    return [...errors, "manifest.requirements must be an array"];
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
    for (const fieldName of ["specVerdict", "standardsVerdict"]) {
      if (requirement[fieldName] !== "без замечаний") {
        errors.push(`${requirement.id}: resolved requirement needs ${fieldName} без замечаний`);
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

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function formatFindings(value) {
  return hasEntries(value) ? ` (${value.join(", ")})` : "";
}
