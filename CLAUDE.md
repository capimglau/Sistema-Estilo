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

## Ícone da PWA escurecer no modo escuro do iOS — CONCLUSÃO PERMANENTE

Investigação longa (múltiplas rodadas de tentativa e erro) até chegar na causa raiz e na solução que funcionou de verdade. Registrado aqui pra não repetir o mesmo caminho errado numa próxima vez.

### O que NÃO funciona (testado e descartado)

- **`<link rel="apple-touch-icon" media="(prefers-color-scheme: dark)">`** — o atributo `media` **não tem suporte confiável no iOS** pra esse tipo de `<link>` (confirmado nos fóruns de desenvolvedor da Apple). O iOS não troca sozinho entre um `<link>` claro e um escuro por causa disso.
- **`manifest.json` com dois ícones (claro/escuro)** — o **Safari ignora completamente o `manifest.json`** para o ícone da Tela de Início; ele só lê a tag `<link rel="apple-touch-icon">`. Dois ícones no manifest só têm efeito em Android/Chrome, nunca no iOS.
- **Reagir a `focus`/`visibilitychange`/`pageshow`/`matchMedia('change')` pra trocar o ícone enquanto o app está aberto** — não adianta. Um ícone **já salvo** na Tela de Início não é um elemento vivo da página: o iOS não reage a mudanças no `<link>` depois de capturado. Ficar reaplicando isso só aumenta o risco de mexer no `<head>` bem no instante em que o usuário está no meio de "Adicionar à Tela de Início".
- **Remover e recriar os elementos `<link rel="apple-touch-icon">` em runtime** — deixa uma janela em que nenhum ícone existe no DOM; se o iOS capturar o ícone bem nesse instante, o resultado é imprevisível. Sempre **atualizar o `href` de elementos que já existem**, nunca apagar pra recriar depois.
- **Compor a imagem sobre fundo sólido via `<canvas>`** (pra "consertar" um PNG transparente em tempo real) — funciona em teoria, mas depende de o host da imagem liberar CORS pro `<canvas>`, e some a garantia se isso falhar. Abandonado a pedido do usuário em favor de manter o código simples.

### O que É verdade sobre o comportamento do iOS

- **O ícone salvo na Tela de Início é uma FOTO tirada no instante em que o usuário toca "Adicionar à Tela de Início"** — o `href` que a tag `<link rel="apple-touch-icon">` tiver **nesse exato momento** é o que fica salvo. Depois de instalado, **não muda mais sozinho** — nem com o app reaberto, nem alternando o modo claro/escuro do sistema depois. Pra ver a troca, o usuário **precisa remover o ícone atual e adicionar de novo**, com o aparelho já no modo desejado.
- **Href relativo pode falhar** — há relatos de devs de o iOS não resolver corretamente um `apple-touch-icon` com caminho relativo. Resolver sempre pra **URL absoluta** via `new URL(arquivo, document.baseURI).href` (nunca hardcodar um `/arquivo.png` fixo — este projeto roda num subcaminho do GitHub Pages, `/Sistema-Estilo/`, então um path absoluto fixo apontaria pra raiz errada do domínio).
- **Um PNG transparente normalmente vira ícone com fundo branco no iOS** (comportamento documentado) — mas no teste final desta investigação, com o ícone devidamente **reescalado pra caber na safe area** (ver seção acima, ~53% de largura do canvas de 1024px, igual ao `apple-touch-icon.png` oficial), o usuário confirmou que o ícone transparente (`logo-estilo-icon-transparente.png`) **funcionou e alternou corretamente** entre claro/escuro. Não fica 100% claro por que — pode ser uma particularidade da versão de iOS do aparelho testado — mas é o comportamento confirmado neste projeto: **não presumir que transparente sempre falha sem testar primeiro**.
- **Escala importa**: um logo ocupando perto do limite máximo da safe area (~80% do canvas) sai visualmente "grande/deformado" na Tela de Início, mesmo estando tecnicamente dentro da regra. Usar a mesma proporção do ícone oficial (~53% de largura) como referência.

### Solução atual em produção (`index.html`)

