// Shadow (LGPD) de identidades no Supabase.
//
// A tabela `public.identities` NÃO contém mais PII: só o link identity_id (do
// ClearID) + metadados locais (company_id, worker_type_id). PII nativa (nome,
// e-mail, telefone, endereço, aniversário, vínculo corporativo, systemData)
// vive apenas no ClearID e é buscada em runtime por lá.
//
// A shadow row precisa existir para viabilizar as FKs de:
//   - identity_custom_fields (valores de campos personalizados)
//   - identity_attachments   (anexos de campos personalizados)
//   - companies              (vínculo local)
//   - worker_types           (tipo do trabalhador exato)
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ClearIdIdentity, ClearIdCustomFieldDef } from "./argus-client";

type IdentityInsert = Database["public"]["Tables"]["identities"]["Insert"];

function toShadowRow(i: ClearIdIdentity): IdentityInsert {
  const root = i as unknown as Record<string, unknown>;
  return {
    account_id: i.accountId ?? null,
    identity_id: i.identityId,
    etag: i.eTag ?? null,
    is_deleted: Boolean(root.isDeleted ?? false),
  };
}

/**
 * Cria/atualiza a shadow row da identidade no Supabase (só o link identity_id
 * e metadados leves; nenhum campo de PII).
 *
 * LANÇA em caso de erro — a saga de compensação (create/update identity)
 * depende do throw. Listagens/cache passivos devem envolver em try/catch.
 */
export async function mirrorIdentities(items: ClearIdIdentity[]): Promise<void> {
  if (!items?.length) return;
  const rows = items.filter((i) => i.identityId).map(toShadowRow);
  if (!rows.length) return;

  const { error } = await supabase
    .from("identities")
    .upsert(rows, { onConflict: "identity_id" });
  if (error) throw new Error(`Falha ao criar shadow da identidade: ${error.message}`);
}

export type SiteFieldValue = { site_custom_field_id: string; value: string | null };

/**
 * Grava o vínculo da identidade com uma empresa (company_id) no Supabase.
 * LANÇA em caso de erro.
 */
export async function saveIdentityCompany(
  clearIdIdentityId: string,
  companyId: string | null,
): Promise<void> {
  if (!clearIdIdentityId) return;
  const { error } = await supabase
    .from("identities")
    .update({ company_id: companyId })
    .eq("identity_id", clearIdIdentityId);
  if (error) throw new Error(`Falha ao gravar empresa da identidade: ${error.message}`);
}

/**
 * Grava o tipo do trabalhador EXATO (worker_type_id) da identidade no Supabase.
 * Necessário porque o workerTypeCode do Argus não distingue Visitante de Terceiro
 * (ambos "Terceiros"); este valor garante o round-trip correto na edição.
 * LANÇA em caso de erro — o worker_type só existe no Supabase; perder essa
 * gravação corrompe a semântica de tipo.
 */
export async function saveIdentityWorkerType(
  clearIdIdentityId: string,
  workerTypeId: string | null,
): Promise<void> {
  if (!clearIdIdentityId) return;
  const { error } = await supabase
    .from("identities")
    .update({ worker_type_id: workerTypeId })
    .eq("identity_id", clearIdIdentityId);
  if (error) throw new Error(`Falha ao gravar tipo do trabalhador: ${error.message}`);
}

/**
 * Grava os valores dos campos personalizados de uma identidade na tabela
 * identity_custom_fields (vinculados aos campos do site). A identidade precisa
 * já estar espelhada em `identities` (chame mirrorIdentities antes).
 */
export async function saveIdentityCustomFields(
  clearIdIdentityId: string,
  values: SiteFieldValue[],
): Promise<void> {
  if (!clearIdIdentityId || !values?.length) return;

  const { data: idRow, error: e1 } = await supabase
    .from("identities")
    .select("id")
    .eq("identity_id", clearIdIdentityId)
    .maybeSingle();
  if (e1 || !idRow) {
    if (e1) console.error("[mirror] identidade não encontrada p/ campos:", e1.message);
    return;
  }

  const rows = values.map((v) => ({
    identity_id: idRow.id,
    site_custom_field_id: v.site_custom_field_id,
    value: v.value,
  }));
  const { error } = await supabase
    .from("identity_custom_fields")
    .upsert(rows, { onConflict: "identity_id,site_custom_field_id" });
  if (error) console.error("[mirror] falha ao gravar campos da identidade:", error.message);
}

/**
 * Lê os valores dos campos personalizados de uma identidade gravados no Supabase
 * (identity_custom_fields), devolvendo um mapa `custom_field_name → value`. Usado
 * para exibir no formulário os campos storage='supabase' (que não existem no
 * ClearID) e os espelhados. Best-effort: em erro devolve mapa vazio.
 */
export async function loadIdentityCustomFields(
  clearIdIdentityId: string,
): Promise<Record<string, string>> {
  if (!clearIdIdentityId) return {};
  const { data: idRow, error: e1 } = await supabase
    .from("identities")
    .select("id")
    .eq("identity_id", clearIdIdentityId)
    .maybeSingle();
  if (e1 || !idRow) return {};

  const { data, error } = await supabase
    .from("identity_custom_fields")
    .select("value, site_custom_fields(custom_field_definitions(custom_field_name))")
    .eq("identity_id", idRow.id);
  if (error || !data) return {};

  const rows = data as unknown as Array<{
    value: string | null;
    site_custom_fields: {
      custom_field_definitions: { custom_field_name: string | null } | null;
    } | null;
  }>;
  const out: Record<string, string> = {};
  for (const r of rows) {
    const name = r.site_custom_fields?.custom_field_definitions?.custom_field_name;
    if (name && r.value != null) out[name] = r.value;
  }
  return out;
}

/**
 * DESATIVADO: o espelhamento das definições de campos para o Supabase agora é
 * responsabilidade do backend unificado (`/api/custom-fields`, source=all, via
 * SupabaseCustomFieldRepository). No-op para não escrever no Supabase pelo
 * bundle público.
 */
export async function mirrorCustomFieldDefs(_defs: ClearIdCustomFieldDef[]): Promise<void> {
  return;
}
