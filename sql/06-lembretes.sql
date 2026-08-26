-- Lembretes manuais na Agenda
--
-- Atalho rápido (painel "Novo") pra anotar algo sem tela própria: "ligar pro
-- cliente", "levar o carro no despachante". Cada linha vira um cartão na
-- Agenda (buildAgendaEventos, tipo "lembrete") na data escolhida, e some de
-- lá do mesmo jeito que CNH/documento de veículo — "Marcar como resolvido"
-- ou "Adiar", via a tabela agenda_adiamentos que já existe (04-agenda-
-- adiamentos.sql). Este SQL cria só a tabela que guarda o texto e a data.
--
-- Sem esta tabela o app não quebra: o lembrete criado localmente fica só no
-- aparelho (mesmo padrão de agenda_adiamentos). O que se ganha rodando este
-- SQL é sincronizar entre celular e computador.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

create table if not exists lembretes (
  id            bigserial primary key,
  texto         text not null,
  data          date not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table lembretes is
  'Lembretes manuais criados pelo atalho "Novo" — viram cartão na Agenda na data escolhida.';

create index if not exists lembretes_data_idx on lembretes (data);

-- RLS no mesmo padrão do 02-seguranca.sql / 04-agenda-adiamentos.sql: leitura
-- para qualquer autenticado, escrita conforme a permissão do perfil. Só é
-- aplicada se o 02 já tiver rodado neste banco (é ele que cria public.ag_perm);
-- num banco que ainda não rodou, a tabela fica como as demais dele e o 02
-- cuida disso depois.
do $do$
begin
  if to_regprocedure('public.ag_perm(text)') is null then
    raise notice 'public.ag_perm ainda nao existe - rode o 02-seguranca.sql para proteger lembretes';
    return;
  end if;

  execute 'alter table lembretes enable row level security';

  execute 'drop policy if exists ag_sel_lembretes on lembretes';
  execute 'drop policy if exists ag_ins_lembretes on lembretes';
  execute 'drop policy if exists ag_upd_lembretes on lembretes';
  execute 'drop policy if exists ag_del_lembretes on lembretes';

  execute 'create policy ag_sel_lembretes on lembretes for select to authenticated using (true)';
  execute 'create policy ag_ins_lembretes on lembretes for insert to authenticated with check (public.ag_perm(''criar''))';
  execute 'create policy ag_upd_lembretes on lembretes for update to authenticated using (public.ag_perm(''editar'')) with check (public.ag_perm(''editar''))';
  execute 'create policy ag_del_lembretes on lembretes for delete to authenticated using (public.ag_perm(''excluir''))';
end
$do$;
