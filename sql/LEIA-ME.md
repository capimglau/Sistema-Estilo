# SQL de migração

Cole no **Supabase → SQL Editor**, **nesta ordem**:

1. `01-schema.sql` — colunas e tabelas novas
2. `02-seguranca.sql` — RLS por perfil, auditoria por trigger, `updated_at`/`deleted_at`

Os dois são idempotentes: rodar de novo não duplica nada nem perde dado.

## Antes de rodar o 02

O `02` fecha o banco por perfil. Ele **começa com uma verificação prévia** e
aborta sem alterar nada se ninguém conseguiria mais escrever depois — ou seja,
não dá para se trancar para fora com ele.

A condição: existir ao menos um usuário com login vinculado
(`usuarios.auth_user_id` preenchido) cujo perfil se chame exatamente
`Administrador` e tenha `criar`, `editar` e `excluir` em `true`.

Para conferir antes (consulta somente leitura):

```sql
select u.nome, u.email, u.auth_user_id is not null as tem_login,
       pf.nome as perfil, pf.permissoes
  from usuarios u
  left join perfis pf on pf.id = u.perfil_id;
```

Se você consegue entrar no app com e-mail e senha, `tem_login` já é `true` —
o próprio login busca o usuário por `auth_user_id` e recusa se não achar.

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
