# Guia da crharness

Como a área funciona, por que ela é organizada assim e o que cada peça faz. Para o dia a dia (o que rodar e quando), veja o [AJUDA.md](AJUDA.md).

## 1. O que é

Uma pasta permanente onde todas as revisões de PR (contra a user story do Jira) ficam na mesma estrutura. Em cima delas, duas camadas opcionais: **relações** entre PRs e achados, e **indicadores** (categorias, mapas no Obsidian e um dashboard HTML).

Regras que valem para tudo:

- **Somente leitura em sistemas externos.** Nada é comentado, aprovado ou enviado ao GitHub ou ao Jira. Você publica manualmente.
- **Escopo do review = linhas do diff do PR.** Problema em código que o PR não tocou vira "observação fora do escopo", com severidade, e nunca bloqueia o veredito.
- **A área é local.** Ela guarda trechos de código e achados de segurança (credenciais, dados sensíveis em log). Nunca versione nem suba para um remoto.
- **Cada dado tem um dono.** Quem escreve cada arquivo está na seção 5.

## 2. As três skills

| Skill | Para quê | Quando |
|---|---|---|
| `cr-pullrequest` | Revisar PRs. Um subagente Opus faz a revisão adversarial; a skill coleta contexto, valida e grava. | Sempre que há PR novo, commit novo, decisão a registrar ou PR encerrado |
| `cr-links` | Achar e registrar relações entre PRs e entre achados (mesmo Jira, PR que cita outro, mesma causa em repositórios diferentes). | De vez em quando, depois de um lote de reviews |
| `cr-insights` | Categorizar achados, gerar os mapas do Obsidian (`moc/`) e o dashboard HTML, com insights opcionais. | De vez em quando, depois de um lote de reviews |

`cr-links` e `cr-insights` são **esporádicas e incrementais**: só processam o que mudou desde a última execução (controle por hash em `reviews/_index/ledger.json`), então rodar de novo é barato e seguro.

## 3. Fluxo de uma revisão (`cr-pullrequest`)

1. Você coloca o PR e o Jira em `reviews/INPUT.md` (uma linha por PR) e roda `/cr-pullrequest` sem argumentos. Também aceita `/cr-pullrequest <URL do PR> <chave ou URL do Jira>` para um PR só.
2. A skill calcula o **estado de cada PR** (ela nunca grava estado no `INPUT.md`):

   | Estado | Significa | O que a skill faz |
   |---|---|---|
   | novo | Linha no `INPUT.md`, sem pasta do PR | Prepara o PR e pede os anexos |
   | aguardando-anexos | Falta você responder sobre os anexos | Retoma de onde parou |
   | desatualizado | O autor subiu commits (SHA mudou) | Nova rodada `r2`, `r3`... |
   | revisado | Review existe, ainda não publicado | Nada; espera você |
   | publicado | Você já publicou os comentários | Nada |
   | encerrado | PR mergeado ou fechado | Propõe arquivar (só com sua confirmação) |

3. **Anexos.** Para PRs novos a skill lê o Jira e cria `reviews/<repo>-PR<n>/input/NEEDED.md` listando o que seria útil (prints do Jira, contratos de outros serviços). Você coloca os arquivos em `input/` e responde **"pronto"** (ou **"sem anexos"**). A skill só marca `[x]` depois do seu "pronto".
4. **Revisão.** Um subagente Opus (esforço alto) lê o diff, a user story e as evidências e devolve o `review.md`, em pt-BR. A skill valida que cada achado aponta para uma linha realmente alterada pelo PR e grava. Em lote, até 4 revisões rodam em paralelo.
5. **Registro de decisões.** Voltou do solicitante ou do autor com respostas? Diga a ela (ou "publiquei"): a skill edita o review da mesma rodada, com histórico de quem decidiu e quando. Código novo do autor gera uma rodada nova, não uma edição.
6. **Arquivar.** Quando o PR é encerrado, a skill propõe mover a pasta para `reviews/_archive/`. Nada é apagado.

