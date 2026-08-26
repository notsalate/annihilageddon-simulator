Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #299. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Зафиксировать полноту runtime для карт, свойств и ЖДК

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Расширить runtime coverage так, чтобы завершённость механического кластера проверялась для `card`, `wizardProperty` и `deadWizardToken`, а не только для карт.

## Acceptance criteria

- [ ] Все 10 свойств и 28 определений ЖДК имеют основной механический кластер из cross-source matrix.
- [ ] Статус `crossSourceComplete` требует runtime JSON, полного отображения напечатанного поведения, корректного количества в композиции и точечных тестов реального определения.
- [ ] Наличие runtime-файла без эффектов не считается полнотой; текущий DWT 001 с `effects: []` остаётся незавершённым.
- [ ] Для каждого объекта хранится проверяемое соответствие всех смысловых пунктов canonical draft конкретным runtime/test refs и пустой список незакрытых механик.
- [ ] Отчёт блокирует объект, если хотя бы один смысловой пункт draft не отображён, ссылка на runtime/test отсутствует или список незакрытых механик непуст; простого упоминания ID в тесте недостаточно.
- [ ] Отчёт различает прежнее `cardComplete` и итоговое `crossSourceComplete`, не переоткрывая уже закрытые карточные PR.
- [ ] Неверная source-kind/timing policy и ссылка композиции на отсутствующее определение блокируют отчёт.
- [ ] Добавлены тесты положительных и отрицательных состояний отчёта.

## Delivery

Отдельный подготовительный PR `cross-source-runtime-coverage`. Он сливается до механических follow-up PR и не реализует эффекты объектов.

## Blocked by

None — can start immediately.
