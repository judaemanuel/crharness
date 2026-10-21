# crharness scaffold: guia do repositório

Este repositório é o **scaffold**. Ele gera e mantém áreas de code review (`crharness`) onde as revisões de PR contra Jira ficam sempre na mesma estrutura. O conteúdo de uma área (revisões, achados, trechos de código) **nunca** entra aqui: `.gitignore` bloqueia `reviews/*`.

## Requisitos

| Item | Para quê |
|---|---|
| Node.js ≥ 16.7 (testado com 22) | Scripts de criação, importação, ingest e MoC (sem dependências npm) |
| `gh` autenticado (`gh auth status`) | Leitura de PRs; a skill só lê |
| MCP Atlassian | Leitura das issues do Jira; a skill só lê |
| Claude Code | Roda as skills `cr-pullrequest` e `cr-insights` |
| Obsidian (opcional) | Visualizar `moc/` como mapa; o scaffold traz tema, plugins e grafo |

## Fluxos

| Quero | Comando |
|---|---|
| Criar uma área nova | `node scripts/new-area.js <pasta>` |
| Importar packs antigos (idempotente, não sobrescreve) | `node scripts/import-pack.js <pack> <área> [--dry-run]` |
| Levar mudanças do scaffold para uma área existente | `node scripts/update-area.js <área> [--dry-run] [--with-docs] [--reset-graph] [--prune-stale]` (skills renomeadas/removidas no scaffold aparecem como "Stale"; `--prune-stale` apaga a pasta antiga) |
| Revisar PRs | Abrir o Claude Code na área, preencher `reviews/INPUT.md` e rodar `/cr-pullrequest` |
| Achar e confirmar relações entre PRs e achados | Na área, pedir ao Claude para usar a skill `cr-links` (scan, parecer do modelo, sua decisão); ou `node .claude/skills/cr-links/scripts/relations.js scan` e `list` |
| Gerar o dashboard HTML (abre com duplo clique, dados embutidos) | Na área, pedir ao Claude para rodar a skill `cr-insights` (modo `dashboard`); ou `node .claude/skills/cr-insights/scripts/facts.js .` e depois `build-dashboard.js .`; resultado em `reviews/_index/dashboard.html` |
| Gerar os relatórios compartilháveis (observações fora do escopo; pendências e potenciais tickets) | Na área, pedir ao Claude a skill `cr-insights` (modos `oos` e `pendencias`); ou `oos-report.js .` e `pendencias.js pending` / `apply <arquivo>` / `build` em `.claude/skills/cr-insights/scripts/`. Resultado em `reviews/_index/fora-do-escopo.html` e `pendencias-tickets.html`. **Trazem o texto das revisões** (com omissões configuráveis em `reviews/_index/config.json`, chave `redact`): revisar antes de compartilhar |
| Ver, revalidar e registrar insights (a situação de cada um fica em `reviews/_index/insights.html`) | Na área, pedir ao Claude a skill `cr-insights` (modo `insights`); ou `insights.js show` / `pending` / `apply <arquivo>` / `build` em `.claude/skills/cr-insights/scripts/`. O dashboard, o relatório de fora do escopo e o de pendências têm uma barra de navegação entre si e com os insights |
| Atualizar índice e mapas | Na área, pedir ao Claude para rodar a skill `cr-insights` (modo `all`), ou: `node .claude/skills/cr-common/scripts/ingest.js .` e `node .claude/skills/cr-insights/scripts/moc.js .` |

**Obsidian e o `graph.json`:** o Obsidian reescreve `.obsidian/graph.json` com o estado do grafo (e sobrescreve o arquivo ao fechar). Por isso o `update-area.js` só o copia se ele não existir; para forçar o padrão do scaffold, **feche o Obsidian** e use `--reset-graph`. Snippets CSS novos só entram depois de recarregar o app ("Reload app without saving").

**Dashboard no Obsidian:** o Obsidian não abre HTML dentro do vault. A nota `moc/_Home.md` (favoritada em `.obsidian/bookmarks.json`) tem uma seção `Atalhos` com um link `file:///` que abre o dashboard no navegador padrão. O caminho é absoluto e específico da máquina, por isso o `moc.js` o gera a cada execução; a ordem do modo `all` é `ingest`, `classify`, `facts`, `insights`, `oos`, `pendencias`, `dashboard` e por último `moc`. A seção `Atalhos` abre também o `insights.html`, o `fora-do-escopo.html` e o `pendencias-tickets.html`. O `bookmarks.json` é do usuário depois de criado: só é copiado se não existir.

## Mapa do repositório

```
CLAUDE.md, README.md      # copiados para cada área (regras e guia da área)
.claude/skills/
  cr-pullrequest/         # revisar PRs: init, review, revise, index, batch, sync, archive
  cr-common/scripts/      # ingest.js (reviews -> reviews/_index/items.json + ledger)
  cr-insights/            # SKILL.md + scripts/moc.js (mapas Obsidian em moc/)
  cr-links/               # SKILL.md + scripts/relations.js (relações PR↔PR e achado↔achado)
.obsidian/                # tema, plugins, graph.json e snippet do grafo
scripts/                  # criar, importar e atualizar áreas (não vão para as áreas)
docs/                     # USAGE.md (este), crharness-design.md, crharness-links-insights-spec.md
```

## Regras que o scaffold garante

- Skills somente leitura para GitHub e Jira; tudo que elas geram fica dentro da área.
- A área é local: não versione nem suba ao remoto.
- `INPUT.md` é a fila do usuário e nunca é editada pela skill; o estado dos PRs é derivado.
- `moc/` e `reviews/_index/` são derivados e regenerados; não guarde notas suas dentro de `moc/`.

## Verificação rápida (checkout limpo)

```
git clone <repo> scaffold && cd scaffold
node scripts/new-area.js ../minha-area
cd ../minha-area
node .claude/skills/cr-common/scripts/ingest.js .
node .claude/skills/cr-insights/scripts/moc.js .
```

Numa área vazia o resultado esperado é 0 PRs, 0 itens e uma nota `moc/_Home.md`.

## Evolução planejada

Ver `docs/crharness-links-insights-spec.md`: `cr-links` (relações entre PRs e achados), classificação por taxonomia e dashboard.
