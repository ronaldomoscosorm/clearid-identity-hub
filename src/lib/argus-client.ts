import { useSyncExternalStore } from "react";
import { getConfig } from "./argus-env";

// --- Default site cache ---
let cachedSiteId: string | null = null;
const SITE_KEY = "argus.defaultSiteId";
const siteListeners = new Set<() => void>();

export function getDefaultSiteId(): string | null {
  if (cachedSiteId) return cachedSiteId;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(SITE_KEY);
      if (stored) cachedSiteId = stored;
    } catch { /* ignore */ }
  }
  return cachedSiteId;
}

export function setDefaultSiteId(id: string | null) {
  cachedSiteId = id || null;
  if (typeof window !== "undefined") {
    try {
      if (id) window.localStorage.setItem(SITE_KEY, id);
      else window.localStorage.removeItem(SITE_KEY);
    } catch { /* ignore */ }
  }
  for (const cb of siteListeners) cb();
}

function subscribeSite(cb: () => void) {
  siteListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SITE_KEY) {
      cachedSiteId = e.newValue || null;
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    siteListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** React hook: re-renderiza quando o site padrão muda. */
export function useDefaultSiteId(): string | null {
  return useSyncExternalStore(
    subscribeSite,
    () => getDefaultSiteId(),
    () => null,
  );
}

// --- AccountId cache (preenchido pelo /api/diagnostics/environment) ---
let cachedAccountId: string | null = null;
const accountIdListeners = new Set<(id: string | null) => void>();

export function getAccountId(): string | null {
  if (cachedAccountId) return cachedAccountId;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem("argus.accountId");
      if (stored) cachedAccountId = stored;
    } catch { /* ignore */ }
  }
  return cachedAccountId;
}

export function setAccountId(id: string | null) {
  cachedAccountId = id || null;
  if (typeof window !== "undefined") {
    try {
      if (id) window.localStorage.setItem("argus.accountId", id);
      else window.localStorage.removeItem("argus.accountId");
    } catch { /* ignore */ }
  }
  for (const cb of accountIdListeners) cb(cachedAccountId);
}

/** Substitui `{accountId}` em paths por o valor cacheado. */
export function withAccountId(path: string): string {
  const id = getAccountId();
  return id ? path.replace(/\{accountId\}/g, encodeURIComponent(id)) : path;
}

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
  init: RequestInit = {},
): Promise<T> {
  const cfg = getConfig();

  if (!cfg.baseUrl) {
    throw new ArgusApiError({
      status: 0,
      message: "Base URL não configurada",
    });
  }

  let url = cfg.baseUrl.replace(/\/+$/, "") + path;
  const siteIdForQuery = getDefaultSiteId();
  if (siteIdForQuery && !/[?&]siteId=/.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "siteId=" + encodeURIComponent(siteIdForQuery);
  }
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  const accountId = getAccountId();
  if (accountId && !headers.has("X-Account-Id")) {
    headers.set("X-Account-Id", accountId);
  }
  if (siteIdForQuery && !headers.has("X-Site-Id")) {
    headers.set("X-Site-Id", siteIdForQuery);
  }

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
    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const msg =
      (bodyObj && "message" in bodyObj && typeof bodyObj.message === "string"
        ? bodyObj.message
        : null) ??
      (bodyObj && "error" in bodyObj ? String(bodyObj.error) : null) ??
      response.statusText ??
      `HTTP ${response.status}`;
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
  culture?: string | null;
  email?: string | null;
  identityType?: string | null;
  externalId?: string | null;
  picture?: unknown;
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
  // Campos opcionais preservados ao editar (ClearID PUT é replace
  // completo e pode rejeitar com 400 se omitidos).
  identityType?: string | null;
  description?: string | null;
  countryCode?: string | null;
  culture?: string | null;
  middleName?: string | null;
  displayName?: string | null;
  eTag?: string | null;
  privateData?: Record<string, unknown> | null;
  companyData?: Record<string, unknown> | null;
  systemData?: ClearIdIdentity["systemData"];
}

/**
 * ClearID v4 exige formatos diferentes para criação e atualização: no PUT,
 * externalId/customFields ficam dentro de systemData e eTag é obrigatório.
 */
function normalizeCreateIdentityPayload(data: IdentityUpsert): IdentityUpsert {
  return {
    ...data,
    status: (typeof data.status === "string"
      ? data.status.toLowerCase()
      : data.status) as IdentityUpsert["status"],
    identityType:
      typeof data.identityType === "string"
        ? data.identityType.toLowerCase()
        : data.identityType,
  };
}

