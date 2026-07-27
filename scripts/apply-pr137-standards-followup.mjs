import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const targetRoot = path.resolve(process.argv[2] ?? ".");

function replaceExactlyOnce(relativePath, before, after) {
  const filePath = path.join(targetRoot, relativePath);
  const source = readFileSync(filePath, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(
      `${relativePath}: expected one occurrence of ${JSON.stringify(before)}, found ${count}`
    );
  }
  writeFileSync(filePath, source.replace(before, after), "utf8");
}

replaceExactlyOnce(
  "src/engine/effect-runtime.ts",
  'import { isPlainRecord } from "../common.js";\n',
  ""
);

replaceExactlyOnce(
  "src/engine/control-ledger.ts",
  "  for (const descriptor of listPlayerPhysicalCardZoneDescriptors(player)) {",
  [
    "  const descriptors = listPlayerPhysicalCardZoneDescriptors(player);",
    "  const replacementPriority = (",
    "    descriptor: PhysicalCardZoneDescriptor",
    "  ): number =>",
    '    descriptor.zoneName === `${player.playerId}.hand`',
    "      ? 0",
    '      : descriptor.zoneName === `${player.playerId}.deck`',
    "        ? 1",
    "        : 2;",
    "  const descriptorsInReplacementOrder = [...descriptors].sort(",
    "    (left, right) => replacementPriority(left) - replacementPriority(right)",
    "  );",
    "",
    "  for (const descriptor of descriptorsInReplacementOrder) {",
  ].join("\n")
);

console.log("Applied strictest-typecheck and setup-zone-order follow-ups");
