import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, ShieldBan } from "lucide-react";
import { argusApi, useActiveProfile } from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import { supabase } from "@/integrations/supabase/client";
import { audit } from "@/lib/audit";
import { useCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/current-user";
import {
  useClientSettings,
  useUpdateClientSettings,
  type CustomFieldStorage,
} from "@/lib/client-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/configuracoes-cliente")({
  head: () => ({ meta: [{ title: "Configurações do cliente — Argus ClearID" }] }),
  component: ClientSettingsPage,
});

type SiteDateRule = { siteId: string; blockIdentity: boolean; blockCompany: boolean };

function ClientSettingsPage() {
  const activeProfile = useActiveProfile();
  const currentUser = useCurrentUser();
  const admin = isAdmin(currentUser.data ?? null);
  const qc = useQueryClient();
  const scope = useUserScope();

  // Regras de bloqueio por validade, por site (colaborador / empresa).
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = scope
    .filterSites(sitesQuery.data ?? [], activeProfile)
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  const rulesQuery = useQuery({
    queryKey: ["site-date-rules", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_date_rules")
        .select("site_id, block_identity_validity, block_company_validity")
        .eq("profile", activeProfile);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
  });
  const [rules, setRules] = useState<Map<string, SiteDateRule>>(new Map());
  useEffect(() => {
    if (!rulesQuery.data) return;
    setRules(
      new Map(
        rulesQuery.data.map((r) => [
          r.site_id,
          { siteId: r.site_id, blockIdentity: r.block_identity_validity, blockCompany: r.block_company_validity },
        ]),
      ),
    );
  }, [rulesQuery.data]);
  const ruleOf = (siteId: string): SiteDateRule =>
    rules.get(siteId) ?? { siteId, blockIdentity: false, blockCompany: false };
  const setRule = (siteId: string, patch: Partial<SiteDateRule>) =>
    setRules((prev) => new Map(prev).set(siteId, { ...ruleOf(siteId), ...patch }));
  const rulesDirty = (() => {
    const saved = new Map((rulesQuery.data ?? []).map((r) => [r.site_id, r]));
    return [...rules.values()].some((r) => {
      const s = saved.get(r.siteId);
      return (s?.block_identity_validity ?? false) !== r.blockIdentity || (s?.block_company_validity ?? false) !== r.blockCompany;
    });
  })();
  const saveRules = useMutation({
    mutationFn: async () => {
      const rows = [...rules.values()].map((r) => ({
        profile: activeProfile,
        site_id: r.siteId,
        block_identity_validity: r.blockIdentity,
        block_company_validity: r.blockCompany,
        updated_at: new Date().toISOString(),
      }));
      if (!rows.length) return;
      const { error } = await supabase.from("site_date_rules").upsert(rows, { onConflict: "profile,site_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      audit({
        action: "updated",
        entityType: "site_date_rules",
        entityId: activeProfile,
        entityLabel: activeProfile,
        summary: `Alterou as regras de bloqueio por validade dos sites do cliente ${activeProfile}`,
      });
      toast.success("Regras de bloqueio salvas.");
      qc.invalidateQueries({ queryKey: ["site-date-rules", activeProfile] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const query = useClientSettings(activeProfile);
  const update = useUpdateClientSettings();

  const [storage, setStorage] = useState<CustomFieldStorage>("both");

  useEffect(() => {
    if (query.data) setStorage(query.data.defaultCustomFieldStorage);
  }, [query.data]);

  const dirty = query.data ? storage !== query.data.defaultCustomFieldStorage : false;

  const submit = () => {
    update.mutate(
      { profile: activeProfile, defaultCustomFieldStorage: storage },
      {
        onSuccess: () => toast.success("Configurações salvas."),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  if (!admin) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Configurações do cliente
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesso restrito ao perfil Administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Configurações do cliente
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Cliente: {activeProfile}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Padrões aplicados a todos os usuários deste cliente.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            Campos personalizados
          </CardTitle>
          <CardDescription>
            Define onde novas definições de campo personalizado são gravadas por padrão. O usuário
            ainda pode escolher outro local em cada campo, no dialog de criação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label>Armazenamento padrão</Label>
            <Select
              value={storage}
              onValueChange={(v) => setStorage(v as CustomFieldStorage)}
              disabled={query.isLoading || update.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clearid">ClearID (SaaS)</SelectItem>
                <SelectItem value="supabase">Local (Supabase)</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <strong>ClearID:</strong> a definição e o valor por identidade ficam no Genetec.
              {" "}<strong>Local:</strong> só no Supabase (não trafega no PIAM).
              {" "}<strong>Ambos:</strong> criado nos dois — ClearID é fonte da verdade.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!dirty || update.isPending}>
              {update.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldBan className="h-4 w-4" />
            Bloqueio por validade (por site)
          </CardTitle>
          <CardDescription>
            Define, por site, se os colaboradores são bloqueados quando há validade vencida: a do
            próprio colaborador (ASO, certidões, cursos…) e/ou a da empresa à qual ele pertence (vale
            para todos os colaboradores da empresa naquele site). Site com as duas opções desligadas
            não bloqueia por validade e quem já estava bloqueado por validade é desbloqueado pela
            rotina de datas. Afastamento e férias não dependem desta configuração.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sitesQuery.isLoading || rulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando sites…</p>
          ) : sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum site disponível para este cliente.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead className="w-56">Validade do colaborador</TableHead>
                    <TableHead className="w-56">Validade da empresa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((s) => {
                    const r = ruleOf(s.siteId);
                    return (
                      <TableRow key={s.siteId}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`bi-${s.siteId}`}
                              checked={r.blockIdentity}
                              onCheckedChange={(v) => setRule(s.siteId, { blockIdentity: v })}
                              disabled={saveRules.isPending}
                            />
                            <Label htmlFor={`bi-${s.siteId}`} className="text-xs text-muted-foreground">
                              {r.blockIdentity ? "Bloqueia" : "Não bloqueia"}
                            </Label>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`bc-${s.siteId}`}
                              checked={r.blockCompany}
                              onCheckedChange={(v) => setRule(s.siteId, { blockCompany: v })}
                              disabled={saveRules.isPending}
                            />
                            <Label htmlFor={`bc-${s.siteId}`} className="text-xs text-muted-foreground">
                              {r.blockCompany ? "Bloqueia" : "Não bloqueia"}
                            </Label>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => saveRules.mutate()} disabled={!rulesDirty || saveRules.isPending}>
              {saveRules.isPending ? "Salvando..." : "Salvar regras"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
