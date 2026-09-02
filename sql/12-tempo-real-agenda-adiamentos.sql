-- Publica agenda_adiamentos no tempo real (WebSocket)
--
-- Adiar ou dar por resolvido um cartao da Agenda (licenciamento, CNH, pneu,
-- lembrete, reserva combinada por telefone) grava em agenda_adiamentos. Ate
-- agora essa tabela era a UNICA alteracao de dado do app fora do tempo real:
-- o app so recarregava a tabela inteira no fim de cada ciclo de polling.
--
-- O efeito colateral era o contrario do esperado: o ciclo de polling cai para
-- 30s justamente quando o WebSocket ESTA inscrito (com tempo real saudavel
-- ele so serve de rede de seguranca). Ou seja, resolver um cartao no celular
-- levava ate meio minuto para sumir no computador -- e ficava MAIS lento
-- quanto MELHOR estivesse o tempo real.
--
-- O app ja passou a tratar agenda_adiamentos como as demais tabelas
-- sincronizadas. Falta o banco empurrar o evento: e isso que este script faz.
--
-- Sem rodar este SQL o app nao quebra nem regride -- a sincronia continua
-- acontecendo pelo polling, na mesma cadencia de antes. O que se ganha
-- rodando e a propagacao instantanea.
--
-- Idempotente: rodar de novo nao duplica nada nem perde dado.

do $do$
begin
  if to_regclass('public.agenda_adiamentos') is null then
    raise notice 'agenda_adiamentos ainda nao existe - rode o 04-agenda-adiamentos.sql primeiro';
    return;
  end if;

  -- updated_at e deleted_at sao o que o app usa para sincronizar (ver
  -- 07-agenda-adiamentos-colunas.sql). Sem elas o tempo real ate empurra o
  -- evento, mas o polling de seguranca nao consegue reconciliar.
  if to_regclass('public.agenda_adiamentos') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public'
                       and table_name = 'agenda_adiamentos'
                       and column_name = 'updated_at') then
    raise notice 'agenda_adiamentos sem updated_at - rode o 07-agenda-adiamentos-colunas.sql primeiro';
    return;
  end if;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime'
                   and schemaname = 'public'
                   and tablename = 'agenda_adiamentos') then
    alter publication supabase_realtime add table public.agenda_adiamentos;
  end if;
end
$do$;
