# Promote core effect mechanics

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Выпустить из `fixture_*` базовые универсальные эффекты: прямой урон, получение карты, сброс карты, уничтожение карты, раскрытие верхней карты колоды и розыгрыш верхней карты колоды. Каждый эффект получает нормальный Runtime Effect ID и тестируется через него.

## Acceptance criteria

- [ ] `deal_damage` наносит прямой урон и корректно запускает смерть, ЖДК и воскрешение.
- [ ] Прямой `deal_damage` не выдает attack kill credit и Главный приз без attack-механики.
- [ ] `gain_card` и `discard_card` корректно перемещают карту в согласованную зону.
- [ ] `destroy_card` маршрутизирует обычные карты, шальную магию и вялую палочку по правилам canon.
- [ ] `reveal_top_card` и `play_top_card` корректно работают с пустой колодой и shuffle discard.
- [ ] Соответствующие старые `fixture_*` IDs удалены после миграции тестов, если больше не нужны.

## Blocked by

- `01-promote-first-runtime-mechanic-and-fixture-validation-gate.md`
