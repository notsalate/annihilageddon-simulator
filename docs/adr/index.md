# Индекс ADR

| ID       | Статус     | Заголовок                                            | Документ                                                     | Происхождение | Заменяет | Заменён новым |
| -------- | ---------- | ---------------------------------------------------- | ------------------------------------------------------------ | ------------- | -------- | ------------- |
| ADR-0001 | accepted   | Модель benchmark, эпох и калибровок                  | [ADR-0001](0001-performance-epochs.md)                       | new           | —        | —             |
| ADR-0002 | accepted   | Граница runtime data и import-слоёв                  | [ADR-0002](0002-runtime-import-boundary.md)                  | restored      | —        | —             |
| ADR-0003 | accepted   | Воспроизводимость и граница Analyzer                 | [ADR-0003](0003-determinism-and-analyzer.md)                 | restored      | —        | —             |
| ADR-0004 | superseded | Жизненный цикл обычной атаки                         | [ADR-0004](0004-player-attack-lifecycle.md)                  | restored      | —        | ADR-0008      |
| ADR-0005 | superseded | Control Ledger для контроля и физических зон         | [ADR-0005](0005-control-ledger.md)                           | restored      | —        | ADR-0010      |
| ADR-0006 | accepted   | Trigger Dispatch для контролируемых объектов         | [ADR-0006](0006-trigger-dispatch.md)                         | restored      | —        | —             |
| ADR-0007 | accepted   | Typed Decoder и typed Effect Runtime Catalog         | [ADR-0007](0007-typed-effect-catalog.md)                     | restored      | —        | —             |
| ADR-0008 | accepted   | Attack Instance, режимы Defense и граница ЖДК        | [ADR-0008](0008-attack-instance-defense-and-dwt-boundary.md) | new           | ADR-0004 | —             |
| ADR-0009 | accepted   | Доказательство цикла цепочки ATTACK                  | [ADR-0009 / RQ-001](0009-attack-chain-cycle-proof.md)        | new           | —        | —             |
| ADR-0010 | accepted   | PhysicalCardLedger и разрешение идентификаторов карт | [ADR-0010](0010-physical-card-ledger.md)                     | new           | ADR-0005 | —             |
