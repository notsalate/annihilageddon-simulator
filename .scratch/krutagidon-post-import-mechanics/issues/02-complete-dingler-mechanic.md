# Complete Dingler mechanic

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## What to build

Complete the core Dingler mechanic without importing every card or DWT face that mentions Dingler. The engine should support becoming Dingler, becoming normal again, toggling Dingler, max-life behavior, end-game VP penalty, and focused tests for those behaviors.

## Acceptance criteria

- [ ] A player can become Dingler through normal runtime effect data.
- [ ] A player can become normal again through normal runtime effect data.
- [ ] Toggling Dingler works for effects that say "if already Dingler, become normal".
- [ ] Becoming Dingler clamps current life to 15.
- [ ] Dingler max life 15 is used by healing and set-life behavior.
- [ ] Removing Dingler restores the normal max-life cap but does not automatically heal the player.
- [ ] Dingler gives -5 VP at game end while active.
- [ ] Tests cover gain, removal, repeated/toggle behavior, healing, set-life, and scoring.
- [ ] Existing supported Mega Mayhem or wizard property behavior that mentions Dingler is updated to use the completed mechanic.

## Blocked by

None - can start immediately
