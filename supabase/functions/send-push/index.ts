// Dispara notificações Web Push pra todo mundo inscrito (push_subscriptions)
// quando há contratos/despesas pendentes — chamada uma vez por dia por um
// Cron Trigger (ver sql/05-push-notificacoes.sql). Chega mesmo com o Safari
// fechado, desde que o app esteja instalado na Tela de Início.
//
// A lógica de "o que é pendente" é uma versão simplificada da que roda no
// cliente (checkAndNotify, em index.html): é só um empurrão pro usuário
// abrir o app, os detalhes exatos ele vê lá dentro — não precisa espelhar
// cada regra fina de despesa recorrente/orçamento aqui.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { createECDH } from 'node:crypto'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mesma chave que está fixa em index.html (VAPID_PUBLIC_KEY) — é ela que o
// PushManager.subscribe() do navegador usa. Se a secret VAPID_PUBLIC_KEY
// daqui divergir dessa, toda inscrição existente foi feita com uma chave e
// o servidor está assinando com outra — dá exatamente o erro que estamos
// vendo (403 BadJwtToken da Apple).
const APP_VAPID_PUBLIC_KEY = 'BLmv0KDZpc37z52oK5RPSUPmgNQKSsYQJ4VSmjC2m0X5_pznr_BxHrmYIWdLbb25GVHyiR9Tno5rZXZZ5d0qmGc'

function b64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/** Deriva a chave pública a partir da privada (curva P-256) — prova
 * matemática de que as duas formam um par, sem precisar expor nenhuma. */
function publicKeyFromPrivate(privateKeyB64url: string): string {
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(privateKeyB64url, 'base64url'))
  return b64url(new Uint8Array(ecdh.getPublicKey()))
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
    // Diagnóstico temporário: sem revelar a chave, mostra tamanho e se tem
    // caractere fora do alfabeto base64url (isso é o que está quebrando o
    // setVapidDetails logo abaixo — mais rápido descobrir por aqui do que
    // adivinhando pelo valor mascarado no dashboard).
    const b64urlOk = /^[A-Za-z0-9_-]+$/
    if (!b64urlOk.test(VAPID_PUBLIC) || !b64urlOk.test(VAPID_PRIVATE)) {
      const charsInvalidos = (s: string) => Array.from(new Set(s.replace(/[A-Za-z0-9_-]/g, '').split(''))).map((c) => c.codePointAt(0))
      return new Response(JSON.stringify({
        error: 'Chave VAPID com caractere inválido — diagnóstico (sem expor a chave):',
        VAPID_PUBLIC_KEY: { tamanho: VAPID_PUBLIC.length, valido: b64urlOk.test(VAPID_PUBLIC), codigos_invalidos: charsInvalidos(VAPID_PUBLIC) },
        VAPID_PRIVATE_KEY: { tamanho: VAPID_PRIVATE.length, valido: b64urlOk.test(VAPID_PRIVATE), codigos_invalidos: charsInvalidos(VAPID_PRIVATE) },
        esperado: { VAPID_PUBLIC_KEY_tamanho: 87, VAPID_PRIVATE_KEY_tamanho: 43 },
      }, null, 2), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    // Diagnóstico temporário #2: a chave privada realmente forma um par com
    // a pública salva, e essa pública é a MESMA que o app usa pra inscrever
    // o navegador? Se qualquer uma das duas for "não", a assinatura VAPID é
    // rejeitada pelo serviço de push (Apple/Google/Mozilla) — é isso que dá
    // "403 BadJwtToken" mesmo com as chaves em formato válido.
    let publicDerivada = ''
    try { publicDerivada = publicKeyFromPrivate(VAPID_PRIVATE) } catch (e) {
      return new Response(JSON.stringify({
        error: 'Não consegui derivar a chave pública a partir da privada — a VAPID_PRIVATE_KEY não é uma chave EC P-256 válida.',
        detalhe: e instanceof Error ? e.message : String(e),
      }, null, 2), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (publicDerivada !== VAPID_PUBLIC || VAPID_PUBLIC !== APP_VAPID_PUBLIC_KEY) {
      return new Response(JSON.stringify({
        error: 'As chaves VAPID não batem — diagnóstico:',
        VAPID_PUBLIC_KEY_salva_bate_com_a_privada: publicDerivada === VAPID_PUBLIC,
        VAPID_PUBLIC_KEY_salva_bate_com_a_do_app: VAPID_PUBLIC === APP_VAPID_PUBLIC_KEY,
      }, null, 2), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const hoje = new Date().toISOString().slice(0, 10)

    const [{ data: contratos = [] }, { data: despesas = [] }, { data: subs = [] }] = await Promise.all([
      supabase.from('contratos')
        .select('id,status,renovado_para,status_pagamento,previsao_pagamento')
        .is('deleted_at', null),
      supabase.from('despesas')
        .select('id,status,data,data_pagamento,categoria')
        .is('deleted_at', null),
      supabase.from('push_subscriptions').select('*'),
    ])

    const contratosPend = (contratos || []).filter((c: any) =>
      c.status === 'ativo' &&
      !c.renovado_para &&
      c.status_pagamento !== 'pago' &&
      c.status_pagamento !== 'isento' &&
      c.previsao_pagamento &&
      c.previsao_pagamento < hoje
    ).length

    // Retirada de Lucro / Ajuste de Saldo não são despesa operacional (ver
    // premissa isRetLucro no CLAUDE.md do app) — nunca contam como "atraso".
    const despPend = (despesas || []).filter((d: any) => {
      if (!d.data) return false
      if (d.categoria === 'Retirada de Lucro' || d.categoria === 'Ajuste de Saldo') return false
      if (d.status === 'pago' || d.data_pagamento) return false
      return d.data < hoje
    }).length

    if (contratosPend + despPend === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'sem pendências' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'sem inscrições' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const msgs: string[] = []
    if (contratosPend > 0) msgs.push(`${contratosPend} contrato(s) com pagamento em atraso`)
    if (despPend > 0) msgs.push(`${despPend} despesa(s) vencida(s)`)

    const payload = JSON.stringify({
      title: 'AutoGest Pro — Pendências',
      body: msgs.join(' · '),
      url: './',
    })

    let enviados = 0
    let removidos = 0
    const falhas: any[] = []
    await Promise.all((subs || []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          payload,
        )
        enviados++
      } catch (err: any) {
        // 404/410 = inscrição morta (permissão revogada, app desinstalado
        // etc.) — remove pra não tentar de novo amanhã.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
          removidos++
        } else {
          // Diagnóstico temporário: statusCode + corpo da resposta do serviço
          // de push (Apple/Google/Mozilla) — "Received unexpected response
          // code" sozinho não diz o motivo, isso aqui diz.
          const detalhe = { id: s.id, statusCode: err?.statusCode, body: err?.body, message: err?.message }
          console.warn('[send-push] falha ao enviar', JSON.stringify(detalhe))
          falhas.push(detalhe)
        }
      }
    }))

    return new Response(JSON.stringify({ ok: true, enviados, removidos, falhas }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-push]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
