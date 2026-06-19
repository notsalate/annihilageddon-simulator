import { createImportCompletenessReport, formatImportCompletenessReport } from "../import/import-completeness.js";

const report = createImportCompletenessReport(process.cwd());

console.log(formatImportCompletenessReport(report));

if (report.validationErrorCount > 0) {
  process.exitCode = 1;
}
