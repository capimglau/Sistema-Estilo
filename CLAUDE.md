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
- **`SwipeRow`**: o botão desenha **ícone e texto separados**. Rótulo que já
  começa com emoji (`"💸 Baixar"`, `"✅ Receber"`, `"↩ Estornar"`) tem o
  símbolo extraído e usado COMO ícone — não repita o emoji esperando que ele
  apareça no texto. Antes disso o botão saía com o emoji duas vezes e o texto
  cortado dentro dos 72px, a ponto de não dar pra saber qual era a ação.
  Toda linha com "Baixar" deve oferecer **"Editar" e "Excluir"**: um único
  botão revelado no swipe não se identifica sozinho. Baixar/Editar saem no
  swipe ←, Excluir no swipe →.
- **Prop aceito é prop usado.** `Lbl` recebia `style` dos chamadores e
  simplesmente ignorava: os cinco campos do filtro do relatório de Faturas
  pediam `flex:1, minWidth:120` por `style` e ficavam espremidos/cortados.
  Ao criar componente de layout, ou o prop entra no elemento ou não existe —
  prop silenciosamente descartado vira bug visual que ninguém acha.
- **Altura mínima de linha com swipe: 48px** (`.ag-swipe-wrap`). A área
  revelada tem exatamente a altura da linha — em lista compacta (~40px) o
  ícone e o rótulo do botão ficavam colados nas bordas. 48px também é o alvo
  de toque mínimo recomendado.

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

### O detector de versão nova NÃO pode recarregar no meio de um toque

O bloco no fim do `index.html` compara o `meta[name="ag-build"]` publicado com
o que está rodando e dá `location.reload()` quando muda. Ele ouvia
`visibilitychange` e recarregava em **qualquer** volta a visível.

No iOS, porém, abrir o **seletor de data**, o teclado ou a folha de
compartilhamento também esconde e reexibe a página em poucos segundos. O
usuário tocava na data inicial do relatório de Faturas, o app recarregava, e
como a sessão só restaurava a aba principal (`ag_current_tab`) e **não** a
sub-aba, ele reaparecia no Financeiro comum. O relato foi "clico na data e o
app fecha e volta pra aba Financeiro" — não era crash nenhum, era o
auto-update se atropelando.

Regras permanentes:

- Só verificar versão depois de uma **ausência real** (`hidden` por mais de
  ~20s). Ida-e-volta curta é seletor/teclado, não "saí do app".
- **Nunca recarregar com a tela ocupada** — janela aberta (`.lg-modal`) ou
  foco num `INPUT`/`TEXTAREA`/`SELECT`. Se estiver, reagenda a verificação.
- **Sub-aba é estado de navegação e se guarda junto com a aba**
  (`ag_subtab_*`, mesma janela de 10 min do `ag_current_tab_ts`). Qualquer
  recarregamento — auto-update, F5, iOS descartando a aba por memória — tem
  que devolver a pessoa à MESMA tela, não à raiz da seção.

### Causa raiz separada, mas relevante: cache do Service Worker mascarando os testes

Boa parte das rodadas de "não resolveu" desta investigação eram, na real, o aparelho do usuário preso numa versão antiga em cache — não um problema no código do ícone em si. Achado: `sw.js` tinha uma busca "network-first" que chamava `fetch(request)` puro (modo de cache **default**), que podia ser respondida por um cache HTTP do navegador/CDN sem nunca ir na rede de verdade, mesmo rotulada como "vai na rede". Corrigido forçando `{ cache: "no-store" }` nas buscas de navegação e de revalidação de estáticos. **Ao investigar qualquer bug de PWA que "não reflete a mudança" mesmo após o deploy, suspeitar de cache antes de suspeitar do código** — confirmar a versão em Config → Versão do app.

## Nada fora do React muda um nó de lugar — `[cm-sem-mover]` — PERMANENTE

O app tem código que percorre o DOM e decora o que o React desenhou — o
**Chart Manager** (`CHART MANAGER v2`, no fim do `index.html`: minimizar,
duplicar, mover card de aba, ocultar). Ele fazia `body.appendChild(card)`:
arrancava o `.lg-card` do container e enfiava dentro de um
`<div class="cm-body">`.

O React continuava achando que aquele card era **filho direto do container
original**. No render seguinte em que a lista **crescia**, ele chamava
`container.insertBefore(novaLinha, card)` — e o navegador respondia
`NotFoundError: The object can not be found here.`, que na tela virava
**"Algo deu errado"** e, no iPhone, **o app fechando sozinho**.

Sintoma reportado: no relatório de **Faturas**, escolher um **mês anterior**
fechava o app; **setembro** (mês corrente) não. Não era a data nem o seletor:
mês anterior **aumenta** a lista, e o React precisa inserir linhas **antes** do
card "TOTAL" que já não estava mais lá; o mês corrente só **encolhia** a lista
(só remoções), e remoção não passa por `insertBefore`. Era um bug latente em
**toda** lista do app que cresce, não só em Faturas.

**Regra permanente: código não-React pode LER o DOM e pode ACRESCENTAR filhos,
mas nunca pode MOVER nem REMOVER um nó que o React renderizou.**

- Acrescentar filho a um nó do React é tolerado — o React só mexe nos filhos
  que ele mesmo criou, e o nó extra nunca é referência de `insertBefore`.
- Mover ou remover um nó do React é fatal, sempre, mesmo que "funcione" na
  tela em que foi testado. Só quebra no primeiro render que insere um irmão.

Como o Chart Manager ficou:

- **O card é o próprio wrapper** (`card.classList.add('cm-wrapper','cm-inplace')`).
  A barra de ferramentas entra como **primeiro filho** do card e a barra de
  "minimizado" como **último** — filhos extra, nunca uma nova casa pro card.
- **Minimizar** põe a classe no próprio card
  (`.cm-wrapper.cm-inplace.cm-collapsed > *:not(.cm-toolbar):not(.cm-collapsed-bar)`),
  não num `.cm-body` que não existe mais.
- **Ocultar/mover** passa por **`cmSumir(wrapper)`**: em card real ele só faz
  `display:none`; `wrapper.remove()` num card real arranca do DOM um nó que o
  React ainda espera encontrar.
- **Duplicar/mover para outra aba** clona o HTML (`cmConteudoHTML`) e insere um
  **wrapper sintético** (`cmWrapperSintetico`) — nó que o React não conhece e
  que pode ser movido à vontade.
- **Arrastar para reordenar ficou desligado no card real** (`_real` em
  `bindWrapper`): reordenar é mover de lugar, e não há como fazer isso com um
  nó do React. Só o card duplicado/movido continua arrastável.

Guardas no `tests/run.js` (grupo *"Chart Manager não pode mover nó do React"*):
`body.appendChild(card)` e `wrapper.remove()` **zerados** no bloco, e presença
de `cm-inplace`, `cmSumir` e da trava de arrastar. Ao mexer nesse bloco, rodar
`node tests/run.js` antes de declarar concluído.

**Ao escrever qualquer código novo que ande pelo DOM** (decorador, observer,
polyfill, "melhoria visual" em JS puro): só acrescente. Se a ideia exige mover
um elemento renderizado pelo React, ela está errada — resolva no React ou por
CSS (`order`, `display`), nunca movendo o nó.

## Nada anima propriedade cara para sempre — `[bateria]` — PERMANENTE

Com o app **parado** na tela inicial, ele queimava **16% de um núcleo**,
continuamente. Medido pelo protocolo do Chrome (`Performance.getMetrics`), em
30s: **825 layouts** e **1308 recálculos de estilo** — cerca de 30 por segundo,
com ninguém tocando na tela.

Causa: **animação infinita em propriedade que o navegador não manda pra GPU.**
Só `transform` e `opacity` são compostas. Tudo o mais (`box-shadow`, `left`,
`top`, `width`, `filter`, `background-position`…) repinta ou refaz layout **a
cada quadro, no processador principal, para sempre**.

