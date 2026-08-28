# Performance benchmarks

## Purpose

This directory contains immutable E0 history and active E1 baseline and accepted-calibration artifacts for simulation and Best-Move Analyzer performance checks.

Read this document before running, comparing, accepting, or downloading benchmark artifacts.

## Commands

```powershell
npm run benchmark:simulation
npm run benchmark:analyzer
npm run benchmark:effect-runtime
npm run benchmark:epoch
npm run benchmark:epoch:calibrate
npm run benchmark:artifacts:download -- <run-id>
npm run diagnose:analyzer -- --profile light
```

Use `benchmark:artifacts:download` for local copies of GitHub Actions benchmark reports. Do not download them into the repository root or directly under `.scratch/`.

The command stores each requested run under:

```text
.scratch/tmp/performance-artifacts/<run-id>/
```

## Accepted Artifacts

- `performance-epoch-e0.json` and `performance-calibration-e0-v1.json` preserve the immutable E0 history.
- `performance-epoch-e1.json` is the immutable active E1 baseline.
- `performance-calibration-e1-v1.json` is its accepted calibration artifact.
- A calibration run produces a candidate only. It never replaces an accepted artifact automatically.
- Baseline or calibration replacement requires explicit acceptance.

## Comparison Contract

- Keep `reference` and `current` results separate.
- A comparison may block only a repeated regression with matching workload and protocol.
- Blocking measurements for one workload must share the exact environment fingerprint and one comparison-pair ID produced by a single runner session.
- A historical measurement without that physical pairing is diagnostic only.
- Workload changes, missing calibration, and uncalibrated environments produce non-blocking reports.

## Analyzer diagnostics

Run one supported Analyzer profile with:

```powershell
npm run diagnose:analyzer -- --profile light --format human
npm run diagnose:analyzer -- --profile typical --format json --artifacts .scratch/tmp/analyzer-typical
```

The command runs three processes in order: the clean Analyzer benchmark, an instrumented semantic-counter run, and a separate Node CPU-profile run. The clean benchmark is the only timing comparable with ADR-0001/E1. Instrumented and profiled timings are explicitly diagnostic-only and must not update the accepted baseline, performance epoch, or CI gate.

The summary contains the selected profile, workload/environment and result fingerprints, clean phase timings, semantic counters, CPU category totals, hotspots, and paths to the generated artifacts. Counters use array-item units for copied paths and event-log entries; phase counters separate enumeration, ranking, and evaluation-policy isolation. All three runs must report the same result fingerprint.

CPU hotspots retain generated JavaScript URL, line, and column information. Generated `dist/**/*.js.map` files provide the TypeScript source-mapping hint. CPU profiling is a sampled CPU view only; it does not measure allocations and is not a heap snapshot.

Artifacts are written under `.scratch/tmp/analyzer-diagnostics/` by default or under the explicit `--artifacts` directory. They are diagnostic run products, not tracked runtime data.

## PR Gate

- Cancel an older in-progress PR run when a newer commit makes its result obsolete.
- Skip the heavy gate only when every changed path is guaranteed non-executable: Markdown or a GitHub issue template. Unknown paths run the full gate by default, and renames are safe to skip only when both paths are non-executable.
- Measure simulation and the three Analyzer profiles in independent jobs. Each job keeps its own head, base, available E1, and confirmation measurements on one runner with one workload-specific comparison-pair ID.
- Read the accepted E1 commit from the baseline, build it in an isolated checkout, and measure it beside head on the same runner.
- Failure to measure E1 reports `not-measured` without masking the independent `base`/`head` verdict.
- Use only a compatible accepted calibration. Missing or incompatible calibration reports `not-calibrated`; do not fall back to baseline tolerances.
- Run the confirming head measurement only when the preliminary E1/head or base/head comparison observes a calibrated regression. A clean preliminary comparison remains valid without a redundant confirmation.
- Publish all simulation and Analyzer reports before enforcing a blocking verdict.
- Aggregate the four workload artifacts in one final `pull-request` job; this job also reports a successful explicit skip for guaranteed non-executable changes.
- The base adapter may bridge a missing numeric stage without changing base source.

The gate derives one expected fresh-session pair ID per workload from the workflow run. A produced base, head, required confirmation, or available E1 measurement that loses this ID, disagrees on it, or disagrees on exact environment or protocol is an infrastructure failure. Do not reclassify a legitimate diagnostic verdict because of this failure.

## Handling PR Results

A green performance gate means that the accepted comparison contract found no blocking regression. It does not replace correctness checks or code review.

When the performance gate is red:

1. Check report integrity and comparability first. Treat missing artifacts, mismatched pair IDs, environments, protocols, or workloads as measurement or infrastructure problems, not as proven code regressions.
2. For a confirmed regression, inspect the affected workload and phase, reproduce it when needed, and try to remove the slowdown without compromising correctness, architecture, or the requested behavior.
3. Do not weaken an accepted threshold, overwrite an accepted epoch, discard a valid metric, or create a new epoch merely to make CI green.
4. If the slowdown cannot reasonably be removed, record its cause and measured impact, the attempted remedies, and why avoiding it would violate a required behavior or impose a worse technical trade-off.
5. Keep the PR blocked until the regression is fixed or that evidence is reviewed and the compromise is explicitly accepted as a new performance epoch such as E1.

Accepting a new epoch requires an ADR update describing the previous contract, the new contract, and the lasting consequence, followed by a fresh calibration and immutable baseline artifacts for that epoch. An agent must not accept this trade-off implicitly or on its own.

## Calibration

- Full calibration uses 20 matched pairs and runs manually or on the weekly schedule.
- Compare runner classes using Node.js version, platform, architecture, runner image, and CPU count.
- Independent jobs may use different CPU models, but both measurements inside one pair must use the exact same environment.
- The manual performance workflow produces the candidate for the active epoch from matched CI reference and calibration artifacts.
