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
    { data: receitas = [] },
    { data: despesas = [] },
    { data: orcItens = [] },
  ] = await Promise.all([
    supabase.from("contratos").select("*").limit(500),
    supabase.from("clientes").select("*"),
    supabase.from("veiculos").select("*"),
    supabase.from("multas").select("*"),
    supabase.from("contas").select("*"),
    supabase.from("receitas").select("*").limit(1000),
    supabase.from("despesas").select("*"),
    supabase.from("orcamento_pessoal").select("*"),
  ]);

  const hoje = new Date().toISOString().split("T")[0];
  const byId: Record<number,any> = {};
  (contratos||[]).forEach((c:any) => { byId[c.id] = c; });
  const pm: Record<number,any> = {};
  (contratos||[]).forEach((c:any) => { if (c.renovado_para) pm[c.renovado_para] = c; });
  (contratos||[]).forEach((ch:any) => {
    if (pm[ch.id] || !ch.observacoes) return;
    const m = ch.observacoes.match(/Renova[çc][aã]o (?:autom[aá]tica )?contrato #?(\d+)/i);
    if (m && byId[parseInt(m[1])]) pm[ch.id] = byId[parseInt(m[1])];
  });
  (contratos||[]).forEach((ch:any) => {
    if (pm[ch.id]) return;
    const p = (contratos||[]).find((x:any) =>
      x.id !== ch.id && x.data_fim && x.data_fim === ch.data_inicio &&
      String(x.cliente_id) === String(ch.cliente_id) && String(x.veiculo_id) === String(ch.veiculo_id)
    );
    if (p) pm[ch.id] = p;
  });

  function renLabel(c:any): string {
    let d = 0, cur = c;
    while (pm[cur.id]) { cur = pm[cur.id]; d++; }
    return d === 0 ? "nº " + String(c.id) : "nº " + String(cur.id) + "/" + (d + 1);
  }
  function esc(s:any): string {
    return String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  }
  function fmtComp(d:string): string { return d ? d.slice(5,7) + "/" + d.slice(2,4) : ""; }
  function fmtV(v:any): string { return "R$ " + parseFloat(v||0).toLocaleString("pt-BR", {minimumFractionDigits:2}); }
  function fmtD(d:string): string { if (!d) return "--"; const p = d.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; }
  function uid(tipo:string, data:string, titulo:string): string {
    return tipo + "-" + data.replace(/-/g,"") + "-" + titulo.replace(/[^a-zA-Z0-9]/g,"").slice(0,30) + "@autoguest";
  }

  const evs: Array<{data:string;tipo:string;emoji:string;titulo:string;sub?:string}> = [];

  // Contratos — vencimento
  (contratos||[]).forEach((c:any) => {
    if (!c.data_fim || c.status === "cancelado") return;
    const cl = (clientes||[]).find((x:any) => x.id == c.cliente_id);
    const ve = (veiculos||[]).find((x:any) => x.id == c.veiculo_id);
    evs.push({ data: c.data_fim, tipo: "contrato", emoji: "📋",
      titulo: "Venc. Contrato " + renLabel(c) + " · " + fmtComp(c.data_fim),
      sub: (cl?.nome||"--") + " · " + (ve?.placa||"--") + " " + (ve?.modelo||"") });
  });

  // Contratos — emissão de fatura (20 dias antes)
  (contratos||[]).forEach((c:any) => {
    if (!c.previsao_pagamento || c.status === "cancelado") return;
    if (c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const refKey = "fat_" + c.id + "_" + c.previsao_pagamento.slice(0,7);
    if ((receitas||[]).some((r:any) => r.ref_fatura === refKey)) return;
    const dtE = new Date(c.previsao_pagamento + "T12:00:00");
    dtE.setDate(dtE.getDate() - 20);
    const cl = (clientes||[]).find((x:any) => x.id == c.cliente_id);
    const ve = (veiculos||[]).find((x:any) => x.id == c.veiculo_id);
    evs.push({ data: dtE.toISOString().split("T")[0], tipo: "emissao", emoji: "📤",
      titulo: "Emitir Fatura " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento),
      sub: (cl?.nome||"--") + " · " + (ve?.placa||"--") + " · venc. " + fmtD(c.previsao_pagamento) });
  });

  // Contratos — previsão de pagamento
  (contratos||[]).forEach((c:any) => {
    if (!c.previsao_pagamento || c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const cl = (clientes||[]).find((x:any) => x.id == c.cliente_id);
    const ve = (veiculos||[]).find((x:any) => x.id == c.veiculo_id);
    evs.push({ data: c.previsao_pagamento, tipo: "pgto", emoji: "💰",
      titulo: "Pgto " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento) + " · " + fmtV(c.valor_total),
      sub: (cl?.nome||"--") + " · " + (ve?.placa||"--") + (c.recorrente ? " · ↻ Recorrente" : "") });
  });

  // Multas
  (multas||[]).forEach((m:any) => {
    if (!m.vencimento || m.status === "pago") return;
    const ve = (veiculos||[]).find((x:any) => x.id == m.veiculo_id);
    const cl = (clientes||[]).find((x:any) => x.id == m.cliente_id);
    evs.push({ data: m.vencimento, tipo: "multa", emoji: "⚠️",
      titulo: "Multa " + (m.tipo||"") + " · " + (ve?.placa||"--") + " · " + fmtV(m.valor),
      sub: (cl?.nome||"--") + (m.ait ? " · AIT " + m.ait : "") });
  });

  // Veículos — documentos
  (veiculos||[]).forEach((v:any) => {
    ([
      {campo:v.venc_ipva, emoji:"📄", nome:"IPVA"},
      {campo:v.venc_seguro, emoji:"🛡️", nome:"Seguro"},
      {campo:v.venc_licenciamento, emoji:"🪪", nome:"Licenciamento"},
      {campo:v.venc_revisao, emoji:"🔧", nome:"Revisão"},
    ] as any[]).forEach((d:any) => {
      if (!d.campo) return;
      evs.push({ data: d.campo, tipo: "doc", emoji: d.emoji,
        titulo: "Venc. " + d.nome + " · " + (v.placa||"--"),
        sub: (v.marca||"") + " " + (v.modelo||"") + (v.ano ? " · " + v.ano : "") });
    });
  });

  // CNH
  (clientes||[]).forEach((cl:any) => {
    if (!cl.vencimento_cnh) return;
    evs.push({ data: cl.vencimento_cnh, tipo: "cnh", emoji: "🪪",
      titulo: "Venc. CNH · " + (cl.nome||"--"),
      sub: "Cat. " + (cl.categoria_cnh||"--") + " · CNH " + (cl.cnh||"--") });
  });

  // Contas
  (contas||[]).forEach((c:any) => {
    if (!c.vencimento || c.status === "pago") return;
    const isRec = c.tipo === "receber";
    evs.push({ data: c.vencimento, tipo: "conta", emoji: isRec ? "📥" : "📤",
      titulo: (isRec ? "A Receber" : "A Pagar") + " · " + (c.descricao||"--") + " · " + fmtV(c.valor),
      sub: (c.categoria||"") + (c.observacoes ? " · " + c.observacoes : "") });
  });

  // Despesas operacionais
  (despesas||[]).forEach((d:any) => {
    if (!d.data || d.status === "pago") return;
    evs.push({ data: d.data, tipo: "despesa", emoji: "📤",
      titulo: "Despesa · " + (d.descricao||"--") + " · " + fmtV(d.valor),
      sub: (d.categoria||"") + (d.observacoes ? " · " + d.observacoes : "") });
  });

  // Receitas avulsas
  (receitas||[]).forEach((r:any) => {
    if (!r.data) return;
    evs.push({ data: r.data, tipo: "receita", emoji: "📥",
      titulo: "Receita · " + (r.descricao||"--") + " · " + fmtV(r.valor),
      sub: (r.categoria||"") + (r.forma_pagamento ? " · " + r.forma_pagamento : "") });
  });

  // Orçamento pessoal
  (orcItens||[]).forEach((it:any) => {
    const data = it.data || (it.mes ? it.mes + "-01" : null);
    if (!data || it.status === "pago" || it.status === "recebido") return;
    const isDespesa = it.tipo === "despesa" || !it.tipo;
    evs.push({ data, tipo: "orcamento", emoji: isDespesa ? "🏠" : "💵",
      titulo: (isDespesa ? "Pessoal · " : "Receita Pessoal · ") + (it.descricao||"--") + " · " + fmtV(it.valor),
      sub: (it.categoria||"") + (it.recorrente ? " · ↻ Recorrente" : "") });
  });

  // Monta ICS
  const lines = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//AutoGest Pro//PT",
    "CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "X-WR-CALNAME:AutoGest Pro","X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H","X-PUBLISHED-TTL:PT1H",
  ];

  evs.forEach((ev) => {
    if (!ev.data) return;
    const d = ev.data.replace(/-/g,"");
    const dtEnd = new Date(ev.data + "T12:00:00");
    dtEnd.setDate(dtEnd.getDate() + 1);
    const dEnd = dtEnd.toISOString().split("T")[0].replace(/-/g,"");
    const isFuture = ev.data >= hoje;
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + uid(ev.tipo, ev.data, ev.titulo));
    lines.push("DTSTART;VALUE=DATE:" + d);
    lines.push("DTEND;VALUE=DATE:" + dEnd);
    lines.push("SUMMARY:" + esc((ev.emoji ? ev.emoji + " " : "") + ev.titulo));
    if (ev.sub) lines.push("DESCRIPTION:" + esc(ev.sub));
    if (isFuture) {
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER;VALUE=DATE-TIME:" + d + "T120000Z");
      lines.push("ACTION:DISPLAY");
      lines.push("DESCRIPTION:" + esc(ev.titulo));
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
