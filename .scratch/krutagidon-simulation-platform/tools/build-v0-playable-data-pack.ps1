$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$draftDir = Join-Path $repoRoot "data\import\card-drafts"
$cardsDir = Join-Path $repoRoot "data\cards"
$decksDir = Join-Path $repoRoot "data\decks"

New-Item -ItemType Directory -Force $cardsDir, $decksDir | Out-Null

function Effect($effectId, $props = @{}) {
    $effect = [ordered]@{ effectId = $effectId }
    foreach ($key in $props.Keys) {
        $effect[$key] = $props[$key]
    }
    return $effect
}

function Unsupported($mechanic, $reason, $visibleText) {
    return [ordered]@{
        mechanic = $mechanic
        reason = $reason
        visibleText = $visibleText
    }
}

$mapping = @{
    "esw2_dbg__ocr_001" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "attack_damage" @{ timing = "onPlay"; targetSelector = "eachFoe"; amount = 7 }
        )
    }
    "esw2_dbg__ocr_002" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "attack_destroy_top_legend_deck_then_damage_equal_cost" @{ timing = "onPlay"; targetSelector = "chosenFoe"; destroyedCardSource = "legendDeck"; damageUsesDestroyedCardCost = $true }
        )
    }
    "esw2_dbg__ocr_003" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "defense_discard_self_avoid_attack_then_optional_destroy_hand_card" @{ timing = "defense"; defenseCost = @{ effectId = "discard_self" }; avoids = "attack"; optionalFollowup = @{ effectId = "destroy_own_cards"; sourceZones = @("hand"); amount = 1; chooser = "defendingPlayer" } }
        )
    }
    "esw2_dbg__ocr_004" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "attack_gain_limp_wand" @{ timing = "onPlay"; targetSelector = "chosenLeftOrRightFoe"; amount = 1; destination = "targetDiscard" }
        )
    }
    "esw2_dbg__ocr_005" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "attack_damage" @{ timing = "onPlay"; targetSelector = "chosenPlayer"; amount = 4 }
            Effect "attack_discard_cards" @{ timing = "onPlay"; targetSelector = "sameAsPreviousAttackTarget"; sourceZone = "hand"; amount = 1; chooser = "target" }
        )
    }
    "esw2_dbg__ocr_006" = @{
        status = "supported"
        effects = @(
            Effect "activation_destroy_self_then_destroy_own_cards" @{ timing = "activation"; activationLimit = "oncePerTurnWhileControlled"; destroySelf = $true; sourceZones = @("hand"); minAmount = 0; maxAmount = 2; chooser = "controller" }
        )
    }
    "esw2_dbg__ocr_007" = @{
        status = "partial"
        effects = @(Effect "add_power" @{ timing = "onPlay"; amount = 3 })
        unsupported = @(
            Unsupported "defense_face_up_topdeck" "В v0 zones пока нет состояния face-up карты на верху колоды; маппинг как обычный topdeck изменил бы поведение." "Защита: можешь положить эту карту на верх своей колоды, лицевой стороной вверх, чтобы избежать атаки."
        )
    }
    "esw2_dbg__ocr_008" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 3 }
            Effect "gain_chips_per_player_with_status" @{ timing = "onPlay"; status = "dingler"; amountPerPlayer = 1 }
        )
    }
    "esw2_dbg__ocr_009" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "conditional_activation_attack_damage" @{ timing = "activation"; activationLimit = "oncePerTurnWhileControlled"; condition = @{ effectId = "controls_other_card_type"; cardType = "creature"; minimum = 1 }; targetSelector = "chosenFoe"; amount = 9 }
        )
    }
    "esw2_dbg__ocr_010" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "conditional_activation_destroy_own_cards" @{ timing = "activation"; activationLimit = "oncePerTurnWhileControlled"; condition = @{ effectId = "controls_other_card_type"; cardType = "creature"; minimum = 1 }; sourceZones = @("hand", "discard"); amount = 1; chooser = "controller" }
        )
    }
    "esw2_dbg__ocr_011" = @{
        status = "supported"
        effects = @(
            Effect "ongoing_add_power" @{ timing = "whileControlled"; amount = 1 }
        )
    }
    "esw2_dbg__ocr_012" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "conditional_activation_gain_chips" @{ timing = "activation"; activationLimit = "oncePerTurnWhileControlled"; condition = @{ effectId = "controls_other_card_type"; cardType = "creature"; minimum = 1 }; amount = 1 }
        )
    }
    "esw2_dbg__ocr_013" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "optional_spend_chip_attack_damage" @{ timing = "onPlay"; chipCost = 1; targetSelector = "chosenPlayer"; amount = 10 }
        )
    }
    "esw2_dbg__ocr_014" = @{
        status = "supported"
        effects = @(Effect "add_power" @{ timing = "onPlay"; amount = 3 })
    }
    "esw2_dbg__ocr_015" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "legend_purchase_discount" @{ timing = "untilEndOfTurn"; amount = 2 }
        )
    }
    "esw2_dbg__ocr_016" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "optional_spend_chip_destroy_own_cards" @{ timing = "onPlay"; chipCost = 1; sourceZones = @("hand", "discard"); amount = 1; chooser = "controller" }
        )
    }
    "esw2_dbg__ocr_017" = @{
        status = "supported"
        effects = @(
            Effect "draw_cards" @{ timing = "onPlay"; amount = 1 }
            Effect "add_power_per_controlled_permanent" @{ timing = "onPlay"; amountPerPermanent = 1 }
        )
    }
    "esw2_dbg__ocr_018" = @{
        status = "supported"
        effects = @(
            Effect "on_gain_self_gain_limp_wands" @{ timing = "onGain"; amount = 2; destination = "gainingPlayerDiscard" }
            Effect "ongoing_add_power" @{ timing = "whileControlled"; amount = 1 }
        )
    }
    "esw2_dbg__ocr_019" = @{
        status = "supported"
        effects = @(
            Effect "ongoing_hand_refill_bonus" @{ timing = "whileControlled"; amount = 1 }
        )
    }
    "esw2_dbg__ocr_020" = @{
        status = "supported"
        effects = @(
            Effect "wild_magic_choice" @{ timing = "onPlay"; options = @(
                @{ effectId = "add_power"; amount = 2 }
                @{ effectId = "play_top_card_from_foe_deck"; targetSelector = "chosenFoe"; nonOngoingCleanupDestination = "ownerDiscard"; ongoingOwnership = "controller" }
            ) }
        )
    }
    "esw2_dbg__ocr_021" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 1 }
            Effect "attack_damage" @{ timing = "onPlay"; targetSelector = "chosenPlayer"; amount = 1 }
            Effect "gain_chips_if_attack_kills_target" @{ timing = "afterAttackDamage"; amount = 3 }
        )
    }
    "esw2_dbg__ocr_022" = @{
        status = "supported"
        effects = @(Effect "add_power" @{ timing = "onPlay"; amount = 1 })
    }
    "esw2_dbg__ocr_023" = @{
        status = "supported"
        effects = @()
    }
    "esw2_dbg__ocr_024" = @{
        status = "supported"
        effects = @()
    }
    "esw2_dbg__ocr_025" = @{
        status = "supported"
        effects = @(
            Effect "mega_mayhem_each_player_destroy_top_main_deck_death_if_mayhem" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive"; destroyedCardSource = "mainDeck"; deathCondition = @{ effectId = "destroyed_card_kind_is"; cardKind = "mayhem" } }
        )
    }
    "esw2_dbg__ocr_026" = @{
        status = "supported"
        effects = @(
            Effect "mega_mayhem_each_player_toggle_dingler" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive" }
        )
    }
    "esw2_dbg__ocr_027" = @{
        status = "supported"
        effects = @(
            Effect "mega_mayhem_set_life" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive"; lifeTotal = 5 }
        )
    }
    "esw2_dbg__ocr_028" = @{
        status = "supported"
        effects = @(
            Effect "mayhem_each_player_discard_top_deck_cards_choose_destroy_all_or_none" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive"; sourceZone = "deck"; amount = 2; choice = "destroyBothOrDestroyNone"; chooser = "affectedPlayer" }
        )
    }
    "esw2_dbg__ocr_029" = @{
        status = "supported"
        effects = @(
            Effect "mayhem_each_player_choose_discard_hand_draw_or_take_damage" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive"; options = @(
                @{ effectId = "discard_hand_then_draw_cards"; drawAmount = 5 }
                @{ effectId = "take_damage"; amount = 5 }
            ); chooser = "affectedPlayer" }
        )
    }
    "esw2_dbg__ocr_030" = @{
        status = "partial"
        effects = @()
        unsupported = @(
            Unsupported "mayhem_battle_reveal_hand_total_cost" "Баттл с участием/пасом, раскрытием рук, сравнением суммарной стоимости и возможными ничьими победителями не входит в минимальный v0 handler set; карта не добавлена в v0 deck." "Баттл Кто круче: участники раскрывают руки, колдун(ы) с наивысшей суммарной стоимостью берут 2 карты, остальные участники сбрасывают руку."
        )
    }
    "esw2_dbg__ocr_031" = @{
        status = "supported"
        effects = @(
            Effect "mayhem_each_player_discard_deck_then_destroy_from_discard" @{ timing = "onMayhemResolve"; targetSelector = "eachPlayerClockwiseFromActive"; discardSourceZone = "deck"; destroySourceZone = "discard"; destroyAmount = 1; chooser = "affectedPlayer" }
        )
    }
    "esw2_dbg__ocr_032" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 1 }
            Effect "optional_gain_market_cards_to_hand_this_turn" @{ timing = "untilEndOfTurn"; appliesTo = "cardsGainedFromMainMarket"; destinationOverride = "hand"; chooser = "controller" }
        )
    }
    "esw2_dbg__ocr_033" = @{
        status = "partial"
        effects = @(
            Effect "draw_cards" @{ timing = "onPlay"; amount = 2 }
        )
        unsupported = @(
            Unsupported "activation_look_choose_reorder_legend_deck" "Активация требует посмотреть 5 верхних карт колоды Легенд, выбрать 1 в свою колоду и вернуть остальные в любом порядке; v0 deck manipulation/reorder handler ещё не зафиксирован." "[активация]: если контролируешь 11 карт или больше, посмотри 5 верхних карт колоды легенд..."
        )
    }
    "esw2_dbg__ocr_034" = @{
        status = "supported"
        effects = @(
            Effect "ongoing_first_attack_damage_add_power" @{ timing = "afterFirstAttackDamageEachTurn"; amount = "totalDamageDealtByThatAttack" }
        )
    }
    "esw2_dbg__ocr_035" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 2 }
            Effect "destroy_random_legend_market_card" @{ timing = "onPlay"; sourceZone = "legendMarket"; rng = "seeded"; rememberAs = "destroyedLegend" }
            Effect "attack_damage_equal_remembered_card_cost" @{ timing = "onPlay"; targetSelector = "eachFoe"; rememberedCard = "destroyedLegend" }
        )
    }
    "esw2_dbg__ocr_036" = @{
        status = "partial"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 8 }
            Effect "attack_damage" @{ timing = "onPlay"; targetSelector = "chosenFoe"; amount = 1 }
        )
        unsupported = @(
            Unsupported "alternate_win_on_kill" "Мгновенная победа конкретной карты вне текущей v0 модели условий конца партии и scoring; урон замаплен, мгновенная победа не замаплена." "Если он от этого подох, ты побеждаешь в игре."
        )
    }
    "esw2_dbg__ocr_037" = @{
        status = "supported"
        effects = @(
            Effect "draw_cards" @{ timing = "onPlay"; amount = 3 }
            Effect "attack_damage" @{ timing = "onPlay"; targetSelector = "eachFoe"; amount = 20 }
        )
    }
    "esw2_dbg__ocr_038" = @{
        status = "supported"
        effects = @(
            Effect "ongoing_start_turn_optional_gain_limp_wand_to_hand" @{ timing = "startOfControllerTurn"; amount = 1; destination = "hand"; chooser = "controller" }
            Effect "ongoing_add_power_when_playing_limp_wand" @{ timing = "afterControllerPlaysCard"; cardKind = "limpWand"; amount = 3 }
            Effect "endgame_limp_wands_score_positive" @{ timing = "scoring"; appliesToOwnedCardKind = "limpWand"; scoreMode = "absolutePositiveVictoryPoints" }
        )
    }
    "esw2_dbg__ocr_039" = @{
        status = "supported"
        effects = @(
            Effect "add_power" @{ timing = "onPlay"; amount = 1 }
            Effect "endgame_vp_per_owned_legend" @{ timing = "scoring"; amountPerOwnedLegend = 2 }
        )
    }
}

