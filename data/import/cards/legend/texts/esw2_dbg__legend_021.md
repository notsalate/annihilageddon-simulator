# esw2_dbg\_\_legend_021

- source image path: `assets/cards/legend/treasure/Легенда-Сокровище. ТА САМАЯ Вялая Палочка.png`
- source label: `Легенда-Сокровище. ТА САМАЯ Вялая Палочка`
- quantity: `1`
- visible Russian name: `ТА САМАЯ Вялая Палочка`
- visible type: `Легенда — Сокровище`
- visible card kind: `legend`
- visible card types: `legend, treasure`
- visible markers: `attack`
- visible cost: `11`
- visible victory points: `4`

## Visible Russian rules text

+4 мощи
Атака: Нанеси 7 урона выбранному колдуну. Если он от этого подох, можешь дать ему 3 или меньше вялых палочек с руки, или из твоей стопки сброса, или из колоды вялых палочек.

## Classification / Разъяснения

- Передача вялых палочек остаётся ATTACK-текстом: погибшая цель сначала проходит DWT gain/reveal и respawn, затем получает выбранные палочки; обычный текст её ЖДК ждёт полного конца AttackInstance.
- При создании runtime JSON эта карта обязана получить общие tags `wandCard` и `wandAttackCard`.
