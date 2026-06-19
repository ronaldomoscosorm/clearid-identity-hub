import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { useArgusConfig } from "@/lib/argus-env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/diagnostics")({
  head: () => ({ meta: [{ title: "Diagnóstico — Argus ClearID" }] }),
  component: Diagnostics,
});

function StatRow({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium text-foreground">
        {typeof ok === "boolean" &&
          (ok ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          ))}
        {value}
      </span>
    </div>
  );
}

function Diagnostics() {
  const config = useArgusConfig();

  const query = useQuery({
    queryKey: ["diagnostics", config.baseUrl],
    queryFn: argusApi.diagnostics,
    refetchInterval: 30_000,
    retry: false,
  });
  const env = query.data?.environment ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Diagnóstico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saúde do backend ArgusClearId.Api e do token OAuth contra o ClearID.
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={query.isFetching ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Ambiente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatRow label="Ambiente" value={<Badge variant={env === "prod" ? "default" : "secondary"}>{env}</Badge>} />
            <StatRow label="Base URL" value={<code className="text-xs">{config.baseUrl || "—"}</code>} />
            <StatRow label="API Key configurada" value={config.apiKey ? "Sim" : "Não"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
              <CardTitle className="text-base">Backend</CardTitle>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : query.isError ? (
              <div className="text-sm text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="h-4 w-4" /> Inacessível
                </div>
                <p className="mt-2">{(query.error as ArgusApiError).message}</p>
              </div>
            ) : query.data ? (
              <>
                <StatRow label="Alcançável" value={query.data.backend.reachable ? "Sim" : "Não"} ok={query.data.backend.reachable} />
                {typeof query.data.backend.latencyMs === "number" && (
                  <StatRow label="Latência" value={`${query.data.backend.latencyMs} ms`} />
                )}
                  {typeof query.data.backend.status === "number" && (
                    <StatRow label="HTTP status" value={String(query.data.backend.status)} />
                  )}
                <StatRow label="Última checagem" value={new Date(query.data.checkedAt).toLocaleTimeString()} />
              </>
            ) : null}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}