Dois achados importantes sobre como ler um review:

- **F1, F2...** são achados do PR (cada um com severidade, tipo `decisão`, `defeito` ou `maybe-false`, e status). **O1, O2...** são observações fora do escopo.
- Severidade usa sempre `critical | high | medium | low`. Status dos achados: `Aberto`, `Persiste`, `Mantido`, `Aceito`, `Rejeitado`, `Resolvido`. Status das observações: `Aberto`, `Encaminhado`, `Aceito`, `Resolvido`.

## 4. Como as camadas de análise funcionam (`cr-common`, `cr-insights`, `cr-links`)

Tudo parte dos reviews já gravados e passa por uma cadeia. Os passos marcados "script" não usam modelo (rápidos e reproduzíveis); os marcados "modelo" exigem julgamento.

```
review.md + pr-info.json
   │  ingest (script)         ->  reviews/_index/items.json     (um registro por achado e por observação)
   │  classify (modelo)       ->  reviews/_index/classification.json   (categoria por item)
   │  scan + judge (script + modelo) + decide (você)  ->  reviews/_index/relations.json
   │  facts (script)          ->  reviews/_index/facts.json     (todos os números)
   │  insights (modelo, opcional) ->  reviews/_index/insights-registry.json (histórico) -> insights.html e insights.json
   │  dashboard (script)      ->  reviews/_index/dashboard.html
   │  oos (script)            ->  reviews/_index/fora-do-escopo.html     (texto das observações, com omissões)
   │  pendencias (modelo + script) -> reviews/_index/pendencias.json + pendencias-tickets.html
   ▼  moc (script)            ->  moc/   (mapas do Obsidian)
```

**Camadas arquiteturais.** O `ingest` descobre a camada de cada item pelo arquivo citado (`controller`, `service`, `repository`, `integration`, `model`, `config`, `test`, `util`, `messaging`, `delivery`, `security`; o que não tem arquivo identificável vai para `indefinida`). Um item pode tocar mais de uma camada.

**Categorias.** A taxonomia (`.claude/skills/cr-insights/taxonomy.json`) tem 13 categorias, mais `outro` (que exige um motivo e sinaliza que a taxonomia precisa crescer): segredo ou credencial, dado sensível em log, segurança de transporte ou exposição, tratamento de erro, contrato de API ou mensagem, feature toggle e escopo, concorrência e consistência, recursos e performance, teste, observabilidade, aderência à spec, configuração e ambiente, qualidade de código. Cada item recebe **uma categoria primária** (o aspecto que causaria dano) e, se for real, uma secundária.

**Relações.** O `cr-links` guarda cinco tipos:

| Tipo | Evidência | Quem confirma |
|---|---|---|
| `jira-same` | dois PRs do mesmo Jira | você, em lote |
| `jira-link` | vínculo do Jira (ex.: "created by") | você, em lote |
| `pr-mention` | um review cita outro PR do corpus | você, em lote |
| `same-cause` | itens de PRs diferentes que compartilham identificadores (classe, campo, arquivo) ou categorias sensíveis | o modelo dá um parecer (`same`, `related`, `unrelated`) e **você decide um a um** |

Só relações **confirmadas** entram no Obsidian. O que você rejeita não volta, a menos que o texto da evidência mude. A busca de candidatas é lexical: uma causa sem identificador em comum e fora das categorias sensíveis não é encontrada.

**Insights.** Frases curtas em pt-BR escritas pelo modelo, **opcionais**, guardadas num **registro** (`insights-registry.json`) que não se perde entre uma geração e outra: cada insight tem título, frase, detalhe (por que importa, como foi derivado, limites e hipóteses), ação sugerida, datas, os valores que citou ao ser validado e um histórico. Cada número da frase vem de um `{placeholder}` do `facts.json`: o build recusa número digitado à mão e placeholder inexistente. A página `insights.html` mostra a situação de cada um: **vigente** (conferido com os dados atuais), **a revalidar** (os dados mudaram: a frase continua lá com os números da época, até alguém confirmar, ajustar ou retirar) e **retirado** (deixou de fazer sentido; fica com o motivo). O dashboard mostra só os vigentes e sai completo sem eles.

