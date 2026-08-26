-- Corrige agenda_adiamentos: faltavam updated_at/deleted_at em inglês
--
-- agAdiaCarregar/agAdiaDefinir (index.html) leem e gravam agenda_adiamentos
-- pelas funções genéricas do app (db.get/db.post/db.patch/db.del) — as
-- MESMAS usadas por contratos, despesas etc. Essas funções esperam colunas
-- chamadas exatamente `updated_at` e `deleted_at` (em inglês) em QUALQUER
-- tabela que passe por elas. O 04-agenda-adiamentos.sql criou só
-- `atualizado_em`/`criado_em` (em português) — sem `deleted_at`, a primeira
-- leitura de agenda_adiamentos (que sempre pede "?deleted_at=is.null") volta
-- com erro de coluna inexistente, e o app reage DESLIGANDO A EXCLUSÃO
-- REVERSÍVEL ("Desfazer") PRA SEMPRE, em TODAS as tabelas do sistema, não só
-- nesta — é um interruptor global, salvo em localStorage.
--
-- Este script só adiciona o que falta: nada do 04 é removido, `atualizado_em`
-- continua existindo (nada mais o lê, mas não atrapalha).
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

do $do$
begin
  if to_regclass('public.agenda_adiamentos') is null then
    raise notice 'agenda_adiamentos ainda nao existe - rode o 04-agenda-adiamentos.sql primeiro';
    return;
  end if;

  execute 'alter table agenda_adiamentos add column if not exists updated_at timestamptz not null default now()';
  execute 'alter table agenda_adiamentos add column if not exists deleted_at timestamptz';
  execute 'update agenda_adiamentos set updated_at = coalesce(updated_at, atualizado_em, now()) where updated_at is null';

  execute 'create index if not exists agenda_adiamentos_deleted_at_idx on agenda_adiamentos (deleted_at)';
  execute 'create index if not exists agenda_adiamentos_updated_at_idx on agenda_adiamentos (updated_at desc)';

  if to_regprocedure('public.ag_touch_updated_at()') is not null then
    execute 'drop trigger if exists ag_touch_agenda_adiamentos on agenda_adiamentos';
    execute 'create trigger ag_touch_agenda_adiamentos before update on agenda_adiamentos for each row execute function public.ag_touch_updated_at()';
  end if;
end
$do$;
