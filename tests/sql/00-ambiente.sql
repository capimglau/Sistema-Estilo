-- Ambiente de teste: reproduz o que o Supabase ja oferece de fabrica e as
-- tabelas que existiam antes do 01-schema.sql. Serve so para rodar os
-- scripts de sql/ num Postgres vazio e conferir o resultado. Nao vai para
-- o banco de producao.

create schema if not exists auth;

create table if not exists auth.users (id uuid primary key);

-- No Supabase auth.uid() le o JWT da requisicao. Aqui le uma variavel de
-- sessao, que o teste ajusta para fingir cada usuario.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

-- Tabelas anteriores ao 01-schema.sql (o script so faz alter nelas).
create table if not exists perfis (
  id bigserial primary key,
  nome text,
  permissoes jsonb
);

create table if not exists usuarios (
  id bigserial primary key,
  nome text,
  perfil_id bigint references perfis(id)
);

create table if not exists clientes (
  id bigserial primary key,
  nome text,
  cpf_cnpj text
);

create table if not exists veiculos (
  id bigserial primary key,
  placa text,
  modelo text
);

create table if not exists contratos (
  id bigserial primary key,
  cliente_id bigint references clientes(id),
  veiculo_id bigint references veiculos(id),
  valor_total numeric,
  observacoes text
);

create table if not exists reservas (id bigserial primary key, data date);

create table if not exists multas (
  id bigserial primary key,
  contrato_id bigint references contratos(id),
  valor numeric
);

create table if not exists manutencao (
  id bigserial primary key,
  veiculo_id bigint references veiculos(id),
  status text
);

create table if not exists config (id bigserial primary key, nome text, claude_api_key text);

create table if not exists orcamentos (id bigserial primary key, mes text);

create table if not exists usos (id bigserial primary key, dia date);
