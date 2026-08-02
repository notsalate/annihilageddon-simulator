import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeGame,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RuntimeEffect,
} from "../src/index.js";
import {
  resolveDefenseWindow,
  type AttackDefenseServices,
} from "../src/engine/attack-defense.js";
import { createAttackAmountState } from "../src/engine/attack-resolution.js";
import {
  listPhysicalCardZoneDescriptors,
  registerPhysicalCardZoneDescriptorFactory,
  type PhysicalCardZoneDescriptor,
} from "../src/engine/control-ledger.js";
import {
  createAttackDefenseUsage,
  type DefenseAttackContext,
  type EffectSourceContext,
} from "../src/engine/effect-runtime-registry.js";
import { markCardInstanceId } from "../src/domain/types.js";
import { addFixtureDefenseCardToHand } from "./helpers/defense-fixtures.js";

const rootDir = process.cwd();
const rollbackBranchEffects: RuntimeEffect[] = [
  { effectId: "add_power", timing: "onDefense", amount: 1 },
];
const playerZoneSuffixes = [
  "deck",
  "hand",
  "discard",
  "playedThisTurn",
  "permanents",
  "unboughtFamiliar",
] as const;
const commonZoneNames = [
  "mainMarket",
  "legendMarket",
  "mainDeck",
  "legendDeck",
  "wildMagicStack",
  "limpWandStack",
  "destroyedPile",
  "destroyedMayhem",
  "destroyedMegaMayhem",
] as const;

test("failed defense branch restores committed payment, events, usage, and RNG", () => {
  const state = initializeGame({ rootDir, seed: 47505 });
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  defender.discard = [];
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf",
    {
      costs: [
        { costId: "spend_chips", amount: 2 },
        { costId: "discard_other_hand_card", amount: 1 },
        { costId: "pay_life", amount: 2 },
      ],
      branchEffects: rollbackBranchEffects,
    }
  );
  const paymentCard = defender.deck.shift();
  assert.ok(paymentCard);
  defender.hand.push(paymentCard);
  defender.chips = 5;
  defender.life.current = 8;
  const attack = redirectableAttack(attacker);
  const zoneMembershipBefore = snapshotZoneMembership(state);
  const eventLogBefore = structuredClone(state.eventLog);
  const expectedRng = state.rng.fork();
  const defendedPlayerIdsBefore = [...attack.defenseUsage.defendedPlayerIds];
  const usedDefenseCardInstanceIdsBefore = [
    ...attack.defenseUsage.usedDefenseCardInstanceIds,
  ];

  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find(
        (choice) =>
          choice.choiceKind === "defense" && choice.card === defenseCard
      );
    },
    executeDefenseEffects(branchState, player) {
      assert.equal(player.chips, 3);
      assert.equal(player.life.current, 6);
      assert.equal(player.discard.includes(paymentCard), true);
      assert.equal(
        branchState.eventLog.filter((event) => event.type === "defenseCostPaid")
          .length,
        3
      );
      branchState.rng.next();
      player.chips += 11;
      return { ok: false, error: "fixture paid branch failure" };
    },
  };

  const result = resolveDefenseWindow(state, defender, attack, services);

  assert.deepEqual(result, {
    ok: false,
    error: "fixture paid branch failure",
  });
  assert.equal(defender.chips, 5);
  assert.equal(defender.life.current, 8);
  assert.deepEqual(snapshotZoneMembership(state), zoneMembershipBefore);
  assert.deepEqual(state.eventLog, eventLogBefore);
  assert.equal(state.rng.next(), expectedRng.next());
  assert.deepEqual(
    [...attack.defenseUsage.defendedPlayerIds],
    defendedPlayerIdsBefore
  );
  assert.deepEqual(
    [...attack.defenseUsage.usedDefenseCardInstanceIds],
    usedDefenseCardInstanceIdsBefore
  );
});

