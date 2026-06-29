# AGENTS.md

## Purpose

This folder contains the local planning workflow for card runtime clusters.

## Ownership

- Owns `card-cluster-decisions.json` as the manual source of truth for cluster decisions.
- Owns `card-runtime-cluster-matrix.md` as generated reporting output.
- Owns issue files and PRD files in this feature folder together with the parent `.scratch/AGENTS.md` workflow.

## Local Contracts

- Edit `card-cluster-decisions.json` manually when assigning or revising card clusters.
- Do not edit `card-runtime-cluster-matrix.md` manually; regenerate it from the command.
- Generated matrix facts must come from import drafts, current runtime card JSON, current compositions, and manual decisions only.
- Do not use deleted legacy runtime card JSON as planning input.

## Work Guidance

- Bootstrap or refresh decisions with `npm run report:card-runtime-clusters -- --write-decisions`.
- Refresh the generated matrix with `npm run report:card-runtime-clusters -- --write`.
- For a full refresh after new drafts appear, run `npm run report:card-runtime-clusters -- --write-decisions --write`.

## Verification

- Run `npm run report:card-runtime-clusters` to verify that every draft card has an explicit decision.
- Run `npm run report:card-runtime-clusters -- --write` after decision changes that should update the matrix.

## Child DOX Index

None.
