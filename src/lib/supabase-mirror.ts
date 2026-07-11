// Espelhamento (cache local) de identidades e campos personalizados do ClearID
// nas tabelas do Supabase. As gravações são "best-effort": qualquer falha é
// logada e nunca interrompe o fluxo principal (a API Argus continua sendo a
// fonte de verdade em runtime).
import { supabase } from "@/integrations/supabase/client";
import type { ClearIdIdentity, ClearIdCustomFieldDef } from "./argus-client";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function toIdentityRow(userId: string, i: ClearIdIdentity) {
  return {
    user_id: userId,
    identity_id: i.identityId,
    external_id: i.externalId ?? i.systemData?.externalId ?? null,
    account_id: i.accountId ?? null,
    etag: i.eTag ?? null,
    status: i.status ?? "Active",
    first_name: i.firstName,
    last_name: i.lastName,
    middle_name: i.middleName ?? null,
    display_name: i.displayName ?? null,
    email: i.email ?? null,
    identity_type: i.identityType ?? null,
    worker_type_code: i.workerTypeCode ?? null,
    country_code: i.countryCode ?? null,
    culture: i.culture ?? null,
    description: i.description ?? null,
    score: i.score ?? null,
    private_data: (i.privateData ?? null) as never,
    company_data: (i.companyData ?? null) as never,
    system_data: (i.systemData ?? null) as never,
    picture: (i.picture ?? null) as never,
    creation_date_utc: i.creationDateUtc ?? null,
    last_modification_date_utc: i.lastModificationDateUtc ?? null,
  };
}

/**
 * Faz upsert das identidades e dos respectivos valores de campos personalizados
 * (extraídos de systemData.customFields) nas tabelas do Supabase.
 */
export async function mirrorIdentities(items: ClearIdIdentity[]): Promise<void> {
  if (!items?.length) return;
  const userId = await currentUserId();
  if (!userId) return;

  const rows = items.filter((i) => i.identityId).map((i) => toIdentityRow(userId, i));
  if (!rows.length) return;

  const { data, error } = await supabase
    .from("identities")
    .upsert(rows, { onConflict: "user_id,identity_id" })
    .select("id, identity_id");

  if (error) {
    console.error("[mirror] falha ao espelhar identidades:", error.message);
    return;
  }

  // Mapeia identityId -> uuid local para gravar os valores de campos.
  const idByIdentityId = new Map<string, string>();
  for (const r of data ?? []) if (r.identity_id) idByIdentityId.set(r.identity_id, r.id);

  const cfRows: {
    user_id: string;
    identity_id: string;
    custom_field_name: string;
    custom_field_value: string | null;
  }[] = [];

  for (const i of items) {
    const localId = i.identityId ? idByIdentityId.get(i.identityId) : undefined;
    const fields = i.systemData?.customFields;
    if (!localId || !fields?.length) continue;
    for (const f of fields) {
      if (!f.customFieldName) continue;
      cfRows.push({
        user_id: userId,
        identity_id: localId,
        custom_field_name: f.customFieldName,
        custom_field_value: f.customFieldValue ?? null,
      });
    }
  }

  if (cfRows.length) {
    const { error: cfErr } = await supabase
      .from("identity_custom_fields")
      .upsert(cfRows, { onConflict: "identity_id,custom_field_name" });
    if (cfErr) console.error("[mirror] falha ao espelhar valores de campos:", cfErr.message);
  }
}

/** Faz upsert das definições de campos personalizados. */
export async function mirrorCustomFieldDefs(defs: ClearIdCustomFieldDef[]): Promise<void> {
  if (!defs?.length) return;
  const userId = await currentUserId();
  if (!userId) return;

  const rows = defs
    .filter((d) => d.customFieldName)
    .map((d) => ({
      user_id: userId,
      custom_field_name: d.customFieldName,
      display_name: d.displayName ?? null,
      custom_field_type: d.customFieldType ?? null,
      is_read_only: d.isReadOnly ?? false,
      synchronization_enabled: d.synchronizationEnabled ?? true,
      is_deleted: d.isDeleted ?? false,
      etag: d.eTag ?? null,
    }));
  if (!rows.length) return;

  const { error } = await supabase
    .from("custom_field_definitions")
    .upsert(rows, { onConflict: "user_id,custom_field_name" });
  if (error) console.error("[mirror] falha ao espelhar definições de campos:", error.message);
}
