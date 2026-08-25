import type { ChoicePlayerView } from "./choice-policy.js";
import type { PlayerDecisionView, PlayerState } from "./setup.js";

/** Creates the isolated player snapshot exposed at strategy boundaries. */
export function createPlayerDecisionView(
  player: PlayerState
): PlayerDecisionView {
  const { deck: _deck, ...visiblePlayer } = player;
  return structuredClone(visiblePlayer);
}

/** Creates the minimal isolated view exposed while resolving an effect choice. */
export function createChoicePlayerView(player: PlayerState): ChoicePlayerView {
  return {
    playerId: player.playerId,
    chips: player.chips,
    life: {
      current: player.life.current,
      max: player.life.max,
    },
    handSize: player.hand.length,
    discardSize: player.discard.length,
    playedThisTurnSize: player.playedThisTurn.length,
    permanentsSize: player.permanents.length,
    unboughtFamiliarPresent: player.unboughtFamiliars.length > 0,
    deadWizardTokenCount: player.deadWizardTokens.length,
    wizardPropertyCount: player.wizardProperties.length,
    statusIds: player.statuses.map((status) => status.statusId),
    trophyIds: player.trophyLikeObjects.map((trophy) => trophy.trophyId),
  };
}
