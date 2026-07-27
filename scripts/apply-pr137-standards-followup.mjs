import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const targetRoot = path.resolve(process.argv[2] ?? ".");
const filePath = path.join(targetRoot, "src/engine/effect-runtime.ts");
const source = readFileSync(filePath, "utf8");
const obsoleteImport = 'import { isPlainRecord } from "../common.js";\n';
const count = source.split(obsoleteImport).length - 1;
if (count !== 1) {
  throw new Error(`Expected one obsolete isPlainRecord import, found ${count}`);
}
writeFileSync(filePath, source.replace(obsoleteImport, ""), "utf8");
console.log("Removed obsolete effect-runtime caller-boundary import");