$cardFiles = Get-ChildItem $draftDir -Filter "*.json" | Sort-Object Name
$summary = [ordered]@{
    schemaVersion = 1
    generatedFrom = "data/import/card-drafts"
    generatedBy = ".scratch/krutagidon-simulation-platform/tools/build-v0-playable-data-pack.ps1"
    cardCounts = [ordered]@{
        mapped = 0
        supported = 0
        partial = 0
        unsupported = 0
    }
    unsupportedCards = @()
    deckStatus = [ordered]@{
        starterDeck = "supported"
        mainDeck = "supported-first-batch-fixture"
        wildMagicStack = "supported"
        limpWandStack = "supported"
        legendDeck = "supported-first-batch-fixture"
    }
    notes = @(
        "Runtime-поведение карт закодировано явными effectId objects; engine не должен парсить visible.textRu во время партии.",
        "v0 main/legend decks являются first-batch fixture: они используют только supported карты и исключают partial mappings."
    )
}

foreach ($file in $cardFiles) {
    $draft = Get-Content -Raw -Encoding UTF8 $file.FullName | ConvertFrom-Json
    $cardId = $draft.cardId
    if (-not $mapping.ContainsKey($cardId)) {
        throw "No engine mapping entry for $cardId"
    }

    $entry = $mapping[$cardId]
    $status = $entry.status
    $unsupported = @()
    if ($entry.ContainsKey("unsupported")) {
        $unsupported = @($entry.unsupported)
    }
    $effects = @($entry.effects)
    $needsEffectMapping = $status -ne "supported"

    $summary.cardCounts.mapped += 1
    $summary.cardCounts[$status] += 1
    if ($status -ne "supported") {
        $summary.unsupportedCards += [ordered]@{
            cardId = $cardId
            nameRu = $draft.visible.nameRu
            mappingStatus = $status
            reasons = @($unsupported | ForEach-Object { $_.reason })
        }
    }

    $visible = [ordered]@{}
    foreach ($prop in $draft.visible.PSObject.Properties) {
        $visible[$prop.Name] = $prop.Value
    }

    $cardTypes = @($draft.visible.cardTypes)
    $markers = @($draft.visible.markers)
    $isOngoing = $markers -contains "ongoing"
    $marketChipMarker = $markers -contains "marketChipMarker"
    $engineVictoryPoints = $draft.visible.victoryPoints
    if ($null -eq $engineVictoryPoints -and ($draft.visible.cardKind -eq "mayhem" -or $draft.visible.cardKind -eq "megaMayhem")) {
        $engineVictoryPoints = 0
    }

    $final = [ordered]@{
        schemaVersion = 1
        cardId = $cardId
        source = [ordered]@{
            draft = ("data/import/card-drafts/{0}.json" -f $cardId)
            image = $draft.source.image
            ocrText = $draft.source.ocrText
        }
        visible = $visible
        engine = [ordered]@{
            runtimeSchema = "krutagidon.cardDefinition.v0"
            mappingStatus = $status
            playableInV0 = ($status -eq "supported")
            needsEffectMapping = $needsEffectMapping
            cardKind = $draft.visible.cardKind
            cardTypes = $cardTypes
            cost = $draft.visible.cost
            victoryPoints = $engineVictoryPoints
            isOngoing = $isOngoing
            marketChipMarker = $marketChipMarker
            effects = $effects
            unsupportedMechanics = $unsupported
        }
    }

    $outPath = Join-Path $cardsDir ("{0}.json" -f $cardId)
    $final | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $outPath
}

