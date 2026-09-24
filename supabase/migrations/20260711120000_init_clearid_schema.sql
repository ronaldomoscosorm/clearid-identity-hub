-- =====================================================================
-- ClearID Identity Hub — schema inicial
-- Configurações, Identidades e Campos Personalizados
-- Escopo por usuário (RLS): cada usuário autenticado só acessa os
-- próprios registros (auth.uid() = user_id).
-- =====================================================================

create extension if not exists "pgcrypto";

-- Trigger util: mantém updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) CONFIGURAÇÕES  (uma linha por usuário)
--    Substitui o que hoje fica em localStorage:
--    argus.config (ArgusEnvConfig) + argus.branding (BrandingConfig)
-- ---------------------------------------------------------------------
create table public.settings (
  user_id            uuid primary key default auth.uid()
                       references auth.users (id) on delete cascade,

  -- Conexão ArgusClearId.Api
  argus_base_url     text not null default 'https://argusclearidapi.rmtecho.com.br',
  argus_api_key      text,                    -- credencial / bearer (SENSÍVEL)
  default_site_id    text,
  default_site_name  text,
  system_object_id   text,
  account_id         text,

  -- Branding (white-label por cliente)
  client_name        text not null default '',
  client_logo        text not null default '', -- data URL ou URL http
  primary_color      text not null default '#1e3a5f',
  accent_color       text not null default '#3b6fa0',

  -- Extensões futuras sem alterar schema
  preferences        jsonb not null default '{}'::jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table  public.settings                is 'Configurações por usuário: conexão Argus + branding.';
comment on column public.settings.argus_api_key  is 'Credencial do backend Argus. Sensível — protegido por RLS.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2) IDENTIDADES  (espelho local do ClearID Identity Service)
--    Fiel ao DTO ClearIdIdentity / IdentityUpsert.
-- ---------------------------------------------------------------------
create table public.identities (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid()
                                references auth.users (id) on delete cascade,

  -- Chaves ClearID
  identity_id                 text,       -- identityId no ClearID (nulo até sincronizar)
  external_id                 text,
  account_id                  text,
  site_id                     text,
  etag                        text,

  -- Dados principais
  status                      text not null default 'Active',  -- Active | Inactive
  first_name                  text not null,
  last_name                   text not null,
  middle_name                 text,
  display_name                text,
  email                       text,
  identity_type               text,
  worker_type_code            text,
  country_code                text,
  culture                     text,
  description                 text,
  score                       numeric,

  -- Blobs estruturados do ClearID
  private_data                jsonb,
  company_data                jsonb,
  system_data                 jsonb,
  picture                     jsonb,

  -- Auditoria vinda do ClearID
  creation_date_utc           timestamptz,
  last_modification_date_utc  timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (user_id, identity_id)
);

comment on table public.identities is 'Identidades — espelho local do ClearID Identity Service.';

create index identities_user_idx        on public.identities (user_id);
create index identities_external_id_idx on public.identities (user_id, external_id);
create index identities_email_idx       on public.identities (user_id, email);
create index identities_status_idx      on public.identities (user_id, status);

create trigger identities_set_updated_at
  before update on public.identities
  for each row execute function public.set_updated_at();

alter table public.identities enable row level security;

create policy "identities_select_own" on public.identities
  for select using (auth.uid() = user_id);
create policy "identities_insert_own" on public.identities
  for insert with check (auth.uid() = user_id);
create policy "identities_update_own" on public.identities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "identities_delete_own" on public.identities
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3) CAMPOS PERSONALIZADOS — definições
--    Fiel a ClearIdCustomFieldDef + ClearIdCustomFieldSection.
-- ---------------------------------------------------------------------
create table public.custom_field_definitions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid()
                             references auth.users (id) on delete cascade,

  custom_field_name        text not null,   -- identificador (customFieldName)
  display_name             text,
  custom_field_type        text,            -- String | Number | Date | Boolean...
  section_name             text,            -- agrupamento (ClearIdCustomFieldSection)
  display_index            integer,         -- ordem dentro da seção
  is_read_only             boolean not null default false,
  synchronization_enabled  boolean not null default true,
  is_deleted               boolean not null default false,
  etag                     text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (user_id, custom_field_name)
);

comment on table public.custom_field_definitions is 'Definições de campos personalizados das identities.';

create index cfd_user_idx    on public.custom_field_definitions (user_id);
create index cfd_section_idx on public.custom_field_definitions (user_id, section_name, display_index);

create trigger cfd_set_updated_at
  before update on public.custom_field_definitions
  for each row execute function public.set_updated_at();

alter table public.custom_field_definitions enable row level security;

create policy "cfd_select_own" on public.custom_field_definitions
  for select using (auth.uid() = user_id);
create policy "cfd_insert_own" on public.custom_field_definitions
  for insert with check (auth.uid() = user_id);
create policy "cfd_update_own" on public.custom_field_definitions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cfd_delete_own" on public.custom_field_definitions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4) CAMPOS PERSONALIZADOS — valores por identidade
--    Fiel a ClearIdCustomField / CustomFieldPatchValue.
-- ---------------------------------------------------------------------
create table public.identity_custom_fields (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid()
                       references auth.users (id) on delete cascade,
  identity_id        uuid not null references public.identities (id) on delete cascade,
  definition_id      uuid references public.custom_field_definitions (id) on delete set null,

  custom_field_name  text not null,   -- redundante: cobre valor sem definição e agiliza consulta
  custom_field_value text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (identity_id, custom_field_name)
);

comment on table public.identity_custom_fields is 'Valores de campos personalizados por identidade.';

create index icf_identity_idx on public.identity_custom_fields (identity_id);
create index icf_user_idx     on public.identity_custom_fields (user_id);

create trigger icf_set_updated_at
  before update on public.identity_custom_fields
  for each row execute function public.set_updated_at();

alter table public.identity_custom_fields enable row level security;

create policy "icf_select_own" on public.identity_custom_fields
  for select using (auth.uid() = user_id);
create policy "icf_insert_own" on public.identity_custom_fields
  for insert with check (auth.uid() = user_id);
create policy "icf_update_own" on public.identity_custom_fields
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "icf_delete_own" on public.identity_custom_fields
  for delete using (auth.uid() = user_id);
