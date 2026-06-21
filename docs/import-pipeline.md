# Import Pipeline Guide

Короткий справочник для агентов и человека, которые ведут локальный импорт карт, свойств волшебников и жетонов мертвого волшебника.

Использовать вместе с:

- `docs/runtime-layout.md` для целевого layout;
- `docs/rules-glossary.md` для настольных и игровых терминов;
- `docs/rules-canon.md` только когда задача требует runtime mapping или сверки правил;
- `.scratch/krutagidon-import-pipeline/PRD.md` для исторического плана валидаторов и отчетов, если он нужен.

Не использовать draft JSON как вход движка. Движок читает только runtime JSON и composition files из pack.

## Главный принцип

Пайплайн импорта идет по цепочке:

```text
image -> source md -> draft JSON -> runtime JSON -> pack
```

Слои:

1. source markdown - человекочитаемый текстовый источник, на который ссылается `source.text`;
2. draft JSON - структурированный паспорт видимых/source-фактов и сомнений;
3. runtime JSON - исполняемые данные для engine;
4. pack inclusion - явное включение runtime definitions в deck, stack, pool и pack manifest.

Source markdown нужен для ручной сверки текста и источника. Он не обязан происходить из OCR, и каноническая документация не должна называть его OCR-текстом.

Draft JSON фиксирует то, что видно на карте, свойстве или жетоне: стабильный ID, источник, видимый текст, видимые числа, типы, markers и `uncertainty`. Это не исполняемый формат.

Runtime JSON - единственный слой, где появляются engine effects, runtime schemas, playability flags, mapping status и другие решения о поведении в симуляторе.

## Целевые пути

Целевой layout описан в `docs/runtime-layout.md`. Для нового импорта использовать эти пути:

```text
assets/cards/<source-group>/
assets/dead-wizard-token/
assets/wizard-property/

data/import/cards/<source-group>/texts/
data/import/cards/<source-group>/drafts/
data/import/tokens/dead-wizard-token/texts/
data/import/tokens/dead-wizard-token/drafts/
data/import/tokens/wizard-property/texts/
data/import/tokens/wizard-property/drafts/

data/cards/<source-group>/
data/tokens/dead-wizard/
data/tokens/wizard-property/
data/decks/
data/stacks/cards/
data/stacks/tokens/
data/pools/
data/packs/
```

`<source-group>` для карт: `main`, `legend`, `starter`, `familiar`, `special`.

Не добавлять новые canonical data files в legacy import или raw asset paths, которые не описаны в `docs/runtime-layout.md`.

## Что запрещено в draft JSON

Draft JSON не должен содержать runtime-поля:

- `engine`;
- `runtimeSchema`;
- `playableInV0`;
- `mappingStatus`.

Engine mapping заполняется только на отдельном runtime JSON шаге. Source text и draft JSON не должны парситься во время партии.

## draftKind

Каждый draft JSON должен иметь обязательное поле `draftKind`, чтобы валидатор выбрал правильную схему.

Поддержанные значения:

- `cardDraft` - карты, фамильяры, легенды, беспределы, мегабеспределы, шальная магия, вялая палочка и затравки;
- `wizardPropertyDraft` - свойства волшебников;
- `deadWizardTokenDraft` - жетоны мертвого волшебника.

## Draft Validation

Draft-валидатор должен возвращать `errors` и `warnings`.

`error` означает, что draft нельзя передавать дальше в runtime mapping:

- JSON не читается;
- нет `draftKind`;
- нет стабильного id;
- нет видимого текста;
- есть запрещенное runtime-поле: `engine`, `runtimeSchema`, `playableInV0` или `mappingStatus`;
- значение не подходит схеме выбранного `draftKind`.

`warning` означает, что draft можно читать дальше, но человеку стоит проверить сомнение:

- нет ссылки на исходную картинку;
- нет ссылки `source.text`;
- `cost` или `victoryPoints` пустые там, где обычно ожидаются;
- есть записи в `visible.uncertainty`;
- `typeRu` выглядит необычно;
- id не совпадает с ожидаемым именем файла.

Для массового импорта нужен отчет с warnings. Для перехода к runtime mapping нельзя продолжать, если есть errors.

## Import Completeness Report

Команда `npm run report:import` должна считать полноту импорта по наличию файлов:

- source image;
- source markdown;
- draft JSON;
- runtime JSON;
- inclusion в pack/deck/stack/pool.

`processed`, `processedMarker` и `status: processed` не являются canonical data markers и не должны использоваться как источник статуса.

## ID Style

