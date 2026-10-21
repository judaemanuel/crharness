# Mode: index (STATUS.md and PACK.md)

Both files are generated from the `review.md` files. Never edit them by hand; regenerate after any review or revise.

## STATUS.md (per PR) — [template](../templates/STATUS.md)

Read every `r*/review.md` of the PR. From each:
- Header: round, head SHA, date, `Veredito`, `Publicado`.
- Findings: lines matching `### F<n> · <severity> · <type> — <title>` and the `**Status:**` line under each. Copy the title verbatim; never shorten or reword it. The state of a finding is its status in the **latest** round that mentions it; keep the round where it first appeared.
- Out-of-scope table rows of the latest round, with their `Status` when the table has that column (older reviews do not: leave it empty).

## PACK.md (`reviews/PACK.md`) — [template](../templates/PACK.md)

Read only `reviews/*/STATUS.md` (never `reviews/_archive/`). Sections:

1. **Ativos**: one row per PR: PR, Jira, base branch, state, latest round, head SHA, verdict, open findings (counts of `Aberto`/`Mantido` by severity), pending decisions, published (`sim`/`não`), last update. Sort by last update, newest first. State comes from [sync.md](sync.md) when it ran in this turn; otherwise derive only what files show (`aguardando-anexos`, `revisado`, `publicado`) and write `sem consulta ao GitHub` under the table.
2. **Por Jira**: only Jira keys with 2+ active PRs: Jira, PRs, open findings summed by severity, pending decisions.
3. **Por repo**: repo, active PRs, open findings summed by severity.
4. **Por base branch**: base branch (from the latest `meta.json`), PRs. Groups PRs of the same release.
5. **Arquivados**: only the count of folders in `reviews/_archive/`.

**Pending decisions** = findings of the latest round with status `Aberto` or `Mantido` whose type is `decisão` or `maybe-false`; list their IDs, e.g. `2 (F1, F3)`. Findings of type `defeito` are counted in "Abertos" only.

Relations come only from explicit keys (Jira, repo, base branch). Do not infer links between PRs.

If a `review.md` does not follow the expected headings, list the PR in the index with `formato não reconhecido` instead of guessing.
