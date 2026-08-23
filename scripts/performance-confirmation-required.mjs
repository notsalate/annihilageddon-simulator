import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (reportPath === undefined) {
  throw new Error(
    "Usage: node scripts/performance-confirmation-required.mjs <preliminary-report>"
  );
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (typeof report !== "object" || report === null || Array.isArray(report)) {
  throw new TypeError("Preliminary performance report must be an object");
}

const comparisons = [report.epochComparison, report.baseComparison];
const confirmationRequired = comparisons.some((comparison) => {
  if (
    typeof comparison !== "object" ||
    comparison === null ||
    Array.isArray(comparison) ||
    !Array.isArray(comparison.observedRegressionMetrics) ||
    !comparison.observedRegressionMetrics.every(
      (metricName) => typeof metricName === "string"
    )
  ) {
    throw new TypeError(
      "Preliminary performance report has an invalid comparison summary"
    );
  }
  return comparison.observedRegressionMetrics.length > 0;
});

console.log(confirmationRequired ? "true" : "false");
