-- Adiciona o campo "licenciado" (tick manual) ao cadastro de veículos
--
-- Novo checkbox no formulário de Frota (index.html): marca se o licenciamento
-- do ciclo atual já foi feito. O mesmo campo é marcado sozinho quando o
-- usuário resolve o aviso "Venc. Licenciamento" na Agenda (ver _agk2Marcar em
-- CalendarioKanban2) e volta a ficar false quando a data de vencimento é
-- renovada (onChange do formulário e função renovarDoc) — cada ciclo de
-- licenciamento começa "não licenciado" de novo.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

alter table veiculos add column if not exists licenciado boolean not null default false;
