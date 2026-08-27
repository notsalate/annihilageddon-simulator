import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  applyAction,
  type CardDefinition,
  type CardInstance,
} from "../src/index.js";
import {
  readCrossSourceCoveragePlan,
  type CrossSourceRuntimeRef,
} from "../src/import/cross-source-runtime-coverage.js";
import {
  createGameScenario,
  givenRuntimeCard,
  type GameScenario,
} from "./helpers/game-scenario.js";

const rootDir = process.cwd();

function runCardSemanticEvidence(definitionId: string, seed: number): void {
  const scenario = createGameScenario({ rootDir, seed });
  const card = givenRuntimeCard(scenario, {
    definitionId,
    instanceId: definitionId,
  });
  const result = applyAction(scenario.state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(result.ok, true);
  assertCardRuntimeEvidence(scenario, card, definitionId);
}

function assertCardRuntimeEvidence(
  scenario: GameScenario,
  card: CardInstance,
  definitionId: string
): void {
  const definition = scenario.state.cardDefinitions.get(definitionId);
  assert.ok(definition, `runtime definition is missing for ${definitionId}`);
  assert.equal(card.definitionId, definitionId);
  assert.ok(
    scenario.state.eventLog.some(
      (event) =>
        event.type === "cardPlayed" &&
        event.cardInstanceId === card.instanceId &&
        event.definitionId === definitionId
    ),
    `public play action did not record ${definitionId} as cardPlayed`
  );

  const planEntry = readCrossSourceCoveragePlan(rootDir).get(definitionId);
  assert.ok(planEntry, `coverage plan is missing for ${definitionId}`);
  assert.equal(planEntry.objectKind, "card");
  assert.ok(planEntry.semanticMappings.length > 0);

  for (const mapping of planEntry.semanticMappings) {
    assert.ok(
      mapping.runtimeRefs.length > 0,
      `mapping ${mapping.draftPoint.path} has no runtime references`
    );
    for (const runtimeRef of mapping.runtimeRefs) {
      assertCardRuntimeReference(
        definition,
        runtimeRef,
        definitionId,
        mapping.draftPoint.path
      );
    }
  }
}

function assertCardRuntimeReference(
  definition: CardDefinition,
  runtimeRef: CrossSourceRuntimeRef,
  definitionId: string,
  draftPointPath: string
): void {
  if (runtimeRef.kind === "field") {
    assert.deepEqual(
      readRuntimeField(definition, runtimeRef.path),
      normalizeRuntimeFieldValue(runtimeRef.path, runtimeRef.value),
      `${definitionId} ${draftPointPath} does not match ${runtimeRef.path}`
    );
    return;
  }

  const matchingEffects = definition.engine.effects.filter(
    (effect) =>
      effect.effectId === runtimeRef.effectId &&
      effect.timing === runtimeRef.timing
  );
  assert.ok(
    matchingEffects.some((effect) =>
      isDeepStrictEqual(runtimeEffectPayload(effect), runtimeRef.fields)
    ),
    `${definitionId} ${draftPointPath} does not match ${runtimeRef.effectId}@${runtimeRef.timing}`
  );
}

function normalizeRuntimeFieldValue(
  fieldPath: string,
  value: unknown
): unknown {
  // The runtime intake represents a card with no printed cost as cost 0.
  return fieldPath === "engine.cost" && value === null ? 0 : value;
}

function readRuntimeField(
  definition: CardDefinition,
  fieldPath: string
): unknown {
  return fieldPath.split(".").reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, definition);
}

function runtimeEffectPayload(
  effect: CardDefinition["engine"]["effects"][number]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(effect).filter(
      ([fieldName]) => fieldName !== "effectId" && fieldName !== "timing"
    )
  );
}

test("card esw2_dbg__familiar_001 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_001", 372001);
});
test("card esw2_dbg__familiar_002 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_002", 372002);
});

test("card esw2_dbg__familiar_003 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_003", 372003);
});

test("card esw2_dbg__familiar_004 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_004", 372004);
});

test("card esw2_dbg__familiar_005 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_005", 372005);
});

test("card esw2_dbg__familiar_006 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_006", 372006);
});

test("card esw2_dbg__familiar_007 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_007", 372007);
});

test("card esw2_dbg__familiar_008 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_008", 372008);
});

