# PR #137 Issue 08 Public Entrypoint Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Защитить корневой API и production CLI от случайной публикации decoder и низкоуровневого Catalog с помощью конечной проверки статического TypeScript-графа.

**Architecture:** Общий анализатор строит `ts.Program`, разрешает символы через `TypeChecker` и возвращает структурированные нарушения заданной политики. `check-engine-typed-access.mjs` остаётся точкой запуска и передаёт проектную политику: защищённые символы, доверенные адаптеры, разрешённые импортеры и production entrypoints.

**Tech Stack:** TypeScript Compiler API из текущей зависимости проекта, Node.js ESM, `node:test`, PowerShell/npm.

## Global Constraints

- Модель угроз ограничена случайными и агентскими регрессиями статического TypeScript-графа.
- Не анализировать callbacks, containers, reflection, `bind`, closures, классы, heap и произвольные мутации.
- Не добавлять, не удалять и не обновлять зависимости.
- Decoder как значение разрешён только в `src/engine/data.ts` и `src/engine/effect-runtime-registry.ts`.
- Type-only import/export не считается исполняемой утечкой.
- Использовать реальные правила разрешения модулей из `tsconfig.json`; не писать отдельный NodeNext resolver.
- Каждый логический этап завершать AIC-коммитом с фактически выполненными проверками.

---

## File Map

- Create: `scripts/lib/check-protected-public-entrypoints.mjs` — общий анализатор TypeScript-графа без проектных имён.
- Create: `scripts/lib/check-protected-public-entrypoints.d.mts` — типовой контракт анализатора для TypeScript-тестов.
- Modify: `scripts/check-engine-typed-access.mjs` — политика Krutagidon, синхронизация CLI и вызов анализатора.
- Create: `tests/public-entrypoint-guard.test.ts` — конечная положительная и отрицательная fixture-матрица issue 08.
- Modify: `tests/run-tests.ts` — регистрация нового набора тестов.
- Modify: `src/AGENTS.md` — только если существующий контракт перечисляет публичный guard и требует уточнения конечной модели угроз.
- Modify: `src/engine/AGENTS.md` — только если существующий текст требует анализа произвольного потока значений; заменить его статическим контрактом.
- Modify: `src/cli/AGENTS.md` — только если в текущем тексте отсутствует обязанность зарегистрировать новую production CLI в guard.
- Modify: `docs/superpowers/plans/2026-07-31-pr137-issue-08-public-entrypoint-guard.md` — отмечать выполненные шаги.

---

### Task 1: Общий анализатор статической публичной поверхности

**Files:**

- Create: `scripts/lib/check-protected-public-entrypoints.mjs`
- Create: `scripts/lib/check-protected-public-entrypoints.d.mts`
- Create: `tests/public-entrypoint-guard.test.ts`
- Modify: `tests/run-tests.ts`

**Interfaces:**

- Consumes:

```javascript
{
  rootDir: string,
  tsconfigPath: string,
  entrypoints: readonly string[],
  protectedModules: ReadonlyMap<string, "*" | ReadonlySet<string>>,
  approvedValueImporters: ReadonlyMap<string, ReadonlySet<string>>,
  trustedAdapterValueExports: ReadonlyMap<string, ReadonlySet<string>>
}
```

- Produces:

```javascript
/**
 * @returns {readonly {
 *   kind: "configuration" | "import-edge" | "public-export";
 *   file: string;
 *   exportedName?: string;
 *   originFile?: string;
 *   originName?: string;
 *   message: string;
 * }[]}
 */
export function checkProtectedPublicEntrypoints(options) {}
```

- В `check-protected-public-entrypoints.d.mts` объявить те же option и violation
  types без `any`, чтобы TypeScript-тесты вызывали анализатор напрямую.

- [x] **Step 1: Зарегистрировать новый набор тестов**

Добавить `"public-entrypoint-guard.test.js"` сразу после
`"engine-guards.test.js"` в `tests/run-tests.ts`.

- [x] **Step 2: Создать минимальный fixture-проект**

В `tests/public-entrypoint-guard.test.ts` создать helper, который записывает
минимальный `tsconfig.json`, `package.json` и переданные TypeScript-файлы:

