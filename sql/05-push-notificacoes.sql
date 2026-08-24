-- ===================================================================
-- Notificações push (Web Push) — chegam mesmo com o Safari fechado,
-- desde que o app esteja instalado na Tela de Início (iOS 16.4+) e o
-- usuário tenha concedido permissão dentro do app instalado.
--
-- Cada navegador/dispositivo que ativa notificações (botão "Ativar
-- notificações" em Configurações) gera uma "inscrição" push — um
-- endpoint único + duas chaves de criptografia — que fica salva aqui.
-- A Edge Function supabase/functions/send-push lê esta tabela (via
-- service_role, ignora RLS) e envia a notificação pra cada inscrição.
--
-- Rode este script no SQL Editor do Supabase depois de já ter rodado
-- 01-schema.sql e 02-seguranca.sql.
-- ===================================================================

create table if not exists push_subscriptions (
  id bigserial primary key,
  auth_uid uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_auth_uid on push_subscriptions(auth_uid);

alter table push_subscriptions enable row level security;

drop policy if exists push_sub_ins on push_subscriptions;
drop policy if exists push_sub_upd on push_subscriptions;
drop policy if exists push_sub_sel on push_subscriptions;
drop policy if exists push_sub_del on push_subscriptions;

-- Cada usuário só enxerga/gerencia as próprias inscrições — não é uma
-- tabela de negócio (contrato, despesa etc.), então não entra em
-- ag_tabelas_app()/ag_perm(): a policy é sempre "é dono da linha",
-- independente do perfil (criar/editar/excluir).
create policy push_sub_ins on push_subscriptions for insert to authenticated with check (auth_uid = auth.uid());
create policy push_sub_upd on push_subscriptions for update to authenticated using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());
create policy push_sub_sel on push_subscriptions for select to authenticated using (auth_uid = auth.uid());
create policy push_sub_del on push_subscriptions for delete to authenticated using (auth_uid = auth.uid());

revoke all on push_subscriptions from anon;
grant select, insert, update, delete on push_subscriptions to authenticated;
grant usage on sequence push_subscriptions_id_seq to authenticated;

-- ===================================================================
-- Depois de rodar este script, faltam 3 passos (uma vez só, fora do
-- SQL Editor):
--
-- 1) Gerar as chaves VAPID (o app já te deu um par pronto pra usar) e
--    guardar como secrets da função:
--      supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
--        VAPID_SUBJECT="mailto:seuemail@dominio.com"
--
-- 2) Deploy da função:
--      supabase functions deploy send-push
--
-- 3) Agendar o disparo diário — mais simples pelo Dashboard:
--    Edge Functions > send-push > Cron Trigger > "0 12 * * *" (uma vez
--    por dia, ajuste o horário). Alternativa via SQL (pg_cron + pg_net,
--    extensões já habilitadas por padrão no Supabase):
--
--      select cron.schedule(
--        'send-push-diario',
--        '0 12 * * *',
--        $$
--        select net.http_post(
--          url := 'https://SEU_PROJETO.functions.supabase.co/send-push',
--          headers := jsonb_build_object(
--            'Authorization', 'Bearer SUA_SERVICE_ROLE_KEY',
--            'Content-Type', 'application/json'
--          ),
--          body := '{}'::jsonb
--        );
--        $$
--      );
-- ===================================================================
