# crharness

Permanent workspace for reviewing pull requests against their Jira user stories. Backends in Java + Spring, brownfield. All reviews live in one structure; `reviews/INPUT.md` is the queue.

## Rules

- **Read-only toward external systems.** Never comment on or approve a PR, never write to Jira, never push. The user publishes manually.
- **Review scope is the PR diff.** Findings are only for lines the PR changed. Problems in untouched code go to "Observações fora do escopo" with a severity and never block the PR.
- Use **PowerShell**; the Bash tool can be broken on this machine. Use `gh` for GitHub and the Atlassian MCP for Jira.
- Reports are written in Portuguese (pt-BR). Answers to the user: BLUF, no filler.
- Everything produced goes under `reviews/`. Nothing is written inside the reviewed repositories.
- **This area is local.** It holds code excerpts and security findings: never version it or push it to a remote.
- `reviews/INPUT.md` is the user's queue: the skill never edits it. PR state is derived, not typed.
- Start with `/cr-pullrequest` (no arguments) to sync the queue, or `/cr-pullrequest <PR URL> <JIRA KEY or URL>` for one PR.

## Layout

See `README.md`. For how it works and what to run when, see `GUIDE.md` and `AJUDA.md` (pt-BR); point the user to them before improvising an explanation. The skill lives in `.claude/skills/cr-pullrequest/`.
