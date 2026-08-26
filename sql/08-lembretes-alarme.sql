-- Alarme por horário nos lembretes (push, igual app de calendário)
--
-- O modal de lembrete (atalho "Novo") ganhou um campo de hora opcional. Sem
-- hora, o lembrete continua só um cartão na Agenda, como sempre foi. Com
-- hora, a Edge Function send-push-lembretes (rodando de 1 em 1 minuto via
-- Cron, ver instruções no fim deste arquivo) manda uma notificação push
-- nesse horário exato — chega mesmo com o app fechado, contanto que o
-- usuário tenha ativado notificações em Configurações (mesma inscrição de
-- 05-push-notificacoes.sql).
--
-- `notificado_em`: quem grava é SÓ a Edge Function, depois de disparar o
-- push — nunca o app. É o que impede a mesma hora mandar notificação de novo
-- a cada ciclo do Cron. Fica null de novo quando o lembrete é adiado (o app
-- já faz isso ao repor a data), pra poder alarmar de novo na nova data.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

alter table lembretes add column if not exists hora text;
alter table lembretes add column if not exists notificado_em timestamptz;

comment on column lembretes.hora is
  'Horário do alarme, "HH:MM" (opcional). Null = só aparece na Agenda, sem push.';
comment on column lembretes.notificado_em is
  'Preenchido pela Edge Function send-push-lembretes quando o push já foi disparado — evita duplicar.';

create index if not exists lembretes_alarme_idx on lembretes (data, hora) where notificado_em is null;

-- ===================================================================
-- Depois de rodar este SQL, faltam os passos de sempre pra uma Edge
-- Function nova (mesmo padrão do 05-push-notificacoes.sql):
--
-- 1) Deploy da função (as secrets VAPID_* já existem se o push básico
--    já estava configurado — não precisa mexer nelas de novo):
--      supabase functions deploy send-push-lembretes
--
-- 2) Agendar o disparo a cada minuto — granularidade mínima do Cron do
--    Supabase, o suficiente pra um alarme "no minuto certo":
--
--    Pelo Dashboard: Edge Functions > send-push-lembretes > Cron Trigger
--    > "* * * * *".
--
--    Ou via SQL (pg_cron + pg_net, já habilitados por padrão):
--
--      select cron.schedule(
--        'send-push-lembretes-cada-minuto',
--        '* * * * *',
--        $$
--        select net.http_post(
--          url := 'https://SEU_PROJETO.functions.supabase.co/send-push-lembretes',
--          headers := jsonb_build_object(
--            'Authorization', 'Bearer SUA_SERVICE_ROLE_KEY',
--            'Content-Type', 'application/json'
--          ),
--          body := '{}'::jsonb
--        );
--        $$
--      );
-- ===================================================================
