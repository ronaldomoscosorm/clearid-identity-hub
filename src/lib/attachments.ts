// Anexos versionados de campos personalizados (tipo "Anexo").
//
// O Argus não armazena arquivos; os anexos vivem só no sistema:
//   * arquivos no Supabase Storage (bucket privado `identity-attachments`);
//   * cada upload cria uma nova VERSÃO em `identity_attachments`, marcando a
//     anterior como não-atual (histórico preservado, download por URL assinada).
//
// O anexo é vinculado à DEFINIÇÃO do campo personalizado (sistema) —
// custom_field_definition_id — ficando único por (identidade, definição),
// independente do site.
//
// Como o vínculo é com identities.id (uuid do Supabase), o upload só acontece
// depois que a identidade já foi espelhada (mirrorIdentities) — no cadastro
// novo, os arquivos ficam "pendentes" no formulário e são enviados no onSuccess.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export const ATTACHMENT_BUCKET = "identity-attachments";

export type AttachmentVersion = Database["public"]["Tables"]["identity_attachments"]["Row"];
export type CompanyAttachmentVersion = Database["public"]["Tables"]["company_attachments"]["Row"];
/** Campos comuns às versões de anexo (identidade ou empresa), usados na UI. */
export type AttachmentVersionLike = Pick<
  AttachmentVersion,
  "id" | "file_name" | "storage_path" | "mime_type" | "size_bytes" | "created_at" | "version" | "is_current"
>;

/** Arquivo preparado no formulário, aguardando upload após a criação. */
export type PendingAttachment = { custom_field_definition_id: string; file: File };

/** Extensão do arquivo a partir do nome (fallback: bin). */
function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  const ext = i >= 0 ? name.slice(i + 1) : "";
  return ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
}

