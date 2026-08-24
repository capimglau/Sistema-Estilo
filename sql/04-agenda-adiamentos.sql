-- Adiamentos e "resolvidos" da Agenda
--
-- A Agenda mostra muita coisa que o sistema não tem como dar por encerrada
-- sozinha: licenciamento pago no despachante, CNH renovada, pneu trocado,
-- reserva combinada por telefone. Sem um lugar para registrar "já tratei
-- disso", esses cartões ficam cobrando para sempre e o usuário aprende a
-- ignorar a Agenda inteira.
--
-- Cada linha aqui é um cartão da Agenda que foi adiado para depois
-- (`adiado_para`) ou dado como resolvido (`resolvido`). A `chave` identifica o
-- cartão e inclui a data/quilometragem do vencimento: quando o documento é
-- renovado, a chave muda e o alerta volta sozinho no ciclo seguinte — que é
-- justamente o que se quer.
--
-- Sem esta tabela o app não quebra: ele grava no localStorage do próprio
-- aparelho e segue funcionando. O que se ganha rodando este SQL é a
-- sincronia — adiar no celular passa a valer também no computador.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

create table if not exists agenda_adiamentos (
  id            bigserial primary key,
  chave         text not null unique,
  adiado_para   text,
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- `adiado_para` é text e não timestamptz de propósito: guarda o horário de
-- parede em São Paulo no formato "YYYY-MM-DDTHH:MM", exatamente como o app
-- compara. Convertendo para timestamptz, o mesmo instante voltaria em UTC e a
-- comparação de string do cliente passaria a mentir por 3 horas.

comment on table agenda_adiamentos is
  'Cartões da Agenda adiados ou marcados como resolvidos pelo usuário.';

create index if not exists agenda_adiamentos_chave_idx on agenda_adiamentos (chave);

-- RLS no mesmo padrão do 02-seguranca.sql: leitura para qualquer autenticado,
-- escrita conforme a permissão do perfil. Só é aplicada se o 02 já tiver
-- rodado neste banco (é ele que cria public.ag_perm); num banco que ainda não
-- rodou, a tabela fica como as demais dele e o 02 cuida disso depois.
do $do$
begin
  if to_regprocedure('public.ag_perm(text)') is null then
    raise notice 'public.ag_perm ainda nao existe - rode o 02-seguranca.sql para proteger agenda_adiamentos';
    return;
  end if;

  execute 'alter table agenda_adiamentos enable row level security';

  execute 'drop policy if exists ag_sel_agenda_adiamentos on agenda_adiamentos';
  execute 'drop policy if exists ag_ins_agenda_adiamentos on agenda_adiamentos';
  execute 'drop policy if exists ag_upd_agenda_adiamentos on agenda_adiamentos';
  execute 'drop policy if exists ag_del_agenda_adiamentos on agenda_adiamentos';

  execute 'create policy ag_sel_agenda_adiamentos on agenda_adiamentos for select to authenticated using (true)';
  execute 'create policy ag_ins_agenda_adiamentos on agenda_adiamentos for insert to authenticated with check (public.ag_perm(''criar''))';
  execute 'create policy ag_upd_agenda_adiamentos on agenda_adiamentos for update to authenticated using (public.ag_perm(''editar'')) with check (public.ag_perm(''editar''))';
  execute 'create policy ag_del_agenda_adiamentos on agenda_adiamentos for delete to authenticated using (public.ag_perm(''excluir''))';
end
$do$;
