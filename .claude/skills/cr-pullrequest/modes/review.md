# Mode: review (a new round)

Runs for `r1` (after init) and for every later round caused by a new head SHA.

1. **Metadata.** `gh pr view <n> -R <owner>/<repo> --json number,title,state,isDraft,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,body,commits,files`. Round number = latest round + 1 (or 1); if the latest round folder has the same head SHA but no `review.md` (an earlier run failed), reuse that folder instead of creating a new round. Round folder: `r<N>-<sha7>/` (first 7 chars of `headRefOid`).
2. **Snapshot** in `r<N>-<sha7>/snapshot/`:
   - `pr.diff` from `gh pr diff <n> -R <owner>/<repo>` (UTF-8). If > 3000 lines, warn and propose chunking by file group.
   - `pr-body.md` (PR title + body + commit headlines).
   - `us.md` from Jira: summary, description, acceptance criteria, technical subtasks/notes, human comments (ignore automation comments). Acceptance criteria usually live in a custom field named like "Critérios de Aceite" / "Acceptance Criteria" (use `expand: names` to find it; in POBMKTOPS it is `customfield_11700`); fall back to the description.
   - `meta.json`: repo, PR number, Jira key, base ref, head ref, head SHA, date/time, round.
   - `reviews/<repo>-PR<n>/pr-info.json` (PR level, **not** frozen per round; write it in round 1 and overwrite it every round, reusing the Jira issue already read and `gh pr view --json author,createdAt,mergedAt,closedAt,state`): `schemaVersion: 1`, `fetchedAt`, `pr` {repo, number, author (login), authorName, createdAt, state, mergedAt, closedAt, baseRef} and `jira` {key, type, status, priority, reporter (displayName = owner of the US), assignee, created, links [{relation, key, type}] from `issuelinks`}. The PR author is the executor. No e-mails, no account IDs. UTF-8 without BOM.
3. **Rounds ≥ 2 only.**
   - `prior-findings.md`: from the previous round's `review.md`, every finding (ID, severity, type, title, where, status, decision notes) plus the out-of-scope observations.
   - `delta.diff`: `gh api repos/<owner>/<repo>/compare/<prevSha>...<newSha>` as a diff (`-H "Accept: application/vnd.github.diff"`). If it fails (force-push/rebase), say so and omit; the reviewer then compares by reading the new diff.
4. **Dispatch** the subagent using [../reviewer-prompt.md](../reviewer-prompt.md). Fill the placeholders with absolute paths. `{INPUT_DIR}` is `reviews/<repo>-PR<n>/input` (or `none` if the user chose "sem anexos"). Pass paths, never diff text. Set `{OUTPUT_PATH}` to `none` when running a single PR (the subagent returns the report text and you write it); in [batch.md](batch.md) it is the absolute path of `review.md` and the subagent writes it itself.
5. **Validate** the returned report before writing:
   - Every "Findings do PR" item cites a `file:line` that appears on a `+`/`-` line of `snapshot/pr.diff` (check with `Select-String`). Otherwise move it to out-of-scope or drop it.
   - Every finding has a verdict, "Fato verificado" or "Hipótese", and "O que decide" when unsure.
   - Required sections and the header fields (`Rodada`, `Publicado`, `Veredito`) are present. The header is a bullet list, one field per line (`- **Campo:** valor`), with no trailing period; fix the format yourself if it differs.
   - Rounds ≥ 2: every prior open finding appears with its original ID and a status; new findings continue numbering after the highest prior ID; findings with status `Aceito`/`Rejeitado` were not re-raised without a code change that invalidates the decision.
   - If the subagent failed or returned empty, tell the user. Never present an empty result as a clean review.
6. **Write** `r<N>-<sha7>/review.md`. Then regenerate `STATUS.md` and `PACK.md` ([index.md](index.md)).
7. **Summarize** to the user (BLUF): verdict, findings by severity, pending decisions, limits, and the file path.
