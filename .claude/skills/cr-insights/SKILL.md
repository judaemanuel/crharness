---
name: cr-insights
description: Use when the user asks to refresh the area's derived index (items, ledger), to categorize findings, to generate the Obsidian maps of content (`moc/`), to build the HTML dashboard with indicators and insights from the reviews, or to build the shareable HTML reports of out-of-scope observations and of uncorrected findings (potential tickets, technical debt). Sporadic and incremental. Read-only toward GitHub and Jira; it never edits reviews.
---

# CR Insights

Derived views over the reviews of this crharness. Run it when the user asks, not on every review. Everything is deterministic (no model) in the modes below.

## Modes available

| Mode | What it does | Command (PowerShell, from the area root) |
|---|---|---|
| `ingest` | Parses every `review.md` (active and `_archive`) plus `pr-info.json` into `reviews/_index/items.json`; extracts severity (normalized to `critical/high/medium/low`) and architectural layer; keeps `reviews/_index/ledger.json` so unchanged rounds are not re-parsed. `--full` forces a re-parse. | `node .claude/skills/cr-common/scripts/ingest.js .` |
| `moc` | Rebuilds `moc/` (Obsidian maps: home, service, layer, Jira, release, one note per finding/observation, people when allowed). | `node .claude/skills/cr-insights/scripts/moc.js .` |
| `classify` | Gives every finding/observation (latest round of each PR) one category (+ optional secondary) from `taxonomy.json`. Incremental: only new, changed or taxonomy-affected items are pending; unchanged items inherit the category of an earlier round. | see "Classify" below |
| `facts` | Computes every number (totals, by category/severity/layer/service/release/Jira/status, matrices, pending decisions, critical/high, relations, sample size) into `reviews/_index/facts.json`. No model. | `node .claude/skills/cr-insights/scripts/facts.js .` |
| `insights` | Optional: the model keeps a **registry of insights** (`insights-registry.json`: text, detail, state, history) and `build` writes `reviews/_index/insights.html` (see "Insights" below). Only insights validated against the current facts reach the dashboard (`insights.json`, generated). | `insights.js show` / `pending` / `apply <file>` / `build` |
| `dashboard` | Builds `reviews/_index/dashboard.html`: one self-contained file (data embedded, no network, no libraries) with filters, charts, table views and the insights. | `node .claude/skills/cr-insights/scripts/build-dashboard.js .` (needs a fresh `facts.json`) |
| `oos` | Builds `reviews/_index/fora-do-escopo.html`: every out-of-scope observation (severity, origin, text, category, layer, status, outcome after approval, confirmed same-cause links) with filters and a "copy for ticket" button. No model. **Embeds the observation text, redacted** (see "Shareable reports"). | `node .claude/skills/cr-insights/scripts/oos-report.js .` |
| `pendencias` | Builds `reviews/_index/pendencias-tickets.html`: everything the reviews found (inside or outside the PR scope) that was not corrected, with type, evidence, impact, arguments for and against opening a ticket, recommendation and who decides. The analysis is written by the model (see "Shareable reports"). | `pendencias.js pending`, then `apply <file>`, then `build` |
| `all` | `ingest`, `classify`, `facts`, `insights` (re-validate what is pending, then build; with no insights yet it only creates the empty page), `oos`, `pendencias` (analyse what is pending, then build), `dashboard`, `moc` (the maps come last so `moc/_Home.md` links to pages that already exist). Writing the first insights stays an optional step. | the commands, in that order |

`moc/_Home.md` starts with a "Atalhos" section: `file:///` links that open the dashboard, the insights page, the out-of-scope report and the pending/tickets report in the default browser (Obsidian cannot open an HTML file inside the vault; a page not generated yet is flagged), plus links to `PACK` and `RELATIONS` when they exist. The four HTML pages share a navigation bar (`lib/nav.js`), so the dashboard links to the other three and each of them links back. The URL is absolute and machine-specific, so it is generated on every `moc` run and must not be copied between machines. The scaffold also ships `.obsidian/bookmarks.json` with `moc/_Home.md` bookmarked.

