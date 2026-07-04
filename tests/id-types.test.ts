import assert from "node:assert/strict";
import test from "node:test";

import type {
  CardDefinitionId,
  CardInstanceId,
  PlayerId,
  TokenDefinitionId,
  TokenInstanceId,
} from "../src/index.js";
import {
  createCardDefinitionId,
  createCardInstanceId,
  createPlayerId,
  createTokenDefinitionId,
  createTokenInstanceId,
  markCardDefinitionId,
  markCardInstanceId,
  markPlayerId,
  markTokenDefinitionId,
  markTokenInstanceId,
} from "../src/index.js";

type Assert<T extends true> = T;
type IsAssignable<From, To> = From extends To ? true : false;
type IsNotAssignable<From, To> =
  IsAssignable<From, To> extends true ? false : true;

type IdTypeAssertions = [
  Assert<IsNotAssignable<CardInstanceId, CardDefinitionId>>,
  Assert<IsNotAssignable<CardDefinitionId, CardInstanceId>>,
  Assert<IsNotAssignable<TokenInstanceId, TokenDefinitionId>>,
  Assert<IsNotAssignable<TokenDefinitionId, TokenInstanceId>>,
  Assert<IsNotAssignable<CardDefinitionId, TokenDefinitionId>>,
  Assert<IsNotAssignable<TokenDefinitionId, CardDefinitionId>>,
  Assert<IsNotAssignable<PlayerId, CardInstanceId>>,
  Assert<IsNotAssignable<string, PlayerId>>,
  Assert<IsNotAssignable<string, CardDefinitionId>>,
  Assert<IsNotAssignable<string, CardInstanceId>>,
  Assert<IsNotAssignable<string, TokenDefinitionId>>,
  Assert<IsNotAssignable<string, TokenInstanceId>>,
];

const idTypeAssertionCount: IdTypeAssertions["length"] = 12;

test("branded id types are compile-time only", () => {
  // The assertions above are checked by TypeScript; runtime behavior stays unchanged.
  assert.equal(idTypeAssertionCount, 12);
});

test("id helpers separate validation from marking checked values", () => {
  assert.equal(createPlayerId(2), "player-2");
  assert.equal(
    createCardDefinitionId("esw2_dbg__main_001"),
    "esw2_dbg__main_001"
  );
  assert.equal(createCardInstanceId(3), "card-3");
  assert.equal(
    createTokenDefinitionId("esw2_dbg__dead_wizard_token_001"),
    "esw2_dbg__dead_wizard_token_001"
  );
  assert.equal(createTokenInstanceId(4), "token-4");

  assert.equal(markPlayerId("player-7"), "player-7");
  assert.equal(
    markCardDefinitionId("already-checked-card"),
    "already-checked-card"
  );
  assert.equal(
    markCardInstanceId("already-checked-card-instance"),
    "already-checked-card-instance"
  );
  assert.equal(
    markTokenDefinitionId("already-checked-token"),
    "already-checked-token"
  );
  assert.equal(
    markTokenInstanceId("already-checked-token-instance"),
    "already-checked-token-instance"
  );

  assert.throws(() => createPlayerId(0), /player number/);
  assert.throws(() => createCardInstanceId(0), /card instance number/);
  assert.throws(() => createTokenInstanceId(0), /token instance number/);
  assert.throws(() => createCardDefinitionId(""), /card definition id/);
  assert.throws(
    () => createTokenDefinitionId(" token "),
    /token definition id/
  );
});