function Deck($deckId, $role, $status, $entries, $notes = @()) {
    return [ordered]@{
        schemaVersion = 1
        deckId = $deckId
        runtimeSchema = "krutagidon.deckComposition.v0"
        role = $role
        mappingStatus = $status
        entries = $entries
        notes = $notes
    }
}

$starterEntries = @(
    [ordered]@{ cardId = "esw2_dbg__ocr_022"; count = 6 }
    [ordered]@{ cardId = "esw2_dbg__ocr_021"; count = 1 }
    [ordered]@{ cardId = "esw2_dbg__ocr_023"; count = 3 }
)

$mainEntries = @(
    "esw2_dbg__ocr_001",
    "esw2_dbg__ocr_002",
    "esw2_dbg__ocr_004",
    "esw2_dbg__ocr_005",
    "esw2_dbg__ocr_006",
    "esw2_dbg__ocr_008",
    "esw2_dbg__ocr_009",
    "esw2_dbg__ocr_010",
    "esw2_dbg__ocr_011",
    "esw2_dbg__ocr_012",
    "esw2_dbg__ocr_013",
    "esw2_dbg__ocr_014",
    "esw2_dbg__ocr_015",
    "esw2_dbg__ocr_016",
    "esw2_dbg__ocr_017",
    "esw2_dbg__ocr_018",
    "esw2_dbg__ocr_019",
    "esw2_dbg__ocr_003",
    "esw2_dbg__ocr_028",
    "esw2_dbg__ocr_029",
    "esw2_dbg__ocr_031"
) | ForEach-Object { [ordered]@{ cardId = $_; count = 2 } }

