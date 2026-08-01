# AGENTS.md

## Purpose

This folder contains command-line entrypoints and menu orchestration.

## Ownership

- Owns CLI wrappers under `src/cli/**`.
- Engine behavior remains in `src/engine/`.
- Import/report logic remains in `src/import/`.

## Local Contracts

- Keep CLI files thin: parse command intent, call source modules, print results.
- Do not put game-domain rules or import schema decisions in CLI wrappers.
- Keep user-facing menu text clear and consistent with the command behavior.
- Do not add network or dependency-install side effects to CLI commands.
- Public-entrypoint guard follows the static TypeScript import/export graph and canonical symbols. It does not interpret arbitrary JavaScript value flow; new trusted adapters and production CLI entrypoints require an explicit policy update and paired tests.

## Work Guidance

- If a CLI needs new behavior, implement it in the owning engine/import module first and call it here.
- Keep generated output paths explicit and documented when commands write files.

## Verification

- Run `npm run build` after CLI edits.
- Run `npm test` or focused CLI/menu tests when menu behavior changes.
- Run the specific npm script when changing command output that is hard to cover through tests.

## Child DOX Index

None.
