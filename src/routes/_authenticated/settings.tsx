import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getConfig, saveConfig, type ArgusEnvConfig } from "@/lib/argus-env";
import {
  argusApi,
  getDefaultSiteId,
  setDefaultSiteId,
  getSystemObjectId,
  setSystemObjectId,
  type DiagnosticsResult,
} from "@/lib/argus-client";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Argus ClearID" }] }),
  component: Settings,
});

function Settings() {
  const [cfg, setCfg] = useState<ArgusEnvConfig>(() => getConfig());
  const [lastResult, setLastResult] = useState<DiagnosticsResult | null>(null);
  const [siteId, setSiteId] = useState<string>(() => getDefaultSiteId() ?? "");
  const [systemObjectId, setSystemObjectIdState] = useState<string>(() => getSystemObjectId() ?? "");
  const qc = useQueryClient();

  const sitesQuery = useQuery({
    queryKey: ["argus", "sites"],
    queryFn: argusApi.listSites,
    staleTime: 60_000,
  });

  const systemsQuery = useQuery({
    queryKey: ["argus", "systems"],
    queryFn: argusApi.listSystems,
    staleTime: 60_000,
  });

  const test = useMutation({
    mutationFn: argusApi.diagnostics,
    onSuccess: (r) => {
      setLastResult(r);
      if (r.backend.reachable) {
        toast.success(`Conexão OK — ambiente ${r.environment}`);
      } else {
        toast.error(`Falha: ${r.backend.message ?? "inacessível"}`);
      }
    },
  });

  const handleSave = () => {
    saveConfig(cfg);
    setDefaultSiteId(siteId || null);
    setSystemObjectId(systemObjectId || null);
    setCfg((c) => ({ ...c, defaultSiteId: siteId || undefined, defaultSiteName: sitesQuery.data?.find((s) => s.siteId === siteId)?.name }));
    qc.invalidateQueries();
    toast.success("Configurações salvas");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina o endpoint do ArgusClearId.Api. O ambiente (Demo ou Produção) é definido pelo
          próprio backend — aqui você apenas vê qual está ativo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backend</CardTitle>
          <CardDescription>Endpoint e credencial do ArgusClearId.Api.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={cfg.baseUrl}
              onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
              placeholder="https://argusclearid.rm.local"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key / Bearer</Label>
            <Input
              id="apiKey"
              type="password"
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              placeholder="Opcional — token aceito pelo ArgusClearId.Api"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? (
                "Testando..."
              ) : test.isSuccess && lastResult?.backend.reachable ? (
                <>
                  <CheckCircle2 className="mr-1 h-4 w-4 text-[var(--success)]" /> OK
                </>
              ) : test.isSuccess && !lastResult?.backend.reachable ? (
                <>
                  <XCircle className="mr-1 h-4 w-4 text-destructive" /> Falhou
                </>
              ) : (
                "Testar conexão"
              )}
            </Button>
            {lastResult && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Ambiente atual:</span>
                <Badge variant={lastResult.environment.toLowerCase().startsWith("prod") ? "default" : "secondary"}>
                  {lastResult.environment}
                </Badge>
                {lastResult.clientCode && (
                  <>
                    <span className="text-muted-foreground">Código do cliente:</span>
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
          <CardTitle className="text-base">Site padrão</CardTitle>
          <CardDescription>
            Selecione o site usado por padrão em todas as páginas do aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="site">Site</Label>
            <Select value={siteId} onValueChange={setSiteId} disabled={sitesQuery.isLoading || !!sitesQuery.error}>
              <SelectTrigger id="site">
                <SelectValue placeholder={
                  sitesQuery.isLoading
                    ? "Carregando sites..."
                    : sitesQuery.error
                    ? "Falha ao carregar sites"
                    : "Selecione um site"
                } />
              </SelectTrigger>
              <SelectContent>
                {(sitesQuery.data ?? [])
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
          <CardTitle className="text-base">Sistema (SystemObjectId)</CardTitle>
          <CardDescription>
            Sistema padrão do ClearID usado nas operações que exigem systemObjectId.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system">Sistema</Label>
            <Select
              value={systemObjectId}
              onValueChange={setSystemObjectIdState}
              disabled={systemsQuery.isLoading || !!systemsQuery.error}
            >
              <SelectTrigger id="system">
                <SelectValue
                  placeholder={
                    systemsQuery.isLoading
                      ? "Carregando sistemas..."
                      : systemsQuery.error
                      ? "Falha ao carregar sistemas"
                      : "Selecione um sistema"
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

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salvar configurações</Button>
      </div>
    </div>
  );
}