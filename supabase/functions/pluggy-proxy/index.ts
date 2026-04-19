import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLUGGY_CLIENT_ID = "ec729e07-bba3-416a-ab16-206d70800796";
const PLUGGY_CLIENT_SECRET = "b69c76e6-5ed7-42d6-a65c-9e2a584c4ea7";
const PLUGGY_BASE = "https://api.pluggy.ai";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getApiKey(): Promise<string> {
  const res = await fetch(`${PLUGGY_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
  });
  const data = await res.json();
  if (!data.apiKey) throw new Error("Pluggy auth failed: " + JSON.stringify(data));
  return data.apiKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const { action, item_id, from, to } = body;

  try {
    // connect_token doesn't need an apiKey — uses clientId+secret directly
    if (action === "connect_token") {
      const res = await fetch(`${PLUGGY_BASE}/connect_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const apiKey = await getApiKey();

    if (action === "item") {
      const res = await fetch(`${PLUGGY_BASE}/items/${item_id}`, {
        headers: { "X-API-KEY": apiKey },
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (action === "sync") {
      if (!item_id) throw new Error("item_id required");

      // Fetch accounts for this item
      const accRes = await fetch(`${PLUGGY_BASE}/accounts?itemId=${item_id}`, {
        headers: { "X-API-KEY": apiKey },
      });
      const accData = await accRes.json();
      const accounts: any[] = accData.results || [];

      const fromDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const toDate = to || new Date().toISOString().split("T")[0];

      const allTxs: any[] = [];
      for (const acc of accounts) {
        let page = 1;
        while (true) {
          const txRes = await fetch(
            `${PLUGGY_BASE}/transactions?accountId=${acc.id}&from=${fromDate}&to=${toDate}&pageSize=500&page=${page}`,
            { headers: { "X-API-KEY": apiKey } },
          );
          const txData = await txRes.json();
          const txs: any[] = txData.results || [];
          for (const t of txs) {
            allTxs.push({
              external_id: t.id,
              account_id: acc.id,
              account_name: acc.name,
              date: t.date ? t.date.split("T")[0] : null,
              amount: Math.abs(t.amount ?? 0),
              description: t.description || t.name || "",
              type: t.type, // CREDIT or DEBIT
              category: t.category || null,
              balance_after: t.balance ?? null,
              status: "unmatched",
            });
          }
          if (txs.length < 500) break;
          page++;
        }
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      if (allTxs.length > 0) {
        const { error } = await supabase
          .from("bank_transactions")
          .upsert(allTxs, { onConflict: "external_id", ignoreDuplicates: false });
        if (error) throw new Error("Upsert error: " + error.message);
      }

      // Update last sync timestamp in config
      await supabase.from("config").update({ pluggy_last_sync: new Date().toISOString() }).neq("id", 0);

      return new Response(JSON.stringify({ ok: true, count: allTxs.length, accounts }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
