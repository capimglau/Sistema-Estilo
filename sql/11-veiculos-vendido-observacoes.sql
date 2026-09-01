-- Campo "observacoes" no cadastro de veículos
--
-- Usado para guardar os dados da venda quando o veículo é marcado como
-- "Vendido" (Frota → Editar veículo → Status → Vendido): comprador, CPF,
-- telefone, data e valor da venda, digitados em texto livre num campo
-- "Dados da venda" que aparece só quando o status selecionado é "vendido".
--
-- O status "vendido" em si não precisa de migração — a coluna "status" já é
-- texto livre (mesma que guarda "disponivel"/"alugado"/"manutencao"/"inativo").
-- Veículos vendidos são tratados como o "inativo": saem da frota ativa,
-- somem dos alertas de documento (IPVA/Seguro/Licenciamento/Revisão), do
-- rateio de despesas e das opções de contrato.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

alter table veiculos add column if not exists observacoes text;
