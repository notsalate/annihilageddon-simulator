import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const reportsDir = process.argv[2];
if (reportsDir === undefined) {
  throw new Error(
    "Usage: node scripts/assert-performance-reports.mjs <reports-dir>"
  );
}

const expectedReports = [
  "simulation",
  "analyzer-light",
  "analyzer-typical",
  "analyzer-heavy",
];
const failures = [];
for (const id of expectedReports) {
  const fileName = `performance-report-${id}.json`;
  const filePath = path.join(reportsDir, fileName);
  try {
    const report = JSON.parse(readFileSync(filePath, "utf8"));
    if (
      typeof report !== "object" ||
      report === null ||
      Array.isArray(report)
    ) {
      failures.push(`${fileName}: report is not an object`);
    } else if (report.blocking === true) {
      failures.push(`${fileName}: blocking performance regression`);
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