function customFieldsToClearIdArray(fields?: Record<string, string>) {
  if (!fields) return undefined;
  return Object.entries(fields)
    .filter(([name]) => name.trim())
    .map(([customFieldName, customFieldValue]) => ({
      customFieldName: customFieldName.trim(),
      customFieldValue: customFieldValue ?? "",
    }));
}

function pickDefined<T extends Record<string, unknown>>(source: Record<string, unknown> | null | undefined, keys: string[]): Partial<T> | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

function sanitizeResourceFilters(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const { entityId, entityType, sourceId } = item as Record<string, unknown>;
    return { entityId, entityType, sourceId };
  });
}

function normalizeUpdateIdentityPayload(data: IdentityUpsert): Record<string, unknown> {
  if (!data.eTag) {
    throw new ArgusApiError({
      status: 0,
      message: "Não foi possível atualizar: versão da identidade não carregada. Aguarde a foto atualizar e tente novamente.",
    });
  }

  const systemData: Record<string, unknown> = {};
  systemData.externalId = data.externalId;
  const customFields = customFieldsToClearIdArray(data.customFields);
  if (customFields) systemData.customFields = customFields;

  const displayName =
    data.displayName ??
    ([data.lastName, data.firstName].filter(Boolean).join(", ") ||
      `${data.firstName} ${data.lastName}`.trim());

  return {
    systemData,
    description: data.description ?? null,
    status:
      typeof data.status === "string"
        ? data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase()
        : data.status,
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName ?? null,
    displayName,
    countryCode: data.countryCode ?? null,
    culture: data.culture ?? null,
    email: data.email,
    eTag: data.eTag,
  };
}

export interface DiagnosticsResult {
  environment: string;
  clientCode?: string;
  baseUrl?: string;
  backend: { reachable: boolean; latencyMs?: number; status?: number; message?: string };
  checkedAt: string;
}

export interface ClearIdSite {
  siteId: string;
  name: string;
  description?: string | null;
  accountId?: string;
  regionId?: string | null;
  timeZoneId?: string | null;
}

export interface ClearIdTeam {
  teamId: string;
  name: string;
  description?: string | null;
  status?: string | null;
  isDeleted?: boolean;
}

export interface ClearIdTeamMember {
  teamId: string;
  teamName?: string;
  identityId: string;
  identityName?: string | null;
  identityEmail?: string | null;
  identityJobTitle?: string | null;
  identityCompanyName?: string | null;
  identityDepartmentName?: string | null;
}

export interface ClearIdLocation {
  locationId: string;
  siteId: string;
  accountId?: string;
  name: string;
  description?: string | null;
  visibility?: string | null;
  approvers?: string[];
  owners?: string[];
  siteOwners?: string[];
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
  listSites: async (): Promise<ClearIdSite[]> => {
    const data = await unwrap<{ sites?: ClearIdSite[] } | ClearIdSite[]>(
      argusFetch(`/api/sites`),
    );
    if (Array.isArray(data)) return data;
    return data?.sites ?? [];
  },

  listTeams: async (params?: { name?: string; take?: number }): Promise<ClearIdTeam[]> => {
    const q = new URLSearchParams();
    q.set("includeDeleted", "false");
    q.set("take", String(params?.take ?? 200));
    if (params?.name) q.set("name", params.name);
    const data = await unwrap<{ teams?: ClearIdTeam[] } | ClearIdTeam[]>(
      argusFetch(`/api/teams?${q.toString()}`),
    );
    if (Array.isArray(data)) return data;
    return data?.teams ?? [];
  },

  listTeamMembers: async (teamId: string, params?: { searchText?: string; count?: number }) => {
    const q = new URLSearchParams();
    q.set("count", String(params?.count ?? 200));
    if (params?.searchText) q.set("searchText", params.searchText);
    const data = await unwrap<{ teamMembers?: ClearIdTeamMember[] } | ClearIdTeamMember[]>(
      argusFetch(`/api/teams/${encodeURIComponent(teamId)}/members?${q.toString()}`),
    );
    if (Array.isArray(data)) return data;
    return data?.teamMembers ?? [];
  },

  listLocations: async (params?: { skip?: number; take?: number }): Promise<ClearIdLocation[]> => {
    const q = new URLSearchParams();
    q.set("skip", String(params?.skip ?? 0));
    q.set("take", String(params?.take ?? 200));
    const data = await unwrap<
      { results?: ClearIdLocation[] } | ClearIdLocation[]
    >(argusFetch(`/api/locations?${q.toString()}`));
    if (Array.isArray(data)) return data;
    return data?.results ?? [];
  },

