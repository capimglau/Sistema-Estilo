-- ===================================================================
-- VERIFICACAO PREVIA - nao altera nada, so impede o tiro no pe.
-- ===================================================================
do $chk$
declare
  n_admin int;
  n_login int;
begin
  if to_regclass('public.usuarios') is null or to_regclass('public.perfis') is null then
    raise exception 'ABORTADO: tabelas usuarios/perfis nao existem. Rode o script 1 (schema) primeiro.';
  end if;

  select count(*) into n_login from usuarios where auth_user_id is not null;
  select count(*) into n_admin
    from usuarios u join perfis pf on pf.id = u.perfil_id
   where u.auth_user_id is not null
     and pf.nome = 'Administrador'
     and coalesce((pf.permissoes->>'criar')::boolean, false)
     and coalesce((pf.permissoes->>'editar')::boolean, false)
     and coalesce((pf.permissoes->>'excluir')::boolean, false);

  if n_admin = 0 then
    raise exception 'ABORTADO: nenhum administrador utilizavel (usuarios com login vinculado: %). Nada foi alterado.', n_login
      using hint = 'Rode esta consulta para ver a situacao: select u.nome, u.email, u.auth_user_id is not null as tem_login, pf.nome as perfil, pf.permissoes from usuarios u left join perfis pf on pf.id = u.perfil_id; -- Corrija em Config > Usuarios: o seu usuario precisa de login (e-mail/senha) E de um perfil chamado exatamente Administrador com criar/editar/excluir = true.';
  end if;

  raise notice 'OK: % administrador(es) com login vinculado. Seguindo.', n_admin;
end $chk$;

-- ===================================================================
-- RLS por PERFIL. As permissões criar/editar/excluir de cada perfil
-- (Config -> Usuários -> Perfis) passam a valer no banco, não só na
-- tela. Antes a policy era 'for all using (true)': qualquer usuário
-- logado apagava qualquer tabela, inclusive um perfil Visualizador.
-- ===================================================================

-- Lê a permissão do usuário autenticado a partir do perfil dele.
-- SECURITY DEFINER porque precisa ler usuarios/perfis mesmo quando o
-- usuário não tem SELECT direto nelas (senão a policy se auto-bloqueia).
create or replace function public.ag_perm(p_acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (pf.permissoes ->> p_acao)::boolean
       from usuarios u
       join perfis pf on pf.id = u.perfil_id
      where u.auth_user_id = auth.uid()
      limit 1),
    false);
$$;

create or replace function public.ag_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pf.nome = 'Administrador'
       from usuarios u
       join perfis pf on pf.id = u.perfil_id
      where u.auth_user_id = auth.uid()
      limit 1),
    false);
$$;

revoke all on function public.ag_perm(text) from public;
grant execute on function public.ag_perm(text) to authenticated;
revoke all on function public.ag_is_admin() from public;
grant execute on function public.ag_is_admin() to authenticated;

-- A lista das tabelas do app vivia escrita a mao em DOIS blocos DO deste
-- arquivo, que precisavam ser editados juntos - e um dia nao seriam. Aqui
-- ela existe uma vez so.
create or replace function public.ag_tabelas_app()
returns text[]
language sql
immutable
as $$
  select array[
    'clientes','veiculos','contratos','multas','manutencao','despesas',
    'receitas','contas','orcamento_pessoal','orcamentos','audit_log',
    'ocupacao_historico','perfis','usuarios','config','reservas','usos',
    'fornecedores','sinistros'
  ]::text[];
$$;

do $do$
declare
  t text;
  tabelas text[] := public.ag_tabelas_app();
  admin_only text[] := array['usuarios','perfis','config'];
  append_only text[] := array['audit_log'];
  cond_ins text; cond_upd text; cond_del text;
  n_fora int := 0;
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabela % nao existe neste banco - ignorada', t;
      continue;
    end if;

    execute format('alter table %I enable row level security', t);

    -- A policy permissiva antiga precisa sair: o Postgres faz OR entre
    -- policies, e enquanto ela existir as novas nao restringem nada.
    execute format('drop policy if exists %I on %I', 'auth_all_' || t, t);
    execute format('drop policy if exists %I on %I', 'ag_sel_' || t, t);
    execute format('drop policy if exists %I on %I', 'ag_ins_' || t, t);
    execute format('drop policy if exists %I on %I', 'ag_upd_' || t, t);
    execute format('drop policy if exists %I on %I', 'ag_del_' || t, t);

    -- Leitura liberada para autenticado: o app carrega as tabelas no
    -- boot e os perfis se diferenciam por escrita, nao por leitura.
    execute format('create policy %I on %I for select to authenticated using (true)', 'ag_sel_' || t, t);

    if t = any(append_only) then
      execute format('create policy %I on %I for insert to authenticated with check (true)', 'ag_ins_' || t, t);
      -- sem update/delete: trilha de auditoria e imutavel.
      continue;
    end if;

    if t = any(admin_only) then
      cond_ins := 'public.ag_is_admin()'; cond_upd := 'public.ag_is_admin()'; cond_del := 'public.ag_is_admin()';
    else
      cond_ins := 'public.ag_perm(''criar'')'; cond_upd := 'public.ag_perm(''editar'')'; cond_del := 'public.ag_perm(''excluir'')';
    end if;

    execute format('create policy %I on %I for insert to authenticated with check (%s)', 'ag_ins_' || t, t, cond_ins);
    execute format('create policy %I on %I for update to authenticated using (%s) with check (%s)', 'ag_upd_' || t, t, cond_upd, cond_upd);
    execute format('create policy %I on %I for delete to authenticated using (%s)', 'ag_del_' || t, t, cond_del);

    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;

  -- Tudo que NAO esta na lista do app tambem precisa ser trancado. A lista
  -- acima protegia por memoria: quatro tabelas de uma versao antiga
  -- (clients, contracts, fines, vehicles) ficaram meses sem RLS porque
  -- ninguem lembrou de acrescenta-las. Aqui a varredura pega o schema
  -- inteiro, entao tabela nova nasce fechada em vez de nascer aberta.
  --
  -- De proposito nenhuma policy e criada para elas: policy e permissao, e
  -- nao da para presumir quem pode ler uma tabela que o app nem conhece.
  -- Sem policy, RLS nega tudo - inclusive para authenticated. Se alguma
  -- delas passar a ser usada pelo app, o caminho e acrescenta-la em
  -- ag_tabelas_app() e rodar este script de novo.
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not (c.relname = any(tabelas))
     order by c.relname
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    n_fora := n_fora + 1;
    raise notice 'fora da lista do app - trancada sem policy: %', t;
  end loop;

  if n_fora > 0 then
    raise notice '% tabela(s) desconhecida(s) trancada(s). Se o app usar alguma, inclua em ag_tabelas_app() e rode de novo.', n_fora;
  end if;
