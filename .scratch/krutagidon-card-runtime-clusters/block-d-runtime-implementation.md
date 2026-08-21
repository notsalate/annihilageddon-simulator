# Block D Runtime Implementation

Block D starts after Block C closes the card classification work.

## Scope

Block D implements runtime cards by mechanic cluster.

Each Block D issue must select concrete cards from one mechanic cluster and make those selected cards `fullRuntime`.

`fullRuntime` means:

- current runtime card JSON exists;
- the card is directly reachable from the corresponding current runtime composition so it participates in the game;
- printed behavior for the selected card is implemented, not only the cluster's headline mechanic;
- focused tests cover the implemented behavior;
- `npm run report:card-runtime-clusters` accepts the result.

## Ordering

Start with simple clusters and move upward by implementation complexity.

Deliver cluster PRs sequentially. One PR contains work from exactly one `clusterId`; do not combine several mechanic clusters in one PR.

Current next-cluster order:

1. finish `chipsin-economy`;
2. implement `market-effects`;
3. implement `special-card-stack`.

Do not create broad attack, defense, or other foundation work before the concrete cluster that needs it. Shared mechanics should be introduced inside the first cluster issue that proves the need.

## Issue Slicing

Each Block D issue must stay within one `clusterId`. Do not mix cards from different mechanic clusters in one implementation issue.

A cluster may be split into several issues when coherent runtime surfaces make the work easier to implement and verify. Every split issue must remain inside the same `clusterId`.

All issues for the currently selected cluster must land together in one cluster PR. The PR is complete only when every selected missing-runtime card in that cluster is `fullRuntime`.

Planned Block D issue granularity:

- `scoring-effects`: 1 issue.
- `mayhem-events`: 1 issue.
- `controlled-object-conditions`: 1 issue.
- `dingler-status`: 1 issue.
- `life-total-effects`: 1 issue.
- `chipsin-economy`: 1 issue.
- `ongoing-modifiers`: 1 issue.
- `market-effects`: split into 3 issues.
- `special-card-stack`: split into 2 future issues; `esw2_dbg__limp_wand` and `esw2_dbg__wild_magic` are already `fullRuntime`.
- `activation-effects`: split into 3 issues.
- `defense-effects`: split into 3 issues.
- `dwt-interactions`: split into 4 issues.
- `card-movement`: split into 4 issues.
- `attack-effects`: split into 4 issues.

### `scoring-effects`

Implement as 1 issue:

- `esw2_dbg__legend_004`
- `esw2_dbg__main_027`
- `esw2_dbg__main_040`

### `mayhem-events`

Implement as 1 issue:

- `esw2_dbg__main_059`
- `esw2_dbg__main_064`
- `esw2_dbg__main_071`

### `controlled-object-conditions`

Implement as 1 issue:

- `esw2_dbg__legend_011`
- `esw2_dbg__main_016`
- `esw2_dbg__main_020`
- `esw2_dbg__main_056`

### `dingler-status`

Implement as 1 issue:

- `esw2_dbg__legend_014`
- `esw2_dbg__main_030`
- `esw2_dbg__main_066`
- `esw2_dbg__main_074`
- `esw2_dbg__mega_mayhem_004`

### `life-total-effects`

Implement as 1 issue:

- `esw2_dbg__legend_002`
- `esw2_dbg__legend_010`
- `esw2_dbg__main_046`
- `esw2_dbg__main_060`
- `esw2_dbg__mega_mayhem_005`

### `chipsin-economy`

Implement as 1 issue:

- `esw2_dbg__main_015`
- `esw2_dbg__main_036`
- `esw2_dbg__main_041`
- `esw2_dbg__legend_026`
- `esw2_dbg__main_062`
- `esw2_dbg__main_072`
- `esw2_dbg__main_075`

Current closeout note: the six main-deck cards are already `fullRuntime`; the remaining implementation issue covers `esw2_dbg__legend_026`. The protector condition is not executable; the card always gives 5 VP in runtime.

### `ongoing-modifiers`

Implement as 1 issue:

- `esw2_dbg__familiar_005`
- `esw2_dbg__legend_008`
- `esw2_dbg__legend_012`
- `esw2_dbg__legend_025`
- `esw2_dbg__main_009`
- `esw2_dbg__main_011`
- `esw2_dbg__main_047`

### `market-effects`

Split into 3 issues:

1. `market-effects/cost-and-gain`
   - `esw2_dbg__familiar_007`
   - `esw2_dbg__legend_031`
   - `esw2_dbg__main_008`
2. `market-effects/chips-on-market`
   - `esw2_dbg__main_063`
   - `esw2_dbg__main_044`
3. `market-effects/wipe-refill-destroy`
   - `esw2_dbg__legend_030`
   - `esw2_dbg__main_065`
   - `esw2_dbg__main_073`

### `special-card-stack`

`esw2_dbg__limp_wand` and `esw2_dbg__wild_magic` are already `fullRuntime`; do not create a new Block D issue for them.

Split the remaining cards into 2 issues:

1. `special-card-stack/limp-wand-gain`
   - `esw2_dbg__legend_001`
   - `esw2_dbg__legend_021`
   - `esw2_dbg__main_005`
   - `esw2_dbg__main_026`
   - `esw2_dbg__mega_mayhem_002`
