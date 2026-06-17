# Promote first runtime mechanic and fixture validation gate

Status: ready-for-agent
Label: ready-for-agent
Type: AFK

## Parent

`.scratch/krutagidon-universal-mechanics/PRD.md`

## What to build

Сделать первый полный promote-срез на Healing: нормальный Runtime Effect ID `heal` заменяет тестовый `fixture_heal` для реального поведения лечения, а валидатор получает явный режим, который запрещает `fixture_*` в боевых данных и разрешает их только для тестовых fixtures.

## Acceptance criteria

- [ ] `heal` лечит действующего игрока до текущего effective max life по `docs/rules-canon.md`.
- [ ] Тесты Healing используют `heal`, а не `fixture_heal`.
- [ ] `fixture_heal` удален из runtime/валидатора, если после миграции больше не нужен.
- [ ] Валидация боевых data packs явно запрещает `fixture_*` effect IDs.
- [ ] Тестовые fixtures могут явно включить режим, разрешающий unpromoted `fixture_*`.
- [ ] Неподдержанные fixture effects не проходят в боевых данных молча.

## Blocked by

None - can start immediately
