-- ===================================================================
-- ASSINATURA PÚBLICA DE CONTRATO (sem login) — funções RPC.
--
-- O script 02 (seguranca.sql) revoga TODO acesso da role anon às
-- tabelas do app (contratos, clientes, veiculos, config incluídos).
-- Isso é o correto para a maioria do sistema, mas a tela de assinatura
-- (link enviado por WhatsApp/e-mail, aberto pelo cliente SEM estar
-- logado) precisa ler e gravar um contrato específico mesmo sem
-- sessão — e hoje ela ainda faz isso com SELECT/PATCH direto nas
-- tabelas, que o anon não tem mais permissão nenhuma de usar. Por
-- isso o link funciona só para quem já está com sessão ativa no
-- navegador (o token de usuário autenticado mascara o problema) e
-- mostra "Contrato não encontrado" para o cliente, que nunca logou.
--
-- Mesmo padrão já usado em fatura_publica(): funções SECURITY DEFINER,
-- liberadas só para anon, que devolvem/alteram apenas o que é
-- estritamente necessário — aqui, sempre validando o token secreto
-- (contratos.token_assinatura) junto com o id do contrato, nunca só
-- o id sozinho.
-- ===================================================================

alter table contratos add column if not exists assinatura_motorista text;
alter table contratos add column if not exists assinado_motorista_em timestamptz;

-- Leitura: devolve o contrato (+ cliente, veículo, dados da empresa)
-- só quando token_assinatura bate com o token do link. Continua
-- valendo depois de assinado (não zeramos o token na gravação — ver
-- confirmar_assinatura_publica abaixo), pra reabrir o link mostrar a
-- tela de "já assinado" em vez de "não encontrado".
create or replace function public.contrato_assinatura_publica(p_contrato_id bigint, p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contrato', coalesce((select jsonb_agg(c) from contratos c where c.id = p_contrato_id and c.token_assinatura = p_token and c.token_assinatura is not null), '[]'::jsonb),
    'cliente', coalesce((select jsonb_agg(cl) from clientes cl where cl.id in (select cliente_id from contratos where id = p_contrato_id and token_assinatura = p_token and token_assinatura is not null)), '[]'::jsonb),
    'veiculo', coalesce((select jsonb_agg(v) from veiculos v where v.id in (select veiculo_id from contratos where id = p_contrato_id and token_assinatura = p_token and token_assinatura is not null)), '[]'::jsonb),
    'empresa', coalesce((select jsonb_agg(cf) from (select * from config order by id desc limit 1) cf), '[]'::jsonb)
  );
$$;
revoke all on function public.contrato_assinatura_publica(bigint, text) from public;
grant execute on function public.contrato_assinatura_publica(bigint, text) to anon;

-- Gravação: só grava se o token bater E o contrato ainda não tiver
-- sido assinado (assinado_em is null) — trava contra reenvio duplicado
-- do formulário e contra tentativa de assinar de novo com o link
-- antigo depois que já foi usado. p_assinatura_motorista é opcional
-- (só quando o contrato tem condutor adicional designado).
create or replace function public.confirmar_assinatura_publica(
  p_contrato_id bigint,
  p_token text,
  p_assinatura_cliente text,
  p_assinatura_motorista text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas int;
begin
  update contratos
     set assinatura_cliente = p_assinatura_cliente,
         assinado_em = now(),
         assinatura_motorista = coalesce(p_assinatura_motorista, assinatura_motorista),
         assinado_motorista_em = case when p_assinatura_motorista is not null then now() else assinado_motorista_em end
   where id = p_contrato_id
     and token_assinatura = p_token
     and token_assinatura is not null
     and assinado_em is null;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;
revoke all on function public.confirmar_assinatura_publica(bigint, text, text, text) from public;
grant execute on function public.confirmar_assinatura_publica(bigint, text, text, text) to anon;