2. `special-card-stack/mixed-attack-scoring`
   - `esw2_dbg__familiar_003`
   - `esw2_dbg__legend_029`

### `activation-effects`

Split into 3 issues:

1. `activation-effects/simple-power-actions`
   - `esw2_dbg__legend_005`
   - `esw2_dbg__main_012`
   - `esw2_dbg__main_014`
   - `esw2_dbg__main_033`
   - `esw2_dbg__main_055`
2. `activation-effects/controlled-conditions-and-deck`
   - `esw2_dbg__legend_018`
   - `esw2_dbg__main_034`
   - `esw2_dbg__main_048`
3. `activation-effects/self-destroy`
   - `esw2_dbg__main_006`
   - `esw2_dbg__main_031`

### `defense-effects`

Split into 3 issues:

1. `defense-effects/basic-discard-defense`
   - `esw2_dbg__familiar_001`
   - `esw2_dbg__familiar_006`
   - `esw2_dbg__main_003`
   - `esw2_dbg__main_013`
   - `esw2_dbg__main_029`
   - `esw2_dbg__main_042`
   - `esw2_dbg__main_043`
   - `esw2_dbg__main_045`
2. `defense-effects/reward-and-cost-defense`
   - `esw2_dbg__familiar_002`
   - `esw2_dbg__legend_022`
   - `esw2_dbg__legend_028`
   - `esw2_dbg__main_054`
3. `defense-effects/counter-damage-and-prize`
   - `esw2_dbg__main_017`

### `dwt-interactions`

Split into 4 issues:

1. `dwt-interactions/counting-and-scaling`
   - `esw2_dbg__legend_013`
   - `esw2_dbg__legend_033`
   - `esw2_dbg__main_039`
   - `esw2_dbg__mega_mayhem_003`
2. `dwt-interactions/gain-transfer-exchange`
   - `esw2_dbg__familiar_009`
   - `esw2_dbg__legend_006`
   - `esw2_dbg__legend_007`
   - `esw2_dbg__legend_027`
3. `dwt-interactions/token-like-controlled-cards`
   - `esw2_dbg__main_049`
   - `esw2_dbg__main_050`
   - `esw2_dbg__main_051`
   - `esw2_dbg__main_052`
   - `esw2_dbg__main_053`
4. `dwt-interactions/kill-replacement`
   - `esw2_dbg__main_032`

### `card-movement`

Split into 4 issues:

1. `card-movement/simple-trash-destroy`
   - `esw2_dbg__legend_020`
   - `esw2_dbg__main_019`
   - `esw2_dbg__main_037`
   - `esw2_dbg__main_057`
2. `card-movement/top-deck-reveal-destroy`
   - `esw2_dbg__main_001`
   - `esw2_dbg__main_007`
   - `esw2_dbg__main_010`
   - `esw2_dbg__main_022`
   - `esw2_dbg__mega_mayhem_006`
3. `card-movement/hand-discard-loops`
   - `esw2_dbg__main_058`
   - `esw2_dbg__main_061`
   - `esw2_dbg__main_067`
   - `esw2_dbg__main_068`
   - `esw2_dbg__main_076`
   - `esw2_dbg__main_077`
   - `esw2_dbg__mega_mayhem_007`
4. `card-movement/special-zone-play`
   - `esw2_dbg__familiar_008`
   - `esw2_dbg__legend_032`

### `attack-effects`

Split into 4 issues:

1. `attack-effects/simple-targeted-attacks`
   - `esw2_dbg__legend_003`
   - `esw2_dbg__legend_019`
   - `esw2_dbg__legend_024`
   - `esw2_dbg__main_018`
   - `esw2_dbg__main_021`
   - `esw2_dbg__main_023`
   - `esw2_dbg__main_028`
   - `esw2_dbg__starter_003`
   - `esw2_dbg__starter_004`
2. `attack-effects/multi-and-all-target-attacks`
   - `esw2_dbg__familiar_010`
   - `esw2_dbg__legend_017`
   - `esw2_dbg__main_069`
   - `esw2_dbg__main_070`
   - `esw2_dbg__mega_mayhem_001`
3. `attack-effects/modifiers-and-restrictions`
   - `esw2_dbg__familiar_004`
   - `esw2_dbg__legend_016`
   - `esw2_dbg__main_025`
4. `attack-effects/variable-and-sequenced-attacks`
   - `esw2_dbg__legend_015`
   - `esw2_dbg__legend_023`
   - `esw2_dbg__main_024`
   - `esw2_dbg__main_078`

## Initial Direction

The first Block D issue should implement the full `simple-baseline` cluster: all 7 cards must become `fullRuntime`.

Cards:

- `esw2_dbg__legend_009`
- `esw2_dbg__main_002`
- `esw2_dbg__main_004`
- `esw2_dbg__main_035`
- `esw2_dbg__main_038`
- `esw2_dbg__starter_001`
- `esw2_dbg__starter_002`

Large or complex clusters may be split into smaller vertical slices, but a selected card must not be left partially implemented.

Selected cards must be added to their matching current compositions, such as `main-deck`, `legend-deck`, or `starter-deck`.
