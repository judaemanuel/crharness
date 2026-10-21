# Especificação: `cr-links` e `cr-insights`

Status: proposta para implementação. Baseada nos 4 PRs reais da `crharness` (1108, 244, 245, 33). Decisões do usuário em 2026-10-12: owner = reporter do Jira; executor = autor do PR; métricas só agregadas; aplicação = nome do repo; volume desconhecido (corte configurável); vínculos com evidência determinística aceitos em lote, inferidos um a um.

## 1. Objetivo e fora de escopo

- `cr-links`: descobrir e manter relações entre PRs e entre achados do corpus (área + `_archive`).
- `cr-insights`: categorizar achados, permitir filtros, gerar `dashboard.html` e insights em texto.
- Execução **esporádica**, incremental, nunca refazendo o que já foi processado.
- Fora de escopo: ranking de pessoas; escrita em GitHub/Jira; relações com PRs que não estão no corpus (links do Jira para issues externas são guardados como atributo, não como relação entre PRs); alterar `review.md`, `STATUS.md` ou `INPUT.md`.

## 2. Arquitetura: scripts determinísticos + skills de julgamento

```
.claude/skills/
  cr-common/scripts/ingest.js       # review.md + STATUS + pr-info.json -> _index/items.json (sem modelo)
  cr-links/SKILL.md  scripts/candidates.js
  cr-insights/SKILL.md  scripts/facts.js  scripts/build-dashboard.js
reviews/_index/
  ledger.json  items.json  relations.json  RELATIONS.md
  taxonomy.json  classification.json  facts.json  insights.json  dashboard.html
```

Os scripts ficam dentro de `.claude/`, então `new-area.js` já os leva para cada área. Tudo que é contagem, normalização e agrupamento é script (reproduzível, grátis). O modelo só julga o que exige leitura.

## 3. Camada comum: `ingest.js` e o ledger

`items.json` tem um registro por achado (F) e por observação fora do escopo (O), chave `<repo>-PR<n>/r<N>/<ID>`:
`pr, repo, jira, round, id, scope (pr|fora), tipo (decisão|defeito|maybe-false|null), severity (normalizada), status, title|texto, base, owner, executor, jiraType, publicado, archived`.

**Severidade normalizada** (hoje o corpus mistura `crítica`, `média`, `baixa`, `high`, `high (crítico — segurança)`): `critical | high | medium | low`. O ingest normaliza; a causa é corrigida no `reviewer-prompt.md` (pré-requisito P1).

**Ledger** (`ledger.json`): por `<pr>/r<N>`, o hash do `review.md` e do `pr-info.json`, e por etapa (`ingested`, `linked`, `classified`) a data, o hash visto e a versão (algoritmo de relações, taxonomia). Uma etapa roda de novo só se o hash ou a versão mudou. `--full` força tudo. PRs arquivados continuam no índice com `archived: true`.

## 4. `cr-links`

**Tipos de relação** (arestas com `from`, `to`, `type`, `evidence`, `confidence`, `status`, `evidenceHash`, `date`):

| Tipo | Origem | Confiança | Confirmação |
|---|---|---|---|
| `jira-same` (mesmo Jira) | `pr-info.json` | determinística | em lote |
| `jira-link` (issue link, ex.: 61206 "created by" 54678) | `pr-info.json` | determinística | em lote; atributo do Jira se o alvo não está no corpus |
| `pr-mention` (texto cita outro PR do corpus) | busca em `review.md`/`pr-body.md` | determinística | em lote |
| `same-base`, `same-repo` | `pr-info.json` | determinística | em lote; só visões, não aresta de peso |
| `shared-identifier` (mesmo endpoint, campo ou DTO em repos diferentes) | `candidates.js` sobre `pr.diff` | candidata | modelo julga, você confirma um a um |
| `same-cause` (achado ↔ achado, mesma causa raiz) | candidatos por termos em comum nos achados | candidata | modelo julga, você confirma um a um |

**Fluxo:** `candidates.js` gera só os pares com evidência textual (sem comparar todos contra todos); o modelo (Sonnet, medium) julga os candidatos; as propostas vão para `relations.json` como `proposto`; no modo `review` você marca `confirmado` ou `rejeitado`. **Rejeitado nunca volta**, a menos que o `evidenceHash` mude.