/** Resolve o identities.id (uuid) a partir do identityId (texto) do ClearID. */
export async function resolveIdentityDbId(clearIdIdentityId: string): Promise<string | null> {
  if (!clearIdIdentityId) return null;
  const { data, error } = await supabase
    .from("identities")
    .select("id")
    .eq("identity_id", clearIdIdentityId)
    .maybeSingle();
  if (error) {
    console.error("[attachments] identidade não encontrada:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Lista as versões de um anexo (mais recente primeiro). */
export async function listAttachmentVersions(
  identityDbId: string,
  customFieldDefinitionId: string,
): Promise<AttachmentVersion[]> {
  const { data, error } = await supabase
    .from("identity_attachments")
    .select("*")
    .eq("identity_id", identityDbId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Gera uma URL assinada temporária para baixar/visualizar um objeto do bucket. */
export async function signedUrlFor(storagePath: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Falha ao gerar link do arquivo.");
  }
  return data.signedUrl;
}

/**
 * Envia um arquivo como uma nova versão do anexo. Marca a versão anterior como
 * não-atual antes de inserir a nova (o índice parcial garante 1 atual por campo).
 */
export async function uploadAttachmentVersion(
  identityDbId: string,
  customFieldDefinitionId: string,
  file: File,
): Promise<AttachmentVersion> {
  // Próxima versão = maior atual + 1.
  const { data: last, error: eLast } = await supabase
    .from("identity_attachments")
    .select("version")
    .eq("identity_id", identityDbId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eLast) throw new Error(eLast.message);
  const nextVersion = (last?.version ?? 0) + 1;

  const path = `${identityDbId}/${customFieldDefinitionId}/v${nextVersion}-${crypto.randomUUID()}.${extOf(file.name)}`;

  const { error: eUp } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (eUp) throw new Error(eUp.message);

  // Zera a versão atual anterior (respeita o índice único parcial de "atual").
  const { error: eClear } = await supabase
    .from("identity_attachments")
    .update({ is_current: false })
    .eq("identity_id", identityDbId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .eq("is_current", true);
  if (eClear) {
    // Desfaz o upload para não deixar objeto órfão.
    await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove([path])
      .catch(() => {});
    throw new Error(eClear.message);
  }

  const { data: row, error: eIns } = await supabase
    .from("identity_attachments")
    .insert({
      identity_id: identityDbId,
      custom_field_definition_id: customFieldDefinitionId,
      version: nextVersion,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      is_current: true,
    })
    .select("*")
    .single();
  if (eIns || !row) {
    await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove([path])
      .catch(() => {});
    throw new Error(eIns?.message ?? "Falha ao registrar o anexo.");
  }
  return row;
}

/**
 * Envia os anexos pendentes de um formulário (best-effort). Resolve o id da
 * identidade e sobe cada arquivo como nova versão. Retorna a lista de campos
 * que falharam (custom_field_definition_id) para o chamador reportar.
 */
export async function saveIdentityAttachments(
  clearIdIdentityId: string,
  pending: PendingAttachment[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  if (!clearIdIdentityId || !pending.length) return { failed };

  const identityDbId = await resolveIdentityDbId(clearIdIdentityId);
  if (!identityDbId) {
    return { failed: pending.map((p) => p.custom_field_definition_id) };
  }

  for (const p of pending) {
    try {
      await uploadAttachmentVersion(identityDbId, p.custom_field_definition_id, p.file);
    } catch (e) {
      console.error("[attachments] falha ao enviar anexo:", (e as Error).message);
      failed.push(p.custom_field_definition_id);
    }
  }
  return { failed };
}

/** Anexo atual (uma versão vigente) com o rótulo do campo ao qual pertence. */
export type CurrentAttachment = AttachmentVersion & {
  definition: { custom_field_name: string; display_name: Json } | null;
};

/** Lista os anexos ATUAIS (is_current) de uma identidade, com o campo de origem. */
export async function listCurrentAttachments(identityDbId: string): Promise<CurrentAttachment[]> {
  const { data, error } = await supabase
    .from("identity_attachments")
    .select("*, definition:custom_field_definitions(custom_field_name, display_name)")
    .eq("identity_id", identityDbId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .returns<CurrentAttachment[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Hook: anexos atuais de uma identidade a partir do identityId (texto) do ClearID.
 * Resolve o id no Supabase (espelhado) e lista os comprovantes vigentes.
 */
export function useCurrentAttachments(clearIdIdentityId: string | null | undefined) {
  return useQuery({
    queryKey: ["identity-current-attachments", clearIdIdentityId],
    queryFn: async (): Promise<CurrentAttachment[]> => {
      const dbId = await resolveIdentityDbId(clearIdIdentityId as string);
      if (!dbId) return [];
      return listCurrentAttachments(dbId);
    },
    enabled: Boolean(clearIdIdentityId),
  });
}

/** Hook: versões de um anexo para uma identidade já existente (modo edição). */
export function useAttachmentVersions(
  identityDbId: string | null | undefined,
  customFieldDefinitionId: string,
) {
  return useQuery({
    queryKey: ["identity-attachments", identityDbId, customFieldDefinitionId],
    queryFn: () => listAttachmentVersions(identityDbId as string, customFieldDefinitionId),
    enabled: Boolean(identityDbId && customFieldDefinitionId),
  });
}

// ---------------------------------------------------------------------------
// Anexos de EMPRESAS (certidões/comprovantes) — mesmo modelo versionado, na
// tabela company_attachments e no mesmo bucket, sob o prefixo companies/<id>/.
// ---------------------------------------------------------------------------

/** Lista as versões de um anexo da empresa (mais recente primeiro). */
export async function listCompanyAttachmentVersions(
  companyId: string,
  customFieldDefinitionId: string,
): Promise<CompanyAttachmentVersion[]> {
  const { data, error } = await supabase
    .from("company_attachments")
    .select("*")
    .eq("company_id", companyId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Envia um arquivo como nova versão do anexo da empresa (a anterior deixa de ser a atual). */
export async function uploadCompanyAttachmentVersion(
  companyId: string,
  customFieldDefinitionId: string,
  file: File,
): Promise<CompanyAttachmentVersion> {
  const { data: last, error: eLast } = await supabase
    .from("company_attachments")
    .select("version")
    .eq("company_id", companyId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eLast) throw new Error(eLast.message);
  const nextVersion = (last?.version ?? 0) + 1;

  const path = `companies/${companyId}/${customFieldDefinitionId}/v${nextVersion}-${crypto.randomUUID()}.${extOf(file.name)}`;
  const { error: eUp } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (eUp) throw new Error(eUp.message);

  const { error: eClear } = await supabase
    .from("company_attachments")
    .update({ is_current: false })
    .eq("company_id", companyId)
    .eq("custom_field_definition_id", customFieldDefinitionId)
    .eq("is_current", true);
  if (eClear) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => {});
    throw new Error(eClear.message);
  }

  const { data: row, error: eIns } = await supabase
    .from("company_attachments")
    .insert({
      company_id: companyId,
      custom_field_definition_id: customFieldDefinitionId,
      version: nextVersion,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      is_current: true,
    })
    .select("*")
    .single();
  if (eIns || !row) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => {});
    throw new Error(eIns?.message ?? "Falha ao registrar o anexo.");
  }
  return row;
}

/** Definições que já têm um anexo ATUAL para a empresa (para validar obrigatoriedade). */
export async function listCompanyCurrentAttachmentDefinitions(companyId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("company_attachments")
    .select("custom_field_definition_id")
    .eq("company_id", companyId)
    .eq("is_current", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.custom_field_definition_id));
}

/** Hook: versões de um anexo de uma empresa já existente. */
export function useCompanyAttachmentVersions(
  companyId: string | null | undefined,
  customFieldDefinitionId: string,
) {
  return useQuery({
    queryKey: ["company-attachments", companyId, customFieldDefinitionId],
    queryFn: () => listCompanyAttachmentVersions(companyId as string, customFieldDefinitionId),
    enabled: Boolean(companyId && customFieldDefinitionId),
  });
}
