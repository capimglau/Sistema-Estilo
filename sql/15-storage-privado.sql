-- 15 — Documento de cliente sai do ar público (Supabase Storage)
--
-- PROBLEMA
-- O bucket `documentos` era PÚBLICO (sql/09). Tudo que o app subia — CNH, RG,
-- comprovante de residência, CRV, auto de infração, CNH de condutor infrator,
-- orçamento e nota de manutenção — ficava acessível a QUALQUER PESSOA que
-- tivesse a URL, sem login e sem expirar. São dados pessoais de terceiros
-- (os clientes da locadora), o que é problema de LGPD antes de ser qualquer
-- outra coisa.
--
-- O bucket nasceu público por um motivo real: a TELA DE LOGIN desenha o logo
-- da empresa ANTES de existir sessão (index.html, LoginScreen), e link
-- assinado exige sessão. Fechar tudo quebraria o logo do login.
--
-- SOLUÇÃO — dois buckets, separados por NATUREZA do arquivo:
--
--   `documentos` (PRIVADO) → documento. Só abre por link assinado, gerado
--                            pelo app para quem já está autenticado.
--   `marca`      (PÚBLICO) → logo e ícones da PWA. Não é dado de ninguém,
--                            e precisa aparecer antes do login.
--
-- Nada de dado de cliente mora no bucket público depois desta migração.
--
-- Idempotente: rodar de novo não duplica nada nem perde arquivo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bucket da MARCA (público) — logo e ícones
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('marca', 'marca', true)
on conflict (id) do update set public = true;

drop policy if exists "marca_select_publico" on storage.objects;
create policy "marca_select_publico"
  on storage.objects for select
  using (bucket_id = 'marca');

drop policy if exists "marca_insert_autenticado" on storage.objects;
create policy "marca_insert_autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'marca');

drop policy if exists "marca_update_autenticado" on storage.objects;
create policy "marca_update_autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'marca')
  with check (bucket_id = 'marca');

drop policy if exists "marca_delete_autenticado" on storage.objects;
create policy "marca_delete_autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'marca');

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Move o que JÁ existe de logo/ícone para o bucket da marca
--    (antes de fechar o `documentos`, senão o logo do login some)
-- ───────────────────────────────────────────────────────────────────────────
update storage.objects
   set bucket_id = 'marca'
 where bucket_id = 'documentos'
   and (name like 'logo/%' or name like 'pwa/%' or name like 'icone/%');

-- Reescreve os endereços guardados em `config` para o bucket novo.
update config
   set logo_url = replace(logo_url, '/object/public/documentos/', '/object/public/marca/')
 where logo_url like '%/object/public/documentos/logo/%';

update config
   set pwa_icon_url = replace(pwa_icon_url, '/object/public/documentos/', '/object/public/marca/')
 where pwa_icon_url like '%/object/public/documentos/%';

update config
   set pwa_icon_dark_url = replace(pwa_icon_dark_url, '/object/public/documentos/', '/object/public/marca/')
 where pwa_icon_dark_url like '%/object/public/documentos/%';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) FECHA o bucket dos documentos
-- ───────────────────────────────────────────────────────────────────────────
update storage.buckets set public = false where id = 'documentos';

-- A policy antiga liberava SELECT para todo mundo, inclusive anônimo — é
-- exatamente ela que deixava a CNH aberta. Trocada por uma que só atende
-- usuário autenticado (é a leitura que o app usa para assinar o link).
drop policy if exists "documentos_select_publico" on storage.objects;

drop policy if exists "documentos_select_autenticado" on storage.objects;
create policy "documentos_select_autenticado"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documentos');

-- Escrita continua como estava: quem passou pelo login é funcionário da
-- locadora. Recriadas aqui só para o arquivo ser autossuficiente.
drop policy if exists "documentos_insert_autenticado" on storage.objects;
create policy "documentos_insert_autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documentos');

drop policy if exists "documentos_update_autenticado" on storage.objects;
create policy "documentos_update_autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documentos')
  with check (bucket_id = 'documentos');

drop policy if exists "documentos_delete_autenticado" on storage.objects;
create policy "documentos_delete_autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documentos');

-- ───────────────────────────────────────────────────────────────────────────
-- Conferência (não altera nada) — rode depois para confirmar
-- ───────────────────────────────────────────────────────────────────────────
--
-- select id, public from storage.buckets where id in ('documentos','marca');
--   documentos deve vir public = false
--   marca      deve vir public = true
--
-- Nada de dado pessoal pode estar no bucket público:
-- select name from storage.objects where bucket_id = 'marca' order by name;
--   só deve listar logo/ e ícones.
