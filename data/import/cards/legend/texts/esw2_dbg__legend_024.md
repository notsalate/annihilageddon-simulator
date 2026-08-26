# esw2_dbg\_\_legend_024

- source image path: `assets/cards/legend/treasure/Легенда-Сокровище. Палочка-Ушаталочка.png`
- source label: `Легенда-Сокровище. Палочка-Ушаталочка`
- quantity: `1`
- visible Russian name: `Палочка-Ушаталочка`
- visible type: `Легенда — Сокровище`
- visible card kind: `legend`
- visible card types: `legend, treasure`
- visible markers: `attack`
- visible cost: `20`
- visible victory points: `7`

## Visible Russian rules text

+8 мощи
Атака: нанеси 1 урон выбранному врагу. Если он от этого подох, ты побеждаешь в игре (а все остальные могут лососнуть тунца).

## Classification / Разъяснения

- Проверка победы остаётся частью ATTACK-текста: после немедленных DWT gain/reveal и respawn погибшей цели она выполняется до обычного текста полученного ЖДК.
- При создании runtime JSON эта карта обязана получить общие tags `wandCard` и `wandAttackCard`.
