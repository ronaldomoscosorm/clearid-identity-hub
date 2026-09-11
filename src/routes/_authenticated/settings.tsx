import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getConfig, saveConfig, type ArgusEnvConfig } from "@/lib/argus-env";
import {
  argusApi,
  getConfiguredSiteId,
  setConfiguredSiteId,
  getSystemObjectId,
  setSystemObjectId,
  useDefaultProfile,
  setDefaultProfile,
  type DiagnosticsResult,
} from "@/lib/argus-client";
import { Badge } from "@/components/ui/badge";
import { pushSettings } from "@/lib/supabase-settings";
import { useT } from "@/lib/i18n";
import { useUserScope } from "@/lib/user-scope";
import { useCurrentUser } from "@/lib/current-user";
import {
  useUserClientDefaults,
  useUpdateUserClientDefaults,
  useUpdateUserDefaultProfile,
} from "@/lib/user-defaults";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Argus ClearID" }] }),
  component: Settings,
});

function Settings() {
  const [cfg, setCfg] = useState<ArgusEnvConfig>(() => getConfig());
  const [lastResult, setLastResult] = useState<DiagnosticsResult | null>(null);
  const [siteId, setSiteId] = useState<string>(() => getConfiguredSiteId() ?? "");
  const [systemObjectId, setSystemObjectIdState] = useState<string>(() => getSystemObjectId() ?? "");
  const [ruleId, setRuleId] = useState<string>(() => getConfig().defaultRuleId ?? "");
  const qc = useQueryClient();
  const { t } = useT();
  const configuredProfile = useDefaultProfile();
  const scope = useUserScope();

  // Usuário REAL do ClearID (chave dos defaults por usuário).
  const { data: currentUser } = useCurrentUser();
  const userKey = currentUser?.username || undefined;

  // Defaults por (USUÁRIO + CLIENTE): site/regra/system. Ao trocar o cliente
  // configurado, o formulário reflete os defaults salvos do usuário no cliente.
  const clientDefaultsQuery = useUserClientDefaults(userKey, configuredProfile);
  const updateUserClientDefaults = useUpdateUserClientDefaults();
  const updateUserDefaultProfile = useUpdateUserDefaultProfile();
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const d = clientDefaultsQuery.data;
    if (!d) return;
    if (loadedRef.current === configuredProfile) return; // já populou este cliente
    loadedRef.current = configuredProfile;
    setSiteId(d.defaultSiteId ?? "");
    setSystemObjectIdState(d.systemObjectId ?? "");
    setRuleId(d.defaultRuleId ?? "");
    // Aplica também na topbar (default do usuário naquele cliente).
    setConfiguredSiteId(d.defaultSiteId ?? null);
    setSystemObjectId(d.systemObjectId ?? null);
  }, [clientDefaultsQuery.data, configuredProfile]);

  // Troca o cliente PADRÃO do usuário (persistido no servidor por user_key) e
  // limpa o override de sessão. Reseta o ref para o form recarregar os defaults
  // do usuário no novo cliente.
  const changeProfile = (code: string) => {
    if (code === configuredProfile) return;
    setDefaultProfile(code);
    if (userKey) updateUserDefaultProfile.mutate({ userKey, defaultProfile: code });
    loadedRef.current = null;
    setSiteId("");
    setSystemObjectIdState("");
    setRuleId("");
    setConfiguredSiteId(null);
    setSystemObjectId(null);
    qc.invalidateQueries();
  };

  // As listagens de Configurações usam o perfil CONFIGURADO (não o da sessão do
  // topbar), para que trocar o cliente no topo não altere as opções aqui.
  const sitesQuery = useQuery({
    queryKey: ["argus", "sites", configuredProfile],
    queryFn: () => argusApi.listSites(configuredProfile),
    staleTime: 60_000,
  });

  const systemsQuery = useQuery({
    queryKey: ["argus", "systems", configuredProfile],
    queryFn: () => argusApi.listSystems(configuredProfile),
    staleTime: 60_000,
  });

  const teamsQuery = useQuery({
    // O endpoint /api/teams exige siteId — usa o site configurado.
    queryKey: ["argus", "teams", configuredProfile, siteId],
    queryFn: () => argusApi.listTeams({ take: 200, siteId: siteId || undefined, environment: configuredProfile }),
    staleTime: 60_000,
  });

  const test = useMutation({
    mutationFn: argusApi.diagnostics,
    onSuccess: (r) => {
      setLastResult(r);
      if (r.backend.reachable) {
        toast.success(t("settings.toast.connectionOk", { environment: r.environment }));
      } else {
        toast.error(t("settings.toast.connectionFail", { message: r.backend.message ?? t("settings.unreachable") }));
      }
    },
  });

  const handleSave = () => {
    const siteName = sitesQuery.data?.find((s) => s.siteId === siteId)?.name;
    const ruleName = teamsQuery.data?.find((t) => t.teamId === ruleId)?.name;
    const nextCfg: ArgusEnvConfig = {
      ...cfg,
      defaultSiteId: siteId || undefined,
      defaultSiteName: siteName,
      defaultRuleId: ruleId || undefined,
      defaultRuleName: ruleName,
    };
    saveConfig(nextCfg);
    setConfiguredSiteId(siteId || null);
    setSystemObjectId(systemObjectId || null);
    setCfg(nextCfg);
    qc.invalidateQueries();

    // Persiste os defaults por (USUÁRIO + CLIENTE) — o que reaplica ao logar.
    // eslint-disable-next-line no-console
    console.info("[clearid] save user-defaults →", {
      userKey,
      profile: configuredProfile,
      siteId,
      systemObjectId,
      ruleId,
    });
    if (!userKey) {
      toast.warning(
        "Não foi possível identificar o usuário (username vazio no /me) — defaults por usuário NÃO gravados.",
      );
    } else {
      updateUserClientDefaults.mutate(
        {
          userKey,
          profile: configuredProfile,
          defaults: {
            defaultSiteId: siteId || null,
            defaultSiteName: siteName ?? null,
            defaultRuleId: ruleId || null,
            defaultRuleName: ruleName ?? null,
            systemObjectId: systemObjectId || null,
          },
        },
        {
          onError: (e) =>
            toast.error(`Falha ao gravar defaults do cliente: ${(e as Error).message}`),
        },
      );
      // Garante que este cliente seja o padrão do usuário (aterrissa aqui ao logar).
      updateUserDefaultProfile.mutate(
        { userKey, defaultProfile: configuredProfile },
        {
          onError: (e) =>
            toast.error(`Falha ao gravar cliente padrão: ${(e as Error).message}`),
        },
      );
    }

    pushSettings()
      .then(() => toast.success(t("settings.toast.saved")))
      .catch(() => toast.warning(t("settings.toast.savedLocalSyncFail")));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.backend.title")}</CardTitle>
          <CardDescription>{t("settings.backend.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">{t("settings.baseUrl.label")}</Label>
            <Input
              id="baseUrl"
              value={cfg.baseUrl}
              onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
              placeholder="https://argusclearid.rm.local"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">{t("settings.apiKey.label")}</Label>
            <Input
              id="apiKey"
              type="password"
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              placeholder={t("settings.apiKey.placeholder")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? (
                t("settings.testing")
              ) : test.isSuccess && lastResult?.backend.reachable ? (
                <>
                  <CheckCircle2 className="mr-1 h-4 w-4 text-[var(--success)]" /> {t("settings.ok")}
                </>
              ) : test.isSuccess && !lastResult?.backend.reachable ? (
                <>
                  <XCircle className="mr-1 h-4 w-4 text-destructive" /> {t("settings.failed")}
                </>
              ) : (
                t("settings.testConnection")
              )}
            </Button>
            {lastResult && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("settings.currentEnvironment")}</span>
                <Badge variant={lastResult.environment.toLowerCase().startsWith("prod") ? "default" : "secondary"}>
                  {lastResult.environment}
                </Badge>
                {lastResult.clientCode && (
                  <>
                    <span className="text-muted-foreground">{t("settings.clientCode")}</span>
                    <Badge variant="outline">{lastResult.clientCode}</Badge>
                  </>
                )}
                {typeof lastResult.backend.latencyMs === "number" && (
                  <span className="text-xs text-muted-foreground">{lastResult.backend.latencyMs} ms</span>
                )}
              </div>
            )}
          </div>
          {lastResult?.backend.message && !lastResult.backend.reachable && (
            <p className="text-sm text-destructive">{lastResult.backend.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.client.title")}</CardTitle>
          <CardDescription>{t("settings.client.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client">{t("settings.client.label")}</Label>
            <Select value={configuredProfile} onValueChange={changeProfile}>
              <SelectTrigger id="client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scope.visibleProfiles.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.client.hint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.site.title")}</CardTitle>
          <CardDescription>
            {t("settings.site.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="site">{t("settings.site.label")}</Label>
            <Select value={siteId} onValueChange={setSiteId} disabled={sitesQuery.isLoading || !!sitesQuery.error}>
              <SelectTrigger id="site">
                <SelectValue placeholder={
                  sitesQuery.isLoading
                    ? t("settings.site.loading")
                    : sitesQuery.error
                    ? t("settings.site.loadError")
                    : t("settings.site.placeholder")
                } />
              </SelectTrigger>
              <SelectContent>
                {scope
                  .filterSites(sitesQuery.data ?? [], configuredProfile)
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
                  .map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sitesQuery.error && (
              <p className="text-sm text-destructive">
                {(sitesQuery.error as Error).message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.rule.title")}</CardTitle>
          <CardDescription>
            {t("settings.rule.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule">{t("settings.rule.label")}</Label>
            <Select
              value={ruleId}
              onValueChange={setRuleId}
              disabled={teamsQuery.isLoading || !!teamsQuery.error}
            >
              <SelectTrigger id="rule">
                <SelectValue
                  placeholder={
                    teamsQuery.isLoading
                      ? t("settings.rule.loading")
                      : teamsQuery.error
                        ? t("settings.rule.loadError")
                        : t("settings.rule.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(teamsQuery.data ?? [])
                  .filter((t) => !t.isDeleted)
                  .slice()
                  .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" }))
                  .map((t) => (
                    <SelectItem key={t.teamId} value={t.teamId}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {teamsQuery.error && (
              <p className="text-sm text-destructive">{(teamsQuery.error as Error).message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.system.title")}</CardTitle>
          <CardDescription>
            {t("settings.system.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system">{t("settings.system.label")}</Label>
            <Select
              value={systemObjectId}
              onValueChange={setSystemObjectIdState}
              disabled={systemsQuery.isLoading || !!systemsQuery.error}
            >
              <SelectTrigger id="system">
                <SelectValue
                  placeholder={
                    systemsQuery.isLoading
                      ? t("settings.system.loading")
                      : systemsQuery.error
                      ? t("settings.system.loadError")
                      : t("settings.system.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(systemsQuery.data ?? [])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
                  .map((s) => (
                    <SelectItem key={s.systemObjectId} value={s.systemObjectId}>
                      {s.name || s.systemObjectId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {systemsQuery.error && (
              <p className="text-sm text-destructive">
                {(systemsQuery.error as Error).message}
              </p>
            )}
            {systemObjectId && (
              <p className="font-mono text-xs text-muted-foreground">{systemObjectId}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.visits.title")}</CardTitle>
          <CardDescription>{t("settings.visits.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3">
            <Switch
              checked={Boolean(cfg.linkVisitorToIdentity)}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, linkVisitorToIdentity: v }))}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t("settings.visits.linkLabel")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("settings.visits.linkHint")}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>{t("settings.saveButton")}</Button>
      </div>
    </div>
  );
}