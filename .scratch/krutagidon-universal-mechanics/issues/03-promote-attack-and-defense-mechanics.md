# Promote attack and defense mechanics

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать настоящие Runtime Effect IDs для атак и защиты: обычная атака, окно защиты, multi-target порядок и Mayhem attack порядок. Это не добавляет стратегию; выборы остаются через deterministic first-legal Choice Policy.

## Acceptance criteria

- [ ] Обычная атака выбирает цель, открывает defense window и наносит урон, если защита не использована.
- [ ] Легальная защита избегает одну attack instance и платит/перемещает карту по mapped defense data.
- [ ] Attack kill корректно дает attack credit и Basic Trophy Credit там, где это предусмотрено canon.
- [ ] Multi-target normal attack разрешается цель-за-целью, с учетом state changes между целями.
- [ ] Mayhem/MegaMayhem attack собирает защиты фазой и потом разрешает атаку по canon.
- [ ] Старые attack/defense `fixture_*` IDs не используются в promoted tests после миграции.

## Blocked by

- `02-promote-core-effect-mechanics.md`
