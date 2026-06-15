# Card JSON Guide

Короткий справочник для агентов, которые превращают OCR markdown карт в JSON.

Использовать вместе с:

- `docs/rules-glossary.md` для терминов;
- issue `03-convert-first-ocr-batch-to-card-json-drafts.md` для черновых JSON;
- issue `04-map-first-supported-cards-and-build-v0-playable-data-pack.md` для engine mapping.

Не читать весь `docs/rules-canon.md` для простого OCR -> JSON draft, если issue не требует engine mapping.

## Главный принцип

JSON карты делится на два слоя:

- `visible` - что написано/видно на карте;
- `engine` - что симулятор должен исполнять.

Issue 03 заполняет в основном `visible`.

Issue 04 заполняет `engine`.

## cardId

`cardId` не должен зависеть от OCR-названия карты.

Использовать стабильный нейтральный ID:

```text
esw2_dbg__main_001
esw2_dbg__legend_001
esw2_dbg__starter_001
esw2_dbg__wild_magic
esw2_dbg__limp_wand
```

Если каталог ещё не утверждён, использовать стабильный ID от имени исходного файла и не менять его без причины.

## Минимальный draft JSON

```json
{
  "cardId": "esw2_dbg__main_001",
  "source": {
    "image": "assets/cards/raw/1000009089.jpg"
  },
  "visible": {
    "nameRu": "",
    "cost": null,
    "victoryPoints": null,
    "cardKind": null,
    "cardTypes": [],
    "textRu": "",
    "markers": [],
    "uncertainty": []
  },
  "engine": {
    "needsEffectMapping": true,
    "effects": [],
    "unsupportedMechanics": []
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
  },
  "engine": {
    "needsEffectMapping": true,
    "effects": []
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
  },
  "engine": {
    "needsEffectMapping": true,
    "effects": []
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

Не назначать полноценные `engine.effects` на этапе issue 03.

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

