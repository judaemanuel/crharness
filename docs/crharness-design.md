# crharness — design (rascunho para decisão)

Status: proposta. Substitui o conceito "um pack por lote" por uma área permanente. Baseado na skill atual (`cr-pullrequest`: init/review/revise/index/batch) e em `scripts/new-pack.js`.

## 1. Princípios

1. Uma fonte da verdade por dado: `INPUT.md` é do usuário (fila); `review.md`/`STATUS.md` são da skill. O estado do PR é **derivado**, nunca digitado no INPUT.
2. O índice ativo não cresce sem limite: PR encerrado vai para `_archive/` e sai da leitura da skill.
3. Relações entre CRs só por chaves explícitas (Jira, repo, base branch, arquivo citado). Sem inferência por LLM nesta fase.
4. A área é local. Nunca vai para remoto (contém trechos de código e achados de segurança).

## 2. Layout

```
<area>/
├─ CLAUDE.md  README.md  .claude/  .obsidian/
└─ reviews/
   ├─ INPUT.md                 # fila (usuário): PR | Jira | Nota
   ├─ PACK.md                  # gerado: só PRs ativos + visões por Jira/repo/base
   ├─ <repo>-PR<n>/            # igual hoje (input/, rN-sha7/, STATUS.md)
   └─ _archive/<repo>-PR<n>/   # PRs encerrados (mesma estrutura, fora do índice ativo)
```

Fase 3 (depende do pack-2): `reviews/_jira/<KEY>/input/` para anexos compartilhados quando 2+ PRs têm o mesmo Jira.

## 3. Estado derivado (calculado pelo modo `sync`)

| Estado | Regra | Fonte |
|---|---|---|
| novo | linha no INPUT sem pasta do PR | pasta |
| aguardando-anexos | `input/NEEDED.md` = PENDENTE | arquivo |
| revisado | existe `review.md`, `Publicado: não`, SHA = SHA vivo | arquivo + `gh` |
| publicado | `Publicado: sim`, SHA = SHA vivo | arquivo (declarado pelo usuário) + `gh` |
| desatualizado | SHA vivo ≠ SHA da última rodada | `gh` |
| encerrado | PR merged/closed no GitHub | `gh` |

`publicado` é declaração do usuário (a skill é somente leitura). `encerrado` é fato verificado. Divergência INPUT × `meta.json` (Jira trocado, URL diferente) é sinalizada, nunca resolvida em silêncio.

## 4. Mudanças na skill

| Arquivo | Mudança |
|---|---|
| `SKILL.md` | Roteamento: sem argumentos = `sync`. Layout com `_archive/`. |
| `modes/sync.md` (novo) | Lê o INPUT, calcula estados (um `gh pr view` por PR ativo), mostra tabela e plano (quem vai para init/review/revise/arquivar), pergunta uma vez, delega. Nada a fazer = diz isso e não despacha subagente. |
| `modes/batch.md` | Fase 1 passa a consumir o plano do `sync`. Regra de pular "mesmo SHA" vira estado `revisado/publicado`. |
| `modes/archive.md` (novo) | Move a pasta para `_archive/`, regenera o índice. Só com confirmação do usuário. |
| `modes/index.md` + `templates/PACK.md` | Coluna Estado; seções Por Jira, Por repo, Por base branch (`meta.json`); contagem de arquivados. Lê só STATUS ativos. |
| `CLAUDE.md`, `README.md`, `templates/INPUT.md` | "Pack" → "Área"; regra de nunca versionar; INPUT é fila. |
| `scripts/new-pack.js` | Vira `new-area.js` (criado uma vez). |

## 5. Importação (`scripts/import-pack.js <pack> <area>`)

- Copia `reviews/<repo>-PR<n>/` para a área. Não copia `PACK.md` do pack.
- Mescla linhas do `INPUT.md` (sem duplicar).
- PR existente nos dois lados: rodadas com SHA diferente são somadas; mesma rodada e hash diferente = conflito, é listado e nada é sobrescrito.
- Ao final, regenera `STATUS.md` e `PACK.md` pela skill (modo index).

## 6. Critérios de sucesso (verificáveis)

| # | Teste | Esperado |
|---|---|---|
| T1 | `sync` com 3 linhas: novo, publicado (mesmo SHA), desatualizado | Tabela correta; subagente só para novo e desatualizado |
| T2 | `sync` duas vezes sem mudança | "Nada a fazer", zero subagentes |
| T3 | Arquivar PR merged | Pasta em `_archive/`, sai do `PACK.md`, contador sobe |
| T4 | Regenerar índice com N arquivados | Lê só os STATUS ativos |
| T5 | Importar `wr-click-n-pay` | PR1108 na área; `r1-87e305a` com hash idêntico ao original; `PACK.md` regenerado |
| T6 | Importar com conflito | Conflito listado, nenhum arquivo sobrescrito |

## 7. Decisões (2026-10-12)

1. Arquivar: **só com confirmação** do usuário.
2. "Pack" → "área" nos textos agora; o repo é renomeado depois, se o usuário quiser. Nome da skill continua `cr-pullrequest`.
3. Anexos compartilhados por Jira (`_jira/`): **depois do pack-2**.
4. `INPUT.md` permanece em `reviews/INPUT.md`.

## 7.1 Implementação

Feito no scaffold: `modes/sync.md`, `modes/archive.md`, ajustes em `SKILL.md`, `batch.md`, `index.md`, templates `PACK.md`/`INPUT.md`, `CLAUDE.md`, `README.md`, `scripts/new-area.js`. Pendente: `scripts/import-pack.js` e os testes T1-T6 em uso real.

## 8. Riscos

- `sync` chama `gh` uma vez por PR ativo: latência e rate limit crescem com a fila (aceitável para dezenas).
- Estado `publicado` não é verificável; depende do usuário dizer "publiquei".
- Acúmulo de dados sensíveis na área: mitigado por arquivo + nunca subir ao remoto.
