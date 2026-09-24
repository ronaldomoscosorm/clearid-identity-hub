// Cliente da página pública de atualização de foto (/foto/:token).
// NÃO envia auth nem header de ambiente (o backend usa o ambiente do token).
const API_BASE =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "https://argusclearidapi.rmtecho.com.br")
    .replace(/\/+$/, "");

export type PhotoUpdateInfo = {
  displayName: string;
  hasPhoto: boolean;
  expiresUtc: string | null;
};

export type PhotoResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function parse<T>(res: Response, fallback: string): Promise<PhotoResult<T>> {
  const body = (await res.json().catch(() => null)) as
    | { data?: T; message?: string | null }
    | null;
  if (res.ok && body && body.data != null) return { ok: true, data: body.data };
  return { ok: false, status: res.status, message: body?.message ?? fallback };
}

/** Valida o link e retorna os dados da identidade. */
export async function getPhotoInfo(token: string): Promise<PhotoResult<PhotoUpdateInfo>> {
  try {
    const res = await fetch(`${API_BASE}/api/photo-update/${encodeURIComponent(token)}`, {
      headers: { accept: "application/json" },
    });
    return parse<PhotoUpdateInfo>(res, "Link inválido.");
  } catch (e) {
    return { ok: false, status: 0, message: (e as Error).message };
  }
}

/** Envia a nova foto (multipart, campo "picture"). */
export async function submitPhoto(
  token: string,
  file: File,
): Promise<PhotoResult<{ updated: boolean; blobName?: string }>> {
  try {
    const form = new FormData();
    form.append("picture", file);
    const res = await fetch(`${API_BASE}/api/photo-update/${encodeURIComponent(token)}`, {
      method: "POST",
      body: form,
    });
    return parse<{ updated: boolean; blobName?: string }>(res, "Falha ao enviar a foto.");
  } catch (e) {
    return { ok: false, status: 0, message: (e as Error).message };
  }
}
