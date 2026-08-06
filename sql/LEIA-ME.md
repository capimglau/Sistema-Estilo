# SQL de migração

Cole no **Supabase → SQL Editor**, **nesta ordem**:

1. `01-schema.sql` — colunas e tabelas novas
2. `02-seguranca.sql` — RLS por perfil, auditoria por trigger, `updated_at`/`deleted_at`

Os dois são idempotentes: rodar de novo não duplica nada nem perde dado.

## Antes de rodar o 02

O `02` fecha o banco por perfil. **Todos os usuários precisam ter e-mail/senha
cadastrados** em Config → Usuários (e `usuarios.auth_user_id` preenchido).
Sem isso, ninguém autenticado consegue escrever depois que ele rodar.

## O que o 02 faz

- Substitui a policy `for all using (true)` — que deixava qualquer usuário
  logado escrever em qualquer tabela — por regras derivadas do perfil
  (`criar`/`editar`/`excluir`).
- `usuarios`, `perfis` e `config` passam a ser só de administrador. Se o
  usuário pudesse editar o próprio perfil, viraria admin sozinho.
- `audit_log` vira append-only e passa a ser gravado por trigger, com o
  `auth.uid()` real de quem fez. Antes era gravado pelo navegador em
  best-effort: sumia quando a rede caía e era forjável pelo console.
- Adiciona `updated_at` (edição concorrente) e `deleted_at` (exclusão
  reversível), com índices e trigger.
- Derruba `config.claude_api_key`. **Revogue a chave antiga** em
  console.anthropic.com → API Keys: ela esteve legível para todo usuário.

Tabela que não existir no seu banco é **pulada com aviso**, não aborta o script.

## Validação

Testados contra um PostgreSQL 16 real, incluindo o cenário sem a tabela
`orcamentos`, execução repetida e verificação de que o perfil Visualizador
é barrado no INSERT/UPDATE/DELETE e o `anon` não lê nada.
