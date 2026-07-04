# Resolve first legal choices for a targeted fixture effect

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Add the first end-to-end choice and target resolution path by executing a targeted fixture effect through the shared Effect Runtime.

This slice should let an effect ask for legal target or object choices, let the deterministic baseline Choice Policy choose the first legal option, apply the selected effect, and skip cleanly when no legal choices exist unless the effect mapping explicitly requires failure.

## Acceptance criteria

- [ ] The engine can build legal choices for a fixture effect that requires a target or object selection.
- [ ] The baseline Choice Policy chooses the first legal option deterministically.
- [ ] Re-running the same seeded fixture produces the same selected choice and result.
- [ ] Empty legal choices skip/no-op by default.
- [ ] Effect data can mark empty choices as failure, and that failure is surfaced clearly.
- [ ] Target Resolution is shared by the fixture effect rather than implemented only inside that effect handler.
- [ ] Target Resolution supports the selector or selectors needed by the fixture and leaves unsupported selectors explicit.
- [ ] Tests cover first-legal choice, empty-choice skip, explicit empty-choice failure, and targeted fixture execution.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
