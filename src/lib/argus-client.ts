import { getCurrentEnv, getEnvConfig, type ArgusEnvKey } from "./argus-env";

export interface ArgusError {
  status: number;
  message: string;
  traceId?: string;
  raw?: unknown;
}

export class ArgusApiError extends Error {
  status: number;
  traceId?: string;
  raw?: unknown;
  constructor(e: ArgusError) {
    super(e.message);
    this.status = e.status;
    this.traceId = e.traceId;
    this.raw = e.raw;
  }
}

export async function argusFetch<T = unknown>(
  path: string,
  init: RequestInit & { env?: ArgusEnvKey } = {},
): Promise<T> {
  const env = init.env ?? getCurrentEnv();
  const cfg = getEnvConfig(env);

  if (!cfg.baseUrl) {
    throw new ArgusApiError({
      status: 0,
      message: "Base URL não configurada para o ambiente " + env,
    });
  }

  const url = cfg.baseUrl.replace(/\/+$/, "") + path;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Environment", env);
  if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (e) {
    throw new ArgusApiError({
      status: 0,
      message: `Falha de rede ao chamar ${url}: ${(e as Error).message}`,
    });
  }

  const traceId = response.headers.get("x-trace-id") ?? undefined;
  const text = await response.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
  }

  if (!response.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? response.statusText ?? `HTTP ${response.status}`;
    throw new ArgusApiError({
      status: response.status,
      message: msg,
      traceId,
      raw: body,
    });
  }

  return body as T;
}

// ---- Identity Service v4 DTOs (alinháveis ao backend) ----

export interface Identity {
  id?: string;
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "Active" | "Inactive";
  customFields?: Record<string, string>;
  updatedAt?: string;
}

export interface IdentityListResponse {
  items: Identity[];
  total: number;
}

export interface DiagnosticsResponse {
  environment: string;
  baseUrl?: string;
  backend: { reachable: boolean; latencyMs?: number; version?: string };
  clearId: {
    tokenValid: boolean;
    expiresAt?: string;
    accountId?: string;
  };
  checkedAt: string;
}

// ---- API helpers ----

export const argusApi = {
  listIdentities: (params?: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return argusFetch<IdentityListResponse>(`/api/identities${qs ? `?${qs}` : ""}`);
  },
  getIdentity: (id: string) => argusFetch<Identity>(`/api/identities/${encodeURIComponent(id)}`),
  createIdentity: (data: Identity) =>
    argusFetch<Identity>(`/api/identities`, { method: "POST", body: JSON.stringify(data) }),
  updateIdentity: (id: string, data: Identity) =>
    argusFetch<Identity>(`/api/identities/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deactivateIdentity: (id: string) =>
    argusFetch<void>(`/api/identities/${encodeURIComponent(id)}`, { method: "DELETE" }),
  diagnostics: () => argusFetch<DiagnosticsResponse>(`/api/diagnostics`),
};