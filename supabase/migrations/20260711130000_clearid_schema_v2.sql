-- =====================================================================
-- ClearID Identity Hub — schema v2
--
-- Mudanças:
--   * custom_field_definitions vira GLOBAL (sem user_id) — disponível ao app.
--   * site_custom_fields: quais campos personalizados existem por site_id,
--     obrigatoriedade, override de nome (multilíngue) e faixa de valores
--     opcional por tipo.
--   * identities achatada com os campos dos anexos (root + private + company
--     + system); arrays ficam como jsonb.
--   * identity_custom_fields passa a relacionar identities + site_custom_fields.
--   * identity_field_labels: apelidos multilíngues dos campos p/ o frontend.
--   * companies: cadastro próprio, visível por site_id, com campos
--     personalizados via company_custom_fields.
--
-- Convenção multilíngue: colunas jsonb no formato
--   {"pt-BR": "...", "en-US": "...", "default": "..."}
-- O frontend resolve pelo idioma ativo, com fallback para "default".
--
-- RLS: tabelas de domínio são compartilhadas entre usuários AUTENTICADOS
-- (o filtro por site_id é feito na aplicação). A tabela `settings` (config +
-- branding por usuário) permanece inalterada.
-- =====================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Remove tabelas de domínio da v1 (ordem de dependência). settings é mantida.
drop table if exists public.identity_custom_fields cascade;
drop table if exists public.custom_field_definitions cascade;
drop table if exists public.identities cascade;

-- ---------------------------------------------------------------------
-- 1) CUSTOM_FIELD_DEFINITIONS  (GLOBAL — sem user_id)
-- ---------------------------------------------------------------------
create table public.custom_field_definitions (
  id                       uuid primary key default gen_random_uuid(),
  custom_field_name        text not null unique,        -- identificador (customFieldName)
  display_name             jsonb not null default '{}'::jsonb,  -- multilíngue
  custom_field_type        text,                        -- String | Number | Date | Boolean | List...
  is_read_only             boolean not null default false,
  synchronization_enabled  boolean not null default true,
  is_deleted               boolean not null default false,
  etag                     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.custom_field_definitions is 'Catálogo global de campos personalizados (disponível a todo o app).';

create trigger cfd_set_updated_at
  before update on public.custom_field_definitions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2) SITE_CUSTOM_FIELDS  (quais campos existem por site + config)
-- ---------------------------------------------------------------------
create table public.site_custom_fields (
  id                     uuid primary key default gen_random_uuid(),
  site_id                text not null,
  definition_id          uuid not null references public.custom_field_definitions (id) on delete cascade,

  is_required            boolean not null default false,     -- obrigatório para o site
  display_name_override  jsonb not null default '{}'::jsonb, -- multilíngue: altera o nome do campo no site
  value_range            jsonb,                              -- opcional; formato depende do tipo:
                                                             --   Number: {"min":0,"max":100}
                                                             --   Date:   {"min":"2020-01-01","max":"2030-12-31"}
                                                             --   List:   {"options":[{"value":"A","label":{"pt-BR":"..."}}]}
  display_index          integer,
  is_active              boolean not null default true,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (site_id, definition_id)
);

comment on table public.site_custom_fields is 'Campos personalizados disponíveis por site (obrigatoriedade, nome multilíngue, faixa de valores).';
comment on column public.site_custom_fields.value_range is 'Faixa/intervalo opcional de valores, conforme o tipo do campo. Nulo = sem restrição.';

create index scf_site_idx       on public.site_custom_fields (site_id);
create index scf_definition_idx on public.site_custom_fields (definition_id);

create trigger scf_set_updated_at
  before update on public.site_custom_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) IDENTITIES  (campos dos anexos — colunas achatadas)