- Ícone claro/escuro decidido **uma única vez**, de forma síncrona, via `window.matchMedia('(prefers-color-scheme: dark)').matches` — sem listener, sem reagir a nada depois.
- Aplicado tanto no `<script>` síncrono do `<head>` (assim que a página carrega, antes de qualquer chance de "Adicionar à Tela de Início") quanto em `pwaApplyIconLinks` (chamada uma vez em `LoginScreen` e uma vez em `App`, quando os dados carregam).
- `pwaApplyIconLinks` usa direto `logo-estilo-icon-transparente.png` (repositório) pro claro e pro escuro — **não usa mais `pwa_icon_url`/`pwa_icon_dark_url` de Config/Supabase** (pedido explícito do usuário; os campos continuam existindo na tela de Config, só não são mais lidos por este código).
- Se um dia isso for revisitado: **não repetir as abordagens da lista "o que NÃO funciona" acima** sem uma razão nova e testada.

### Causa raiz separada, mas relevante: cache do Service Worker mascarando os testes

Boa parte das rodadas de "não resolveu" desta investigação eram, na real, o aparelho do usuário preso numa versão antiga em cache — não um problema no código do ícone em si. Achado: `sw.js` tinha uma busca "network-first" que chamava `fetch(request)` puro (modo de cache **default**), que podia ser respondida por um cache HTTP do navegador/CDN sem nunca ir na rede de verdade, mesmo rotulada como "vai na rede". Corrigido forçando `{ cache: "no-store" }` nas buscas de navegação e de revalidação de estáticos. **Ao investigar qualquer bug de PWA que "não reflete a mudança" mesmo após o deploy, suspeitar de cache antes de suspeitar do código** — confirmar a versão em Config → Versão do app.

## SQL de migração — sempre mostrar para copiar

Sempre que uma tarefa criar ou alterar um arquivo em `sql/` (nova tabela, coluna,
policy etc.), colar o conteúdo completo do SQL na resposta ao usuário, em um bloco
de código pronto para copiar — mesmo que o arquivo já tenha sido salvo no repositório.
Nunca assumir que o usuário vai abrir o arquivo sozinho para rodar no Supabase.

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

## Receita "a receber" sempre com opção de gerar fatura — PREMISSA PERMANENTE

**Toda receita a receber — com ou sem contrato vinculado — precisa ter a opção de gerar fatura.** Isso já valia pra receitas ligadas a contrato (`ref_fatura`, tela de Faturas); receita **avulsa** (standalone, sem contrato) não tinha nenhuma forma de gerar fatura — bug reportado pelo usuário.

- Implementação: `_buildFaturaAvulsaBody`/`printFaturaAvulsa` (perto de `_buildFaturaBody`/`printFatura` em `index.html`) — mesmo CSS/visual da fatura de locação, mas com um único item (a própria receita) em vez da linha "Locação — X a Y" (período/km/extras não existem numa receita avulsa).
- Botão "Fatura" na lista de Receitas (Financeiro): usa o slot `onRight` do `SwipeRow` (**nunca `action2`** — `action2` ocupa o MESMO slot de swipe que `onDelete`/Estornar, um substitui o outro; usar `action2` ali some com a opção de excluir).
- Se a receita tiver `contrato_id` preenchido (campo "Contrato (opcional)" do formulário), a fatura puxa cliente/veículo de lá; senão usa `veiculo_id`/`cliente_id` diretos da receita, se houver. Sem nenhum dos dois, a fatura sai só com a descrição/valor — ainda assim válida.
- **Qualquer novo tipo de "a receber"** que apareça no sistema (nova categoria de receita, nova tela) precisa seguir essa mesma regra — nunca deixar um lançamento pendente sem opção de emitir fatura.

## Sincronização de baixas — PREMISSA PERMANENTE

**Toda baixa (pagamento/recebimento) de despesa, receita ou contrato DEVE sincronizar automaticamente com TUDO que estiver relacionado.** Uma baixa nunca pode atualizar só o registro tocado — precisa refletir em:

- Contratos ↔ Receitas (faturas `ref_fatura`): a baixa de um contrato atualiza a receita vinculada e vice-versa. **As duas telas têm que bater** (Total/Previsto, Recebido, A Receber, Vencidas).
- Despesas ↔ Contas fixas / manutenções vinculadas.
- Gráficos (barras, linhas, sparkline), fluxo de caixa, previsão, KPIs/scorecards, agenda, navegação mensal e sub-tabs.

### Contrato parcial — regra de valor

Para contrato com `status_pagamento === "parcial"`:
- **Previsto / Total** = `valor_total` (valor cheio do contrato) — nunca `valor_pago`.
- **Recebido** = `valor_pago` (a parcela efetivamente recebida).
- **A receber / restante** = `valor_total − valor_pago`.

