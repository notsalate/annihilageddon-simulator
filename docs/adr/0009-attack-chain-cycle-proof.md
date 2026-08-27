---
id: ADR-0009
title: Доказательство цикла цепочки ATTACK
status: accepted
origin: new
recorded: 2026-08-27
decision_date: 2026-08-27
supersedes: none
superseded_by: none
---

# ADR-0009: Доказательство цикла цепочки ATTACK

## Контекст

Напечатанная цепочка ATTACK может после завершения одного Attack Instance
запустить следующий и снова выбрать уже атакованного игрока. Нельзя считать
длинную цепь, пустой стек ЖДК или повтор цели достаточным основанием для
остановки: Defense, DWT, RNG и выбор стратегии могут изменить следующий
результат. Одновременно доказуемая бесконечная цепь не должна оставлять
симуляцию в бесконечном синхронном цикле до end-of-turn checkpoint.

## Решение

Доказательство применяется только к границе продолжения
`directional_chain_attack`: предыдущий Attack Instance уже закрыт вместе с
его attack-bound последствиями и отложенными DWT, а следующий ещё не создан.
Перед каждым следующим Attack Instance runtime строит версию recurrence key 1
из:

- направления, индекса и стабильного ID текущей цели;
- source identity (`sourceType`, режим runtime, игрок, card instance и
  definition);
- `seed`, активного игрока и полного rules-relevant projection текущего
  `turn`, игроков и common-зон;
- очереди DWT, отложенной для текущих Attack Instances, включая порядок лиц и
  данные их проекции;
- текущей позиции seeded RNG;
- состояния `ChoicePolicy`, если оно опубликовано как JSON-подобное значение.

Формально ключ имеет следующий логический состав:

```ts
type AttackChainRecurrenceProjection = {
  cursor: {
    direction: "left" | "right";
    targetIndex: number;
    targetPlayerId: PlayerId;
  };
  source: {
    sourceType: string;
    runtimeMode: string;
    playerId: PlayerId;
    cardInstanceId: string;
    definitionId: string;
  };
  effect: DirectionalChainAttackRuntimeEffect;
  rulesState: unknown;
  pendingAttackBoundDwt: unknown;
  rng: RandomSourceSnapshot;
  choicePolicyState: ChoicePolicyState | null;
};
```

`rulesState` — детерминированная проекция всех mutable-полей, от которых
зависит следующий legal resolution; `unknown` здесь обозначает закрытый
внутренний projection, а не разрешение на произвольный runtime-объект. В
частности, в него входят игроки, common-зоны, turn modifiers, HP/max HP,
контроль, статусы, DWT и pending work. Ключ сравнивается только после полного
завершения предыдущей границы continuation. Поэтому изменение HP, max HP,
Defense, DWT-лица или очереди, RNG, choice state либо любого другого поля
проекции обязано дать другой ключ. Длинная цепь с разными ключами не является
доказанным циклом.

`eventLog` и `nextAttackId` не входят в ключ: это диагностическая история и
счётчик идентичности, которые не влияют на следующий legal resolution. Все
остальные изменения в проекции, включая HP, max HP, DWT, pending DWT work,
RNG или состояние выбора, создают новый ключ и требуют обычного продолжения.

`ChoicePolicy` без `getState` считается непрозрачной. Для неё recurrence
нельзя доказать, поэтому runtime продолжает цепь обычным способом и не
подменяет правила произвольным лимитом или исходом. Встроенный baseline и
replay публикуют свои состояния; стратегии, которым нужна доказуемая
остановка цикла, обязаны публиковать все mutable values, влияющие на
следующий выбор.

Если одинаковый key встречается снова на той же границе продолжения, runtime
возвращает typed non-error outcome `provenAttackChainCycle` и закрывает только
эту бесконечную continuation. Это outcome эффекта, а не `gameEnd`: оно не
объявляет победителя, не завершает текущий turn и не запрещает независимые
ATTACK/actions. Обычная end-of-turn adjudication продолжается как обычно.

Пустой стек DWT не входит в доказательство как отдельная причина остановки.
Он меняет end-of-turn checkpoint, но не legal resolution текущего ATTACK:
одиночная атака и последующие независимые действия всё ещё разрешаются.
Только повтор полного ключа на границе continuation доказывает, что именно
продолжение не может закончиться по напечатанным правилам.

## Альтернативы

- Остановить цепь после фиксированного числа итераций. Это меняет правила для
  длинной, но конечной цепи и не доказывает бесконечность.
- Запрещать ATTACK при пустом DWT. Это превращает end-of-turn condition в
  глобальный lock и меняет несвязанные атаки.
- Считать повтор цели циклом. Это игнорирует Defense, DWT, RNG, modifiers и
  другие изменения состояния.
- Использовать полный event log или `nextAttackId` в ключе. Тогда каждый
  повтор получает искусственно новое значение и доказательство невозможно.

## Причины выбора

Ключ повторяет только состояние, от которого зависит следующий переход
цепочки, а outcome остаётся локальным для continuation. Требование snapshot
для policy отделяет доказанную повторяемость от неизвестного внешнего
состояния и сохраняет поведение непрозрачных пользовательских стратегий.

## Последствия

### Положительные

- Детектор не вмешивается в обычные атаки, смерти, empty-DWT checkpoint и
  независимые действия.
- Идентичная конечная проекция завершается детерминированно и наблюдаемым
  typed outcome.
- Seeded simulation и replay используют одну и ту же границу доказательства.

### Отрицательные

- Пользовательская policy без snapshot не получает автоматического доказательства
  цикла и может создать действительно бесконечную цепь.
- При добавлении нового mutable поля в continuation projection нужно обновить
  этот ADR, recurrence key и focused regression tests одновременно.

## Доказательства

- [Технический канон правил](../rules-canon.md), раздел `Attack and Defense
Algorithm`.
- [Открытые вопросы правил](../rules-open-questions.md), запись RQ-001.
- `src/engine/attack-cycle.ts` и focused tests в
  `tests/action-loop.test.ts`.
