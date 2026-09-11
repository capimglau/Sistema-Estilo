-- 13 — Vencimento do boleto cobrado ao cliente (tabela `multas`)
--
-- Problema: ao registrar "Cobrado ao Cliente", o app gravava só a DATA DA
-- COBRANÇA (`data_cobranca_cliente`). Não havia vencimento nenhum, então não
-- existia como saber se aquele boleto está em atraso.
--
-- O "atrasado" era deduzido por duas heurísticas frágeis, que não respondem a
-- pergunta certa:
--   * `vencimento` da multa — é o prazo para pagar o ÓRGÃO, que nessa altura
--     do pipeline já foi pago; não tem relação com o prazo dado ao cliente;
--   * "cobrado há mais de 30 dias" — chute fixo, igual para todo cliente.
--
-- Agora o vencimento do boleto do cliente é um campo próprio.
--
-- Seguro rodar mais de uma vez.

alter table multas
  add column if not exists vencimento_cobranca_cliente date;

comment on column multas.vencimento_cobranca_cliente is
  'Vencimento do boleto/cobranca enviado ao CLIENTE (etapa "Cobrado ao Cliente"). Nao confundir com multas.vencimento, que e o prazo de pagamento ao orgao.';

-- Consulta de apoio: cobrancas ao cliente vencidas e ainda nao pagas.
-- (so para conferir depois de rodar; nao altera nada)
--
-- select id, ait, data_cobranca_cliente, vencimento_cobranca_cliente,
--        coalesce(valor_cobrado, valor) as valor
--   from multas
--  where cobrado_cliente = 'pendente'
--    and vencimento_cobranca_cliente is not null
--    and vencimento_cobranca_cliente < current_date
--  order by vencimento_cobranca_cliente;
