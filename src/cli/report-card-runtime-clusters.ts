import {
  createCardRuntimeClusterReport,
  formatCardRuntimeClusterMarkdown,
  syncCardClusterDecisions,
  writeCardRuntimeClusterMatrix,
} from "../import/card-runtime-clusters.js";

const shouldWriteDecisions = process.argv.includes("--write-decisions");
const shouldWriteMatrix = process.argv.includes("--write");

if (shouldWriteDecisions) {
  const result = syncCardClusterDecisions(process.cwd());
  console.log(
    `Card cluster decisions synced to ${result.decisionFilePath} (${result.addedCardIds.length} added)`
  );
}

if (shouldWriteMatrix) {
  const report = writeCardRuntimeClusterMatrix(process.cwd());
  console.log("Card runtime cluster matrix written");
  console.log(`items: ${report.summary.totalCards}`);
  console.log(`fullRuntime: ${report.summary.fullRuntime}`);
  console.log(`missingRuntime: ${report.summary.missingRuntime}`);
  console.log(`needsClusterDecision: ${report.summary.needsClusterDecision}`);
} else {
  console.log(
    formatCardRuntimeClusterMarkdown(
      createCardRuntimeClusterReport(process.cwd())
    )
  );
}