-- ---------------------------------------------------------------------
create table public.identities (
  id                          uuid primary key default gen_random_uuid(),

  -- Raiz (dados principais)
  account_id                  text,                       -- Tenant
  identity_id                 text unique,                -- ID único no ClearID
  etag                        text,                       -- concorrência otimista (PUT)
  first_name                  text not null,
  last_name                   text not null,
  middle_name                 text,
  display_name                text,
  email                       text,
  identity_type               text,                       -- Employee, Visitor...
  status                      text not null default 'Active',  -- Active | Inactive
  description                 text,
  country_code                text,                       -- BRA
  culture                     text,                       -- pt-BR
  has_vehicles                boolean,
  has_licensed_vehicles       boolean,
  created_by                  text,
  creation_date_utc           timestamptz,
  creation_on_behalf          text,
  last_modified_by            text,
  last_modification_date_utc  timestamptz,
  ordinal                     integer,
  is_deleted                  boolean not null default false,

  -- privateData (dados pessoais)
  private_picture_blob_name   text,                       -- foto (read-only)
  private_birthday            date,
  private_employee_number     text,
  private_secondary_email     text,
  private_city_of_residence   text,
  private_state_of_residence  text,
  private_zip_code            text,
  private_phone_primary       text,
  private_phone_secondary     text,

  -- companyData (vínculo corporativo)
  company_name                text,
  company_job_title           text,
  company_department_name     text,
  company_supervisor_name     text,
  company_site_id             text,                       -- site primário
  company_worker_type_code    text,
  company_worker_type_desc    text,
  company_approvers           jsonb,                      -- [{ approverId }]

  -- systemData (controle de acesso / sincronização)
  system_external_id            text,                     -- chave imutável do sistema de origem
  system_external_sync_source_id text,
  system_external_sync_time_utc timestamptz,
  system_horizon_id             text,                     -- read-only
  system_activation_date_utc    timestamptz,
  system_expiration_date_utc    timestamptz,
  system_has_extended_time      boolean,
  system_can_escort             boolean,
  system_antipassback_exemption boolean,
  system_trigger_code           integer,
  system_access_permission_level integer,
  system_provisioning_attributes jsonb,                   -- [{ name, externalSyncSourceId }]
  system_custom_fields          jsonb,                    -- [{ customFieldType, customFieldName, customFieldValue }] (bruto)
  system_resource_filters       jsonb,                    -- [{ entityId, entityType, sourceId, uniqueKey }]

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.identities is 'Identidades (espelho do ClearID) — campos achatados conforme o modelo do Identity Service.';

create index identities_site_idx        on public.identities (company_site_id);
create index identities_email_idx       on public.identities (email);
create index identities_status_idx      on public.identities (status);
create index identities_external_id_idx on public.identities (system_external_id);

create trigger identities_set_updated_at
  before update on public.identities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4) IDENTITY_FIELD_LABELS  (apelidos multilíngues dos campos p/ frontend)
-- ---------------------------------------------------------------------
create table public.identity_field_labels (
  id             uuid primary key default gen_random_uuid(),
  field_key      text not null unique,                    -- ex.: first_name, private_birthday, company_job_title
  alias          jsonb not null default '{}'::jsonb,      -- multilíngue: {"pt-BR":"Apelido","en-US":"Nickname"}
  display_index  integer,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.identity_field_labels is 'Apelidos/rótulos multilíngues para os campos de identity exibidos no frontend.';

create trigger ifl_set_updated_at
  before update on public.identity_field_labels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5) IDENTITY_CUSTOM_FIELDS  (valores) → identities + site_custom_fields
-- ---------------------------------------------------------------------
create table public.identity_custom_fields (
  id                    uuid primary key default gen_random_uuid(),
  identity_id           uuid not null references public.identities (id) on delete cascade,
  site_custom_field_id  uuid not null references public.site_custom_fields (id) on delete cascade,
  value                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (identity_id, site_custom_field_id)
);

comment on table public.identity_custom_fields is 'Valores de campos personalizados por identidade, vinculados ao campo do site.';

create index icf_identity_idx on public.identity_custom_fields (identity_id);
create index icf_scf_idx      on public.identity_custom_fields (site_custom_field_id);

create trigger icf_set_updated_at
  before update on public.identity_custom_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6) COMPANIES  (cadastro próprio — visível por site_id)
-- ---------------------------------------------------------------------
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  site_id      text not null,
  name         text not null,
  legal_name   text,
  tax_id       text,                      -- CNPJ
  description  text,
  status       text not null default 'Active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (site_id, tax_id)
);

comment on table public.companies is 'Empresas — cadastro próprio, escopado por site_id.';

create index companies_site_idx on public.companies (site_id);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7) COMPANY_CUSTOM_FIELDS  (valores) → companies + site_custom_fields
-- ---------------------------------------------------------------------
create table public.company_custom_fields (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  site_custom_field_id  uuid not null references public.site_custom_fields (id) on delete cascade,
  value                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, site_custom_field_id)
);

comment on table public.company_custom_fields is 'Valores de campos personalizados por empresa, vinculados ao campo do site.';

create index ccf_company_idx on public.company_custom_fields (company_id);
create index ccf_scf_idx     on public.company_custom_fields (site_custom_field_id);

create trigger ccf_set_updated_at
  before update on public.company_custom_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — compartilhado entre usuários autenticados
-- ---------------------------------------------------------------------
alter table public.custom_field_definitions enable row level security;
alter table public.site_custom_fields       enable row level security;
alter table public.identities               enable row level security;
alter table public.identity_field_labels    enable row level security;
alter table public.identity_custom_fields   enable row level security;
alter table public.companies                enable row level security;
alter table public.company_custom_fields    enable row level security;

create policy "cfd_all"  on public.custom_field_definitions for all to authenticated using (true) with check (true);
create policy "scf_all"  on public.site_custom_fields       for all to authenticated using (true) with check (true);
create policy "idt_all"  on public.identities               for all to authenticated using (true) with check (true);
create policy "ifl_all"  on public.identity_field_labels    for all to authenticated using (true) with check (true);
create policy "icf_all"  on public.identity_custom_fields   for all to authenticated using (true) with check (true);
create policy "cmp_all"  on public.companies                for all to authenticated using (true) with check (true);
create policy "ccf_all"  on public.company_custom_fields    for all to authenticated using (true) with check (true);
