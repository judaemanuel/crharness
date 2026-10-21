# Ajuda: o que rodar e quando

Guia prático da crharness. Para entender como tudo funciona por dentro, veja o [GUIDE.md](GUIDE.md).

## 1. Em uma tela

| Situação | O que fazer |
|---|---|
| Tenho um PR novo para revisar | Adicione uma linha em `reviews/INPUT.md` (PR e Jira) e rode `/cr-pullrequest`. Coloque os anexos pedidos em `reviews/<repo>-PR<n>/input/` e responda **"pronto"** (ou **"sem anexos"**). |
| O autor subiu commits | Rode `/cr-pullrequest`. O estado vira `desatualizado` e a skill abre uma nova rodada. |
| Publiquei os comentários no PR | Diga: **"publiquei"** (a skill registra `Publicado: sim` e a data). |
| O solicitante ou o autor respondeu um achado | Diga a decisão (por exemplo, "F1 aceito pelo PO") e a fonte. A skill edita o review da mesma rodada, com histórico. |
| O PR foi mergeado ou fechado | Rode `/cr-pullrequest`; ela propõe arquivar. Confirme citando o PR. |
| Quero ver o estado de tudo | `/cr-pullrequest` sem argumentos mostra a tabela de estados e o plano; ou abra `reviews/PACK.md`. |
| Terminei um lote de reviews e quero indicadores e mapas | Peça ao Claude: **"rode a skill cr-insights no modo all"**. Depois abra o dashboard pela nota `moc/_Home`. |
| Quero achar relações entre PRs e achados | Peça: **"use a skill cr-links"**. Ela busca, dá um parecer, e você decide. |
| Quero levar achados e débitos técnicos para tickets | Peça: **"rode a skill cr-insights no modo pendencias"** (e `oos` para só as observações fora do escopo). Saem `reviews/_index/pendencias-tickets.html` e `fora-do-escopo.html`, com botão "Copiar p/ ticket". Revise antes de compartilhar (veja a seção 7). |
| Atualizei o scaffold e quero levar para a área | No repositório do scaffold: `node scripts/update-area.js <área>` (veja a seção 5). |

## 2. Como acionar as skills

Todas as skills se chamam em linguagem natural dentro da pasta da área, com o Claude Code aberto nela:

| Skill | Como chamar | Exemplos |
|---|---|---|
| `cr-pullrequest` | `/cr-pullrequest` (sem argumentos) para a fila; `/cr-pullrequest <URL do PR> <chave ou URL do Jira>` para um PR | "revise a fila", "pronto", "publiquei", "F2 rejeitado, o autor explicou que..." |
| `cr-insights` | peça em linguagem natural: "rode a skill cr-insights" | "atualize o índice e o dashboard", "classifique os itens novos", "atualize os mapas do Obsidian" |
| `cr-links` | peça em linguagem natural: "use a skill cr-links" | "ache relações novas", "mostre as relações propostas", "confirme L1 a L4" |

## 3. Rotinas sugeridas

**Por PR (sempre que houver movimento)**
1. Linha no `INPUT.md` e `/cr-pullrequest`.
2. Anexos em `input/` e **"pronto"**.
3. Leia o `review.md` (ou o resumo que a skill mostra). Os achados `critical` e `high` merecem leitura humana.
4. Publique os comentários por conta própria e diga **"publiquei"**.
5. Quando houver resposta, registre a decisão. Quando o autor subir commits, rode de novo.

**Por lote (a cada semana, ou depois de vários reviews novos)**
1. `cr-insights`, modo `all`: `ingest`, `classify`, `facts`, `dashboard`, `oos`, `pendencias` e `moc`, nessa ordem. Só o que mudou é reprocessado (a análise de pendências só é refeita para o item cujo texto mudou).
2. `cr-links`: `scan`, pareceres do modelo, e **você decide** as relações propostas.
3. Se rodou o `cr-links`, rode o `moc` de novo para o Obsidian mostrar as causas compartilhadas.
4. Opcional: peça os insights (modo `insights`): o Claude revalida os que ficaram desatualizados e reconstrói `insights.html` e o dashboard. Os insights antigos não se perdem; veja a situação de cada um em `insights.html`.

## 4. Comandos de terminal (PowerShell, na raiz da área)

O Claude Code roda isto por você; use direto quando preferir.

