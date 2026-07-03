# Issue tracker: GitHub + local working area

The main tracker for this repo is GitHub Issues. Use the `gh` CLI for issue and external PR triage work.

Local files under `.scratch/` remain the working area for PRDs, handoffs, temporary local issues, run artifacts, and other session materials.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply or remove labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`. `gh` resolves it automatically inside this clone.

## Pull requests as a triage surface

External PRs are part of the incoming triage flow for this repo.

- Read a PR: `gh pr view <number> --comments` and `gh pr diff <number>`
- List external PRs for triage: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, then keep PRs from non-member external authors
- Comment, label, or close: `gh pr comment`, `gh pr edit --add-label` / `--remove-label`, `gh pr close`

GitHub shares one number space across issues and PRs, so `#42` may be either. Resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## Local working area

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Local implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Local status notes stay inside the markdown file itself
- Comments and session notes append under a `## Comments` heading when needed

## When a skill says "publish to the issue tracker"

Create a GitHub issue unless the task explicitly says to keep it local in `.scratch/`.

## When a skill says "fetch the relevant ticket"

If the reference is a GitHub number, use `gh issue view <number> --comments` or `gh pr view <number> --comments`.
If the user points at an exact local file in `.scratch/`, read that file first and keep the session anchored to it.
