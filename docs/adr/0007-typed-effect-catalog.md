---
id: ADR-0007
title: Typed Decoder и Effect Runtime Catalog
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0007: Typed Decoder и Effect Runtime Catalog

## Контекст

Runtime effects приходят из внешнего JSON и имеют разные payload shapes, timing, source kinds и runtime modes. Общий `unknown` или общий набор полей позволяет передать malformed payload не тому handler-у или обойти policy. При этом engine должен сохранять concrete type между декодированием и исполнением.

## Решение

`runtime-effect.ts` содержит explicit `RuntimeEffectPayloadMap`, из которой выводятся `RuntimeEffectId` и concrete payload union. `runtime-effect-decoder.ts` декодирует каждый зарегистрированный ID, проверяет literal discriminator, exact fields, nested targets/conditions/costs/branches и допускает unsupported effects только явно.

`effect-runtime-registry.ts` является Effect Runtime Catalog: он связывает decoder, concrete handler, supported source kinds и runtime modes через typed entry. Catalog operation принимает raw input, декодирует его и передаёт concrete payload только соответствующему handler-у внутри одной boundary. Публичные entrypoints не раскрывают низкоуровневый decoder и Catalog обходным импортом; это проверяется static guard.

## Альтернативы

- Хранить все эффекты как общий bag полей и проверять их в каждом handler-е. Текущая typed boundary не использует общий bag; обсуждался ли такой вариант исторически, неизвестно.
- Передавать decoder result и handler отдельно, позволяя caller соединять их assertions. Catalog closure исключает этот путь; неизвестно, обсуждался ли он исторически.
- Открыть raw decoder и низкоуровневый Catalog через root API или CLI. Guard и public-entrypoint policy запрещают обход; исходная история решения неизвестна.

## Причины выбора

Explicit payload map делает список эффектов исчерпывающим, exact decoder останавливает malformed data на data boundary, а Catalog удерживает pair concrete payload/handler и source-mode policy вместе. Static guard ограничивает поверхность, через которую можно случайно обойти эту границу.

## Последствия

### Положительные

- Handler получает только payload соответствующего `effectId`.
- Ошибки формы, source kind и runtime mode возвращаются до игровой мутации.
- Добавление нового effect ID требует синхронно обновить map, decoder, Catalog и проверки.
- Public API не раскрывает низкоуровневые операции, позволяющие обойти typed seam.

### Отрицательные

- Каждый новый effect требует явного payload и decoder вместо свободного JSON.
- Registry и static guard требуют поддерживать несколько согласованных матриц.
- Unsupported mechanics должны быть названы явно, а не спрятаны в универсальном fallback.

## Доказательства

- [Runtime effect payload map](../../src/engine/runtime-effect.ts) задаёт concrete variants и exhaustiveness checks.
- [Runtime effect decoder](../../src/engine/runtime-effect-decoder.ts) выполняет exact decoding.
- [Effect Runtime Catalog](../../src/engine/effect-runtime-registry.ts) связывает decoder, handlers и policies.
- [Validation tests](../../tests/validation.test.ts) и [public-entrypoint guard tests](../../tests/public-entrypoint-guard.test.ts) проверяют payload и экспортные boundaries.
- [Engine typed-access guard](../../scripts/check-engine-typed-access.mjs) закрывает обходы decoder/Catalog.
- [Design specification for decoder/catalog](../superpowers/specs/2026-07-20-engine-architecture-deepening-design.md) описывает проверяемую boundary; она используется как design evidence, а не как реконструкция мотивов.
- [Concrete payload map](https://github.com/notsalate/annihilageddon-simulator/commit/b8cd8b9), [exhaustive Catalog](https://github.com/notsalate/annihilageddon-simulator/commit/bb58f9e), [typed payload boundary](https://github.com/notsalate/annihilageddon-simulator/commit/68cca0e) и [Catalog operations](https://github.com/notsalate/annihilageddon-simulator/commit/9c89ab8) подтверждают правило.
