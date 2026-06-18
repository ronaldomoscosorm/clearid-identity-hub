import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAllConfigs,
  saveConfigs,
  type ArgusEnvConfig,
  type ArgusEnvKey,
} from "@/lib/argus-env";
import { argusFetch, ArgusApiError } from "@/lib/argus-client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Argus ClearID" }] }),
  component: Settings,
});

function EnvBlock({
  envKey,
  title,
  value,
  onChange,
}: {
  envKey: ArgusEnvKey;
  title: string;
  value: ArgusEnvConfig;
  onChange: (cfg: ArgusEnvConfig) => void;
}) {
  const test = useMutation({
    mutationFn: () => argusFetch("/api/diagnostics", { env: envKey }),
    onSuccess: () => toast.success(`Conexão com ${envKey} OK`),
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(`Falha em ${envKey}: ${err.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Endpoint e credencial usados quando este ambiente está ativo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${envKey}-baseUrl`}>Base URL</Label>
          <Input
            id={`${envKey}-baseUrl`}
            value={value.baseUrl}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            placeholder="https://argusclearid.rm.local"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${envKey}-apiKey`}>API Key / Bearer</Label>
          <Input
            id={`${envKey}-apiKey`}
            type="password"
            value={value.apiKey}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            placeholder="Opcional — token aceito pelo ArgusClearId.Api"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? (
            "Testando..."
          ) : test.isSuccess ? (
            <>
              <CheckCircle2 className="mr-1 h-4 w-4 text-[var(--success)]" /> OK
            </>
          ) : test.isError ? (
            <>
              <XCircle className="mr-1 h-4 w-4 text-destructive" /> Falhou
            </>
          ) : (
            "Testar conexão"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function Settings() {
  const [cfg, setCfg] = useState(() => getAllConfigs());

  const handleSave = () => {
    saveConfigs(cfg);
    toast.success("Configurações salvas");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina os endpoints do ArgusClearId.Api por ambiente. As credenciais OAuth do ClearID ficam no
          backend — aqui você fornece apenas o token que o próprio ArgusClearId.Api exige.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EnvBlock
          envKey="demo"
          title="Demo"
          value={cfg.demo}
          onChange={(c) => setCfg({ ...cfg, demo: c })}
        />
        <EnvBlock
          envKey="prod"
          title="Produção"
          value={cfg.prod}
          onChange={(c) => setCfg({ ...cfg, prod: c })}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salvar configurações</Button>
      </div>
    </div>
  );
}