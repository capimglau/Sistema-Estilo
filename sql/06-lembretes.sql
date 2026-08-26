-- Lembretes manuais na Agenda
--
-- Atalho rápido (painel "Novo") pra anotar algo sem tela própria: "ligar pro
-- cliente", "levar o carro no despachante". Cada linha vira um cartão na
-- Agenda (buildAgendaEventos, tipo "lembrete") na data escolhida. Concluir um
-- lembrete apaga a linha (db.del) — não usa agenda_adiamentos como os
-- cartões sem baixa própria (CNH, documento) — justamente para propagar por
-- WebSocket em tempo real (ver TEMPO REAL abaixo).
--
-- IMPORTANTE — updated_at/deleted_at com esse nome exato: o app inteiro
-- (db.get/db.post/db.patch/db.del/db.getMudancas, em index.html) espera essas
-- duas colunas em INGLÊS em toda tabela que ele sincroniza. Sem elas, a
-- PRIMEIRA leitura desta tabela devolve "column does not exist" e o app
-- reage DESLIGANDO A CAPACIDADE PRA SEMPRE (globalmente, salva em
-- localStorage) — não só para `lembretes`, para TODAS as tabelas: exclusão
-- reversível ("Desfazer") vira exclusão física em todo o sistema, e a
-- sincronização por polling entre abas para de funcionar por completo. Por
-- isso este SQL não pode ser pulado, e por isso ele também limpa esse
-- interruptor (ver bloco final) para o app tentar de novo com a coluna já
-- existindo.
--
-- Sem esta tabela o app não quebra: o lembrete criado localmente fica só no
-- aparelho. O que se ganha rodando este SQL é sincronizar entre celular e
-- computador, com o cartão sumindo em tempo real nas duas telas ao ser
-- concluído.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

create table if not exists lembretes (
  id         bigserial primary key,
  texto      text not null,
  data       date not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Quem já rodou a versão anterior deste arquivo (sem updated_at/deleted_at)
-- ganha as colunas que faltam sem perder nada do que já tinha.
alter table lembretes add column if not exists updated_at timestamptz not null default now();
alter table lembretes add column if not exists deleted_at timestamptz;

comment on table lembretes is
  'Lembretes manuais criados pelo atalho "Novo" — viram cartão na Agenda na data escolhida.';

create index if not exists lembretes_data_idx on lembretes (data);
create index if not exists lembretes_deleted_at_idx on lembretes (deleted_at);
create index if not exists lembretes_updated_at_idx on lembretes (updated_at desc);

-- updated_at automático a cada UPDATE — mesma função que o 02-seguranca.sql
-- cria pras outras tabelas. Só roda se o 02 já existir; sem ele, o app ainda
-- funciona (db.patch manda o timestamp manualmente quando precisa).
do $do$
begin
  if to_regprocedure('public.ag_touch_updated_at()') is null then
    raise notice 'public.ag_touch_updated_at ainda nao existe - rode o 02-seguranca.sql para o updated_at automatico de lembretes';
  else
    execute 'drop trigger if exists ag_touch_lembretes on lembretes';
    execute 'create trigger ag_touch_lembretes before update on lembretes for each row execute function public.ag_touch_updated_at()';
  end if;
end
$do$;

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

-- TEMPO REAL: publica `lembretes` na supabase_realtime — sem isso o
-- WebSocket conecta mas o banco não empurra evento nenhum desta tabela, e
-- concluir um lembrete numa aba só aparece na outra no próximo ciclo de
-- polling (alguns segundos), não na hora.
do $do$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lembretes'
  ) then
    execute 'alter publication supabase_realtime add table public.lembretes';
  end if;
end
$do$;