test("card esw2_dbg__familiar_009 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_009", 372009);
});

test("card esw2_dbg__familiar_010 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__familiar_010", 372010);
});

test("card esw2_dbg__legend_001 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_001", 372011);
});

test("card esw2_dbg__legend_002 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_002", 372012);
});

test("card esw2_dbg__legend_003 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_003", 372013);
});

test("card esw2_dbg__legend_004 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_004", 372014);
});

test("card esw2_dbg__legend_005 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_005", 372015);
});

test("card esw2_dbg__legend_006 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_006", 372016);
});

test("card esw2_dbg__legend_007 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_007", 372017);
});

test("card esw2_dbg__legend_008 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_008", 372018);
});

test("card esw2_dbg__legend_009 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_009", 372019);
});

test("card esw2_dbg__legend_010 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_010", 372020);
});

test("card esw2_dbg__legend_011 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_011", 372021);
});

test("card esw2_dbg__legend_012 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_012", 372022);
});

test("card esw2_dbg__legend_013 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_013", 372023);
});

test("card esw2_dbg__legend_014 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_014", 372024);
});

test("card esw2_dbg__legend_015 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_015", 372025);
});

test("card esw2_dbg__legend_016 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_016", 372026);
});

test("card esw2_dbg__legend_017 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_017", 372027);
});

test("card esw2_dbg__legend_018 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_018", 372028);
});

test("card esw2_dbg__legend_019 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_019", 372029);
});

test("card esw2_dbg__legend_020 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_020", 372030);
});

test("card esw2_dbg__legend_021 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_021", 372031);
});

test("card esw2_dbg__legend_022 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_022", 372032);
});

test("card esw2_dbg__legend_023 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_023", 372033);
});

test("card esw2_dbg__legend_024 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_024", 372034);
});

test("card esw2_dbg__legend_025 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_025", 372035);
});

test("card esw2_dbg__legend_026 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_026", 372036);
});

test("card esw2_dbg__legend_027 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_027", 372037);
});

test("card esw2_dbg__legend_028 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_028", 372038);
});

test("card esw2_dbg__legend_029 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_029", 372039);
});

test("card esw2_dbg__legend_030 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_030", 372040);
});

test("card esw2_dbg__legend_031 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_031", 372041);
});

test("card esw2_dbg__legend_032 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_032", 372042);
});

test("card esw2_dbg__legend_033 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__legend_033", 372043);
});

test("card esw2_dbg__limp_wand executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__limp_wand", 372044);
});

test("card esw2_dbg__main_001 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_001", 372045);
});

test("card esw2_dbg__main_002 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_002", 372046);
});

test("card esw2_dbg__main_003 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_003", 372047);
});

test("card esw2_dbg__main_004 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_004", 372048);
});

test("card esw2_dbg__main_005 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_005", 372049);
});

test("card esw2_dbg__main_006 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_006", 372050);
});

test("card esw2_dbg__main_007 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_007", 372051);
});

test("card esw2_dbg__main_008 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_008", 372052);
});

test("card esw2_dbg__main_009 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_009", 372053);
});

test("card esw2_dbg__main_010 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_010", 372054);
});

test("card esw2_dbg__main_011 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_011", 372055);
});

test("card esw2_dbg__main_012 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_012", 372056);
});

test("card esw2_dbg__main_013 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_013", 372057);
});

test("card esw2_dbg__main_014 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_014", 372058);
});

test("card esw2_dbg__main_015 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_015", 372059);
});

test("card esw2_dbg__main_016 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_016", 372060);
});

test("card esw2_dbg__main_017 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_017", 372061);
});

test("card esw2_dbg__main_018 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_018", 372062);
});

test("card esw2_dbg__main_019 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_019", 372063);
});

test("card esw2_dbg__main_020 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_020", 372064);
});

test("card esw2_dbg__main_021 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_021", 372065);
});

test("card esw2_dbg__main_022 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_022", 372066);
});

test("card esw2_dbg__main_023 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_023", 372067);
});

test("card esw2_dbg__main_024 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_024", 372068);
});

test("card esw2_dbg__main_025 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_025", 372069);
});

test("card esw2_dbg__main_026 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_026", 372070);
});

test("card esw2_dbg__main_027 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_027", 372071);
});

test("card esw2_dbg__main_028 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_028", 372072);
});