**Nenhuma animação foi desligada — pedido explícito do usuário: "não desative
animações".** Todas continuam na tela; o que mudou foi **o que cada uma anima**.

1. **`ag-today-pulse`** — 4 linhas do Dashboard pulsando `box-shadow`. Sozinho:
   **15,9% → 7,6%**. O pulso continua, agora numa **camada própria**
   (`.ag-hoje-glow`) que anima **opacidade**. A camada é **irmã** da
   `.ag-swipe-wrap`, nunca filha: a wrap tem `overflow:hidden` (pro swipe) e
   cortaria o brilho. Quem a desenha é o prop **`glow`** do `SwipeRow` —
   sem ele a linha não ganha nenhum elemento a mais.
2. **`ag-bar-shimmer`** — o brilho da barra de progresso animava **`left`**
   (layout a cada quadro) e, pior, **rodava desde o carregamento por baixo de
   uma barra invisível**: `opacity:0` **não pausa animação**. Agora anima
   `transform` e só existe sob `#ag-progress-bar.ag-bar-active` — o brilho
   visível é idêntico; o que parou foi o brilho que ninguém via.
3. **blobs decorativos do fundo** — continuam animando (`translate`+`scale`,
   as duas propriedades que vão pra GPU), agora com `will-change:transform`
   pra garantir camada própria.

`agk2-ev-pulse` (`filter`) e `ag-tw-blink` (até ~32 elementos piscando ao mesmo
tempo) seguem rodando, com `will-change` pra irem pra GPU em vez de recalcular
estilo no processador principal.

Resultado: **16,2% → 7,5% de um núcleo**; layouts 825 → 38; recálculos de
estilo 1308 → 371 — com todas as animações na tela.

**Regras permanentes:**

- Animação **infinita** só pode mexer em **`transform`** e **`opacity`**.
  Precisa de outro efeito? **Não desligue a animação** — mova o efeito para uma
  camada própria (pseudo-elemento, ou um irmão quando o pai tem
  `overflow:hidden`) e anime a **opacidade dela**. Se o elemento já usa
  `::before` e `::after` (como `.agk2-ev-card`), promova a camada com
  `will-change` e meça.
- **Nunca "resolver" consumo apagando animação.** O usuário pediu o contrário,
  em letras maiúsculas: o efeito fica, o custo é que sai.
- `opacity:0`, `visibility:hidden` e `display:none` no PAI **não pausam** a
  animação do filho. Elemento que vive no DOM desde o carregamento (barra de
  progresso, overlay, skeleton) só pode animar sob uma classe de estado.
- Efeito **decorativo** não anima para sempre. Se ninguém consegue apontar a
  informação que o movimento carrega, ele é custo puro.
- Antes de declarar concluída qualquer mudança visual com `animation:`, rodar
  `node tests/run.js` — o grupo *"Nada anima propriedade cara para sempre"* lê
  os `@keyframes` de toda animação infinita e falha se alguma tocar em
  propriedade de layout/pintura.

### Decorador de DOM não varre o documento a cada mutação

Segundo foco, menor mas do mesmo tipo: seis `MutationObserver` sobre
`document` inteiro, vários rodando `querySelectorAll` no documento **uma vez
por mutação** — e o app se re-renderiza sozinho a cada poucos segundos
(cartões que alternam de face).

- Existe **um agendador só**: **`window.__agIdle(chave, fn, ms)`** — junta a
  rajada de mutações numa passada e **não roda nada em segundo plano**
  (dispara o pendente quando a tela volta a ficar visível).
- O observador do **FAB** vigiava `style` em todo o documento; o React reescreve
  `style` inline o tempo todo. Ficou só `class`, que é o que marca a aba ativa.
- O **Chart Manager** só agenda varredura quando entrou um `.lg-card`
  (`_cmTemCard`).
- **Seletor de style é kebab-case.** `div[style*="borderRadius"]` casava com
  **zero** elementos — o DOM serializa `border-radius`. A "Strategy 2" do Chart
  Manager e a `isChartCard` que ela usava foram **removidas**: varriam o
  documento inteiro para nada. Corrigir o seletor não era opção — passaria a
  embrulhar centenas de divs de uma hora pra outra.

## Documento de cliente não fica aberto na internet — `[storage-privado]` — PERMANENTE

O bucket `documentos` nasceu **público** (`sql/09`). Com isso, **CNH, RG,
comprovante de residência, CRV, auto de infração e CNH de condutor infrator
abriam para qualquer pessoa que tivesse a URL** — sem login, sem prazo, sem
rastro. São dados pessoais de **terceiros** (os clientes da locadora): é
problema de LGPD antes de ser qualquer outra coisa.

Ele nasceu público por uma razão real, e é ela que define o desenho da
correção: **a tela de login desenha o logo da empresa ANTES de existir
sessão**, e link assinado exige sessão.

**A separação não é "interno × cliente". É MARCA × DOCUMENTO:**

| bucket | o quê | visibilidade |
|---|---|---|
| `marca` | logo e ícones da PWA | **público** — precisa abrir sem sessão |
| `documentos` | todo o resto | **privado** — só por link assinado |

Migração em `sql/15-storage-privado.sql`: cria o `marca`, **move** o que já
existe de `logo/` para lá, reescreve `config.logo_url`/`pwa_icon_*`, e só
**então** fecha o `documentos` e apaga a policy de `select` aberta. Nessa
ordem — fechar antes de mover deixaria a tela de login sem logo.

### Regras permanentes

- **`db.upload(path, file, publico)` nunca grava URL pública de documento.**
  O bucket público devolve a URL direta; o privado devolve o marcador
  **`priv:<caminho>`**. Gravar `/object/public/documentos/...` no banco cria
  um endereço que *parece* válido e dá 400 ao abrir.
- **Arquivo novo é documento por padrão.** `publico: true` no `UploadField` é
  exceção, e hoje são **três** campos, todos da pasta `logo/`. Campo novo que
  guarde qualquer coisa de pessoa **não leva esse prop**.
- **Nada abre o `href` direto.** Toda âncora de documento chama
  **`abrirDoc(valor, ev)`**, que assina no clique. `_docPath` reconhece **as
  duas formas de propósito** — o marcador novo e a URL pública antiga, que
  continua no banco dos registros anteriores à migração. É o que dispensa
  migração de dado: o que já existe volta a abrir sozinho.
- **A janela abre ANTES do `await`.** Depois do await o Safari não reconhece
  mais o gesto e bloqueia como popup — mesmo padrão que `enviarDocWA` já
  usava. Vale para `abrirDoc` e para `enviarNotifCliente`.
- **O que sai para o cliente usa `DOC_PRAZO_ENVIO` (90 dias).** Contrato e
  vistoria por WhatsApp/e-mail e o auto de infração na notificação ao
  condutor: quem abre não tem login, então o link precisa durar — mas agora
  ele **morre**, diferente da URL pública eterna de antes. São quatro saídas;
  o teste conta as quatro.

⚠️ **Objeto JS: a última chave vence.** Cinco dessas âncoras já tinham
`onClick: function(e){e.stopPropagation();}` (para o clique não abrir o card
inteiro). Inserir um `onClick` novo **antes** dele no mesmo objeto faz o novo
ser descartado **em silêncio** — o link continuaria indo para o href direto.
Foi exatamente o erro cometido ao escrever esta mudança, e há um teste que
falha se voltar. Ao acrescentar handler a um elemento que já tem um,
**funda os dois**, não empilhe.

Assinatura de contrato **não** passa por aqui: `assinatura_cliente`,
`assinatura_locadora` e `assinatura_motorista` são *data URI* guardados na
própria linha do contrato, não arquivos do Storage.

Travado em `tests/run.js`, grupo *"Documento de cliente não fica aberto na
internet"*, que confere também o SQL da migração.

