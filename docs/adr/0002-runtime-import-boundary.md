---
id: ADR-0002
title: Граница runtime data и import-слоёв
status: accepted
origin: restored
recorded: 2026-08-21
decision_date: unknown
supersedes: none
superseded_by: none
---

# ADR-0002: Граница runtime data и import-слоёв

## Контекст

Проект хранит исходные изображения, source text, draft JSON, runtime JSON и pack manifests. Эти материалы имеют разные степени доверия и разные контракты. Движок должен выполнять воспроизводимую игру, а import-слой должен сохранять видимые факты и неопределённости до отдельного runtime mapping.

## Решение

Движок читает только декодированные runtime definitions и composition из runtime data pack. Source text, draft JSON, OCR/import files и промежуточные inventory не являются входом партии и не парсятся во время simulation.

Runtime JSON содержит стабильные идентификаторы, engine fields и explicit effects. Pack manifest явно перечисляет definitions и composition. Вход runtime data проходит decoder на границе engine; import tooling может создавать или проверять runtime files, но не становится скрытым источником поведения.

## Альтернативы

- Читать draft JSON или source text непосредственно во время партии. Текущие материалы показывают, что этот путь не используется; рассматривался ли он исторически, неизвестно.
- Объединить import и runtime JSON в один формат. Это смешивает видимые факты с исполняемыми решениями; неизвестно, рассматривался ли вариант исторически.
- Принимать runtime JSON без decoder и полагаться на форму файлов. Текущая граница decoder показывает действующее решение; было ли это альтернативой при первоначальном выборе, неизвестно.

## Причины выбора

Разделение позволяет отдельно проверять источник, mapping и исполняемую схему. Runtime pack остаётся самодостаточным и не зависит от локальных draft или asset paths, а декодирование превращает внешний JSON в проверенный engine contract.

## Последствия

### Положительные

- Запуск игры не зависит от import-источников и состояния локального OCR/draft процесса.
- Runtime data можно проверять, версионировать и сравнивать как отдельный исполняемый pack.
- Ошибки формы данных обнаруживаются на границе до изменения игрового состояния.

### Отрицательные

- Новая карта требует отдельного mapping шага между draft и runtime.
- Нужно поддерживать несколько связанных форматов и явный pack manifest.
- Быстрые эксперименты с source text нельзя автоматически считать исполняемыми.

## Доказательства

- [CONTEXT.md](../../CONTEXT.md) различает Import Data, Draft Data и Runtime Data.
- [Import Pipeline Guide](../import-pipeline.md) задаёт цепочку `image → source md → draft JSON → runtime JSON → pack` и запрещает читать draft во время партии.
- [Runtime Layout](../runtime-layout.md) описывает самодостаточный runtime layout.
- [runtime data decoder](../../src/engine/data.ts) декодирует manifest и runtime definitions.
- [Issue #212](https://github.com/notsalate/annihilageddon-simulator/issues/212) требует отделить подтверждённое решение от неизвестной истории.
- [Историческое введение границы данных](https://github.com/notsalate/annihilageddon-simulator/commit/1b20700) и [разделение runtime packs](https://github.com/notsalate/annihilageddon-simulator/commit/ac4fc05) подтверждают действующее правило.
