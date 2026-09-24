import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useActiveProfile } from "@/lib/argus-client";
import { corporateData } from "@/lib/corporatedata-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
type FormState = { id: string | null; site_id: string; nome: string; codigo: string };
const EMPTY_FORM: FormState = { id: null, site_id: "", nome: "", codigo: "" };

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
      if (f.id) {
        const { error } = await supabase.from("employer_sites").update(payload).eq("id", f.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("employer_sites").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(t("employerSites.toast.saved"));
      qc.invalidateQueries({ queryKey: ["employer-sites", activeProfile] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employer_sites").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("employerSites.toast.removed"));
      qc.invalidateQueries({ queryKey: ["employer-sites", activeProfile] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (r: EmployerSite) => {
    setForm({ id: r.id, site_id: r.site_id, nome: r.nome ?? "", codigo: r.codigo ?? "" });
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
            <DialogTitle>
              {form.id ? t("employerSites.edit") : t("employerSites.add")}
            </DialogTitle>
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
                onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}
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
