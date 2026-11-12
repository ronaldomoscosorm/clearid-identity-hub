// Configuração OBRIGATÓRIA do usuário logado no cliente ativo: site, regra e
// sistema padrão. Sem ela o trabalho não começa — a regra padrão é o que dá
// acesso às pessoas cadastradas e o sistema é exigido nas credenciais.
// Não pode ser fechada; as saídas são salvar, trocar de cliente ou sair.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  argusApi,
  type ClearIdProfile,
  type ClearIdSite,
  type ClearIdTeam,
} from "@/lib/argus-client";
import {
  applyUserClientDefaults,
  useUpdateUserClientDefaults,
  useUpdateUserDefaultProfile,
  type UserClientDefaults,
} from "@/lib/user-defaults";
import { useT } from "@/lib/i18n";

const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
const byName = (a: { name?: string | null }, b: { name?: string | null }) =>
  (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" });

/**
 * Regra "General Access" do site, pelo código entre parênteses no nome do site
 * (ex.: "LA-BR-Itumbiara (ITU1)" → "LA-BR-ITU1-General Access"). Só sugere
 * quando há exatamente uma candidata.
 */
function suggestRule(siteName: string | undefined, teams: ClearIdTeam[]): ClearIdTeam | null {
  const code = norm(/\(([^)]+)\)\s*$/.exec(siteName ?? "")?.[1] ?? "");
  if (!code) return null;
  const hits = teams.filter(
    (t) => /general\s*access/i.test(t.name ?? "") && norm(t.name ?? "").includes(code),
  );
  return hits.length === 1 ? hits[0] : null;
}

