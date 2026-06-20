# Single-game debug trace

This document defines the first human-readable trace format for inspecting one deterministic game by seed.

The trace is a readable projection over `SingleGameResult.eventLog`. It is not a replacement for raw event logs. Raw logs remain the source of truth for replay and regression tests.

## Shape

```text
Game seed <seed>: <endReason> after <turnsElapsed> turn(s) (<game end|technical stop>)

Setup
- Game initialized.

Turn <turn-number|?> - <player-id>
- <game-term event>
- <game-term event>

Missing instrumentation
- <data not yet present in eventLog>
```

Current v0 traces use `Turn ?` because `GameEvent` does not store a turn number yet. The trace must keep this explicit instead of guessing from `turnStarted`/`turnEnded`.

## Event Lines

Supported event lines in the first implementation:

```text
- Bot selected an action.
- Played <card-name-or-id> (<card-instance-id>).
- Effect add_power from <card> (<card-instance-id>): <player-id> gains +<amount> power.
- Bought <card> (<card-instance-id>) -> <destination>.
- Effect gain_card from <card> (<card-instance-id>): <player-id> chooses <target-card> (<target-instance-id>) -> <destination>.
- Defense: <player-id> chooses <card> (<card-instance-id>) for avoid_attack.
- Zone move: <card> (<card-instance-id>) -> <destination>.
- Damage: <source-player-id> deals <amount> to <target-player-id> with <card> (<card-instance-id>) via <effect-id>.
- Death: <player-id> is defeated.
- Trophy: Basic Trophy moves to <player-id> after defeating <target-player-id> with <card> (<card-instance-id>).
- DWT: <player-id> gains <token-name-or-id> (<token-instance-id>).
- Resurrection: <player-id> returns at <life> life.
```

Card and token display names are optional formatter inputs. If a name is unavailable, the trace prints the stable definition ID.

## Example

```text
Game seed 707: deadWizardTokensExhausted after 4 turns (game end)

Setup
- Game initialized.

Turn ? - player-1
- Bought Рыночная карта (card-21) -> discard.
- Effect gain_card from Карта получения (card-7): player-1 chooses Целевая карта (card-22) -> deckTop.

Turn ? - player-2
- Defense: player-2 chooses Защитная карта (card-9) for avoid_attack.
- Zone move: Защитная карта (card-9) -> discard.
- Damage: player-2 deals 3 to player-1 with Защитная карта (card-9) via deal_damage.

Turn ? - player-1
- Death: player-1 is defeated.

Turn ? - player-2
- Trophy: Basic Trophy moves to player-2 after defeating player-1 with Защитная карта (card-9).

Turn ? - player-1
- DWT: player-1 gains Жетон мертвого волшебника (token-4).
- Resurrection: player-1 returns at 20 life.

Missing instrumentation
- turn number for each event
- before/after hand, played, discard, deck, market and destroyed zones
- before/after life, power and chip totals for state-changing effects
```

## Data Already Available

Available from existing `GameEvent` fields:

- game initialization;
- player IDs and target player IDs;
- card instance IDs and card definition IDs;
- token instance IDs and token definition IDs;
- effect IDs and source type;
- effect amounts;
- effect/buy/defense destinations;
- death, DWT, resurrection, and Basic Trophy movement events.

Available from formatter options:

- card display names by `definitionId`;
- token display names by `tokenDefinitionId`.

## Data That Needs Instrumentation

Missing from current `GameEvent`:

- turn number on every event;
- action identity on `botActionSelected`;
- before/after life totals for damage, healing, set-life, death, and resurrection;
- before/after power and chip totals;
- source and destination zone names for all card movement;
- before/after zone counts or focused zone snapshots;
- legal target set before deterministic target choice;
- explicit DWT draw-stack count before/after gain;
- explicit Basic Trophy previous controller.

## Follow-up AFK Issue Draft

Title: Implement full single-game debug trace instrumentation

Acceptance criteria:

- Add turn number to every emitted game event.
- Emit focused before/after state for life, power, chips, card movement, DWT stack, and Basic Trophy movement.
- Add action identity to bot action selection events.
- Keep `formatSingleGameDebugTrace` readable without raw event log knowledge.
- Add focused tests that run a deterministic fixture game and verify the rendered trace includes card play, target choice, zone movement, defense or death, DWT, Trophy behavior, and before/after state.
- Wire the trace into the single-game CLI behind an explicit debug/trace option.