## Insights (optional, the model writes them; the registry keeps them)

Insights used to be overwritten on every generation. They now live in `reviews/_index/insights-registry.json`, one record each: `titulo`, `text` (with placeholders), `detalhe` (why it matters, how it was derived, limits, hypotheses), `acaoSugerida`, state, dates, the values it cited when validated and a history. `insights.html` shows them with their situation; `insights.json` (read by the dashboard) is generated from the registry and holds **only the insights validated against the current facts**.

- **State**: `vigente` (validated against the current `facts.json`), `a-revalidar` (the data changed since: the page shows the sentence with the numbers it had when validated, and the values then and now), `retirado` (no longer makes sense; kept with the reason).
- **Creating**: read `reviews/_index/facts.json` (keys such as `totals.criticalHigh`, `byCategory.<id>`, `relations.sameCause`, `sample.prs`), write a JSON array of operations to a temporary file outside the area and run `insights.js apply <file>`: `add` (`titulo`, `text`, `detalhe`, optional `acaoSugerida`/`nota`), `update` (changes fields and re-validates), `validate` (still holds, nothing else changes), `retire` (`motivo` required). Invalid operations reject the whole batch. Then `insights.js build`.
- **Re-validating**: `insights.js pending` lists the insights to re-validate with the values then and now and a summary of the facts. For each one decide `validate`, `update` or `retire`. Never leave a changed insight as `vigente` without reading it: a sentence can keep valid placeholders and stop being true.
- **Numbers only through placeholders**: `{totals.criticalHigh}`, `{byCategory.concorrencia-consistencia}`. Never type a number in `text`. Allowed literals are identifiers: PR references (`#244`) and alphanumeric names (`F3`, `O1`, `DB2`). `apply` and `build-dashboard.js` replace the placeholders with the real values and refuse a placeholder that does not exist or a bare number typed by hand.
- Claim only what the facts show in `text`; put interpretation, limits and hypotheses in `detalhe`, labelled as such. Do not infer causes, do not rank people, do not quote secrets or personal data. State the sample size when it is small (`{totals.prs}` PRs is an indication, not a trend). Mind what the facts count: statuses come from the `review.md`, not from what happened after the approval.
- On first use `insights.js` seeds the registry from an existing `insights.json`, so earlier insights are not lost (they get a placeholder title and no detail: complete them with `update`).
## Shareable reports (`oos` and `pendencias`)

These two files are the **only** derived views that embed the text of the reviews (including out-of-scope observations, which can quote credentials or PII). They exist to be shared and to feed tickets, so they are separate from the dashboard, which stays free of that text.

- **Redaction** (`scripts/lib/redact.js`), applied to every text before it is embedded: terms and patterns from `reviews/_index/config.json` (`{ "redact": { "terms": ["SVC_ACCOUNT", {"term":"x","replacement":"‹y›"}], "patterns": [{"pattern":"...","flags":"g","replacement":"..."}] } }`), the people of the area (owner, executor, PR author, Jira reporter/assignee read from `pr-info.json`), and generic patterns (CPF, CNPJ, JWT, bearer tokens, e-mail, `senha/password/secret/token = value`). It is a filter, not a guarantee: the script prints what it omitted and the page warns to review it before sharing. Put area-specific names (service accounts, schemas, people who are not in `pr-info.json`) in `config.json`.
- **Not corrected** = the item's outcome does not start with Corrigido / Obsoleto / Resolvido and its status is not Resolvido. Outcome comes from `<pr>/pos-aprovacao.md` when it exists (tables whose first cell starts with `F<n>`/`O<n>`, columns `Desfecho`, `Evidência`, `Decisão do usuário`), otherwise only the review status counts. `situacao` is derived, not typed: `rejeitado-pelo-usuario`, `aceito-pelo-usuario`, `indeterminado`, `persiste-no-codigo-base` (out of scope), `pr-encerrado-sem-correcao`, `pr-aberto-pode-corrigir` (state from the last `pr-info.json`).
- **Analysis (model, `pendencias`)**: `node .claude/skills/cr-insights/scripts/pendencias.js pending --limit 20` prints the items without analysis (new, or whose text/outcome changed). Write a JSON array to a temporary file outside the area, one object per item: `key`, `issueType` (`vulnerabilidade|correcao-necessaria|debito-tecnico|ma-pratica|decisao-de-negocio`), `resumo`, `detalhe`, `impacto`, `evidencia` (`fato-verificado|hipotese|misto`) + `evidenciaNota`, `justificativaAbrir[]`, `justificativaNaoAbrir[]` (be adversarial: say when an item is weak), `recomendacao` (`abrir|abrir-agrupado|decidir-com-PO|monitorar|nao-abrir`) + `recomendacaoMotivo`, `acaoSugerida`, `quemDecide`, optional `pendencias`. Run `pendencias.js apply <file>` (invalid enums or empty fields reject the whole batch), repeat until `show` reports 0 pending, then `build`. Never promote a hypothesis from the review to a fact, never write secrets, credentials or personal data, name people nowhere. With more than ~20 items delegate batches to Sonnet subagents (medium effort).
- Groups ("Agrupamentos sugeridos") come from the confirmed `same-cause` relations (`cr-links`) among the pending items.
- The recommendations are model judgment for a human to confirm; the pages say so. After `build`, tell the user how many items still have no current analysis.