test("declining defense avoids rollback snapshot and preserves observable state and RNG", () => {
  const state = createScenario(47500);
  const control = createScenario(47500);
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);

  const originalFork = state.rng.fork.bind(state.rng);
  let forkCalls = 0;
  state.rng.fork = () => {
    forkCalls += 1;
    return originalFork();
  };
  let defenseEffectCalls = 0;
  let redirectCalls = 0;
  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find((choice) => choice.choiceId === "decline");
    },
    executeDefenseEffects() {
      defenseEffectCalls += 1;
      return { ok: true };
    },
  };

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker),
    services,
    () => {
      redirectCalls += 1;
      throw new Error("decline must not redirect");
    }
  );

  assert.deepEqual(result, { ok: true, avoided: false });
  assert.equal(forkCalls, 0);
  assert.equal(defenseEffectCalls, 0);
  assert.equal(redirectCalls, 0);
  assert.equal(state.activePlayerId, control.activePlayerId);
  assert.deepEqual(state.turn, control.turn);
  assert.deepEqual(state.players, control.players);
  assert.deepEqual(state.common, control.common);
  assert.deepEqual(state.eventLog, control.eventLog);
  assert.deepEqual(state.cardDefinitions, control.cardDefinitions);
  assert.equal(state.rng.next(), control.rng.next());
});

test("failed defense branches restore membership and mutable cards in every physical zone", async (t) => {
  const inventoryState = createRollbackScenario(47510).state;
  const descriptors = listPhysicalCardZoneDescriptors(inventoryState);
  const requiredZoneNames = [
    ...inventoryState.players.flatMap((player) =>
      playerZoneSuffixes.map((suffix) => `${player.playerId}.${suffix}`)
    ),
    ...commonZoneNames,
  ];
  const descriptorZoneNames = descriptors.map(
    (descriptor) => descriptor.zoneName
  );

  assert.deepEqual(descriptorZoneNames, requiredZoneNames);
  assert.equal(new Set(descriptorZoneNames).size, descriptorZoneNames.length);

  for (const [index, zoneName] of descriptorZoneNames.entries()) {
    await t.test(zoneName, () => {
      const { state, attacker, defender, defenseCard } = createRollbackScenario(
        47520 + index
      );
      const attack = redirectableAttack(attacker);
      const preexistingUsageCardId = markCardInstanceId(
        `fixture-preexisting-defense-usage-${index}`
      );
      attack.defenseUsage.defendedPlayerIds.add(attacker.playerId);
      attack.defenseUsage.usedDefenseCardInstanceIds.add(
        preexistingUsageCardId
      );

      const targetDescriptor = mustGetDescriptor(state, zoneName);
      const targetCard =
        zoneName === `${defender.playerId}.hand`
          ? targetDescriptor
              .read()
              .find((card) => card.instanceId !== defenseCard.instanceId)
          : targetDescriptor.read()[0];
      assert.ok(targetCard);
      const targetCardBefore = {
        instanceId: targetCard.instanceId,
        definitionId: targetCard.definitionId,
        ownerId: targetCard.ownerId,
        marketChips: targetCard.marketChips,
      };
      const membershipBefore = snapshotZoneMembership(state);
      const eventLogBefore = structuredClone(state.eventLog);
      const expectedRng = state.rng.fork();
      const defendedPlayerIdsBefore = [
        ...attack.defenseUsage.defendedPlayerIds,
      ];
      const usedDefenseCardInstanceIdsBefore = [
        ...attack.defenseUsage.usedDefenseCardInstanceIds,
      ];

      const services: AttackDefenseServices = {
        chooseEffectChoice(_state, _player, _source, _effectId, choices) {
          return choices.find(
            (choice) =>
              choice.choiceKind === "defense" && choice.card === defenseCard
          );
        },
        executeDefenseEffects(branchState) {
          const descriptor = mustGetDescriptor(branchState, zoneName);
          const cards = descriptor.read();
          const card = cards[0];
          assert.ok(card);
          card.ownerId =
            card.ownerId === "common" ? attacker.playerId : "common";
          card.marketChips += 17;
          descriptor.replace([
            {
              instanceId: markCardInstanceId(
                `fixture-branch-replacement-${index}`
              ),
              definitionId: card.definitionId,
              ownerId: descriptor.expectedOwnerId ?? attacker.playerId,
              marketChips: 99,
            },
          ]);
          branchState.rng.next();
          const latestEvent = branchState.eventLog.at(-1);
          assert.ok(latestEvent);
          branchState.eventLog.push(structuredClone(latestEvent));
          return { ok: false, error: `fixture branch failure in ${zoneName}` };
        },
      };

      const result = resolveDefenseWindow(state, defender, attack, services);

      assert.deepEqual(result, {
        ok: false,
        error: `fixture branch failure in ${zoneName}`,
      });
      assert.deepEqual(snapshotZoneMembership(state), membershipBefore);
      assert.equal(targetCard.instanceId, targetCardBefore.instanceId);
      assert.equal(targetCard.definitionId, targetCardBefore.definitionId);
      assert.equal(targetCard.ownerId, targetCardBefore.ownerId);
      assert.equal(targetCard.marketChips, targetCardBefore.marketChips);
      assert.equal(state.rng.next(), expectedRng.next());
      assert.deepEqual(state.eventLog, eventLogBefore);
      assert.deepEqual(
        [...attack.defenseUsage.defendedPlayerIds],
        defendedPlayerIdsBefore
      );
      assert.deepEqual(
        [...attack.defenseUsage.usedDefenseCardInstanceIds],
        usedDefenseCardInstanceIdsBefore
      );
    });
  }
});

