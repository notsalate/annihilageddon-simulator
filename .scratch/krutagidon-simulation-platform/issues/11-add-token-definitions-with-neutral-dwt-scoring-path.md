# Add Token Definitions with neutral DWT scoring path

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD-10-mechanics-platform.md`

## What to build

Add the first token data path, separate from card definitions, and use it to represent neutral Dead Wizard Tokens for early simulation scoring.

This slice should introduce Token Definitions and token kinds, load neutral DWT data for normal early simulations, provide fixture DWT definitions for tests, and make controlled DWT scoring use token data rather than a hardcoded per-token penalty.

## Acceptance criteria

- [ ] Token Definitions are represented separately from Card Definitions.
- [ ] Token Definitions include a token kind such as `deadWizardToken`.
- [ ] Normal early simulation data can load neutral DWT definitions with base -3 VP and no token-specific effects.
- [ ] Tests can load fixture DWT definitions without treating them as real simulation data.
- [ ] Player-controlled DWT state uses explicit token ids/instances or an equivalent explicit token ownership representation rather than opaque strings only.
- [ ] Scoring applies the neutral DWT -3 VP penalty through token data.
- [ ] Existing scoring behavior for current simulations is preserved where no real DWT effects exist.
- [ ] Focused tests cover neutral DWT scoring and fixture DWT loading.

## Blocked by

None - can start immediately