export function RequiredDefaultsDialog({
  userKey,
  profile,
  current,
  sites,
  sitesLoading,
  profiles,
  onChangeProfile,
  setAsDefaultProfile,
  onSaved,
  onLogout,
}: {
  userKey: string;
  profile: string;
  /** Defaults já salvos do usuário neste cliente (podem estar incompletos). */
  current: UserClientDefaults;
  /** Sites que o usuário pode usar neste cliente. */
  sites: ClearIdSite[];
  sitesLoading: boolean;
  profiles: ClearIdProfile[];
  onChangeProfile: (code: string) => void;
  /** Usuário ainda sem cliente padrão: este passa a ser o dele. */
  setAsDefaultProfile: boolean;
  onSaved: () => void;
  onLogout: () => void;
}) {
  const { t } = useT();
  const [siteId, setSiteId] = useState(current.defaultSiteId ?? "");
  const [ruleId, setRuleId] = useState(current.defaultRuleId ?? "");
  const [systemId, setSystemId] = useState(current.systemObjectId ?? "");
  const updateDefaults = useUpdateUserClientDefaults();
  const updateDefaultProfile = useUpdateUserDefaultProfile();

  const teamsQuery = useQuery({
    queryKey: ["argus", "teams", profile, siteId],
    queryFn: () => argusApi.listTeams({ take: 200, siteId, environment: profile }),
    enabled: !!siteId,
    staleTime: 60_000,
  });
  const systemsQuery = useQuery({
    queryKey: ["argus", "systems", profile],
    queryFn: () => argusApi.listSystems(profile),
    staleTime: 60_000,
  });
  const teams = (teamsQuery.data ?? []).filter((x) => !x.isDeleted);
  const systems = systemsQuery.data ?? [];
  const site = sites.find((s) => s.siteId === siteId);

  // Sugere a regra General Access do site escolhido e o sistema, quando único.
  useEffect(() => {
    if (ruleId || !teamsQuery.data) return;
    const hit = suggestRule(site?.name, teams);
    if (hit) setRuleId(hit.teamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsQuery.data, siteId]);
  useEffect(() => {
    if (!systemId && systems.length === 1) setSystemId(systems[0].systemObjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemsQuery.data]);

  const changeSite = (id: string) => {
    setSiteId(id);
    setRuleId("");
  };

  // Lista carregada e vazia = não há o que escolher; não trava o usuário.
  const siteRequired = sitesLoading || sites.length > 0;
  const ruleRequired = siteRequired && !(teamsQuery.isSuccess && teams.length === 0);
  const systemRequired = !(systemsQuery.isSuccess && systems.length === 0);
  const ready =
    (!siteRequired || !!site) &&
    (!ruleRequired || teams.some((x) => x.teamId === ruleId)) &&
    (!systemRequired || systems.some((x) => x.systemObjectId === systemId));

  const save = async () => {
    const defaults: UserClientDefaults = {
      ...current,
      defaultSiteId: site?.siteId ?? null,
      defaultSiteName: site?.name ?? null,
      defaultRuleId: ruleId || null,
      defaultRuleName: teams.find((x) => x.teamId === ruleId)?.name ?? null,
      systemObjectId: systemId || null,
    };
    try {
      await updateDefaults.mutateAsync({ userKey, profile, defaults });
      if (setAsDefaultProfile) updateDefaultProfile.mutate({ userKey, defaultProfile: profile });
      applyUserClientDefaults(defaults);
      toast.success(t("requiredDefaults.saved"));
      onSaved();
    } catch (e) {
      toast.error(t("requiredDefaults.saveError", { message: (e as Error).message }));
    }
  };

  const loadError = (teamsQuery.error ?? systemsQuery.error) as Error | null;

  return (
    <AlertDialog open>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("requiredDefaults.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("requiredDefaults.description", { client: profile })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {profiles.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="rd-client">{t("settings.client.label")}</Label>
              <Select value={profile} onValueChange={onChangeProfile}>
                <SelectTrigger id="rd-client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rd-site">{t("settings.site.label")}</Label>
            <Select value={siteId} onValueChange={changeSite} disabled={sitesLoading}>
              <SelectTrigger id="rd-site">
                <SelectValue
                  placeholder={
                    sitesLoading ? t("settings.site.loading") : t("settings.site.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sites
                  .slice()
                  .sort(byName)
                  .map((s) => (
                    <SelectItem key={s.siteId} value={s.siteId}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rd-rule">{t("settings.rule.label")}</Label>
            <Select
              value={ruleId}
              onValueChange={setRuleId}
              disabled={!siteId || teamsQuery.isLoading}
            >
              <SelectTrigger id="rd-rule">
                <SelectValue
                  placeholder={
                    teamsQuery.isLoading
                      ? t("settings.rule.loading")
                      : t("settings.rule.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {teams
                  .slice()
                  .sort(byName)
                  .map((x) => (
                    <SelectItem key={x.teamId} value={x.teamId}>
                      {x.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("requiredDefaults.ruleHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rd-system">{t("settings.system.label")}</Label>
            <Select value={systemId} onValueChange={setSystemId} disabled={systemsQuery.isLoading}>
              <SelectTrigger id="rd-system">
                <SelectValue
                  placeholder={
                    systemsQuery.isLoading
                      ? t("settings.system.loading")
                      : t("settings.system.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {systems
                  .slice()
                  .sort(byName)
                  .map((x) => (
                    <SelectItem key={x.systemObjectId} value={x.systemObjectId}>
                      {x.name || x.systemObjectId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {loadError && (
            <div className="flex items-center justify-between gap-3 text-sm text-destructive">
              <span>{loadError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (teamsQuery.error) void teamsQuery.refetch();
                  if (systemsQuery.error) void systemsQuery.refetch();
                }}
              >
                {t("requiredDefaults.retry")}
              </Button>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button type="button" variant="ghost" onClick={onLogout}>
            <LogOut className="mr-1 h-4 w-4" /> {t("requiredDefaults.logout")}
          </Button>
          <Button type="button" onClick={save} disabled={!ready || updateDefaults.isPending}>
            {t("requiredDefaults.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