test("card esw2_dbg__main_029 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_029", 372073);
});

test("card esw2_dbg__main_030 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_030", 372074);
});

test("card esw2_dbg__main_031 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_031", 372075);
});

test("card esw2_dbg__main_032 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_032", 372076);
});

test("card esw2_dbg__main_033 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_033", 372077);
});

test("card esw2_dbg__main_034 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_034", 372078);
});

test("card esw2_dbg__main_035 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_035", 372079);
});

test("card esw2_dbg__main_036 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_036", 372080);
});

test("card esw2_dbg__main_037 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_037", 372081);
});

test("card esw2_dbg__main_038 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_038", 372082);
});

test("card esw2_dbg__main_039 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_039", 372083);
});

test("card esw2_dbg__main_040 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_040", 372084);
});

test("card esw2_dbg__main_041 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_041", 372085);
});

test("card esw2_dbg__main_042 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_042", 372086);
});

test("card esw2_dbg__main_043 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_043", 372087);
});

test("card esw2_dbg__main_044 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_044", 372088);
});

test("card esw2_dbg__main_045 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_045", 372089);
});

test("card esw2_dbg__main_046 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_046", 372090);
});

test("card esw2_dbg__main_047 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_047", 372091);
});

test("card esw2_dbg__main_048 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_048", 372092);
});

test("card esw2_dbg__main_049 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_049", 372093);
});

test("card esw2_dbg__main_050 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_050", 372094);
});

test("card esw2_dbg__main_051 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_051", 372095);
});

test("card esw2_dbg__main_052 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_052", 372096);
});

test("card esw2_dbg__main_053 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_053", 372097);
});

test("card esw2_dbg__main_054 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_054", 372098);
});

test("card esw2_dbg__main_055 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_055", 372099);
});

test("card esw2_dbg__main_056 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_056", 372100);
});

test("card esw2_dbg__main_057 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_057", 372101);
});

test("card esw2_dbg__main_058 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_058", 372102);
});

test("card esw2_dbg__main_059 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_059", 372103);
});

test("card esw2_dbg__main_060 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_060", 372104);
});

test("card esw2_dbg__main_061 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_061", 372105);
});

test("card esw2_dbg__main_062 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_062", 372106);
});

test("card esw2_dbg__main_063 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_063", 372107);
});

test("card esw2_dbg__main_064 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_064", 372108);
});

test("card esw2_dbg__main_065 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_065", 372109);
});

test("card esw2_dbg__main_066 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_066", 372110);
});

test("card esw2_dbg__main_067 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_067", 372111);
});

test("card esw2_dbg__main_068 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_068", 372112);
});

test("card esw2_dbg__main_069 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_069", 372113);
});

test("card esw2_dbg__main_070 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_070", 372114);
});

test("card esw2_dbg__main_071 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_071", 372115);
});

test("card esw2_dbg__main_072 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_072", 372116);
});

test("card esw2_dbg__main_073 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_073", 372117);
});

test("card esw2_dbg__main_074 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_074", 372118);
});

test("card esw2_dbg__main_075 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_075", 372119);
});

test("card esw2_dbg__main_076 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_076", 372120);
});

test("card esw2_dbg__main_077 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_077", 372121);
});

test("card esw2_dbg__main_078 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__main_078", 372122);
});

test("card esw2_dbg__mega_mayhem_001 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_001", 372123);
});

test("card esw2_dbg__mega_mayhem_002 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_002", 372124);
});

test("card esw2_dbg__mega_mayhem_003 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_003", 372125);
});

test("card esw2_dbg__mega_mayhem_004 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_004", 372126);
});

test("card esw2_dbg__mega_mayhem_005 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_005", 372127);
});

test("card esw2_dbg__mega_mayhem_006 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_006", 372128);
});

test("card esw2_dbg__mega_mayhem_007 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__mega_mayhem_007", 372129);
});

test("card esw2_dbg__starter_001 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__starter_001", 372130);
});

test("card esw2_dbg__starter_002 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__starter_002", 372131);
});

test("card esw2_dbg__starter_003 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__starter_003", 372132);
});

test("card esw2_dbg__starter_004 executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__starter_004", 372133);
});

test("card esw2_dbg__wild_magic executes through the public play action", () => {
  runCardSemanticEvidence("esw2_dbg__wild_magic", 372134);
});