```typescript
function createPublicEntrypointFixture(
  files: Record<string, string>,
  cliEntrypoints: readonly string[] = []
): string {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), "public-entrypoint-guard-")
  );
  writeFixtureFiles(fixtureRoot, {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
        skipLibCheck: true,
      },
      include: ["src/**/*.ts"],
    }),
    "package.json": JSON.stringify({
      private: true,
      type: "module",
      scripts: Object.fromEntries(
        cliEntrypoints.map((entrypoint, index) => [
          `fixture:${index}`,
          `node dist/${entrypoint.replace(/\.ts$/u, ".js")}`,
        ])
      ),
    }),
    ...files,
  });
  return fixtureRoot;
}
```

Тесты Task 1 импортируют общий анализатор напрямую:

```typescript
import { checkProtectedPublicEntrypoints } from "../scripts/lib/check-protected-public-entrypoints.mjs";

function analyzeFixture(fixtureRoot: string) {
  return checkProtectedPublicEntrypoints({
    rootDir: fixtureRoot,
    tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    entrypoints: ["src/index.ts"],
    protectedModules: new Map([["src/engine/runtime-effect-decoder.ts", "*"]]),
    approvedValueImporters: new Map(),
    trustedAdapterValueExports: new Map(),
  });
}
```

- [x] **Step 3: Написать первые падающие тесты канонических символов**

Добавить отдельные тесты, которые ожидают status `1` и диагностику с
entrypoint, публичным именем и origin:

