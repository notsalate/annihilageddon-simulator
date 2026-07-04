import assert from "node:assert/strict";
import test from "node:test";

import { isPlainRecord } from "../src/common.js";

test("isPlainRecord accepts JSON objects and rejects arrays", () => {
  assert.equal(isPlainRecord({ effectId: "add_power" }), true);
  assert.equal(isPlainRecord(Object.create(null)), true);
  assert.equal(isPlainRecord([]), false);
  assert.equal(isPlainRecord(null), false);
  assert.equal(isPlainRecord("effect"), false);
});