test("failed defense branch restores an extension zone whose storage mutates in place", () => {
  const { state, attacker, defender, defenseCard } =
    createRollbackScenario(47540);
  const originalCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-extension-original-card"),
    definitionId: defenseCard.definitionId,
    ownerId: attacker.playerId,
    marketChips: 4,
  };
  const replacementCard: CardInstance = {
    instanceId: markCardInstanceId("fixture-extension-replacement-card"),
    definitionId: defenseCard.definitionId,
    ownerId: attacker.playerId,
    marketChips: 9,
  };
  const extensionCards = [originalCard];
  registerPhysicalCardZoneDescriptorFactory(
    state,
    Object.assign(
      () => ({
        cardinality: "many" as const,
        scoringEligible: false,
        read: () => extensionCards,
        replace: (cards: readonly CardInstance[]) => {
          extensionCards.splice(0, extensionCards.length, ...cards);
        },
      }),
      {
        identity: "fixture-defense-rollback-extension-zone",
        zoneName: "fixture.extension-zone",
      }
    )
  );

  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find(
        (choice) =>
          choice.choiceKind === "defense" && choice.card === defenseCard
      );
    },
    executeDefenseEffects(branchState) {
      mustGetDescriptor(branchState, "fixture.extension-zone").replace([
        replacementCard,
      ]);
      return { ok: false, error: "fixture extension branch failure" };
    },
  };

  const result = resolveDefenseWindow(
    state,
    defender,
    redirectableAttack(attacker),
    services
  );

  assert.deepEqual(result, {
    ok: false,
    error: "fixture extension branch failure",
  });
  assert.deepEqual(extensionCards, [originalCard]);
});

test("Defense commits a card from an extension zone and restores that zone after a failed branch", () => {
  const { state, attacker, defender, defenseCard } =
    createRollbackScenario(47550);
  defender.hand = defender.hand.filter(
    (card) => card.instanceId !== defenseCard.instanceId
  );
  const extensionCards = [defenseCard];
  registerPhysicalCardZoneDescriptorFactory(
    state,
    Object.assign(
      () => ({
        cardinality: "many" as const,
        scoringEligible: false,
        expectedOwnerId: defender.playerId,
        read: () => extensionCards,
        replace: (cards: readonly CardInstance[]) => {
          extensionCards.splice(0, extensionCards.length, ...cards);
        },
      }),
      {
        identity: "fixture-defense-source-extension-zone",
        zoneName: "fixture.defense-source-extension-zone",
      }
    )
  );

  const services: AttackDefenseServices = {
    chooseEffectChoice(_state, _player, _source, _effectId, choices) {
      return choices.find(
        (choice) =>
          choice.choiceKind === "defense" && choice.card === defenseCard
      );
    },
    executeDefenseEffects(branchState, player) {
      assert.deepEqual(extensionCards, []);
      assert.equal(player.discard.at(-1), defenseCard);
      assert.equal(
        branchState.eventLog.some(
          (event) =>
            event.type === "defenseCardMoved" &&
            event.cardInstanceId === defenseCard.instanceId
        ),
        true
      );
      return { ok: false, error: "fixture extension defense branch failure" };
    },
  };

  const attack = redirectableAttack(attacker);
  const result = resolveDefenseWindow(state, defender, attack, services);

  assert.deepEqual(result, {
    ok: false,
    error: "fixture extension defense branch failure",
  });
  assert.deepEqual(extensionCards, [defenseCard]);
  assert.equal(defender.discard.includes(defenseCard), false);
  assert.deepEqual([...attack.defenseUsage.defendedPlayerIds], []);
  assert.deepEqual([...attack.defenseUsage.usedDefenseCardInstanceIds], []);
});

