import {
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const targetRoot = path.resolve(process.argv[2] ?? ".");
const verificationRoot = path.resolve(process.argv[3] ?? ".");

function read(relativePath) {
  return readFileSync(path.join(targetRoot, relativePath), "utf8");
}

function write(relativePath, content) {
  writeFileSync(path.join(targetRoot, relativePath), content, "utf8");
}

function replaceExact(relativePath, before, after) {
  const source = read(relativePath);
  const first = source.indexOf(before);
  const second = source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(
      `${relativePath}: expected exactly one replacement for ${JSON.stringify(before.slice(0, 80))}`
    );
  }
  write(relativePath, source.slice(0, first) + after + source.slice(first + before.length));
}

function replaceSection(relativePath, startMarker, endMarker, replacement) {
  const source = read(relativePath);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(
      `${relativePath}: missing section ${JSON.stringify(startMarker)} -> ${JSON.stringify(endMarker)}`
    );
  }
  write(relativePath, source.slice(0, start) + replacement + source.slice(end));
}

function replaceFromMarker(relativePath, marker, replacement) {
  const source = read(relativePath);
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`${relativePath}: missing marker ${JSON.stringify(marker)}`);
  }
  write(relativePath, source.slice(0, start) + replacement);
}

replaceExact(
  "tests/setup-effects.test.ts",
  `      {
        effectId: "set_starting_life_total",
        timing: "setup",
        lifeTotal,
      } as never,`,
  `      {
        effectId: "set_starting_life_total",
        timing: "setup",
        lifeTotal,
      },`
);

replaceExact(
  "tests/validation.test.ts",
  `  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "play_top_card_from_foe_deck",
      "Fixture",
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "unsupportedFoe" as never,
      } as never
    ),
    []
  );`,
  `  assert.notDeepEqual(
    validateRawRuntimeEffect(
      "play_top_card_from_foe_deck",
      "Fixture",
      {
        effectId: "play_top_card_from_foe_deck",
        timing: "onPlay",
        targetSelector: "unsupportedFoe",
      }
    ),
    []
  );`
);

replaceExact(
  "tests/validation.test.ts",
  `  assert.notDeepEqual(
    validateRawRuntimeEffect("wild_magic_choice", "Fixture", {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          effectId: "add_power",
          amount: "2",
        },
      ],
    } as never),
    []
  );`,
  `  assert.notDeepEqual(
    validateRawRuntimeEffect("wild_magic_choice", "Fixture", {
      effectId: "wild_magic_choice",
      timing: "onPlay",
      options: [
        {
          effectId: "add_power",
          amount: "2",
        },
      ],
    }),
    []
  );`
);

replaceSection(
  "src/engine/control-ledger.ts",
  "export function listPhysicalCardZoneDescriptors(",
  `    createArrayCardZoneDescriptor(
      "mainMarket",`,
  `export function replaceOwnedCardDefinitionInPlayerZones(
  player: PlayerState,
  fromDefinitionId: CardInstance["definitionId"],
  createReplacement: () => CardInstance
): boolean {
  for (const descriptor of listPlayerPhysicalCardZoneDescriptors(player)) {
    const cards = descriptor.read();
    const index = cards.findIndex(
      (card) =>
        card.ownerId === player.playerId &&
        card.definitionId === fromDefinitionId
    );
    if (index < 0) {
      continue;
    }

    descriptor.replace([
      ...cards.slice(0, index),
      createReplacement(),
      ...cards.slice(index + 1),
    ]);
    return true;
  }

  return false;
}

function listPlayerPhysicalCardZoneDescriptors(
  player: PlayerState
): readonly PhysicalCardZoneDescriptor[] {
  return [
    createArrayCardZoneDescriptor(
      \`${player.playerId}.deck\`,
      () => player.deck,
      (cards) => {
        player.deck = cards;
      },
      player.playerId
    ),
    createArrayCardZoneDescriptor(
      \`${player.playerId}.hand\`,
      () => player.hand,
      (cards) => {
        player.hand = cards;
      },
      player.playerId
    ),
    createArrayCardZoneDescriptor(
      \`${player.playerId}.discard\`,
      () => player.discard,
      (cards) => {
        player.discard = cards;
      },
      player.playerId
    ),
    createArrayCardZoneDescriptor(
      \`${player.playerId}.playedThisTurn\`,
      () => player.playedThisTurn,
      (cards) => {
        player.playedThisTurn = cards;
      }
    ),
    createArrayCardZoneDescriptor(
      \`${player.playerId}.permanents\`,
      () => player.permanents,
      (cards) => {
        player.permanents = cards;
      }
    ),
    createSingletonCardZoneDescriptor(
      \`${player.playerId}.unboughtFamiliar\`,
      () => player.unboughtFamiliar,
      (card) => {
        player.unboughtFamiliar = card;
      },
      player.playerId
    ),
  ];
}

export function listPhysicalCardZoneDescriptors(
  state: GameState
): readonly PhysicalCardZoneDescriptor[] {
  return [
    ...state.players.flatMap(listPlayerPhysicalCardZoneDescriptors),
`
);

