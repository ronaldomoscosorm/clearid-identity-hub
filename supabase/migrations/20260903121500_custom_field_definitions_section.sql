-- =====================================================================
-- Vínculo campo → seção no Supabase.
--
-- A v2 (20260711130000) removeu a coluna section_name de
-- custom_field_definitions porque na época o agrupamento era gerenciado
-- exclusivamente no ClearID (via sections). Agora que seções podem
-- existir SÓ no Supabase (storage='supabase'), o vínculo local volta.
--
-- FK opcional (SET NULL na exclusão da seção) para não quebrar campos
-- órfãos; para storage 'clearid'|'both', a filiação do ClearID continua
-- sendo mantida via updateCustomFieldSection.
-- =====================================================================

alter table public.custom_field_definitions
  add column if not exists section_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cfd_section_fk'
  ) then
    alter table public.custom_field_definitions
      add constraint cfd_section_fk
        foreign key (section_name)
        references public.custom_field_sections (section_name)
        on update cascade
        on delete set null;
  end if;
end$$;

create index if not exists cfd_section_idx
  on public.custom_field_definitions (section_name);