ID не должен зависеть от названия карты, свойства или жетона. Русское название хранится как видимое поле, а не как ключ.

Для нового runtime импорта карт использовать стабильный source-group ID:

```text
esw2_dbg__<source-group>_<number>
```

Примеры:

```text
esw2_dbg__main_001
esw2_dbg__legend_001
esw2_dbg__starter_001
esw2_dbg__familiar_001
esw2_dbg__limp_wand
esw2_dbg__wild_magic
```

Карточный смысл, русские названия, видимые типы и поведение не должны попадать в IDs или filenames. Исключение: уникальные singleton special stack objects используют явные стабильные IDs `esw2_dbg__limp_wand` и `esw2_dbg__wild_magic`.

Для токенов использовать стабильные token IDs:

```text
esw2_dbg__wizard_property_001
esw2_dbg__dead_wizard_token_001
```

Исторические runtime IDs менять только в issue миграции runtime IDs, не в этом контрактном шаге.

## Минимальный cardDraft

См. `docs/templates/card-draft.json`.

Ключевые правила:

- ссылка на markdown source text идет через `source.text`;
- `visible.cardKind` описывает структурный вид карты;
- `visible.cardTypes` хранит обычные card types для эффектов;
- gameplay markers хранятся в `visible.markers`;
- не добавлять `engine`-секцию на этапе draft JSON.

### cardKind

| Видна на карте / из источника | `visible.cardKind` | Что важно                             |
| ----------------------------- | ------------------ | ------------------------------------- |
| обычная карта основной колоды | `normal`           | Типы идут в `cardTypes`.              |
| карта легенды                 | `legend`           | Также может иметь типы в `cardTypes`. |
| беспредел                     | `mayhem`           | Не обычная покупаемая карта.          |
| мегабеспредел                 | `megaMayhem`       | Событие из колоды легенд.             |
| фамильяр                      | `familiar`         | Личный покупаемый фамильяр.           |
| шальная магия                 | `wildMagic`        | Нет обычного типа карты.              |
| вялая палочка                 | `limpWand`         | Нет обычного типа карты.              |
| затравка                      | `starter`          | Для стартовых карт.                   |

### cardTypes

`cardTypes` - обычные типы карт для эффектов "получи/уничтожь карту такого типа".

Разрешенные значения:

- `wizardCard` - волшебник;
- `creature` - тварь;
- `spell` - заклинание;
- `treasure` - сокровище;
- `location` - место;
- `familiar` - фамильяр, если карта прямо является фамильяром;
- `legend` - карта легенды, если на карте есть этот marker.

### Вялая палочка

Вялая палочка типизируется так:

```json
{
  "visible": {
    "cardKind": "limpWand",
    "cardTypes": [],
    "victoryPoints": -1
  }
}
```

Важно:

- это не `spell`, не `treasure`, не `wizardCard`, не `location`, не `creature`;
- у нее нет обычного типа карты;
- она имеет отдельный `cardKind = "limpWand"`;
- у нее нет play effect;
- `victoryPoints = -1`.

### Шальная магия

Шальная магия типизируется так:

```json
{
  "visible": {
    "cardKind": "wildMagic",
    "cardTypes": [],
    "cost": 3
  }
}
```

Важно:

- это отдельная стопка;
- у нее нет обычного типа карты;
- runtime choice/effects назначаются на этапе engine mapping, не в draft.

### Постоянка, атака, защита, активация

Эти признаки можно записывать в `visible.markers`, если они видны на карте:

```json
["ongoing", "attack", "defense", "activate", "marketChipMarker"]
```

## Token Drafts

Шаблоны:

- `docs/templates/token-draft.json`
- `docs/templates/token-runtime.json`

Wizard property и dead wizard token остаются token definitions. Они не становятся card definitions.

## Runtime Mapping

Runtime mapping начинается только после валидного draft JSON.

На этом шаге человек или агент:

- переносит исполняемые данные в `data/cards/<source-group>/`, `data/tokens/dead-wizard/` или `data/tokens/wizard-property/`;
- добавляет `runtimeSchema`;
- добавляет `engine.effects` и typed handlers только для поддержанных механик;
- явно отмечает неподдержанные механики, если объект еще не playable в v0;
- не меняет source facts без причины.

Runtime JSON должен быть самодостаточным для engine. Он не должен ссылаться на `data/import/**` как на исполняемый источник.

После runtime mapping объект должен быть включен в нужный `deck`, `stack`, `pool` и `pack`. Шаблоны лежат в:

- `docs/templates/deck.json`
- `docs/templates/stack.json`
- `docs/templates/pool.json`
- `docs/templates/pack.json`
