# Fix Trophy credit for player-caused deaths

Status: done
Label: ready-for-agent
Type: AFK

## What to build

Update Trophy credit so the Trophy moves when a player causes a foe to die, not only when a normal attack kills a foe. Deaths caused by DWTs, unowned Mayhem/Mega Mayhem effects, source-less effects, or self-kills should not move the Trophy.

This should cover defense branch damage that kills the attacker without treating it as redirected attack damage.

## Acceptance criteria

- [x] The engine can represent whether a death was caused by a player-controlled source.
- [x] Normal attack kills still award the Trophy to the attacker.
- [x] Player-caused non-attack damage that kills a foe awards the Trophy to the causing player.
- [x] Defense branch damage that kills the attacker awards the Trophy to the defending player.
- [x] Self-kills do not award the Trophy.
- [x] DWT-caused deaths do not move the Trophy.
- [x] Unowned Mayhem/Mega Mayhem deaths do not move the Trophy.
- [x] Tests cover each Trophy-credit case above.
- [x] Existing event logs remain clear enough to identify the Trophy source.

## Notes

There is no public executable DWT-effect path yet. DWT/source-less deaths should continue to call death resolution without kill credit; the current neutral-death regression uses an unowned Mega Mayhem path.

## Blocked by

None - can start immediately
