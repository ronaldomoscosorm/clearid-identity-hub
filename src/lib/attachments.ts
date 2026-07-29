// Anexos versionados de campos personalizados (tipo "Anexo").
//
// O Argus não armazena arquivos; os anexos vivem só no sistema:
//   * arquivos no Supabase Storage (bucket privado `identity-attachments`);
//   * cada upload cria uma nova VERSÃO em `identity_attachments`, marcando a
//     anterior como não-atual (histórico preservado, download por URL assinada).
//
// Como o vínculo é com identities.id (uuid do Supabase), o upload só acontece
// depois que a identidade já foi espelhada (mirrorIdentities) — no cadastro
// novo, os arquivos ficam "pendentes" no formulário e são enviados no onSuccess.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const ATTACHMENT_BUCKET = "identity-attachments";

export type AttachmentVersion = Database["public"]["Tables"]["identity_attachments"]["Row"];

/** Arquivo preparado no formulário, aguardando upload após a criação. */
export type PendingAttachment = { site_custom_field_id: string; file: File };

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
  siteCustomFieldId: string,
): Promise<AttachmentVersion[]> {
  const { data, error } = await supabase
    .from("identity_attachments")
    .select("*")
    .eq("identity_id", identityDbId)
    .eq("site_custom_field_id", siteCustomFieldId)
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
  siteCustomFieldId: string,
  file: File,
): Promise<AttachmentVersion> {
  // Próxima versão = maior atual + 1.
  const { data: last, error: eLast } = await supabase
    .from("identity_attachments")
    .select("version")
    .eq("identity_id", identityDbId)
    .eq("site_custom_field_id", siteCustomFieldId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eLast) throw new Error(eLast.message);
  const nextVersion = (last?.version ?? 0) + 1;

  const path = `${identityDbId}/${siteCustomFieldId}/v${nextVersion}-${crypto.randomUUID()}.${extOf(file.name)}`;

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
    .eq("site_custom_field_id", siteCustomFieldId)
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
      site_custom_field_id: siteCustomFieldId,
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
 * que falharam (site_custom_field_id) para o chamador reportar.
 */
export async function saveIdentityAttachments(
  clearIdIdentityId: string,
  pending: PendingAttachment[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  if (!clearIdIdentityId || !pending.length) return { failed };

  const identityDbId = await resolveIdentityDbId(clearIdIdentityId);
  if (!identityDbId) {
    return { failed: pending.map((p) => p.site_custom_field_id) };
  }

  for (const p of pending) {
    try {
      await uploadAttachmentVersion(identityDbId, p.site_custom_field_id, p.file);
    } catch (e) {
      console.error("[attachments] falha ao enviar anexo:", (e as Error).message);
      failed.push(p.site_custom_field_id);
    }
  }
  return { failed };
}

/** Hook: versões de um anexo para uma identidade já existente (modo edição). */
export function useAttachmentVersions(
  identityDbId: string | null | undefined,
  siteCustomFieldId: string,
) {
  return useQuery({
    queryKey: ["identity-attachments", identityDbId, siteCustomFieldId],
    queryFn: () => listAttachmentVersions(identityDbId as string, siteCustomFieldId),
    enabled: Boolean(identityDbId && siteCustomFieldId),
  });
}
