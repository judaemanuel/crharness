---
name: cr-pullrequest
description: Use when asked to review a GitHub pull request against its Jira user story inside a crharness, to re-review after the author pushes new commits, to revise a review after discussing it with the requester, to run the whole queue (`reviews/INPUT.md`), to archive finished PRs, or to refresh the status index. Findings are strictly scoped to lines changed by the PR; pre-existing issues are reported separately and never block.
---

# PR Code Review (crharness)

One entry point: `/cr-pullrequest <PR URL> <Jira key or URL>` for one PR, or `/cr-pullrequest` with no arguments to sync the whole area from `reviews/INPUT.md` ([modes/sync.md](modes/sync.md)). You detect the state and run the matching mode. An Opus subagent does the adversarial review; you collect context, validate and write files. **Read-only toward GitHub and Jira: never comment, approve, push or write to Jira.**

## Rules (non-negotiable)

- **Scope = lines added/modified/deleted by the PR.** A finding is "do PR" only if its cause is in the diff. New code that breaks old behavior is in scope.
- Problems in untouched code go to **Observações fora do escopo** with severity. They never change the verdict. Critical ones are also flagged at the top of the report.
- The diff base is the PR's `baseRefName`, never the default branch.
- Use PowerShell. Beyond the diff, read repo files only with `gh api` at the head SHA, on demand.
- Separate **fato verificado** from **hipótese**. PR-body claims (tests passing, etc.) are claims, not evidence.
- State in the report what could not be read (images, external contracts).
- Dates and times come from `Get-Date`. All paths passed to subagents are absolute.
- Never overwrite a `review.md` except in revise mode. Never edit `STATUS.md` / `PACK.md` by hand; regenerate them ([modes/index.md](modes/index.md)).

## Layout and names

```
reviews/<repo>-PR<n>/        <repo> = GitHub repo name, <n> = PR number
  pr-info.json               PR-level data: author, Jira owner/type/links, dates (refreshed each round)
  input/NEEDED.md + user files
  r<N>-<sha7>/snapshot/      pr.diff, us.md, pr-body.md, meta.json, [prior-findings.md, delta.diff]
  r<N>-<sha7>/review.md
  STATUS.md
reviews/INPUT.md             queue of PRs (user-owned; the skill never edits it)
reviews/PACK.md              generated index of active PRs, next to the PR folders
reviews/_archive/<repo>-PR<n>/   finished PRs, same structure, out of the index
```

## Mode routing

Resolve `reviews/<repo>-PR<n>/` from the PR URL, read the PR head SHA (`gh pr view --json headRefOid`), compare with the latest round folder.

| State | Mode |
|---|---|
| PR folder missing | [modes/init.md](modes/init.md), then [modes/review.md](modes/review.md) as `r1` |
| Folder exists and `input/NEEDED.md` is `PENDENTE` | [modes/init.md](modes/init.md) (resume) |
| Head SHA differs from the latest round | [modes/review.md](modes/review.md) as `r<N+1>` |
| Same SHA and the user brings decisions, adjustments or "publiquei" | [modes/revise.md](modes/revise.md) |
| Same SHA, nothing new | Tell the user nothing changed; ask what they want. Do not re-run the subagent |
| User asks for status/index only | [modes/index.md](modes/index.md) |
| No arguments, or the user asks to run the queue (`reviews/INPUT.md`) | [modes/sync.md](modes/sync.md) (derives each PR's state, then reuses batch, archive and index) |
| User gives several PRs | Write them to `reviews/INPUT.md`, then [modes/sync.md](modes/sync.md) |
| User asks to archive finished PRs | [modes/archive.md](modes/archive.md) (only with explicit confirmation) |

If the PR is closed, merged or draft, say so and ask before continuing.

## Subagent announcement

Before dispatching, announce: why (adversarial review needs an independent, stronger model), what (1 subagent `general-purpose`, `model: "opus"`, `effort: "high"`), next (the user is notified on completion).