A receita vinculada (`ref_fatura`) reflete o `valor_total` como `valor` (previsto) e guarda a parcela recebida em `_valorPago` (campo derivado do contrato em tempo de render). Nunca sobrescrever `valor` da receita com `valor_pago` — isso quebra a sincronia com a tela de Contratos.

Sempre que registrar uma baixa parcial/total de contrato (`confirmarParcialCt`, `confirmarBaixarCt`, fluxos inline), **patchar também a receita vinculada** para manter status e valor consistentes.

### Item recorrente (orçamento pessoal) — UMA função só, nunca PATCH solto

Histórico real deste projeto: o bug "baixei e continua aparecendo como pendente" (Salário AGI, depois Escola) precisou de **5 rodadas de correção**, uma por caminho de UI que baixava um item recorrente do jeito errado — cada um escrito na mão, cada um esquecendo a regra de recorrência. A causa de fundo sempre foi a mesma: código que fazia `db.patch("orcamento_pessoal", it.id, {status, data_pagamento})` **direto**, sem passar pela função compartilhada `baixarOrcPessoalItem(orcItens, itemId, mesAlvo)`.

**Regra permanente: NENHUM código pode fazer `db.patch`/`db.post` de baixa em `orcamento_pessoal` fora de `baixarOrcPessoalItem`.** Essa função já resolve:
- recorrente cujo mês próprio (`data`) é diferente do mês-alvo → cria linha-filha (`recorrencia_origem_id`) dedicada àquele mês, nunca patcha o template direto (isso "resolve" visualmente mas deixa o mês real sempre pendente pros cálculos — `calcSaldoOrcPessoalMes`/KPIs reprojetam ignorando o status cru do template);
- já existe uma linha-filha pra aquele mês (criada por outro caminho) → faz PATCH nela, nunca duplica;
- item não-recorrente ou já no mês certo → PATCH direto, simples.

Qualquer novo botão/swipe/atalho de "baixar" em orçamento pessoal — presente ou futuro — **tem que chamar `baixarOrcPessoalItem`**, passando o mês exato da ocorrência tocada (`efetivoMes(it)` ou `ev.data.slice(0,7)`, nunca "hoje" fixo). Antes de declarar uma tarefa de baixa concluída, **grep por `db.patch("orcamento_pessoal"` e `db.post("orcamento_pessoal"`** no arquivo inteiro e confirmar que todo resultado passa pela função — não só o caminho que acabou de ser editado.

**Nunca mais corrigir um registro corrompido só via SQL manual no Supabase.** SQL direto no banco é aceitável como curativo pontual de um dado já quebrado (feito uma vez), mas a causa tem que ser corrigida no código na mesma tarefa — nunca tratar o sintoma sem também eliminar a origem.

### "Marcar como resolvido" da Agenda NUNCA quita dinheiro

`agenda_adiamentos` (mapa `agAdiaMapa`/`agAdiaOculto`) existe pra pendência que
se resolve **fora do sistema** — licenciamento, IPVA, CNH, pneus, revisão. O
próprio modal diz isso, e o botão "Marcar como resolvido" só aparece quando o
cartão **não tem ação de baixa** (`semAcao` em `_agk2ModalAcao`).

