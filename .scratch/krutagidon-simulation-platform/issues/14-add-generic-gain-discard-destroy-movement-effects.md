# Add generic gain, discard, and destroy movement effects

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Add generic card movement effects for gaining, discarding, and destroying cards through the shared Effect Runtime.

This slice should make fixture effects move cards between real game zones using shared helpers, legal choices, ownership/control rules, empty-choice skip behavior, and typed event logs. It should avoid bespoke per-card movement logic and preserve existing play/buy behavior.

## Acceptance criteria

- [ ] A fixture gain effect can move an eligible card to the correct destination.
- [ ] A fixture discard effect can discard an eligible card from the expected source zone.
- [ ] A fixture destroy effect can remove an eligible card from normal game flow to the correct destroyed destination.
- [ ] Movement effects use shared helpers rather than one-off handler-specific movement code.
- [ ] Movement effects use legal choices and the baseline Choice Policy where a selection is required.
- [ ] Movement effects skip by default when no legal card choice exists.
- [ ] Ownership and control rules are preserved during movement.
- [ ] Typed event log entries record gain, discard, and destroy consequences.
- [ ] Existing play, buy, cleanup, and scoring behavior still pass existing tests.
- [ ] Focused tests cover gain, discard, destroy, empty-choice skip, and ownership/control preservation.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/10-execute-existing-play-effects-through-shared-effect-runtime.md`
- `.scratch/krutagidon-simulation-platform/issues/12-resolve-first-legal-choices-for-a-targeted-fixture-effect.md`
