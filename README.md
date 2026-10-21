# crharness scaffold

Documentação em pt-BR: **[GUIDE.md](GUIDE.md)** explica como a área funciona; **[AJUDA.md](AJUDA.md)** diz o que rodar e quando, e como resolver os problemas comuns.

## Create the area (once)

1. From the scaffold repo: `node scripts/new-area.js <target-dir>`.
2. Open Claude Code in the new folder.
3. Add PRs to `reviews/INPUT.md` (template: `.claude/skills/cr-pullrequest/templates/INPUT.md`; one row per PR + Jira) and run `/cr-pullrequest` with no arguments.

## Daily use

- `/cr-pullrequest` (no arguments) = **sync**. The skill reads the queue, derives each PR's state (novo, aguardando-anexos, desatualizado, revisado, publicado, encerrado), shows the plan and asks once. It reviews what is pending (up to 4 Opus subagents at a time) and proposes archiving merged/closed PRs.
- `/cr-pullrequest <PR URL> <JIRA KEY or URL>` = a single PR. Repeat the same command later to re-review after new commits, or to apply adjustments.
- Say "publiquei" or bring the requester's decisions to record them in the review (same round, edited in place).
- Archiving only happens with your explicit confirmation.

## Layout

```
<area>/
├─ CLAUDE.md                     # area rules
├─ .claude/skills/cr-pullrequest # the skill (scaffold)
└─ reviews/
   ├─ INPUT.md                   # queue of PRs (you add rows; never edited by the skill)
   ├─ PACK.md                    # generated index of active PRs (do not edit)
   ├─ <repo>-PR<n>/
   │  ├─ input/                  # you drop screenshots/docs here; NEEDED.md says what
   │  │  └─ NEEDED.md
   │  ├─ r1-<sha7>/
   │  │  ├─ snapshot/            # frozen pr.diff, us.md, pr-body.md, meta.json
   │  │  └─ review.md
   │  ├─ r2-<sha7>/ ...          # new head SHA => new round
   │  └─ STATUS.md               # generated per-PR status (do not edit)
   └─ _archive/<repo>-PR<n>/     # finished PRs, same structure, out of the index
```

## Round rule

- Author pushed new commits (head SHA changed) => **new round** `rN`. The reviewer checks the previous open findings against the new code.
- Same code, you come back with decisions from the requester/author => **same round, edited in place** with an entry in `Histórico de revisão`.

## Keep it local

The area holds code excerpts and security findings. Do not version it or push it to a remote. The scaffold repo never contains `reviews/` content (`scripts/new-area.js` copies only the scaffold files).
