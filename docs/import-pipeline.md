# Import Pipeline Guide

Короткий справочник для агентов и человека, которые ведут локальный импорт карт, свойств волшебников и жетонов мертвого волшебника.

Использовать вместе с:

- `docs/rules-glossary.md` для терминов;
- `docs/rules-canon.md` только когда задача требует runtime mapping или сверки правил;
- `.scratch/krutagidon-import-pipeline/PRD.md` для текущего плана валидаторов и отчетов.

Не использовать draft JSON как вход движка. Движок читает только runtime JSON.

## Главный принцип

Пайплайн импорта делится на три слоя:

1. raw markdown - человекочитаемый OCR/source extraction;
2. draft JSON - структурированный паспорт видимых/source-фактов и сомнений;
3. runtime JSON - исполняемые данные для engine.

Raw markdown нужен для ручной сверки текста и источника. Он может быть неполным или содержать OCR-сомнения.

Draft JSON фиксирует то, что видно на карте, свойстве или жетоне: стабильный ID, источник, видимый текст, видимые числа, типы, маркеры и `uncertainty`. Это не исполняемый формат.

Runtime JSON - единственный слой, где появляются engine effects, runtime schemas, playability flags, mapping status и другие решения о поведении в симуляторе.

## Что запрещено в draft JSON

Draft JSON не должен содержать runtime-поля:

- `engine`;
- `runtimeSchema`;
- `playableInV0`;
- `mappingStatus`.

Engine mapping заполняется только на отдельном runtime JSON шаге. OCR-текст и draft JSON не должны парситься во время партии.

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
- `cost` или `victoryPoints` пустые там, где обычно ожидаются;
- есть записи в `visible.uncertainty`;
- `typeRu` выглядит необычно;
- id не совпадает с ожидаемым именем файла.

Для массового импорта нужен отчет с warnings. Для перехода к runtime mapping нельзя продолжать, если есть errors.

## ID Style

ID не должен зависеть от OCR-названия карты, свойства или жетона. Русское название хранится как видимое поле, а не как ключ.

Для нового импорта использовать стабильный set-prefixed ID:

```text
esw2_dbg__<category>_<number>
```

Примеры:

```text
esw2_dbg__main_001
esw2_dbg__legend_001
esw2_dbg__starter_001
esw2_dbg__familiar_001
esw2_dbg__wizard_property_001
esw2_dbg__dead_wizard_token_001
esw2_dbg__wild_magic
esw2_dbg__limp_wand
```

Текущие исторические runtime IDs вроде `wizard-property-001` и `dead_wizard_token_001` нужно переименовать отдельной миграцией позже. Новый импорт должен сразу использовать новый стиль.

Draft-валидатор проверяет новый стиль и соответствие категории ID виду draft. Исторические runtime IDs не менять в рамках draft validation.

Если каталог еще не утвержден, использовать стабильный ID от имени исходного файла и не менять его без причины.

## Минимальный cardDraft

```json
{
  "schemaVersion": 1,
  "draftKind": "cardDraft",
  "cardId": "esw2_dbg__main_001",
  "source": {
    "image": "assets/cards/raw/1000009089.jpg",
    "text": "data/import/card-texts/esw2_dbg__main_001.md"
  },
  "visible": {
    "nameRu": "",
    "cost": null,
    "victoryPoints": null,
    "typeRu": null,
    "cardKind": null,
    "cardTypes": [],
    "textRu": "",
    "markers": [],
    "uncertainty": []
  },
  "notes": []
}
```

### cardKind

`cardKind` описывает структурный вид карты.

| Видна на карте / из источника | `visible.cardKind` | Что важно |
| --- | --- | --- |
| обычная карта основной колоды | `normal` | Типы идут в `cardTypes`. |
| карта легенды | `legend` | Также может иметь типы в `cardTypes`. |
| беспредел | `mayhem` | Не обычная покупаемая карта. |
| мегабеспредел | `megaMayhem` | Событие из колоды легенд. |
| фамильяр | `familiar` | Личный покупаемый фамильяр. |
| шальная магия | `wildMagic` | Нет обычного типа карты. |
| вялая палочка | `limpWand` | Нет обычного типа карты. |
| затравка | `starter` | Для стартовых карт. |

### cardTypes

`cardTypes` - обычные типы карт для эффектов "получи/уничтожь карту такого типа".

Разрешенные значения:

- `wizardCard` - волшебник;
- `creature` - тварь;
- `spell` - заклинание;
- `treasure` - сокровище;
- `location` - место;
- `familiar` - фамильяр, если карта прямо является фамильяром;
- `legend` - карта легенды, если на карте есть этот маркер.

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
"markers": ["ongoing", "attack", "defense", "activate", "marketChipMarker"]
```

Не добавлять `engine`-секцию на этапе draft JSON.

### Когда тип не указан

Если на карте нет обычного типа, не писать `"unknown"` без причины.

Правильно:

```json
"cardTypes": []
```

и добавить сомнение только если OCR реально не смог прочитать видимый тип:

```json
"uncertainty": ["Не удалось уверенно прочитать тип карты."]
```

Для `limpWand` и `wildMagic` пустой `cardTypes` - не ошибка.

## Минимальный wizardPropertyDraft

```json
{
  "schemaVersion": 1,
  "draftKind": "wizardPropertyDraft",
  "tokenId": "esw2_dbg__wizard_property_001",
  "kind": "wizardProperty",
  "source": {
    "image": "assets/wizard-property/raw/Свойство 1.jpg",
    "text": "data/import/wizard-property-texts/esw2_dbg__wizard_property_001.md"
  },
  "visible": {
    "sourceLabel": "Свойство 1",
    "textRu": "",
    "uncertainty": []
  },
  "notes": []
}
```

## Минимальный deadWizardTokenDraft

```json
{
  "schemaVersion": 1,
  "draftKind": "deadWizardTokenDraft",
  "tokenId": "esw2_dbg__dead_wizard_token_001",
  "kind": "deadWizardToken",
  "source": {
    "image": "assets/DWT/raw/example.jpg",
    "text": "data/import/DWT-texts/esw2_dbg__dead_wizard_token_001.md"
  },
  "visible": {
    "sourceLabel": "",
    "textRu": "",
    "victoryPoints": null,
    "uncertainty": []
  },
  "notes": []
}
```

## Runtime Mapping

Runtime mapping начинается только после валидного draft JSON.

На этом шаге человек или агент:

- переносит исполняемые данные в `data/cards/`, `data/tokens/` или `data/decks/`;
- добавляет `runtimeSchema`;
- добавляет `engine.effects` и typed handlers только для поддержанных механик;
- явно отмечает неподдержанные механики, если объект еще не playable в v0;
- не меняет OCR/source-факты без причины.

Runtime JSON должен быть самодостаточным для engine. Он не должен ссылаться на `data/import/**` как на исполняемый источник.
