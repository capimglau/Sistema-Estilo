import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const [
    { data: contratos = [] },
    { data: clientes = [] },
    { data: veiculos = [] },
    { data: multas = [] },
    { data: contas = [] },
    { data: despesas = [] },
    { data: receitas = [] },
  ] = await Promise.all([
    supabase.from("contratos").select("*").limit(500),
    supabase.from("clientes").select("*"),
    supabase.from("veiculos").select("*"),
    supabase.from("multas").select("*"),
    supabase.from("contas").select("*"),
    supabase.from("despesas").select("*"),
    supabase.from("receitas").select("*").limit(1000),
  ]);

  const hoje = new Date().toISOString().split("T")[0];

  // 3-tier renewal parent map
  const byId: Record<number, any> = {};
  (contratos || []).forEach((c: any) => { byId[c.id] = c; });
  const parentMap: Record<number, any> = {};
  (contratos || []).forEach((c: any) => { if (c.renovado_para) parentMap[c.renovado_para] = c; });
  (contratos || []).forEach((child: any) => {
    if (parentMap[child.id] || !child.observacoes) return;
    const m = child.observacoes.match(/Renova[çc][aã]o (?:autom[aá]tica )?contrato #?(\d+)/i);
    if (m && byId[parseInt(m[1])]) parentMap[child.id] = byId[parseInt(m[1])];
  });
  (contratos || []).forEach((child: any) => {
    if (parentMap[child.id]) return;
    const parent = (contratos || []).find((p: any) =>
      p.id !== child.id && p.data_fim && p.data_fim === child.data_inicio &&
      String(p.cliente_id) === String(child.cliente_id) &&
      String(p.veiculo_id) === String(child.veiculo_id)
    );
    if (parent) parentMap[child.id] = parent;
  });

  function renLabel(c: any): string {
    let depth = 0, cur = c;
    while (parentMap[cur.id]) { cur = parentMap[cur.id]; depth++; }
    return depth === 0 ? "nº " + String(c.id) : "nº " + String(cur.id) + "/" + (depth + 1);
  }
  function esc(s: any): string {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function fmtComp(d: string): string { return d ? d.slice(5, 7) + "/" + d.slice(2, 4) : ""; }
  function fmtV(v: any): string { return "R$ " + parseFloat(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }
  function fmtD(d: string): string { if (!d) return "--"; const p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  const eventos: Array<{ data: string; emoji: string; titulo: string; sub?: string }> = [];

  // Contratos — vencimento do período
  (contratos || []).forEach((c: any) => {
    if (!c.data_fim || c.status === "cancelado") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    eventos.push({
      data: c.data_fim, emoji: "📋",
      titulo: "Venc. Contrato " + renLabel(c) + " · " + fmtComp(c.data_fim),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " " + (ve?.modelo || ""),
    });
  });

  // Emissão de fatura (20 dias antes do pagamento)
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status === "cancelado") return;
    if (c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const refKey = "fat_" + c.id + "_" + c.previsao_pagamento.slice(0, 7);
    if ((receitas || []).some((r: any) => r.ref_fatura === refKey)) return;
    const dtEmissao = new Date(c.previsao_pagamento + "T12:00:00");
    dtEmissao.setDate(dtEmissao.getDate() - 20);
    const dtEmissaoStr = dtEmissao.toISOString().split("T")[0];
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    eventos.push({
      data: dtEmissaoStr, emoji: "📤",
      titulo: "Emitir Fatura " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " · venc. " + fmtD(c.previsao_pagamento),
    });
  });

  // Contratos — previsão de pagamento
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    eventos.push({
      data: c.previsao_pagamento, emoji: "💰",
      titulo: "Pgto " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento) + " · " + fmtV(c.valor_total),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + (c.recorrente ? " · ↻ Recorrente" : ""),
    });
  });

  // Multas
  (multas || []).forEach((m: any) => {
    if (!m.vencimento || m.status === "pago") return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    const cl = (clientes || []).find((x: any) => x.id == m.cliente_id);
    eventos.push({
      data: m.vencimento, emoji: "⚠️",
      titulo: "Multa " + (m.tipo || "") + " · " + (ve?.placa || "--") + " · " + fmtV(m.valor),
      sub: (cl?.nome || "--") + (m.ait ? " · AIT " + m.ait : ""),
    });
  });

  // Veículos — documentos
  (veiculos || []).forEach((v: any) => {
    [
      { campo: v.venc_ipva, emoji: "📄", nome: "IPVA" },
      { campo: v.venc_seguro, emoji: "🛡️", nome: "Seguro" },
      { campo: v.venc_licenciamento, emoji: "🪪", nome: "Licenciamento" },
      { campo: v.venc_revisao, emoji: "🔧", nome: "Revisão" },
    ].forEach((d) => {
      if (!d.campo) return;
      eventos.push({
        data: d.campo, emoji: d.emoji,
        titulo: "Venc. " + d.nome + " · " + (v.placa || "--"),
        sub: (v.marca || "") + " " + (v.modelo || "") + (v.ano ? " · " + v.ano : ""),
      });
    });
  });

  // CNH
  (clientes || []).forEach((cl: any) => {
    if (!cl.vencimento_cnh) return;
    eventos.push({
      data: cl.vencimento_cnh, emoji: "🪪",
      titulo: "Venc. CNH · " + (cl.nome || "--"),
      sub: "Cat. " + (cl.categoria_cnh || "--") + " · CNH " + (cl.cnh || "--"),
    });
  });

  // Contas
  (contas || []).forEach((c: any) => {
    if (!c.vencimento || c.status === "pago") return;
    const isRec = c.tipo === "receber";
    eventos.push({
      data: c.vencimento, emoji: isRec ? "📥" : "📤",
      titulo: (isRec ? "A Receber" : "A Pagar") + " · " + (c.descricao || "--") + " · " + fmtV(c.valor),
      sub: (c.categoria || "") + (c.observacoes ? " · " + c.observacoes : ""),
    });
  });

  // Build ICS
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AutoGest Pro//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AutoGest Pro",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  eventos.forEach((ev, i) => {
    if (!ev.data) return;
    const d = ev.data.replace(/-/g, "");
    const dtEnd = new Date(ev.data + "T12:00:00");
    dtEnd.setDate(dtEnd.getDate() + 1);
    const dEnd = dtEnd.toISOString().split("T")[0].replace(/-/g, "");
    icsLines.push("BEGIN:VEVENT");
    icsLines.push("UID:autoguest-" + i + "-" + d + "@autoguest");
    icsLines.push("DTSTART;VALUE=DATE:" + d);
    icsLines.push("DTEND;VALUE=DATE:" + dEnd);
    icsLines.push("SUMMARY:" + esc((ev.emoji ? ev.emoji + " " : "") + ev.titulo));
    if (ev.sub) icsLines.push("DESCRIPTION:" + esc(ev.sub));
    icsLines.push("END:VEVENT");
  });

  icsLines.push("END:VCALENDAR");

  return new Response(icsLines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
