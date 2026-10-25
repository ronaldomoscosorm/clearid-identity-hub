import { audit, auditDelete } from "@/lib/audit";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Mail, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { argusApi, useActiveProfile } from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/destinatarios-relatorios")({
  head: () => ({ meta: [{ title: "Destinatários de relatórios — Argus ClearID" }] }),
  component: ReportRecipientsPage,
});

type Recipient = Database["public"]["Tables"]["report_recipients"]["Row"];

/** Tipos de relatório aceitos pela tabela (check constraint report_recipients_type_chk). */
const REPORT_TYPES = ["rotina_datas", "vencimentos", "importacao", "auditoria"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

/** Valor do select para "todos os sites" (site_id nulo). */
const ALL_SITES = "__all__";
const ALL_TYPES = "__all__";

type FormState = {
  id: string | null;
  report_type: ReportType;
  site_id: string; // ALL_SITES = todos
  email: string;
  name: string;
  notes: string;
  is_active: boolean;
};
const EMPTY_FORM: FormState = {
  id: null,
  report_type: "rotina_datas",
  site_id: ALL_SITES,
  email: "",
  name: "",
  notes: "",
  is_active: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ReportRecipientsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const activeProfile = useActiveProfile();
  const scope = useUserScope();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<Recipient | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);

  const typeLabel = (v: string) => t(`reportRecipients.type.${v}`);

  // Destinatários do cliente ativo.
  const listQuery = useQuery({
    queryKey: ["report-recipients", activeProfile],
    queryFn: async (): Promise<Recipient[]> => {
      const { data, error } = await supabase
        .from("report_recipients")
        .select("*")
        .eq("profile", activeProfile)
        .order("report_type", { ascending: true })
        .order("site_name", { ascending: true, nullsFirst: true })
        .order("email", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
  });
  const rows = useMemo(
    () => (listQuery.data ?? []).filter((r) => typeFilter === ALL_TYPES || r.report_type === typeFilter),
    [listQuery.data, typeFilter],
  );

  // Sites do ClearID visíveis ao usuário (mesma lista da importação).
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = useMemo(
    () =>
      scope
        .filterSites(sitesQuery.data ?? [], activeProfile)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")),
    [scope, sitesQuery.data, activeProfile],
  );
  const siteNameOf = (r: Recipient) =>
    r.site_id ? (sites.find((s) => s.siteId === r.site_id)?.name ?? r.site_name ?? r.site_id) : t("reportRecipients.allSites");

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      const site = f.site_id === ALL_SITES ? null : sites.find((s) => s.siteId === f.site_id);
      const payload = {
        profile: activeProfile,
        report_type: f.report_type,
        site_id: f.site_id === ALL_SITES ? null : f.site_id,
        site_name: site?.name ?? null,
        email: f.email.trim().toLowerCase(),
        name: f.name.trim() || null,
        notes: f.notes.trim() || null,
        is_active: f.is_active,
      };
      if (f.id) {
        const { error } = await supabase.from("report_recipients").update(payload).eq("id", f.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("report_recipients").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: (_d, f) => {
      const label = `${typeLabel(f.report_type)} · ${f.email.trim()}`;
      audit({
        action: f.id ? "updated" : "created",
        entityType: "report_recipient",
        entityId: f.id ?? null,
        entityLabel: label,
        summary: `${f.id ? "Alterou" : "Criou"} o destinatário de relatório ${label}`,
      });
      toast.success(t("reportRecipients.toast.saved"));
      qc.invalidateQueries({ queryKey: ["report-recipients", activeProfile] });
      setDialogOpen(false);
    },
    onError: (e) => {
      const msg = (e as Error).message;
      toast.error(/report_recipients_uq|duplicate key/i.test(msg) ? t("reportRecipients.validation.duplicate") : msg);
    },
  });

  // Liga/desliga direto na lista.
  const toggle = useMutation({
    mutationFn: async (r: Recipient) => {
      const { error } = await supabase.from("report_recipients").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, r) => {
      audit({
        action: "updated",
        entityType: "report_recipient",
        entityId: r.id,
        entityLabel: `${typeLabel(r.report_type)} · ${r.email}`,
        summary: `${r.is_active ? "Desativou" : "Ativou"} o destinatário de relatório ${r.email}`,
      });
      qc.invalidateQueries({ queryKey: ["report-recipients", activeProfile] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_recipients").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, id) => {
      auditDelete("report_recipient", String(id), toDelete?.email ?? null, "o destinatário de relatório");
      toast.success(t("reportRecipients.toast.removed"));
      qc.invalidateQueries({ queryKey: ["report-recipients", activeProfile] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, report_type: typeFilter === ALL_TYPES ? "rotina_datas" : (typeFilter as ReportType) });
    setDialogOpen(true);
  };
  const openEdit = (r: Recipient) => {
    setForm({
      id: r.id,
      report_type: (REPORT_TYPES as readonly string[]).includes(r.report_type) ? (r.report_type as ReportType) : "rotina_datas",
      site_id: r.site_id ?? ALL_SITES,
      email: r.email,
      name: r.name ?? "",
      notes: r.notes ?? "",
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };
  const submit = () => {
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error(t("reportRecipients.validation.email"));
      return;
    }
    upsert.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("reportRecipients.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("reportRecipients.subtitle")}</p>
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
            <Plus className="mr-1 h-4 w-4" /> {t("reportRecipients.add")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t("reportRecipients.listTitle")}</CardTitle>
          <div className="w-[260px]">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger aria-label={t("reportRecipients.col.type")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>{t("reportRecipients.allTypes")}</SelectItem>
                {REPORT_TYPES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {typeLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("reportRecipients.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportRecipients.col.type")}</TableHead>
                    <TableHead>{t("reportRecipients.col.site")}</TableHead>
                    <TableHead>{t("reportRecipients.col.email")}</TableHead>
                    <TableHead>{t("reportRecipients.col.name")}</TableHead>
                    <TableHead>{t("reportRecipients.col.active")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                      <TableCell>
                        <Badge variant="outline">{typeLabel(r.report_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          {siteNameOf(r)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.email}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.name ?? "—"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={() => toggle.mutate(r)}
                          disabled={toggle.isPending}
                          aria-label={t("reportRecipients.col.active")}
                        />
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
            <DialogTitle>{form.id ? t("reportRecipients.edit") : t("reportRecipients.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("reportRecipients.col.type")}</Label>
              <Select
                value={form.report_type}
                onValueChange={(v) => setForm((f) => ({ ...f, report_type: v as ReportType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {typeLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t(`reportRecipients.typeHint.${form.report_type}`)}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("reportRecipients.col.site")}</Label>
              <Select
                value={form.site_id}
                onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}
                disabled={sitesQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={sitesQuery.isLoading ? t("common.loading") : undefined} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SITES}>{t("reportRecipients.allSites")}</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.siteId} value={s.siteId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("reportRecipients.siteHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rr-email">{t("reportRecipients.col.email")}</Label>
                <Input
                  id="rr-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rr-name">{t("reportRecipients.col.name")}</Label>
                <Input
                  id="rr-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rr-notes">{t("reportRecipients.col.notes")}</Label>
              <Input
                id="rr-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <span className="text-sm text-foreground">{t("reportRecipients.col.active")}</span>
            </label>
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
            <AlertDialogTitle>{t("reportRecipients.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reportRecipients.delete.description", { email: toDelete?.email ?? "" })}
            </AlertDialogDescription>
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
