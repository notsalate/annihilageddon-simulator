# Main Deck Draft Import Audit

Дата: 2026-06-21

## Legacy `data/import/card-texts`

Старые `data/import/card-texts/*.md` были не каноническим входом для issue 02: их `ocr_###` номера не совпадали с текущими `data/import/cards/main/texts/ocr_###`.

Сопоставление по `visible Russian name`:

- `esw2_dbg__ocr_035.md` -> `esw2_dbg__ocr_020.md` (`Тапки-Донатки`) - unique visible facts not found.
- `esw2_dbg__ocr_037.md` -> `esw2_dbg__ocr_021.md` (`Волчий жор`) - unique visible facts not found.
- `esw2_dbg__ocr_040.md` -> `esw2_dbg__ocr_022.md` (`Чёрная овца чащоб`) - unique visible facts not found.
- `esw2_dbg__ocr_043.md` -> `esw2_dbg__ocr_024.md` (`Берсерк щелкунчик`) - preserved punctuation in defense text: `избежать атаки. Если сбросил`.
- `esw2_dbg__ocr_067.md` -> `esw2_dbg__ocr_040.md` (`Потный ГикПиг`) - unique visible facts not found.
- `esw2_dbg__ocr_071.md` -> `esw2_dbg__ocr_042.md` (`Ламповое желание`) - unique visible facts not found.
- `esw2_dbg__ocr_073.md` -> `esw2_dbg__ocr_043.md` (`Близнец-Бубенец`) - unique visible facts not found.
- `esw2_dbg__ocr_098.md` -> `esw2_dbg__ocr_062.md` (`2M`) - unique visible facts not found.
- `esw2_dbg__ocr_103.md` -> `esw2_dbg__ocr_067.md` (`2N`) - unique visible facts not found.
- `esw2_dbg__ocr_109.md` -> `esw2_dbg__ocr_073.md` (`2G`) - unique visible facts not found.

After the audit, legacy `data/import/card-texts` was removed.

## Main `index.json`

`data/import/cards/main/index.json` contained only derived bookkeeping facts already present in canonical main markdown:

- `cardId` duplicated the historical `ocr_###` filename.
- `sourceImagePath` duplicated source image path.
- `extractionFile` pointed back to the same main markdown file.

It was removed so `data/import/cards/main/texts/*.md` remains the canonical source for main draft generation.
