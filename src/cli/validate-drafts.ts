import {
  formatDraftValidationResult,
  validateDraftFiles,
} from "../import/draft-validation.js";

const inputPaths = process.argv.slice(2);
const validation = validateDraftFiles(
  process.cwd(),
  inputPaths.length > 0 ? inputPaths : undefined
);

console.log(formatDraftValidationResult(validation));

if (!validation.ok) {
  process.exitCode = 1;
}
