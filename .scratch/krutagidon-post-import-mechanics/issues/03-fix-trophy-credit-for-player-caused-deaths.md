# Fix Trophy credit for player-caused deaths

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## What to build

Update Trophy credit so the Trophy moves when a player causes a foe to die, not only when a normal attack kills a foe. Deaths caused by DWTs, unowned Mayhem/Mega Mayhem effects, source-less effects, or self-kills should not move the Trophy.

This should cover defense branch damage that kills the attacker without treating it as redirected attack damage.

## Acceptance criteria

- [ ] The engine can represent whether a death was caused by a player-controlled source.
- [ ] Normal attack kills still award the Trophy to the attacker.
- [ ] Player-caused non-attack damage that kills a foe awards the Trophy to the causing player.
- [ ] Defense branch damage that kills the attacker awards the Trophy to the defending player.
- [ ] Self-kills do not award the Trophy.
- [ ] DWT-caused deaths do not move the Trophy.
- [ ] Unowned Mayhem/Mega Mayhem deaths do not move the Trophy.
- [ ] Tests cover each Trophy-credit case above.
- [ ] Existing event logs remain clear enough to identify the Trophy source.

## Blocked by

None - can start immediately
