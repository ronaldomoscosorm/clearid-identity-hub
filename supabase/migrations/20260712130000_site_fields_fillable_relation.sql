-- Campos do site:
-- - fillable: se o campo de identidade pode ser preenchido no cadastro da
--   identity (false = somente leitura na tela).
-- - related_identity_field_id: relaciona um campo da EMPRESA a um campo de
--   IDENTIDADE (o valor do custom da empresa não existe no ClearID; só o da
--   identidade). Usado para os obrigatórios da empresa que dependem da identity.
alter table public.site_custom_fields
  add column if not exists fillable boolean not null default true,
  add column if not exists related_identity_field_id uuid
    references public.site_custom_fields (id) on delete set null;

create index if not exists scf_related_identity_idx
  on public.site_custom_fields (related_identity_field_id);