$wildMagicEntries = @([ordered]@{ cardId = "esw2_dbg__ocr_020"; count = 15 })
$limpWandEntries = @([ordered]@{ cardId = "esw2_dbg__ocr_024"; count = 15 })
$legendEntries = @(
    "esw2_dbg__ocr_025",
    "esw2_dbg__ocr_026",
    "esw2_dbg__ocr_027",
    "esw2_dbg__ocr_032",
    "esw2_dbg__ocr_034",
    "esw2_dbg__ocr_035",
    "esw2_dbg__ocr_037",
    "esw2_dbg__ocr_038",
    "esw2_dbg__ocr_039"
) | ForEach-Object { [ordered]@{ cardId = $_; count = 2 } }

Deck "v0-starter-deck" "starterDeckTemplate" "supported" $starterEntries @("Per-player starter deck: 6 Знак, 1 Сырная палочка, 3 Пшик.") |
    ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-starter-deck.json")

Deck "v0-main-deck-first-batch" "mainDeck" "supported-first-batch-fixture" $mainEntries @("First-batch fixture deck. Excludes partial card esw2_dbg__ocr_007.") |
    ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-main-deck-first-batch.json")

Deck "v0-wild-magic-stack" "wildMagicStack" "supported" $wildMagicEntries @("Russian rules stack size: 15.") |
    ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-wild-magic-stack.json")

