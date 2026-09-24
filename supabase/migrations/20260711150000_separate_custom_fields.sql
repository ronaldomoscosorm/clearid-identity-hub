-- =====================================================================
-- Separar campos personalizados por entidade (identity vs company)
--
-- site_custom_fields ganha entity_type ('identity' | 'company'):
--   - identity: exige worker_type_id (campos por tipo de trabalhador)
--   - company : worker_type_id nulo (campos da empresa)
-- Assim empresa e identidade têm catálogos de campos independentes.
-- =====================================================================

alter table public.site_custom_fields
  add column entity_type text not null default 'identity'
    check (entity_type in ('identity', 'company'));

-- worker_type_id passa a ser opcional (só obrigatório para identity).
alter table public.site_custom_fields
  alter column worker_type_id drop not null;

-- Substitui a unicidade única por índices parciais por entidade.
alter table public.site_custom_fields
  drop constraint if exists site_custom_fields_site_def_wt_key;

create unique index scf_unique_identity
  on public.site_custom_fields (site_id, definition_id, worker_type_id)
  where entity_type = 'identity';

create unique index scf_unique_company
  on public.site_custom_fields (site_id, definition_id)
  where entity_type = 'company';

-- Consistência: identity exige worker_type; company não usa worker_type.
alter table public.site_custom_fields
  add constraint scf_entity_worker_chk check (
    (entity_type = 'identity' and worker_type_id is not null) or
    (entity_type = 'company'  and worker_type_id is null)
  );

create index scf_entity_idx on public.site_custom_fields (site_id, entity_type);
