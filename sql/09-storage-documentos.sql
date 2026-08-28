-- Bucket "documentos" no Supabase Storage
--
-- Todo upload do app (logo da empresa, ícone claro/escuro da PWA, assinatura
-- de contrato, foto de vistoria etc.) passa por db.upload() em index.html,
-- que sobe pra "storage/v1/object/documentos/<caminho>" e depois lê de volta
-- em "storage/v1/object/public/documentos/<caminho>". Se o bucket não existe
-- (ou existe mas sem policy liberando o usuário autenticado), o upload falha
-- com "Upload falhou. Verifique o bucket 'documentos' no Supabase Storage."
-- — foi esse o erro relatado ao tentar trocar o ícone escuro da PWA.
--
-- Idempotente: rodar de novo não duplica nada nem perde dado.

-- Cria o bucket público (o app monta URL pública direto, sem assinar link).
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

-- Leitura pública (necessária pra logo/ícone aparecerem sem sessão — ex.:
-- tela de login, ou o <link rel="apple-touch-icon"> que o iOS busca sozinho).
drop policy if exists "documentos_select_publico" on storage.objects;
create policy "documentos_select_publico"
  on storage.objects for select
  using (bucket_id = 'documentos');

-- Upload/edição/exclusão liberados para qualquer usuário AUTENTICADO do app
-- (mesmo modelo já usado nas outras tabelas: quem passou pelo login já é
-- funcionário/administrador da locadora — controle fino de permissão por
-- perfil fica nas telas, não faz sentido duplicar aqui pra um bucket só de
-- assets/documentos).
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
