// Restringe o dropdown de clientes ao DOMÍNIO DE PERMISSÃO do usuário logado.
//
// O domínio vem em CurrentUser.sites (claim `argus_sites`). Dois formatos
// coexistem:
//   - prod: `clienteId:siteId` numérico (ex.: "1:9")
//   - dev/mock: `Code:SiteName` (ex.: "RM:RM", "Corteva:Demo Site")
// então casamos a parte de cliente do grant contra o id OU o código.
//
// Catálogo de clientes: CorporateData (por id/código/nome). Fallback para
// CLEARID_PROFILES (hardcoded) quando o CorporateData não responde — ex.: dev
// local sem o cookie SSO, onde /api/clientes dá 401. Assim o app não fica sem
// clientes em nenhum ambiente.
//
// O filtro por SITE está relaxado (mostra todos os sites do cliente permitido):
// a lista de sites atual não carrega o id do CorporateData para casar com o
// grant. A restrição de nível de CLIENTE segue valendo.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/current-user";
import { CLEARID_PROFILES, type ClearIdProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";

export interface UserScope {
  /** true quando a restrição por domínio está ativa (bypass off). */
  restrictByUser: boolean;
  /** Códigos de cliente permitidos (lowercase). */
  allowedClientCodes: Set<string>;
  /** Clientes visíveis = os do domínio de permissão (únicos). */
  visibleProfiles: ClearIdProfile[];
  /** Compat: nomes de site permitidos (não usado no filtro atual). */
  allowedSiteNames: (profile: string) => Set<string>;
  /** Filtro de sites — passthrough (restrição é no nível de cliente). */
  filterSites: <T extends { name?: string | null }>(sites: T[], profile: string) => T[];
}

interface ClientEntry {
  idKey: string;
  codeKey: string;
  code: string;
  label: string;
}

export function useUserScope(): UserScope {
  const { data: currentUser } = useCurrentUser();
  const grants = currentUser?.sites ?? [];
  const { data: clientes } = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const grantsKey = grants.join(",");
  const clientesKey = (clientes ?? []).map((c) => `${c.id}:${c.code}`).join(",");

  return useMemo(() => {
    const bypass = import.meta.env.VITE_DISABLE_ACCESS_SCOPE === "true";
    const restrictByUser = !bypass;

    const allowedClientKeys = new Set(
      grants.map((g) => (g.split(":")[0] ?? "").trim().toLowerCase()).filter(Boolean),
    );

    // Catálogo: CorporateData quando disponível; senão CLEARID_PROFILES.
    const list: ClientEntry[] =
      clientes && clientes.length > 0
        ? clientes.map((c) => ({
            idKey: String(c.id).toLowerCase(),
            codeKey: c.code.toLowerCase(),
            code: c.code,
            label: c.name,
          }))
        : CLEARID_PROFILES.map((p) => ({
            idKey: p.code.toLowerCase(),
            codeKey: p.code.toLowerCase(),
            code: p.code,
            label: p.label,
          }));

    const visibleProfiles: ClearIdProfile[] = (
      restrictByUser
        ? list.filter(
            (c) => allowedClientKeys.has(c.idKey) || allowedClientKeys.has(c.codeKey),
          )
        : list
    ).map((c) => ({ code: c.code, label: c.label }));

    const allowedClientCodes = new Set(visibleProfiles.map((p) => p.code.toLowerCase()));

    const allowedSiteNames = (): Set<string> => new Set<string>();
    const filterSites = <T extends { name?: string | null }>(sites: T[]): T[] => sites;

    return { restrictByUser, allowedClientCodes, visibleProfiles, allowedSiteNames, filterSites };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantsKey, clientesKey]);
}
