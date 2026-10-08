# Coding Standards

These repository-wide standards apply to implementation and review. Directory-specific contracts and checks live in the applicable `AGENTS.md` chain; commands are defined in `package.json` and explained in [README.md](README.md).

## Simulation and Data

- Keep TypeScript strict and simulation behavior deterministic through seeded RNG.
- Use stable IDs as primary identifiers for cards, effects, actions, strategies, events, and data objects. Localized names are display/source fields.
- Implement card and token behavior with explicit typed handlers and structured effects, not runtime natural-language parsing.
- Keep game-domain behavior in domain/engine modules, outside CLI wrappers, UI, and route-level code.
- Keep runtime data separate from import sources. The engine must never read `data/import/**` as executable input. For changes across that boundary, read [import pipeline](docs/import-pipeline.md) and [runtime layout](docs/runtime-layout.md).
- Keep `Best-Move Analyzer` outside `BotStrategy`: analysis may inspect complete state and fork RNG; player strategies must not use hidden opponent information or future RNG outcomes.
- Preserve existing tested behavior unless the task changes the rules. Cover simulation changes with focused deterministic tests and report simplifications or incomplete mechanics.

## Tests

- Add or update focused tests when source behavior changes, including import tooling and CLI entrypoints.
- Prefer focused deterministic scenarios over broad random simulations; assert externally relevant behavior rather than only implementation internals.
- Keep fixtures small and explicit. Prevent shared fixture mutation from leaking between tests.
- Follow [tests/AGENTS.md](tests/AGENTS.md) for suite registration, runtime packs, and shared builders when adding or changing tests.

## Verification

- Start with the narrowest relevant check and run the required checks in the owning source/data/test instructions. Use `npm run check` for the complete repository gate.
- After source edits, run `npm run typecheck`; for source or runtime data behavior changes, also run focused tests or `npm test`.
- Run `npm run build` when CLI output or generated JavaScript entrypoints matter, or runtime data shapes change.
- When runtime coverage status or playable mappings change, run `npm run report:runtime-coverage`.
- For broad behavior changes, run `npm test` before reporting completion. Helper or fixture typing changes also require `npm run typecheck`.
- For documentation changes to commands, data contracts, or runtime claims, run the narrowest check from the owning implementation area. Pure prose/structure edits need `git diff --check` and verification that changed local references resolve.

## Performance

Before running, comparing, accepting, or downloading benchmarks, read [docs/benchmarks/README.md](docs/benchmarks/README.md). Its comparison, acceptance, and blocking-regression rules govern performance work, including PRs; it owns the benchmark gate.
