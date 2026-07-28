import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootDir = process.cwd();

test("invalid raw fixtures do not use unnecessary never assertions", () => {
  const setupEffects = readFileSync(
    `${rootDir}/tests/setup-effects.test.ts`,
    "utf8"
  );
  const validation = readFileSync(
    `${rootDir}/tests/validation.test.ts`,
    "utf8"
  );

  const setupCase = extractSection(
    setupEffects,
    'test("setup resolver rejects invalid life totals before execution"',
    'test("replace_starting_card rejects blank or untrimmed definition IDs"'
  );
  assert.doesNotMatch(setupCase, /as never/u);

  const validationCase = extractSection(
    validation,
    'validateRawRuntimeEffect(\n      "play_top_card_from_foe_deck"',
    'test("catalog decoders reject invalid life and Dingler status payloads'
  );
  assert.doesNotMatch(validationCase, /as never/u);
});

function extractSection(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker ${endMarker}`);
  return source.slice(start, end);
}
