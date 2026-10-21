# Mode: sync (the whole area)

Entry point of `/cr-pullrequest` with no arguments. It reads the queue (`reviews/INPUT.md`), derives the state of every PR, proposes a plan and runs only what is pending. **Never edit `INPUT.md`**: it is the user's queue. State is always derived, never typed.

## 1. Read the queue

Parse each row of `reviews/INPUT.md` (`PR | Jira | Nota`). Normalize before using:
- PR cell: a markdown link `[text](url "title")` counts as `url`; strip the trailing `/`; extract `owner/repo/number`.
- Jira cell: same link rule; reduce to the key in upper case (`pobmktops-61204` → `POBMKTOPS-61204`).
- Skip empty rows. Rows that still do not parse (placeholders such as `<org>/<repo>`): list them and ignore them.
- The `Nota` is context for you (e.g. "par com PR 33"); pass it on, do not act on it alone.

A row whose folder is in `reviews/_archive/` is ignored.

## 2. Derive the state

In one PowerShell pass, `gh pr view <n> -R <owner>/<repo> --json state,isDraft,headRefOid,baseRefName` for each row, then:

| State | Rule |
|---|---|
| novo | no `reviews/<repo>-PR<n>/` folder |
| aguardando-anexos | `input/NEEDED.md` decision is `PENDENTE` |
| desatualizado | live head SHA ≠ SHA of the latest round |
| revisado | latest round has `review.md`, same SHA, `Publicado: não` |
| publicado | same SHA, `Publicado: sim` |
| encerrado | PR is merged or closed (takes precedence over the others) |

Draft PRs: list them and ask before continuing. Flag divergences instead of resolving them: the Jira key in `INPUT.md` ≠ the one in the latest `meta.json`.

## 3. Plan

Show one table: PR | Jira | Estado | Ação.

| Estado | Ação |
|---|---|
| novo | [init](init.md) + [review](review.md) as `r1` |
| aguardando-anexos | resume [init](init.md) |
| desatualizado | [review](review.md) as `r<N+1>` |
| revisado, publicado | nenhuma (adjustments come through [revise](revise.md) when the user brings them) |
| encerrado | propose [archive](archive.md); never archive without confirmation |

If there is nothing to run and nothing to archive, say "nada a fazer", regenerate nothing, and do not dispatch any subagent.

## 4. Confirm once, then run

Ask once: confirm the plan, and name the PRs to archive. HALT. Then:
- PRs that need init or review: run [batch.md](batch.md) phases 1-3 on exactly those PRs (the input gate stays human and happens once).
- PRs confirmed for archive: run [archive.md](archive.md).
- At the end, regenerate `STATUS.md` and `PACK.md` once ([index.md](index.md)) and give the final table.
