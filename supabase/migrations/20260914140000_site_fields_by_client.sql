-- =====================================================================
-- Correção conceitual: os "campos do site" na verdade pertencem ao CLIENTE
-- (profile) e valem em TODOS os sites do cliente — como companies,
-- custom_field_definitions e worker_types. Trocamos o escopo de site_id
-- para profile.
--
-- Decisão: RECOMEÇAR (limpar as linhas existentes, que estavam por site) e
-- REMOVER a coluna site_id. A reconfiguração passa a ser por cliente.
-- =====================================================================

begin;

-- 1) Recomeço: as linhas atuais estavam escopadas por site (conceito errado).
delete from public.site_custom_fields;

-- 2) Derruba os índices que referenciam site_id.
drop index if exists public.scf_unique_identity;
drop index if exists public.scf_unique_company;
drop index if exists public.scf_unique_identity_native;
drop index if exists public.scf_allowed_def;
drop index if exists public.scf_allowed_native;
drop index if exists public.scf_entity_idx;

-- 3) Novo escopo por cliente (tabela vazia → NOT NULL sem default é seguro).
--    Idempotente: se já existir (re-execução), não refaz.
alter table public.site_custom_fields
  add column if not exists profile text not null;

-- 4) Remove o escopo antigo por site.
alter table public.site_custom_fields
  drop column if exists site_id;

-- 4.1) Garante o CHECK relaxado (identity pode ter worker_type_id null =
--      "permitido no cliente"). Auto-suficiente: independe de a F3 ter rodado.
alter table public.site_custom_fields
  drop constraint if exists scf_entity_worker_chk;
alter table public.site_custom_fields
  add constraint scf_entity_worker_chk check (
    (entity_type = 'company' and worker_type_id is null) or
    (entity_type = 'identity')
  );

-- 5) Recria os índices por profile (mesma semântica, trocando site_id→profile).
create unique index if not exists scf_unique_identity
  on public.site_custom_fields (profile, definition_id, worker_type_id)
  where entity_type = 'identity';

create unique index if not exists scf_unique_identity_native
  on public.site_custom_fields (profile, native_field_key, worker_type_id)
  where entity_type = 'identity' and native_field_key is not null;

create unique index if not exists scf_unique_company
  on public.site_custom_fields (profile, definition_id)
  where entity_type = 'company';

create unique index if not exists scf_allowed_def
  on public.site_custom_fields (profile, definition_id)
  where entity_type = 'identity' and worker_type_id is null
        and definition_id is not null;

create unique index if not exists scf_allowed_native
  on public.site_custom_fields (profile, native_field_key)
  where entity_type = 'identity' and worker_type_id is null
        and native_field_key is not null;

create index if not exists scf_entity_idx on public.site_custom_fields (profile, entity_type);

commit;
