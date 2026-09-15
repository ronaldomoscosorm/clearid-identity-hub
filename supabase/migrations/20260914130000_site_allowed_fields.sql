-- =====================================================================
-- F3 — Dois níveis em Campos do site (identity):
--   - worker_type_id IS NULL  → campo PERMITIDO no site (pool p/ o layout)
--   - worker_type_id = <tipo>  → campo EXIBIDO para aquele tipo de trabalhador
--
-- Antes, o CHECK exigia worker_type_id NOT NULL para identity. Relaxamos para
-- permitir o nível "permitido no site" (worker_type_id null).
-- =====================================================================

-- 1) Relaxa a regra de consistência entidade × tipo de trabalhador.
alter table public.site_custom_fields
  drop constraint if exists scf_entity_worker_chk;
alter table public.site_custom_fields
  add constraint scf_entity_worker_chk check (
    (entity_type = 'company' and worker_type_id is null) or
    (entity_type = 'identity')
  );

-- 2) Unicidade do POOL "permitido no site" (worker_type_id null), por origem:
--    catálogo (definition_id) e nativo (native_field_key).
create unique index if not exists scf_allowed_def
  on public.site_custom_fields (site_id, definition_id)
  where entity_type = 'identity' and worker_type_id is null
        and definition_id is not null;

create unique index if not exists scf_allowed_native
  on public.site_custom_fields (site_id, native_field_key)
  where entity_type = 'identity' and worker_type_id is null
        and native_field_key is not null;
