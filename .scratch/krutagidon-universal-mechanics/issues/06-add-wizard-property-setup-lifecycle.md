# Add wizard property setup lifecycle

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Научить setup загружать свойства, выдавать игрокам стартовое свойство и хранить его как controlled starting object. Эффекты свойств могут оставаться non-executable, пока их mechanic coverage не реализован.

## Acceptance criteria

- [ ] Data pack может ссылаться на набор wizard properties.
- [ ] Setup может детерминированно назначить свойство игроку через текущий first-legal/fallback подход.
- [ ] Назначенное свойство доступно как controlled object для модификаторов и triggers.
- [ ] Неисполняемые эффекты свойства не выполняются молча.
- [ ] Есть focused tests на загрузку, назначение и controlled-object видимость свойства.

## Blocked by

- `05-add-wizard-property-json-schema-and-drafts.md`
