# AGENTS.md

## Purpose

This folder contains the local planning workflow for card runtime clusters.

## Ownership

- Owns `card-cluster-decisions.json` as the manual source of truth for cluster decisions.
- Owns `mechanic-clusters.md` as the human-readable source of truth for what each final `clusterId` means.
- Owns `card-runtime-cluster-matrix.md` as generated reporting output.
- Owns `inventory/` as draft mechanics inventories for Block C planning.
- Owns issue files and PRD files in this feature folder together with the parent `.scratch/AGENTS.md` workflow.

## Local Contracts

- Edit `card-cluster-decisions.json` manually when assigning or revising card clusters.
- Edit `mechanic-clusters.md` manually when defining or revising final mechanic cluster meanings.
- Assign exactly one final `clusterId` per card.
- Choose the final `clusterId` by the card's primary runtime mechanic: the large mechanic or modifier surface that gives the card its playable identity.
- Do not choose `clusterId` by the hardest sub-effect, by every secondary payload, or by an action window such as attack or defense by default.
- Attack and defense can be clusters, but a mixed card belongs elsewhere when another surface such as DWT exchange/scaling is the main mechanic shared by its actions.
- If no current cluster fits a card, keep or set `status: "needsClusterDecision"` and add a short `notes` reason instead of forcing the card into the closest cluster.
- Do not edit `card-runtime-cluster-matrix.md` manually; regenerate it from the command.
- Generated matrix facts must come from import drafts, current runtime card JSON, current compositions, and manual decisions only.
- Do not use deleted legacy runtime card JSON as planning input.
- `fullRuntime` means the card has current runtime card JSON, direct current deck/stack/pool membership, and focused test refs.
- `missingRuntime` is normal backlog state, not a process error by itself.
- `npm run report:card-runtime-clusters` must block non-full runtime card JSON, runtime card JSON without matching drafts, invalid decision references, and direct composition entries that point at missing runtime card definitions.
- `npm run report:card-runtime-clusters` must block used `clusterId` values without matching `## cluster-id` headings, unused `## cluster-id` headings, and malformed decision `clusterId` values.

## Work Guidance

- Bootstrap or refresh decisions with `npm run report:card-runtime-clusters -- --write-decisions`.
- Refresh the generated matrix with `npm run report:card-runtime-clusters -- --write`.
- For a full refresh after new drafts appear, run `npm run report:card-runtime-clusters -- --write-decisions --write`.

## Verification

- Run `npm run report:card-runtime-clusters` to verify that every draft card has an explicit decision.
- Run `npm run report:card-runtime-clusters` to verify that every present runtime card satisfies the `fullRuntime` guardrail.
- Run `npm run report:card-runtime-clusters -- --write` after decision changes that should update the matrix.

## Child DOX Index

- `inventory/AGENTS.md` - draft mechanics inventory files for card batches.