## SQL de migração — sempre mostrar para copiar

Sempre que uma tarefa criar ou alterar um arquivo em `sql/` (nova tabela, coluna,
policy etc.), colar o conteúdo completo do SQL na resposta ao usuário, em um bloco
de código pronto para copiar — mesmo que o arquivo já tenha sido salvo no repositório.
Nunca assumir que o usuário vai abrir o arquivo sozinho para rodar no Supabase.

## Branch de desenvolvimento

Branch ativo: `claude/resolved-option-no-invoice-pv3rx3`

## A DATA DA BAIXA VALE PARA O SISTEMA INTEIRO — PREMISSA MÁXIMA

**Palavras do usuário: "a premissa da lógica da data de baixa é para o sistema
inteiro e todos os gráficos e painéis".**

Não é regra de uma tela, de um painel nem de um tipo de lançamento. É premissa
do produto:

> **Um lançamento pertence ao mês da sua `data_pagamento`. Sem baixa, pertence
> ao mês da previsão. Isso vale em TODA tela, TODO painel, TODO gráfico, TODO
> KPI, TODO relatório e TODO fluxo de caixa — sem exceção de tipo, de status ou
> de origem do dado.**

Três coisas que **já causaram bug aqui** e não podem voltar:

1. **Nunca exija `status` junto com a data.** Perguntar
   `status === "recebido" && data_pagamento` é uma segunda trava para a mesma
   pergunta: basta um dos vários caminhos de baixa gravar a data sem carimbar o
   status — ou carimbar outro — e o lançamento volta para o mês da previsão.
   Foi por isso que *"recebi em 31/08 e aparece em setembro"* voltou **cinco
   vezes**, cada vez por um ponto diferente. **Existe `data_pagamento`? O mês é
   o dela. Ponto.**
2. **Resolva ANTES de filtrar.** Quando o dado precisa ser completado para
   decidir o mês (fatura cuja baixa está no contrato — `rdReceitaComContrato`),
   o enriquecimento vem **antes** do `.filter`. A lista do Financeiro fazia
   depois: decidia o mês sem a baixa e desenhava a etiqueta com ela, mostrando
   "31 AGO" dentro do mês de setembro — o mesmo dado dizendo duas coisas na
   mesma linha.
3. **Toda baixa pergunta a data.** Regra de leitura nenhuma conserta data
   gravada errada — ver *"Toda baixa PERGUNTA a data"* em
   `[previsto-liquidado]`.

**Checklist obrigatório antes de declarar concluído qualquer painel, gráfico,
KPI ou relatório que envolva dinheiro:**

1. `grep` por `.slice(0,7) ===` e `.slice(0, 7) ===` perto de `previsao_`,
   `vencimento`, `\.data` — **todo filtro de mês montado na mão é suspeito**.
   Use a função única do tipo (tabela em `[previsto-liquidado]`).
2. `grep` por `status === "recebido"`, `status_pagamento === "pago"` e
   `"parcial"` **dentro de decisão de mês** — não pode existir nenhum.
3. Rode `node tests/run.js`: os grupos *"Previsto até liquidar…"*, *"Receita
   por cliente é do MÊS…"* e o contador de filtros inline falham se um voltar.

A regra completa, com a tabela de funções por tipo e as armadilhas de
recorrente/parcial, está em **`[previsto-liquidado]`** mais abaixo.

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

## Todas as contas alimentam o fluxo de caixa — `[contas-fluxo]` — PERMANENTE

A tabela `contas` (contas a pagar/receber, campo `tipo`: `"pagar"` | `"receber"`)
apareceu por muito tempo só na Agenda e nos alertas do Início: **não entrava em
cálculo de dinheiro nenhum**. O fluxo de caixa somava contratos, receitas,
despesas, manutenções e multas e ignorava as contas — dinheiro que sai (ou
entra) de verdade e não aparecia em lugar nenhum.

**Regra permanente: toda conta é dinheiro e entra em todo cálculo de caixa,
exatamente como despesa, manutenção e multa já entram.** `tipo: "receber"`
soma nas entradas; `tipo: "pagar"` soma nas saídas; `status: "cancelado"`
fica de fora.

Helpers únicos (escopo global do `index.html`) — **nunca refazer essa conta na
mão em nenhum painel**:

- `contaEhReceber(c)` · `contaCancelada(c)` · `contaEstaPaga(c)`
- `contaDataFluxo(c)` — **a data em que a conta pesa no caixa**: enquanto está
  em aberto vale o `vencimento` (quando o dinheiro deve sair); depois de paga
  vale a `data_pagamento` (quando saiu de fato). Mesma regra que despesas e
  receitas já usam — não inventar outra.
- `contasDoMesFluxo(contas, mes)` e `totaisContasMes(contas, mes)` →
  `{entrada, saida}`.

Já ligados (mantenha os dois batendo — são dois "fluxo de caixa" diferentes na
mesma tela do usuário):

- `Financeiro` → aba **Fluxo** (Linha do Tempo diária/mensal, com pílula
  própria "Contas") e o painel **Fluxo de Caixa — 12 meses**.
- `_saldoFluxoMesLoc` (saldo do fluxo de caixa do mês, lido pelo painel do
  Início). Para isso o prop `contas` foi passado por
  `Inicio → PessoalDash → OrcamentoPessoalInline → OrcamentoPessoal`.

**Ao criar qualquer painel novo de dinheiro** (fluxo, previsão, saldo, KPI,
gráfico), incluir `contas` junto com despesas/manutenções/multas. Um painel
que soma despesa e esquece a conta mente sobre o caixa.

Ponto em aberto, decidir com o usuário antes de mexer: as contas ainda **não**
entram no *Resultado Previsto* / DRE / KPIs de despesa do Dashboard. Esses são
números de resultado (competência), não de caixa, e incluí-los muda valores que
o usuário lê todo dia — não fazer por conta própria.

## Receita "a receber" sempre com opção de gerar fatura — PREMISSA PERMANENTE

**Toda receita a receber — com ou sem contrato vinculado — precisa ter a opção de gerar fatura.** Isso já valia pra receitas ligadas a contrato (`ref_fatura`, tela de Faturas); receita **avulsa** (standalone, sem contrato) não tinha nenhuma forma de gerar fatura — bug reportado pelo usuário.

- Implementação: `_buildFaturaAvulsaBody`/`printFaturaAvulsa` (perto de `_buildFaturaBody`/`printFatura` em `index.html`) — mesmo CSS/visual da fatura de locação, mas com um único item (a própria receita) em vez da linha "Locação — X a Y" (período/km/extras não existem numa receita avulsa).
- Botão "Fatura" na lista de Receitas (Financeiro): usa o slot `onRight` do `SwipeRow` (**nunca `action2`** — `action2` ocupa o MESMO slot de swipe que `onDelete`/Estornar, um substitui o outro; usar `action2` ali some com a opção de excluir).
- Se a receita tiver `contrato_id` preenchido (campo "Contrato (opcional)" do formulário), a fatura puxa cliente/veículo de lá; senão usa `veiculo_id`/`cliente_id` diretos da receita, se houver. Sem nenhum dos dois, a fatura sai só com a descrição/valor — ainda assim válida.
- **Qualquer novo tipo de "a receber"** que apareça no sistema (nova categoria de receita, nova tela) precisa seguir essa mesma regra — nunca deixar um lançamento pendente sem opção de emitir fatura.

## Fatura emitida não muda de mês nem de valor — `[fatura-nao-migra]` — PERMANENTE

`criarFaturaPrevista` (tela de Contratos) cria a receita "prevista" de um
contrato. Quando a **previsão de pagamento muda**, ela *migra* a receita já
existente para o mês novo — reescrevendo `ref_fatura`, `data`,
`data_vencimento` e **`valor`**.

