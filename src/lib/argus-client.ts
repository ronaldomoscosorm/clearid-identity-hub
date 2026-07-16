import { useSyncExternalStore } from "react";
import { z } from "zod";
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

// --- SystemObjectId cache (selecionado nas Configurações) ---
let cachedSystemObjectId: string | null = null;
const SYSTEM_KEY = "argus.systemObjectId";
const systemListeners = new Set<() => void>();

export function getSystemObjectId(): string | null {
  if (cachedSystemObjectId) return cachedSystemObjectId;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(SYSTEM_KEY);
      if (stored) cachedSystemObjectId = stored;
    } catch { /* ignore */ }
  }
  return cachedSystemObjectId;
}

export function setSystemObjectId(id: string | null) {
  cachedSystemObjectId = id || null;
  if (typeof window !== "undefined") {
    try {
      if (id) window.localStorage.setItem(SYSTEM_KEY, id);
      else window.localStorage.removeItem(SYSTEM_KEY);
    } catch { /* ignore */ }
  }
  for (const cb of systemListeners) cb();
}

function subscribeSystem(cb: () => void) {
  systemListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SYSTEM_KEY) {
      cachedSystemObjectId = e.newValue || null;
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    systemListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useSystemObjectId(): string | null {
  return useSyncExternalStore(
    subscribeSystem,
    () => getSystemObjectId(),
    () => null,
  );
}

export interface ClearIdSystem {
  systemObjectId: string;
  name: string;
  description?: string | null;
  accountId?: string;
  [k: string]: unknown;
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
  opts: { allSites?: boolean; siteId?: string | null } = {},
): Promise<T> {
  const cfg = getConfig();

  if (!cfg.baseUrl) {
    throw new ArgusApiError({
      status: 0,
      message: "Base URL não configurada",
    });
  }

  let url = cfg.baseUrl.replace(/\/+$/, "") + path;
  // Permite escopar a chamada a um site específico (ex.: o site da pessoa),
  // em vez do site padrão do cabeçalho.
  const siteIdForQuery = opts.siteId ?? getDefaultSiteId();
  if (!opts.allSites && siteIdForQuery && !/[?&]siteId=/.test(url)) {
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
  const systemObjectId = getSystemObjectId();
  if (systemObjectId && !headers.has("X-System-Object-Id")) {
    headers.set("X-System-Object-Id", systemObjectId);
  }
  if (systemObjectId && !/[?&]systemObjectId=/.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "systemObjectId=" + encodeURIComponent(systemObjectId);
  }
  // Ambiente é decidido pelo backend (ArgusClearId.Api). Não forçamos
  // X-ClearId-Environment aqui — enviar "Demo" fazia o backend responder
  // Demo mesmo quando o ambiente configurado era Production.
  if (!opts.allSites && siteIdForQuery && !headers.has("X-Site-Id")) {
    headers.set("X-Site-Id", siteIdForQuery);
  }

  let response: Response;
  try {
    // Salvaguarda: nunca permitir DELETE em /api/identities/* — desativação
    // deve ser sempre via PUT de status para "Inactive". Isso impede que
    // um bug futuro (ou chamada equivocada) exclua registros no ClearID.
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "DELETE" && /\/api\/identities(\/|$|\?)/i.test(path)) {
      throw new ArgusApiError({
        status: 0,
        message:
          "Operação bloqueada: DELETE em /api/identities não é permitido. Use updateIdentity com status='Inactive'.",
      });
    }
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
  workerTypeCode?: string | null;
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
  siteId?: string | null;
  workerTypeCode?: string | null;
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
function assertWorkerTypeCode(code: string | null | undefined) {
  const v = (code ?? "").trim();
  if (!v) {
    throw new ArgusApiError({
      status: 400,
      message: "workerTypeCode é obrigatório (Tipo do Trabalhador).",
    });
  }
  if (v !== "Terceiros" && v !== "Colaborador") {
    throw new ArgusApiError({
      status: 400,
      message: "workerTypeCode inválido: use 'Terceiros' ou 'Colaborador'.",
    });
  }
}

function normalizeCreateIdentityPayload(data: IdentityUpsert): IdentityUpsert {
  assertWorkerTypeCode(data.workerTypeCode);
  return {
    ...data,
    // Campos personalizados NÃO vão no create (o ClearID rejeita o formato dict
    // aqui). São gravados após a criação via patchIdentityCustomFields.
    customFields: undefined,
    siteId: data.siteId ?? getDefaultSiteId() ?? undefined,
    workerTypeCode: data.workerTypeCode ?? undefined,
    companyData: {
      ...(data.companyData ?? {}),
      ...(data.siteId ? { siteId: data.siteId } : {}),
      workerTypeCode: data.workerTypeCode ?? null,
    },
    status: (typeof data.status === "string"
      ? data.status.toLowerCase()
      : data.status) as IdentityUpsert["status"],
    identityType:
      typeof data.identityType === "string"
        ? data.identityType.toLowerCase()
        : data.identityType,
  };
}

function customFieldsToClearIdArray(
  fields?: Record<string, string>,
  existing?: ClearIdCustomField[] | null,
) {
  if (!fields) return undefined;
  const existingByName = new Map((existing ?? []).map((field) => [field.customFieldName, field]));
  const seen = new Set<string>();
  const merged: ClearIdCustomField[] = [];
  for (const [rawName, rawValue] of Object.entries(fields)) {
    const customFieldName = rawName.trim();
    if (!customFieldName) continue;
    seen.add(customFieldName);
    const existingType = existingByName.get(customFieldName)?.customFieldType;
    const typeLc = (existingType ?? "").toLowerCase();
    const value = rawValue ?? "";
    const trimmed = typeof value === "string" ? value.trim() : value;
    // Não envie "" para campos tipados (Date/Boolean/Numeric) — o ClearID
    // rejeita com 400. Preserve o valor original se existir, senão pule.
    const isTypedField =
      typeLc === "date" || typeLc === "datetime" ||
      typeLc === "bool" || typeLc === "boolean" ||
      typeLc === "numeric" || typeLc === "number";
    if (isTypedField && !trimmed) {
      const prev = existingByName.get(customFieldName);
      if (prev && prev.customFieldValue) merged.push(prev);
      continue;
    }
    merged.push({
      customFieldType: existingType,
      customFieldName,
      customFieldValue: rawValue ?? "",
    });
  }
  // Preserva quaisquer campos existentes que não estavam no formulário,
  // já que o PUT do ClearID substitui a lista inteira.
  for (const field of existing ?? []) {
    if (field.customFieldName && !seen.has(field.customFieldName)) {
      merged.push(field);
    }
  }
  return merged;
}

/**
 * Converte valores do formulário em payload PATCH para
 * /api/identities/{id}/custom-fields, respeitando as regras por tipo.
 * Campos vazios viram `null` (limpar). Retorna apenas os que mudaram em
 * relação aos valores atuais.
 */
export function serializeCustomFieldsForPatch(
  defs: ClearIdCustomFieldDef[],
  values: Record<string, string>,
  current?: ClearIdCustomField[] | null,
): CustomFieldPatchValue[] {
  const currentByName = new Map(
    (current ?? []).map((f) => [f.customFieldName, f.customFieldValue ?? ""]),
  );
  const out: CustomFieldPatchValue[] = [];
  for (const def of defs) {
    const name = def.customFieldName;
    if (!(name in values)) continue;
    if (def.isReadOnly) continue;
    const typeLc = (def.customFieldType ?? "").toLowerCase();
    const raw = (values[name] ?? "").trim();
    let serialized: string | null;
    if (!raw) {
      serialized = null;
    } else if (typeLc === "date" || typeLc === "datetime") {
      // Aceita ISO (yyyy-MM-dd) ou dd/MM/yyyy
      const iso = /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? raw.slice(0, 10)
        : (() => {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
            return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
          })();
      if (!iso) continue; // ignora datas inválidas
      serialized = iso;
    } else if (typeLc === "bool" || typeLc === "boolean") {
      serialized = ["true", "1", "yes", "sim"].includes(raw.toLowerCase())
        ? "true"
        : "false";
    } else if (typeLc === "numeric" || typeLc === "number") {
      const cleaned = raw.replace(/[^0-9.\-]/g, "");
      serialized = cleaned || null;
    } else {
      serialized = raw;
    }
    const currentValue = currentByName.get(name);
    const currentNorm = currentValue == null || currentValue === "" ? null : currentValue;
    if (serialized === currentNorm) continue; // não mudou
    out.push({ customFieldName: name, customFieldValue: serialized });
  }
  return out;
}

function toClearIdName(value: string | null | undefined, fallback: string) {
  const raw = value || fallback;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
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
  assertWorkerTypeCode(data.workerTypeCode);
  if (!data.eTag) {
    throw new ArgusApiError({
      status: 0,
      message: "Não foi possível atualizar: versão da identidade não carregada. Aguarde a foto atualizar e tente novamente.",
    });
  }

  // systemData: preserva apenas campos editáveis não-nulos. Campos derivados/
  // read-only (resourceFilters, horizonId, provisioning, sync) NÃO podem ser
  // enviados no PUT — o ClearID rejeita com 400 (o resourceFilters é recalculado
  // a partir de companyData.siteId). customFields vão via PATCH, não no PUT.
  const READONLY_SYSTEM = new Set([
    "resourceFilters",
    "horizonId",
    "provisioningAttributes",
    "externalSyncSourceId",
    "externalSyncTimeUtc",
    "externalId",
    "customFields",
  ]);
  const systemData: Record<string, unknown> = { externalId: getClearIdExternalId(data) };
  for (const [k, v] of Object.entries((data.systemData ?? {}) as Record<string, unknown>)) {
    if (READONLY_SYSTEM.has(k)) continue;
    if (v !== null && v !== undefined) systemData[k] = v;
  }

  const displayName =
    data.displayName ??
    ([data.lastName, data.firstName].filter(Boolean).join(", ") ||
      `${data.firstName} ${data.lastName}`.trim());

  const companyData: Record<string, unknown> = {
    ...(data.companyData ?? {}),
    workerTypeCode: data.workerTypeCode ?? null,
  };
  if (data.siteId) companyData.siteId = data.siteId;

  return {
    systemData,
    companyData,
    privateData: data.privateData ?? undefined,
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
    identityType: toClearIdName(data.identityType, "Employee"),
    workerTypeCode: data.workerTypeCode ?? null,
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

// ---- Campanha de atualização de foto ----
export interface PhotoCampaignTarget {
  identityId: string;
  displayName: string | null;
  email: string | null;
  status: "Pending" | "Sent" | "Used" | "Failed" | "SkippedNoEmail" | string;
  expiresUtc: string | null;
  sentUtc: string | null;
  usedUtc: string | null;
  error: string | null;
  dryRunLink: string | null;
}
export interface PhotoCampaignResult {
  campaignId: string;
  name: string | null;
  environment: string;
  totalTargets: number;
  sent: number;
  skippedNoEmail: number;
  failed: number;
  dryRun: boolean;
  createdUtc: string;
  targets?: PhotoCampaignTarget[] | null;
}
export interface CreatePhotoCampaign {
  name?: string;
  identityIds?: string[];
  siteId?: string | null;
  accountId?: string | null;
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

export interface ClearIdCustomFieldDef {
  customFieldName: string;
  displayName?: string | null;
  customFieldType?: string | null;
  isReadOnly?: boolean;
  synchronizationEnabled?: boolean;
  createdBy?: string | null;
  creationDateUtc?: string | null;
  lastModifiedBy?: string | null;
  lastModificationDateUtc?: string | null;
  eTag?: string | null;
  isDeleting?: boolean;
  isDeleted?: boolean;
}

export interface ClearIdCustomFieldSection {
  sectionName: string;
  identityCustomFields?: Array<{ name: string; index: number }>;
}

/** Seção de campos personalizados, já normalizada para a UI. */
export interface CustomFieldSectionSummary {
  sectionName: string;
  displayName: string;
  index: number;
  eTag: string | null;
  fields: { name: string; index: number }[];
}

export interface CustomFieldPatchValue {
  customFieldName: string;
  customFieldValue: string | null;
}

// ---- Credential DTOs ----

export interface CredentialFormat {
  formatId: string;
  name: string;
  description?: string | null;
}

export interface CredentialRecord {
  credentialId?: string;
  identityId?: string;
  formatId?: string;
  formatName?: string | null;
  facilityCode?: string | number | null;
  cardNumber?: string | number | null;
  activationDateUtc?: string | null;
  expirationDateUtc?: string | null;
  status?: string | null;
  name?: string | null;
  description?: string | null;
  expirationMode?: string | null;
  expirationDurationInDays?: number | null;
  [k: string]: unknown;
}

// ---- Visitas ----
export interface VisitProfile {
  visitProfileId: string;
  siteId?: string | null;
  name?: string | null;
  isEnabled?: boolean;
  isDefault?: boolean;
  plannedVisitAllowed?: boolean;
  selfCheckInAllowed?: boolean;
  plannedVisitSettings?: {
    /** Motivos aceitos pelo ClearID. Qualquer outro valor gera 400 na criação. */
    visitReasons?: string[] | null;
  } | null;
}

export interface VisitVisitor {
  visitorId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  identityId?: string | null;
  registrationCode?: string | null;
  /** Expected | CheckedIn | CheckedOut | ... */
  visitorState?: string | null;
  checkinTimestampUtc?: string | null;
  checkoutTimestampUtc?: string | null;
}

export interface VisitEvent {
  visitEventId: string;
  visitEventName?: string | null;
  startDateTimeUtc?: string | null;
  endDateTimeUtc?: string | null;
  reason?: string | null;
  siteId?: string | null;
  /** Pending | Approved | Denied | Cancelled | ... */
  status?: string | null;
  requesterId?: string | null;
  eTag?: string | null;
  hosts?: { identityId: string; displayName?: string | null }[] | null;
  visitors?: VisitVisitor[] | null;
}

export interface CreateVisitPayload {
  visitEventName: string;
  startDateTimeUtc: string;
  endDateTimeUtc: string;
  reason: string;
  siteId: string;
  requesterId: string;
  hosts: { identityId: string }[];
  visitors: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    identityId?: string | null;
  }[];
  internalNotes?: string | null;
  visitProfileId?: string | null;
  type?: string | null;
}

export interface CredentialUpsert {
  identityId: string;
  formatId: string;
  facilityCode?: string | null;
  cardNumber: string;
  activationDateUtc?: string | null;
  expirationDateUtc?: string | null;
  name?: string | null;
  description?: string | null;
}

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as ApiEnvelope<T> | T;
  if (r && typeof r === "object" && "data" in (r as Record<string, unknown>)) {
    return (r as ApiEnvelope<T>).data;
  }
  return r as T;
}

// ---- Credential response schema ----

const credentialFieldSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
});

const credentialFormatSchema = z.object({
  formatId: z.string().optional().nullable(),
  facilityCode: z.union([z.string(), z.number(), z.null()]).optional(),
  cardNumber: z.union([z.string(), z.number(), z.null()]).optional(),
  fields: z.array(credentialFieldSchema).optional().nullable(),
}).passthrough();

const credentialStatusSchema = z.object({
  state: z.string().optional().nullable(),
  activationDateUtc: z.string().optional().nullable(),
  expirationDateUtc: z.string().optional().nullable(),
  expirationMode: z.string().optional().nullable(),
  expirationDurationInDays: z.number().nullable().optional(),
}).passthrough();

const credentialItemSchema = z.object({
  globalId: z.string().optional(),
  credentialId: z.string().optional(),
  identityId: z.string().optional(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  credentialType: z.string().nullable().optional(),
  credentialFormat: credentialFormatSchema.optional().nullable(),
  status: credentialStatusSchema.optional().nullable(),
}).passthrough();

const credentialsResponseSchema = z.union([
  z.array(credentialItemSchema),
  z.object({ credentials: z.array(credentialItemSchema).optional().nullable() }).passthrough(),
]);

function fieldValue(
  fields: Array<{ name: string; value?: string | number | null }> | null | undefined,
  name: string,
): string | null {
  if (!fields) return null;
  const found = fields.find((f) => f.name?.toLowerCase() === name.toLowerCase());
  if (!found || found.value == null) return null;
  return String(found.value);
}

export function parseCredentialsResponse(raw: unknown): CredentialRecord[] {
  const parsed = credentialsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Resposta inválida de credenciais: ${parsed.error.message}`);
  }
  const items = Array.isArray(parsed.data)
    ? parsed.data
    : (parsed.data.credentials ?? []);
  return items.map((it) => {
    const fmt = it.credentialFormat ?? undefined;
    const st = it.status ?? undefined;
    const facility =
      fmt?.facilityCode != null && fmt.facilityCode !== ""
        ? String(fmt.facilityCode)
        : fieldValue(fmt?.fields, "FacilityCode");
    const card =
      fmt?.cardNumber != null && fmt.cardNumber !== ""
        ? String(fmt.cardNumber)
        : fieldValue(fmt?.fields, "CardNumber");
    return {
      credentialId: it.credentialId ?? it.globalId,
      identityId: it.identityId,
      formatId: fmt?.formatId ?? undefined,
      facilityCode: facility,
      cardNumber: card,
      name: it.name ?? null,
      description: it.description ?? null,
      activationDateUtc: st?.activationDateUtc ?? null,
      expirationDateUtc: st?.expirationDateUtc ?? null,
      expirationMode: st?.expirationMode ?? null,
      expirationDurationInDays: st?.expirationDurationInDays ?? null,
      status: st?.state ?? null,
    };
  });
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

  listSystems: async (): Promise<ClearIdSystem[]> => {
    const accountId = getAccountId();
    const q = new URLSearchParams();
    if (accountId) q.set("accountId", accountId);
    const data = await unwrap<
      { systems?: unknown[] } | unknown[]
    >(argusFetch(`/api/systems?${q.toString()}`, undefined, { allSites: true }));
    const raw = Array.isArray(data) ? data : (data?.systems ?? []);
    return (raw as Array<Record<string, unknown>>).map((s) => ({
      systemObjectId:
        (s.systemObjectId as string | undefined) ??
        (s.SystemObjectId as string | undefined) ??
        (s.systemId as string | undefined) ??
        (s.id as string | undefined) ??
        "",
      name:
        (s.name as string | undefined) ??
        (s.Name as string | undefined) ??
        (s.displayName as string | undefined) ??
        "",
      description: (s.description as string | undefined) ?? null,
      accountId: s.accountId as string | undefined,
      ...s,
    })).filter((s) => s.systemObjectId);
  },

  listTeams: async (params?: {
    name?: string;
    take?: number;
    allSites?: boolean;
    siteId?: string | null;
  }): Promise<ClearIdTeam[]> => {
    const q = new URLSearchParams();
    q.set("includeDeleted", "false");
    q.set("take", String(params?.take ?? 200));
    if (params?.name) q.set("name", params.name);
    const data = await unwrap<{ teams?: ClearIdTeam[] } | ClearIdTeam[]>(
      argusFetch(`/api/teams?${q.toString()}`, undefined, {
        allSites: params?.allSites,
        siteId: params?.siteId,
      }),
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

  listCustomFields: async (): Promise<ClearIdCustomFieldDef[]> => {
    const accountId = getAccountId();
    const q = new URLSearchParams();
    if (accountId) q.set("accountId", accountId);
    const data = await unwrap<
      { customFields?: ClearIdCustomFieldDef[] } | ClearIdCustomFieldDef[]
    >(argusFetch(`/api/custom-fields?${q.toString()}`, undefined, { allSites: true }));
    if (Array.isArray(data)) return data;
    return data?.customFields ?? [];
  },

  /** Cria uma definição de campo personalizado. O nome/tipo são imutáveis depois. */
  createCustomField: (payload: {
    customFieldName: string;
    displayName: string;
    customFieldType: string;
    isReadOnly: boolean;
    synchronizationEnabled: boolean;
  }) =>
    unwrap<ClearIdCustomFieldDef>(
      argusFetch(`/api/custom-fields`, { method: "POST", body: JSON.stringify(payload) }, {
        allSites: true,
      }),
    ),

  /** Atualiza uma definição (nome e tipo não são alteráveis pela API). */
  updateCustomField: (
    customFieldName: string,
    payload: {
      displayName: string;
      isReadOnly: boolean;
      synchronizationEnabled: boolean;
      eTag?: string | null;
    },
  ) =>
    unwrap<ClearIdCustomFieldDef>(
      argusFetch(
        `/api/custom-fields/${encodeURIComponent(customFieldName)}`,
        { method: "PUT", body: JSON.stringify(payload) },
        { allSites: true },
      ),
    ),

  /** Remove a definição de campo personalizado da conta. */
  deleteCustomField: (customFieldName: string) =>
    unwrap<unknown>(
      argusFetch(
        `/api/custom-fields/${encodeURIComponent(customFieldName)}`,
        { method: "DELETE" },
        { allSites: true },
      ),
    ),

  /** Lista todas as seções de campos personalizados (nome, exibição, campos). */
  listCustomFieldSections: async (): Promise<CustomFieldSectionSummary[]> => {
    const data = await unwrap<unknown>(argusFetch(`/api/custom-fields/sections`));
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return arr.map((s) => ({
      sectionName: String(s.identityCustomFieldsSectionName ?? s.sectionName ?? ""),
      displayName: String(s.displayName ?? s.identityCustomFieldsSectionName ?? s.sectionName ?? ""),
      index: typeof s.index === "number" ? s.index : 0,
      eTag: typeof s.eTag === "string" ? s.eTag : null,
      fields: Array.isArray(s.identityCustomFields)
        ? (s.identityCustomFields as Record<string, unknown>[]).map((f) => ({
            name: String(f.name ?? ""),
            index: typeof f.index === "number" ? f.index : 0,
          }))
        : [],
    }));
  },

  /**
   * Cria uma seção de campos personalizados. O nome é imutável depois.
   *
   * Atenção: o `index` precisa ser único entre as seções. Se colidir, o backend
   * responde 400 com a mensagem enganosa "Já existe uma section com o nome X"
   * (fala do nome, mas o conflito é do índice).
   */
  createCustomFieldSection: (payload: {
    identityCustomFieldsSectionName: string;
    displayName: string;
    index?: number | null;
    identityCustomFields?: { name: string; index: number }[] | null;
  }) =>
    unwrap<unknown>(
      argusFetch(`/api/custom-fields/sections`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),

  /**
   * Atualiza a seção. `identityCustomFields` deve conter os campos atuais — o
   * PUT substitui o agrupamento, então omiti-lo esvaziaria a seção.
   */
  updateCustomFieldSection: (
    sectionName: string,
    payload: {
      displayName: string;
      index: number;
      identityCustomFields?: { name: string; index: number }[] | null;
      eTag?: string | null;
    },
  ) =>
    unwrap<unknown>(
      argusFetch(`/api/custom-fields/sections/${encodeURIComponent(sectionName)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    ),

  /** Remove a seção (o agrupamento). Os campos personalizados não são excluídos. */
  deleteCustomFieldSection: (sectionName: string) =>
    unwrap<unknown>(
      argusFetch(`/api/custom-fields/sections/${encodeURIComponent(sectionName)}`, {
        method: "DELETE",
      }),
    ),

  getCustomFieldSection: async (
    sectionName: string,
  ): Promise<ClearIdCustomFieldSection | null> => {
    try {
      const data = await unwrap<ClearIdCustomFieldSection>(
        argusFetch(
          `/api/custom-fields/sections/${encodeURIComponent(sectionName)}`,
          undefined,
          { allSites: true },
        ),
      );
      return data ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Grava apenas os campos personalizados alterados. Valores nulos limpam o
   * campo. Nunca envie string vazia para tipos Date/Boolean/Numeric — use
   * null. Este endpoint substitui o PUT completo para salvar documentos.
   */
  patchIdentityCustomFields: (
    id: string,
    values: CustomFieldPatchValue[],
  ) =>
    argusFetch<unknown>(
      `/api/identities/${encodeURIComponent(id)}/custom-fields`,
      {
        method: "PATCH",
        body: JSON.stringify({ values }),
      },
    ),

  addTeamMembers: (
    teamId: string,
    payload: {
      identityIds: string[];
      sourceId?: string | null;
      startDateTimeUtc?: string | null;
      endDateTimeUtc?: string | null;
      reason?: string;
      siteId?: string | null;
    },
  ) =>
    argusFetch<unknown>(
      `/api/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          identityIds: payload.identityIds,
          sourceId: payload.sourceId ?? null,
          startDateTimeUtc: payload.startDateTimeUtc ?? null,
          endDateTimeUtc: payload.endDateTimeUtc ?? null,
          reason: payload.reason ?? "Portal Argus",
        }),
      },
      { siteId: payload.siteId },
    ),

  removeTeamMembers: (
    teamId: string,
    payload: { identityIds: string[]; reason?: string; siteId?: string | null },
  ) =>
    argusFetch<unknown>(
      `/api/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: "DELETE",
        body: JSON.stringify({
          identityIds: payload.identityIds,
          reason: payload.reason ?? "Portal Argus",
        }),
      },
      { siteId: payload.siteId },
    ),

  /** Identidades com o e-mail informado (busca exata, em todos os sites). */
  findIdentitiesByEmail: async (email: string): Promise<ClearIdIdentity[]> => {
    const e = (email ?? "").trim();
    if (!e) return [];
    const { items } = await argusApi.listIdentities({ email: e, allSites: true, take: 20 });
    return items.filter((i) => (i.email ?? "").trim().toLowerCase() === e.toLowerCase());
  },

  /** Regras (teams) vinculadas a uma identidade. */
  getIdentityTeams: async (
    id: string,
    opts?: { siteId?: string | null },
  ): Promise<ClearIdTeamMember[]> => {
    const data = await unwrap<{ teams?: ClearIdTeamMember[] } | ClearIdTeamMember[]>(
      argusFetch(`/api/identities/${encodeURIComponent(id)}/teams`, undefined, {
        siteId: opts?.siteId,
      }),
    );
    if (Array.isArray(data)) return data;
    return data?.teams ?? [];
  },

  /**
   * Garante que a identidade tenha ao menos uma regra: se não tiver nenhuma e
   * houver uma regra padrão configurada, atribui a padrão.
   */
  ensureDefaultRule: async (
    id: string,
  ): Promise<{ assigned: boolean; ruleName?: string }> => {
    const cfg = getConfig();
    const ruleId = cfg.defaultRuleId;
    if (!ruleId) return { assigned: false };
    const teams = await argusApi.getIdentityTeams(id);
    if (teams.length > 0) return { assigned: false };
    await argusApi.addTeamMembers(ruleId, { identityIds: [id] });
    return { assigned: true, ruleName: cfg.defaultRuleName };
  },

  // ---- Campanhas de atualização de foto (admin) ----
  listPhotoCampaigns: async (): Promise<PhotoCampaignResult[]> => {
    const data = await unwrap<PhotoCampaignResult[] | { campaigns?: PhotoCampaignResult[] }>(
      argusFetch(`/api/photo-campaigns`, undefined, { allSites: true }),
    );
    if (Array.isArray(data)) return data;
    return data?.campaigns ?? [];
  },
  getPhotoCampaign: (id: string) =>
    unwrap<PhotoCampaignResult>(
      argusFetch(`/api/photo-campaigns/${encodeURIComponent(id)}`, undefined, { allSites: true }),
    ),
  createPhotoCampaign: (payload: CreatePhotoCampaign) =>
    unwrap<PhotoCampaignResult>(
      argusFetch(
        `/api/photo-campaigns`,
        { method: "POST", body: JSON.stringify(payload) },
        { allSites: true },
      ),
    ),
  updatePhotoCampaign: (id: string, payload: { name?: string | null }) =>
    unwrap<PhotoCampaignResult>(
      argusFetch(
        `/api/photo-campaigns/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(payload) },
        { allSites: true },
      ),
    ),
  deletePhotoCampaign: (id: string) =>
    unwrap<unknown>(
      argusFetch(
        `/api/photo-campaigns/${encodeURIComponent(id)}`,
        { method: "DELETE" },
        { allSites: true },
      ),
    ),

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
    allSites?: boolean;
    workerTypeCode?: string;
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
    if (params?.workerTypeCode) q.set("workerTypeCode", params.workerTypeCode);
    const data = await unwrap<IdentitySearchResult>(
      argusFetch(
        `/api/identities/search?${q.toString()}`,
        {},
        { allSites: params?.allSites },
      ),
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

  deactivateIdentity: async (id: string) => {
    const current = await argusApi.getIdentity(id);
    await argusApi.updateIdentity(id, {
      ...clearIdToFormValues(current),
      status: "Inactive",
      identityType: current.identityType ?? "Employee",
      eTag: current.eTag,
      description: current.description ?? undefined,
      countryCode: current.countryCode ?? undefined,
      culture: current.culture ?? undefined,
      middleName: current.middleName ?? undefined,
      displayName: current.displayName ?? undefined,
      privateData: current.privateData ?? undefined,
      companyData: current.companyData ?? undefined,
      systemData: current.systemData ?? undefined,
    });
  },

  activateIdentity: (id: string) =>
    argusFetch<void>(`/api/identities/${encodeURIComponent(id)}/activate`, { method: "POST" }),

  // ---- Credentials ----
  // ---- Visitas ----
  /**
   * Perfis de visita do site. O perfil define os motivos permitidos
   * (`visitReasons`) — o ClearID rejeita motivos fora dessa lista.
   */
  listVisitProfiles: async (): Promise<VisitProfile[]> => {
    const data = await unwrap<{ visitProfiles?: VisitProfile[] } | VisitProfile[]>(
      argusFetch(`/api/visit-profiles`),
    );
    if (Array.isArray(data)) return data;
    return data?.visitProfiles ?? [];
  },

  /** Busca visitas. `futureOnly` limita às que ainda vão ocorrer. */
  listVisits: async (params?: {
    searchTerm?: string;
    status?: string;
    identityId?: string;
    futureOnly?: boolean;
    take?: number;
  }): Promise<VisitEvent[]> => {
    const q = new URLSearchParams();
    q.set("take", String(params?.take ?? 50));
    if (params?.searchTerm) q.set("searchTerm", params.searchTerm);
    if (params?.status) q.set("status", params.status);
    if (params?.identityId) q.set("identityId", params.identityId);
    if (params?.futureOnly) q.set("futureOnly", "true");
    const data = await unwrap<{ visitEvents?: VisitEvent[]; results?: VisitEvent[] } | VisitEvent[]>(
      argusFetch(`/api/visits?${q.toString()}`),
    );
    if (Array.isArray(data)) return data;
    return data?.visitEvents ?? data?.results ?? [];
  },

  getVisit: (visitEventId: string) =>
    unwrap<VisitEvent>(argusFetch(`/api/visits/${encodeURIComponent(visitEventId)}`)),

  createVisit: (payload: CreateVisitPayload) =>
    unwrap<VisitEvent>(
      argusFetch(`/api/visits`, { method: "POST", body: JSON.stringify(payload) }),
    ),

  /** Visitantes da visita — traz o visitorId e o identityId (necessário p/ credencial). */
  listVisitVisitors: async (visitEventId: string): Promise<VisitVisitor[]> => {
    const data = await unwrap<{ visitors?: VisitVisitor[] } | VisitVisitor[]>(
      argusFetch(`/api/visits/${encodeURIComponent(visitEventId)}/visitors`),
    );
    if (Array.isArray(data)) return data;
    return data?.visitors ?? [];
  },

  /** Check-in em lote. `timestampUtc` omitido = agora (decidido pelo ClearID). */
  checkInVisitors: (visitEventId: string, visitorIds: string[]) =>
    unwrap<unknown>(
      argusFetch(`/api/visits/${encodeURIComponent(visitEventId)}/checkin`, {
        method: "POST",
        body: JSON.stringify({ visitorCheckIns: visitorIds.map((visitorId) => ({ visitorId })) }),
      }),
    ),

  /** Check-out em lote. */
  checkOutVisitors: (visitEventId: string, visitorIds: string[]) =>
    unwrap<unknown>(
      argusFetch(`/api/visits/${encodeURIComponent(visitEventId)}/checkout`, {
        method: "POST",
        body: JSON.stringify({ visitorCheckOuts: visitorIds.map((visitorId) => ({ visitorId })) }),
      }),
    ),

  /** Decisão sobre a visita: approve | deny | cancel. */
  decideVisit: (visitEventId: string, decision: "approve" | "deny" | "cancel", comment?: string) =>
    unwrap<unknown>(
      argusFetch(`/api/visits/${encodeURIComponent(visitEventId)}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ comment: comment ?? null }),
      }),
    ),

  listCredentialFormats: async (): Promise<CredentialFormat[]> => {
    const accountId = getAccountId();
    const systemObjectId = getSystemObjectId();
    const q = new URLSearchParams();
    if (systemObjectId) q.set("systemObjectId", systemObjectId);
    if (accountId) q.set("accountId", accountId);
    const data = await unwrap<
      { credentialFormats?: CredentialFormat[]; formats?: CredentialFormat[] } | CredentialFormat[]
    >(argusFetch(`/api/credentials/formats?${q.toString()}`, undefined, { allSites: true }));
    if (Array.isArray(data)) return data;
    return data?.credentialFormats ?? data?.formats ?? [];
  },

  listCredentials: async (identityId: string): Promise<CredentialRecord[]> => {
    try {
      const data = await unwrap<unknown>(
        argusFetch(`/api/identities/${encodeURIComponent(identityId)}/credentials`),
      );
      return parseCredentialsResponse(data);
    } catch (e) {
      // 404 = identidade sem credenciais cadastradas.
      if (e instanceof ArgusApiError && e.status === 404) return [];
      throw e;
    }
  },

  createCredential: (payload: CredentialUpsert) => {
    const status: Record<string, unknown> = { state: "Active" };
    if (payload.activationDateUtc) {
      status.activationDateUtc = payload.activationDateUtc;
    }
    if (payload.expirationDateUtc) {
      status.expirationDateUtc = payload.expirationDateUtc;
      const start = payload.activationDateUtc
        ? new Date(payload.activationDateUtc)
        : new Date();
      const end = new Date(payload.expirationDateUtc);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const days = Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 86400000),
        );
        status.expirationDurationInDays = days;
      }
    }
    const body: Record<string, unknown> = {
      credentialFormat: {
        formatId: payload.formatId,
        facilityCode: payload.facilityCode ?? null,
        cardNumber: payload.cardNumber,
      },
      name: payload.name ?? `Cred ${payload.cardNumber}`,
      identityId: payload.identityId,
      status,
    };
    if (payload.description) body.description = payload.description;
    return unwrap<CredentialRecord>(
      argusFetch(`/api/credentials`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  },

  deleteCredential: (credentialId: string) =>
    unwrap<void>(
      argusFetch(`/api/credentials/${encodeURIComponent(credentialId)}`, {
        method: "DELETE",
      }),
    ),

  /** Baixa a foto da identidade como Blob. Retorna null em 404. */
  getIdentityPicture: async (id: string): Promise<Blob | null> => {
    const cfg = getConfig();
    if (!cfg.baseUrl) return null;
    let url = cfg.baseUrl.replace(/\/+$/, "") + `/api/identities/${encodeURIComponent(id)}/picture`;
    const headers = new Headers();
    if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
    const acc = getAccountId();
    if (acc) headers.set("X-Account-Id", acc);
    const sys = getSystemObjectId();
    if (sys) {
      headers.set("X-System-Object-Id", sys);
      url += (url.includes("?") ? "&" : "?") + "systemObjectId=" + encodeURIComponent(sys);
    }
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new ArgusApiError({ status: res.status, message: res.statusText });
    return await res.blob();
  },

  /** Envia uma nova foto (JPEG) para a identidade. */
  uploadIdentityPicture: async (id: string, blob: Blob): Promise<void> => {
    const cfg = getConfig();
    if (!cfg.baseUrl) throw new ArgusApiError({ status: 0, message: "Base URL não configurada" });
    let url = cfg.baseUrl.replace(/\/+$/, "") + `/api/identities/${encodeURIComponent(id)}/picture`;
    const form = new FormData();
    form.append("picture", blob, "capture.jpg");
    const headers = new Headers();
    if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
    const acc = getAccountId();
    if (acc) headers.set("X-Account-Id", acc);
    const sys = getSystemObjectId();
    if (sys) {
      headers.set("X-System-Object-Id", sys);
      url += (url.includes("?") ? "&" : "?") + "systemObjectId=" + encodeURIComponent(sys);
    }
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

export function getClearIdExternalId(i: Pick<ClearIdIdentity, "externalId" | "systemData"> | Pick<IdentityUpsert, "externalId" | "systemData">): string {
  const systemExternalId = i.systemData?.externalId;
  if (typeof systemExternalId === "string" && systemExternalId.trim()) return systemExternalId;
  return i.externalId ?? "";
}

export function clearIdToFormValues(i: ClearIdIdentity): IdentityUpsert & { identityId: string } {
  const company = (i.companyData ?? null) as Record<string, unknown> | null;
  const siteIdFromCompany =
    company && typeof company.siteId === "string" ? (company.siteId as string) : undefined;
  const workerTypeFromCompany =
    company && typeof company.workerTypeCode === "string"
      ? (company.workerTypeCode as string)
      : undefined;
  return {
    identityId: i.identityId,
    externalId: getClearIdExternalId(i),
    firstName: i.firstName ?? "",
    lastName: i.lastName ?? "",
    email: i.email ?? "",
    status: (i.status === "Inactive" ? "Inactive" : "Active") as "Active" | "Inactive",
    customFields: customFieldsToRecord(i.systemData?.customFields),
    siteId:
      siteIdFromCompany ??
      ((i as unknown as { siteId?: string }).siteId ?? undefined),
    workerTypeCode: workerTypeFromCompany ?? i.workerTypeCode ?? undefined,
    // Dados aninhados/adicionais preservados para o formulário completo.
    middleName: i.middleName ?? undefined,
    displayName: i.displayName ?? undefined,
    description: i.description ?? undefined,
    countryCode: i.countryCode ?? undefined,
    culture: i.culture ?? undefined,
    privateData: i.privateData ?? undefined,
    companyData: i.companyData ?? undefined,
  };
}