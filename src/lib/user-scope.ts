// Escopo do usuário logado: CLIENTES do dropdown e SITES permitidos.
//
// Clientes: vêm do CorporateData (`/api/clientes`), sem filtro no front
// (fallback CLEARID_PROFILES se o CorporateData não responder).
//
// Sites: FAIL-CLOSED. Usuário real só vê os sites com grant para o cliente
// ativo (Portal /api/me → endpoint admin → claim argus_sites); sem grant, vê
// NENHUM. Só o dev bypass (accessProfileId "0") vê tudo. O backend
// (ArgusSiteRequirement) continua validando o acesso por site.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CLEARID_PROFILES, type ClearIdProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";
import { useCurrentUser } from "@/lib/current-user";
import { PORTAL_BASE, usePortalMe } from "@/lib/menu-tree";

export interface UserScope {
  /** true para usuário real (não dev): o filtro de sites é sempre aplicado. */
  restrictByUser: boolean;
  /** Códigos de cliente visíveis (lowercase). */
  allowedClientCodes: Set<string>;
  /** Clientes visíveis no dropdown. */
  visibleProfiles: ClearIdProfile[];
  /**
   * Grants de site do usuário no formato `cliente:site` (mesmo formato do site
   * ativo e da claim `argus_sites`). Mescla Portal (reativo) + claim do JWT.
   */
  siteGrants: string[];
  /** Nomes de site permitidos (normalizados) para o cliente informado (grants por nome). */
  allowedSiteNames: (profile: string) => Set<string>;
  /**
   * siteIds do ClearID permitidos para o cliente. Grants do Portal vêm como
   * `clienteId:siteId` (ids do CorporateData, ex.: "1:12"); o siteId do
   * CorporateData é resolvido para o externalId (= siteId do ClearID).
   */
  allowedSiteIds: (profile: string) => Set<string>;
  /**
   * Filtra os sites do catálogo ClearID pelos grants do usuário para o cliente.
   * FAIL-CLOSED: usuário real sem grant para o cliente → NENHUM site (só o dev
   * bypass, accessProfileId "0", vê tudo). Grants: Portal /api/me → endpoint
   * admin → claim do JWT.
   */
  filterSites: <T extends { name?: string | null; siteId?: string | null }>(
    sites: T[],
    profile: string,
  ) => T[];
}

/** Normaliza código/nome de site e de cliente para comparação. */
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** Nome sem o código final entre parênteses: "LA-BR-Alphaville (ALP-1)" → "la-br-alphaville". */
const baseName = (s: string | null | undefined) => norm((s ?? "").replace(/\s*\([^)]*\)\s*$/, ""));
/** Código final entre parênteses: "LA-BR-Alphaville (ALP-1)" → "alp-1" ("" se não houver). */
const codeOf = (s: string | null | undefined) => {
  const m = (s ?? "").match(/\(([^)]+)\)\s*$/);
  return m ? norm(m[1]) : "";
};
/**
 * Chaves de casamento de um site (nome completo, nome sem código e código),
 * para tolerar grant sem o sufixo "(CÓDIGO)" ou só com o código.
 */
const siteKeys = (s: string | null | undefined): string[] =>
  [norm(s), baseName(s), codeOf(s)].filter((k) => k.length > 0);

/** `UserSiteDTO` do Portal (`GET /api/users/{id}/sites`). */
interface PortalUserSite {
  clientCode?: string | null;
  siteCode?: string | null;
  ClientCode?: string | null;
  SiteCode?: string | null;
}

