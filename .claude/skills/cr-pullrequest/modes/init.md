# Mode: init (inputs)

Goal: create the PR folder and make sure the user provided what the review needs before spending the Opus run.

1. **Parse** the PR URL (`owner/repo/number`) and the Jira key. If no Jira key was given, try the `[KEY-123]` prefix in the PR title; else ask.
2. **Create** `reviews/<repo>-PR<n>/input/`. Do not create round folders yet.
3. **Read Jira**: `getAccessibleAtlassianResources` (cloudId), then `getJiraIssue` with `fields: ["*all"]`, `expand: "names"`, `responseContentFormat: "markdown"`.
4. **Detect needed inputs** and list them in `input/NEEDED.md` (use [templates/NEEDED.md](../templates/NEEDED.md)):
   - Every Jira attachment, by file name (the MCP does not expose attachment content; the user downloads them into `input/`). Images are marked as relevant evidence.
   - Links in the description/comments to Confluence pages or other documents, as optional items.
   - Any external contract the story depends on but this repo does not hold (another service's API), as optional, marked "pedir ao autor/requisitante".
5. **Ask** the user whether there is more material to add. HALT and wait for "pronto" (files are in `input/`) or "sem anexos".
6. On confirmation: list `input/`. Only now mark `[x]` in the `✔` column of each item whose file is actually in `input/`, and fill its `Arquivo em input/` cell with the file name. Never pre-mark `[x]`, and leave `[ ]` (and an empty cell) for items with no file. Set the NEEDED.md decision to `CONFIRMADO` or `SEM ANEXOS` with the date. Anything optional that is missing is recorded as a limit and will appear in "Premissas e limites" of the review.
7. Continue to [review.md](review.md) as `r1`.