```typescript
test("public guard rejects direct and aliased protected exports", () => {
  const fixture = createPublicEntrypointFixture({
    "src/engine/runtime-effect-decoder.ts":
      "export function decodeRuntimeEffect() { return {}; }\n",
    "src/index.ts": `
      export {
        decodeRuntimeEffect as unsafeDecoder
      } from "./engine/runtime-effect-decoder.js";
    `,
  });
  const violations = analyzeFixture(fixture);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, "public-export");
  assert.equal(violations[0]?.file, "src/index.ts");
  assert.equal(violations[0]?.exportedName, "unsafeDecoder");
  assert.equal(
    `${violations[0]?.originFile}#${violations[0]?.originName}`,
    "src/engine/runtime-effect-decoder.ts#decodeRuntimeEffect"
  );
});
```

Добавить аналогичные fixtures для:

- транзитного named re-export;
- `export *`;
- default export;
- `export * as decoder`;
- `NamespaceImport` со статическим свойством;
- цикла из двух barrel-модулей;
- одноимённого независимого локального символа, который должен пройти;
- type-only re-export `DecodeResult`, который должен пройти.

- [x] **Step 4: Запустить тесты и подтвердить ожидаемое падение**

Run:

```powershell
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js
```

Expected: compilation либо новые assertions падают, потому что анализатор ещё
не существует. Положительные fixtures не должны задаваться как доказательство
до появления анализатора.

- [x] **Step 5: Реализовать загрузку TypeScript Program**

В `scripts/lib/check-protected-public-entrypoints.mjs` реализовать:

```javascript
export function checkProtectedPublicEntrypoints(options) {
  const config = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);
  if (config.error !== undefined) {
    return [toConfigurationViolation(config.error, options.rootDir)];
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(options.tsconfigPath)
  );
  if (parsed.errors.length > 0) {
    return parsed.errors.map((diagnostic) =>
      toConfigurationViolation(diagnostic, options.rootDir)
    );
  }
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  return analyzeProgram(program, options);
}
```

Нормализовать пути к виду `src/...` через `path.relative(rootDir, fileName)`
и `replaceAll("\\", "/")`. Отсутствующий entrypoint либо защищённый модуль
должен возвращать `configuration` violation, а не молча пропускаться.

- [x] **Step 6: Реализовать разрешение alias и namespace**

Использовать только публичное TypeScript API:

```javascript
function resolveAlias(checker, symbol) {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function collectExportedValues(checker, moduleSymbol, visited = new Set()) {
  const resolvedModule = resolveAlias(checker, moduleSymbol);
  if (visited.has(resolvedModule)) return [];
  visited.add(resolvedModule);
  return checker.getExportsOfModule(resolvedModule).flatMap((exported) => {
    const origin = resolveAlias(checker, exported);
    if ((origin.flags & ts.SymbolFlags.ValueModule) !== 0) {
      return [
        { exportedName: exported.getName(), origin },
        ...collectExportedValues(checker, origin, visited),
      ];
    }
    return (origin.flags & ts.SymbolFlags.Value) !== 0
      ? [{ exportedName: exported.getName(), origin }]
      : [];
  });
}
```

Для origin брать value declaration, иначе первую declaration. Type-only
символы исключать по `SymbolFlags.Value`; namespace раскрывать рекурсивно;
циклы останавливать по identity символа.

- [x] **Step 7: Реализовать import-edge и trusted-adapter проверки**

Для каждого `ImportDeclaration` статически разрешить module symbol через
`checker.getSymbolAtLocation(statement.moduleSpecifier)`. Для named,
default и namespace import определить канонические value-symbols.

Проверка должна:

```javascript
if (
  isProtectedValue(origin, policy) &&
  !isApprovedValueImporter(importerPath, originModulePath, originName, policy)
) {
  violations.push(importEdgeViolation(...));
}
```

Если публичный экспорт происходит из `trustedAdapterValueExports`, разрешать
только имена, перечисленные для этого адаптера. Новый локальный alias или
wrapper получает собственный символ и потому отклоняется закрытым списком.

- [x] **Step 8: Запустить новый набор тестов**

Run:

```powershell
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js
```

Expected: все fixtures проходят; отрицательные завершают guard status `1`,
положительные — status `0`.

- [x] **Step 9: Коммит Task 1**

Stage только четыре файла Task 1 и создать AIC-коммит:

```text
feat(architecture/runtime): добавить анализ защищённых публичных экспортов

Why:
Публичные точки входа могли транзитно раскрыть decoder или низкоуровневый Catalog.

Changed:
Добавлен анализ статического TypeScript-графа с разрешением aliases, namespace и циклов.
Добавлена конечная fixture-матрица прямых и транзитных реэкспортов.

Validation:
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js

Risk:
Риск ограничен архитектурным guard; поведение движка не изменяется.

Task: PR137-R3-08/task-1
Generated-By: coder gpt-5.6
```

---

### Task 2: Проектная политика decoder, Catalog и production CLI

**Files:**

- Modify: `scripts/check-engine-typed-access.mjs`
- Modify: `tests/public-entrypoint-guard.test.ts`

**Interfaces:**

- Consumes: `checkProtectedPublicEntrypoints(options)` из Task 1.
- Produces: `publicEntrypointPolicy` и форматирование нарушений в существующий
  `effectRuntimeCatalogBoundaryViolations`.

- [x] **Step 1: Написать падающие тесты production-политики**

Расширить helper до полного проектного fixture: по умолчанию он создаёт
`runtime-effect-decoder.ts`, `data.ts`, `effect-runtime-registry.ts`,
`src/index.ts`, девять зарегистрированных CLI и соответствующие
`package.json#scripts`. Переданные тестом файлы заменяют default stubs.

Добавить fixtures:

```typescript
test("public guard rejects an unregistered production CLI", () => {
  const fixture = createPublicEntrypointFixture(
    {
      "src/engine/runtime-effect-decoder.ts":
        "export function decodeRuntimeEffect() { return {}; }\n",
      "src/index.ts": "export const safe = true;\n",
      "src/cli/new-command.ts": "export const safe = true;\n",
    },
    ["src/cli/new-command.ts"]
  );
  const result = runTypedAccessGuard(fixture);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unregistered production CLI/);
  assert.match(result.stderr, /src\/cli\/new-command\.ts/);
});
```

`runTypedAccessGuard` запускает настоящий
`scripts/check-engine-typed-access.mjs` с fixture-root последним аргументом,
как существующий helper в `tests/engine-guards.test.ts`:

```typescript
function runTypedAccessGuard(fixtureRoot: string) {
  return spawnSync(
    process.execPath,
    [
      path.join(rootDir, "scripts", "check-engine-typed-access.mjs"),
      fixtureRoot,
    ],
    { encoding: "utf8" }
  );
}
```

Добавить отдельные тесты:

- decoder value import из постороннего engine-модуля падает;
- decoder type-only import из постороннего модуля проходит;
- разрешённый decoder import в `data.ts` проходит;
- новый value export из `data.ts`, раскрытый через `src/index.ts`, падает;
- четыре разрешённых публичных value-export из `data.ts` проходят;
- низкоуровневый Catalog-символ через root и CLI падает;
- разрешённая типизированная registry-операция проходит.

- [x] **Step 2: Подтвердить падение проектных тестов**

Run:

```powershell
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js
```

Expected: новые fixtures падают из-за отсутствующей production-политики.

- [x] **Step 3: Задать точную политику decoder**

В `scripts/check-engine-typed-access.mjs` импортировать анализатор и определить:

```javascript
const decoderModule = "src/engine/runtime-effect-decoder.ts";
const approvedRuntimeEffectDecoderImporters = new Set([
  "src/engine/data.ts",
  "src/engine/effect-runtime-registry.ts",
]);
const allowedDataAdapterValueExports = new Set([
  "loadCurrentRuntimeDataPack",
  "decodeCurrentRuntimeDataPack",
  "loadV0DataPack",
  "validateExecutableDataPack",
  "isIncompleteFullOnlyDataPack",
]);
```

Защищать все value-export decoder. Существующую
`checkClosedRuntimeEffectDecoderExportSurface` сохранить: она отдельно
закрывает сам модуль decoder.

- [x] **Step 4: Задать точную политику registry**

Использовать существующий `effectRuntimeCatalogBypassExports` как список
низкоуровневых защищённых символов. Закрытый список разрешённых value-export
registry:

```javascript
const allowedRegistryAdapterValueExports = new Set([
  "createAttackDefenseUsage",
  "effectRuntimeModes",
  "effectRuntimeSourceKinds",
  "executeAttackOutcomeBranch",
  "validateRuntimeEffectCatalogPayload",
  "executeRuntimeEffect",
  "evaluateRuntimeEffectAtTiming",
  "applyEffectiveValueModifier",
  "collectAttackReplacementProfile",
  "resolveResurrectionLifeTotal",
  "executeRuntimeEffectAtTiming",
  "executeRuntimeEffectOnPlayCard",
  "applyRuntimeEffectAfterPlayerAttackDamage",
  "applyRuntimeEffectAfterDamageDealt",
  "evaluateRuntimeEffectEndTurnDrawModifier",
  "withEffectRuntimeCatalogOperationsForTesting",
  "tryExecuteSetupEffect",
]);
```

Новый registry-origin value, достигший публичного entrypoint, должен требовать
явного добавления в этот список.

- [x] **Step 5: Зафиксировать production entrypoints**

Определить:

```javascript
const publicEntrypoints = new Set([
  "src/index.ts",
  "src/cli/generate-drafts.ts",
  "src/cli/report-card-runtime-clusters.ts",
  "src/cli/report-import-completeness.ts",
  "src/cli/report-runtime-coverage.ts",
  "src/cli/run-best-move-analysis.ts",
  "src/cli/run-mass-simulation.ts",
  "src/cli/run-simulation-menu.ts",
  "src/cli/run-single-game.ts",
  "src/cli/validate-drafts.ts",
]);
```

Из `package.json#scripts` извлекать все статические пути вида
`dist/src/cli/<name>.js`, преобразовывать их в `src/cli/<name>.ts` и сравнивать
с политикой. Отсутствующий либо лишний production CLI должен быть
`configuration` violation.

- [x] **Step 6: Подключить анализатор к существующему guard**

Вызвать `checkProtectedPublicEntrypoints` после существующего сканирования
engine и перед финальным выводом. Каждое нарушение добавить в
`effectRuntimeCatalogBoundaryViolations` через единый formatter:

```javascript
for (const violation of checkProtectedPublicEntrypoints({
  rootDir,
  tsconfigPath: path.join(rootDir, "tsconfig.json"),
  entrypoints: [...publicEntrypoints],
  protectedModules,
  approvedValueImporters,
  trustedAdapterValueExports,
})) {
  effectRuntimeCatalogBoundaryViolations.push(violation.message);
}
```

- [x] **Step 7: Запустить точечные проверки**

Run:

```powershell
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js
node --test dist/tests/engine-guards.test.js
npm run check:engine-typed-access
```

Expected: все команды завершаются status `0`.

- [x] **Step 8: Коммит Task 2**

```text
fix(architecture/runtime): закрыть decoder и Catalog в публичных точках входа

Why:
Корневой API и production CLI не проверялись по каноническим символам защищённых модулей.

Changed:
Заданы разрешённые импортеры, доверенные адаптеры и production entrypoints.
Guard синхронизирует CLI с package.json и отклоняет запрещённые публичные значения.

Validation:
npm run build -- --pretty false
node --test dist/tests/public-entrypoint-guard.test.js
node --test dist/tests/engine-guards.test.js
npm run check:engine-typed-access

Risk:
Новые публичные API и CLI теперь требуют явного обновления архитектурной политики.

Task: PR137-R3-08/task-2
Generated-By: coder gpt-5.6
```

---

### Task 3: DOX, итоговая проверка и доказательства issue

**Files:**

- Modify only if required by current text: `src/AGENTS.md`
- Modify only if required by current text: `src/engine/AGENTS.md`
- Modify only if required by current text: `src/cli/AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-31-pr137-issue-08-public-entrypoint-guard.md`

**Interfaces:**

- Consumes: полностью подключённый guard из Task 2.
- Produces: актуальный DOX-контракт и проверенный issue 08 commit range.

- [x] **Step 1: Выполнить DOX pass**

Проверить текущие формулировки трёх AGENTS.md. Если они обещают отслеживание
произвольного value-flow, заменить на:

```markdown
- Public-entrypoint guard follows the static TypeScript import/export graph
  and canonical symbols. It does not interpret arbitrary JavaScript value
  flow; new trusted adapters and production CLI entrypoints require an
  explicit policy update and paired tests.
```

Не менять AGENTS.md, если существующие контракты уже соответствуют дизайну.

- [x] **Step 2: Запустить проектные проверки один раз на финальном состоянии**

Run:

```powershell
npm run typecheck
npm run lint
npm run check
git diff --check
```

Expected: status `0` у каждой команды. Если `npm run check` уже включает
предыдущие команды, всё равно записать только фактически выполненные команды
и не повторять их после неизменившегося дерева.

- [x] **Step 3: Проверить diff и область изменений**

Run:

```powershell
git status --short
git diff --stat
git diff -- scripts/check-engine-typed-access.mjs scripts/lib/check-protected-public-entrypoints.mjs tests/public-entrypoint-guard.test.ts tests/run-tests.ts src/AGENTS.md src/engine/AGENTS.md src/cli/AGENTS.md
```

Подтвердить:

- нет анализа callbacks, containers, reflection, `bind`, closures и классов;
- нет изменений исполняемой логики движка;
- все новые production entrypoints и trusted adapters видны в одном месте;
- тестовая матрица соответствует спецификации.

- [x] **Step 4: Отметить план и локальный issue**

Отметить выполненные пункты плана. Локальный issue обновляет интегратор после
чистого Standards/Spec review; worker не включает `.scratch/` в коммит.

- [x] **Step 5: Финальный AIC-коммит при наличии DOX-изменений**

Если AGENTS.md изменились, создать отдельный коммит:

```text
docs(architecture/runtime): уточнить контракт публичного guard

Why:
DOX должен отражать конечную модель угроз issue 08 и не обещать анализ произвольного JavaScript.

Changed:
Зафиксирована проверка статического TypeScript-графа и явная регистрация доверенных границ.

Validation:
npm run check
git diff --check

Risk:
Изменяется только рабочий контракт агентов; исполняемый код не затронут.

Task: PR137-R3-08/task-3
Generated-By: coder gpt-5.6
```

Если DOX уже актуален, не создавать пустой или искусственный коммит.

Фактическая интеграция:

- Task 1 и Task 2 вошли в единый логический коммит `271528e`, поскольку общий анализатор и проектная политика образуют одну защитную границу.
- Task 3 вошёл в документационный коммит `c7e2e74`.
- На `c7e2e74` прошли `npm run check`, отчёт кластеров, обе проверки `git diff --check`, финальные Spec и Standards ревью и GitHub secrets/SAST/OSV/CodeQL.
