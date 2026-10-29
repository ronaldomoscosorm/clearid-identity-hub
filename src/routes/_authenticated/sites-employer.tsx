import { audit, auditDelete } from "@/lib/audit";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { argusApi, useActiveProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sites-employer")({
  head: () => ({ meta: [{ title: "Sites (Employer) — Argus ClearID" }] }),
  component: EmployerSitesPage,
});

type EmployerSite = Database["public"]["Tables"]["employer_sites"]["Row"];
type EmployerSiteTeam = Database["public"]["Tables"]["employer_site_teams"]["Row"];
// teams = regras de acesso (teamId → nome) em que as pessoas deste site são incluídas na importação.
type FormState = {
  id: string | null;
  site_id: string;
  nome: string;
  codigo: string;
  teams: Map<string, string>;
};
const EMPTY_FORM: FormState = { id: null, site_id: "", nome: "", codigo: "", teams: new Map() };

function EmployerSitesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const activeProfile = useActiveProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<EmployerSite | null>(null);

  // Vínculos já cadastrados (por cliente).
  const listQuery = useQuery({
    queryKey: ["employer-sites", activeProfile],
    queryFn: async (): Promise<EmployerSite[]> => {
      const { data, error } = await supabase
        .from("employer_sites")
        .select("*")
        .eq("profile", activeProfile)
        .order("codigo", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
  });
  const rows = listQuery.data ?? [];

  // Regras de acesso vinculadas a cada site da Employer (por cliente).
  const teamsLinkQuery = useQuery({
    queryKey: ["employer-site-teams", activeProfile],
    queryFn: async (): Promise<EmployerSiteTeam[]> => {
      const { data, error } = await supabase
        .from("employer_site_teams")
        .select("*")
        .eq("profile", activeProfile);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
  });
  const teamsByLink = useMemo(() => {
    const m = new Map<string, EmployerSiteTeam[]>();
    for (const r of teamsLinkQuery.data ?? [])
      m.set(r.employer_site_id, [...(m.get(r.employer_site_id) ?? []), r]);
    return m;
  }, [teamsLinkQuery.data]);

  // Regras (teams) do site escolhido no diálogo.
  const siteTeamsQuery = useQuery({
    queryKey: ["employer-site-teams-options", activeProfile, form.site_id],
    queryFn: () => argusApi.listAllTeams({ siteId: form.site_id }),
    enabled: dialogOpen && Boolean(form.site_id),
    staleTime: 5 * 60_000,
  });
  const siteTeams = (siteTeamsQuery.data ?? [])
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  const toggleTeam = (teamId: string, name: string, checked: boolean) =>
    setForm((f) => {
      const teams = new Map(f.teams);
      if (checked) teams.set(teamId, name);
      else teams.delete(teamId);
      return { ...f, teams };
    });

  // Sites do ClearID (via CorporateData) para escolher o siteId no vínculo.
  const clientesQuery = useQuery({
    queryKey: ["corporatedata", "clientes"],
    queryFn: () => corporateData.listClientes(),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeCliente = clientesQuery.data?.find(
    (c) => c.code.toLowerCase() === activeProfile.toLowerCase(),
  );
  const sitesQuery = useQuery({
    queryKey: ["corporatedata", "sites", activeCliente?.id ?? null],
    queryFn: async () => {
      if (!activeCliente) return [];
      const list = await corporateData.listClearIdSites(activeCliente.id);
      return list.map((s) => ({ siteId: s.externalId, name: s.name }));
    },
    enabled: !!activeCliente,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const sites = sitesQuery.data ?? [];
  const siteName = useMemo(() => {
    const m = new Map(sites.map((s) => [s.siteId, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [sites]);

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        profile: activeProfile,
        site_id: f.site_id,
        nome: f.nome.trim() || null,
        codigo: f.codigo.trim() || null,
      };
      let linkId = f.id;
      if (linkId) {
        const { error } = await supabase.from("employer_sites").update(payload).eq("id", linkId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("employer_sites")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        linkId = data.id;
      }
      // Regras do vínculo: substitui o conjunto pelo selecionado no diálogo.
      const { error: delErr } = await supabase
        .from("employer_site_teams")
        .delete()
        .eq("employer_site_id", linkId);
      if (delErr) throw new Error(delErr.message);
      if (f.teams.size) {
        const { error: insErr } = await supabase.from("employer_site_teams").insert(
          [...f.teams.entries()].map(([team_id, team_name]) => ({
            employer_site_id: linkId,
            profile: activeProfile,
            team_id,
            team_name,
          })),
        );
        if (insErr) throw new Error(insErr.message);
      }
    },
    onSuccess: () => {
      const fx = form as unknown as { id?: string; codigo?: string; nome?: string };
      audit({
        action: fx.id ? "updated" : "created",
        entityType: "employer_site",
        entityId: fx.id ?? null,
        entityLabel: [fx.codigo, fx.nome].filter(Boolean).join(" · ") || null,
        summary: `${fx.id ? "Alterou" : "Criou"} o vínculo de site da Employer ${[fx.codigo, fx.nome].filter(Boolean).join(" · ")}`,
      });
      toast.success(t("employerSites.toast.saved"));
      qc.invalidateQueries({ queryKey: ["employer-sites", activeProfile] });
      qc.invalidateQueries({ queryKey: ["employer-site-teams", activeProfile] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employer_sites").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, id) => {
      auditDelete("employer_site", String(id), null, "o vínculo de site da Employer");
      toast.success(t("employerSites.toast.removed"));
      qc.invalidateQueries({ queryKey: ["employer-sites", activeProfile] });
      qc.invalidateQueries({ queryKey: ["employer-site-teams", activeProfile] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (r: EmployerSite) => {
    setForm({
      id: r.id,
      site_id: r.site_id,
      nome: r.nome ?? "",
      codigo: r.codigo ?? "",
      teams: new Map(
        (teamsByLink.get(r.id) ?? []).map((x) => [x.team_id, x.team_name ?? x.team_id]),
      ),
    });
    setDialogOpen(true);
  };
  const submit = () => {
    if (!form.site_id) {
      toast.error(t("employerSites.validation.site"));
      return;
    }
    if (!form.codigo.trim() && !form.nome.trim()) {
      toast.error(t("employerSites.validation.codeOrName"));
      return;
    }
    upsert.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("employerSites.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("employerSites.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!activeProfile}>
            <Plus className="mr-1 h-4 w-4" /> {t("employerSites.add")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("employerSites.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("employerSites.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employerSites.col.codigo")}</TableHead>
                    <TableHead>{t("employerSites.col.nome")}</TableHead>
                    <TableHead>{t("employerSites.col.site")}</TableHead>
                    <TableHead>{t("employerSites.col.teams")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.codigo ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.nome ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {siteName(r.site_id)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(teamsByLink.get(r.id) ?? []).length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            (teamsByLink.get(r.id) ?? []).map((x) => (
                              <Badge key={x.id} variant="secondary">
                                {x.team_name ?? x.team_id}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? t("employerSites.edit") : t("employerSites.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="codigo">{t("employerSites.col.codigo")}</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome">{t("employerSites.col.nome")}</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("employerSites.col.site")}</Label>
              <Select
                value={form.site_id}
                // Trocar o site limpa as regras (são do site anterior).
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    site_id: v,
                    teams: v === f.site_id ? f.teams : new Map(),
                  }))
                }
                disabled={sitesQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      sitesQuery.isLoading ? t("common.loading") : t("employerSites.selectSite")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.siteId} value={s.siteId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("employerSites.siteHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("employerSites.col.teams")}</Label>
              {!form.site_id ? (
                <p className="text-xs text-muted-foreground">
                  {t("employerSites.teamsSelectSite")}
                </p>
              ) : siteTeamsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">{t("employerSites.teamsLoading")}</p>
              ) : siteTeams.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("employerSites.teamsEmpty")}</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {siteTeams.map((tm) => (
                    <label
                      key={tm.teamId}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.teams.has(tm.teamId)}
                        onCheckedChange={(c) => toggleTeam(tm.teamId, tm.name, c === true)}
                      />
                      <span>{tm.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("employerSites.teamsHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("employerSites.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("employerSites.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