| Para quê | Comando |
|---|---|
| Ler os reviews e atualizar `items.json` | `node .claude/skills/cr-common/scripts/ingest.js .` (`--full` reprocessa tudo) |
| Ver o que falta categorizar | `node .claude/skills/cr-insights/scripts/classify.js pending` |
| Gravar categorias (arquivo JSON do modelo) | `node .claude/skills/cr-insights/scripts/classify.js apply <arquivo.json>` |
| Contagem por categoria | `node .claude/skills/cr-insights/scripts/classify.js show` |
| Calcular os números | `node .claude/skills/cr-insights/scripts/facts.js .` |
| Gerar o dashboard | `node .claude/skills/cr-insights/scripts/build-dashboard.js .` |
| Relatório das observações fora do escopo (HTML) | `node .claude/skills/cr-insights/scripts/oos-report.js .` |
| Ver o que falta analisar nas pendências | `node .claude/skills/cr-insights/scripts/pendencias.js pending` |
| Gravar a análise das pendências (arquivo JSON do modelo) | `node .claude/skills/cr-insights/scripts/pendencias.js apply <arquivo.json>` |
| Contagem das pendências (analisadas, desatualizadas, pendentes) | `node .claude/skills/cr-insights/scripts/pendencias.js show` |
| Gerar o HTML de pendências e potenciais tickets | `node .claude/skills/cr-insights/scripts/pendencias.js build` |
| Ver a situação dos insights | `node .claude/skills/cr-insights/scripts/insights.js show` |
| Ver o que precisa de revalidação | `node .claude/skills/cr-insights/scripts/insights.js pending` |
| Gravar operações do modelo (`add`, `update`, `validate`, `retire`) | `node .claude/skills/cr-insights/scripts/insights.js apply <arquivo.json>` |
| Gerar `insights.html` (e o `insights.json` do dashboard) | `node .claude/skills/cr-insights/scripts/insights.js build` |
| Gerar os mapas do Obsidian | `node .claude/skills/cr-insights/scripts/moc.js .` |
| Procurar relações | `node .claude/skills/cr-links/scripts/relations.js scan` |
| Listar relações | `node .claude/skills/cr-links/scripts/relations.js list --status proposto` |
| Ver os dois lados de uma relação | `node .claude/skills/cr-links/scripts/relations.js detail L12` |
| Confirmar em lote as determinísticas | `node .claude/skills/cr-links/scripts/relations.js decide --all-deterministic --status confirmado` |
| Confirmar ou rejeitar uma | `node .claude/skills/cr-links/scripts/relations.js decide L12 --status confirmado` (ou `rejeitado`) |
| Escrever `RELATIONS.md` | `node .claude/skills/cr-links/scripts/relations.js render` |

Cadeia completa, na ordem: `ingest`, `classify` (modelo), `scan` e `decide`, `render`, `facts`, `insights` (`pending` e `apply` com o modelo, depois `build`), `oos-report`, `pendencias` (`pending` e `apply` com o modelo, depois `build`), `build-dashboard`, `moc`.

## 5. Comandos do repositório do scaffold

Rodam no repositório do scaffold, **não** na área.

| Para quê | Comando |
|---|---|
| Criar uma área nova | `node scripts/new-area.js <pasta>` (a pasta precisa estar vazia ou não existir) |
| Importar packs antigos | `node scripts/import-pack.js <pack> <área> [--dry-run]` (idempotente; não sobrescreve) |
| Levar mudanças do scaffold para uma área | `node scripts/update-area.js <área> [--dry-run] [--with-docs] [--reset-graph] [--prune-stale]` |

`update-area.js` nunca apaga arquivos nem mexe em `reviews/`. Se o scaffold renomeou ou removeu uma skill, ele avisa "Stale skills" (a área ficaria com a antiga e a nova ao mesmo tempo); só `--prune-stale` remove essas pastas de skill. Depois de atualizar, reinicie o Claude Code na área para ele recarregar a lista de skills. Ele **não** sobrescreve `graph.json` nem `bookmarks.json` (o Obsidian os reescreve); `--reset-graph` força o grafo padrão e exige o Obsidian fechado. `--with-docs` também atualiza `CLAUDE.md`, `README.md`, `GUIDE.md` e `AJUDA.md`.

