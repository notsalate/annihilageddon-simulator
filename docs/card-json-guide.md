# Card JSON Guide

Короткий справочник для агентов, которые превращают OCR markdown карт в JSON.

Использовать вместе с:

- `docs/rules-glossary.md` для терминов;
- issue `03-convert-first-ocr-batch-to-card-json-drafts.md` для черновых JSON;
- issue `04-map-first-supported-cards-and-build-v0-playable-data-pack.md` для engine mapping.

Не читать весь `docs/rules-canon.md` для простого OCR -> JSON draft, если issue не требует engine mapping.

## Главный принцип

Пайплайн карты делится на два слоя:

- draft JSON - что написано/видно на карте;
- runtime JSON - что симулятор должен исполнять.

Draft JSON не содержит исполняемых engine effects, `runtimeSchema`, `playableInV0` или `mappingStatus`.

Engine mapping заполняется только на отдельном runtime JSON шаге.

Каждый draft JSON должен иметь обязательное поле `draftKind`, чтобы валидатор понял, какую схему применять:

- `cardDraft`;
- `wizardPropertyDraft`;
- `deadWizardTokenDraft`.

## Draft validation

Draft-валидатор должен возвращать ошибки и предупреждения.

`error` означает, что draft нельзя передавать дальше в runtime mapping:

- JSON не читается;
- нет `draftKind`;
- нет стабильного id;
- нет видимого текста;
- есть запрещенная runtime-секция: `engine`, `runtimeSchema`, `playableInV0` или `mappingStatus`;
- значение не подходит схеме выбранного `draftKind`.

`warning` означает, что draft можно читать дальше, но человеку стоит проверить сомнение:

- нет ссылки на исходную картинку;
- `cost` или `victoryPoints` пустые там, где обычно ожидаются;
- есть записи в `visible.uncertainty`;
- `typeRu` выглядит необычно;
- id не совпадает с ожидаемым именем файла.

Для массового импорта нужен отчет с warnings. Для перехода к runtime mapping нельзя продолжать, если есть errors.

## cardId

`cardId` и `tokenId` не должны зависеть от OCR-названия карты или жетона.

Для нового импорта использовать стабильный ID с префиксом набора:

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

Если каталог ещё не утверждён, использовать стабильный ID от имени исходного файла и не менять его без причины.

## Минимальный draft JSON

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
  }
}
```

## cardKind

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

## cardTypes

`cardTypes` - обычные типы карт для эффектов "получи/уничтожь карту такого типа".

Разрешённые значения:

- `wizardCard` - волшебник;
- `creature` - тварь;
- `spell` - заклинание;
- `treasure` - сокровище;
- `location` - место;
- `familiar` - фамильяр, если карта прямо является фамильяром;
- `legend` - карта легенды, если на карте есть этот маркер.

## Вялая палочка

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
- у неё нет обычного типа карты;
- она имеет отдельный `cardKind = "limpWand"`;
- у неё нет play effect;
- `victoryPoints = -1`.

## Шальная магия

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
- у неё нет обычного типа карты;
- runtime choice/effects назначаются на этапе engine mapping, не в OCR draft.

## Постоянка, атака, защита, активация

Эти признаки можно записывать в `visible.markers`, если они видны на карте:

```json
"markers": ["ongoing", "attack", "defense", "activate", "marketChipMarker"]
```

Не добавлять `engine`-секцию на этапе draft JSON.

## Когда тип не указан

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

## Минимальный draft свойства

```json
{
  "schemaVersion": 1,
  "draftKind": "wizardPropertyDraft",
  "tokenId": "wizard-property-001",
  "kind": "wizardProperty",
  "source": {
    "image": "assets/wizard-property/raw/Свойство 1.jpg",
    "text": "data/import/wizard-property-texts/wp_001.md"
  },
  "visible": {
    "sourceLabel": "Свойство 1",
    "textRu": "",
    "uncertainty": []
  },
  "notes": []
}
```

## Минимальный draft ЖДК

```json
{
  "schemaVersion": 1,
  "draftKind": "deadWizardTokenDraft",
  "tokenId": "dead-wizard-token-001",
  "kind": "deadWizardToken",
  "source": {
    "image": "assets/DWT/raw/example.jpg",
    "text": "data/import/DWT-texts/dead_wizard_token_001.md"
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