async function fetchPortalUserSites(userId: number): Promise<string[]> {
  const res = await fetch(`${PORTAL_BASE.replace(/\/+$/, "")}/users/${userId}/sites`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET portal /api/users/${userId}/sites falhou (${res.status})`);
  const rows = (await res.json()) as PortalUserSite[];
  return (Array.isArray(rows) ? rows : [])
    .map((r) => `${(r.clientCode ?? r.ClientCode ?? "").trim()}:${(r.siteCode ?? r.SiteCode ?? "").trim()}`)
    .filter((g) => g !== ":" && !g.startsWith(":") && !g.endsWith(":"));
}

export function useUserScope(): UserScope {
  const { data: clientes } = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Grants de site: Portal /api/me (reativo) → endpoint admin → claim do JWT.
  const { data: user } = useCurrentUser();
  const portalMe = usePortalMe(!!user);
  const portalUserId = portalMe.data?.id ?? null;
  const meSites = portalMe.data?.sites ?? null;
  const portalSites = useQuery({
    queryKey: ["portal-user-sites", portalUserId],
    queryFn: () => fetchPortalUserSites(portalUserId as number),
    enabled: portalUserId != null && portalMe.isSuccess && meSites == null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const claimSites = user?.sites ?? [];
  const portalGrants = meSites ?? portalSites.data ?? [];

  const clientesKey = (clientes ?? []).map((c) => `${c.id}:${c.code}`).join(",");
  const grantsKey = [...portalGrants, ...claimSites].join("|");

  // União Portal + claim, sem duplicatas (comparação normalizada).
  const siteGrants = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of [...portalGrants, ...claimSites]) {
      const key = norm(g);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantsKey]);

  // Clientes referenciados nos grants (parte antes do ":"): id numérico do
  // CorporateData ou código do cliente — resolvidos para o id numérico.
  const grantClientIds = useMemo(() => {
    const ids = new Set<number>();
    for (const g of siteGrants) {
      const i = g.indexOf(":");
      if (i < 0) continue;
      const c = g.slice(0, i).trim();
      const n = Number(c);
      if (Number.isInteger(n) && n > 0) ids.add(n);
      else {
        const found = (clientes ?? []).find((x) => norm(x.code) === norm(c));
        if (found) ids.add(found.id);
      }
    }
    return [...ids].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteGrants, clientesKey]);

  // Sites (CorporateData) dos clientes com grant → externalId (siteId ClearID).
  // Chaves: "clienteId:<siteId CorporateData>" e "clienteId:<nome normalizado>".
  const grantSitesQuery = useQuery({
    queryKey: ["corporatedata", "grant-sites", grantClientIds.join(",")],
    enabled: grantClientIds.length > 0,
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const map = new Map<string, string>();
      await Promise.all(
        grantClientIds.map(async (cid) => {
          const list = await corporateData.listClearIdSites(cid).catch(() => []);
          for (const st of list) {
            if (!st.externalId) continue;
            map.set(`${cid}:${st.id}`, st.externalId);
            for (const k of siteKeys(st.name)) map.set(`${cid}:${k}`, st.externalId);
          }
        }),
      );
      return map;
    },
  });
  const grantSiteMap = grantSitesQuery.data ?? new Map<string, string>();

  return useMemo(() => {
    // Dev/sem-auth (accessProfileId "0") não restringe; usuário real sempre restringe.
    const devBypass = user?.accessProfileId === "0";
    const restrictByUser = !!user && !devBypass;

    // Catálogo de clientes do CorporateData (fallback CLEARID_PROFILES só no
    // dev bypass). Usuário real: FAIL-CLOSED — só os clientes com pelo menos um
    // grant de site (parte "cliente" do grant: id numérico ou código).
    const allProfiles: ClearIdProfile[] =
      clientes && clientes.length > 0
        ? clientes.map((c) => ({ code: c.code, label: c.name }))
        : CLEARID_PROFILES;
    const grantIds = new Set(grantClientIds);
    const grantCodes = new Set(
      siteGrants
        .map((g) => g.slice(0, g.indexOf(":")).trim())
        .filter((c) => c && !/^\d+$/.test(c))
        .map(norm),
    );
    const visibleProfiles: ClearIdProfile[] = !restrictByUser
      ? allProfiles
      : allProfiles.filter((p) => {
          const c = (clientes ?? []).find((x) => norm(x.code) === norm(p.code));
          return (c != null && grantIds.has(c.id)) || grantCodes.has(norm(p.code));
        });
    const allowedClientCodes = new Set(visibleProfiles.map((p) => p.code.toLowerCase()));

    // id numérico (CorporateData) do cliente/profile.
    const clienteIdOf = (profile: string): number | null => {
      const c = (clientes ?? []).find((x) => norm(x.code) === norm(profile));
      return c ? c.id : null;
    };
    // Parte "site" dos grants do cliente (casa por id numérico OU por código).
    const grantSitesOf = (profile: string): string[] => {
      const cid = clienteIdOf(profile);
      const code = norm(profile);
      const out: string[] = [];
      for (const g of siteGrants) {
        const i = g.indexOf(":");
        if (i < 0) continue;
        const c = g.slice(0, i).trim();
        if ((cid != null && c === String(cid)) || norm(c) === code) out.push(g.slice(i + 1).trim());
      }
      return out;
    };

    const allowedSiteNames = (profile: string): Set<string> => {
      const out = new Set<string>();
      for (const sp of grantSitesOf(profile)) for (const k of siteKeys(sp)) out.add(k);
      return out;
    };
    const allowedSiteIds = (profile: string): Set<string> => {
      const out = new Set<string>();
      const cid = clienteIdOf(profile);
      if (cid == null) return out;
      for (const sp of grantSitesOf(profile)) {
        const ext = grantSiteMap.get(`${cid}:${sp}`) ?? grantSiteMap.get(`${cid}:${norm(sp)}`);
        if (ext) out.add(ext);
      }
      return out;
    };

    // FAIL-CLOSED: usuário real só vê sites com grant (por siteId resolvido do
    // CorporateData ou, em fallback, por nome tolerante ao sufixo "(CÓDIGO)").
    const filterSites = <T extends { name?: string | null; siteId?: string | null }>(
      sites: T[],
      profile: string,
    ): T[] => {
      if (devBypass) return sites;
      if (!user) return [];
      const ids = allowedSiteIds(profile);
      const names = allowedSiteNames(profile);
      return sites.filter(
        (st) => (!!st.siteId && ids.has(st.siteId)) || siteKeys(st.name).some((k) => names.has(k)),
      );
    };

    return {
      restrictByUser,
      allowedClientCodes,
      visibleProfiles,
      siteGrants,
      allowedSiteNames,
      allowedSiteIds,
      filterSites,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesKey, siteGrants, grantClientIds, !!user, user?.accessProfileId, grantSiteMap]);
}