Deck "v0-limp-wand-stack" "limpWandStack" "supported" $limpWandEntries @("Russian rules stack size: 15.") |
    ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-limp-wand-stack.json")

Deck "v0-legend-deck-first-batch" "legendDeck" "supported-first-batch-fixture" $legendEntries @("First-batch fixture deck. Excludes partial cards esw2_dbg__ocr_030, esw2_dbg__ocr_033, and esw2_dbg__ocr_036.") |
    ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-legend-deck-first-batch.json")

$manifest = [ordered]@{
    schemaVersion = 1
    packId = "v0-first-batch-playable-data-pack"
    runtimeSchema = "krutagidon.dataPack.v0"
    mappingStatus = "supported-first-batch-v0"
    cardsPath = "data/cards"
    decks = [ordered]@{
        starterDeck = "data/decks/v0-starter-deck.json"
        mainDeck = "data/decks/v0-main-deck-first-batch.json"
        legendDeck = "data/decks/v0-legend-deck-first-batch.json"
        wildMagicStack = "data/decks/v0-wild-magic-stack.json"
        limpWandStack = "data/decks/v0-limp-wand-stack.json"
    }
    counts = $summary.cardCounts
    unsupportedCards = $summary.unsupportedCards
    needsData = @()
    notes = $summary.notes
}

$manifest | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $decksDir "v0-first-batch-data-pack.json")
$summary | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $cardsDir "_v0-mapping-report.json")
