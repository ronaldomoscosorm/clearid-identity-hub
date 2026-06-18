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

// ---- Identity Service v4 DTOs (alinhados ao backend ArgusClearId.Api) ----

export interface ClearIdCustomField {
  customFieldType?: string;
  customFieldName: string;
  customFieldValue: string;
}

export interface ClearIdIdentity {
  accountId?: string;
  identityId: string;
  eTag?: string;
  description?: string | null;
  status: "Active" | "Inactive" | string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  displayName?: string | null;
  countryCode?: string | null;
  email?: string | null;
  identityType?: string | null;
  privateData?: Record<string, unknown> | null;
  companyData?: Record<string, unknown> | null;
  systemData?: {
    externalId?: string | null;
    customFields?: ClearIdCustomField[] | null;
    [k: string]: unknown;
  } | null;
  creationDateUtc?: string;
  lastModificationDateUtc?: string;
  score?: number | null;
}

export interface IdentitySearchResult {
  results?: ClearIdIdentity[] | null;
  totalItems?: number | null;
  skip: number;
  take: number;
}

/** Wrapper retornado pelo backend: { success, message, data } */
interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

/** Payload de criação/edição enviado ao backend. */
export interface IdentityUpsert {
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "Active" | "Inactive";
  customFields?: Record<string, string>;
}

export interface DiagnosticsResult {
  environment: string;
  baseUrl?: string;
  backend: { reachable: boolean; latencyMs?: number; status?: number };
  identities: { reachable: boolean; sampleCount?: number; accountId?: string };
  checkedAt: string;
}

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as ApiEnvelope<T> | T;
  if (r && typeof r === "object" && "data" in (r as Record<string, unknown>)) {
    return (r as ApiEnvelope<T>).data;
  }
  return r as T;
}

// ---- API helpers ----

export const argusApi = {
  listIdentities: async (params?: {
    query?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    jobTitle?: string;
    department?: string;
    status?: string;
    skip?: number;
    take?: number;
  }) => {
    const q = new URLSearchParams();
    q.set("includeDeleted", "false");
    q.set("skip", String(params?.skip ?? 0));
    q.set("take", String(params?.take ?? 50));
    if (params?.query) q.set("query", params.query);
    if (params?.firstName) q.set("firstName", params.firstName);
    if (params?.lastName) q.set("lastName", params.lastName);
    if (params?.email) q.set("email", params.email);
    if (params?.company) q.set("company", params.company);
    if (params?.jobTitle) q.set("jobTitle", params.jobTitle);
    if (params?.department) q.set("department", params.department);
    if (params?.status) q.set("status", params.status.toLowerCase());
    const data = await unwrap<IdentitySearchResult>(
      argusFetch(`/api/identities/search?${q.toString()}`),
    );
    return { items: data.results ?? [], total: data.totalItems ?? data.results?.length ?? 0 };
  },

  getIdentity: (id: string) =>
    unwrap<ClearIdIdentity>(argusFetch(`/api/identities/${encodeURIComponent(id)}`)),

  createIdentity: (data: IdentityUpsert) =>
    unwrap<ClearIdIdentity>(
      argusFetch(`/api/identities`, { method: "POST", body: JSON.stringify(data) }),
    ),

  updateIdentity: (id: string, data: IdentityUpsert) =>
    unwrap<ClearIdIdentity>(
      argusFetch(`/api/identities/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    ),

  deactivateIdentity: (id: string) =>
    argusFetch<void>(`/api/identities/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * Diagnóstico: o backend não expõe /api/diagnostics, então usamos
   * /api/identities como ping (valida rede + token OAuth contra ClearID).
   */
  diagnostics: async (): Promise<DiagnosticsResult> => {
    const env = getCurrentEnv();
    const cfg = getEnvConfig(env);
    const start = performance.now();
    try {
      const data = await unwrap<{ identities: ClearIdIdentity[] }>(
        argusFetch(`/api/identities?pageSize=1`),
      );
      const latencyMs = Math.round(performance.now() - start);
      const accountId = data.identities?.[0]?.accountId;
      return {
        environment: env,
        baseUrl: cfg.baseUrl,
        backend: { reachable: true, latencyMs, status: 200 },
        identities: { reachable: true, sampleCount: data.identities?.length ?? 0, accountId },
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      const err = e as ArgusApiError;
      return {
        environment: env,
        baseUrl: cfg.baseUrl,
        backend: { reachable: false, status: err.status },
        identities: { reachable: false },
        checkedAt: new Date().toISOString(),
      };
    }
  },
};

// ---- Helpers de mapeamento ClearID ↔ formulário ----

export function customFieldsToRecord(cf?: ClearIdCustomField[] | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of cf ?? []) if (f.customFieldName) out[f.customFieldName] = f.customFieldValue ?? "";
  return out;
}

export function clearIdToFormValues(i: ClearIdIdentity): IdentityUpsert & { identityId: string } {
  return {
    identityId: i.identityId,
    externalId: i.systemData?.externalId ?? "",
    firstName: i.firstName ?? "",
    lastName: i.lastName ?? "",
    email: i.email ?? "",
    status: (i.status === "Inactive" ? "Inactive" : "Active") as "Active" | "Inactive",
    customFields: customFieldsToRecord(i.systemData?.customFields),
  };
}