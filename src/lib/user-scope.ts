// Fonte dos CLIENTES do dropdown.
//
// Approach (set 2026): a lista de clientes vem do CorporateData
// (`/api/clientes`) SEM filtro por domínio de permissão no frontend. A
// restrição de acesso é enforçada no BACKEND (ArgusSiteRequirement / policies
// do ArgusClearId.Api). Filtrar aqui pelo grant se mostrou frágil (formatos
// de grant divergentes, fallback zerando a lista) e deixava o dropdown vazio.
//
// Fallback: se o CorporateData não responder (ex.: dev sem cookie), usa
// CLEARID_PROFILES para o app não ficar sem clientes.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CLEARID_PROFILES, type ClearIdProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";

export interface UserScope {
  /** Mantido por compatibilidade; hoje a restrição é no backend. */
  restrictByUser: boolean;
  /** Códigos de cliente visíveis (lowercase). */
  allowedClientCodes: Set<string>;
  /** Clientes visíveis no dropdown. */
  visibleProfiles: ClearIdProfile[];
  /** Compat: não usado no filtro atual. */
  allowedSiteNames: (profile: string) => Set<string>;
  /** Filtro de sites — passthrough (restrição é no backend). */
  filterSites: <T extends { name?: string | null }>(sites: T[], profile: string) => T[];
}

export function useUserScope(): UserScope {
  const { data: clientes } = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const clientesKey = (clientes ?? []).map((c) => `${c.id}:${c.code}`).join(",");

  return useMemo(() => {
    // Todos os clientes do CorporateData; fallback para CLEARID_PROFILES.
    const visibleProfiles: ClearIdProfile[] =
      clientes && clientes.length > 0
        ? clientes.map((c) => ({ code: c.code, label: c.name }))
        : CLEARID_PROFILES;

    const allowedClientCodes = new Set(visibleProfiles.map((p) => p.code.toLowerCase()));

    // Sem restrição no front: o backend valida acesso por site.
    const restrictByUser = false;
    const allowedSiteNames = (): Set<string> => new Set<string>();
    const filterSites = <T extends { name?: string | null }>(sites: T[]): T[] => sites;

    return { restrictByUser, allowedClientCodes, visibleProfiles, allowedSiteNames, filterSites };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesKey]);
}
