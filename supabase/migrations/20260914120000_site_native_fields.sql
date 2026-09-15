-- =====================================================================
-- F1 — Campos do site passam a referenciar também os campos NATIVOS do
-- ClearID (básicos / privateData / companyData), além dos customizáveis.
--
-- Uma linha de site_custom_fields (identity) é OU um campo do catálogo
-- (definition_id → custom_field_definitions) OU um campo nativo do ClearID
-- (native_field_key, ex.: 'first_name', 'private_birthday', 'company_job_title').
--
-- Não altera o modelo de níveis (permitido no site × exibido por tipo) — isso
-- vem nas fases seguintes; aqui só habilitamos a origem "campo nativo".
-- =====================================================================

-- 1) Nova origem: chave do campo nativo (nulo quando a linha é do catálogo).
alter table public.site_custom_fields
  add column if not exists native_field_key text;

-- 2) definition_id deixa de ser obrigatório (nulo quando a linha é nativa).
alter table public.site_custom_fields
  alter column definition_id drop not null;

-- 3) Exatamente uma origem por linha: catálogo XOR nativo.
--    (linhas existentes têm definition_id preenchido → passam sem migração.)
alter table public.site_custom_fields
  drop constraint if exists scf_field_source_chk;
alter table public.site_custom_fields
  add constraint scf_field_source_chk check (
    (definition_id is not null and native_field_key is null) or
    (definition_id is null and native_field_key is not null)
  );

-- 4) Unicidade dos campos NATIVOS por (site, campo, tipo de trabalhador),
--    espelhando scf_unique_identity (que cobre os campos do catálogo). Os
--    campos nativos têm definition_id nulo, então não colidem naquele índice.
create unique index if not exists scf_unique_identity_native
  on public.site_custom_fields (site_id, native_field_key, worker_type_id)
  where entity_type = 'identity' and native_field_key is not null;
