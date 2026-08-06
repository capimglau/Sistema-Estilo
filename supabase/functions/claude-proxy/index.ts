/**
 * claude-proxy — encaminha chamadas para a API da Anthropic sem expor a chave.
 *
 * Antes, o app mandava `x-api-key` direto do navegador com
 * `anthropic-dangerous-direct-browser-access: true`, e a chave ficava salva em
 * `config.claude_api_key` (legível por qualquer usuário autenticado) e em
 * `localStorage`. Qualquer pessoa com acesso ao app extraía a chave e gastava a
 * conta. Aqui a chave vive só no secret `ANTHROPIC_API_KEY` da Edge Function.
 *
 * Deploy:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase functions deploy claude-proxy
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { "Content-Type": "application/json", ...CORS };

/** Modelos que o app pode pedir. Sem esta lista, quem chamasse a function
 *  escolheria o modelo mais caro disponível e a conta é nossa. */
const MODELOS_PERMITIDOS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
]);

const MAX_TOKENS_TETO = 4096;

function erro(msg: string, status: number) {
  return new Response(JSON.stringify({ error: { message: msg } }), {
    status,
    headers: JSON_HEADERS,
  });
}

/** Confere se quem chamou tem uma sessão válida no Supabase.
 *  A anon key sozinha não basta: ela é pública e está no HTML do app. */
async function usuarioAutenticado(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;

  // Token igual à anon key = ninguém logado, só o app público.
  if (token === anon) return false;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return erro(
      "ANTHROPIC_API_KEY não configurada na Edge Function. Rode: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...",
      500,
    );
  }

  if (!(await usuarioAutenticado(req))) {
    return erro("Faça login para usar os recursos de IA.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return erro("Corpo da requisição inválido.", 400);
  }

  const modelo = String(body.model || "");
  if (!MODELOS_PERMITIDOS.has(modelo)) {
    return erro(`Modelo não permitido: ${modelo || "(vazio)"}`, 400);
  }

  const maxTokens = Number(body.max_tokens || 1024);
  body.max_tokens = Math.min(
    Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1024,
    MAX_TOKENS_TETO,
  );

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Repassa status e corpo como vieram — o app já sabe ler os erros da
    // Anthropic (error.message) e depende do formato original da resposta.
    const texto = await res.text();
    return new Response(texto, { status: res.status, headers: JSON_HEADERS });
  } catch (e) {
    return erro("Falha ao contatar a API: " + (e as Error).message, 502);
  }
});
