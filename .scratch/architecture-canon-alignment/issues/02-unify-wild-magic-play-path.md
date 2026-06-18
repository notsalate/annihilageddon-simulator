Status: ready-for-agent

# Единый play path для Шальной магии

## What to build

Сделать так, чтобы `play_top_card_from_foe_deck` использовал общий play path, сохраняя специальные правила Шальной магии: non-Ongoing карта врага временно контролируется активным игроком, но остаётся owned прежним владельцем; Ongoing карта становится owned и controlled активным игроком.

## Acceptance criteria

- [ ] Карта, сыгранная из колоды врага через Шальную магию, проходит через общий play path.
- [ ] Non-Ongoing карта врага после cleanup попадает в discard исходного владельца.
- [ ] Ongoing карта врага становится owned/controlled активным игроком и остаётся в `permanents`.
- [ ] `onPlayCard`-триггеры свойств колдуна срабатывают для карты, сыгранной через Шальную магию.
- [ ] Existing tests pass, добавлены focused regression tests для non-Ongoing и Ongoing путей.

## Blocked by

- `.scratch/architecture-canon-alignment/issues/01-unify-play-top-card-path.md`
