import {
  runDraftImportHarness,
  type DraftImportKind,
  type DraftImportSource,
} from "../import/draft-generator.js";

interface ParsedArgs {
  sources: DraftImportSource[];
  blockersReportPath: string;
}

const parsedArgs = parseArgs(process.argv.slice(2));
const result = runDraftImportHarness({
  rootDir: process.cwd(),
  sources: parsedArgs.sources,
  blockersReportPath: parsedArgs.blockersReportPath,
});

console.log(
  [
    `Draft generator: ${result.generated.length} draft(s) generated`,
    `Blockers: ${result.blockers.length}`,
    `Blocker report: ${parsedArgs.blockersReportPath}`,
  ].join("\n")
);

if (result.blockers.length > 0) {
  process.exitCode = 1;
}

function parseArgs(args: string[]): ParsedArgs {
  const sources: DraftImportSource[] = [];
  let blockersReportPath = ".scratch/tmp/draft-import-blockers.json";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--blockers") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("--blockers requires a path");
      }
      blockersReportPath = value;
      index += 1;
      continue;
    }

    const kind = parseKindFlag(arg);
    if (kind !== undefined) {
      const textPath = args[index + 1];
      if (textPath === undefined) {
        throw new Error(`${arg} requires a markdown source path`);
      }
      sources.push({ kind, textPath });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (sources.length === 0) {
    throw new Error(
      "Pass at least one source with --card, --dead-wizard-token, or --wizard-property"
    );
  }

  return {
    sources,
    blockersReportPath,
  };
}

function parseKindFlag(arg: string): DraftImportKind | undefined {
  switch (arg) {
    case "--card":
      return "card";
    case "--dead-wizard-token":
      return "deadWizardToken";
    case "--wizard-property":
      return "wizardProperty";
    default:
      return undefined;
  }
}