**Modos:** `scan` (só PRs novos ou alterados), `scan --full`, `review` (confirmar/rejeitar), `show` (gera `RELATIONS.md`).

**Resultado esperado nos 4 PRs atuais (critério de aceite):**

| Relação | Tipo | Esperado |
|---|---|---|
| 244 ↔ 33 | `jira-same` (61206) | proposta determinística |
| 61206 → 54678 "created by" | `jira-link` | atributo do Jira |
| 33.O5 cita "PR #244" do mktops-service | `pr-mention` | proposta determinística |
| 244.F3 ↔ 33.F1 (`numberTicketCrm` × `nrChamadoCRM`) | `same-cause` | candidata, julgada pelo modelo |
| 244.O1 ↔ 33.O5 (senha DB2 `SRVSITECLI`) | `same-cause` | candidata; evita contar o mesmo risco duas vezes |
| 245.O1 ↔ 33.O3 (dado sensível em log) | `same-cause` | candidata (causa semelhante, repos diferentes) |
| 244, 245, 1108 | `same-base` | visão |

## 5. `cr-insights`

**Classificação.** Cada item recebe 1 categoria primária (e 1 opcional). Campos de dispositivo (severidade, tipo, status, escopo, repo, owner, executor, release) vêm do `items.json`, sem modelo. Só a categoria exige modelo (Sonnet, low/medium, lotes de até 20 itens; Haiku só depois de avaliado).

**Taxonomia v1** (semeada nos 30 itens reais: 11 F + 19 O), com `outro` exigindo justificativa para sinalizar evolução:

| Categoria | Exemplo real |
|---|---|
| `segredo-credencial` | senha DB2 em `application-dev.yml` (244.O1, 33.O5) |
| `dado-sensivel-em-log` | JWT e CPF em log (245.O1); objeto com PII (33.O3) |
| `seguranca-transporte-config` | `TrustSelfSignedStrategy` (1108.O1); actuator exposto (244.O2) |
| `tratamento-de-erro` | `getUrlErrorException` engole exceção (1108.O2); `DataAccessException` sem mapeamento (245.O5) |
| `contrato-api` | dois campos para o mesmo conceito (244.F3, 33.F1); texto de erro diferente da spec (245.F4) |
| `feature-toggle-escopo` | toggle em endpoint genérico (1108.F1, O5) |
| `concorrencia-consistencia` | janela assíncrona de duplicidade (245.F1); falha parcial sem compensação (245.O3) |
| `recursos-performance` | client criado por chamada (1108.O3); timeout de 300000 ms (1108.O4) |
| `teste` | teste de falha que não exercita o caminho real (1108.F2) |
| `observabilidade` | logs sem prefixo (1108.F3) |
| `aderencia-spec` | query em lote no lugar do método da spec (245.F3) |
| `config-ambiente` | `application-local.yml` pessoal versionado (244.F2) |
| `qualidade-codigo` | comentário desatualizado, `@ActiveProfiles` sem efeito (244.O3, O4) |
| `outro` | com motivo obrigatório |

Mudar a taxonomia incrementa `taxonomyVersion` e reclassifica só o que for afetado.

**Indicadores (agregados):** itens por categoria, por severidade, por repo, por release/base, por tipo de Jira; matriz severidade × categoria; abertos × resolvidos/aceitos/rejeitados; decisões pendentes; críticos fora do escopo; relações (grupos por Jira, itens da mesma causa); tempo de ciclo (criação do PR → primeiro review → merge) quando houver `mergedAt`.

**Regras de exibição**
- Dimensões de pessoa (owner, executor) só aparecem se houver ≥ 3 pessoas distintas. Hoje há 1 (Giovana é reporter de todas as US e autora dos 4 PRs), então ficam ocultas.
- Séries de tendência só aparecem com ≥ N PRs (`insights.minPrsForTrends`, padrão 10). Contagens aparecem sempre, com aviso de amostra pequena.
- O dashboard mostra o título dos achados F, mas das observações O só ID, categoria e severidade: o texto de O pode conter nomes de credencial ou dados sensíveis, e o HTML é mais fácil de compartilhar que o `review.md`.