O único freio era `status !== "recebido"`. Com isso, **a fatura já emitida ia
junto**: o mês antigo ficava sem receita nenhuma vinculada e voltava a aparecer
**"sem emissão"** — como se a fatura nunca tivesse saído — e o número dela
(`FAT-xxxxx`) reaparecia num mês em que não foi emitida, com o valor trocado
pelo valor atual do contrato. Sintoma relatado: *"as faturas não aparecem mais
como emitidas nos meses passados"*.

**Regra permanente: fatura emitida é DOCUMENTO. Tem número e data de emissão, e
pertence à competência em que saiu — não migra de mês, não tem o valor
reescrito e não é apagada por edição de contrato.**

- só migra de mês a **previsão pura**: `status !== "recebido"` **e**
  `status !== "emitida"` **e** sem `numero_fatura` **e** sem `data_emissao`;
- quando não migra, o mês novo **ganha a sua própria fatura prevista** (o
  `return` antigo deixava o mês novo sem fatura nenhuma — valia também para a
  recebida);
- mudar o `valor_total` do contrato **não** carimba o valor novo por cima de
  uma fatura emitida: atualiza só a prevista e **avisa na tela** que a emitida
  ficou com o valor original (cancele e emita de novo para atualizar).

Travado em `tests/run.js`, grupo *"Fatura emitida não migra de mês"* — que roda
a `criarFaturaPrevista` real com dublês de `db`, e não uma cópia da regra.

## O relatório de Faturas é POSIÇÃO, não emissão — `[relatorio-posicao]`

Relatórios › Faturas mostra **como estão** as faturas (previstas, emitidas,
vencidas, pagas). **Emitir não é função dele** — emitir tem lugar em
Financeiro › Faturas e na Agenda, onde existe o contexto da cobrança.

A seleção dessa tela serve para **escolher quais faturas saem no relatório**
(PDF e CSV), não para emitir em lote:

- qualquer fatura pode ser marcada (antes só a "emitível" era clicável);
- nada marcado = sai a lista filtrada inteira, e a tela diz isso;
- o card de total vira **"TOTAL SELECIONADO (n de N)"** e os botões mostram a
  contagem — o que se vê na tela é o que sai no papel;
- o PDF registra no cabeçalho quando é uma seleção parcial.

Travado em `tests/run.js`, grupo *"Relatório de Faturas é posição, não
emissão"*, incluindo a verificação de que a tela **não faz nenhum
`db.post`/`db.patch` em `receitas`**.

## Situação da fatura ≠ "já foi emitida" — `[fatura-emitida]` — PERMANENTE

A fatura tem **uma situação** (`prevista` · `emitida` · `vencida` · `paga` ·
`cancelada`) e ela é **exclusiva**: passou do vencimento sem pagar, vira
`vencida` — e `vencida` tem que continuar ganhando de `emitida`, porque é a
situação que pede ação.

O erro foi tratar essa situação como se também respondesse *"esta fatura já foi
emitida?"*. Como toda emitida acaba vencendo, o resultado era:

