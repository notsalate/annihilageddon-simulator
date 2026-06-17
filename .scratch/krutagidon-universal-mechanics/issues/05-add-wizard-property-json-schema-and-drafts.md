# Add wizard property JSON schema and drafts

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Добавить формат JSON для жетонов колдунского свойства и draft JSON для присланных свойств. Это не полный импорт свойств и не обещание, что все эффекты уже executable.

## Acceptance criteria

- [ ] Есть шаблон runtime JSON для wizard property с stable ID, видимым русским текстом, kind/lifecycle, effects и unsupported mechanics.
- [ ] Добавлены draft JSON для присланных свойств из локальных фото.
- [ ] Draft data не использует localized display text как primary key.
- [ ] Эффекты, которые еще не поддержаны, явно отмечены как unsupported или non-executable.
- [ ] Валидатор не принимает draft-свойство как executable, если у него есть неподдержанные mechanics.

## Blocked by

- `01-promote-first-runtime-mechanic-and-fixture-validation-gate.md`