**Dashboard.** `build-dashboard.js` gera um HTML único a partir dos JSONs, sem rede e sem CDN: filtros client-side (repo, release, Jira, tipo de Jira, severidade, categoria, status, escopo), painéis de KPIs, categoria, matriz, abertos × resolvidos, pendentes, críticos fora do escopo e relações. Estética e acessibilidade seguem a skill `dataviz`.

**Insights.** `facts.js` calcula `facts.json` (números). O modelo (Sonnet, medium) escreve `insights.json` e **cada insight cita as chaves de fato que o sustentam**; o build rejeita insight que cita número fora de `facts.json`. Exemplo de insight verificável com os dados de hoje: "2 dos 5 itens `critical`/`high` do corpus são a mesma credencial em 2 repos (244.O1, 33.O5)".

**Modos:** `classify`, `facts`, `dashboard`, `insights`, `all`. Todos incrementais pelo ledger.

## 6. Pré-requisitos e lacunas no que já existe

| # | Item | Ação |
|---|---|---|
| P1 | Severidade com vocabulário misturado | Fixar `critical/high/medium/low` no `reviewer-prompt.md`; ingest normaliza como rede de segurança |
| P2 | IDs das observações O podem não ser estáveis entre rodadas | Exigir que o revisor preserve os IDs de O em rodadas ≥ 2 (hoje só F é explícito) |
| P3 | Observações O não têm status (aberto/tratado) | Decidir se ganham status; sem isso, "críticos fora do escopo tratados" não é mensurável |
| P4 | `pr-info.json` | Já criado nos 4 PRs e gravado pelo modo `review` |

## 7. Marcos e critérios de aceite

| Marco | Entrega                                      | Aceite (verificável)                                                                                                                |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| M1    | `ingest.js` + `items.json` + ledger          | Nos 4 PRs: **11 F + 19 O = 30 itens**; severidades todas normalizadas; segunda execução não reprocessa nada                         |
| M2    | `cr-links`                                   | A tabela da seção 4 é reproduzida; um vínculo rejeitado não volta na execução seguinte; `scan` sem mudança não chama o modelo       |
| M3    | Classificação                                | 30 itens com categoria; mudar 1 `review.md` reclassifica só os itens dele; mudar a taxonomia reclassifica só os afetados            |
| M4    | `facts.js`, `insights`, `build-dashboard.js` | Todo número do HTML bate com recontagem do `items.json`; dimensões de pessoa ocultas com 1 pessoa; aviso de amostra pequena visível |

## 8. Custo e modelos (FinOps)

Scripts: zero. Julgamento de relações: Sonnet medium só sobre candidatas. Classificação: Sonnet low/medium em lotes. Insights: Sonnet medium. Sem Opus. Com ~30 itens e execução esporádica, o custo é desprezível; o limite é o número de execuções, não o volume.

## 9.1 Atualização 2026-10-12: MoC (Obsidian) e M1 implementado

**Decisões:** o MoC é um **modo `moc` do `cr-insights`**, não uma terceira skill; MoC de pessoa lista só PRs (sem contagem nem severidade), com `moc.people: auto|on|off` (padrão `auto`: só com ≥ 3 pessoas); há uma nota por achado/observação (`moc/items/`); a semente de camadas foi aprovada e pode ser ajustada depois.

**Implementado (no scaffold):**
- P1 (severidade `critical|high|medium|low` no `reviewer-prompt.md`) e P2 (IDs de O estáveis entre rodadas).
- `cr-common/scripts/ingest.js`: `items.json` + ledger por hash, incremental, `--full`. Extrai a camada pelo `Onde` (F, todas as camadas) ou pelo primeiro termo resolvível do texto (O).
- `cr-insights/scripts/moc.js` e `SKILL.md` (modos `ingest`, `moc`, `all`): `moc/_Home.md`, `servico/`, `camada/`, `jira/`, `release/`, `pessoa/` (gated), `items/`. Recria `moc/` por inteiro, recusa-se a tocar numa pasta `moc/` que não gerou, valida todos os links, nunca expõe o texto das O.
- `.obsidian/graph.json` com cores por pasta e filtro que esconde `snapshot/`, `input/` e `.claude/`.