  addTeamMembers: (
    teamId: string,
    payload: {
      identityIds: string[];
      sourceId?: string | null;
      startDateTimeUtc?: string | null;
      endDateTimeUtc?: string | null;
      reason?: string;
    },
  ) =>
    argusFetch<unknown>(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      method: "POST",
      body: JSON.stringify({
        identityIds: payload.identityIds,
        sourceId: payload.sourceId ?? null,
        startDateTimeUtc: payload.startDateTimeUtc ?? null,
        endDateTimeUtc: payload.endDateTimeUtc ?? null,
        reason: payload.reason ?? "Portal Argus",
      }),
    }),

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
      argusFetch(`/api/identities`, {
        method: "POST",
        body: JSON.stringify(normalizeCreateIdentityPayload(data)),
      }),
    ),

  updateIdentity: (id: string, data: IdentityUpsert) =>
    unwrap<ClearIdIdentity>(
      argusFetch(`/api/identities/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(normalizeUpdateIdentityPayload(data)),
      }),
    ),

  deactivateIdentity: (id: string) =>
    argusFetch<void>(`/api/identities/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),

  activateIdentity: (id: string) =>
    argusFetch<void>(`/api/identities/${encodeURIComponent(id)}/activate`, { method: "POST" }),

  /** Baixa a foto da identidade como Blob. Retorna null em 404. */
  getIdentityPicture: async (id: string): Promise<Blob | null> => {
    const cfg = getConfig();
    if (!cfg.baseUrl) return null;
    const url = cfg.baseUrl.replace(/\/+$/, "") + `/api/identities/${encodeURIComponent(id)}/picture`;
    const headers = new Headers();
    if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
    const acc = getAccountId();
    if (acc) headers.set("X-Account-Id", acc);
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new ArgusApiError({ status: res.status, message: res.statusText });
    return await res.blob();
  },

  /** Envia uma nova foto (JPEG) para a identidade. */
  uploadIdentityPicture: async (id: string, blob: Blob): Promise<void> => {
    const cfg = getConfig();
    if (!cfg.baseUrl) throw new ArgusApiError({ status: 0, message: "Base URL não configurada" });
    const url = cfg.baseUrl.replace(/\/+$/, "") + `/api/identities/${encodeURIComponent(id)}/picture`;
    const form = new FormData();
    form.append("picture", blob, "capture.jpg");
    const headers = new Headers();
    if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
    const acc = getAccountId();
    if (acc) headers.set("X-Account-Id", acc);
    const res = await fetch(url, { method: "POST", headers, body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ArgusApiError({ status: res.status, message: text || res.statusText });
    }
  },

  /**
   * Diagnóstico: chama GET /api/diagnostics/test-connection. O backend define
   * o ambiente atual (demo/prod) — o frontend apenas exibe.
   */
  diagnostics: async (): Promise<DiagnosticsResult> => {
    const cfg = getConfig();
    const start = performance.now();
    try {
      const [conn, env] = await Promise.all([
        argusFetch<Record<string, unknown>>(`/api/diagnostics/test-connection`),
        argusFetch<Record<string, unknown>>(`/api/diagnostics/environment`).catch(() => null),
      ]);
      const latencyMs = Math.round(performance.now() - start);
      const connBody = (conn && typeof conn === "object" && "data" in conn && conn.data && typeof conn.data === "object"
        ? (conn.data as Record<string, unknown>)
        : conn) as Record<string, unknown>;
      const envBody = (env && typeof env === "object" && "data" in env && env.data && typeof env.data === "object"
        ? (env.data as Record<string, unknown>)
        : (env ?? {})) as Record<string, unknown>;
      const environment =
        (envBody.environment as string | undefined) ??
        (connBody.environment as string | undefined) ??
        "—";
      const clientCode =
        (envBody.accountId as string | undefined) ??
        (envBody.AccountId as string | undefined) ??
        (envBody.clientCode as string | undefined);
      if (clientCode) setAccountId(clientCode);
      const message = (conn?.message as string | undefined) ?? (connBody.message as string | undefined);
      return {
        environment,
        clientCode,
        baseUrl: cfg.baseUrl,
        backend: { reachable: true, latencyMs, status: 200, message },
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      const err = e as ArgusApiError;
      return {
        environment: "—",
        baseUrl: cfg.baseUrl,
        backend: { reachable: false, status: err.status, message: err.message },
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
    externalId: i.externalId ?? i.systemData?.externalId ?? "",
    firstName: i.firstName ?? "",
    lastName: i.lastName ?? "",
    email: i.email ?? "",
    status: (i.status === "Inactive" ? "Inactive" : "Active") as "Active" | "Inactive",
    customFields: customFieldsToRecord(i.systemData?.customFields),
  };
}