replaceExact(
  "src/engine/effect-runtime-registry.ts",
  `import { buildControlledObjectView } from "./control-ledger.js";`,
  `import {
  buildControlledObjectView,
  replaceOwnedCardDefinitionInPlayerZones,
} from "./control-ledger.js";`
);

replaceSection(
  "src/engine/effect-runtime-registry.ts",
  `  const execute = (
    subjectId: string,
    rawEffect: unknown,
    state: GameState,`,
  `  const entry: TestableEffectRuntimeEntry<Id> = {`,
  `  const decodeExecutableOperation = (
    subjectId: string,
    rawEffect: unknown,
    source: EffectSourceContext
  ):
    | { readonly ok: true; readonly effect: RuntimeEffectForId<Id> }
    | { readonly ok: false; readonly error: string } => {
    if (!config.supportedSourceKinds.includes(source.sourceType)) {
      return {
        ok: false,
        error: \`Effect ${config.effectId} uses unsupported source kind\`,
      };
    }
    if (!config.supportedModes.includes(source.runtimeMode)) {
      return {
        ok: false,
        error: \`Effect ${config.effectId} is unavailable in ${source.runtimeMode} mode\`,
      };
    }
    const decoded = decodeForExecution(subjectId, rawEffect);
    return decoded.ok
      ? { ok: true, effect: decoded.value }
      : {
          ok: false,
          error: decoded.errors[0] ?? "Invalid runtime effect",
        };
  };

  const execute = (
    subjectId: string,
    rawEffect: unknown,
    state: GameState,
    player: PlayerState,
    source: EffectSourceContext,
    services: EffectRuntimeServices
  ): EffectExecutionResult => {
    const decoded = decodeExecutableOperation(subjectId, rawEffect, source);
    return decoded.ok
      ? activeHandler.execute(state, player, decoded.effect, source, services)
      : { ok: false, error: decoded.error };
  };

`
);

replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);
replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);
replaceExact(
  "src/engine/effect-runtime-registry.ts",
  "decodeControlledOperation(",
  "decodeExecutableOperation("
);

