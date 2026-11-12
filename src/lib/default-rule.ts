// Regra atribuída automaticamente a uma pessoa sem regra, conforme o SITE dela.
//
// A regra padrão do operador vale para o site padrão dele. Quando a pessoa é de
// outro site, a regra padrão do operador seria a errada: vale a "General Access"
// do site da pessoa ou, sem uma candidata única, o operador escolhe.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { argusApi, type ClearIdTeam } from "./argus-client";
import { getConfig, useArgusConfig, type ArgusEnvConfig } from "./argus-env";

export type DefaultRule = { ruleId: string; ruleName?: string };

export type DefaultRuleResolution =
  /** Site padrão do operador → regra padrão dele. */
  | { kind: "own"; rule: DefaultRule }
  /** Outro site → General Access desse site. */
  | { kind: "site"; rule: DefaultRule }
  /** Outro site, sem candidata única → o operador escolhe. */
  | { kind: "choose"; candidates: ClearIdTeam[] }
  /** Nada a atribuir. */
  | { kind: "none" };

const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Regra "General Access" do site, pelo código entre parênteses no nome do site
 * (ex.: "LA-BR-Itumbiara (ITU1)" → "LA-BR-ITU1-General Access"). Só sugere
 * quando há exatamente uma candidata.
 */
export function suggestGeneralAccessRule(
  siteName: string | null | undefined,
  teams: ClearIdTeam[],
): ClearIdTeam | null {
  const code = norm(/\(([^)]+)\)\s*$/.exec(siteName ?? "")?.[1] ?? "");
  if (!code) return null;
  const hits = teams.filter(
    (t) => /general\s*access/i.test(t.name ?? "") && norm(t.name ?? "").includes(code),
  );
  return hits.length === 1 ? hits[0] : null;
}

/** O site da pessoa é diferente do site padrão do operador? */
export function differsFromOwnSite(
  siteId: string | null | undefined,
  cfg: ArgusEnvConfig = getConfig(),
): boolean {
  return (
    !!siteId && !!cfg.defaultSiteId && siteId.toLowerCase() !== cfg.defaultSiteId.toLowerCase()
  );
}

/** `teams` só é consultado quando o site difere do site padrão do operador. */
export function resolveDefaultRule(
  siteId: string | null | undefined,
  siteName: string | null | undefined,
  teams: ClearIdTeam[] | undefined,
  cfg: ArgusEnvConfig = getConfig(),
): DefaultRuleResolution {
  if (!siteId) return { kind: "none" };
  if (!differsFromOwnSite(siteId, cfg)) {
    return cfg.defaultRuleId
      ? { kind: "own", rule: { ruleId: cfg.defaultRuleId, ruleName: cfg.defaultRuleName } }
      : { kind: "none" };
  }
  const candidates = (teams ?? []).filter((t) => !t.isDeleted);
  const hit = suggestGeneralAccessRule(siteName, candidates);
  return hit
    ? { kind: "site", rule: { ruleId: hit.teamId, ruleName: hit.name } }
    : { kind: "choose", candidates };
}

const siteTeamsQuery = (profile: string, siteId: string) => ({
  queryKey: ["argus", "teams", profile, siteId],
  queryFn: () => argusApi.listTeams({ take: 200, siteId, environment: profile }),
  staleTime: 60_000,
});

/** Regra que seria atribuída a uma pessoa do site (para exibir no formulário). */
export function useDefaultRuleForSite(
  profile: string,
  siteId: string | null | undefined,
  siteName: string | null | undefined,
) {
  const cfg = useArgusConfig();
  const differs = differsFromOwnSite(siteId, cfg);
  const teams = useQuery({ ...siteTeamsQuery(profile, siteId ?? ""), enabled: differs });
  return {
    differs,
    ownSiteName: cfg.defaultSiteName ?? null,
    /** null enquanto as regras do site carregam (ou se a carga falhou). */
    resolution:
      differs && !teams.data ? null : resolveDefaultRule(siteId, siteName, teams.data, cfg),
  };
}

/** Resolve a regra no momento de salvar (carrega as regras do site se preciso). */
export async function fetchDefaultRuleForSite(
  qc: QueryClient,
  profile: string,
  siteId: string | null | undefined,
  siteName: string | null | undefined,
): Promise<DefaultRuleResolution> {
  const cfg = getConfig();
  if (!siteId || !differsFromOwnSite(siteId, cfg)) {
    return resolveDefaultRule(siteId, siteName, undefined, cfg);
  }
  const teams = await qc.fetchQuery(siteTeamsQuery(profile, siteId));
  return resolveDefaultRule(siteId, siteName, teams, cfg);
}

/**
 * Ao SALVAR a ficha de uma pessoa: garante que ela tenha a regra padrão.
 * Pessoa do site padrão do operador recebe a regra padrão dele; de outro site,
 * a General Access do site dela. Sem candidata única para o site, nada é
 * atribuído e `missing` avisa que ela ficou sem regra.
 */
export async function ensureRuleOnSave(
  qc: QueryClient,
  profile: string,
  identityId: string,
  siteId: string | null | undefined,
  siteName: string | null | undefined,
): Promise<{ assigned: boolean; ruleName?: string; missing?: boolean }> {
  let rule: DefaultRule | null | undefined;
  if (differsFromOwnSite(siteId)) {
    const r = await fetchDefaultRuleForSite(qc, profile, siteId, siteName);
    rule = r.kind === "site" || r.kind === "own" ? r.rule : null;
  }
  return argusApi.ensureDefaultRule(identityId, rule);
}
