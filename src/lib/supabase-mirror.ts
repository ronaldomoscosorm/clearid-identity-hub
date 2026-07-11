// Espelhamento (cache local) de identidades e definições de campos
// personalizados do ClearID nas tabelas do Supabase. As gravações são
// "best-effort": qualquer falha é logada e nunca interrompe o fluxo principal
// (a API Argus continua sendo a fonte de verdade em runtime).
//
// Schema v2: tabelas compartilhadas entre autenticados (sem user_id).
// - identities: colunas achatadas (root + private + company + system).
// - custom_field_definitions: catálogo global.
// - Os VALORES de campos personalizados por identidade (identity_custom_fields)
//   dependem do vínculo com site_custom_fields e são geridos pela aplicação;
//   aqui o bruto fica preservado em identities.system_custom_fields (jsonb).
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ClearIdIdentity, ClearIdCustomFieldDef } from "./argus-client";

type IdentityInsert = Database["public"]["Tables"]["identities"]["Insert"];
type CfdInsert = Database["public"]["Tables"]["custom_field_definitions"]["Insert"];

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (v == null ? null : String(v));
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));
const int = (v: unknown): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const jsonOrNull = (v: unknown): Json | null => (v == null ? null : (v as Json));

function toIdentityRow(i: ClearIdIdentity): IdentityInsert {
  const root = i as unknown as Record<string, unknown>;
  const priv = rec(i.privateData);
  const comp = rec(i.companyData);
  const sys = rec(i.systemData);

  return {
    account_id: i.accountId ?? null,
    identity_id: i.identityId,
    etag: i.eTag ?? null,
    first_name: i.firstName,
    last_name: i.lastName,
    middle_name: i.middleName ?? null,
    display_name: i.displayName ?? null,
    email: i.email ?? null,
    identity_type: i.identityType ?? null,
    status: i.status ?? "Active",
    description: i.description ?? null,
    country_code: i.countryCode ?? null,
    culture: i.culture ?? null,
    has_vehicles: bool(root.hasVehicles),
    has_licensed_vehicles: bool(root.hasLicensedVehicles),
    created_by: str(root.createdBy),
    creation_date_utc: i.creationDateUtc ?? null,
    creation_on_behalf: str(root.creationOnBehalf),
    last_modified_by: str(root.lastModifiedBy),
    last_modification_date_utc: i.lastModificationDateUtc ?? null,
    ordinal: int(root.ordinal),
    is_deleted: Boolean(root.isDeleted ?? false),

    // privateData
    private_picture_blob_name: str(priv.pictureBlobName),
    private_birthday: str(priv.birthday),
    private_employee_number: str(priv.employeeNumber),
    private_secondary_email: str(priv.secondaryEmail),
    private_city_of_residence: str(priv.cityOfResidence),
    private_state_of_residence: str(priv.stateOfResidence),
    private_zip_code: str(priv.zipCode),
    private_phone_primary: str(priv.phoneNumberPrimary),
    private_phone_secondary: str(priv.phoneNumberSecondary),

    // companyData
    company_name: str(comp.companyName),
    company_job_title: str(comp.jobTitle),
    company_department_name: str(comp.departmentName),
    company_supervisor_name: str(comp.supervisorName),
    company_site_id: str(comp.siteId),
    company_worker_type_code: str(comp.workerTypeCode) ?? i.workerTypeCode ?? null,
    company_worker_type_desc: str(comp.workerTypeDescription),
    company_approvers: jsonOrNull(comp.approvers),

    // systemData
    system_external_id: str(sys.externalId) ?? i.externalId ?? null,
    system_external_sync_source_id: str(sys.externalSyncSourceId),
    system_external_sync_time_utc: str(sys.externalSyncTimeUtc),
    system_horizon_id: str(sys.horizonId),
    system_activation_date_utc: str(sys.activationDateUtc),
    system_expiration_date_utc: str(sys.expirationDateUtc),
    system_has_extended_time: bool(sys.hasExtendedTime),
    system_can_escort: bool(sys.canEscort),
    system_antipassback_exemption: bool(sys.antipassbackExemption),
    system_trigger_code: int(sys.triggerCode),
    system_access_permission_level: int(sys.accessPermissionLevel),
    system_provisioning_attributes: jsonOrNull(sys.provisioningAttributes),
    system_custom_fields: jsonOrNull(sys.customFields),
    system_resource_filters: jsonOrNull(sys.resourceFilters),
  };
}

/** Faz upsert das identidades na tabela `identities` (por identity_id). */
export async function mirrorIdentities(items: ClearIdIdentity[]): Promise<void> {
  if (!items?.length) return;
  const rows = items.filter((i) => i.identityId).map(toIdentityRow);
  if (!rows.length) return;

  const { error } = await supabase
    .from("identities")
    .upsert(rows, { onConflict: "identity_id" });
  if (error) console.error("[mirror] falha ao espelhar identidades:", error.message);
}

/** Faz upsert das definições globais de campos personalizados (por nome). */
export async function mirrorCustomFieldDefs(defs: ClearIdCustomFieldDef[]): Promise<void> {
  if (!defs?.length) return;

  const rows: CfdInsert[] = defs
    .filter((d) => d.customFieldName)
    .map((d) => ({
      custom_field_name: d.customFieldName,
      display_name: (d.displayName ? { default: d.displayName } : {}) as Json,
      custom_field_type: d.customFieldType ?? null,
      is_read_only: d.isReadOnly ?? false,
      synchronization_enabled: d.synchronizationEnabled ?? true,
      is_deleted: d.isDeleted ?? false,
      etag: d.eTag ?? null,
    }));
  if (!rows.length) return;

  const { error } = await supabase
    .from("custom_field_definitions")
    .upsert(rows, { onConflict: "custom_field_name" });
  if (error) console.error("[mirror] falha ao espelhar definições de campos:", error.message);
}
