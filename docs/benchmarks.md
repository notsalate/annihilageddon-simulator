# Benchmark-контракт

Benchmark измеряет только уже проверенный workload: сборка, запуск npm, меню и ввод пользователя в замер не входят. Перед каждым измерением выполняется один прогрев, затем три замера; итоговые времена — медианы.

## Активная эпоха

Активная база `E1` хранится в [performance-epoch-e1.json](benchmarks/performance-epoch-e1.json). Принятые допуски хранятся отдельно в неизменяемом версионированном артефакте [performance-calibration-e1-v1.json](benchmarks/performance-calibration-e1-v1.json). Они фиксируют commit, протокол, класс runner и бюджеты массовой симуляции и профилей Best-Move Analyzer. Артефакты E0 остаются неизменяемой историей.

База не переписывается результатом очередного запуска. Если меняются правила игры, reference workload, версия Node.js или runner, сначала выполняется новая калибровка и явно принимается новая эпоха. Обычный рефакторинг без изменения объёма работы остаётся в текущей эпохе.

Для новой калибровки запусти workflow `performance` вручную с `calibration=true`; тот же процесс запускается по недельному расписанию. Workflow собирает 20 пар на свежих runner и публикует candidate, но не изменяет принятый артефакт. Candidate нужно проверить и явно принять новым версионированным JSON-файлом в `docs/benchmarks/`; существующие принятые файлы не переписываются. Для новой эпохи дополнительно укажи `baseline=true`: candidate принимается в новом файле следующей эпохи.

## Ступени

| Назначение                                   |        Ступень | Роль                                                 |
| -------------------------------------------- | -------------: | ---------------------------------------------------- |
| smoke-проверка harness                       |      10 партий | reference или current                                |
| PR                                           |     100 партий | current; reference хранит тот же стабильный workload |
| nightly                                      |   1 000 партий | current                                              |
| weekly и крупные слияния                     |  10 000 партий | current                                              |
| вручную перед релизом и после крупных этапов | 100 000 партий | current                                              |

Reference симуляции ограничен ступенями 10 и 100. Большие ступени не становятся новой reference-базой. Все workload рассчитаны только на двух игроков.

## Массовая симуляция

Команда `npm run benchmark:simulation` запускает reference workload для ступени 10 партий. Ступень можно выбрать через `--stage 10|100|1000|10000|100000`; seed всегда образуют вложенный диапазон `1..N`. Для текущей игры используется `--role current`, а дополнительные параметры задаются через `--firstSeed`, `--maxTurns` и `--dataPackPath`.

Reference workload рассчитан на двух игроков и должен проходить setup, ходы, розыгрыш карт, эффекты, сброс, reshuffle и итоговый подсчёт. Его идентификатор и версия (`simulation-reference-v1`) не меняются молча: изменение seed, лимита ходов, состава ступеней или manifest требует явного пересмотра baseline.

## Best-Move Analyzer

Команда `npm run benchmark:analyzer` запускает профиль `light`. Профиль выбирается через `--profile light|typical|heavy`, а роль — через `--role reference|current`.

Reference seed фиксирован по профилям:

- `light`: `1, 6, 7, 8`;
- `typical`: `2, 4, 9`;
- `heavy`: `3, 5, 10`.

Сложность профиля определяется seed-набором и лимитами поиска, а не измеренным временем. Analyzer работает только с двумя игроками и критерием `victory-points`; оптимизация алгоритма и изменение критерия в этот контракт не входят.

### Диагностический запуск Analyzer

Для одного профиля запусти:

```powershell
npm run diagnose:analyzer -- --profile light --format human
npm run diagnose:analyzer -- --profile heavy --format json --artifacts .scratch/tmp/analyzer-heavy
```

Команда последовательно выполняет три независимых запуска одного workload:

1. `clean benchmark` — обычный benchmark с одним прогревом и тремя измерениями;
2. `diagnostic run` — один запуск с фактическими счётчиками Analyzer;
3. `CPU profile` — отдельный запуск Node с `--cpu-prof`, без счётчиков.

Счётчики показывают применения действий, клоны `GameState`, повторные исполнения для choice paths, промежуточные и терминальные состояния, а также число операций и элементов, скопированных в paths и event log. В `phases` отдельно видны enumeration, ranking и вызовы evaluation policy; клоны и копирование, созданные для изоляции policy, отмечены в `evaluationPolicy`.

Только время и fingerprint `clean benchmark` сопоставимы с контрактом `ADR-0001` и E1. Инструментированное и профилируемое время помечены `diagnostic-only`: они не меняют baseline, performance epoch или CI gate. Все три запуска обязаны дать один `resultFingerprint`.

