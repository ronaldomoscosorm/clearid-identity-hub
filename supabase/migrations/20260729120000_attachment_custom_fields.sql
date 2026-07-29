-- =====================================================================
-- Campos personalizados do tipo ANEXO (imagem / PDF) + versionamento
--
-- O ClearID (Argus) não tem tipo de campo "anexo" e não armazena arquivos.
-- Por isso o anexo é um campo que existe SOMENTE no sistema (Supabase):
--   * a DEFINIÇÃO é local (custom_field_definitions.is_local = true) e nunca
--     é enviada/sincronizada com o Argus;
--   * o VÍNCULO por site continua em site_custom_fields (reaproveita toda a
--     configuração: obrigatoriedade, ordem, tipo de trabalhador, rótulo…);
--   * os ARQUIVOS ficam no Supabase Storage (bucket privado) e cada upload
--     gera uma nova VERSÃO em identity_attachments (histórico preservado).
--
-- RLS: mesmo padrão do schema v2 — compartilhado entre usuários autenticados
-- (o app roda com um único usuário técnico; o escopo por site é da aplicação).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) custom_field_definitions — marca definições locais (só do sistema)
-- ---------------------------------------------------------------------
alter table public.custom_field_definitions
  add column if not exists is_local boolean not null default false;

alter table public.custom_field_definitions
  add column if not exists attachment_accept text;

comment on column public.custom_field_definitions.is_local is
  'true = campo existe apenas no sistema (ex.: Anexo). Nunca é sincronizado com o Argus.';
comment on column public.custom_field_definitions.attachment_accept is
  'Para campos do tipo Attachment: restrição opcional de MIME (ex.: "image/*", "application/pdf"). Nulo = imagem e PDF.';

-- ---------------------------------------------------------------------
-- 2) identity_attachments — versões dos arquivos anexados por identidade
-- ---------------------------------------------------------------------
create table if not exists public.identity_attachments (
  id                    uuid primary key default gen_random_uuid(),
  identity_id           uuid not null references public.identities (id) on delete cascade,
  site_custom_field_id  uuid not null references public.site_custom_fields (id) on delete cascade,

  version               integer not null,
  storage_path          text not null,          -- caminho do objeto no bucket
  file_name             text not null,          -- nome original do arquivo
  mime_type             text not null,
  size_bytes            bigint not null,
  is_current            boolean not null default true,

  created_at            timestamptz not null default now(),

  unique (identity_id, site_custom_field_id, version)
);

comment on table public.identity_attachments is
  'Arquivos anexados a uma identidade por campo do site, com versionamento. Uma versão atual por (identidade, campo).';

create index if not exists ia_identity_idx on public.identity_attachments (identity_id);
create index if not exists ia_scf_idx      on public.identity_attachments (site_custom_field_id);

-- Garante no máximo UMA versão atual por (identidade, campo).
create unique index if not exists ia_current_uix
  on public.identity_attachments (identity_id, site_custom_field_id)
  where is_current;

alter table public.identity_attachments enable row level security;

create policy "ia_all" on public.identity_attachments
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3) Storage — bucket privado para os anexos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-attachments',
  'identity-attachments',
  false,
  10485760, -- 10 MB
  array['image/png','image/jpeg','image/jpg','image/webp','image/gif','application/pdf']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Políticas do Storage: usuário autenticado (técnico) gerencia os objetos do bucket.
drop policy if exists "identity_attachments_read"   on storage.objects;
drop policy if exists "identity_attachments_insert" on storage.objects;
drop policy if exists "identity_attachments_update" on storage.objects;
drop policy if exists "identity_attachments_delete" on storage.objects;

create policy "identity_attachments_read" on storage.objects
  for select to authenticated using (bucket_id = 'identity-attachments');
create policy "identity_attachments_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'identity-attachments');
create policy "identity_attachments_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'identity-attachments')
  with check (bucket_id = 'identity-attachments');
create policy "identity_attachments_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'identity-attachments');
