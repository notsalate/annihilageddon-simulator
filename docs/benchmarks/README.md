# Performance benchmarks

## Purpose

This directory contains immutable E0 baseline and accepted-calibration artifacts for simulation and Best-Move Analyzer performance checks.

Read this document before running, comparing, accepting, or downloading benchmark artifacts.

## Commands

```powershell
npm run benchmark:simulation
npm run benchmark:analyzer
npm run benchmark:effect-runtime
npm run benchmark:epoch
npm run benchmark:epoch:calibrate
npm run benchmark:artifacts:download -- <run-id>
```

Use `benchmark:artifacts:download` for local copies of GitHub Actions benchmark reports. Do not download them into the repository root or directly under `.scratch/`.

The command stores each requested run under:

```text
.scratch/tmp/performance-artifacts/<run-id>/
```

## Accepted Artifacts

- `performance-epoch-e0.json` is the immutable versioned E0 baseline.
- `performance-calibration-e0-v1.json` is the accepted calibration artifact.
- A calibration run produces a candidate only. It never replaces an accepted artifact automatically.
- Baseline or calibration replacement requires explicit acceptance.

## Comparison Contract

- Keep `reference` and `current` results separate.
- A comparison may block only a repeated regression with matching workload and protocol.
- Blocking measurements must share the exact environment fingerprint and one comparison-pair ID produced by a single runner session.
- A historical E0 measurement without that physical pairing is diagnostic only.
- Workload changes, missing calibration, and uncalibrated environments produce non-blocking reports.

## PR Gate

- Read the accepted E0 commit from the baseline, build it in an isolated checkout, and measure it beside head on the same runner.
- Failure to measure E0 reports `not-measured` without masking the independent `base`/`head` verdict.
- Use only a compatible accepted calibration. Missing or incompatible calibration reports `not-calibrated`; do not fall back to baseline tolerances.
- Publish all simulation and Analyzer reports before enforcing a blocking verdict.
- The base adapter may bridge a missing numeric stage without changing base source.

The gate receives an expected fresh-session pair ID. A produced base, head, confirmation, or available E0 measurement that loses this ID, disagrees on it, or disagrees on exact environment or protocol is an infrastructure failure. Do not reclassify a legitimate diagnostic verdict because of this failure.

## Handling PR Results

A green performance gate means that the accepted comparison contract found no blocking regression. It does not replace correctness checks or code review.

When the performance gate is red:

1. Check report integrity and comparability first. Treat missing artifacts, mismatched pair IDs, environments, protocols, or workloads as measurement or infrastructure problems, not as proven code regressions.
2. For a confirmed regression, inspect the affected workload and phase, reproduce it when needed, and try to remove the slowdown without compromising correctness, architecture, or the requested behavior.
3. Do not weaken an accepted threshold, overwrite E0, discard a valid metric, or create a new epoch merely to make CI green.
4. If the slowdown cannot reasonably be removed, record its cause and measured impact, the attempted remedies, and why avoiding it would violate a required behavior or impose a worse technical trade-off.
5. Keep the PR blocked until the regression is fixed or that evidence is reviewed and the compromise is explicitly accepted as a new performance epoch such as E1.

Accepting a new epoch requires an ADR update describing the previous contract, the new contract, and the lasting consequence, followed by a fresh calibration and immutable baseline artifacts for that epoch. An agent must not accept this trade-off implicitly or on its own.

## Calibration

- Full calibration uses 20 matched pairs and runs manually or on the weekly schedule.
- Compare runner classes using Node.js version, platform, architecture, runner image, and CPU count.
- Independent jobs may use different CPU models, but both measurements inside one pair must use the exact same environment.
- The manual performance workflow produces the candidate E0 from matched CI reference and calibration artifacts.
