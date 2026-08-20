# Аудит кандидатов на восстановление ADR

## Цель и метод

Этот документ закрывает аудит из [issue #212](https://github.com/notsalate/annihilageddon-simulator/issues/212) и является входом для [issue #215](https://github.com/notsalate/annihilageddon-simulator/issues/215). Цель — получить конечный список уже действующих решений, а не объявить ADR для каждого заметного модуля.

Кандидат считался подтверждённым, если его правило одновременно:

- действует в нескольких модулях или на публичной границе;
- подтверждается кодом, тестами, guards, domain docs либо несколькими историческими изменениями;
- трудно обратимо, неочевидно или содержит существенный долгосрочный компромисс.

Источники аудита: текущий код и тесты, `CONTEXT.md`, профильные документы, статические guards, approved design specification [2026-07-20](superpowers/specs/2026-07-20-engine-architecture-deepening-design.md) и история Git. Design specification использована как указатель заявленных границ, но не как доказательство сама по себе. История подтверждает наличие решения в коде, но не позволяет восстановить неизвестные первоначальные мотивы или дату принятия.

## Конечный список

| Кандидат | Долговременное правило                                                                                                         | Проверка критерия                                                                                                  | Результат                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| CAND-01  | Движок читает только декодированные runtime packs; source и draft остаются import-слоем.                                       | Граница определяет layout данных, декодирование и безопасность всех запусков.                                      | Восстановить как [ADR-0002](adr/0002-runtime-import-boundary.md).  |
| CAND-02  | Seeded RNG, стабильный baseline choice и отделение Analyzer от `Strategy` обеспечивают воспроизводимость и границу информации. | Меняет публичный контракт симуляций, анализа и тестов; незаметная смена ломает сравнимость.                        | Восстановить как [ADR-0003](adr/0003-determinism-and-analyzer.md). |
| CAND-03  | `Attack Resolution` владеет полным lifecycle обычной атаки, а Defense остаётся атомарной транзакцией.                          | Меняет порядок событий, rollback, attribution и границу Mayhem.                                                    | Восстановить как [ADR-0004](adr/0004-player-attack-lifecycle.md).  |
| CAND-04  | `Control Ledger` владеет отношением контроля и inventory физических карточных зон.                                             | Несколько consumers и fork/scoring зависят от единого inventory; параллельный обход даёт противоречивое состояние. | Восстановить как [ADR-0005](adr/0005-control-ledger.md).           |
| CAND-05  | `Trigger Dispatch` владеет discovery и операциями над контролируемыми объектами.                                               | Граница определяет timing, порядок, source attribution, ошибки и terminal results.                                 | Восстановить как [ADR-0006](adr/0006-trigger-dispatch.md).         |
| CAND-06  | Exact Decoder и Effect Runtime Catalog сохраняют связь concrete payload → handler и policy.                                    | Граница является typed data contract и защищена runtime tests и static guard.                                      | Восстановить как [ADR-0007](adr/0007-typed-effect-catalog.md).     |
| CAND-07  | Точечные тесты используют общий scenario helper.                                                                               | Это обратимое тестовое устройство без игрового правила; достаточно `tests/AGENTS.md` и точечных тестов.            | Не восстанавливать ADR.                                            |

## Подтверждённые кандидаты

### CAND-01 — граница runtime data и import-слоёв

`CONTEXT.md` различает Import Data, Draft Data и Runtime Data. `docs/import-pipeline.md` задаёт путь `image → source md → draft JSON → runtime JSON → pack` и прямо запрещает читать draft JSON во время партии. `docs/runtime-layout.md` описывает самодостаточный runtime layout. `src/engine/data.ts` декодирует manifest, card definitions и effects на границе engine, а import-инструменты находятся отдельно в `src/import/`. История `1b20700` и `ac4fc05` показывает, что эта граница была закреплена отдельными изменениями данных и pack layout.

Правило трудно обратимо: его обход меняет источник истины для движка, формат данных и воспроизводимость запуска. Оно неочевидно из одного JSON-файла и содержит компромисс между удобством импорта и безопасной исполняемой моделью. Кандидат подтверждён.

### CAND-02 — воспроизводимость и граница Analyzer

`src/engine/rng.ts` предоставляет seeded RNG и независимый `fork()`, `tests/rng.test.ts` проверяет повторяемость и сохранение позиции. `CONTEXT.md`, `docs/rules-canon.md` и `README.md` связывают baseline choice с устойчивым engine order и отделяют `Best-Move Analyzer` от `Strategy`. `src/engine/best-move-analysis.ts`, `src/engine/best-move-policies.ts` и `tests/best-move-analysis.test.ts` закрепляют анализ полным состоянием и fork RNG без изменения обычного effect resolution.

Правило трудно обратимо: его изменение ломает сравнимость seeded запусков, тестовых fixtures и benchmark workload. Граница Analyzer/Strategy неочевидна, потому что обе поверхности принимают решения, но имеют разные права на hidden state и будущее RNG. Кандидат подтверждён.

### CAND-03 — lifecycle обычной атаки и атомарная Defense

`src/engine/attack-resolution.ts` создаёт общий attack context, разрешает target plan последовательно, пишет `attackCreated`, обрабатывает current target и агрегирует after-attack damage. `src/engine/attack-defense.ts` владеет оплатой, перемещением, branch effects и rollback. `tests/attack-resolution.test.ts`, `tests/attack-resolution-ordering.test.ts` и `tests/attack-defense-snapshot.test.ts` проверяют порядок и атомарность. `docs/rules-canon.md` отделяет обычную атаку от двухфазного Mayhem flow. Исторические изменения `63cc11b` и `9f051e4` закрепили эти seams.

Правило определяет порядок наблюдаемых событий, момент damage/death, attribution, redirect и поведение при ошибке. Перестановка ответственности между effect runtime и lifecycle-owner затрагивает множество карт и тестов. Кандидат подтверждён.

### CAND-04 — Control Ledger

`src/engine/control-ledger.ts` владеет отношением controller-to-object и descriptor inventory физических зон. `tests/control-ledger.test.ts` и `tests/control-ledger-zones.test.ts` проверяют контроль, временный контроль и зоны. `scripts/check-engine-typed-access.mjs` запрещает consumers вручную перечислять physical zones и требует Ledger seam; `src/engine/game-state-fork.ts` использует Ledger при cloning. История `7338c3a`, `3ee639a`, `a8411e6` и `933c349` показывает последовательное удаление параллельных inventories.

Правило трудно обратимо и неочевидно: ownership, control и physical zone — разные понятия, а один объект может проходить через singleton- и array-зоны. Параллельные обходы дают расхождения в scoring, cloning и trigger discovery. Кандидат подтверждён.

### CAND-05 — Trigger Dispatch

`src/engine/trigger-dispatch.ts` принимает typed operation, строит controlled view, применяет timing-aware policy и сохраняет source attribution. `tests/trigger-dispatch.test.ts`, `tests/trigger-dispatch-ongoing.test.ts` и `tests/trigger-dispatch-errors.test.ts` проверяют порядок, ongoing eligibility, остановку на ошибке и typed result. `scripts/check-engine-typed-access.mjs` проверяет ownership границы. История `70fe2f5`, `82087b8` и `2b0c860` фиксирует перенос discovery и catalog execution в dispatcher.

Правило трудно обратимо: оно задаёт единственный порядок операций для `onPlayCard`, after-attack и end-turn, а также границу между raw effect и typed operation. Кандидат подтверждён.

### CAND-06 — Exact Decoder и Effect Runtime Catalog

`src/engine/runtime-effect.ts` содержит исчерпывающую карту payload variants, `src/engine/runtime-effect-decoder.ts` проверяет exact shapes, а `src/engine/effect-runtime-registry.ts` связывает decoder, handler, source kinds и runtime modes. `tests/validation.test.ts`, runtime suites и `tests/public-entrypoint-guard.test.ts` проверяют payload и публичные границы; `scripts/check-engine-typed-access.mjs` запрещает обходы decoder/Catalog. История `b8cd8b9`, `bb58f9e`, `68cca0e`, `eef036a` и `9c89ab8` подтверждает последовательное формирование этой границы.

Правило является typed data contract: без него raw `unknown` может попасть в handler, а source/mode policy может быть обойдена. Оно трудно обратимо из-за большого числа effect IDs и consumers и содержит явный компромисс в пользу закрытой, проверяемой схемы вместо общего payload bag. Кандидат подтверждён.

Trigger Dispatch и Catalog оставлены отдельными ADR: первый владеет discovery и orchestration контролируемых операций, второй — payload decoding, handler pairing и source/mode policy. Их границы взаимодействуют, но имеют разные consumers и разные причины изменения.

## Отклонённый кандидат

### CAND-07 — scenario helper для точечных тестов

`tests/AGENTS.md`, `tests/helpers/game-scenario.ts` и точечные наборы тестов действительно задают полезное правило: setup и сборка runtime fixtures проходят через общий узкий helper. Однако это тестовый способ уменьшить дублирование, а не долговременное игровое решение. Его изменение не меняет runtime data, state model или публичный engine contract. Достаточны локальный DOX-контракт, типы helper и сами точечные тесты; восстановленный ADR здесь создавал бы ложную архитектурную значимость.

По той же причине не выделялись в ADR отдельные card mechanic clusters, fixture IDs, legacy metadata и локальные helper-функции: это implementation или planning material, а не доказанное сквозное решение.

## Результат для #215

Аудит даёт шесть подтверждённых кандидатов без реконструкции неизвестных мотивов. Каждый оформлен отдельным восстановленным ADR со статусом `accepted`, `origin: restored`, текущей датой записи и `decision_date: unknown`. Индекс обновлён, а существующий валидатор ADR проверяет полный набор документов в том же PR.
