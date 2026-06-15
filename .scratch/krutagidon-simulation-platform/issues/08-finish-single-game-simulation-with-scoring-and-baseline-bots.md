# Finish single-game simulation with scoring and baseline bots

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-simulation-platform/PRD.md`

## What to build

Complete the first reproducible full-game simulation from seed to terminal result.

This slice should add real v0 end conditions, scoring, tie breakers, a baseline bot strategy, and a single-game CLI or script that can run one complete game and print a useful summary.

## Acceptance criteria

- [ ] A game can run from initial seed to completion without manual intervention.
- [ ] The engine ends the game when dead wizard tokens are exhausted.
- [ ] The engine ends the game when the main deck is exhausted.
- [ ] The engine ends the game when the Legend deck is exhausted.
- [ ] `maxTurns` exists only as technical protection and is marked as non-game termination when triggered.
- [ ] Scoring sums victory points from hand, deck, discard, played-this-turn, and permanents as appropriate.
- [ ] Tie breakers are applied in order: victory points, Legend count, fewer dead wizards, true tie.
- [ ] At least one baseline bot chooses only from legal actions.
- [ ] The single-game run is reproducible with the same seed.
- [ ] Tests cover end conditions, scoring, tie breakers, and bot/legal-action integration.

## Blocked by

- `.scratch/krutagidon-simulation-platform/issues/07-implement-v0-turn-action-loop.md`

