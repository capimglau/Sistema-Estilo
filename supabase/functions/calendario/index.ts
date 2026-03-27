import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [contratosRes, receitasRes, multasRes, manutencoesRes, clientesRes, veiculosRes] =
    await Promise.all([
      supabase.from("contratos").select("*").eq("status", "ativo"),
      supabase.from("receitas").select("*").in("status", ["emitida", "prevista"]),
      supabase.from("multas").select("*").not("status", "eq", "pago"),
      supabase.from("manutencoes").select("*").not("status", "eq", "concluido"),
      supabase.from("clientes").select("id, nome"),
      supabase.from("veiculos").select("id, placa, marca, modelo"),
    ]);

  const contratos    = contratosRes.data    || [];
  const receitas     = receitasRes.data     || [];
  const multas       = multasRes.data       || [];
  const manutencoes  = manutencoesRes.data  || [];
  const clientes     = clientesRes.data     || [];
  const veiculos     = veiculosRes.data     || [];

  const hoje = new Date().toISOString().split("T")[0];

  // helpers
  const dtFmt  = (s: string) => s.replace(/-/g, "");
  const dtNext = (s: string) => {
    const d = new Date(s + "T12:00:00Z");
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0].replace(/-/g, "");
  };
  const esc = (s: string) =>
    (s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const brl = (v: unknown) =>
    "R$ " + parseFloat(String(v || 0)).toFixed(2).replace(".", ",");
  const numCt = (id: unknown) => String(id).padStart(5, "0");
  const clNome = (id: unknown) => clientes.find((c: any) => c.id == id)?.nome || "Cliente";
  const veDados = (id: unknown) => {
    const v: any = veiculos.find((x: any) => x.id == id);
    return v ? `${v.placa} — ${v.marca} ${v.modelo}` : "Veículo";
  };

  function evento(
    uid: string,
    data: string,
    resumo: string,
    descricao: string,
    alarmeHoras?: number,
  ): string {
    let e =
      `BEGIN:VEVENT\r\n` +
      `UID:${uid}\r\n` +
      `DTSTART;VALUE=DATE:${dtFmt(data)}\r\n` +
      `DTEND;VALUE=DATE:${dtNext(data)}\r\n` +
      `SUMMARY:${esc(resumo)}\r\n` +
      `DESCRIPTION:${esc(descricao)}\r\n`;
    if (alarmeHoras !== undefined) {
      e +=
        `BEGIN:VALARM\r\n` +
        `TRIGGER:-PT${alarmeHoras}H\r\n` +
        `ACTION:DISPLAY\r\n` +
        `DESCRIPTION:Lembrete AutoGest\r\n` +
        `END:VALARM\r\n`;
    }
    e += `END:VEVENT`;
    return e;
  }

  const eventos: string[] = [];

  // ── Pagamentos previstos (previsao_pagamento futura)
  for (const ct of contratos) {
    if (!ct.previsao_pagamento || ct.previsao_pagamento < hoje) continue;
    eventos.push(evento(
      `pgto-${ct.id}@autogest`,
      ct.previsao_pagamento,
      `💰 Pagamento: ${clNome(ct.cliente_id)}`,
      `Contrato #${numCt(ct.id)}\nVeículo: ${veDados(ct.veiculo_id)}\nValor: ${brl(ct.valor_total)}`,
      24,
    ));
  }

  // ── Fim de contrato (aviso 3 dias antes via alarme de 72h)
  for (const ct of contratos) {
    if (!ct.data_fim || ct.data_fim < hoje) continue;
    eventos.push(evento(
      `fim-${ct.id}@autogest`,
      ct.data_fim,
      `📋 Fim de contrato: ${clNome(ct.cliente_id)}`,
      `Contrato #${numCt(ct.id)}\nVeículo: ${veDados(ct.veiculo_id)}\nDevolver veículo`,
      72,
    ));
  }

  // ── Vencimentos de faturas emitidas/previstas
  for (const rec of receitas) {
    if (!rec.data_vencimento || rec.data_vencimento < hoje) continue;
    eventos.push(evento(
      `fat-${rec.id}@autogest`,
      rec.data_vencimento,
      `📄 Vencimento: ${rec.numero_fatura || "Fatura"}`,
      `${rec.descricao || ""}\nValor: ${brl(rec.valor)}`,
      24,
    ));
  }

  // ── Multas com vencimento futuro
  for (const m of multas) {
    if (!m.vencimento || m.vencimento < hoje) continue;
    eventos.push(evento(
      `multa-${m.id}@autogest`,
      m.vencimento,
      `🚨 Multa: ${veDados(m.veiculo_id)}`,
      `${m.descricao || "Multa"}\nValor: ${brl(m.valor)}`,
      48,
    ));
  }

  // ── Manutenções em andamento (data_saida prevista)
  for (const mn of manutencoes) {
    const data = mn.data_saida || mn.data_previsao_pagamento;
    if (!data || data < hoje) continue;
    eventos.push(evento(
      `man-${mn.id}@autogest`,
      data,
      `🔧 Manutenção: ${veDados(mn.veiculo_id)}`,
      `${mn.tipo || "Manutenção"}\n${mn.descricao || ""}\nCusto: ${brl(mn.custo)}`,
      72,
    ));
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AutoGest Pro//Calendar//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AutoGest Pro 🚗",
    "X-WR-CALDESC:Pagamentos\\, vencimentos e alertas da frota",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...eventos,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="autogest.ics"',
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
