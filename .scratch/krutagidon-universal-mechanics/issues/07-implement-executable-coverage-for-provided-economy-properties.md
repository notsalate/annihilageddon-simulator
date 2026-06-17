# Implement executable coverage for provided economy properties

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать executable coverage для присланных economy-свойств: скидка и end-game ПО за сокровища, чипсины за контроль сокровищ/тварей, чипсины за игру постоянки и выбор положить полученную постоянку наверх колоды.

## Acceptance criteria

- [ ] Свойство со скидкой на сокровища снижает effective cost на 1 только для сокровищ.
- [ ] То же свойство добавляет +1 ПО за каждое owned treasure при scoring.
- [ ] Свойство с условием контроля 2 сокровищ/тварей дает 1 чипсину по указанному timing.
- [ ] Свойство про игру постоянки дает 1 чипсину при play постоянки.
- [ ] Свойство про получение постоянки может положить ее на верх колоды через deterministic first-legal Choice Policy.
- [ ] Все covered эффекты работают через normal Runtime Effect IDs, без `fixture_*` в executable data.

## Blocked by

- `04-add-remaining-universal-runtime-mechanics.md`
- `06-add-wizard-property-setup-lifecycle.md`