**Resultado nos 4 PRs reais:** 30 itens (11 F + 19 O), 0 sem severidade, 26 de 30 com camada (os 4 sem camada ficam em `camada/indefinida`), 48 notas, 0 links quebrados, geração idempotente (0 diferenças entre execuções), 0 texto de O nos MoCs.

**Ainda pendente:** P3 (status nas observações O); MoCs de `categoria/` (M3) e `causa/` (M2); `classify`, `facts`, `dashboard`, `insights`; validar no Obsidian se o link com âncora de heading funciona (hoje os links apontam para a nota inteira, sem âncora).

## 9.2 Atualização 2026-10-12: M2 (`cr-links`) implementado

`cr-links/scripts/relations.js` (`scan`, `list`, `detail`, `judge`, `decide`, `render`) e `SKILL.md`; o `moc.js` passa a ler só relações **confirmadas** (`moc/causa/`, "Relacionados" nos PRs, "Mesma causa"/"Relacionado" nos itens).

**Resultado nos 4 PRs reais** (10 relações geradas, todas aguardando a decisão do usuário; 1 já rejeitada pelo parecer do modelo):

| Id | Tipo | Par | Parecer |
|---|---|---|---|
| L1 | jira-same | 244 ↔ 33 (61206) | determinística |
| L2 | jira-link | 61206 "created by" 54678 | determinística |
| L3, L4 | pr-mention | 244 → 33 e 33 → 244 | determinísticas |
| L12 | same-cause | 244.F3 ↔ 33.F1 (`numberTicketCrm`) | same |
| L14 | same-cause | 244.O1 ↔ 33.O5 (credencial DB2) | same |
| L10, L13, L15 | same-cause | 244.F1↔33.O5; 244.F3↔33.O1; 245.O1↔33.O3 | related |
| L9 | same-cause | 1108.O5 ↔ 245.O4 (`createContracts`) | unrelated → rejeitada |

**Correções de rumo:** (1) o primeiro scan gerou 5 candidatas falsas por nomes de diretório (`service`, `integration`); agora só o nome do arquivo conta. (2) 245.O1 ↔ 33.O3 (dado sensível em log) foi achada por um termo genérico (`log.info`); só é robusta com as categorias do M3. (3) Termos compartilhados que vêm de observações fora do escopo não aparecem em `RELATIONS.md` nem em `moc/`.

## 9.3 Atualização 2026-10-12: M3 (classificação) implementado

`cr-insights/taxonomy.json` (v1, 14 ids), `scripts/classify.js` (`pending`, `apply`, `show`, `taxonomy`), `moc/categoria/` e `category` no frontmatter das notas. O `cr-links` passou a gerar candidatas também por categoria (`linkCandidates`: `segredo-credencial`, `dado-sensivel-em-log`).

**Os 30 itens reais ficaram assim:** concorrência/consistência 5, contrato-api 3, e 2 em cada: feature-toggle, teste, segurança de transporte, tratamento de erro, recursos/performance, config-ambiente, segredo/credencial, qualidade de código, aderência à spec, dado sensível em log; observabilidade 1; `outro` 1 (33.O4, espaços à direita em campos CHAR: pede uma categoria "qualidade de dados" se o padrão se repetir).

**Validado:** lote inválido não grava nada; segunda rodada de `pending` dá 0; confirmadas L14/L15 ganharam a categoria como evidência sem reabrir; numa cópia, a categoria sozinha ligou itens sem termos em comum.

**Limite honesto:** a classificação é julgamento do modelo sobre 30 itens de 4 PRs; as contagens não são estatística. Cada mudança no texto de um review reclassifica só o item afetado.

## 9.4 Atualização 2026-10-12: M4 (facts, insights, dashboard) implementado

`lib/aggregate.js` (única função de agregação, usada pelo Node e embutida no HTML), `lib/model.js`, `facts.js`, `build-dashboard.js` e `lib/dashboard.template.html`. O HTML é um arquivo único com os dados embutidos (um HTML aberto por duplo clique não consegue ler um `.json` vizinho). Gráficos em SVG construídos por DOM, sem biblioteca; texto sempre por `textContent`.

