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

## Fluxo de trabalho Git

Após cada push:
1. **Sempre criar um PR** automaticamente via `mcp__github__create_pull_request` apontando para `main`
2. **Sempre mergear o PR** imediatamente via `mcp__github__merge_pull_request` (squash), sem precisar que o usuário peça
