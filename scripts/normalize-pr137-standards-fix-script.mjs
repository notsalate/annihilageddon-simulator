import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const scriptPath = path.resolve(
  process.argv[2] ?? "scripts/apply-pr137-standards-fixes.mjs"
);
const source = readFileSync(scriptPath, "utf8");
const repeatedCalls = `replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);
replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);
replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);`;
const replacement = `{
  const relativePath = "src/engine/effect-runtime-registry.ts";
  const before = "decodeControlledOperation(";
  const after = "decodeExecutableOperation(";
  const current = read(relativePath);
  const occurrenceCount = current.split(before).length - 1;
  if (occurrenceCount !== 3) {
    throw new Error(
      \`${relativePath}: expected 3 controlled-operation calls, found \${occurrenceCount}\`
    );
  }
  write(relativePath, current.replaceAll(before, after));
}`;

if (!source.includes(repeatedCalls)) {
  throw new Error("Could not find repeated catalog-operation replacements");
}
writeFileSync(scriptPath, source.replace(repeatedCalls, replacement), "utf8");
console.log("Normalized PR #137 standards fix script");
