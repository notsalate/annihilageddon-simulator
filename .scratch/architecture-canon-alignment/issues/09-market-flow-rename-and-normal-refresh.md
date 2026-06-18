Status: ready-for-agent

# Market Flow: переименование и обычное обновление барахолки

## What to build

Ввести понятие Market Flow / обновление барахолки вместо широкого `refill` там, где речь о полном каноническом процессе рынка. Первый вертикальный срез должен покрыть обычное начало хода: если в main market не хватает карты, Market Flow раскрывает обычную карту из main deck и кладёт её в барахолку.

## Acceptance criteria

- [ ] Кодовое имя модуля/функции для полного процесса рынка больше не называется узко `refill`.
- [ ] `rules-canon.md`, `rules-glossary.md`, README/docs проверены: `refill` оставлен только там, где означает узкое “доложить карту”, или заменён на “обновление барахолки”/Market Flow.
- [ ] Начало хода через Market Flow добавляет обычную карту в main market до размера 5.
- [ ] Market chip marker продолжает работать для обычного обновления барахолки.
- [ ] Existing tests pass, добавлен focused test на обычный Market Flow без беспредела.

## Blocked by

None - can start immediately
