# esw2_dbg\_\_legend_023

- source image path: `assets/cards/legend/treasure/Легенда-Сокровище. Палочка-Миниганочка.png`
- source label: `Легенда-Сокровище. Палочка-Миниганочка`
- quantity: `1`
- visible Russian name: `Палочка-Миниганочка`
- visible type: `Легенда — Сокровище`
- visible card kind: `legend`
- visible card types: `legend, treasure`
- visible markers: `attack`
- visible cost: `15`
- visible victory points: `5`

## Visible Russian rules text

Атака: нанеси 7 урона выбранному колдуну.
Атака: нанеси 7 урона выбранному колдуну.
Атака: нанеси 7 урона выбранному колдуну.
Атака: нанеси 7 урона выбранному колдуну.
+3 мощи за каждого колдуна, подохшего от этой карты.

## Classification / Разъяснения

- Палочка-Миниганочка агрегирует смерти по единому разрешению карты; redirect меняет current attacker/trophy credit, но смерть original attacker от redirected instance всё равно считается результатом карты и даёт original card controller +3 power; три смерти => +9.
- При создании runtime JSON эта карта обязана получить общие tags `wandCard` и `wandAttackCard`.
