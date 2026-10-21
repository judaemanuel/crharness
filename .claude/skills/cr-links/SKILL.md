---
name: cr-links
description: Use when the user asks to find, review or update relations between the PRs and findings of the crharness (same Jira, PR citing another PR, Jira issue links, same root cause across repos). Sporadic and incremental; it only reads the area's own index and never edits reviews, GitHub or Jira.
---

# CR Links

Finds relations that nobody wrote down, keeps them in `reviews/_index/relations.json`, and lets the user confirm or reject them. Only **confirmed** relations reach the Obsidian maps (`moc/`).

All commands run from the area root in PowerShell: `node .claude/skills/cr-links/scripts/relations.js <command>`. Run `cr-common/scripts/ingest.js` first when reviews changed (see the `cr-insights` skill); `scan` reads `reviews/_index/items.json`.

## Relation types

| Type | Evidence | Who decides |
|---|---|---|
| `jira-same` | two PRs of the same Jira | user, in batch |
| `jira-link` | Jira issue link in `pr-info.json` (e.g. "created by"); the target may be outside the corpus | user, in batch |
| `pr-mention` | a review or PR body names another PR of the corpus (repo name next to the number, or its URL) | user, in batch |
| `same-cause` | two items of different PRs share distinctive identifiers (class, field, file name); a model then judges them | model advises, user decides **one by one** |

Same repo and same base branch are views in `PACK.md`/`moc/`, not relations.

## Workflow

1. `scan` (add `--full` to force). Finds deterministic relations and same-cause candidates, no model involved. Reports "Nada novo" when `items.json` did not change.
2. `list --unjudged` shows same-cause candidates without a judgment. For each one run `detail <Lid>` (it prints both ends in full), read both sides and record the judgment:
   `judge <Lid> --verdict same|related|unrelated --note "<short reason>"`
   - `same`: same root cause or two ends of the same defect. `related`: same file/pattern/consequence, different root cause. `unrelated`: only a token coincides; this rejects the candidate (it never comes back unless its evidence changes).
   - The note goes to local files and to `moc/`: never quote secrets, credentials, tokens or personal data in it.
   - With more than ~10 candidates, delegate the judging to a Sonnet subagent (medium effort); with fewer, do it inline.
3. Show the user the table (`list --status proposto`) and ask for decisions. Batch for the deterministic ones: `decide --all-deterministic --status confirmado`. One by one for the others: `decide L12 --status confirmado` or `--status rejeitado`. Never decide for the user.
4. `render` writes `reviews/_index/RELATIONS.md` (no out-of-scope text). Then run the `moc` mode of `cr-insights` to refresh the maps (`moc/causa/` appears for confirmed `same` groups).

## Rules

- Writes only `reviews/_index/relations.json` and `RELATIONS.md`. Never edits `review.md`, `STATUS.md`, `PACK.md`, `INPUT.md`, and never calls GitHub or Jira.
- A rejected relation does not return unless its `evidenceHash` changes (new text in the review). A changed evidence reopens it as `proposto` with the earlier status in `previousStatus`.
- Undecided proposals that the scan no longer produces are removed; decided ones stay, flagged `stale`.
- Out-of-scope observations can carry credentials or PII: `detail` prints them locally for judging, but `RELATIONS.md` and `moc/` show only ids.
- Candidates come from shared identifiers and, for the taxonomy categories flagged `linkCandidates` (secrets, sensitive data in logs), from the same category in different PRs (`classification.json`, made by `cr-insights`). Category is supporting evidence: adding it to a pair already found never reopens a decided relation. Other causes with no shared identifier and no flagged category are not found.
