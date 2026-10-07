-- =====================================================================
-- Anexos (comprovantes) de EMPRESAS — certidões e suas validades
--
-- Mesmo modelo dos anexos de identidade (identity_attachments):
--   * a certidão é um campo personalizado da empresa (entity_type='company' em
--     site_custom_fields), tipicamente uma DATA com a validade;
--   * a definição do campo com attachment_enabled = true recebe o arquivo da
--     certidão como comprovante (attachment_required torna o arquivo obrigatório);
--   * cada upload gera uma nova VERSÃO (histórico preservado), uma atual por
--     (empresa, definição).
--
-- Os arquivos usam o mesmo bucket privado 'identity-attachments', sob o
-- prefixo 'companies/<company_id>/...' (políticas do bucket já existentes).
-- RLS: mesmo padrão do schema — compartilhado entre usuários autenticados.
-- =====================================================================

create table if not exists public.company_attachments (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies (id) on delete cascade,
  custom_field_definition_id  uuid not null references public.custom_field_definitions (id) on delete cascade,

  version                     integer not null,
  storage_path                text not null,
  file_name                   text not null,
  mime_type                   text not null,
  size_bytes                  bigint not null,
  is_current                  boolean not null default true,

  created_at                  timestamptz not null default now(),

  unique (company_id, custom_field_definition_id, version)
);

comment on table public.company_attachments is
  'Arquivos (certidões/comprovantes) anexados a uma empresa por definição de campo, com versionamento. Uma versão atual por (empresa, campo).';

create index if not exists ca_company_idx on public.company_attachments (company_id);
create index if not exists ca_definition_idx on public.company_attachments (custom_field_definition_id);

create unique index if not exists ca_current_uix
  on public.company_attachments (company_id, custom_field_definition_id)
  where is_current;

alter table public.company_attachments enable row level security;

drop policy if exists "ca_all" on public.company_attachments;
create policy "ca_all" on public.company_attachments
  for all to authenticated using (true) with check (true);