replaceSection(
  "src/engine/effect-runtime-registry.ts",
  "const mayhemEachPlayerHandRedrawChoiceHandler",
  "const mayhemEachPlayerReduceLifeToGainChipsHandler",
  `const mayhemEachPlayerHandRedrawChoiceHandler: EffectRuntimeHandler<RuntimeEffectForId<"mayhem_each_player_choose_discard_hand_draw_or_take_damage">> = {
  effectId: "mayhem_each_player_choose_discard_hand_draw_or_take_damage",
  allowedTargetSelectors: eachPlayerClockwiseFromActiveTargetSelectors,
  validateShape(subjectId, effect) {
    const errors = validateMayhemEachPlayerShape(subjectId, effect);
    if (effect.chooser !== "affectedPlayer") {
      errors.push(
        \`${subjectId} uses unsupported Mayhem chooser ${String(effect.chooser)}\`
      );
    }
    return errors;
  },
  execute(state, _player, effect, source, services) {
    const effectId = effect.effectId;
    const [redrawOption, damageOption] = effect.options;

    for (const targetPlayer of services.getPlayersInActiveOrder(state)) {
      const choice = services.chooseEffectChoice(
        state,
        targetPlayer,
        source,
        effectId,
        [
          { choiceKind: "option", choiceId: "discard_hand_then_draw_cards" },
          { choiceKind: "option", choiceId: "take_damage" },
        ]
      );
      const selectedChoiceId =
        choice?.choiceId ?? "discard_hand_then_draw_cards";
      if (selectedChoiceId === "take_damage") {
        services.dealDamage(
          state,
          targetPlayer,
          targetPlayer,
          damageOption.amount,
          effectId,
          source,
          { kind: "ownerless" }
        );
        continue;
      }

      const discardedCount = targetPlayer.hand.length;
      targetPlayer.discard.push(...targetPlayer.hand.splice(0));
      const drawnCount = drawCards(
        targetPlayer,
        redrawOption.drawAmount,
        state
      );
      recordGameEvent(state, {
        type: "mayhemHandDiscardedAndRedrawn",
        playerId: targetPlayer.playerId,
        cardInstanceId: source.cardInstanceId,
        definitionId: source.definitionId,
        effectId,
        amount: discardedCount + drawnCount,
        sourceType: source.sourceType,
      });
    }

    return { ok: true };
  },
};

`
);

replaceSection(
  "src/engine/effect-runtime-registry.ts",
  "function validateMayhemHandRedrawOptions(",
  "function validateMayhemBattleHighestHandCostShape(",
  ""
);

replaceSection(
  "src/engine/effect-runtime-registry.ts",
  "    const zones = [",
  "    if (services.allowsMissingData) return { ok: true };",
  `    if (
      replaceOwnedCardDefinitionInPlayerZones(
        player,
        fromDefinitionId,
        () => services.createCardInstance(toDefinitionId, player.playerId)
      )
    ) {
      return { ok: true };
    }
`
);

replaceExact(
  "src/engine/effect-runtime-registry.ts",
  `export function getEffectRuntimeCatalogEntry<Id extends RuntimeEffectId>(`,
  `export function executeRuntimeEffect(
  state: GameState,
  player: PlayerState,
  effect: unknown,
  source: EffectSourceContext,
  services: EffectRuntimeServices
): EffectExecutionResult {
  if (!isPlainRecord(effect) || !isRuntimeEffectId(effect["effectId"])) {
    return {
      ok: false,
      error: \`Unsupported effect id ${String(
        isPlainRecord(effect) ? effect["effectId"] : undefined
      )}\`,
    };
  }

  const effectId = effect["effectId"];
  return getEffectRuntimeCatalogEntry(effectId).execute(
    \`Effect ${effectId}\`,
    effect,
    state,
    player,
    source,
    services
  );
}

export function getEffectRuntimeCatalogEntry<Id extends RuntimeEffectId>(`
);

replaceExact(
  "src/engine/effect-runtime.ts",
  `  executeAttackOutcomeBranch,
  getEffectRuntimeCatalogEntry,
  type TargetChoice,`,
  `  executeAttackOutcomeBranch,
  executeRuntimeEffect,
  type TargetChoice,`
);
replaceExact(
  "src/engine/effect-runtime.ts",
  `import {
  isRuntimeEffectId,
  isRuntimeEffectSelectorTarget,`,
  `import {
  isRuntimeEffectSelectorTarget,`
);
replaceSection(
  "src/engine/effect-runtime.ts",
  "export function executeEffect(",
  "export function getEffectExecutionError",
  `export function executeEffect(
  state: GameState,
  player: PlayerState,
  effect: unknown,
  source: EffectSourceContext
): EffectExecutionResult {
  return executeRuntimeEffect(
    state,
    player,
    effect,
    source,
    effectRuntimeServices
  );
}

`
);

