// Cliente do CorporateData (corporatedata.rmtecho.com.br) — catálogo corporativo
// de clientes/sites, fonte de verdade da LISTA de sites exibida no ClearID.
//
// O CorporateData espelha os sites do ClearID (sync) e tem um campo `scope`
// por site (All / ClearIdOnly / ClientesOnly / AplicativosOnly). O dropdown do
// ClearID lista TODOS os sites do cliente (sem filtro de scope).
//
// A PERMISSÃO por usuário (quem acessa o quê) continua no Portal Argus (claim
// `argus_sites` do JWT) — este módulo é só catálogo.
import { getConfig } from "./argus-env";
import { getSsoToken } from "./sso-token";

const CORPORATEDATA_BASE =
  (import.meta.env.VITE_CORPORATEDATA_API_URL as string | undefined)?.replace(/\/+$/, "") ??
  "https://corporatedata.rmtecho.com.br";

/** Cliente/tenant do catálogo corporativo (`ClienteDto` do CorporateData). */
export interface CorporateCliente {
  id: number;
  code: string;
  name: string;
  /** AccountId do ClearID (GUID), quando conhecido. */
  externalAccountId?: string | null;
  isActive: boolean;
  siteCount: number;
}

/** Site do catálogo corporativo (`SiteDto` do CorporateData). */
export interface CorporateSite {
  id: number;
  clienteId: number;
  /** Id do site no ClearID (GUID) — usado como `siteId` no restante do app. */
  externalId: string;
  name: string;
  description?: string | null;
  timeZoneId?: string | null;
  regionId?: string | null;
  isActive: boolean;
  /** All | ClearIdOnly | ClientesOnly | AplicativosOnly. */
  scope: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

async function cdFetch<T>(path: string): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  // Mesma precedência de auth do argusFetch: apiKey legado, senão o SSO token
  // (Bearer) do localStorage; sempre com o cookie SSO (.rmtecho.com.br) via
  // credentials:"include". O CorporateData valida o MESMO JWT (issuer ArthosMFA).
  const cfg = getConfig();
  if (cfg.apiKey) {
    headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  } else {
    const token = getSsoToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${CORPORATEDATA_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    // Sem sessão/permissão no CorporateData — trata como catálogo vazio; o
    // AuthGuard/UserScope já cuidam do fluxo de acesso negado.
    return [] as unknown as T;
  }
  if (!res.ok) {
    throw new Error(`CorporateData ${path} → HTTP ${res.status}`);
  }

  const envelope = (await res.json()) as ApiResponse<T>;
  return (envelope.data ?? ([] as unknown as T)) as T;
}

export const corporateData = {
  /** Lista os clientes ativos do catálogo. */
  listClientes: () => cdFetch<CorporateCliente[]>(`/api/clientes`),
  /** Todos os sites do cliente (sem filtro de scope). */
  listClearIdSites: (clienteId: number) =>
    cdFetch<CorporateSite[]>(`/api/clientes/${clienteId}/sites`),
};
