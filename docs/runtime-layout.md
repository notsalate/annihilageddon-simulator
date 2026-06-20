# Runtime Layout

Целевой контракт для данных Крутагидона. Этот документ описывает layout, к которому мигрируют import и runtime данные. Он не означает, что все файлы уже физически перенесены.

## Boundaries

- `CONTEXT.md` хранит язык проекта и симулятора.
- `docs/rules-glossary.md` хранит настольные и игровые термины.
- `docs/import-pipeline.md` описывает путь от исходника до runtime и pack inclusion.
- Runtime данные должны быть самодостаточны для engine и не должны требовать чтения draft JSON во время партии.

## Assets

Исходные изображения группируются по игровому источнику, а не по видимому типу карты.

```text
assets/
  cards/
    creature/
    familiar/
    legend/
      creature/
      location/
      spell/
      treasure/
      wizard-card/
    location/
    mayhem/
    mega-mayhem/
    special/
    spell/
    starter/
    treasure/
    wizard-card/
  dead-wizard-token/
  wizard-property/
```

`special` используется для особых runtime-карт и стопок, например Wild Magic и Limp Wand. Если позже появятся реальные варианты обработанных изображений, для них нужно явно зафиксировать отдельный контракт. Слова `processed` в пути или данных не являются каноническим маркером статуса.

## Import Data

Import данные не являются входом engine. Они фиксируют путь подготовки данных:

```text
data/import/
  cards/
    main/
      texts/
      drafts/
    legend/
      texts/
      drafts/
    starter/
      texts/
      drafts/
    familiar/
      texts/
      drafts/
    special/
      texts/
      drafts/
  tokens/
    dead-wizard-token/
      texts/
      drafts/
    wizard-property/
      texts/
      drafts/
```

Markdown в `texts/` - это source text. Он может быть сделан вручную или любым локальным способом, но каноническое поле ссылки всегда `source.text`.

Draft JSON хранит видимые/source-факты и сомнения. Draft не содержит исполняемые effects, `runtimeSchema`, `playableInV0` или runtime `mappingStatus`.

## Runtime Cards

Runtime-карты группируются по source group:

```text
data/cards/
  main/
  legend/
  starter/
  familiar/
  special/
```

Разрешенные source groups для карт:

- `main`
- `legend`
- `starter`
- `familiar`
- `special`

Visible card types (`wizardCard`, `creature`, `spell`, `treasure`, `location`) остаются в данных карты, но не определяют путь файла.

## Runtime Tokens

Token definitions хранятся отдельно от card definitions:

```text
data/tokens/
  dead-wizard/
  wizard-property/
```

Жетоны, свойства волшебника, трофеи и статусы не должны моделироваться как карты только ради переиспользования card layout.

## Packs, Decks, Stacks, Pools

Runtime compositions разделены по роли:

```text
data/packs/
data/decks/
data/stacks/
  cards/
  tokens/
data/pools/
```

- `data/packs/` - manifest набора данных, который указывает используемые runtime definitions и compositions.
- `data/decks/` - настоящие колоды карт, из которых тянут карты.
- `data/stacks/cards/` - стопки карт, которые не являются обычными draw decks, например Wild Magic или Limp Wand.
- `data/stacks/tokens/` - стопки жетонов, например Dead Wizard Tokens или wizard properties.
- `data/pools/` - выбираемые или общие пулы, например familiars, если они моделируются как pool.

`data/packs/v0-first-batch.json` - runnable first-batch regression pack. `data/packs/full-import.json` - future manifest для полного импорта; он может перечислять incomplete/non-playable definitions, но не означает, что все карты уже playable.

## ID Style

Runtime card IDs используют стабильный source-group numbering:

```text
esw2_dbg__<source-group>_<number>
```

Примеры:

```text
esw2_dbg__main_001
esw2_dbg__legend_001
esw2_dbg__starter_001
esw2_dbg__familiar_001
esw2_dbg__special_001
```

ID и filenames не должны кодировать:

- русские названия;
- видимые типы карт;
- текст карты;
- поведение или эффект.

Специальные runtime-карты можно хранить в `special`; их стабильный ID все равно должен оставаться source-group ID, если нет отдельного принятого исключения.

Token IDs используют такой же источник и стабильную категорию, например:

```text
esw2_dbg__dead_wizard_token_001
esw2_dbg__wizard_property_001
```

## Status

`processed`, `processedMarker` и `status: processed` не являются каноническими markers. Статус импорта выводится из наличия файлов:

1. source image;
2. source markdown;
3. draft JSON;
4. runtime JSON;
5. inclusion в pack/deck/stack/pool.

Gameplay markers остаются реальными данными, если они видны на карте:

```json
["attack", "defense", "ongoing", "activate", "marketChipMarker"]
```