## Dashboard rules

- Person views (owner/executor) only appear with `insights.minPeopleForPersonViews` distinct people (default 3); the time series only with `insights.minPrsForTrends` PRs (default 10). Both are set in `reviews/_index/config.json` under `insights`. Below the cutoff the page says why.
- Text of out-of-scope observations is never embedded: only id, severity, category, layer and status. Finding titles are.
- The page contains internal data: keep it local, do not share it without review.
- The numbers in the page and in `facts.json` come from the same `aggregate()` function, so they cannot disagree. The dashboard shows only insights validated against the current facts; the others are on `insights.html`.

## Classify

1. `node .claude/skills/cr-insights/scripts/classify.js pending --limit 20` prints the pending items with their text and the valid category ids.
2. Read each item and choose **one primary category: the aspect that would hurt**, and a secondary only when a second aspect is real. Use `outro` only with a `reason` (it tells the user the taxonomy needs a new category). With more than ~20 pending items, repeat in batches of 20; with many more, delegate batches to a Sonnet subagent (low or medium effort).
3. Write the batch as a JSON array `[{ "key": "...", "category": "...", "secondary": "...", "reason": "..." }]` to a temporary file outside the area and run `classify.js apply <file>`. Invalid ids, unknown keys or `outro` without reason reject the whole batch and write nothing.
4. `classify.js show` prints the counts per category. Repeat `pending` until it reports 0.
5. To change the taxonomy edit `taxonomy.json`, bump `version` and list in `history` the categories whose items must be re-classified; the next `pending` picks them up.

## Rules

- `moc` also reads `reviews/_index/relations.json` (made by the `cr-links` skill): only **confirmed** relations appear, as shared-cause groups (`moc/causa/`), related links on item notes and a "Relacionados" section on PR notes.
- Write only to `reviews/_index/` and `moc/`. Never edit `review.md`, `STATUS.md`, `PACK.md` or `INPUT.md`.
- `moc/` is regenerated from scratch every run: tell the user not to keep their own notes inside it. The script refuses to touch a `moc/` folder that was not generated by it.
- Out-of-scope observations (O) appear in the maps and in `dashboard.html` by id, severity and layer only, never by text (it can quote credentials or PII). The only exception is the two redacted reports above (`fora-do-escopo.html`, `pendencias-tickets.html`).
- People notes (`moc/pessoa/`) list PRs only, no counts or severities, and are generated only with 3+ distinct people. Override with `reviews/_index/config.json`: `{ "moc": { "people": "auto" | "on" | "off" } }`.
- `moc` needs `STATUS.md` of each PR for its links. If the script reports broken links, run `/cr-pullrequest` (index) first and repeat.
- After running, report the script's summary lines (PRs, items, items without layer, notes, broken links). If a script exits with an error, show it; do not continue to the next mode.
