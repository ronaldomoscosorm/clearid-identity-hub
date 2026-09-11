// Restringe o dropdown de clientes ao DOMÍNIO DE PERMISSÃO do usuário logado.
//
// O domínio vem em CurrentUser.sites (claim `argus_sites`), no formato
// `clienteId:siteId` com os IDS INTEIROS do CorporateData (ex.: "1:9"). O
// catálogo (código/nome do cliente) vem do CorporateData por id. Vale para
// TODOS os usuários (inclusive admin).
//
// Observação: o filtro por SITE está relaxado (mostra todos os sites do cliente
// permitido) porque a lista de sites atual não carrega o id do CorporateData
// para casar com o grant. A restrição de nível de CLIENTE segue valendo.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/current-user";
import { type ClearIdProfile } from "@/lib/argus-client";
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

export function useUserScope(): UserScope {
  const { data: currentUser } = useCurrentUser();
  const grants = currentUser?.sites ?? []; // ["1:9"] = clienteId:siteId (ids CorporateData)
  const { data: clientes } = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const grantsKey = grants.join(",");
  const clientesKey = (clientes ?? []).map((c) => `${c.id}:${c.code}`).join(",");

  return useMemo(() => {
    const bypass = import.meta.env.VITE_DISABLE_ACCESS_SCOPE === "true";
    const restrictByUser = !bypass;

    // Domínio: ids de cliente (numéricos) presentes nos grants.
    const allowedClienteIds = new Set(
      grants.map((g) => (g.split(":")[0] ?? "").trim()).filter(Boolean),
    );

    const list = clientes ?? [];
    const visibleProfiles: ClearIdProfile[] = (
      restrictByUser ? list.filter((c) => allowedClienteIds.has(String(c.id))) : list
    ).map((c) => ({ code: c.code, label: c.name }));

    const allowedClientCodes = new Set(visibleProfiles.map((p) => p.code.toLowerCase()));

    const allowedSiteNames = (): Set<string> => new Set<string>();
    const filterSites = <T extends { name?: string | null }>(sites: T[]): T[] => sites;

    return { restrictByUser, allowedClientCodes, visibleProfiles, allowedSiteNames, filterSites };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantsKey, clientesKey]);
}
