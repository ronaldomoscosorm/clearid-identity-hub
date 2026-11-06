/**
 * Cliente da API ArgusSCSaaS (Security Center SaaS / WebSdk da Genetec).
 *
 * Mesma autenticação do ArgusClearId.Api (JWT do Portal Argus via SSO token ou
 * apiKey legado) e mesmo seletor de cliente (header X-ClearId-Environment).
 * A base vem de VITE_SCSAAS_API_BASE_URL.
 */
import { ArgusApiError, getActiveProfile } from "@/lib/argus-client";
import { getConfig } from "@/lib/argus-env";
import { getSsoToken } from "@/lib/sso-token";

const BASE_URL =
  (import.meta.env.VITE_SCSAAS_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ??
  "https://argusscsaas.rmtecho.com.br";

export interface ScEntity {
  guid: string;
  name?: string | null;
  entityType?: string | null;
}

export interface ScAccessPoint extends ScEntity {
  door?: string | null;
  accessPointGroup?: string | null;
  accessPointType?: string | null;
}

/** Área do Security Center: `allDoors` são os GUIDs das portas que ela contém. */
export interface ScArea extends ScEntity {
  allDoors?: string[] | null;
}

/** Porta do Security Center: `areas` são os GUIDs das áreas a que pertence. */
export interface ScDoor extends ScEntity {
  areas?: string[] | null;
}

export interface DoorEvent {
  timestamp: string;
  eventType: number;
  eventTypeName: string;
  accessPointGuid?: string | null;
  accessPointGroupGuid?: string | null;
  doorName?: string | null;
  cardholderGuid?: string | null;
  cardholderName?: string | null;
  credentialGuid?: string | null;
  unitGuid?: string | null;
  timeZone?: string | null;
  customEventMessage?: string | null;
}

export interface DoorEventTarget {
  guid: string;
  name?: string | null;
  entityType?: string | null;
}

export interface DoorEventSearchResult {
  items: DoorEvent[];
  page: number;
  pageSize: number;
  total: number;
  from: string;
  to: string;
  status: string;
  truncated: boolean;
  targets: DoorEventTarget[];
}

export interface DoorEventFilters {
  doors?: string[];
  areas?: string[];
  doorName?: string;
  cardholder?: string;
  cardholderName?: string;
  /** Nomes de evento do SDK (ex.: AccessGranted). */
  events?: string[];
  /** Códigos numéricos de evento. */
  eventTypes?: number[];
  from?: string;
  to?: string;
  sortOrder?: "Ascending" | "Descending";
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number | null;
  traceId?: string;
}

function buildHeaders(accept = "application/json"): Headers {
  const headers = new Headers();
  const cfg = getConfig();
  if (cfg.apiKey) headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  else {
    const token = getSsoToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("X-ClearId-Environment", getActiveProfile());
  headers.set("Accept", accept);
  return headers;
}

function filtersToQuery(f: DoorEventFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.doors?.length) q.set("doors", f.doors.join(","));
  if (f.areas?.length) q.set("areas", f.areas.join(","));
  if (f.doorName) q.set("doorName", f.doorName);
  if (f.cardholder) q.set("cardholder", f.cardholder);
  if (f.cardholderName) q.set("cardholderName", f.cardholderName);
  if (f.events?.length) q.set("events", f.events.join(","));
  if (f.eventTypes?.length) q.set("eventTypes", f.eventTypes.join(","));
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.sortOrder) q.set("sortOrder", f.sortOrder);
  return q;
}

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, { credentials: "include", headers: buildHeaders() });
  } catch (e) {
    throw new ArgusApiError({
      status: 0,
      message: `Falha de rede ao chamar ${BASE_URL}${path}: ${(e as Error).message}`,
    });
  }
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new ArgusApiError({
      status: res.status,
      message: body?.message || res.statusText || `HTTP ${res.status}`,
      raw: body,
    });
  }
  return body.data as T;
}

async function fetchBlob(path: string): Promise<{ blob: Blob; fileName: string | null }> {
  const res = await fetch(BASE_URL + path, {
    credentials: "include",
    headers: buildHeaders("*/*"),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Envelope<unknown> | null;
    throw new ArgusApiError({
      status: res.status,
      message: body?.message || res.statusText || `HTTP ${res.status}`,
      raw: body,
    });
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), fileName: match ? decodeURIComponent(match[1]) : null };
}

async function listAll<T>(path: string): Promise<T[]> {
  const page = await fetchJson<{ items: T[] }>(`${path}?expand=true&page=1&pageSize=500`);
  return page.items ?? [];
}

export const scsaasApi = {
  baseUrl: BASE_URL,

  /** Portas do cliente (nome resolvido). */
  listDoors: () => listAll<ScDoor>("/api/security-center/doors"),

  /** Áreas do cliente (nome resolvido), com as portas de cada uma. */
  listAreas: () => listAll<ScArea>("/api/security-center/areas"),

  /** Pontos de acesso do cliente; usados como alvo quando o tenant não tem portas. */
  listAccessPoints: () => listAll<ScAccessPoint>("/api/security-center/access-points"),

  /** Pesquisa paginada de eventos de portas. */
  searchDoorEvents: (filters: DoorEventFilters, page: number, pageSize: number) => {
    const q = filtersToQuery(filters);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return fetchJson<DoorEventSearchResult>(
      `/api/security-center/reports/door-events?${q.toString()}`,
    );
  },

  /** Exportação dos eventos filtrados em CSV ou Excel. */
  exportDoorEvents: (filters: DoorEventFilters, format: "csv" | "xlsx") => {
    const q = filtersToQuery(filters);
    q.set("format", format);
    return fetchBlob(`/api/security-center/reports/door-events/export?${q.toString()}`);
  },
};
