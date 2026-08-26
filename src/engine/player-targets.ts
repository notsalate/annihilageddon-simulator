import type { PlayerState } from "./setup.js";

export function getDistinctAdjacentFoes(
  foesInSeatingOrder: readonly PlayerState[]
): PlayerState[] {
  const adjacentFoes = [
    foesInSeatingOrder[0],
    foesInSeatingOrder.at(-1),
  ].filter((candidate): candidate is PlayerState => candidate !== undefined);

  return adjacentFoes.filter(
    (candidate, index) =>
      adjacentFoes.findIndex(
        (otherCandidate) => otherCandidate.playerId === candidate.playerId
      ) === index
  );
}
