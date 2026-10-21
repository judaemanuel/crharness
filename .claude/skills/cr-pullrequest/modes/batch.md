# Mode: batch (several PRs from `reviews/INPUT.md`)

Called by [sync.md](sync.md) with the PRs whose plan is init or review (states `novo`, `aguardando-anexos`, `desatualizado`). Input is `reviews/INPUT.md` ([template](../templates/INPUT.md)). If the user pasted a list instead, write it to `reviews/INPUT.md` first and confirm it back.

Only the review itself runs in parallel. The input gate (screenshots, contracts) stays human and happens once for the whole run.

## Phase 1: prepare (sequential, no subagents)

1. Take the rows already parsed and classified by [sync.md](sync.md) (parsing and state rules live there).
2. For each row run [init.md](init.md) steps 1-5 **without halting**: create the PR folder, read Jira, write `input/NEEDED.md`. Rows already in `revisado`/`publicado` are not part of the run unless the user says otherwise. Closed/merged/draft PRs were already listed by sync and stay excluded until the user decides.
3. Ask **once**, consolidated: per PR, the files to drop in `input/` and optional external material (e.g. "PR A: 3 prints; PR B: nothing; PR C: contract of service X"). HALT.
4. Parse the reply: `pronto` (all), `pronto exceto <PRs>`, `sem anexos` (all or listed). Update each `NEEDED.md` decision with the date. PRs the user excluded stay `PENDENTE` and are not reviewed in this run.

## Phase 2: snapshot and dispatch

1. For each ready PR, sequentially (cheap `gh`/MCP calls), run [review.md](review.md) steps 1-3: metadata, round folder, snapshot, `prior-findings.md`/`delta.diff` for rounds ≥ 2. If the latest round folder exists without a `review.md` (an earlier failed run), reuse it; do not create a new round.
2. Announce before dispatching (per PR: label, model/effort; why: fan-out of independent reviews; next: notification per PR). Then launch the subagents from [../reviewer-prompt.md](../reviewer-prompt.md): `general-purpose`, `model: "opus"`, `effort: "high"`, **at most 4 at the same time** (waves of 4 if there are more). Launch each wave in one message.
3. Set `{OUTPUT_PATH}` to the absolute `r<N>-<sha7>/review.md` of that PR. The subagent writes the report there and returns **only a short summary** (verdict, counts by severity, pending decisions, what it could not read).

## Phase 3: close (as each job finishes)

For each finished job, validate **from the file on disk**, without loading the whole report into context:
- The file exists, is non-empty and has the required headings and header fields (`Rodada`, `Publicado`, `Veredito`), in the bullet-list format of [review.md](review.md) step 5.
- Extract every `**Onde:**` reference of section 4 and check with `Select-String` that the `file` appears on a `+`/`-` line of that round's `snapshot/pr.diff`. Move failures to out-of-scope or flag them.
- Rounds ≥ 2: every prior open finding appears with its original ID.

Report each PR's result as it completes (verdict, counts, file path). A PR whose job failed, timed out or returned an empty file is marked **falhou** (never "limpo"); its snapshot stays so it can be re-run with the single-PR command.

When all jobs are done, regenerate each PR's `STATUS.md` and `PACK.md` **once** ([index.md](index.md)), then give the user a final table: PR | Jira | round | verdict | open findings | pending decisions | failures.

## Rules

- PRs are independent: a failure in one never blocks the others.
- Never overwrite an existing `review.md`; a PR with an unchanged SHA is not re-reviewed.
- Same read-only rule as the rest of the skill: nothing is posted to GitHub or Jira.
