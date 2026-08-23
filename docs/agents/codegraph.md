# CodeGraph workflow

## When to Use

Use CodeGraph first for structural source questions when the repository index and tool are available.

It is appropriate for:

- tracing a flow between known symbols;
- locating ownership of behavior;
- inspecting callers, callees, and likely impact;
- reading indexed source before a targeted edit.

Use ordinary file tools for documentation, configuration, unindexed files, or details CodeGraph does not return.

## First Query

Prefer one narrow `codegraph_explore` call per issue before editing:

- ask one natural-language flow question; or
- name one exact symbol, behavior, or file.

Do not send long keyword bags. If the result is broad or truncated, narrow immediately to one symbol, file, or behavior.

Treat returned source as already read. Do not repeat the same lookup with `rg` or `Get-Content` unless the file changed, the result is incomplete, or the index reports staleness.

After CodeGraph identifies the relevant area, switch to targeted edits and verification. Do not repeat broad graph exploration for the same area unless blocked.

## CLI Follow-up

Use the CLI only when a precise graph follow-up is needed:

```powershell
codegraph query <symbol>
codegraph node <symbol-or-file>
codegraph callers <symbol>
codegraph callees <symbol>
codegraph impact <symbol>
git diff --name-only | codegraph affected --stdin
```

If the project is not indexed or CodeGraph is unavailable, continue with targeted `rg`, file reads, and tests. Do not initialize an index unless the user asks.
