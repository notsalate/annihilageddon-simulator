import {
  createRuntimeCoverageInventory,
  formatRuntimeCoverageInventoryMarkdown,
  writeRuntimeCoverageInventoryMarkdown,
} from "../import/runtime-coverage-inventory.js";

const outputIndex = process.argv.indexOf("--write");
const outputPath =
  outputIndex === -1 ? undefined : process.argv[outputIndex + 1];

if (outputPath !== undefined) {
  const report = writeRuntimeCoverageInventoryMarkdown(
    process.cwd(),
    outputPath
  );
  console.log(`Runtime coverage inventory written to ${outputPath}`);
  console.log(`items: ${report.items.length}`);
  console.log(`clusters: ${report.clusters.length}`);
} else {
  console.log(
    formatRuntimeCoverageInventoryMarkdown(
      createRuntimeCoverageInventory(process.cwd())
    )
  );
}
