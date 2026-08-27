import assert from "node:assert/strict";
import test from "node:test";

import { applyAction } from "../src/index.js";
import {
  createGameScenario,
  givenRuntimeCard,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

test("card esw2_dbg__familiar_001 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372001 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_001",
    instanceId: "esw2_dbg__familiar_001",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});
test("card esw2_dbg__familiar_002 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372002 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_002",
    instanceId: "esw2_dbg__familiar_002",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_003 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372003 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_003",
    instanceId: "esw2_dbg__familiar_003",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_004 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372004 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_004",
    instanceId: "esw2_dbg__familiar_004",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_005 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372005 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_005",
    instanceId: "esw2_dbg__familiar_005",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_006 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372006 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_006",
    instanceId: "esw2_dbg__familiar_006",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_007 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372007 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_007",
    instanceId: "esw2_dbg__familiar_007",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_008 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372008 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_008",
    instanceId: "esw2_dbg__familiar_008",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_009 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372009 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_009",
    instanceId: "esw2_dbg__familiar_009",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__familiar_010 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372010 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__familiar_010",
    instanceId: "esw2_dbg__familiar_010",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_001 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372011 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_001",
    instanceId: "esw2_dbg__legend_001",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_002 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372012 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_002",
    instanceId: "esw2_dbg__legend_002",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_003 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372013 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_003",
    instanceId: "esw2_dbg__legend_003",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_004 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372014 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_004",
    instanceId: "esw2_dbg__legend_004",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_005 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372015 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_005",
    instanceId: "esw2_dbg__legend_005",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_006 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372016 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_006",
    instanceId: "esw2_dbg__legend_006",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_007 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372017 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_007",
    instanceId: "esw2_dbg__legend_007",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_008 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372018 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_008",
    instanceId: "esw2_dbg__legend_008",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_009 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372019 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_009",
    instanceId: "esw2_dbg__legend_009",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_010 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372020 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_010",
    instanceId: "esw2_dbg__legend_010",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_011 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372021 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_011",
    instanceId: "esw2_dbg__legend_011",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_012 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372022 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_012",
    instanceId: "esw2_dbg__legend_012",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_013 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372023 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_013",
    instanceId: "esw2_dbg__legend_013",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_014 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372024 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_014",
    instanceId: "esw2_dbg__legend_014",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_015 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372025 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_015",
    instanceId: "esw2_dbg__legend_015",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_016 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372026 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_016",
    instanceId: "esw2_dbg__legend_016",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_017 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372027 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_017",
    instanceId: "esw2_dbg__legend_017",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_018 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372028 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_018",
    instanceId: "esw2_dbg__legend_018",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_019 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372029 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_019",
    instanceId: "esw2_dbg__legend_019",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_020 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372030 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_020",
    instanceId: "esw2_dbg__legend_020",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_021 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372031 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_021",
    instanceId: "esw2_dbg__legend_021",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_022 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372032 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_022",
    instanceId: "esw2_dbg__legend_022",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_023 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372033 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_023",
    instanceId: "esw2_dbg__legend_023",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_024 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372034 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_024",
    instanceId: "esw2_dbg__legend_024",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_025 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372035 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_025",
    instanceId: "esw2_dbg__legend_025",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_026 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372036 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_026",
    instanceId: "esw2_dbg__legend_026",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_027 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372037 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_027",
    instanceId: "esw2_dbg__legend_027",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_028 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372038 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_028",
    instanceId: "esw2_dbg__legend_028",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_029 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372039 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_029",
    instanceId: "esw2_dbg__legend_029",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_030 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372040 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_030",
    instanceId: "esw2_dbg__legend_030",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_031 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372041 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_031",
    instanceId: "esw2_dbg__legend_031",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_032 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372042 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_032",
    instanceId: "esw2_dbg__legend_032",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__legend_033 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372043 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__legend_033",
    instanceId: "esw2_dbg__legend_033",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__limp_wand executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372044 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__limp_wand",
    instanceId: "esw2_dbg__limp_wand",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_001 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372045 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_001",
    instanceId: "esw2_dbg__main_001",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_002 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372046 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_002",
    instanceId: "esw2_dbg__main_002",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_003 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372047 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_003",
    instanceId: "esw2_dbg__main_003",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_004 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372048 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_004",
    instanceId: "esw2_dbg__main_004",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_005 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372049 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_005",
    instanceId: "esw2_dbg__main_005",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_006 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372050 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_006",
    instanceId: "esw2_dbg__main_006",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_007 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372051 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_007",
    instanceId: "esw2_dbg__main_007",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_008 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372052 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_008",
    instanceId: "esw2_dbg__main_008",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_009 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372053 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_009",
    instanceId: "esw2_dbg__main_009",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_010 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372054 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_010",
    instanceId: "esw2_dbg__main_010",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_011 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372055 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_011",
    instanceId: "esw2_dbg__main_011",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_012 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372056 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_012",
    instanceId: "esw2_dbg__main_012",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_013 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372057 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_013",
    instanceId: "esw2_dbg__main_013",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_014 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372058 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_014",
    instanceId: "esw2_dbg__main_014",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_015 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372059 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_015",
    instanceId: "esw2_dbg__main_015",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_016 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372060 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_016",
    instanceId: "esw2_dbg__main_016",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_017 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372061 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_017",
    instanceId: "esw2_dbg__main_017",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_018 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372062 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_018",
    instanceId: "esw2_dbg__main_018",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_019 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372063 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_019",
    instanceId: "esw2_dbg__main_019",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_020 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372064 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_020",
    instanceId: "esw2_dbg__main_020",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_021 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372065 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_021",
    instanceId: "esw2_dbg__main_021",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_022 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372066 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_022",
    instanceId: "esw2_dbg__main_022",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_023 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372067 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_023",
    instanceId: "esw2_dbg__main_023",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_024 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372068 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_024",
    instanceId: "esw2_dbg__main_024",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_025 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372069 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_025",
    instanceId: "esw2_dbg__main_025",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_026 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372070 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_026",
    instanceId: "esw2_dbg__main_026",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_027 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372071 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_027",
    instanceId: "esw2_dbg__main_027",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_028 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372072 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_028",
    instanceId: "esw2_dbg__main_028",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_029 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372073 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_029",
    instanceId: "esw2_dbg__main_029",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_030 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372074 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_030",
    instanceId: "esw2_dbg__main_030",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_031 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372075 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_031",
    instanceId: "esw2_dbg__main_031",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_032 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372076 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_032",
    instanceId: "esw2_dbg__main_032",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_033 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372077 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_033",
    instanceId: "esw2_dbg__main_033",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_034 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372078 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_034",
    instanceId: "esw2_dbg__main_034",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_035 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372079 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_035",
    instanceId: "esw2_dbg__main_035",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_036 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372080 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_036",
    instanceId: "esw2_dbg__main_036",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_037 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372081 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_037",
    instanceId: "esw2_dbg__main_037",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_038 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372082 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_038",
    instanceId: "esw2_dbg__main_038",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_039 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372083 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_039",
    instanceId: "esw2_dbg__main_039",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_040 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372084 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_040",
    instanceId: "esw2_dbg__main_040",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_041 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372085 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_041",
    instanceId: "esw2_dbg__main_041",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_042 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372086 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_042",
    instanceId: "esw2_dbg__main_042",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_043 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372087 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_043",
    instanceId: "esw2_dbg__main_043",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_044 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372088 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_044",
    instanceId: "esw2_dbg__main_044",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_045 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372089 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_045",
    instanceId: "esw2_dbg__main_045",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_046 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372090 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_046",
    instanceId: "esw2_dbg__main_046",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_047 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372091 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_047",
    instanceId: "esw2_dbg__main_047",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_048 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372092 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_048",
    instanceId: "esw2_dbg__main_048",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_049 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372093 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_049",
    instanceId: "esw2_dbg__main_049",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_050 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372094 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_050",
    instanceId: "esw2_dbg__main_050",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_051 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372095 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_051",
    instanceId: "esw2_dbg__main_051",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_052 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372096 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_052",
    instanceId: "esw2_dbg__main_052",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_053 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372097 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_053",
    instanceId: "esw2_dbg__main_053",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_054 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372098 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_054",
    instanceId: "esw2_dbg__main_054",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_055 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372099 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_055",
    instanceId: "esw2_dbg__main_055",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_056 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372100 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_056",
    instanceId: "esw2_dbg__main_056",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_057 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372101 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_057",
    instanceId: "esw2_dbg__main_057",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_058 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372102 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_058",
    instanceId: "esw2_dbg__main_058",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_059 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372103 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_059",
    instanceId: "esw2_dbg__main_059",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_060 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372104 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_060",
    instanceId: "esw2_dbg__main_060",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_061 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372105 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_061",
    instanceId: "esw2_dbg__main_061",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_062 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372106 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_062",
    instanceId: "esw2_dbg__main_062",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_063 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372107 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_063",
    instanceId: "esw2_dbg__main_063",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_064 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372108 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_064",
    instanceId: "esw2_dbg__main_064",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_065 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372109 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_065",
    instanceId: "esw2_dbg__main_065",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_066 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372110 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_066",
    instanceId: "esw2_dbg__main_066",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_067 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372111 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_067",
    instanceId: "esw2_dbg__main_067",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_068 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372112 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_068",
    instanceId: "esw2_dbg__main_068",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_069 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372113 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_069",
    instanceId: "esw2_dbg__main_069",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_070 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372114 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_070",
    instanceId: "esw2_dbg__main_070",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_071 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372115 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_071",
    instanceId: "esw2_dbg__main_071",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_072 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372116 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_072",
    instanceId: "esw2_dbg__main_072",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_073 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372117 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_073",
    instanceId: "esw2_dbg__main_073",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_074 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372118 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_074",
    instanceId: "esw2_dbg__main_074",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_075 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372119 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_075",
    instanceId: "esw2_dbg__main_075",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_076 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372120 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_076",
    instanceId: "esw2_dbg__main_076",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_077 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372121 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_077",
    instanceId: "esw2_dbg__main_077",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__main_078 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372122 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__main_078",
    instanceId: "esw2_dbg__main_078",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_001 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372123 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_001",
    instanceId: "esw2_dbg__mega_mayhem_001",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_002 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372124 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_002",
    instanceId: "esw2_dbg__mega_mayhem_002",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_003 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372125 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_003",
    instanceId: "esw2_dbg__mega_mayhem_003",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_004 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372126 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_004",
    instanceId: "esw2_dbg__mega_mayhem_004",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_005 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372127 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_005",
    instanceId: "esw2_dbg__mega_mayhem_005",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_006 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372128 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_006",
    instanceId: "esw2_dbg__mega_mayhem_006",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__mega_mayhem_007 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372129 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__mega_mayhem_007",
    instanceId: "esw2_dbg__mega_mayhem_007",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__starter_001 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372130 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_001",
    instanceId: "esw2_dbg__starter_001",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__starter_002 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372131 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_002",
    instanceId: "esw2_dbg__starter_002",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__starter_003 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372132 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_003",
    instanceId: "esw2_dbg__starter_003",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__starter_004 executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372133 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__starter_004",
    instanceId: "esw2_dbg__starter_004",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});

test("card esw2_dbg__wild_magic executes through the public play action", () => {
  const scenario = createGameScenario({ rootDir, seed: 372134 });
  const card = givenRuntimeCard(scenario, {
    definitionId: "esw2_dbg__wild_magic",
    instanceId: "esw2_dbg__wild_magic",
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
});
