Status: Ready
Label: ready-for-agent
Type: AFK

# Переназначить default runtime pack на current-runtime

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Переименовать текущий runnable data pack из v0/first-batch языка в `current-runtime` и сделать его default runtime pack для загрузки симулятора.

Срез должен пройти через data files, loader API, tests и документацию: после завершения новый default loader загружает `current-runtime`, manifest указывает на current deck/stack/pool filenames, а старые `v0-first-batch` имена больше не являются целевым runtime baseline.

Этот issue не удаляет старые runtime card JSON и не реализует новые карты.

## User stories covered

- 1. Default runtime pack named `current-runtime`.
- 3. Current runtime can be `incomplete-full-only`.

## Acceptance criteria

- [ ] Runtime pack file переименован в `data/packs/current-runtime.json`.
- [ ] Current composition files переименованы в `data/decks/main-deck.json`, `data/decks/legend-deck.json`, `data/decks/starter-deck.json`, `data/stacks/cards/wild-magic-stack.json`, `data/stacks/cards/limp-wand-stack.json`, `data/pools/familiar-pool.json`.
- [ ] Manifest paths указывают только на current filenames.
- [ ] Manifest использует `mappingStatus: "incomplete-full-only"`.
- [ ] Default loader переименован с `loadV0DataPack` на current-runtime название, и production/test imports используют новое имя.
- [ ] Старое loader имя не остаётся целевым API для нового кода; если alias нужен временно, он явно помечен совместимостью.
- [ ] Docs/templates, затронутые default runtime pack naming, больше не называют current runtime `v0-first-batch`.
- [ ] Current runtime pack загружается штатной командой/тестом.
- [ ] `npm run typecheck` проходит.
- [ ] `npm test` или focused tests, покрывающие data-pack loading/setup, проходят.

## Blocked by

None - can start immediately.

## Notes

- Не удалять `runtimeSchema: "krutagidon.*.v0"` и `playableInV0` в этом issue. Они остаются техническими legacy fields для отдельного cleanup slice.
- Не менять card runtime mappings в этом issue, кроме путей/имен, необходимых для current-runtime baseline.