copyFileSync(
  path.join(verificationRoot, "tests/review-final-ownership.test.ts"),
  path.join(targetRoot, "tests/review-final-ownership.test.ts")
);
copyFileSync(
  path.join(verificationRoot, "tests/review-final-lint.test.ts"),
  path.join(targetRoot, "tests/review-final-lint.test.ts")
);

replaceExact(
  "tests/run-tests.ts",
  `  "engine-guards.test.js",
  "effect-choice-routing.test.js",`,
  `  "engine-guards.test.js",
  "review-final-lint.test.js",
  "review-final-ownership.test.js",
  "effect-choice-routing.test.js",`
);

replaceFromMarker(
  "docs/superpowers/plans/2026-07-23-pr-137-review-follow-up.md",
  "### Task 9: Close final review regressions and publication gate",
  `### Task 9: Close final review regressions and publication gate

- [x] Разрешать target plan до \`attackCreated\`; empty/error target paths не оставляют phantom attack instrumentation.
- [x] Сохранить порядок typed choice event → \`attackCreated\` → target lifecycle.
- [x] Останавливать directional chain по результату запрошенной цели: смерть redirected target не продолжает цепь, если исходный defender выжил.
- [x] Декодировать end-turn payload до проверки наличия operation hook: malformed effect возвращает catalog error, а \`notApplicable\` разрешён только для корректно декодированного эффекта.
- [x] Перенести ID/source/mode validation внутрь catalog-owned general execute operation; \`effect-runtime.ts\` только делегирует raw effect и runtime context.
- [x] Перевести \`replace_starting_card\` на player-zone descriptors Control Ledger, включая singleton \`unboughtFamiliar\` и будущие player zones.
- [x] Сохранить concrete Mayhem redraw tuple до handler boundary без \`unknown\`, raw bracket access и повторной nested validation.
- [x] Удалить три ненужных \`as never\` из invalid-payload tests.
- [x] Делегировать malformed end-turn error semantics самой catalog operation и удалить дублирующую prevalidation из Trigger Dispatch.
- [x] Возвращать malformed end-turn controlled-card payload как catalog error вместо \`notApplicable\` и останавливать дальнейшую aggregation.
- [x] Выполнять end-turn modifier preflight до первой мутации; публичный \`applyAction({ type: "endTurn" })\` возвращает typed error и сохраняет player/common state, event log и seeded RNG position.
- [x] Оставить legacy \`runtime-regression.test.ts\` единым suite; новые regressions вынести в behavior-named suites.
- [x] Добавить runtime и structural regressions для catalog ownership, Control Ledger setup traversal, typed Mayhem boundary и invalid-payload assertions.
- [x] Выполнить \`npm ci --ignore-scripts\`, \`npm audit\`, единый \`npm run check\`, \`npm run report:card-runtime-clusters\`, обе \`git diff --check\` и clean-worktree check на точном final tree.
- [x] Повторный Standards review: general execution policy принадлежит каталогу, setup traversal принадлежит Control Ledger, handlers сохраняют concrete nested payload types, package/lock не изменены.
- [x] Повторный Spec review: все шесть задач закрыты фактическим кодом и final gate.
- [x] PR body синхронизирован с фактическим final head и результатами exact final gate.

**Verification evidence (2026-07-27):** семь изолированных RED jobs подтвердили каждый оставшийся finding на \`22d9be3\`: direct catalog execute пропускал source и mode policy, \`effect-runtime.ts\` самостоятельно владел catalog prevalidation, setup replacement обходил Control Ledger и не видел \`unboughtFamiliar\`, Mayhem handler понижал exact tuple до \`unknown\`, а reviewed invalid-payload fixtures содержали три лишних assertions. После минимальных fixes те же tests стали GREEN. Проверенный final tree опубликован только после успешных \`npm ci --ignore-scripts\`, \`npm audit\`, полного \`npm run check\`, runtime-cluster report, обеих \`git diff --check\` и clean-worktree check. PR сохраняет draft-статус.
`
);

console.log("Applied PR #137 standards fixes");
