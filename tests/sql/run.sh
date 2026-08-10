#!/usr/bin/env bash
# Roda sql/01-schema.sql e sql/02-seguranca.sql num Postgres descartavel e
# verifica o resultado. O 02 mexe em RLS - quem so le o SQL nao percebe uma
# policy invertida, e o custo do erro e o banco aberto ou o app travado.
#
# Uso:  tests/sql/run.sh [porta]     (padrao 5433, socket em /tmp)
set -uo pipefail

PORTA="${1:-5433}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="ag_teste_$$"
PSQL=(psql -h /tmp -p "$PORTA" -U postgres -v ON_ERROR_STOP=1 -q)

falhas=0
ok()   { echo "  ok   $1"; }
falha() { echo "  FALHA $1"; echo "       esperado: $2"; echo "       obtido:   $3"; falhas=$((falhas + 1)); }

# Compara o resultado de uma consulta com o valor esperado.
checa() { # nome, sql, esperado
  local obtido
  obtido=$("${PSQL[@]}" -d "$DB" -tAc "$2" 2>&1 | tr -d '[:space:]')
  if [ "$obtido" = "$3" ]; then ok "$1"; else falha "$1" "$3" "$obtido"; fi
}

limpar() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap limpar EXIT

echo "== preparando banco $DB =="
"${PSQL[@]}" -d postgres -c "create database $DB" || exit 1
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/sql/00-ambiente.sql" >/dev/null || exit 1

# Um admin com login, senao o 02 aborta de proposito.
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into perfis (id, nome, permissoes) values
  (1, 'Administrador', '{"criar":true,"editar":true,"excluir":true}'),
  (2, 'Visualizador',  '{"criar":false,"editar":false,"excluir":false}');
SQL

echo "== 01-schema.sql =="
"${PSQL[@]}" -d "$DB" -f "$RAIZ/sql/01-schema.sql" >/dev/null || { echo "  FALHA: 01 nao rodou"; exit 1; }
ok "rodou sem erro"

# Precisa existir DEPOIS do 01 (auth_user_id e criada la).
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
insert into usuarios (id, nome, perfil_id, auth_user_id) values
  (1, 'Dono',    1, '11111111-1111-1111-1111-111111111111'),
  (2, 'Estagio', 2, null);
-- Sem id explicito: fixar o id deixa a sequencia em 1 e o proximo insert
-- do teste esbarraria na chave primaria, nao no RLS que se quer medir.
insert into clientes (nome) values ('Cliente Um');
SQL

# Sobras de uma versao antiga: o motivo desta suite existir.
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
create table clients   (id text primary key, data jsonb);
create table contracts (id text primary key, data jsonb);
create table fines     (id text primary key, data jsonb);
create table vehicles  (id text primary key, data jsonb);
insert into clients values ('c1', '{"rg":"12.345.678-9"}');
grant select on clients, contracts, fines, vehicles to anon, authenticated;
SQL
ok "tabelas orfas criadas (clients, contracts, fines, vehicles)"

echo "== 02-seguranca.sql =="
saida=$("${PSQL[@]}" -d "$DB" -f "$RAIZ/sql/02-seguranca.sql" 2>&1)
if [ $? -ne 0 ]; then echo "  FALHA: 02 nao rodou"; echo "$saida" | tail -20; exit 1; fi
ok "rodou sem erro"

echo
echo "== o que o script promete =="

checa "nenhuma tabela do public fica sem RLS" \
  "select count(*) from pg_tables where schemaname='public' and rowsecurity=false" "0"

checa "a chave da Anthropic sai do banco" \
  "select count(*) from information_schema.columns where table_name='config' and column_name='claude_api_key'" "0"

checa "as 4 orfas ficam sem policy nenhuma" \
  "select count(*) from pg_policies where schemaname='public' and tablename in ('clients','contracts','fines','vehicles')" "0"

checa "anon perde acesso as orfas" \
  "select count(*) from information_schema.role_table_grants where grantee='anon' and table_name in ('clients','contracts','fines','vehicles')" "0"

checa "authenticated tambem perde as orfas" \
  "select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_name in ('clients','contracts','fines','vehicles')" "0"

checa "tabela do app mantem as 4 policies" \
  "select count(*) from pg_policies where schemaname='public' and tablename='clientes'" "4"

checa "audit_log so aceita insert (trilha imutavel)" \
  "select count(*) from pg_policies where schemaname='public' and tablename='audit_log'" "2"

checa "a lista do app existe uma vez so" \
  "select array_length(public.ag_tabelas_app(), 1)" "19"

echo
echo "== RLS na pratica: quem le e quem escreve =="

# Sem policy, RLS nega tudo - inclusive para authenticated.
checa "orfa: nem o admin logado le" \
  "set role authenticated;
   set local teste.uid = '11111111-1111-1111-1111-111111111111';
   select count(*) from clients" \
  "ERROR:permissiondeniedfortableclients"

checa "app: o admin le normalmente" \
  "set local teste.uid = '11111111-1111-1111-1111-111111111111';
   set role authenticated;
   select count(*) from clientes" "1"

checa "app: o admin insere (tem permissao criar)" \
  "set local teste.uid = '11111111-1111-1111-1111-111111111111';
   set role authenticated;
   insert into clientes (nome) values ('Novo') returning 1" "1"

# O perfil Visualizador nao tem login vinculado, entao auth.uid() nao casa
# com nenhum usuario e ag_perm devolve false: e o caso 'usuario sem permissao'.
checa "sem perfil valido: insert e barrado" \
  "set local teste.uid = '22222222-2222-2222-2222-222222222222';
   set role authenticated;
   insert into clientes (nome) values ('Nao devia entrar')" \
  "ERROR:newrowviolatesrow-levelsecuritypolicyfortable\"clientes\""

checa "anon nao le tabela do app" \
  "set role anon; select count(*) from clientes" \
  "ERROR:permissiondeniedfortableclientes"

echo
echo "== rodar de novo por cima (o caso real: o banco ja passou pelo script) =="
saida2=$("${PSQL[@]}" -d "$DB" -f "$RAIZ/sql/02-seguranca.sql" 2>&1)
if [ $? -eq 0 ]; then ok "roda duas vezes sem erro"; else falha "roda duas vezes sem erro" "sem erro" "$(echo "$saida2" | tail -3)"; fi

checa "e o estado nao muda: policies continuam 4" \
  "select count(*) from pg_policies where schemaname='public' and tablename='clientes'" "4"

checa "e nenhuma tabela volta a ficar sem RLS" \
  "select count(*) from pg_tables where schemaname='public' and rowsecurity=false" "0"

echo
if [ "$falhas" -eq 0 ]; then echo "tudo certo"; else echo "$falhas verificacao(oes) falhou(aram)"; fi
exit "$falhas"
