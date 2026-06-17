# Implement executable coverage for starter replacement property

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать executable coverage для свойства, которое заменяет один стартовый `Знак` на `Палочку-хреналочку`, усиливает атаки палочек на +1 урон и делает эти атаки неизбегаемыми.

## Acceptance criteria

- [ ] Setup заменяет ровно один стартовый `Знак` на `Палочку-хреналочку` для игрока со свойством.
- [ ] Замена использует stable card IDs и не зависит от русского названия как ключа.
- [ ] Атаки палочек игрока со свойством получают +1 урон.
- [ ] Такие атаки нельзя избежать defense window.
- [ ] Свойство не влияет на чужие палочки и не на не-palочка атаки.
- [ ] Есть focused tests на setup replacement, damage modifier и unavoidable behavior.

## Blocked by

- `03-promote-attack-and-defense-mechanics.md`
- `06-add-wizard-property-setup-lifecycle.md`
