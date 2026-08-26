// Alarme por horário dos lembretes manuais (tabela `lembretes`, ver
// sql/08-lembretes-alarme.sql) — chamada a cada 1 minuto por um Cron
// Trigger. Chega mesmo com o Safari fechado, desde que o app esteja
// instalado na Tela de Início e as notificações estejam ativadas
// (push_subscriptions, ver sql/05-push-notificacoes.sql).
//
// Separada de send-push (que roda 1x/dia com o resumo de pendências) de
// propósito: rodando a cada minuto, não faz sentido reaproveitar a mesma
// função e complicar a cadência de uma coisa que já funciona.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const VAPID_PUBLIC = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').trim()
    const VAPID_PRIVATE = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim()
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@example.com'
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      throw new Error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas nas secrets da função.')
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Horário de parede em São Paulo — mesma lógica de "string, não
    // timestamptz" usada em agAdiaAgora() no cliente (index.html):
    // comparar texto "HH:MM"/"YYYY-MM-DD" direto evita o timestamptz
    // voltar em UTC e a comparação mentir por 3 horas.
    const agoraSP = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const hojeSP = agoraSP.slice(0, 10)
    const horaSP = agoraSP.slice(11, 16)

    const [{ data: lembretes = [] }, { data: subs = [] }] = await Promise.all([
      supabase.from('lembretes')
        .select('id,texto,data,hora')
        .is('deleted_at', null)
        .is('notificado_em', null)
        .not('hora', 'is', null)
        .eq('data', hojeSP)
        .lte('hora', horaSP),
      supabase.from('push_subscriptions').select('*'),
    ])

    if (!lembretes || lembretes.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'nenhum lembrete no horário' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (!subs || subs.length === 0) {
      // Sem inscrição nenhuma: marca como notificado do mesmo jeito, senão
      // o lembrete fica reaparecendo pra sempre na consulta de "pendente"
      // assim que alguém ativar notificações — o alarme daquele minuto já
      // passou, não faz sentido disparar tarde.
      await supabase.from('lembretes')
        .update({ notificado_em: new Date().toISOString() })
        .in('id', lembretes.map((l: any) => l.id))
      return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'sem inscrições' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    let enviados = 0
    let removidos = 0
    const falhas: any[] = []

    for (const l of lembretes) {
      const payload = JSON.stringify({
        title: '🔔 Lembrete',
        body: l.texto || 'Você tem um lembrete agora.',
        url: './',
      })
      await Promise.all((subs || []).map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payload,
          )
          enviados++
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
            removidos++
          } else {
            falhas.push({ lembreteId: l.id, subId: s.id, statusCode: err?.statusCode, message: err?.message })
          }
        }
      }))
      // Marca como notificado assim que os envios deste lembrete terminam,
      // independente de falha em alguma inscrição — o objetivo é não
      // repetir o mesmo alarme no próximo minuto, não garantir 100% de
      // entrega (isso já é o melhor esforço do Web Push em si).
      await supabase.from('lembretes').update({ notificado_em: new Date().toISOString() }).eq('id', l.id)
    }

    return new Response(JSON.stringify({ ok: true, lembretes: lembretes.length, enviados, removidos, falhas }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-push-lembretes]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