**Cartão COM baixa real (`ev.acao === "baixar"` ou `"renovar"` — contrato,
despesa, receita, orçamento pessoal) tem fonte da verdade própria no banco** e
some sozinho quando o registro é de fato quitado (`jaPago`,
`temFilhoNoMesOrc` etc. em `buildAgendaEventos`). Por isso o marcador
`resolvido` **nunca** pode ocultar um desses: esconderia uma dívida ainda em
aberto pra sempre, sem nenhuma tela pra ver ou desfazer — foi exatamente o
conflito reportado ("o cartão sumiu da Agenda, o banco continuou sem a baixa,
e todos os painéis seguiram cobrando a pagar").

Regra permanente: no filtro final de `buildAgendaEventos`, `r.resolvido` só
oculta cartão **sem** ação de baixa/renovação. Adiar (`r.ate`) continua valendo
pra todos — mas adiar apenas **reposiciona** o cartão na nova data, nunca o
apaga. Qualquer mecanismo novo de "esconder cartão" tem que respeitar isso:
**nada que represente dinheiro em aberto pode ser ocultado por marcador de
UI — só pela quitação real no banco.**

## Agenda do Dashboard — 3 cartões e 3 dias, o resto no baralho — REGRA PERMANENTE

A Agenda embutida no Início **nunca** cresce livre: ela termina num ponto fixo
e o que passa disso vira "fantasma" (baralho empilhado com selo `+N`, que só
abre quando o usuário toca).

Dois cortes independentes, ambos com limite **3**:

- **`_maxVisiveis = 3`** (dentro de `CalendarioKanban2`) — no máximo **3
  cartões por dia**. Do 4º em diante, o dia empilha o resto no baralho.
- **`AGK2_LIM_DIAS = 3`** (`agk2CorteDias`) — no máximo **3 dias** renderizados
  no painel do Início. Os dias seguintes não são renderizados; todos os eventos
  deles entram no `+N` do baralho do **último dia visível** (por isso o badge
  soma `_ocultosDoDia + _ocultosDeOutrosDias` — mostrar só um dos dois mentiria
  sobre quanto ainda há por ver).

O corte de dias é **por DIA, nunca por cartão**: cortar por cartão faria um
único dia cheio consumir a cota inteira e esconder os outros dois.

Motivo original: sem os cortes o painel listava a janela inteira e empurrava o
painel de Boletos pra longe da tela.

**Antes de declarar concluída qualquer mudança que gere, filtre ou reordene
eventos da Agenda** (novo tipo de cartão, mudança em `buildAgendaEventos`,
mudança no filtro de adiados/resolvidos etc.), confirmar que os dois limites
continuam valendo — mais eventos elegíveis nunca podem virar mais cartões
visíveis, só um `+N` maior no baralho.

## Espaçamento entre painéis do Dashboard (Início) — PADRÃO PERMANENTE

Grid de 8pt, dois níveis só — **nunca inventar um terceiro valor**:

- **24px entre SEÇÕES distintas** do Dashboard (de um painel/grupo temático pro próximo — ex.: da Agenda pro bloco de Saldo, do bloco de pendências pros painéis de Despesas/Receitas, etc.).
- **16px entre PAINÉIS de um mesmo grupo** (painéis lado a lado ou empilhados dentro da mesma seção — ex.: os dois cards "Despesas por Categoria"/"Receitas por Cliente" lado a lado, a grade de Multas/Despesas/Renovações/Recebimentos/Manutenções).

Antes deste padrão o código tinha pelo menos 5 valores diferentes fazendo o mesmo papel (`gap:14`, `marginTop:21`, `gap:12`, `rowGap:40`, `marginTop:28`) — resultado visualmente inconsistente entre painéis vizinhos (bug reportado por print: painéis "Despesas por Categoria"/"Receitas por Cliente" mais apertados que o resto).

**Implementação:**
- O wrapper que envolve TODAS as seções do Dashboard (`inicio-fade-top`, dentro de `Inicio`) aplica `gap:24` entre cada item direto do array retornado por `Inicio` — isso já cobre a separação padrão entre seções, **sem precisar de `marginTop` extra** no elemento raiz de cada seção.
- Só use `marginTop:24` explícito quando o título/card não for filho direto do wrapper (ex.: dois elementos dentro do mesmo `React.Fragment` — o `gap` do wrapper não alcança elementos dentro de um Fragment, só entre os próprios Fragments/itens do array).
- Dentro de uma seção (grade, dois painéis lado a lado, lista de cards), use `gap:16` (ou `columnGap:16, rowGap:16` em grid).
- **Nunca** deixar uma seção nova com `marginTop:0` relando só no gap do wrapper "porque parece suficiente" — comparar visualmente com as seções vizinhas antes de declarar concluído.
- Exceção documentada: "Saldo nas contas hoje" logo abaixo da Agenda usa `marginTop:-12` de propósito (pedido explícito do usuário pra aproximar essas duas seções específicas, ajustado de -20 pra -12 pra o espaço Agenda→Saldo ficar igual ao espaço interno Saldo→Despesas) — qualquer exceção ao padrão 16/24 precisa desse tipo de comentário inline explicando o motivo.

Antes de declarar qualquer alteração no Dashboard como concluída, **comparar visualmente o espaçamento da seção alterada com as seções vizinhas** (a de cima e a de baixo) usando esse padrão 16/24 como referência.

## Fluxo de trabalho Git

Após cada push:
1. **Sempre criar um PR** automaticamente via `mcp__github__create_pull_request` apontando para `main`
2. **Sempre mergear o PR** imediatamente via `mcp__github__merge_pull_request` (squash), sem precisar que o usuário peça
