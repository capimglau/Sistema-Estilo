/**
 * Testes da sessão (JWT) e do tempo real.
 *
 * Cobre os dois defeitos que faziam o app parecer quebrado:
 *
 *  1. Abrir o app e não ver dado nenhum até dar F5. O access_token do Supabase
 *     dura 1h; reabrindo o PWA depois disso, a restauração do token era um
 *     efeito assíncrono e o carregamento inicial saía ANTES dela, com o token
 *     vencido. O PostgREST devolvia 401, db.get/db.getAll engoliam o erro
 *     devolvendo [] e todos os painéis abriam zerados — o F5 seguinte já
 *     pegava no localStorage o token que a tentativa anterior tinha renovado,
 *     e por isso "só funcionava atualizando".
 *
 *  2. A tela não acompanhar alteração feita em outro lugar. Agora há WebSocket
 *     do Realtime empurrando INSERT/UPDATE/DELETE.
 *
 * Como o resto da suíte, o código testado é RECORTADO do index.html em vez de
 * copiado: renomear ou apagar essas funções quebra o teste, que é o aviso que
 * queremos. Só as dependências de navegador (localStorage, fetch, WebSocket)
 * são dubladas.
 */

const { lerIndex } = require("./extrair");

const DE = 'var _AG_SESS_STORE = "ag_session_v1";';
const ATE = "/* ── IA via Edge Function";

function recortar() {
  const html = lerIndex();
  const i = html.indexOf(DE);
  if (i === -1) {
    throw new Error(
      `Bloco de sessão/tempo real não encontrado no index.html (procurando por ${JSON.stringify(DE)}).\n` +
      "Ele pode ter sido renomeado ou movido — atualize tests/sessao.js.",
    );
  }
  const j = html.indexOf(ATE, i);
  if (j === -1) throw new Error("Fim do bloco de sessão/tempo real não encontrado.");
  return html.slice(i, j);
}

const CODIGO = recortar();

/**
 * Monta uma instância isolada do bloco, com navegador dublado.
 * Devolve o escopo real do index.html mais o diário do que foi para a rede.
 */
function montar(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const log = { fetches: [], refreshes: 0, enviados: [], urls: [] };
  const respostas = (opts.respostas || []).slice();

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const listeners = {};
  const emissor = {
    addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); },
    removeEventListener: (e, f) => {
      listeners[e] = (listeners[e] || []).filter((x) => x !== f);
    },
    dispatchEvent: (ev) => { (listeners[ev.type] || []).forEach((f) => f(ev)); return true; },
  };
  const windowFake = Object.assign({}, emissor);
  const documentFake = Object.assign({}, emissor, { hidden: false });

  class WSFake {
    constructor(url) { log.urls.push(url); this.readyState = 0; WSFake.ultima = this; }
    send(s) { log.enviados.push(JSON.parse(s)); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    abrir() { this.readyState = 1; if (this.onopen) this.onopen(); }
    receber(m) { if (this.onmessage) this.onmessage({ data: JSON.stringify(m) }); }
  }
  windowFake.WebSocket = WSFake;

  const SB_KEY = "ANON";
  const SB_URL = "https://proj.supabase.co";
  const HDR = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

  function fetchWithTimeout(url, o) {
    log.fetches.push({ url, auth: (o && o.headers && o.headers.Authorization) || null });
    return Promise.resolve(respostas.shift() || { status: 200, ok: true });
  }
  function _sbSetToken(t) { HDR.Authorization = "Bearer " + (t || SB_KEY); }
  function _sbScheduleRefresh() { /* o agendamento em si não está sob teste */ }
  function sbRefreshToken() {
    log.refreshes++;
    return opts.refreshFalha
      ? Promise.reject(new Error("refresh token expirado"))
      : Promise.resolve({ access_token: "TOKEN_NOVO", refresh_token: "R2", expires_in: 3600 });
  }

  const fabrica = new Function(
    "localStorage", "window", "document", "HDR", "SB_KEY", "SB_URL",
    "fetchWithTimeout", "_sbSetToken", "_sbScheduleRefresh", "sbRefreshToken",
    "__viewerMode", "CustomEvent", "WebSocket", "console",
    CODIGO +
    "\nreturn { _agSessLer, _agSessPersistir, _agSessaoAguardar, _agRenovarSessao," +
    " _agFetchAuth, _agRtIniciar, _agRtParar, _agRtAtualizarToken, _agTokenAtual, AG_RT_TABELAS };",
  );

  const escopo = fabrica(
    localStorage, windowFake, documentFake, HDR, SB_KEY, SB_URL,
    fetchWithTimeout, _sbSetToken, _sbScheduleRefresh, sbRefreshToken,
    false,
    function CustomEvent(tipo) { return { type: tipo }; },
    WSFake,
    { warn: function () {}, log: function () {}, error: function () {} },
  );

  return { escopo, log, HDR, WSFake, listeners, store };
}

