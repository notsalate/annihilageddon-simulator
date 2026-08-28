import {
  assertRuntimeSemanticCompletionPass,
  createRuntimeSemanticCompletionReport,
} from "../import/runtime-semantic-completion.js";

const report = createRuntimeSemanticCompletionReport(process.cwd());

console.log(`Runtime semantic completion gate: ${report.status}`);
console.log(
  `cards: ${report.byKind.card.semanticComplete}/${report.byKind.card.expected}`
);
console.log(
  `wizard properties: ${report.byKind.wizardProperty.semanticComplete}/${report.byKind.wizardProperty.expected}`
);
console.log(
  `dead wizard tokens: ${report.byKind.deadWizardToken.semanticComplete}/${report.byKind.deadWizardToken.expected}`
);
console.log(
  `production physical DWT: ${report.productionStack.physicalCount}/${report.productionStack.expectedPhysicalCount}`
);

try {
  assertRuntimeSemanticCompletionPass(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
