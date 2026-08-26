Status: Done
Label: done
Type: AFK

> Historical local copy of closed GitHub issue #300. It is not a current implementation task. The acceptance criteria below are retained as delivery history; docs/rules-canon.md and ADR-0008 supersede any conflicting rule or DWT timing.

# Закрепить market-effects свойства колдуна 004 реальным тестом

## Parent

- `.scratch/krutagidon-card-runtime-clusters/cross-source-mechanic-matrix.md`

## What to build

Закрыть короткий cross-source follow-up `market-effects` для `esw2_dbg__wizard_property_004` без создания новых обработчиков.

## Acceptance criteria

- [ ] Тест загружает настоящее runtime-определение свойства 004, а не синтетическую fixture.
- [ ] Сокровище и Легенда-Сокровище покупаются на 1 дешевле.
- [ ] В конце игры каждое принадлежащее игроку Сокровище даёт ровно +1 ПО, включая Легенду-Сокровище.
- [ ] Скидка и ПО продолжают проходить через общий Effective Value module.
- [ ] Кластер получает `crossSourceComplete`, если отчёт не находит других пробелов.

## Delivery

Отдельный маленький PR `market-effects` follow-up. Если тест раскрывает ошибку, исправляется общий механизм, а не добавляется property-only путь.

## Blocked by

- `48-track-cross-source-runtime-completeness.md`