## 6. Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `items.json not found` | Falta rodar o `ingest`. |
| `facts.json is stale` ou `facts.json not found` | Os dados mudaram depois do último `facts`: rode o `facts.js` e depois o `build-dashboard.js`. |
| `Insights inválidos, dashboard NÃO gerado` | Algum insight tem número digitado à mão ou placeholder inexistente. Use `{totals.x}`, `{byCategory.y}` etc. do `facts.json`; PR (`#244`) e nomes como `F3` ou `DB2` são permitidos. |
| Dashboard mostra "insights desatualizados" ou nenhum insight | Os dados mudaram e os insights ficaram "a revalidar" (ou ainda não há nenhum). Veja `insights.html`; peça ao Claude para revalidar. O dashboard só mostra os vigentes. |
| `moc/ exists and is not a generated MoC folder` | Há uma pasta `moc/` que não foi gerada pela skill (por exemplo, com notas suas). Mova suas notas para fora de `moc/`; ela é recriada a cada execução. |
| O `moc` avisa links quebrados | Falta o `STATUS.md` de algum PR. Peça à skill `cr-pullrequest` para atualizar o índice e rode o `moc` de novo. |
| `classify apply` recusa o lote inteiro | Categoria inexistente, item desconhecido ou `outro` sem `reason`. Nada é gravado até o lote estar certo. |
| `insights apply` recusa o lote inteiro | Número digitado à mão no texto, `{placeholder}` que não existe no `facts.json`, `retire` sem `motivo`, id inexistente ou já retirado. Nada é gravado até o lote estar certo. |
| `pendencias apply` recusa o lote inteiro | Tipo, evidência ou recomendação fora da lista, campo de texto vazio, ou item desconhecido (ou já corrigido). Nada é gravado até o lote estar certo. |
| O HTML de pendências mostra "Aguardando análise" | Há itens sem análise atual (novos, ou cujo texto mudou). Rode `pendencias.js pending`, grave a análise com `apply` e refaça o `build`. |
| Um nome, conta ou termo interno apareceu no HTML | Acrescente o termo em `reviews/_index/config.json`, em `redact.terms`, e gere o relatório de novo. O filtro cobre CPF, CNPJ, JWT, e-mail, pessoas do `pr-info.json` e os termos que você listar. |
| `scan` diz "Nada novo" | Normal: nada mudou. Use `--full` para forçar. |
| O grafo do Obsidian voltou ao padrão antigo | O Obsidian aberto sobrescreve `graph.json`. Feche o Obsidian e use `update-area.js <área> --reset-graph`. |
| O link do dashboard na `_Home` não abre | Abra o arquivo direto: `reviews/_index/dashboard.html`. Se ele não existir, gere com o `build-dashboard.js`. |
| O grafo mostra README, STATUS ou review | O filtro do grafo deve ser `path:moc`. |
| O Claude diz que o `Bash` está quebrado | Use PowerShell (é a regra desta máquina). |
| Erro ao ler PR ou Jira | Confira `gh auth status` e se o servidor MCP do Atlassian está conectado. A skill só lê. |
| O PR está draft, fechado ou mergeado | A skill avisa e pergunta antes de continuar. |

## 7. Perguntas rápidas

- **Posso editar um `review.md`?** Não à mão. Para registrar decisões, peça ao Claude (modo revise), que mantém o histórico.
- **Posso apagar os arquivos de `reviews/_index/` ou o `moc/`?** Sim: são derivados e voltam com `all`. Só não apague `relations.json` se já confirmou relações, nem `classification.json`, `pendencias.json` ou `insights-registry.json` (guardam julgamento do modelo e o histórico dos insights, que não se regeram sozinhos).
- **Como adiciono uma categoria?** Edite `.claude/skills/cr-insights/taxonomy.json`: acrescente a categoria, aumente `version` e liste em `history` quais categorias afetam itens já classificados. O próximo `classify pending` mostra o que reclassificar.
- **Como mostro o dashboard para outra pessoa?** Ele contém títulos de achados e nomes de repositórios internos. Revise antes de enviar. As observações fora do escopo não estão no dashboard, mas os reviews sim. Os relatórios `fora-do-escopo.html` e `pendencias-tickets.html` trazem o texto das revisões com omissões automáticas (filtro, não garantia): leia antes de enviar.
- **Quero ver a visão por pessoa.** Ela só aparece com 3 ou mais pessoas distintas. Para mudar o corte, edite `insights.minPeopleForPersonViews` em `reviews/_index/config.json`.
- **Preciso de ajuda com algo que não está aqui.** Pergunte ao Claude Code na área; ele lê estas regras (`CLAUDE.md`) e as skills.