- o filtro **"Emitidas"** devolvia lista vazia em **todo mês fechado**, com
  faturas numeradas visíveis na mesma tela ("não há nenhuma emitida de nenhum
  mês");
- a pílula **"Emitidas"** marcava **R$ 0,00** para sempre;
- a fatura **com número** ainda oferecia **"Emitir"** — e emitir de novo
  gerava outro número **por cima do primeiro**, apagando o rastro;
- e ela **não podia ser cancelada** (`podeCancelar` exigia `status==="emitida"`).

**Regra permanente: "já foi emitida" é `foiEmitida` — `numero_fatura` ou
`data_emissao` preenchidos — e nunca se deduz da situação.** O relatório de
Faturas já fazia certo (`foiEmitida`); a aba Financeiro › Faturas não, e as
duas telas divergiam sobre o mesmo dinheiro.

Onde vale (todos já corrigidos, não reintroduzir):

- filtro "Emitidas" → `foiEmitida && status !== "paga" && status !== "cancelada"`;
- pílula **"Já emitidas"** → mesma lista. O rótulo diz "Já emitidas" de
  propósito: essa pílula **atravessa** as outras (uma emitida também pode estar
  vencida), então **somar as quatro não dá o total do mês** — por isso o
  denominador do percentual pago é o total das competências, nunca
  `totP+totE+totV+totPg`;
- `podeEmitir` → `!foiEmitida && (prevista|vencida)`, e a própria `emitir()`
  recusa com aviso na tela (nenhum caminho pode reemitir em silêncio);
- `podeCancelar` → `foiEmitida && !paga && !cancelada`;
- **emissão em lote das DUAS telas** (Financeiro › Faturas e Relatórios ›
  Faturas) filtra por `!foiEmitida`.

**Qualquer tela nova de fatura** — e qualquer botão de emitir, filtro ou
contador — pergunta `foiEmitida`, nunca `status === "emitida"`. Travado em
`tests/run.js`, grupo *"Fatura já emitida não some nem se reemite"*.

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

### Baixa é UMA função por tipo — `[baixa-unica]` — REGRA PERMANENTE

**Uma baixa registrada em qualquer tela tem que aparecer baixada em TODAS as
outras, na mesma hora — telas, painéis, KPIs, gráficos, agenda, fluxo de caixa
e previsão. Nada pode continuar pendente em lugar nenhum.**

A causa raiz de toda quebra dessa regra, sem exceção neste projeto, é a mesma:
**a regra de baixa escrita mais de uma vez**. Cada cópia nasce completa e vai
ficando para trás conforme a outra evolui. Já aconteceu com o orçamento
pessoal (5 rodadas), com a despesa recorrente, com a manutenção vinculada e
com o contrato da fatura.

Existe **uma função por tipo de baixa**, no escopo global do `index.html`, e
**nenhuma tela pode reimplementar a regra**:

| o que baixa | função única | o que ela arrasta junto |
|---|---|---|
| item do orçamento pessoal | `baixarOrcPessoalItem` | linha-filha do mês da recorrência |
| despesa | `baixarDespesaItem(despesas, id, dataPag, mesAlvo)` | linha-filha do **mês da parcela** (recorrente) + `manutencao` vinculada |
| receita | `baixarReceitaItem` | `contratos` da fatura (`ref_fatura`) |
| contrato | `confirmarBaixarCt` / `confirmarParcialCt` | receita vinculada, via `sincronizarRefFatura` |

Todas devolvem um resultado normalizado — `{novo}` / `{id, patch}` /
`{removido}`, mais os vínculos (`manutencao`, `contrato`) — que o chamador
aplica com **`_orcAplicarLocal`** (genérica, apesar do nome histórico). Para
`orcamento_pessoal` há ainda o `_orcBroadcast`, porque essa tabela tem quatro
cópias vivas (ver `[orc-sync]` abaixo); as demais tabelas têm cópia única no
`App` e basta chamar o setter (`setDespesas`, `setReceitas`, `setContratos`,
`setManutencoes`).

**Recorrente baixa no MÊS DA PARCELA, nunca no mês do pagamento.** Uma
recorrente cadastrada em março, vista em março, baixa março; a mesma vista em
setembro baixa setembro — ainda que o pagamento seja lançado hoje. Por isso
`baixarDespesaItem` e `baixarOrcPessoalItem` recebem **`mesAlvo` separado da
data de pagamento**, e quem chama passa o mês da linha que está na tela
(as listas já entregam a recorrente projetada — `resolverDespesasDoMes` para
despesas, `_projetar` para orçamento pessoal — então é
`(d.data||"").slice(0,7)`). Tirar o mês da data de pagamento, como já foi
feito aqui, fazia quitar hoje uma parcela atrasada de março criar a linha em
**setembro**: março ficava em aberto para sempre e setembro aparecia pago duas
vezes.

**Checklist obrigatório antes de declarar concluída qualquer tarefa que
envolva baixa:**

1. `grep` por `db.patch("<tabela>"` e `db.post("<tabela>"` no arquivo inteiro
   e confirmar que **todo** resultado com `status`/`data_pagamento` passa pela
   função única. Um `db.patch` solto é sempre um bug esperando o próximo mês.
2. Conferir os vínculos do tipo baixado: despesa ↔ manutenção, receita ↔
   contrato da fatura, contrato ↔ receita, recorrente ↔ linha-filha do mês.
3. Nenhum caminho de baixa pode **terminar em silêncio**. Se a função devolveu
   `null` (lançamento não encontrado) ou o tipo do evento não é reconhecido,
   avise na tela. Um botão que não faz nada e não diz nada já custou várias
   rodadas de investigação aqui.
4. Comparar id **sempre** com `String(a) === String(b)`. Id chega do banco com
   tipo diferente do que circula na tela, e um `===` cru que falha devolve
   `null` — que vira exatamente uma baixa que não acontece, em silêncio.
5. Desfazer tem que desfazer **o que foi feito**: se a baixa criou a
   linha-filha do mês, o "Desfazer" apaga essa linha (não adianta restaurar o
   status do template); se arrastou o contrato junto, devolve o contrato
   também.

Divergências reais já encontradas e corrigidas por esta regra — não
reintroduzir:

- `_agBaixar` (painéis do Início) dava PATCH cru: recorrente era quitada no
  template e a manutenção vinculada ficava pendente para sempre.
- `_agBaixar` não marcava o contrato da fatura ao receber a receita: Contratos
  e Receitas mostravam totais diferentes para o mesmo dinheiro.
- `marcarPaga` (aba Faturas) marcava a receita e deixava o contrato em aberto.
- `ItemCard._baixar` (orçamento pessoal) abria o formulário de edição em vez
  de dar baixa.
- Um painel chamava `_agBaixar({type:"rec"})` e a função só conhecia
  `"receita"` — o botão "Receber" não fazia absolutamente nada.

### Toda gravação em `orcamento_pessoal` precisa avisar as OUTRAS cópias — `[orc-sync]`

O app mantém **quatro cópias vivas** da mesma tabela em memória:
`App.orcItens`, `Inicio._orcFresh`, `PessoalDash._pesItens` e
`OrcamentoPessoal.itens`. Atualizar só a cópia do caminho que gravou é a causa
raiz do sintoma **"baixei/editei e nada aconteceu"** — o registro muda no banco
e a tela continua idêntica até um reload. Foi exatamente isso na Agenda dentro
do Orçamento Pessoal: ela montava `CalendarioKanban2` **sem `onOrcAtualizado` e
sem `toast`**, então a baixa gravava em silêncio absoluto.

Regra permanente: depois de gravar, chame **`_orcBroadcast(resultado)` uma
vez** — `{novo: registro}`, `{id, patch}` ou `{removido: id}`. Cada cópia se
inscreve com `useOrcSync(...)` e se atualiza sozinha. Ao aplicar o resultado na
própria cópia, use **`_orcAplicarLocal(p, res)`**, nunca um `concat`/`map` na
mão: a mesma gravação também volta pelo evento e um `concat` cego insere a
linha nova duas vezes (`_orcAplicarLocal` é idempotente de propósito).

Duas armadilhas relacionadas, já corrigidas — não reintroduzir:

- **Lista projetada não serve pra baixar.** A Agenda do Orçamento Pessoal
  recebe as recorrentes já projetadas pro mês exibido (é o que faz o cartão
  aparecer). Nessa cópia o `data` da recorrente já é do mês-alvo, então
  `baixarOrcPessoalItem` acha que não há projeção e dá **PATCH no template** —
  o erro que esta seção inteira existe pra evitar. Por isso `CalendarioKanban2`
  aceita `orcItensRaw` (cópia crua) e a baixa usa **sempre** ela.
- **Deep-link não pode agir antes da carga.** `OrcamentoPessoal` carrega
  `itens` de forma assíncrona, mas o deep-link da Agenda chega junto com a
  montagem da tela. Sem esperar (`if (loading) return;`), o `find` não achava o
  item, o formulário não abria e o deep-link era descartado — "editar pela
  agenda não faz nada".

**Nunca mais corrigir um registro corrompido só via SQL manual no Supabase.** SQL direto no banco é aceitável como curativo pontual de um dado já quebrado (feito uma vez), mas a causa tem que ser corrigida no código na mesma tarefa — nunca tratar o sintoma sem também eliminar a origem.

### "Marcar como resolvido" da Agenda NUNCA quita dinheiro

`agenda_adiamentos` (mapa `agAdiaMapa`/`agAdiaOculto`) existe pra pendência que
se resolve **fora do sistema** — licenciamento, IPVA, CNH, pneus, revisão. O
próprio modal diz isso, e o botão "Marcar como resolvido" só aparece quando o
cartão **não representa dinheiro a quitar** (`podeResolver` em
`_agk2ModalAcao` — `semAcao`, mais o cartão de emissão de fatura descrito em
[emissao-dispensada] logo abaixo).

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

### Emissão de fatura dispensada — `[emissao-dispensada]` — PERMANENTE

Há empresa que **não recebe fatura**. Pra essas, o aviso "Emitir Fatura"
cobrava pra sempre: não existe nada no banco que o faça sumir, porque a fatura
nunca vai ser emitida. Aparecia em **seis lugares** ao mesmo tempo — Agenda,
calendário de Alertas do Início, painel "Boletos a emitir", etiqueta girando no
card de Contratos, o alerta do painel de contratos e o `.ics` exportado.

O cartão **"Emitir Fatura"** da Agenda (`acao:"emitir"`) passou a abrir a
janela de ação, com três saídas: **Emitir** (leva ao Financeiro, que emite com
o mesmo número e confirmação de sempre), **Adiar** e **"🚫 Não emitir — marcar
como resolvido"**.

**Isso não fere `[agenda-resolvido-nao-quita]`:** emissão é papelada, não
dinheiro. O cartão tem `fluxo: null` (não entra em soma de caixa nenhuma) e o
recebimento continua cobrando no cartão próprio dele ("Pgto Contrato",
`acao:"baixar"`), que segue **inocultável** por marcador de UI. Por isso
`_temBaixaReal` no filtro final de `buildAgendaEventos` continua sendo só
`"baixar" || "renovar"` — não inclua `"emitir"` ali.

**A marca vale por vencimento**: a chave carrega a data da emissão, então no
ciclo seguinte o aviso **volta sozinho** — mesma regra do licenciamento/CNH.

Helpers únicos (escopo global do `index.html`) — **nunca refazer essa conta na
mão**:

- `faturaEmissaoDataISO(c)` — 20 dias antes de `previsao_pagamento`;
- `faturaEmissaoChave(c)` — `"emissao|<id>|<data da emissão>"`, a chave em
  `agenda_adiamentos`;
- `faturaEmissaoDispensada(c, agora)` — a pergunta que **todo** aviso de
  emissão faz antes de cobrar.

**Aviso novo de emissão de fatura pergunta a `faturaEmissaoDispensada`.** Um
que esqueça vira aviso zumbi: o usuário resolve num lugar e continua sendo
cobrado no outro — que é o bug que essa regra existe pra evitar. Chave montada
"na mão" em outro lugar tem o mesmo efeito, por isso a data da emissão é
calculada **num lugar só**.

Detalhe fácil de esquecer: `agAdiaMapa()` vive **fora do React**. Tela que lê
essas funções precisa se inscrever em `ag:adia-sync` pra re-renderizar
(`_setAdiaVersaoInicio` em `Inicio`, `_setAdiaVersaoCt` em `Contratos`) —
sem isso a marca só aparece no próximo reload.

Travado em `tests/run.js`, grupo *"Emissão de fatura dispensada sai de TODOS os
avisos"*, que roda os helpers reais extraídos do `index.html`.

## Previsto até liquidar, liquidado no mês em que o dinheiro andou — `[previsto-liquidado]` — PERMANENTE

**Regra do usuário, nas palavras dele: "toda receita ou despesa deve aparecer
no mês previsto e, após a liquidação, no mês liquidado".**

Enquanto está **em aberto**, o lançamento pesa no mês da **previsão**
(vencimento / data prevista / competência). Depois de **liquidado**, ele
**muda de mês**: passa a pesar no mês em que o dinheiro efetivamente entrou ou
saiu (`data_pagamento`). Não é "aparece nos dois" — é **um mês só, e ele
muda** quando a baixa acontece.

Vale para **os cinco tipos de dinheiro do app**, sem exceção:

| tipo | função única | em aberto | liquidado |
|---|---|---|---|
| despesa | `despesaDoMes(d, mes)` | `data` | `data_pagamento` |
| receita avulsa | `receitaDoMes(r, mes)` | `data` | `data_pagamento` |
| fatura de contrato | `receitaDoMes(r, mes)` | competência do `ref_fatura` | `data_pagamento` |
| contrato | `rdMesDoContrato(c)` | `previsao_pagamento` | `data_pagamento` |
| conta a pagar/receber | `contaDataFluxo(c)` | `vencimento` | `data_pagamento` |
| manutenção | `manDataFluxo(m)` · `manVisivelNoMes` · `manDoMes` · `manMesRefGlobal` | `data_previsao_pagamento` | `data_pagamento` |
| multa | `multaDataFluxo(m)` · `multaDoMes(m, mes)` · `multaMesRef(m)` | `vencimento` | `data_pagamento` |

**PARCIAL migra igual — "independente de ser parcial ou não".** Recebeu ou
pagou em parte, o lançamento é do mês em que o dinheiro andou. Vale para
`rdMesDoContrato` (`parcial` entra junto com `pago`) e para `receitaDoMes`
(`status === "parcial"` junto com `"recebido"`). **Efeito conhecido e aceito
pelo usuário:** o valor que migra é o `valor_total` **previsto**, porque é o
que a regra do contrato parcial manda exibir — então o restante a receber
acompanha a parcela para o mês da liquidação. Separar parcela recebida de
saldo a receber, cada uma no seu mês, seria outra mudança (um lançamento
virando dois) e ainda não foi pedida.

**"Independente da data de cadastro."** O que manda depois da liquidação é a
data em que o dinheiro andou — 31/08 é agosto, 02/09 é setembro — não importa
quando o lançamento foi criado nem para quando estava previsto.

**Quem decide o mês é o CAMPO `data_pagamento`, preenchido pelo usuário.**
Palavras dele: *"se uma parcela é de março e eu quiser que ela seja baixada em
março, eu vou colocar na data de pagamento a data de março, independente de ela
ter sido paga em setembro. A data do efetivo pagamento é a competência do
mês."* Ou seja: **não existe exceção de tipo** — existe uma data, e é ela que
manda. Parcela de março paga em 02/09 pesa em **setembro**; se o usuário datar
a baixa em março, pesa em **março**.

**A única coisa que NÃO migra é o TEMPLATE da recorrente** — e isso não é
exceção à regra, é outra coisa: o template não é um lançamento, é a régua que
**projeta** as parcelas mês a mês (`despesaDoMes`, `despesaVisivelNoMes`,
`manVisivelNoMes`, `manDoMes`). Migrar a data base dele faria a recorrente
inteira pular de lugar e sumir dos meses seguintes. Cada **parcela** é a
linha-filha (`recorrencia_origem_id`), e ela segue a regra como qualquer outro
lançamento.

**`resolverDespesasDoMes` usa DUAS chaves para a mesma linha-filha, de
propósito** — mexer numa sem a outra reintroduz um bug conhecido:

| o quê | por qual data | por quê |
|---|---|---|
| esconder o template | `data` da filha (**mês da parcela**) | a parcela de março já foi resolvida; se o template voltasse ali, a mesma despesa ficaria duas vezes na tela — prevista em março **e** paga em setembro (o bug que `[baixa-unica]` descreve) |
| entrar no resultado do mês | `despesaDoMes` (**mês do pagamento**) | é onde o dinheiro saiu |

Resultado: março fica sem nada (não houve caixa ali e a pendência foi
resolvida) e setembro mostra a parcela paga. **Setembro mostra duas linhas, e
as duas são legítimas**: a parcela de setembro (projetada, ainda prevista) e a
parcela de março que saiu do caixa agora — são dois aluguéis diferentes. O que
nunca pode é a **mesma** parcela aparecer duas vezes.

**O Orçamento Pessoal segue a MESMA regra, com os mesmos dois conceitos.**
Havia três cópias de `_vis`/`efetivoMes` (`calcSaldoOrcPessoalMes`,
`PessoalDash` e a tela de Orçamento Pessoal), todas decidindo o mês por
`data ?? mes` e ignorando a `data_pagamento`. Agora a conta é global:

| função | devolve | quem usa |
|---|---|---|
| `orcMesDaParcela(it)` | de que **ocorrência** é a linha | a **baixa** (`mesAlvo`, ver `[baixa-unica]`) e a trava que esconde o template |
| `orcMesEfetivo(it)` | em que mês **o dinheiro andou** | as **listas** e os totais |
| `orcTemFilhaNoMes(itens, it, mes)` | a parcela do mês já tem linha própria? | `orcVisivelNoMes` |
| `orcVisivelNoMes(it, itens, mes)` | a linha aparece neste mês? | `_vis` das duas cópias |

`itemVisivelNoMes` e `itensProprios` (tela de Orçamento Pessoal) passaram a
usar `orcMesEfetivo`; **`idsBaixados` continua por `orcMesDaParcela`** — é a
mesma dupla de chaves de `resolverDespesasDoMes`, e trocar uma pela outra faz
março voltar a mostrar a parcela como prevista, com a despesa duas vezes na
tela. **`efetivoMes(it)` na tela continua sendo o mês da PARCELA** de
propósito: é o que a baixa e a busca de linha-filha precisam.

**Isso é LEITURA, não gravação.** Nada disso reescreve `ref_fatura`, número ou
data de emissão: `[fatura-nao-migra]` continua valendo, e a aba **Faturas**
continua listando a **competência** (ela monta a lista a partir do contrato,
não do `receitaDoMes`). Fatura é o documento da competência; o dinheiro é do
mês em que andou — as duas leituras convivem, cada uma na sua tela.

**Contrato: `rdMesDoContrato(c)` em TODO painel de dinheiro.** Havia doze
filtros inline espalhados (Dashboard, Financeiro, Contratos, Relatórios,
PessoalDash, fluxo de 12 meses, rentabilidade por veículo, sheet do gráfico
diário) — metade já fazia "pago → `data_pagamento`" e **nenhuma** cobria
`parcial`, então a mesma locação caía em meses diferentes conforme o painel.
Hoje são zero: `node tests/run.js` falha se um voltar.

### A cobrança ao cliente tem vencimento próprio — `[multa-cobranca-venc]`

A etapa **"Cobrado ao Cliente"** do pipeline de multas gravava só a **data da
cobrança** (`data_cobranca_cliente`). Sem vencimento, não havia como saber se
aquele boleto está em atraso — relato do usuário: *"aparece somente a data da
cobrança, não há controle se está em atraso"*.

O "atrasado" era deduzido por duas heurísticas que **não respondem a pergunta
certa**:

- **`m.vencimento`** é o prazo para pagar o **ÓRGÃO** — que nessa altura do
  pipeline já foi pago. Uma multa vencida no órgão marcava o cliente como
  atrasado mesmo com o boleto dele em dia.
- **"cobrado há mais de 30 dias"** — chute fixo, igual para todo cliente.

Agora existe **`multas.vencimento_cobranca_cliente`** (`sql/13-multas-vencimento-cobranca.sql`),
pedido no modal de cobrança junto com a data (sugere +7 dias), e a pergunta tem
**uma função só**: **`multaCobrancaAtrasada(m, hoje)`** — nenhuma tela deduz
isso na mão (três cópias da heurística foram removidas). `multaCobrancaVenc(m)`
e `multaCobrancaPendente(m)` completam o trio.

As heurísticas antigas ficaram como **retaguarda**, e só valem quando o campo
está vazio: sem isso, todo atraso já sinalizado nas multas cobradas antes da
migração sumiria da tela de uma vez.

**Nunca reaproveitar `m.vencimento` para prazo de cliente** — são dois prazos
diferentes, de dois credores diferentes, na mesma multa.

Uma etapa antes, **"Boleto Solicitado"** tinha o mesmo buraco: registrava a
data do pedido e nada mais, então o pedido podia ficar parado no órgão por
meses sem a etapa nunca aparecer atrasada. Ganhou
**`multas.prazo_boleto_orgao`** (`sql/14-...`, sugere +15 dias) e
**`multaBoletoOrgaoAtrasado(m, hoje)`**.
⚠️ **Sem o campo preenchido não existe atraso** nessa etapa — chutar um prazo
padrão seria repetir exatamente o erro dos "30 dias" que esta seção corrigiu.

**Etapa nova no pipeline que espera resposta de terceiro precisa de PRAZO
próprio**, não só da data do evento. Data sozinha registra o que aconteceu;
prazo é o que torna a espera cobrável.

**Pedir no modal não basta — tem que dar para CONFERIR e CORRIGIR depois.**
Os dois prazos existiam no banco, nos helpers e nos modais do pipeline, mas
**não apareciam no formulário "Editar Multa"**. Quem digitasse errado (ou
pulasse o modal) não tinha onde arrumar, e a etapa ficava sem atraso para
sempre — relato do usuário: *"na cobrança ao cliente não há a data de
vencimento do boleto do cliente"*. É o mesmo princípio de *"todo tipo que tem
`data_pagamento` tem o campo no formulário de edição"* em
`[previsto-liquidado]`: **campo que o sistema usa para decidir alguma coisa
precisa estar na tela de edição daquele registro.** Hoje são
`prazo_boleto_orgao` (Etapa 4) e `vencimento_cobranca_cliente` (Etapa 5), os
dois travados em `tests/run.js`.

### A Etapa 4 segue a ordem REAL do processo — `[multa-ordem-etapa4]`

O formulário mostrava **Vencimento + Status do Pagamento + Data do Pagamento
ANTES** de "Boleto Solicitado" e "Boleto Recebido" — a tela contava o processo
ao contrário (relato: *"está invertido, o pagamento está antes da solicitação
e do recebimento do boleto"*).

A ordem é a da vida real, e é essa que a tela tem que desenhar:

1. **solicita** o boleto ao órgão (data + `prazo_boleto_orgao`)
2. **recebe** o boleto (data)
3. **paga** (vencimento + status + data)

O **"Vencimento da Multa" fica junto do pagamento de propósito**: é o boleto
que informa esse vencimento, então ele não pode aparecer antes de o boleto
chegar. E ele é o prazo do **ÓRGÃO** — nunca o do cliente (ver o aviso acima).

Travado em `tests/run.js`: o grupo compara os índices dos três marcos no
próprio bloco da Etapa 4 e falha se alguém reinverter.

### A fatura pode ter a baixa no CONTRATO, não nela

Quando o recebimento é registrado pela tela de **Contratos**, quem fica com
`status_pagamento` e `data_pagamento` é o **contrato** — a receita da fatura
pode continuar sem `data_pagamento` no banco. A lista do Financeiro compensava
isso em tempo de render (`Object.assign` com `ct.data_pagamento`); o helper do
painel não, e a fatura recebida em 31/08 continuava presa na competência de
setembro, somando por cima da fatura prevista do mês — relato: *"a Kablan
aparece com mais de 7k em setembro, sendo que foram pagos em 31/08"*.

**`rdReceitaComContrato(r, contratos)`** lê a receita de fatura JUNTO com o
contrato dela antes de decidir o mês. É leitura, não gravação. Quando a receita
tem baixa própria, ela manda (é a mais específica); o contrato só completa o
que falta. **Todo painel que decide o mês de uma fatura pelo `receitaDoMes`
precisa passar por ela primeiro** — senão volta a ler um recebimento que está
gravado no outro registro.

⚠️ **A LISTA de Financeiro › Receitas era o caso mais visível disso, e demorou
várias rodadas para ser achado.** Ela já buscava a baixa no contrato — mas no
`.map`, **depois** do `.filter`. O mês era decidido sem a baixa e a etiqueta
desenhada com ela: a fatura recebida em 31/08 aparecia na lista de **setembro**
com "31 AGO" escrito no próprio card. O mesmo dado dizendo duas coisas na
mesma linha. Ordem correta: **resolver primeiro, filtrar depois.**

### A DATA manda sozinha — não peça status junto

`receitaDoMes` (ramo `ref_fatura`) e `rdMesDoContrato` perguntavam
`status === "recebido"/"parcial"` **além** da `data_pagamento`. Era uma segunda
trava para a mesma pergunta, e bastava **um** caminho de baixa gravar a data
sem carimbar o status — ou carimbar `"emitida"`/`"pago"` em vez de
`"recebido"` — para o lançamento voltar ao mês da previsão. Foi por isso que o
relato *"as receitas de 31/08 aparecem em setembro"* voltou várias vezes,
mesmo depois de corrigido em outros pontos.

**Existe `data_pagamento`? O mês é o dela. Ponto.** Sem condição de status em
lugar nenhum — é literalmente a regra do usuário: *"a data do efetivo pagamento
é a competência do mês"*.

### Toda baixa PERGUNTA a data — e dá pra corrigir depois

Nenhuma regra de leitura conserta uma data **gravada errada**. O relato
*"recebi em 31/08 e aparece em setembro"* sobreviveu a várias rodadas de
correção de leitura porque tinha também uma causa de **escrita**:

1. **`marcarPaga` (aba Faturas) gravava `hoje` sem perguntar.** Era a única
   baixa de dinheiro do app sem prompt de data — lista de Receitas, Contratos,
   Agenda e painéis do Início sempre perguntaram. Quem recebe no fim do mês e
   registra dias depois **não tinha como informar a data real**, e o
   lançamento caía no mês do clique.
2. **O formulário de receita não tinha campo de data de recebimento.** Despesa
   e manutenção sempre tiveram o equivalente ("Data Efetiva do Pagamento"); a
   receita, não — então o que entrou com a data errada **não tinha onde ser
   corrigido**. Hoje existe *"Data Efetiva do Recebimento (define o mês)"*.

**Regra permanente: baixa de dinheiro em qualquer tela pergunta a data, com
`hoje` só como sugestão; e todo tipo que tem `data_pagamento` tem o campo
correspondente no formulário de edição.** Vazio grava `null`, nunca `""`;
preencher a data marca o lançamento como recebido (quem informa quando o
dinheiro entrou está dizendo que entrou). Travado em `tests/run.js`: a busca
por `var dtPag = hoje;` tem que dar zero.

### A parte que ainda não andou fica esmaecida, com o valor escrito — `[barra-pendente]`

Nos painéis **"Receitas por Cliente"** e **"Despesas por Categoria"** (nas duas
telas), a barra mostra o **total do mês**; a fatia que ainda **não entrou/saiu**
é desenhada na mesma cor, um pouco mais fraca, a partir da proporção já
liquidada — e o valor dela vem **escrito** ("a receber R$ X" / "a pagar R$ X")
**quando for diferente do total**. Antes a barra era sólida do começo ao fim e
não havia como saber, olhando o painel, quanto daquilo já é dinheiro no caixa.

- `pendente` viaja na linha (`rdLinhasReceitaCliente`/`rdLinhasDespesaCategoria`)
  e é somado por `rdGroupBy` junto com o total — **nunca recalcular na tela**.
- Sem `data_pagamento`, o lançamento inteiro é pendente; no **parcial**, só o
  que falta (`valor_total − valor_pago`).
- `_rdBarraBg(cor, total, pendente)` monta o degradê; `FunnelBars` usa a mesma
  fórmula inline.
- O rótulo vem do painel (`rotuloPendente`): "a receber" nas receitas, "a
  pagar" nas despesas.

**Número repetido não é informação — `_rdPendEscrito(total, pendente)`.**
Quando **nada** foi liquidado, o pendente **é** o próprio total, e escrever "R$
7.000 / a receber R$ 7.000" na mesma linha só ocupa espaço (pedido explícito do
usuário). A pergunta *"escrevo o pendente?"* vive numa função só —
`_rdPendEscrito` — e é ela que as **três** telas chamam; nenhuma decide isso na
mão com `x.pend > 0`. Ela também comanda a altura da linha do `FunnelBars`
(34px → 40px **só quando alguma linha escreve** o pendente) e o padding do
balão.

**A cor continua mostrando a pendência mesmo quando o número não aparece** — a
barra esmaece a fatia inteira, e é assim que se vê que aquilo ainda não entrou.
Nunca "resolver" esse caso deixando a barra sólida: aí some a informação junto
com o número repetido.

**A fatia esmaecida é `70%`, não `30%`.** Nas palavras do usuário: *"não deixe
tão esmaecido o que não foi pago ou recebido, um pouco menos que o original"*.
A 30% a fatia praticamente desaparecia na tela — o valor tem que dar pra ver.
O número vale para os dois lugares (`_rdBarraBg` e o `_corFraca` inline do
`FunnelBars`) e os dois são travados em `tests/run.js`.

**Painel novo de dinheiro não monta essa data na mão.** Filtro inline do tipo
`(mu.vencimento||mu.data||"").slice(0,7) === mes` é exatamente o que deixava
manutenção e multa presas no mês previsto para sempre, enquanto a despesa
equivalente migrava — a mesma saída de caixa em dois meses diferentes conforme
o painel. Use a função da tabela acima.

Travado em `tests/run.js`, grupo *"Previsto até liquidar, liquidado no mês em
que o dinheiro andou"*, que roda os helpers reais extraídos do `index.html`
para os cinco tipos.

## Painel de distribuição é do MÊS, e a conta é uma só — `[rd-mes]` — PERMANENTE

"Receitas por Cliente" e "Despesas por Categoria" existem em **duas telas** —
Dashboard do Início e Relatórios › Gráficos — e cada uma tinha a sua própria
soma. O Dashboard somava a competência do mês; o de Relatórios somava **o
histórico inteiro**, sem período nenhum escrito na tela. O usuário lia aquilo
como se fosse o mês e via um acumulado ("o gráfico não mostra o valor do mês").

O de Relatórios ainda errava a cobertura: só enxergava receita com
`cliente_id` preenchido, então **toda fatura de contrato** (`ref_fatura`, que
não tem esse campo) ficava de fora; e o contrato pago com receita vinculada
podia ser contado **duas vezes**.

**Regra permanente: a conta vive em UMA função por painel, no escopo global, e
nenhuma tela reimplementa a soma.**

| painel | função única |
|---|---|
| Receitas por Cliente | `rdLinhasReceitaCliente(receitas, contratos, clientes, mes)` |
| Despesas por Categoria | `rdLinhasDespesaCategoria(despesas, manutencoes, mes)` |
| de quem é a receita | `rdClienteDaReceita(r, contratos, clientes)` |

- **`mes` = "YYYY-MM"** filtra a competência; **`mes` nulo** devolve o histórico
  inteiro. As duas leituras são legítimas — o que não pode é o acumulado se
  passar por mensal.
- **LIQUIDADO conta no mês em que o dinheiro entrou; PREVISTO, no mês da
  previsão.** Receita pergunta **`receitaDoMes`** (a função da aba Financeiro),
  **nunca `receitaVisivelNoMes`** — essa olha só a `data` e ignora a
  `data_pagamento`, então uma receita datada **31/08 e recebida em setembro**
  ficava em agosto no painel e em setembro no Financeiro, e as telas
  discordavam sobre o mesmo dinheiro.
  `receitaVisivelNoMes` continua valendo para **projeção** de recorrente em
  série de 12/24 meses (é o que ela faz bem) — não para dizer de que mês é um
  lançamento.
- **Fatura de contrato RECEBIDA conta no mês do recebimento — `[receita-caixa]`.**
  Decisão explícita do usuário, reafirmada depois de eu ter argumentado o
  contrário: *"as receitas de contrato recebidas em 31/08 devem aparecer em
  agosto e não em setembro"*. `receitaDoMes` migra o lançamento para o mês da
  `data_pagamento` quando `status === "recebido"`; sem pagamento, vale a
  competência do `ref_fatura` (previsão é previsão). `rdMesDoContrato(c)` faz o
  mesmo pelo lado do contrato (`pago`/`parcial` → `data_pagamento`) — as duas
  **têm que andar juntas**, senão o contrato COM fatura cai num mês e o SEM
  fatura noutro. **PARCIAL migra igual** ("independente de ser parcial ou
  não"), levando junto o `valor_total` previsto — ver `[previsto-liquidado]`.
  **Isso é LEITURA, não gravação** — `ref_fatura`, número e data de emissão
  continuam intocados, então `[fatura-nao-migra]` segue valendo e a aba
  **Faturas continua mostrando a competência** (ela monta a lista a partir do
  contrato, não do `receitaDoMes`). Fatura é documento da competência; o
  dinheiro é do mês em que entrou — as duas leituras convivem, cada uma na
  sua tela.
  Efeito colateral bom: dois caminhos de recebimento discordavam entre si —
  `sincronizarRefFatura` (baixa pela tela de Contratos) já reescrevia a chave
  para o mês do pagamento, enquanto `baixarReceitaItem` e a aba Faturas
  mantinham a competência. A mesma fatura caía em meses diferentes conforme a
  tela em que fosse baixada; agora a leitura é a mesma nos três.
- **Acumulado só existe se estiver escrito na tela.** O "Top 5 Clientes por
  Receita" continua histórico de propósito e por isso o título diz
  **"· desde o início"**. Todo painel mensal carrega o nome do mês no título
  (`"Receitas por Cliente · setembro de 2026"`).
- **Contrato só entra quando NÃO tem a fatura DESTA competência**
  (`fat_<id>_<mes da previsão do contrato>`, comparação **exata**) — é a trava
  contra contar a locação duas vezes, uma pelo contrato e outra pela fatura
  dele. ⚠️ **Nunca por `startsWith("fat_"+c.id+"_")`**: com o prefixo, um
  contrato que teve fatura em **qualquer** mês passado sumia do painel em
  todos os meses seguintes, inclusive naquele em que a fatura ainda nem foi
  criada — num contrato recorrente isso apagava o cliente do painel mês após
  mês. Foi bug reportado ("no painel de receitas por cliente há erros").
- **Manutenção com despesa vinculada (`manutencao_id`) não entra** — senão a
  categoria "Manutenção" dobra.
- Relatórios › Gráficos tem **seletor de mês próprio** (`gMes` + `MesPicker`)
  para os painéis de distribuição: os campos "De/Até" daquela tela são só da
  aba Faturas, e um painel sem período volta a mentir sobre o que mostra.

Painel novo de receita por cliente ou despesa por categoria — em qualquer tela
— **chama essas funções**. Travado em `tests/run.js`, grupo *"Receita por
cliente é do MÊS, e a conta é uma só"*, que roda os helpers reais extraídos do
`index.html` e falha se alguma tela voltar a somar na mão.

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
