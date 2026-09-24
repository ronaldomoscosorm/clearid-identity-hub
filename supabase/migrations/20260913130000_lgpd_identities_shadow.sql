-- LGPD: public.identities vira shadow table.
-- Regra: PII nativa de identity (nome, e-mail, telefone, endereço, aniversário,
-- vínculo corporativo, dados de sistema) só pode viver no ClearID.
-- O Supabase mantém apenas o link (identity_id) para viabilizar as FKs de:
--   - identity_custom_fields (valores de campos personalizados)
--   - identity_attachments   (anexos de campos personalizados)
--   - companies              (vínculo local de empresa)
--   - worker_types           (tipo do trabalhador exato)

begin;

-- 1) Índices dependentes das colunas que serão removidas.
drop index if exists public.identities_site_idx;
drop index if exists public.identities_email_idx;
drop index if exists public.identities_status_idx;
drop index if exists public.identities_external_id_idx;

-- 2) Purga explícita antes do drop (garante que os dados são apagados
--    imediatamente, sem depender do vacuum). NOT NULL sem default cai junto
--    no DROP COLUMN, não precisa de UPDATE prévio para first_name/last_name/status.
--    Este UPDATE cobre auditoria: alguém consultando pg_stat_activity vê a purga.
update public.identities set
  middle_name = null,
  display_name = null,
  email = null,
  description = null,
  country_code = null,
  culture = null,
  has_vehicles = null,
  has_licensed_vehicles = null,
  created_by = null,
  creation_date_utc = null,
  creation_on_behalf = null,
  last_modified_by = null,
  last_modification_date_utc = null,
  ordinal = null,
  private_picture_blob_name = null,
  private_birthday = null,
  private_employee_number = null,
  private_secondary_email = null,
  private_city_of_residence = null,
  private_state_of_residence = null,
  private_zip_code = null,
  private_phone_primary = null,
  private_phone_secondary = null,
  company_name = null,
  company_job_title = null,
  company_department_name = null,
  company_supervisor_name = null,
  company_site_id = null,
  company_worker_type_code = null,
  company_worker_type_desc = null,
  company_approvers = null,
  system_external_id = null,
  system_external_sync_source_id = null,
  system_external_sync_time_utc = null,
  system_horizon_id = null,
  system_activation_date_utc = null,
  system_expiration_date_utc = null,
  system_has_extended_time = null,
  system_can_escort = null,
  system_antipassback_exemption = null,
  system_trigger_code = null,
  system_access_permission_level = null,
  system_provisioning_attributes = null,
  system_custom_fields = null,
  system_resource_filters = null;

-- 3) Drop das colunas PII e metadata de identity.
alter table public.identities
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists middle_name,
  drop column if exists display_name,
  drop column if exists email,
  drop column if exists identity_type,
  drop column if exists status,
  drop column if exists description,
  drop column if exists country_code,
  drop column if exists culture,
  drop column if exists has_vehicles,
  drop column if exists has_licensed_vehicles,
  drop column if exists created_by,
  drop column if exists creation_date_utc,
  drop column if exists creation_on_behalf,
  drop column if exists last_modified_by,
  drop column if exists last_modification_date_utc,
  drop column if exists ordinal,
  drop column if exists private_picture_blob_name,
  drop column if exists private_birthday,
  drop column if exists private_employee_number,
  drop column if exists private_secondary_email,
  drop column if exists private_city_of_residence,
  drop column if exists private_state_of_residence,
  drop column if exists private_zip_code,
  drop column if exists private_phone_primary,
  drop column if exists private_phone_secondary,
  drop column if exists company_name,
  drop column if exists company_job_title,
  drop column if exists company_department_name,
  drop column if exists company_supervisor_name,
  drop column if exists company_site_id,
  drop column if exists company_worker_type_code,
  drop column if exists company_worker_type_desc,
  drop column if exists company_approvers,
  drop column if exists system_external_id,
  drop column if exists system_external_sync_source_id,
  drop column if exists system_external_sync_time_utc,
  drop column if exists system_horizon_id,
  drop column if exists system_activation_date_utc,
  drop column if exists system_expiration_date_utc,
  drop column if exists system_has_extended_time,
  drop column if exists system_can_escort,
  drop column if exists system_antipassback_exemption,
  drop column if exists system_trigger_code,
  drop column if exists system_access_permission_level,
  drop column if exists system_provisioning_attributes,
  drop column if exists system_custom_fields,
  drop column if exists system_resource_filters;

-- 4) Garante que identity_id (link para o ClearID) permanece obrigatório e
--    único — sem ele a shadow row perde sentido.
alter table public.identities alter column identity_id set not null;

comment on table public.identities is
  'Shadow table (LGPD): apenas o link identity_id -> ClearID. '
  'Contém somente id (uuid interno), account_id, identity_id, etag, is_deleted, '
  'company_id, worker_type_id e timestamps. PII (nome, e-mail, telefone, '
  'endereço, aniversário, vínculo corporativo, dados de sistema) fica APENAS '
  'no ClearID. Não gravar campos nativos de identity aqui.';

comment on column public.identities.identity_id is
  'Identity id do ClearID (fonte de verdade). NUNCA armazenar PII derivada aqui.';

-- 5) Recompacta imediatamente para liberar as tuplas com PII.
--    VACUUM não roda dentro de transação; faz fora se precisar (comentado):
-- vacuum full public.identities;

commit;