Артефакты (`clean-benchmark.json`, `diagnostic-run.json`, `cpu-run.json`, `*.cpuprofile`, `summary.json` и `summary.txt`) сохраняются в `.scratch/tmp/analyzer-diagnostics/` либо в каталог из `--artifacts`; они не являются исходными данными проекта. Путь к итоговой JSON-сводке можно задать через `--output`.

CPU-сводка группирует sampled self-time по JavaScript (включая скомпилированный TypeScript), V8, native operations и GC, а также показывает первые hotspots с URL, строкой и столбцом generated JavaScript. Это помогает выбрать кандидата для оптимизации; CPU profile не является allocation profile и не заменяет heap snapshot.

## Сравнение PR и калибровка

Запуск benchmark с `--output path.json` сохраняет нормализованный машинный артефакт. Для PR нужны одинаковые артефакты `base`, `head` и повторного `head`:

```powershell
npm run benchmark:epoch -- --baseline docs/benchmarks/performance-epoch-e1.json --acceptedCalibration docs/benchmarks/performance-calibration-e1-v1.json --epochReference e1-fresh.json --base base.json --head head.json --confirmation head-repeat.json --format human --output performance-report.json
```

Сравнение показывает `PR regression` (`base`/`head`) и `Epoch health` (свежий E1/head) раздельно и называет источник блокировки. Для блокирующего `regression` нужны совпадающие epoch, workload, протокол, точная физическая среда, общий `comparisonPairId` и совместимая принятая калибровка. Изменение workload возвращает неблокирующий `workload-changed`; отсутствие свежего E1 — `not-measured`; отсутствие совместимой калибровки или смена класса runner — `not-calibrated`.

Калибровка принимает артефакт с 20 парными запусками одного commit и одного класса runner. Класс включает версию Node.js, платформу, архитектуру, образ runner и число CPU; свежие runner могут иметь разные модели CPU, и эта вариативность входит в рассчитанный допуск. Внутри каждой пары оба замера должны использовать точное окружение:

```powershell
npm run benchmark:epoch:calibrate -- --calibration pairs.json --format json --output calibration.json
```

Каждая пара обязана использовать один seed-набор, один прогрев, три измерения и медиану. Калибровка проверяет commit и класс runner, а допуск вычисляет по p95 наблюдаемого расхождения с запасом 25%.
Обычный PR не запускает 20 calibration jobs и не принимает свежий budget. Он измеряет E1, base и head в одном job и использует только принятый артефакт, совместимый с текущими workload, протоколом и классом runner.
Candidate принятой калибровки собирается командой `node scripts/create-performance-calibration-candidate.mjs <calibration-dir> <output> <calibration-id>`. Скрипт требует один commit, протокол и класс runner, но допускает разные модели CPU между независимыми calibration jobs. Принятие выполняется только отдельным изменением репозитория.
Для сборки candidate активной эпохи из CI-артефактов используется `node scripts/create-performance-epoch-baseline.mjs <reference-dir> <calibration-dir> <output>`. Скрипт отклоняет reference и калибровку с разными commit, идентификаторами workload или классами runner.
Артефакт каждой стороны должен содержать SHA именно измеренного checkout: для `head` workflow передаёт SHA PR, для `base` — SHA базовой ветки; локальный запуск без `--commit` использует `GITHUB_SHA`, если он задан.
Если старый `base` ещё не знает PR-ступень 100, workflow запускает его собранный `simulation-benchmark` через совместимый адаптер, который добавляет только эту допустимую числовую ступень и не меняет код base. Сравнение всех четырёх workload завершается после публикации отчётов: отдельный gate блокирует PR только по отчётам с `blocking: true` и не скрывает остальные профили из-за первой регрессии.

## Отчёт и артефакты

По умолчанию вывод человекочитаемый. Машинный отчёт получается флагом `--format json`; `--output` сохраняет JSON-артефакт запуска или сравнения. Reference и current не смешиваются автоматически и не получают performance verdict только по факту замера. В репозитории хранятся база эпохи и явно принятые версионированные калибровки; результаты запусков PR, nightly, weekly и кандидаты ручных проверок остаются артефактами CI.

Оба benchmark сообщают полное время, фазы, throughput, объём работы, отпечаток workload и отпечаток результата. Массовая симуляция дополнительно показывает число завершённых партий, достижений `maxTurns` и покрытие reference-пути; для ступеней от 10 000 партий — прирост пиковой памяти RSS относительно исключённого прогрева. Analyzer показывает число линий, действий, ветвлений, достигнутых лимитов и такой же прирост пиковой памяти.

Fingerprint workload включает версию контракта, epoch, профиль, игроков, seed или seed-диапазон, лимиты и `Runtime Data manifest`. Fingerprint результата строится из детерминированных итогов партий либо найденных и ранжированных линий. Параметры окружения и commit записываются рядом с результатом и не маскируют изменение workload.
