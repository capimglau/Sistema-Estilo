import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Esta function gera o .ics assinável (botão "🔔 Assinar" da tela Calendário)
   e precisa ser A MESMA fonte de verdade que a Agenda do app (buildAgendaEventos,
   em index.html) — pedido explícito do usuário: "todos os eventos da agenda
   [devem] sincronizar ao assinar o calendário". Como Deno (aqui) e o browser
   (index.html) são runtimes separados, não dá pra importar a função direto;
   este arquivo replica as MESMAS regras de negócio À MÃO. Ao alterar
   buildAgendaEventos no index.html, replicar a mudança aqui também — senão
   o calendário assinado volta a divergir da Agenda (mesma regra de
   consistência do CLAUDE.md, agora valendo pros dois lugares que leem os
   mesmos dados de agenda). */
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
    { data: adiamentos = [] },
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
    // Tabelas opcionais: se ainda não rodaram nesse banco, o select volta com
    // `data: null` (erro de "tabela não existe"), tratado como lista vazia
    // pelo `|| []` de cada uso abaixo — sem quebrar o resto.
    supabase.from("lembretes").select("*"),
    supabase.from("manutencoes").select("*"),
    supabase.from("agenda_adiamentos").select("*"),
  ]);

  const hoje = new Date().toISOString().split("T")[0];
  const anoAtual = new Date().getFullYear();
  const mesAtualIdx = new Date().getMonth();
  // RFC 5545 DTSTAMP: current UTC time in basic format
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  function numV(v: any): number | null { const n = parseFloat(v); return isNaN(n) ? null : n; }
  function esc(s: any): string {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function fmtComp(d: string): string { return d ? d.slice(5, 7) + "/" + d.slice(2, 4) : ""; }
  function fmtV(v: any): string { return "R$ " + parseFloat(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }
  function fmtD(d: string): string { if (!d) return "--"; const p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function addDiasISO(iso: string, n: number): string { const x = new Date(iso + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split("T")[0]; }

  const byId: Record<string, any> = {};
  (contratos || []).forEach((c: any) => { byId[String(c.id)] = c; });
  const pm: Record<string, any> = {};
  (contratos || []).forEach((c: any) => { if (c.renovado_para) pm[String(c.renovado_para)] = c; });
  (contratos || []).forEach((ch: any) => {
    if (pm[String(ch.id)] || !ch.observacoes) return;
    const m = ch.observacoes.match(/Renova[çc][aã]o (?:autom[aá]tica )?contrato #?(\d+)/i);
    if (m && byId[m[1]]) pm[String(ch.id)] = byId[m[1]];
  });
  (contratos || []).forEach((ch: any) => {
    if (pm[String(ch.id)]) return;
    const p = (contratos || []).find((x: any) =>
      x.id !== ch.id && x.data_fim && x.data_fim === ch.data_inicio &&
      String(x.cliente_id) === String(ch.cliente_id) && String(x.veiculo_id) === String(ch.veiculo_id)
    );
    if (p) pm[String(ch.id)] = p;
  });
  function renLabel(c: any): string {
    let d = 0, cur = c;
    while (pm[String(cur.id)]) { cur = pm[String(cur.id)]; d++; }
    return d === 0 ? "nº " + String(c.id) : "nº " + String(cur.id) + "/" + (d + 1);
  }
  function uid(tipo: string, data: string, titulo: string): string {
    return tipo + "-" + data.replace(/-/g, "") + "-" + titulo.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30) + "@autoguest";
  }

  const idsContratos = new Set((contratos || []).map((c: any) => String(c.id)));

  type Ev = { data: string; tipo: string; emoji: string; titulo: string; sub?: string; id?: any; acao?: string; chave?: string };
  const evs: Ev[] = [];

  // CONTRATOS — vencimento (some quando renovado/concluído, mesmo padrão de
  // despesa paga/receita recebida: uma vez resolvido não fica marcador esmaecido)
  (contratos || []).forEach((c: any) => {
    if (!c.data_fim || c.status === "cancelado" || c.status === "concluido") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: c.data_fim, tipo: "contrato", emoji: "📑",
      titulo: "Venc. Contrato " + renLabel(c) + " · " + fmtComp(c.data_fim),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " " + (ve?.modelo || ""),
      id: c.id, acao: "renovar",
    });
  });

  // CONTRATOS — emissão de fatura (20 dias antes, se ainda não emitida)
  function faturaContratoEmitida(refKey: string): boolean {
    return (receitas || []).some((r: any) =>
      r.ref_fatura === refKey && (r.status === "emitida" || r.status === "recebido" || r.status === "parcial" || r.status === "isento" || !!r.numero_fatura || !!r.data_emissao)
    );
  }
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status === "cancelado") return;
    if (c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const refKey = "fat_" + c.id + "_" + c.previsao_pagamento.slice(0, 7);
    if (faturaContratoEmitida(refKey)) return;
    const dtE = new Date(c.previsao_pagamento + "T12:00:00");
    dtE.setDate(dtE.getDate() - 20);
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: dtE.toISOString().split("T")[0], tipo: "emissao", emoji: "🧾",
      titulo: "Emitir Fatura " + renLabel(c) + " · " + fmtComp(c.previsao_pagamento),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + " · venc. " + fmtD(c.previsao_pagamento),
      id: c.id, acao: "emitir",
    });
  });

  // CONTRATOS — previsão de pagamento
  (contratos || []).forEach((c: any) => {
    if (!c.previsao_pagamento || c.status_pagamento === "pago" || c.status_pagamento === "isento") return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    const ve = (veiculos || []).find((x: any) => x.id == c.veiculo_id);
    evs.push({
      data: c.previsao_pagamento, tipo: "pagamento", emoji: "💰",
      titulo: "Pgto Contrato · " + fmtComp(c.previsao_pagamento) + " · " + fmtV(c.valor_total),
      sub: (cl?.nome || "--") + " · " + (ve?.placa || "--") + (c.recorrente ? " · ↻ Recorrente" : ""),
      id: c.id, acao: "baixar",
    });
  });

  // CONTRATOS — renovação incompleta (pai concluído aponta pra filho que não existe mais)
  const hoje14 = addDiasISO(hoje, -14);
  (contratos || []).forEach((c: any) => {
    if (c.status !== "concluido" || !c.renovado_para || idsContratos.has(String(c.renovado_para))) return;
    if (!c.data_fim || c.data_fim < hoje14) return;
    const cl = (clientes || []).find((x: any) => x.id == c.cliente_id);
    evs.push({
      data: c.data_fim, tipo: "renovacao_orfa", emoji: "⚠️",
      titulo: "Renovação incompleta · Contrato " + renLabel(c) + " · " + (cl?.nome || "--"),
      sub: "Encerrou em " + fmtD(c.data_fim) + " sem contrato de continuidade",
      chave: "renovacao_orfa|" + c.id + "|" + c.data_fim,
    });
  });

  // MULTAS — vencimento. multaEncerrada + a etapa "pago ao órgão" (aguardando
  // só cobrar o cliente, sem prazo fixo — ver _RESP_ETAPA_MULTA/situacaoMulta
  // no index.html): pago ao órgão mas ainda não cobrado nem quitado pelo
  // cliente. Sem essa checagem o evento "vencimento" reaparecia mesmo com a
  // multa já paga, só porque falta cobrar o cliente depois — mesma fonte de
  // verdade do painel "Multas pendentes" (situacaoMulta), pra Agenda, painel
  // e calendário assinado nunca divergirem.
  function multaEncerrada(m: any): boolean {
    const st = String(m?.status || "").toLowerCase();
    if (st === "cancelada" || st === "cancelado") return true;
    return m?.cobrado_cliente === "pago";
  }
  function multaEmEtapaPagoOrgao(m: any): boolean {
    return m?.status === "pago" && m?.cobrado_cliente !== "pendente" && m?.cobrado_cliente !== "pago";
  }
  (multas || []).forEach((m: any) => {
    if (!m.vencimento || multaEncerrada(m) || multaEmEtapaPagoOrgao(m)) return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    const cl = (clientes || []).find((x: any) => x.id == m.cliente_id);
    evs.push({
      data: m.vencimento, tipo: "multa", emoji: "⚠️",
      titulo: "Multa " + (m.tipo || "") + " · " + (ve?.placa || "--") + " · " + fmtV(m.valor),
      sub: (cl?.nome || "--") + (m.descricao ? " · " + m.descricao : "") + (m.ait ? " · AIT " + m.ait : "") + " · #" + m.id,
      chave: "multa|" + m.id + "|" + m.vencimento,
    });
  });

  // MULTAS — prazo de indicação de condutor ao órgão
  function indicacaoCondutorResolvida(m: any): boolean {
    const sn = m?.status_notificacao;
    return sn === "notificado" || sn === "nao_notificado" || sn === "nao_localizou";
  }
  (multas || []).forEach((m: any) => {
    if (m.status === "cancelada" || m.status === "cancelado") return;
    if (indicacaoCondutorResolvida(m)) return;
    const prazo = m.prazo_notificacao_orgao || m.vencimento || "";
    if (!prazo) return;
    const ve = (veiculos || []).find((x: any) => x.id == m.veiculo_id);
    const cl = (clientes || []).find((x: any) => x.id == m.cliente_id);
    evs.push({
      data: prazo, tipo: "multa_notif", emoji: "🏛️",
      titulo: "Prazo notificação ao órgão · " + (m.tipo || "Multa") + " · " + (ve?.placa || "--"),
      sub: (cl?.nome || "--") + " · indique o condutor até " + fmtD(prazo),
      chave: "multa_notif|" + m.id + "|" + prazo,
    });
  });

  // VEÍCULOS — documentos (pula veículo inativo/vendido; licenciamento já
  // marcado como feito no cadastro do veículo não avisa de novo)
  (veiculos || []).forEach((v: any) => {
    if (v.status === "inativo" || v.status === "vendido") return;
    ([
      { campo: v.venc_ipva, emoji: "📄", nome: "IPVA" },
      { campo: v.venc_seguro, emoji: "🛡️", nome: "Seguro" },
      { campo: v.venc_licenciamento, emoji: "🪪", nome: "Licenciamento" },
      { campo: v.venc_revisao, emoji: "🔧", nome: "Revisão" },
    ] as any[]).forEach((d: any) => {
      if (!d.campo) return;
      if (d.nome === "Licenciamento" && v.licenciado) return;
      evs.push({
        data: d.campo, tipo: "veiculo", emoji: d.emoji,
        titulo: "Venc. " + d.nome + " · " + (v.placa || "--"),
        sub: (v.marca || "") + " " + (v.modelo || "") + (v.ano ? " · " + v.ano : ""),
        chave: "veiculo|" + v.id + "|" + d.nome + "|" + d.campo,
      });
    });
  });

  // VEÍCULOS — troca de pneus (por km rodado desde a troca, ancorado em hoje
  // já que é uma condição do momento, não um vencimento datado)
  const KM_PNEUS_ALERTA = 3000;
  function statusPneus(v: any): { vida: number; rodado: number; restante: number; vencido: boolean; proximo: boolean } | null {
    const troca = parseFloat(v?.pneus_km_troca);
    if (!v || v.pneus_km_troca == null || isNaN(troca)) return null;
    const vida = parseFloat(v.pneus_vida_util_km || 0) || 40000;
    const atual = parseFloat(v.km_atual || 0);
    const rodado = atual - troca;
    const restante = vida - rodado;
    return { vida, rodado, restante, vencido: restante <= 0, proximo: restante > 0 && restante <= KM_PNEUS_ALERTA };
  }
  (veiculos || []).forEach((v: any) => {
    const sp = statusPneus(v);
    if (!sp || (!sp.vencido && !sp.proximo)) return;
    evs.push({
      data: hoje, tipo: "pneus", emoji: "🛞",
      titulo: (sp.vencido ? "Troca de pneus vencida · " : "Troca de pneus próxima · ") + (v.placa || "--"),
      sub: sp.vencido
        ? (sp.rodado.toLocaleString("pt-BR") + " km rodados desde a troca (vida útil " + sp.vida.toLocaleString("pt-BR") + " km)")
        : ("faltam " + sp.restante.toLocaleString("pt-BR") + " km"),
      chave: "pneus|" + v.id + "|" + (v.pneus_km_troca == null ? "" : v.pneus_km_troca),
    });
  });

  // VEÍCULOS — revisão por KM
  const KM_REVISAO_ALERTA = 1000;
  function statusRevisaoKm(v: any): { meta: number; atual: number; falta: number; vencida: boolean; proxima: boolean } | null {
    const meta = parseFloat(v?.km_revisao_proxima || 0);
    if (!meta) return null;
    const atual = parseFloat(v.km_atual || 0);
    const falta = meta - atual;
    return { meta, atual, falta, vencida: falta <= 0, proxima: falta > 0 && falta <= KM_REVISAO_ALERTA };
  }
  (veiculos || []).forEach((v: any) => {
    const sr = statusRevisaoKm(v);
    if (!sr || (!sr.vencida && !sr.proxima)) return;
    evs.push({
      data: hoje, tipo: "revisao_km", emoji: "🔧",
      titulo: (sr.vencida ? "Revisão vencida por KM · " : "Revisão próxima por KM · ") + (v.placa || "--"),
      sub: sr.vencida
        ? (sr.atual.toLocaleString("pt-BR") + " km · " + Math.abs(sr.falta).toLocaleString("pt-BR") + " km além da revisão")
        : ("faltam " + sr.falta.toLocaleString("pt-BR") + " km (revisão em " + sr.meta.toLocaleString("pt-BR") + " km)"),
      chave: "revisao_km|" + v.id + "|" + (v.km_revisao_proxima == null ? "" : v.km_revisao_proxima),
    });
  });

  // CNH
  (clientes || []).forEach((cl: any) => {
    if (!cl.vencimento_cnh) return;
    evs.push({
      data: cl.vencimento_cnh, tipo: "cnh", emoji: "🪪",
      titulo: "Venc. CNH · " + (cl.nome || "--"),
      sub: "Cat. " + (cl.categoria_cnh || "--") + " · CNH " + (cl.cnh || "--"),
      chave: "cnh|" + cl.id + "|" + cl.vencimento_cnh,
    });
  });

  // CONTAS — a pagar / a receber
  (contas || []).forEach((c: any) => {
    if (!c.vencimento) return;
    if (c.status === "pago" || c.status === "cancelado" || c.status === "recebido" || c.data_pagamento) return;
    const isRec = c.tipo === "receber";
    evs.push({
      data: c.vencimento, tipo: "conta", emoji: isRec ? "📥" : "📤",
      titulo: (isRec ? "A Receber" : "A Pagar") + " · " + (c.descricao || "--") + " · " + fmtV(c.valor),
      sub: (c.categoria || "") + (c.observacoes ? " · " + c.observacoes : ""),
      chave: "conta|" + c.id + "|" + c.vencimento,
    });
  });

  // DESPESAS operacionais — expande recorrentes pros próximos meses (mesma
  // janela -1..+2 usada pelo Dashboard), senão uma recorrente só aparece uma
  // vez no calendário assinado, na data do registro original.
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
  // Janela -6..+2 (mesmo AGK2_LOOKBACK_ATRASO da Agenda, não só -1..+2): no
  // browser, buildAgendaEventos é chamado uma vez por mês num lookback de 6
  // meses pra trás (CalendarioKanban2), e cada chamada resolve despesas só
  // dentro do SEU próprio -1..+2 — a soma das várias chamadas é o que cobre
  // os atrasados de meses anteriores. Aqui a function só roda uma vez, então
  // precisa da janela larga de uma vez só, senão uma despesa (ou recorrente
  // pendente) vencida há mais de 1 mês sumia do calendário assinado.
  const AGK2_LOOKBACK_ATRASO = 6;
  const mesesParaResolver: string[] = [];
  for (let mi = -AGK2_LOOKBACK_ATRASO; mi <= 2; mi++) {
    const dt = new Date(anoAtual, mesAtualIdx + mi, 1);
    mesesParaResolver.push(dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"));
  }
  const despesasJaAdicionadas = new Set<string>();
  mesesParaResolver.forEach((mesStr) => {
    resolverDespesasDoMes(despesas || [], mesStr).forEach((d: any) => {
      if (!d.data || d.status === "pago" || d.data_pagamento) return;
      const chave = (d.id || d.data + (d.descricao || "")) + "_" + mesStr;
      if (despesasJaAdicionadas.has(chave)) return;
      despesasJaAdicionadas.add(chave);
      evs.push({
        data: d.data, tipo: "despesa", emoji: "📤",
        titulo: "Despesa · " + (d.descricao || "--") + " · " + fmtV(d.valor),
        sub: (d.categoria || "") + (d.recorrente ? " · ↻ Recorrente" : "") + (d.observacoes ? " · " + d.observacoes : ""),
        id: d.id, acao: "baixar",
      });
    });
  });

  // MANUTENÇÕES — previsão de pagamento (despesa vinculada via manutencao_id)
  const manutIdsComDespesa = new Set<string>();
  (despesas || []).filter((d: any) => d.manutencao_id && d.data && !d.data_pagamento && d.status !== "pago").forEach((d: any) => {
    manutIdsComDespesa.add(String(d.manutencao_id));
    evs.push({
      data: d.data, tipo: "manutencao", emoji: "🔧",
      titulo: "Manutenção · " + (d.descricao || "--") + " · " + fmtV(d.valor),
      sub: (d.categoria || "") + (d.observacoes ? " · " + d.observacoes : ""),
    });
  });

  // MANUTENÇÕES — prazo (saída) vencido, veículo ainda em oficina
  (manutencoes || []).filter((m: any) => m.status === "em_andamento" && m.data_saida && m.data_saida < hoje).forEach((m: any) => {
    const ve = (veiculos || []).find((v: any) => v.id == m.veiculo_id);
    evs.push({
      data: m.data_saida, tipo: "manutencao_prazo", emoji: "🔧",
      titulo: "Manutenção com prazo vencido · " + (ve?.placa || "--") + " · " + (m.tipo || "Manutenção"),
      sub: "Previsão de saída " + fmtD(m.data_saida),
      chave: "manutencao_prazo|" + m.id + "|" + m.data_saida,
    });
  });

  // MANUTENÇÕES — previsão/atraso de pagamento sem despesa vinculada
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
      chave: "manutencao|" + m.id + "|" + dt,
    });
  });

  // Receitas avulsas (exclui as vinculadas a contrato — já aparecem como "Pgto Contrato")
  (receitas || []).forEach((r: any) => {
    if (!r.data || r.ref_fatura) return;
    if (r.status === "recebido" || r.status === "isento") return;
    evs.push({
      data: r.data, tipo: "receita", emoji: "📥",
      titulo: "Receita · " + (r.descricao || "--") + " · " + fmtV(r.valor),
      sub: (r.categoria || "") + (r.forma_pagamento ? " · " + r.forma_pagamento : ""),
      id: r.id, acao: "baixar",
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
      chave: "reserva|" + rs.id + "|" + rs.data_retirada,
    });
  });
  // Reserva "recebida em" não entra: aquela data vive só em localStorage do
  // aparelho (ag_reservas_recebidas_em), não existe no banco pra esta function ler.

  // Orçamento pessoal — mesma projeção multi-mês do Dashboard/Agenda: uma
  // recorrente pendente há N meses vira N eventos (um por mês em aberto), não
  // um só reprojetado pro mês atual (ver AGK2_LOOKBACK_ATRASO no index.html —
  // sem isso, um item pendente há 3 meses só aparecia como 1 evento, escondendo
  // os meses anteriores em aberto de quem assina o calendário).
  const mesesOrc: string[] = [];
  for (let mi = -AGK2_LOOKBACK_ATRASO; mi <= 2; mi++) {
    const dt = new Date(anoAtual, mesAtualIdx + mi, 1);
    mesesOrc.push(dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"));
  }
  function orcEmOf(it: any): string { return it.data ? it.data.slice(0, 7) : it.mes; }
  const orcChavesVistas = new Set<string>();
  mesesOrc.forEach((refMes) => {
    (orcItens || []).forEach((it: any) => {
      const em = orcEmOf(it);
      let data: string | null, jaPago: boolean;
      if (!it.recorrente) {
        // Item não-recorrente não depende do refMes da varredura — usa
        // sempre a PRÓPRIA data, esteja ela atrasada há quanto tempo for
        // (dedup por `chave` abaixo evita ele entrar 1x por mês da janela).
        // Filtrar por refMes aqui (bug corrigido) sumia com atrasados de
        // Orçamento Pessoal fora da janela de -6..+2 meses.
        data = it.data || (it.mes ? it.mes + "-01" : null);
        if (!data) return;
        jaPago = it.status === "pago" || it.status === "recebido" || !!it.data_pagamento;
      } else if (!em || em > refMes) {
        return;
      } else if (em === refMes) {
        data = it.data || (it.mes ? it.mes + "-01" : null);
        if (!data) return;
        jaPago = it.status === "pago" || it.status === "recebido" || !!it.data_pagamento;
      } else {
        const temFilhoNoMes = (orcItens || []).some((x: any) => String(x.recorrencia_origem_id) === String(it.id) && orcEmOf(x) === refMes);
        if (temFilhoNoMes) return;
        const diaOrc = it.data ? parseInt(it.data.slice(8, 10), 10) : 1;
        const anoOrc = parseInt(refMes.slice(0, 4), 10), mesNOrc = parseInt(refMes.slice(5, 7), 10);
        const ultimoDiaOrc = new Date(anoOrc, mesNOrc, 0).getDate();
        const diaProjOrc = Math.min(diaOrc, ultimoDiaOrc);
        data = refMes + "-" + (diaProjOrc < 10 ? "0" + diaProjOrc : String(diaProjOrc));
        jaPago = false;
      }
      if (jaPago) return;
      const chave = "orcamento|" + it.id + "|" + data;
      if (orcChavesVistas.has(chave)) return;
      orcChavesVistas.add(chave);
      const isDespesa = it.tipo === "despesa" || !it.tipo;
      evs.push({
        data: data!, tipo: isDespesa ? "orcamento_despesa" : "orcamento_receita", emoji: isDespesa ? "💲" : "💵",
        titulo: (isDespesa ? "Pessoal · " : "Receita Pessoal · ") + (it.descricao || "--") + " · " + fmtV(it.valor),
        sub: (it.categoria || "") + (it.recorrente ? " · ↻ Recorrente" : ""),
        chave, id: it.id, acao: "baixar",
      });
    });
  });

  // Lembretes manuais
  (lembretes || []).forEach((l: any) => {
    if (!l.data) return;
    evs.push({
      data: l.data, tipo: "lembrete", emoji: "🔔",
      titulo: "Lembrete · " + (l.texto || "--") + (l.hora ? " · " + l.hora : ""),
      chave: "lembrete|" + l.id,
    });
  });

  // Chave estável de cada evento (mesma regra de buildAgendaEventos), pra
  // poder aplicar adiamento/resolvido abaixo.
  evs.forEach((ev) => {
    if (!ev.chave) ev.chave = ev.tipo + "|" + (ev.id != null ? ev.id : ev.titulo) + "|" + (ev.data || "");
  });

  // agenda_adiamentos por cima: o que foi "marcado como resolvido" (só vale
  // pra cartão SEM ação de baixa própria — CNH, documento, pneus etc.; um
  // cartão com baixa real tem fonte da verdade no próprio registro e nunca
  // pode ser escondido por esse marcador, senão uma dívida em aberto some
  // pra sempre do calendário assinado sem nenhuma tela pra ver ou desfazer —
  // ver "agenda-resolvido-nao-quita" no index.html) e o que foi adiado
  // reaparece na nova data escolhida, não mais na original.
  const mapaAdia: Record<string, { ate: string | null; resolvido: boolean }> = {};
  (adiamentos || []).forEach((l: any) => {
    if (!l || !l.chave || l.deleted_at) return;
    mapaAdia[l.chave] = { ate: l.adiado_para || null, resolvido: !!l.resolvido };
  });
  const eventos: Ev[] = [];
  evs.forEach((ev) => {
    const r = mapaAdia[ev.chave!];
    if (r) {
      const temBaixaReal = ev.acao === "baixar" || ev.acao === "renovar";
      if (r.resolvido && !temBaixaReal) return;
      if (r.ate) ev = Object.assign({}, ev, { data: String(r.ate).slice(0, 10) });
    }
    eventos.push(ev);
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

  eventos.forEach((ev) => {
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
