# autoguest — CLAUDE.md

## Stack

- Single-file React app (`index.html`) — sem build, sem bundler
- React carregado via CDN (UMD), todo JS inline no final do `index.html`
- PWA configurado via `manifest.json` + `pwa-icon.svg`
- Backend: Supabase (chaves inline no `index.html`)

## Estrutura do projeto

```
index.html        # app completo (HTML + CSS + JS)
manifest.json     # configuração PWA
pwa-icon.svg      # ícone PWA (1024×1024, SVG)
README.md
CLAUDE.md
```

## Convenções de código

- Todo código React usa `React.createElement` (sem JSX)
- Componentes definidos como funções no escopo global, antes do `ReactDOM.render`
- Estilos inline via objeto `style={{}}`
- Paleta de cores centralizada no objeto `C` (passado como prop)

## Atualizar o ícone PWA via anexo

Quando o usuário enviar uma imagem como anexo para usar como ícone PWA:

1. **Ler a imagem enviada** — o usuário pode enviar PNG, JPG ou SVG
2. **Converter para SVG** se necessário, usando Python + Pillow/cairosvg, ou embutindo o PNG em base64 dentro de um `<image>` SVG
3. **Requisitos do ícone final** (`pwa-icon.svg`):
   - Tamanho do viewport: `1024×1024`
   - Arte centralizada dentro da **safe area**: margem de ~10% (arte dentro de ~820×820px centrado)
   - Fundo branco ou transparente (iOS exige fundo sólido para maskable)
   - Sem texto — apenas a imagem/logo
   - `purpose: "any maskable"` já está no `manifest.json`
4. **Salvar** em `/home/user/autoguest/pwa-icon.svg`, substituindo o arquivo atual
5. **Verificar** que o `manifest.json` ainda aponta para `"src": "pwa-icon.svg"`
6. **Commitar** com mensagem descritiva e fazer push

> **Nota iOS:** O iOS faz cache agressivo do ícone PWA. Para ver o novo ícone, o usuário precisa: Remover Favorito → abrir no Safari → Compartilhar → Adicionar à Tela de Início.

## Branch de desenvolvimento

Branch ativo: `claude/placeholder-task-nsnXx`

## Consistência de implementação — OBRIGATÓRIO

Sempre que uma mudança afetar um cálculo ou resultado (ex: fórmula de receita, saldo, lucro), implementar em **todos os locais afetados** do app — painéis, gráficos, fluxo de caixa, previsão, navegação mensal, sub-tabs, etc. **Nunca atualizar só um ponto isolado.**

Esta regra é permanente e se aplica a todos os painéis, gráficos e cálculos do sistema — qualquer nova funcionalidade ou correção deve considerar impacto em KPIs, scorecards, fluxo de caixa, previsão, orçamento pessoal, e todos os painéis do dashboard. Sempre verificar explicitamente antes de declarar a tarefa concluída.

## Retirada de Lucro × Ajuste de Saldo — PREMISSA PERMANENTE

**São conceitos DIFERENTES e NÃO podem ser misturados:**

- **`Retirada de Lucro`** = lucro que o dono efetivamente retirou. É **receita do orçamento pessoal** e entra na métrica "quanto retirei de lucro no mês". Predicado: **`isRetLucroPura(d)`** (só a categoria `"Retirada de Lucro"`).
- **`Ajuste de Saldo`** = **apenas um ajuste no saldo do caixa/conta corrente**. **NÃO é receita nem despesa**, e **NÃO é retirada de lucro**. Só movimenta o saldo do caixa da locadora.

Os **dois movimentam o saldo da conta** (caixa), mas só a **Retirada de Lucro** conta como retirada/receita pessoal.

### Predicados (não confundir os usos)

- **`isRetLucroPura(d)`** → SOMENTE `Retirada de Lucro`. Usar para **MEDIR a retirada** e a **receita do orçamento pessoal**: `retiradaLucroDoMes`, linha "Retirada de Lucro" dos gráficos (`_lret`, `retLucData`), `_recLocItems`, `_retItems`, `_recLocDay`, `_syncRetLucroOrc`.
- **`isRetLucro(d)`** → `Retirada de Lucro` **OU** `Ajuste de Saldo`. Usar para **EXCLUIR das despesas operacionais** (`!isRetLucro`) e para o **fluxo de caixa da locadora** (ambos movem o saldo). Nunca usar `isRetLucro` para medir a retirada de lucro.

### Datas e meses

A retirada **é registrada com a data real do lançamento** — qualquer dia do mês atual (ex: 5/6, 12/6). Por isso:

- Sempre usar `retiradaLucroDoMes(despesas, m)` com o **mês atual** (`m`), nunca `_addM(m, -1)`.
- Em `_mkPesMap`, distribuir a retirada no **dia exato do lançamento** (`d.data_pagamento || d.data`), não forçar dia 1.
- Em todos os gráficos e painéis do orçamento pessoal (barras 6 meses, linha 12 meses, scorecard, previsão), usar o mês corrente para buscar a retirada.
- Função de referência correta: `OrcamentoPessoal` → `retiradaLucroDoMes(despesas, _mesRef)`.
- **Nunca usar `_addM(m, -1)` para buscar a retirada de lucro** — isso causa ausência silenciosa da receita quando o lançamento é datado no mês vigente.

## Regra dos rótulos no gráfico — OBRIGATÓRIO (NUNCA suprimir valores)

**Todo ponto das linhas do gráfico (contratos/verde, despesas/vermelho, saldo/azul) DEVE exibir o seu valor.** É proibido esconder/suprimir rótulos por proximidade (ex.: `showLbl = p.x - lastX >= 30`).

- Quando dois pontos ficam próximos, **alternar a altura do rótulo** (níveis verticais) para não sobrepor — nunca omitir.
- Dia **sem movimento** (inclusive hoje) **não** desenha bolinha nem valor 0 — mas todo dia **com** movimento mostra o valor.
- Vale para entradas (contratos) e saídas (despesas) e também para o saldo.

## Regra de cobertura de dados — OBRIGATÓRIO

**Toda receita ou despesa avulsa (standalone) DEVE alimentar TODOS os painéis do sistema.**

Isso inclui, mas não se limita a:
- Fluxo de caixa (locadora)
- Previsão de caixa (locadora e pessoal)
- KPIs / scorecards de receita e saldo do mês
- Gráficos de receita × despesa (barras, linhas)
- Navegação mensal e sub-tabs
- Qualquer outro painel que exiba receitas, despesas ou saldo

Ao implementar ou corrigir qualquer painel financeiro, **verificar explicitamente** se `receitas` avulsas (`!r.ref_fatura`), `despesas` avulsas e contratos parciais estão incluídos em TODAS as fontes de dados daquele painel. Nunca assumir que "está coberto" — checar o código.

## Fluxo de trabalho Git

Após cada push:
1. **Sempre criar um PR** automaticamente via `mcp__github__create_pull_request` apontando para `main`
2. **Sempre mergear o PR** imediatamente via `mcp__github__merge_pull_request` (squash), sem precisar que o usuário peça