function createScenario(seed: number): GameState {
  const state = initializeGame({ rootDir, seed });
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  attacker.hand = [];
  defender.hand = [];
  defender.discard = [];
  attacker.wizardProperties = [];
  defender.wizardProperties = [];
  addFixtureDefenseCardToHand(state, defender, "discardSelf", {
    costs: [{ costId: "spend_chips", amount: 1 }],
  });
  defender.chips = 3;
  return state;
}

function createRollbackScenario(seed: number): {
  state: GameState;
  attacker: PlayerState;
  defender: PlayerState;
  defenseCard: CardInstance;
} {
  const state = initializeGame({ rootDir, seed });
  const attacker = mustGetPlayer(state, 0);
  const defender = mustGetPlayer(state, 1);
  state.activePlayerId = attacker.playerId;
  defender.hand = [];
  const defenseCard = addFixtureDefenseCardToHand(
    state,
    defender,
    "discardSelf",
    { branchEffects: rollbackBranchEffects }
  );
  const branchHandCard = defender.deck.shift();
  assert.ok(branchHandCard);
  defender.hand.push(branchHandCard);

  for (const [index, descriptor] of listPhysicalCardZoneDescriptors(
    state
  ).entries()) {
    if (descriptor.read().length > 0) {
      continue;
    }
    descriptor.replace([
      {
        instanceId: markCardInstanceId(`fixture-zone-card-${seed}-${index}`),
        definitionId: defenseCard.definitionId,
        ownerId: descriptor.expectedOwnerId ?? attacker.playerId,
        marketChips: index,
      },
    ]);
  }

  return { state, attacker, defender, defenseCard };
}

function redirectableAttack(attacker: PlayerState): DefenseAttackContext {
  const source = fixtureSource(attacker);
  return {
    kind: "redirectable",
    attackingPlayer: attacker,
    amountComponents: createAttackAmountState(2),
    effectId: "attack_damage",
    source,
    originalSource: source,
    defenseUsage: createAttackDefenseUsage(),
  };
}

function fixtureSource(player: PlayerState): EffectSourceContext {
  return {
    sourceType: "card",
    runtimeMode: "fixture",
    playerId: player.playerId,
    cardInstanceId: "fixture-decline-snapshot-source",
    definitionId: "fixture-decline-snapshot-source",
  };
}

function mustGetDescriptor(
  state: GameState,
  zoneName: string
): PhysicalCardZoneDescriptor {
  const descriptor = listPhysicalCardZoneDescriptors(state).find(
    (candidate) => candidate.zoneName === zoneName
  );
  assert.ok(descriptor);
  return descriptor;
}

function snapshotZoneMembership(
  state: GameState
): ReadonlyMap<string, readonly CardInstance["instanceId"][]> {
  return new Map(
    listPhysicalCardZoneDescriptors(state).map((descriptor) => [
      descriptor.zoneName,
      descriptor.read().map((card) => card.instanceId),
    ])
  );
}

function mustGetPlayer(state: GameState, index: number): PlayerState {
  const player = state.players[index];
  assert.ok(player);
  return player;
}