end $do$;

revoke update, delete on audit_log from authenticated;
grant usage on all sequences in schema public to authenticated;

-- ===================================================================
-- updated_at + deleted_at: edicao concorrente e exclusao reversivel.
-- Sem updated_at, dois usuarios editando o mesmo registro faziam o
-- ultimo PATCH apagar o trabalho do primeiro, sem aviso nenhum.
-- Sem deleted_at, excluir era DELETE fisico: o 'Desfazer' so existia
-- na memoria da aba e fechar a aba perdia o dado para sempre.
-- ===================================================================
create or replace function public.ag_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ag_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_dados jsonb;
begin
  if (TG_OP = 'DELETE') then
    v_id := old.id::text; v_dados := to_jsonb(old);
  else
    v_id := new.id::text; v_dados := to_jsonb(new);
  end if;
  insert into audit_log (tabela, operacao, registro_id, dados, auth_uid, origem)
  values (TG_TABLE_NAME, lower(TG_OP), v_id, v_dados, auth.uid(), 'trigger');
  return coalesce(new, old);
end;
$$;

alter table audit_log add column if not exists auth_uid uuid;
alter table audit_log add column if not exists origem text default 'app';

do $do$
declare
  t text;
  tabelas text[] := public.ag_tabelas_app();
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    if t = 'audit_log' then continue; end if;  -- trilha imutavel

    execute format('alter table %I add column if not exists updated_at timestamptz default now()', t);
    execute format('alter table %I add column if not exists deleted_at timestamptz', t);
    execute format('update %I set updated_at = now() where updated_at is null', t);

    execute format('drop trigger if exists %I on %I', 'ag_touch_' || t, t);
    execute format('create trigger %I before update on %I for each row execute function public.ag_touch_updated_at()', 'ag_touch_' || t, t);

    -- Auditoria pelo banco, nao pelo navegador: o app gravava audit_log
    -- por fetch best-effort, que some quando a rede cai e e forjavel por
    -- quem abrir o console.
    execute format('drop trigger if exists %I on %I', 'ag_audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function public.ag_audit()', 'ag_audit_' || t, t);

    -- Indices: o app filtra deleted_at is null em toda leitura e usa
    -- updated_at para buscar so o que mudou desde a ultima sincronizacao.
    execute format('create index if not exists %I on %I (deleted_at)', 'idx_' || t || '_deleted_at', t);
    execute format('create index if not exists %I on %I (updated_at desc)', 'idx_' || t || '_updated_at', t);
  end loop;
end $do$;

-- ===================================================================
-- Remove a chave da Anthropic do banco.
-- Ela ficava em config.claude_api_key, que todo usuário autenticado
-- lê. A chave agora é secret da Edge Function claude-proxy.
-- REVOGUE a chave antiga em console.anthropic.com -> API Keys: ela já
-- foi exposta a todos os usuários e a qualquer cache do navegador.
-- ===================================================================
alter table config drop column if exists claude_api_key;

-- Função pública (sem login) usada só pelo link de fatura compartilhado (?viewer=fatura).
-- Roda como SECURITY DEFINER e devolve apenas os registros ligados aos ids pedidos —
-- diferente do anon aberto de antes, não dá pra usá-la para listar o banco inteiro.
create or replace function public.fatura_publica(p_ids bigint[])
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'contratos', coalesce((select jsonb_agg(c) from contratos c where c.id = any(p_ids)), '[]'::jsonb),
    'clientes', coalesce((select jsonb_agg(cl) from clientes cl where cl.id in (select cliente_id from contratos where id = any(p_ids))), '[]'::jsonb),
    'veiculos', coalesce((select jsonb_agg(v) from veiculos v where v.id in (select veiculo_id from contratos where id = any(p_ids))), '[]'::jsonb),
    'empresa', coalesce((select jsonb_agg(cf) from (select * from config order by id desc limit 1) cf), '[]'::jsonb)
  );
$$;
revoke all on function public.fatura_publica(bigint[]) from public;
grant execute on function public.fatura_publica(bigint[]) to anon;
