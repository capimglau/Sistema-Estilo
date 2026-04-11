import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY não configurada nas secrets do Supabase.')

    const EMPRESA_EMAIL = Deno.env.get('EMPRESA_EMAIL') ?? 'estilo@estilorentacar.com.br'
    const FROM_EMAIL    = Deno.env.get('RESEND_FROM')   ?? 'onboarding@resend.dev'
    const FROM          = `Estilo Rent a Car <${FROM_EMAIL}>`

    const {
      nome, email: clientEmail, telefone, cpf,
      veiculo, loja,
      data_retirada, hora_retirada,
      data_devolucao, hora_devolucao,
      dias, valor_estimado, pacote_mensal,
    } = await req.json()

    /* ── helpers ── */
    const fmtDate = (d: string) => {
      if (!d) return '--'
      const [y, m, day] = d.split('-')
      return `${day}/${m}/${y}`
    }
    const fmtBRL = (v: number) =>
      `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    const totalTxt = valor_estimado
      ? fmtBRL(valor_estimado) + (pacote_mensal ? ' — Pacote Mensal' : ` (${dias} dias)`)
      : 'A consultar'

    /* ══════════════════════════════════════════
       EMAIL 1 — CLIENTE  (confirmação pré-reserva)
    ══════════════════════════════════════════ */
    const htmlCliente = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pré-Reserva Recebida</title></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:40px 16px;">
  <tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(27,43,107,.10);">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(135deg,#0C1533 0%,#1B2B6B 100%);padding:36px 44px;text-align:center;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:rgba(255,255,255,.4);text-transform:uppercase;">Estilo Rent a Car</p>
      <p style="margin:10px 0 0;font-family:Georgia,serif;font-size:26px;font-weight:400;color:#fff;letter-spacing:1px;">Pré-Reserva Recebida</p>
      <div style="width:48px;height:3px;background:#E8A020;margin:14px auto 0;border-radius:2px;"></div>
    </td></tr>

    <!-- AVISO PRÉ-RESERVA -->
    <tr><td style="background:#fffbeb;padding:16px 44px;border-bottom:2px solid #f59e0b;">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:20px;padding-right:12px;">⚠️</td>
        <td>
          <p style="margin:0;font-size:13px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:.5px;">Pré-Reserva</p>
          <p style="margin:2px 0 0;font-size:12px;color:#b45309;line-height:1.5;">Esta solicitação está <strong>sujeita à aprovação e disponibilidade do veículo</strong>. Você receberá a confirmação em breve.</p>
        </td>
      </tr></table>
    </td></tr>

    <!-- SAUDAÇÃO -->
    <tr><td style="padding:32px 44px 0;">
      <p style="margin:0;font-size:19px;font-weight:700;color:#1B2B6B;">Olá, ${nome}! 👋</p>
      <p style="margin:10px 0 0;font-size:14px;color:#555;line-height:1.8;">Recebemos sua solicitação de pré-reserva. Nossa equipe entrará em contato em breve pelo WhatsApp para confirmar os detalhes e disponibilidade.</p>
    </td></tr>

    <!-- DETALHES -->
    <tr><td style="padding:24px 44px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fd;border-radius:14px;border:1px solid #e4e8f4;overflow:hidden;">
        <tr><td style="background:#1B2B6B;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2px;color:#E8A020;text-transform:uppercase;">Detalhes da Solicitação</p>
        </td></tr>
        <tr><td style="padding:4px 20px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 0 8px;font-size:12px;color:#888;border-bottom:1px solid #eef0f8;">Veículo</td>
              <td style="padding:12px 0 8px;font-size:13px;font-weight:700;color:#1B2B6B;text-align:right;border-bottom:1px solid #eef0f8;">${veiculo}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#888;border-bottom:1px solid #eef0f8;">Loja de retirada</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#333;text-align:right;border-bottom:1px solid #eef0f8;">${loja}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#888;border-bottom:1px solid #eef0f8;">Retirada</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#333;text-align:right;border-bottom:1px solid #eef0f8;">${fmtDate(data_retirada)} às ${hora_retirada}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#888;border-bottom:1px solid #eef0f8;">Devolução</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#333;text-align:right;border-bottom:1px solid #eef0f8;">${fmtDate(data_devolucao)} às ${hora_devolucao}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:12px;color:#888;border-bottom:1px solid #eef0f8;">Período</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#333;text-align:right;border-bottom:1px solid #eef0f8;">${dias} dia${dias > 1 ? 's' : ''}${pacote_mensal ? ' — Pacote Mensal' : ''}</td>
            </tr>
            <tr>
              <td style="padding:12px 0 4px;font-size:13px;font-weight:800;color:#1B2B6B;">Total Estimado</td>
              <td style="padding:12px 0 4px;font-size:20px;font-weight:800;color:#1B2B6B;text-align:right;">${totalTxt}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- RODAPÉ -->
    <tr><td style="background:#f7f8fd;border-top:1px solid #eee;padding:20px 44px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Estilo Rent a Car &nbsp;·&nbsp; estilorentacar.com.br</p>
      <p style="margin:6px 0 0;font-size:11px;color:#ccc;">Este é um e-mail automático, não responda a esta mensagem.</p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`

    /* ══════════════════════════════════════════
       EMAIL 2 — EMPRESA  (alerta interno)
    ══════════════════════════════════════════ */
    const htmlEmpresa = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nova Pré-Reserva</title></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:40px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(27,43,107,.10);">

    <!-- HEADER -->
    <tr><td style="background:#0C1533;padding:22px 36px;display:flex;align-items:center;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,.35);text-transform:uppercase;">AutoGest · Estilo Rent a Car</p>
      <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#E8A020;">🔔 Nova Pré-Reserva</p>
    </td></tr>

    <!-- CLIENTE -->
    <tr><td style="padding:24px 36px 0;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:2px;color:#1B2B6B;text-transform:uppercase;">Dados do Cliente</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fd;border-radius:12px;border:1px solid #e4e8f4;">
        <tr><td style="padding:16px 20px;">
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr><td style="font-size:12px;color:#888;width:35%;">Nome</td><td style="font-size:13px;font-weight:700;color:#1a1a2e;">${nome}</td></tr>
            <tr><td style="font-size:12px;color:#888;">Telefone</td><td style="font-size:13px;font-weight:600;color:#333;">${telefone}</td></tr>
            <tr><td style="font-size:12px;color:#888;">E-mail</td><td style="font-size:13px;font-weight:600;color:#1B2B6B;">${clientEmail}</td></tr>
            <tr><td style="font-size:12px;color:#888;">CPF</td><td style="font-size:13px;font-weight:600;color:#333;">${cpf}</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- LOCAÇÃO -->
    <tr><td style="padding:16px 36px 28px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:2px;color:#1B2B6B;text-transform:uppercase;">Dados da Locação</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f3ff;border-radius:12px;border:1px solid #dde3f5;">
        <tr><td style="padding:16px 20px;">
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr><td style="font-size:12px;color:#888;width:35%;">Veículo</td><td style="font-size:14px;font-weight:800;color:#1B2B6B;">${veiculo}</td></tr>
            <tr><td style="font-size:12px;color:#888;">Loja</td><td style="font-size:13px;font-weight:600;color:#333;">${loja}</td></tr>
            <tr><td style="font-size:12px;color:#888;">Retirada</td><td style="font-size:13px;font-weight:600;color:#333;">${fmtDate(data_retirada)} às ${hora_retirada}</td></tr>
            <tr><td style="font-size:12px;color:#888;">Devolução</td><td style="font-size:13px;font-weight:600;color:#333;">${fmtDate(data_devolucao)} às ${hora_devolucao}</td></tr>
            <tr><td style="font-size:12px;color:#888;">Dias</td><td style="font-size:13px;font-weight:600;color:#333;">${dias}${pacote_mensal ? ' (Pacote Mensal)' : ''}</td></tr>
            <tr style="border-top:2px solid #1B2B6B;">
              <td style="font-size:13px;font-weight:800;color:#1B2B6B;padding-top:12px;">Total Estimado</td>
              <td style="font-size:18px;font-weight:800;color:#1B2B6B;padding-top:12px;">${totalTxt}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- RODAPÉ -->
    <tr><td style="background:#f7f8fd;border-top:1px solid #eee;padding:16px 36px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Acesse o AutoGest para confirmar ou cancelar esta reserva</p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`

    /* ── envia os dois emails em paralelo ── */
    const sendEmail = async (payload: object) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(JSON.stringify(await res.json()))
      return res.json()
    }

    await Promise.all([
      sendEmail({
        from: FROM,
        to: clientEmail,
        subject: 'Pré-Reserva Recebida — Estilo Rent a Car',
        html: htmlCliente,
      }),
      sendEmail({
        from: FROM,
        to: EMPRESA_EMAIL,
        reply_to: clientEmail,
        subject: `🔔 Nova Pré-Reserva — ${nome} | ${veiculo}`,
        html: htmlEmpresa,
      }),
    ])

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-reservation-emails]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
