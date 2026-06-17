# Implement executable coverage for setup-altering wizard properties

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать executable coverage для wizard properties, которые меняют подготовку или базовые стартовые параметры партии. Сюда входят замена стартовой карты, стартовый Главный приз, forced starting player, стартовые жизни и значение жизней при воскрешении. Свойство про фамильяров остается draft/non-executable, пока нет familiar lifecycle.

## Acceptance criteria

- [ ] Setup заменяет ровно один стартовый `Знак` на `Палочку-хреналочку` для игрока со свойством.
- [ ] Замена использует stable card IDs и не зависит от русского названия как ключа.
- [ ] Атаки палочек игрока со свойством получают +1 урон.
- [ ] Такие атаки нельзя избежать defense window.
- [ ] Свойство не влияет на чужие палочки и не на не-palочка атаки.
- [ ] Свойство start-with-main-trophy выдает игроку Главный приз при setup.
- [ ] Свойство force-starting-player делает владельца свойства первым игроком детерминированно.
- [ ] Стартовые и resurrection lives учитывают property override и loser-status exception.
- [ ] Familiar-selection property явно остается non-executable, пока familiar lifecycle не реализован.
- [ ] Есть focused tests на setup replacement, trophy/first-player setup, life override, damage modifier и unavoidable behavior.

## Blocked by

- `03-promote-attack-and-defense-mechanics.md`
- `06-add-wizard-property-setup-lifecycle.md`
