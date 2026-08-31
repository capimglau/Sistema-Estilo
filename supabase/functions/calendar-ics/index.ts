import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  // Usa a service_role (só existe aqui no servidor, nunca chega no cliente) —
  // desde que o RLS foi ativado no banco, a anon key não lê mais nenhuma
  // tabela, e essa function é uma agregação pública controlada (só monta
  // eventos de calendário com os campos que ela mesma escolhe expor).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
    { data: reservas = [] },
    { data: lembretes = [] },
    { data: manutencoes = [] },
  ] = await Promise.all([
    supabase.from("contratos").select("*").limit(5000),
    supabase.from("clientes").select("*"),
    supabase.from("veiculos").select("*"),
    supabase.from("multas").select("*"),
    supabase.from("contas").select("*"),
    supabase.from("receitas").select("*").limit(5000),
    supabase.from("despesas").select("*"),
    supabase.from("orcamento_pessoal").select("*"),
    supabase.from("reservas").select("*"),
    // Tabela opcional (06-lembretes.sql): se ainda não rodou nesse banco, o
    // select volta com `data: null` (erro de "tabela não existe"), tratado
    // como lista vazia pelo `|| []` de cada uso abaixo — sem quebrar o resto.
    supabase.from("lembretes").select("*"),
    supabase.from("manutencoes").select("*"),
  ]);

  const hoje = new Date().toISOString().split("T")[0];
  const anoAtual = new Date().getFullYear();
  const mesAtualIdx = new Date().getMonth();
  // RFC 5545 DTSTAMP: current UTC time in basic format
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const byId: Record<number, any> = {};
  (contratos || []).forEach((c: any) => { byId[c.id] = c; });
  const pm: Record<number, any> = {};
  (contratos || []).forEach((c: any) => { if (c.renovado_para) pm[c.renovado_para] = c; });
  (contratos || []).forEach((ch: any) => {
    if (pm[ch.id] || !ch.observacoes) return;
    const m = ch.observacoes.match(/Renova[çc][aã]o (?:autom[aá]tica )?contrato #?(\d+)/i);
    if (m && byId[parseInt(m[1])]) pm[ch.id] = byId[parseInt(m[1])];
  });
  (contratos || []).forEach((ch: any) => {
    if (pm[ch.id]) return;
    const p = (contratos || []).find((x: any) =>
      x.id !== ch.id && x.data_fim && x.data_fim === ch.data_inicio &&
      String(x.cliente_id) === String(ch.cliente_id) && String(x.veiculo_id) === String(ch.veiculo_id)
    );
    if (p) pm[ch.id] = p;
  });

  function renLabel(c: any): string {
    let d = 0, cur = c;
    while (pm[cur.id]) { cur = pm[cur.id]; d++; }
    return d === 0 ? "nº " + String(c.id) : "nº " + String(cur.id) + "/" + (d + 1);
  }
  function esc(s: any): string {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function fmtComp(d: string): string { return d ? d.slice(5, 7) + "/" + d.slice(2, 4) : ""; }
  function fmtV(v: any): string { return "R$ " + parseFloat(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }
  function fmtD(d: string): string { if (!d) return "--"; const p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function uid(tipo: string, data: string, titulo: string): string {
    return tipo + "-" + data.replace(/-/g, "") + "-" + titulo.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30) + "@autoguest";
  }

  const evs: Array<{ data: string; tipo: string; emoji: string; titulo: string; sub?: string }> = [];

  // Contratos — vencimento
  (contratos || []).forEach((c: any) => {
    if (!c.data_fim || c.status === "cancelado") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: c.data_fim, tipo: "contrato", emoji: "📋",
      titulo: "Venc. Contrato " + renLabel(c) + " · " + fmtComp(c.data_fim),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " " + (ve?.modelo || ""),
    });
  });

  // Contratos — emissão de fatura (20 dias antes)
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status === "cancelado") return;
    if (c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const refKey = "fat_" + c.id + "_" + c.previsao_pagamento.slice(0, 7);
    if ((receitas || []).some((r: any) => r.ref_fatura === refKey)) return;
    const dtE = new Date(c.previsao_pagamento + "T12:00:00");
    dtE.setDate(dtE.getDate() - 20);
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: dtE.toISOString().split("T")[0], tipo: "emissao", emoji: "📤",
      titulo: "Emitir Fatura " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " · venc. " + fmtD(c.previsao_pagamento),
    });
  });

  // Contratos — previsão de pagamento
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: c.previsao_pagamento, tipo: "pgto", emoji: "💰",
      titulo: "Pgto Contrato " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento) + " · " + fmtV(c.valor_total),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + (c.recorrente ? " · ↻ Recorrente" : ""),
    });
  });

  // Contratos — renovação incompleta (pai concluído aponta para filho que não existe mais)
  (contratos || []).forEach((c: any) => {
    if (c.status !== "concluido" || !c.renovado_para || byId[c.renovado_para]) return;
    const hoje14 = new Date(hoje + "T12:00:00");
    hoje14.setDate(hoje14.getDate() - 14);
    const hoje14str = hoje14.toISOString().split("T")[0];
    if (!c.data_fim || c.data_fim < hoje14str) return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    evs.push({
      data: c.data_fim, tipo: "renovacao_orfa", emoji: "⚠️",
      titulo: "Renovação incompleta · Contrato " + renLabel(c) + " · " + (cl?.nome || "--"),
      sub: "Encerrou em " + fmtD(c.data_fim) + " sem contrato de continuidade",
    });
  });

  // Multas — vencimento
  (multas || []).forEach((m: any) => {
    const st = String(m.status || "").toLowerCase();
    if (!m.vencimento || st === "cancelada" || st === "cancelado" || m.cobrado_cliente === "pago") return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    const cl = (clientes || []).find((x: any) => x.id == m.cliente_id);
    evs.push({
      data: m.vencimento, tipo: "multa", emoji: "⚠️",
      titulo: "Multa " + (m.tipo || "") + " · " + (ve?.placa || "--") + " · " + fmtV(m.valor),
      sub: (cl?.nome || "--") + (m.ait ? " · AIT " + m.ait : ""),
    });
  });

  // Multas — prazo de indicação de condutor ao órgão
  (multas || []).forEach((m: any) => {
    if (m.status === "cancelada" || m.status === "cancelado") return;
    if (m.status_notificacao === "notificado" || m.status_notificacao === "nao_localizou" || m.status_notificacao === "nao_notificado") return;
    const prazo = m.prazo_notificacao_orgao || m.vencimento || "";
    if (!prazo) return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    const cl = (clientes || []).find((x: any) => x.id == m.cliente_id);
    evs.push({
      data: prazo, tipo: "multa_notif", emoji: "🏛️",
      titulo: "Prazo notificação ao órgão · " + (m.tipo || "Multa") + " · " + (ve?.placa || "--"),
      sub: (cl?.nome || "--") + " · indique o condutor até " + fmtD(prazo),
    });
  });

  // Veículos — documentos
  (veiculos || []).forEach((v: any) => {
    ([
      { campo: v.venc_ipva, emoji: "📄", nome: "IPVA" },
      { campo: v.venc_seguro, emoji: "🛡️", nome: "Seguro" },
      { campo: v.venc_licenciamento, emoji: "🪪", nome: "Licenciamento" },
      { campo: v.venc_revisao, emoji: "🔧", nome: "Revisão" },
    ] as any[]).forEach((d: any) => {
      if (!d.campo) return;
      evs.push({
        data: d.campo, tipo: "doc", emoji: d.emoji,
        titulo: "Venc. " + d.nome + " · " + (v.placa || "--"),
        sub: (v.marca || "") + " " + (v.modelo || "") + (v.ano ? " · " + v.ano : ""),
      });
    });
  });

  // CNH
  (clientes || []).forEach((cl: any) => {
    if (!cl.vencimento_cnh) return;
    evs.push({
      data: cl.vencimento_cnh, tipo: "cnh", emoji: "🪪",
      titulo: "Venc. CNH · " + (cl.nome || "--"),
      sub: "Cat. " + (cl.categoria_cnh || "--") + " · CNH " + (cl.cnh || "--"),
    });
  });

  // Contas — a pagar / a receber (mesmo filtro do Dashboard: status pago/cancelado/
  // recebido ou já com data_pagamento não voltam a aparecer como pendência).
  (contas || []).forEach((c: any) => {
    if (!c.vencimento) return;
    if (c.status === "pago" || c.status === "cancelado" || c.status === "recebido" || c.data_pagamento) return;
    const isRec = c.tipo === "receber";
    evs.push({
      data: c.vencimento, tipo: "conta", emoji: isRec ? "📥" : "📤",
      titulo: (isRec ? "A Receber" : "A Pagar") + " · " + (c.descricao || "--") + " · " + fmtV(c.valor),
      sub: (c.categoria || "") + (c.observacoes ? " · " + c.observacoes : ""),
    });
  });

  // Despesas operacionais — expande recorrentes pros próximos meses igual ao
  // Dashboard (resolverDespesasDoMes), senão uma despesa recorrente só aparece
  // uma vez no calendário assinado, na data do registro original.
  function despesaDoMes(d: any, mes: string): boolean {
    if (!d || !mes) return false;
    if (d.recorrencia_origem_id) return (d.data || "").slice(0, 7) === mes;
    if (!d.recorrente) {
      if (d.data_pagamento) return d.data_pagamento.slice(0, 7) === mes;
      return (d.data || "").slice(0, 7) === mes;
    }
    const dataMes = (d.data || "").slice(0, 7);
    if (dataMes === mes) return true;
    if (dataMes && dataMes < mes) {
      if (d.prazo_recorrencia) {
        const ini = new Date(dataMes + "-01"), fim = new Date(mes + "-01");
        const diff = (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth());
        if (diff > parseInt(d.prazo_recorrencia)) return false;
      }
      return true;
    }
    return false;
  }
  function resolverDespesasDoMes(lista: any[], mes: string): any[] {
    const filhasDoMes = lista.filter((d: any) => d.recorrencia_origem_id && (d.data || "").slice(0, 7) === mes);
    const idsComFilha = new Set(filhasDoMes.map((d: any) => String(d.recorrencia_origem_id)));
    const resultado: any[] = [];
    lista.forEach((d: any) => {
      if (!despesaDoMes(d, mes) && !(d.recorrencia_origem_id && (d.data || "").slice(0, 7) === mes)) return;
      if (d.recorrente && idsComFilha.has(String(d.id))) return;
      if (d.recorrente && (d.data || "").slice(0, 7) !== mes) {
        const dia = (d.data || "").slice(8, 10);
        const pagouEsteMes = d.data_pagamento && d.data_pagamento.slice(0, 7) === mes;
        resultado.push(Object.assign({}, d, { status: pagouEsteMes ? d.status : "previsto", data_pagamento: pagouEsteMes ? d.data_pagamento : null, data: mes + "-" + dia }));
      } else {
        resultado.push(d);
      }
    });
    return resultado;
  }
  const mesesParaResolver: string[] = [];
  for (let mi = -1; mi <= 2; mi++) {
    const dt = new Date(anoAtual, mesAtualIdx + mi, 1);
    mesesParaResolver.push(dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"));
  }
  const despesasJaAdicionadas = new Set<string>();
  const manutIdsComDespesa = new Set<string>();
  mesesParaResolver.forEach((mesStr) => {
    resolverDespesasDoMes(despesas || [], mesStr).forEach((d: any) => {
      if (!d.data || d.status === "pago" || d.data_pagamento) return;
      const chave = (d.id || d.data + (d.descricao || "")) + "_" + mesStr;
      if (despesasJaAdicionadas.has(chave)) return;
      despesasJaAdicionadas.add(chave);
      if (d.manutencao_id) manutIdsComDespesa.add(String(d.manutencao_id));
      evs.push({
        data: d.data, tipo: "despesa", emoji: "📤",
        titulo: "Despesa · " + (d.descricao || "--") + " · " + fmtV(d.valor),
        sub: (d.categoria || "") + (d.recorrente ? " · ↻ Recorrente" : "") + (d.observacoes ? " · " + d.observacoes : ""),
      });
    });
  });

  // Manutenções — previsão/atraso de pagamento sem despesa vinculada
  (manutencoes || []).forEach((m: any) => {
    if (m.status_financeiro === "pago" || m.data_pagamento) return;
    if (manutIdsComDespesa.has(String(m.id))) return;
    const dt = m.data_previsao_pagamento || m.data_entrada;
    if (!dt) return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    evs.push({
      data: dt, tipo: "manutencao", emoji: "🔧",
      titulo: "Manutenção · " + (ve?.placa || "--") + " · " + (m.tipo || "Manutenção") + " · " + fmtV(m.custo),
      sub: fmtD(dt),
    });
  });

  // Manutenções — prazo de saída vencido, veículo ainda em oficina
  (manutencoes || []).forEach((m: any) => {
    if (m.status !== "em_andamento" || !m.data_saida || m.data_saida >= hoje) return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    evs.push({
      data: m.data_saida, tipo: "manutencao_prazo", emoji: "🔧",
      titulo: "Manutenção com prazo vencido · " + (ve?.placa || "--") + " · " + (m.tipo || "Manutenção"),
      sub: "Previsão de saída " + fmtD(m.data_saida),
    });
  });

  // Receitas avulsas (exclui as vinculadas a contratos para evitar duplicatas)
  (receitas || []).forEach((r: any) => {
    if (!r.data || r.ref_fatura) return;
    evs.push({
      data: r.data, tipo: "receita", emoji: "📥",
      titulo: "Receita · " + (r.descricao || "--") + " · " + fmtV(r.valor),
      sub: (r.categoria || "") + (r.forma_pagamento ? " · " + r.forma_pagamento : ""),
    });
  });

  // Reservas — data de retirada
  (reservas || []).forEach((rs: any) => {
    if (!rs.data_retirada || rs.status === "cancelada") return;
    const ve = (veiculos || []).find((x: any) => x.id == rs.veiculo_id);
    evs.push({
      data: rs.data_retirada, tipo: "reserva", emoji: "📅",
      titulo: "Reserva · " + (rs.nome || "--") + (rs.veiculo ? " · " + rs.veiculo : (ve ? " · " + ve.placa : "")),
      sub: "Retirada " + fmtD(rs.data_retirada) + (rs.data_devolucao ? " → " + fmtD(rs.data_devolucao) : "") + " · " + (rs.status === "confirmada" ? "✓ confirmada" : "pendente"),
    });
  });

  // Orçamento pessoal
  (orcItens || []).forEach((it: any) => {
    const data = it.data || (it.mes ? it.mes + "-01" : null);
    if (!data || it.status === "pago" || it.status === "recebido" || it.data_pagamento) return;
    const isDespesa = it.tipo === "despesa" || !it.tipo;
    evs.push({
      data, tipo: "orcamento", emoji: isDespesa ? "🏠" : "💵",
      titulo: (isDespesa ? "Pessoal · " : "Receita Pessoal · ") + (it.descricao || "--") + " · " + fmtV(it.valor),
      sub: (it.categoria || "") + (it.recorrente ? " · ↻ Recorrente" : ""),
    });
  });

  // Lembretes manuais
  (lembretes || []).forEach((l: any) => {
    if (!l.data) return;
    evs.push({
      data: l.data, tipo: "lembrete", emoji: "🔔",
      titulo: "Lembrete · " + (l.texto || "--") + (l.hora ? " · " + l.hora : ""),
    });
  });

  // Monta ICS
  const lines = [
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

  evs.forEach((ev) => {
    if (!ev.data) return;
    const d = ev.data.replace(/-/g, "");
    const dtEnd = new Date(ev.data + "T12:00:00");
    dtEnd.setDate(dtEnd.getDate() + 1);
    const dEnd = dtEnd.toISOString().split("T")[0].replace(/-/g, "");
    const isFuture = ev.data >= hoje;
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + uid(ev.tipo, ev.data, ev.titulo));
    lines.push("DTSTAMP:" + dtstamp);
    lines.push("SEQUENCE:0");
    lines.push("DTSTART;VALUE=DATE:" + d);
    lines.push("DTEND;VALUE=DATE:" + dEnd);
    lines.push("SUMMARY:" + esc((ev.emoji ? ev.emoji + " " : "") + ev.titulo));
    if (ev.sub) lines.push("DESCRIPTION:" + esc(ev.sub));
    if (isFuture) {
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT9H");
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
