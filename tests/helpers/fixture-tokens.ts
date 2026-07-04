import assert from "node:assert/strict";

import type {
  GameState,
  PlayerState,
  TokenDefinition,
} from "../../src/index.js";
import { markTokenDefinitionId } from "../../src/domain/types.js";

export function replacePostSetupWizardPropertyFixture(
  state: GameState,
  player: PlayerState,
  definition: TokenDefinition
): PlayerState["wizardProperties"][number] {
  const property = player.wizardProperties[0];
  assert.ok(property);

  state.tokenDefinitions = new Map([
    ...state.tokenDefinitions,
    [definition.tokenId, definition],
  ]);
  property.definitionId = markTokenDefinitionId(definition.tokenId);

  return property;
}