## 5. Mapa de pastas e quem escreve o quê

```
<área>/
├─ CLAUDE.md, README.md, GUIDE.md, AJUDA.md     regras e documentação da área
├─ .claude/skills/                              as skills e seus scripts
├─ .obsidian/                                   tema, plugins, grafo e favoritos
├─ moc/                                         mapas do Obsidian (gerado: não edite)
└─ reviews/
   ├─ INPUT.md                                  fila de PRs (VOCÊ edita)
   ├─ PACK.md                                   índice dos PRs ativos (gerado)
   ├─ <repo>-PR<n>/
   │   ├─ input/                                anexos (VOCÊ coloca) + NEEDED.md (skill)
   │   ├─ r1-<sha7>/, r2-<sha7>/...             rodadas: snapshot congelado + review.md
   │   ├─ pr-info.json                          autor, owner da US, tipo do Jira, datas
   │   └─ STATUS.md                             status do PR (gerado)
   ├─ _archive/<repo>-PR<n>/                    PRs encerrados, fora do índice ativo
   └─ _index/                                   dados derivados (gerados) e config.json (opcional)
```

| Arquivo | Quem escreve | Pode editar à mão? |
|---|---|---|
| `INPUT.md`, arquivos em `input/` | você | sim, é a sua fila |
| `review.md` | a skill (e o modo revise) | não; use o modo revise para registrar decisões |
| `STATUS.md`, `PACK.md`, `reviews/_index/*`, `moc/*` | scripts e skills | não: são regerados |
| `.obsidian/graph.json`, `.obsidian/bookmarks.json` | o Obsidian (e você) | sim; o `update-area.js` não os sobrescreve |
| `reviews/_index/insights-registry.json`, `pendencias.json`, `classification.json`, `relations.json` | a skill (modelo e você) | não, e **não apague**: guardam julgamento e histórico que não se regeram sozinhos |
| `reviews/_index/config.json` | você | sim (cortes do dashboard, modo de pessoas e termos a omitir nos relatórios) |
| `<PR>/pos-aprovacao.md` | a skill, a seu pedido | opcional e sem formato padronizado de propósito: se existir, o relatório de pendências lê o desfecho dele; se não, vale só o status do review |

**Owner e executor.** No `pr-info.json`, o *owner* é o reporter da user story no Jira e o *executor* é o autor do PR.

## 6. O que o Obsidian mostra

Abra a pasta da área como vault. A nota `moc/_Home` é a entrada (ela vem favoritada). O grafo mostra serviços, PRs, camadas, categorias, Jira, releases, itens e, quando há relações confirmadas, as causas compartilhadas, cada tipo com uma cor. Os itens têm propriedades (`severity`, `category`, `layers`...) que servem de filtro. A seção **Atalhos** da `_Home` tem um link que abre o dashboard no navegador.

O Obsidian não abre HTML dentro do vault; por isso o dashboard é aberto pelo link. O caminho do link é absoluto e específico da máquina, e é gerado de novo a cada execução do `moc`.

## 7. O dashboard

`reviews/_index/dashboard.html` é um arquivo único, com os dados embutidos: abre por duplo clique, sem servidor nem internet. Uma barra no topo liga as quatro páginas (dashboard, insights, fora do escopo, pendências e tickets); cada uma tem a mesma barra para voltar. A seção **Atalhos** da `moc/_Home` abre todas. Tem uma linha de filtros no topo (serviço, release, Jira, severidade, categoria, camada, escopo, status), números-chave, gráficos, tabelas e os insights. Cada gráfico tem a opção "Ver tabela". Regras de ocultação:

