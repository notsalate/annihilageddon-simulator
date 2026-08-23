import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { assertPerformancePullRequestReportIntegrity } from "../dist/src/engine/performance-epoch.js";

const reportsDir = process.argv[2];
const expectedComparisonPairId = process.argv[3];
if (reportsDir === undefined || expectedComparisonPairId === undefined) {
  throw new Error(
    "Usage: node scripts/assert-performance-reports.mjs <reports-dir> <expected-comparison-pair-id>"
  );
}

const expectedReports = [
  ["simulation", "simulation", "simulation:100"],
  ["analyzer-light", "analyzer", "analyzer:light"],
  ["analyzer-typical", "analyzer", "analyzer:typical"],
  ["analyzer-heavy", "analyzer", "analyzer:heavy"],
];
const failures = [];
for (const [fileId, benchmark, id] of expectedReports) {
  const fileName = `performance-report-${fileId}.json`;
  const filePath = path.join(reportsDir, fileName);
  try {
    const report = JSON.parse(readFileSync(filePath, "utf8"));
    if (
      typeof report !== "object" ||
      report === null ||
      Array.isArray(report)
    ) {
      failures.push(`${fileName}: report is not an object`);
    } else {
      assertPerformancePullRequestReportIntegrity(
        report,
        expectedComparisonPairId
      );
      if (report.benchmark !== benchmark || report.id !== id) {
        failures.push(`${fileName}: report identity does not match its file`);
      }
      if (report.blocking === true) {
        failures.push(`${fileName}: blocking performance regression`);
      }
    }
  } catch (error) {
    failures.push(
      `${fileName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const unexpectedReports = readdirSync(reportsDir).filter(
  (fileName) =>
    fileName.startsWith("performance-report-") && fileName.endsWith(".json")
);
if (unexpectedReports.length !== expectedReports.length) {
  failures.push(
    `expected ${expectedReports.length} performance reports, found ${unexpectedReports.length}`
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Performance reports: ${expectedReports.length} non-blocking reports`
  );
}