**Decisões:** insights opcionais; números só por `{placeholder}` de `facts.json` (o build recusa número digitado à mão ou placeholder inexistente); `factsHash` impede mostrar insight desatualizado; pessoas e série temporal ocultas abaixo do corte (config `insights.*` em `reviews/_index/config.json`); texto das observações fora do escopo nunca é embutido.

**Verificado:** sintaxe e execução do JavaScript do navegador contra um DOM simulado (12 cartões, filtro por serviço recalcula tudo e bate com os dados: customer-bff-policy → 8 itens, 1 PR, 1 pendência); caminhos de insights válidos/inválidos/desatualizados; séries temporal e pessoas ligadas por config numa cópia. **Não verificado:** a aparência renderizada (a captura por navegador headless não funcionou neste ambiente): cores, espaçamento e rótulos precisam de conferência visual.

**Bugs achados no caminho:** (1) o `safeJson` trocava todos os espaços por ` ` (os caracteres U+2028/U+2029 foram gravados como espaço literal); (2) a regra de "número digitado" rejeitava `DB2`; agora aceita identificadores alfanuméricos.

## 9.5 Atualização 2026-10-15: relatórios compartilháveis (`oos`, `pendencias`)

Pedido de uso: levar achados e débitos técnicos a quem decide e alimentar tickets, com identificação, classificação, entendimento e apoio à decisão. Implementado em `cr-insights`: `oos-report.js` (`fora-do-escopo.html`, sem modelo) e `pendencias.js` (`pending`/`apply`/`show`/`build` → `pendencias.json` e `pendencias-tickets.html`), com `lib/pending-model.js` (o que não foi corrigido, situação derivada, agrupamento por relações confirmadas), `lib/redact.js` e dois templates.

**Decisões:**
- **Exceção deliberada** à regra "texto de observação O nunca é embutido": os dois relatórios embutem o texto, em arquivos separados do dashboard, passando por `redact.js` e com aviso na página. O dashboard e o `moc/` continuam sem esse texto.
- **Omissão configurável, não fixa.** Termos e padrões da área em `reviews/_index/config.json` (`redact.terms`, `redact.patterns`); pessoas lidas do `pr-info.json`; padrões genéricos (CPF, CNPJ, JWT, bearer, e-mail, `senha=valor`). É filtro, não garantia: o script imprime o que omitiu.
- **"Não corrigido"** vem do desfecho em `<PR>/pos-aprovacao.md` (opcional; tabelas com `F<n>`/`O<n>` e colunas `Desfecho`, `Evidência`, `Decisão do usuário`) e do status do review. A situação (`persiste-no-codigo-base`, `pr-encerrado-sem-correcao`, `pr-aberto-pode-corrigir`, `rejeitado/aceito-pelo-usuario`, `indeterminado`) é derivada por regra, nunca digitada pelo modelo.
- **A análise do modelo é incremental** (`pendencias.json`, por `contentHash` do texto, do desfecho e da situação); `apply` valida enums e campos obrigatórios e recusa o lote inteiro se um item falhar.
- O `ingest.js` passou a guardar os campos dos achados (`campos`: Fato verificado, Risco, Decisão...) e ganhou `PARSER_VERSION`, que invalida o cache quando o parser muda.

**Verificado:** reexecução sobre a área real reproduziu os 46 itens fora do escopo e os 69 não corrigidos, com as mesmas chaves e 6 agrupamentos da geração manual anterior; `moc/` ficou byte a byte igual depois da mudança do `ingest.js`; sintaxe do JavaScript dos dois HTMLs; nenhum CPF, conta ou nome configurado no HTML. **Não verificado:** a aparência renderizada, e os termos de omissão de outras áreas (cada área precisa listar os seus).

**Em aberto:** o `pos-aprovacao.md` ainda não é um modo da skill `cr-pullrequest` (é um arquivo opcional que o relatório sabe ler); o `moc/_Home` não linka os dois relatórios.

## 9. Riscos

- Categoria dada por LLM varia: mitigada por taxonomia fixa, versão e reclassificação só quando o hash muda.
- O corpus de 4 PRs não valida estatística: M1-M3 validam mecânica; M4 só faz sentido com mais volume.
- O índice concentra dados sensíveis derivados dos reviews: vive em `reviews/_index/`, dentro da área local, nunca versionado.