- **Evolução no tempo** só aparece a partir de 10 PRs. Abaixo disso, a página diz que a amostra é pequena.
- O texto das observações fora do escopo **nunca** vai para o dashboard (só id, severidade, categoria, camada e status). Os títulos dos achados F vão. Mesmo assim, não compartilhe o arquivo sem revisar. O texto só aparece nos dois relatórios da seção 7.1.

Os cortes mudam em `reviews/_index/config.json`:

```json
{ "insights": { "minPrsForTrends": 10, "minPeopleForPersonViews": 3 }, "moc": { "people": "auto" } }
```

### 7.1 Relatórios para compartilhar e abrir tickets

São a **exceção** à regra acima: dois HTMLs únicos (sem servidor nem internet) que **trazem o texto** das revisões, feitos para levar achados e débitos técnicos a quem decide e alimentar tickets. Cada item tem o botão "Copiar p/ ticket".

| Arquivo | Conteúdo | Usa modelo? |
|---|---|---|
| `reviews/_index/fora-do-escopo.html` | todas as observações fora do escopo: severidade, origem (repo, PR, Jira, rodada), texto, categoria, camada, status, desfecho depois da aprovação e causas comuns confirmadas | não |
| `reviews/_index/pendencias-tickets.html` | tudo o que as revisões encontraram (dentro e fora do escopo) e **não foi corrigido**, com tipo (vulnerabilidade, correção necessária, débito técnico, má prática, decisão de negócio), evidência (fato ou hipótese), impacto, argumentos a favor e contra abrir ticket, recomendação, quem decide e o que falta saber | sim: o modelo escreve a análise, que fica em `pendencias.json` e só é refeita para o item cujo texto mudou |

- **"Não corrigido"** = o desfecho não começa com Corrigido, Obsoleto ou Resolvido. O desfecho vem do `pos-aprovacao.md` do PR, quando ele existe; sem esse arquivo, vale só o status do review. Itens rejeitados ou aceitos por você aparecem marcados, para você reavaliar.
- **Omissões.** Antes de entrar no HTML, o texto passa por um filtro: termos e padrões que você lista em `reviews/_index/config.json`, as pessoas da área (lidas do `pr-info.json`) e padrões genéricos (CPF, CNPJ, JWT, bearer, e-mail, `senha=valor`). O script diz o que omitiu. É um filtro, não uma garantia: **revise antes de compartilhar**. Contas de serviço, schemas e pessoas que não estão no `pr-info.json` entram assim:

```json
{ "redact": { "terms": ["CONTA_SERVICO", { "term": "SCHEMA_X", "replacement": "‹schema›" }, "login-do-revisor"] } }
```

- **A recomendação é julgamento do modelo**, revisável. Cada item mostra os argumentos a favor e contra abrir o ticket porque um modelo pode superestimar ou subestimar o risco; os achados `critical` e `high` merecem leitura humana.
- Peça: "rode a skill cr-insights no modo pendencias" (o `all` já inclui os dois relatórios).

## 8. Limites conhecidos

- **Amostras pequenas não são estatística.** Com poucos PRs, contagens por categoria são indício. A classificação é julgamento do modelo; um texto alterado reclassifica só o item afetado.
- **A busca de relações é lexical.** Ela acha o que compartilha identificadores ou categorias sensíveis; o resto depende de você notar.
- **Dados sensíveis.** Os reviews podem citar nomes de credenciais ou trechos de código. Os mapas e o dashboard omitem o texto das observações (os dois relatórios da seção 7.1 o trazem, com omissões), mas os `review.md`, o `items.json` e o `relations.json` guardam tudo localmente.
- **Julgamento de IA.** Um review é adversarial e rastreável (fato verificado vs. hipótese), mas não substitui a leitura humana dos achados `critical` e `high`.
