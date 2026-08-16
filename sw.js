/* Service worker do AutoGest.
 *
 * O app tinha manifest.json mas nenhum service worker: era "PWA" só no ícone e
 * na tela cheia. Sem rede, não abria; com rede ruim, baixava os ~3 MB do
 * index.html inteiro toda vez.
 *
 * Estratégias, por tipo de requisição:
 *  - navegação (o HTML do app): network-first com timeout curto, cache de
 *    reserva. Assim uma versão nova sempre é buscada, mas offline ainda abre.
 *  - estáticos próprios (ícones, manifest): stale-while-revalidate.
 *  - Supabase e qualquer API: nunca passa pelo cache. Dado financeiro velho
 *    servido como se fosse atual é pior do que erro de rede.
 *
 * O CACHE muda de nome a cada deploy (o workflow substitui 60eb800), e o
 * activate apaga os caches antigos — é isso que evita o app velho grudado.
 */

const BUILD = "60eb800";
const CACHE = "autogest-" + BUILD;

/* Só o essencial para abrir offline. O resto entra conforme for usado —
   pré-cachear as imagens grandes do repositório atrasaria a instalação. */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./pwa-icon-180.png",
];

const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      // Um recurso ausente não pode impedir a instalação inteira.
      .catch((e) => console.warn("[sw] pré-cache parcial:", e))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n.startsWith("autogest-") && n !== CACHE)
             .map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Requisições que nunca podem ser servidas do cache. */
function ehApi(url) {
  return url.hostname.endsWith(".supabase.co") ||
         url.hostname.endsWith(".anthropic.com") ||
         url.pathname.includes("/rest/v1/") ||
         url.pathname.includes("/auth/v1/") ||
         url.pathname.includes("/functions/v1/");
}

/** Rede com prazo: passado o timeout, devolve o que estiver em cache. */
function redeComTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    let pronto = false;
    const timer = setTimeout(() => { if (!pronto) reject(new Error("timeout")); }, ms);
    fetch(request).then((r) => {
      pronto = true; clearTimeout(timer); resolve(r);
    }).catch((e) => {
      pronto = true; clearTimeout(timer); reject(e);
    });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (ehApi(url)) return;               // deixa passar direto pra rede
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro (para pegar deploy novo), cache como rede de segurança.
  if (req.mode === "navigate") {
    event.respondWith(
      redeComTimeout(req, NAV_TIMEOUT_MS)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match("./index.html").then((c) => c || caches.match("./")))
        .then((r) => r || new Response(
          "<h1>Offline</h1><p>O app ainda não foi salvo neste dispositivo. Conecte-se uma vez para poder usá-lo offline.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
        )),
    );
    return;
  }

  // Estáticos próprios: responde do cache na hora e atualiza em segundo plano.
  event.respondWith(
    caches.match(req).then((cacheado) => {
      const naRede = fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type === "basic") {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        }
        return resp;
      }).catch(() => cacheado);
      return cacheado || naRede;
    }),
  );
});

/* Permite que a página force a ativação de uma versão nova sem esperar
   o fechamento de todas as abas. */
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
