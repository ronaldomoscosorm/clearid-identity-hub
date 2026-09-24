-- =====================================================================
-- Seções de campos personalizados (agrupamento).
--
-- Espelha o conceito de "IdentityCustomFieldsSection" do Genetec ClearID
-- mas com storage triplo — igual à coluna storage em custom_field_definitions:
--   - 'clearid'  → seção existe só no PIAM
--   - 'supabase' → seção existe só localmente
--   - 'both'     → seção existe nos dois
--
-- Regra de compatibilidade (aplicada no frontend, não no banco):
--   - campo 'clearid'  ⇢ seção 'clearid'  ou 'both'
--   - campo 'supabase' ⇢ seção 'supabase' ou 'both'
--   - campo 'both'     ⇢ seção 'both'
-- =====================================================================

create table if not exists public.custom_field_sections (
  id             uuid primary key default gen_random_uuid(),
  section_name   text not null unique,
  display_name   text not null,
  display_index  integer not null default 0,
  storage        text not null default 'both'
    check (storage in ('clearid','supabase','both')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table  public.custom_field_sections is
  'Seções de agrupamento dos campos personalizados. Casa com sectionName do ClearID.';
comment on column public.custom_field_sections.storage is
  'Onde a seção é gravada: clearid | supabase | both.';

create index if not exists cfs_storage_idx on public.custom_field_sections (storage);
create index if not exists cfs_index_idx   on public.custom_field_sections (display_index);

create trigger custom_field_sections_set_updated_at
  before update on public.custom_field_sections
  for each row execute function public.set_updated_at();

alter table public.custom_field_sections enable row level security;

create policy "cfs_all" on public.custom_field_sections
  for all to authenticated using (true) with check (true);
