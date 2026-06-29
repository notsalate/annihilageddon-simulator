Status: Ready
Label: ready-for-agent
Type: AFK

# Поддержать setup для incomplete-full-only runtime pack

## Parent

- `.scratch/krutagidon-card-runtime-clusters/PRD.md`

## What to build

Сделать setup и validation совместимыми с `mappingStatus: "incomplete-full-only"`: симуляция должна стартовать даже если current runtime pack пока содержит пустые или отсутствующие optional setup surfaces.

Срез должен доказать end-to-end поведение: current runtime pack может быть неполным, без placeholder familiars/properties, но initialization и базовый simulation smoke не падают из-за отсутствия карт или optional setup pools/stacks.

Этот issue не добавляет placeholder runtime data.

## User stories covered

- 3. Current runtime can run with any number of full cards.
- 4. Missing card runtime is normal backlog.
- 8. Incomplete setup skips absent familiar and wizard-property setup.

## Acceptance criteria

- [ ] Для `incomplete-full-only` pack отсутствующий familiar pool не приводит к ошибке setup.
- [ ] Для `incomplete-full-only` pack пустой familiar pool не требует двух setup candidates и пропускает familiar assignment.
- [ ] Для `incomplete-full-only` pack отсутствующий wizard-property stack не приводит к ошибке setup.
- [ ] Для `incomplete-full-only` pack пустой wizard-property stack пропускает wizard-property assignment.
- [ ] Пустые main/legend/starter card compositions не ломают initialization.
- [ ] Поведение strict/complete pack не ослаблено без явного будущего решения; tolerance привязан к incomplete mode.
- [ ] Добавлены focused tests для incomplete setup без placeholder data.
- [ ] Current runtime pack можно загрузить и инициализировать в тесте.
- [ ] `npm run typecheck` проходит.
- [ ] Focused setup/validation tests проходят.

## Blocked by

- `.scratch/krutagidon-card-runtime-clusters/issues/01-rebaseline-default-runtime-pack.md`

## Notes

- Не моделировать отсутствующих фамильяров или wizard properties заглушками.
- Если manifest status удобно читать через helper, держать helper рядом с data-pack/setup code, а не размазывать строковые проверки по engine.
