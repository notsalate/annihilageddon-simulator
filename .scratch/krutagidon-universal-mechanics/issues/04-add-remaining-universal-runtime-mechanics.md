# Add remaining universal runtime mechanics

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Добавить оставшиеся универсальные механики, которые нужны до широкого импорта карт: `set_life`, activation для контролируемых постоянок, розыгрыш шальной магии, market chip marker и executable Mayhem/MegaMayhem hook.

## Acceptance criteria

- [ ] `set_life` отдельно устанавливает текущее значение жизней и не смешивается с `heal`.
- [ ] Контролируемые постоянки могут иметь activation action один раз за ход.
- [ ] Шальная магия при розыгрыше использует first-legal выбор между `+2 мощи` и розыгрышем верхней карты колоды врага.
- [ ] Market chip marker двигает чипсины при пополнении рынка по canon.
- [ ] Беспредел/мегабеспредел при выходе в рынок исполняет mapped executable effects.
- [ ] Неподдержанный Mayhem/MegaMayhem effect явно проваливает executable validation или run, а не становится silent no-op.

## Blocked by

- `01-promote-first-runtime-mechanic-and-fixture-validation-gate.md`
- `02-promote-core-effect-mechanics.md`
