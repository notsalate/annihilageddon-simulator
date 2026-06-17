# Implement executable coverage for non-setup wizard properties

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать executable coverage для wizard properties, которые работают во время партии или при scoring, без изменения стартовой подготовки. Сюда входят свойства про чипсины, скидки, дополнительные ПО, triggers на получение/розыгрыш карт, временный предел руки и activation свойства.

## Acceptance criteria

- [ ] Свойства со скидками, +ПО, чипсинами, triggers и activation effects работают через normal Runtime Effect IDs.
- [ ] Свойство со скидкой на сокровища снижает effective cost на 1 только для сокровищ, включая legend treasure matching.
- [ ] То же свойство добавляет +1 ПО за каждое owned treasure при scoring.
- [ ] Свойства с control-count conditions дают чипсину только когда условие контроля нужных card types выполнено.
- [ ] Triggers на получение/розыгрыш card type срабатывают в правильный момент и не срабатывают на неподходящие карты.
- [ ] Optional topdeck для полученной карты выполняется до обычного попадания в discard и использует deterministic first-legal Choice Policy.
- [ ] Temporary hand limit modifier учитывает карты, полученные в текущий ход, и сбрасывается после добора.
- [ ] Все covered эффекты работают через normal Runtime Effect IDs, без `fixture_*` в executable data.

## Blocked by

- `04-add-remaining-universal-runtime-mechanics.md`
- `06-add-wizard-property-setup-lifecycle.md`
