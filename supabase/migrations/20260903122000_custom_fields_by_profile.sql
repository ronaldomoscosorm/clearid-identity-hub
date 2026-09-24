-- =====================================================================
-- Escopo por CLIENTE (profile) em custom_field_definitions e
-- custom_field_sections.
--
-- Motivação: cada cliente (RM, Corteva, Vylor) tem seu próprio catálogo
-- de campos e seções. Antes eram globais — permitindo colisão de nomes
-- entre clientes e vazando definições de um cliente pra outro na UI.
--
-- Mudanças:
--   1. Adiciona coluna `profile text not null default 'RM'` em ambas.
--   2. Substitui UNIQUE(custom_field_name)  → UNIQUE(profile, custom_field_name).
--   3. Substitui UNIQUE(section_name)       → UNIQUE(profile, section_name).
--   4. Recria FK cfd_section_fk como composta (profile, section_name).
--
-- Backfill: linhas existentes ficam com profile='RM' (padrão do projeto
-- inicial). Se algum tenant precisar reatribuir, faça UPDATE manual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DROPA a FK antiga PRIMEIRO — ela referencia o UNIQUE que vamos trocar.
-- ---------------------------------------------------------------------
alter table public.custom_field_definitions
  drop constraint if exists cfd_section_fk;

-- ---------------------------------------------------------------------
-- 2) profile em custom_field_sections + novo UNIQUE composto
-- ---------------------------------------------------------------------
alter table public.custom_field_sections
  add column if not exists profile text not null default 'RM';

comment on column public.custom_field_sections.profile is
  'Cliente (perfil ClearID) dono desta seção.';

alter table public.custom_field_sections
  drop constraint if exists custom_field_sections_section_name_key;
alter table public.custom_field_sections
  drop constraint if exists custom_field_sections_profile_section_key;
alter table public.custom_field_sections
  add constraint custom_field_sections_profile_section_key
    unique (profile, section_name);

create index if not exists cfs_profile_idx
  on public.custom_field_sections (profile);

-- ---------------------------------------------------------------------
-- 3) profile em custom_field_definitions + novo UNIQUE composto
-- ---------------------------------------------------------------------
alter table public.custom_field_definitions
  add column if not exists profile text not null default 'RM';

comment on column public.custom_field_definitions.profile is
  'Cliente (perfil ClearID) dono desta definição de campo.';

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_custom_field_name_key;
alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_profile_name_key;
alter table public.custom_field_definitions
  add constraint custom_field_definitions_profile_name_key
    unique (profile, custom_field_name);

create index if not exists cfd_profile_idx
  on public.custom_field_definitions (profile);

-- ---------------------------------------------------------------------
-- 4) RECRIA a FK cfd_section_fk como composta (profile, section_name)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cfd_section_fk'
  ) then
    alter table public.custom_field_definitions
      add constraint cfd_section_fk
        foreign key (profile, section_name)
        references public.custom_field_sections (profile, section_name)
        on update cascade
        on delete set null;
  end if;
end$$;
