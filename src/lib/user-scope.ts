// Helpers para restringir listagens (clientes/sites) ao que o usuário logado
// tem grant no Portal Argus. Os grants vêm em CurrentUser.sites no formato
// "Cliente:Site" (ex.: "Corteva:LA-BR-Alphaville", "Vylor:LA-BR-Itumbiara").
//
// Fallback gracioso: se o backend não devolveu sites (dev/CORS off, ou usuário
// sem grants ainda), NADA é restringido — a UI se comporta como antes. Isso
// evita travar o app durante desenvolvimento local.
import { useMemo } from "react";
import { useCurrentUser } from "@/lib/current-user";
import { CLEARID_PROFILES, type ClearIdProfile } from "@/lib/argus-client";

export interface UserScope {
  /** true se o usuário tem grants; false → não restringir (dev/fallback). */
  restrictByUser: boolean;
  /** Códigos de cliente permitidos (lowercase). */
  allowedClientCodes: Set<string>;
  /** Perfis de cliente visíveis (filtrados pelos grants). */
  visibleProfiles: ClearIdProfile[];
  /**
   * Nomes de site permitidos NO CLIENTE informado, em lowercase.
   * Usado para filtrar `listSites()` (que devolve pelo nome do site).
   */
  allowedSiteNames: (profile: string) => Set<string>;
  /**
   * Filtro pronto: recebe a lista bruta de sites do ClearID e o cliente
   * atual; devolve só os sites cujo nome bate com o grant do usuário. Se
   * `restrictByUser=false`, devolve a lista original.
   */
  filterSites: <T extends { name?: string | null }>(sites: T[], profile: string) => T[];
}

export function useUserScope(): UserScope {
  const { data: currentUser } = useCurrentUser();
  const userSites = currentUser?.sites ?? [];

  return useMemo(() => {
    const restrictByUser = userSites.length > 0;

    const allowedClientCodes = new Set(
      userSites.map((s) => (s.split(":")[0] ?? "").toLowerCase()),
    );

    const visibleProfiles = restrictByUser
      ? CLEARID_PROFILES.filter((p) => allowedClientCodes.has(p.code.toLowerCase()))
      : CLEARID_PROFILES;

    const allowedSiteNames = (profile: string): Set<string> =>
      new Set(
        userSites
          .filter((s) => (s.split(":")[0] ?? "").toLowerCase() === profile.toLowerCase())
          .map((s) => s.split(":").slice(1).join(":").toLowerCase()),
      );

    /**
     * Filtra sites do ClearID pelo grant do usuário.
     * - Compara por `name` E por `siteId` (o que o Portal Argus guardar em
     *   UserSites.SiteCode pode ser o nome de exibição OU o guid — aceitamos
     *   ambos para não engessar o cadastro).
     * - Soft-fallback: se o usuário tem grant no cliente mas o filtro
     *   devolveria vazio (naming divergiu entre Portal Argus e ClearID),
     *   retorna a lista SEM filtrar e loga um aviso. É mais seguro exibir
     *   demais do que esconder tudo e travar o operador.
     */
    const filterSites = <T extends { name?: string | null; siteId?: string | null }>(
      sites: T[],
      profile: string,
    ): T[] => {
      if (!restrictByUser) return sites;
      const allowed = allowedSiteNames(profile);
      if (allowed.size === 0) return []; // sem grant nesse cliente → esconde tudo
      const filtered = sites.filter((s) => {
        const name = (s.name ?? "").toLowerCase();
        const id = (s.siteId ?? "").toLowerCase();
        return allowed.has(name) || (id && allowed.has(id));
      });
      if (filtered.length === 0 && sites.length > 0) {
        console.warn(
          `[user-scope] grant do usuário em '${profile}' (${[...allowed].join(", ")}) não bateu ` +
            `com nenhum site retornado pelo ClearID (${sites
              .map((s) => s.name)
              .join(", ")}). Exibindo lista completa como fallback — ajuste UserSites.SiteCode ` +
            `no Portal Argus para bater com Site.Name do ClearID.`,
        );
        return sites;
      }
      return filtered;
    };

    return { restrictByUser, allowedClientCodes, visibleProfiles, allowedSiteNames, filterSites };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSites.join(",")]);
}