function sessaoSalva(extra) {
  return {
    ag_session_v1: JSON.stringify(Object.assign(
      { usuario: { id: 1, nome: "Teste" }, access_token: "BOM", refresh_token: "R",
        expires_at: Date.now() + 3600e3 },
      extra || {},
    )),
  };
}

async function rodar({ grupo, eq, ok }) {
  grupo("Sessão — boot com token ainda válido");
  {
    const { escopo, HDR, log } = montar({ store: sessaoSalva() });
    eq("token restaurado de forma síncrona, antes do React montar", HDR.Authorization, "Bearer BOM");
    eq("nenhum portão pendente segurando as leituras", escopo._agSessaoAguardar(), null);
    eq("não gasta um refresh à toa", log.refreshes, 0);
  }

  grupo("Sessão — boot com token vencido (o app que abria vazio)");
  {
    const { escopo, HDR, log } = montar({
      store: sessaoSalva({ access_token: "VELHO", expires_at: Date.now() - 1000 }),
    });
    eq("refresh disparado já no boot", log.refreshes, 1);
    const portao = escopo._agSessaoAguardar();
    ok("portão fechado enquanto o refresh está em voo", portao && typeof portao.then === "function");

    // É exatamente o que o mount do App faz: dispara as leituras iniciais.
    const leitura = escopo._agFetchAuth(
      "https://proj.supabase.co/rest/v1/veiculos", { headers: HDR }, 1000);
    eq("a leitura NÃO sai com o token vencido", log.fetches.length, 0);
    await leitura;
    eq("ela sai só depois do refresh terminar", log.fetches.length, 1);
    eq("e sai com o token novo", log.fetches[0].auth, "Bearer TOKEN_NOVO");
    eq("portão reaberto no fim", escopo._agSessaoAguardar(), null);
  }

  grupo("Sessão — 401 com a aba dormindo");
  {
    const { escopo, HDR, log } = montar({
      store: sessaoSalva(),
      respostas: [{ status: 401, ok: false }, { status: 200, ok: true }],
    });
    const r = await escopo._agFetchAuth(
      "https://proj.supabase.co/rest/v1/veiculos", { headers: HDR }, 1000);
    eq("renova a sessão ao ver 401", log.refreshes, 1);
    eq("repete a chamada uma única vez", log.fetches.length, 2);
    eq("a repetição leva o token novo", log.fetches[1].auth, "Bearer TOKEN_NOVO");
    eq("e devolve a resposta boa, não o 401", r.status, 200);
  }

  grupo("Sessão — refresh token morto não trava o app");
  {
    const { escopo, log } = montar({
      store: sessaoSalva({ expires_at: 0 }),
      refreshFalha: true,
    });
    const renovou = await escopo._agRenovarSessao();
    eq("avisa que não conseguiu renovar", renovou, false);
    eq("portão liberado mesmo assim (senão toda leitura ficaria pendurada)",
      escopo._agSessaoAguardar(), null);
    ok("tentou renovar antes de desistir", log.refreshes >= 1);
  }

  grupo("Sessão — chamadas concorrentes compartilham um refresh só");
  {
    const { escopo } = montar({ store: sessaoSalva() });
    const [a, b, c] = await Promise.all([
      escopo._agRenovarSessao(), escopo._agRenovarSessao(), escopo._agRenovarSessao(),
    ]);
    ok("as três recebem o mesmo resultado", a === true && b === true && c === true);
  }

  grupo("Tempo real — inscrição no canal");
  {
    const { escopo, log, WSFake } = montar({ store: sessaoSalva() });
    const vistos = [];
    let status = null;
    escopo._agRtIniciar({
      tabelas: escopo.AG_RT_TABELAS,
      onChange: (t, tipo, linha) => vistos.push([t, tipo, linha.id]),
      onStatus: (s) => { status = s; },
    });

    ok("abre o WebSocket do Realtime no host do projeto",
      /^wss:\/\/proj\.supabase\.co\/realtime\/v1\/websocket\?/.test(log.urls[0]));
    ok("declara a versão do protocolo Phoenix", /vsn=1\.0\.0/.test(log.urls[0]));

    WSFake.ultima.abrir();
    const join = log.enviados[0];
    eq("a primeira mensagem é o phx_join", join.event, "phx_join");
    eq("o join leva o JWT do usuário (é ele que o RLS valida)",
      join.payload.access_token, "BOM");
    eq("pede as mesmas tabelas que o polling sincroniza",
      join.payload.config.postgres_changes.length, escopo.AG_RT_TABELAS.length);
    ok("pede todos os eventos de public.contratos",
      join.payload.config.postgres_changes.some(
        (m) => m.table === "contratos" && m.event === "*" && m.schema === "public"));

    WSFake.ultima.receber({ event: "phx_reply", topic: "realtime:autogest", payload: { status: "ok" } });
    eq("inscrição confirmada avisa o app", status, true);

    WSFake.ultima.receber({ event: "postgres_changes", payload: {
      data: { table: "contratos", type: "UPDATE", record: { id: 7, status: "ativo" } } } });
    eq("UPDATE chega à tela", JSON.stringify(vistos[0]), JSON.stringify(["contratos", "UPDATE", 7]));

    WSFake.ultima.receber({ event: "postgres_changes", payload: {
      data: { table: "veiculos", type: "DELETE", old_record: { id: 3 } } } });
    eq("DELETE chega pelo old_record", JSON.stringify(vistos[1]),
      JSON.stringify(["veiculos", "DELETE", 3]));

    // O servidor manda `type/record`; a lib oficial entrega `eventType/new`.
    // Aceitar os dois evita quebrar se o formato do canal mudar.
    WSFake.ultima.receber({ event: "postgres_changes", payload: {
      data: { table: "despesas", eventType: "INSERT", new: { id: 9 } } } });
    eq("aceita também o formato eventType/new", JSON.stringify(vistos[2]),
      JSON.stringify(["despesas", "INSERT", 9]));

    escopo._agRtParar();
    eq("parar fecha o socket", WSFake.ultima.readyState, 3);
  }

  grupo("Tempo real — degrada para o polling em vez de mentir");
  {
    const { escopo, WSFake } = montar({ store: sessaoSalva() });
    let status = null;
    escopo._agRtIniciar({ tabelas: ["veiculos"], onChange: () => {}, onStatus: (s) => { status = s; } });
    WSFake.ultima.abrir();
    WSFake.ultima.receber({ event: "phx_reply", topic: "realtime:autogest", payload: { status: "ok" } });
    eq("começou inscrito", status, true);
    // Tabela fora da publication supabase_realtime: o canal conecta mas nunca
    // entrega evento. Precisa reportar "não inscrito" para o polling voltar a
    // ser rápido — senão o app ficaria lento achando que tem tempo real.
    WSFake.ultima.receber({ event: "system", payload: {
      extension: "postgres_changes", status: "error", message: "sem publication" } });
    eq("sem publication, o app volta a se considerar sem tempo real", status, false);
    escopo._agRtParar();
  }

  grupo("Tempo real — canal acompanha a renovação do token");
  {
    const { escopo, log, WSFake } = montar({ store: sessaoSalva() });
    escopo._agRtIniciar({ tabelas: ["veiculos"], onChange: () => {}, onStatus: () => {} });
    WSFake.ultima.abrir();
    log.enviados.length = 0;
    await escopo._agRenovarSessao();
    const msg = log.enviados.find((m) => m.event === "access_token");
    ok("o canal recebe o token novo", msg && msg.payload.access_token === "TOKEN_NOVO");
    // Sem isto o servidor derruba a inscrição quando o token antigo vence e o
    // app volta a ficar mudo depois de uma hora aberto.
    escopo._agRtParar();
  }
}

module.exports = { rodar };
