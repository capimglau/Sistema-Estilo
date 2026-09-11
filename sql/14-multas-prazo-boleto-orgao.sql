-- 14 — Prazo de retorno do boleto do órgão (tabela `multas`)
--
-- Mesmo problema do 13, uma etapa antes no pipeline. "Boleto Solicitado"
-- registrava a DATA DO PEDIDO (`data_solicitacao_boleto`) e mais nada — não
-- havia prazo de retorno, então uma solicitação podia ficar parada no órgão
-- por meses sem ninguém perceber. A etapa não tinha como estar "atrasada".
--
-- Agora existe um prazo esperado para o boleto chegar.
--
-- Seguro rodar mais de uma vez.

alter table multas
  add column if not exists prazo_boleto_orgao date;

comment on column multas.prazo_boleto_orgao is
  'Prazo esperado para o ORGAO devolver o boleto, registrado ao solicitar. Passou disso sem boleto recebido, a etapa aparece atrasada.';

-- Consulta de apoio: boletos pedidos ao orgao e ainda nao recebidos, fora do prazo.
--
-- select id, ait, data_solicitacao_boleto, prazo_boleto_orgao
--   from multas
--  where coalesce(boleto_orgao_recebido, false) = false
--    and prazo_boleto_orgao is not null
--    and prazo_boleto_orgao < current_date
--  order by prazo_boleto_orgao;
