import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useDefaultSiteId, useActiveProfile } from "@/lib/argus-client";
import { useT, type TFn } from "@/lib/i18n";
import { typeOf, pickLang, optionsOf, isTruthy } from "@/lib/custom-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export const Route = createFileRoute("/_authenticated/empresas")({
  head: () => ({ meta: [{ title: "Empresas — Argus ClearID" }] }),
  component: EmpresasPage,
});

type Company = Database["public"]["Tables"]["companies"]["Row"];

type SiteField = {
  id: string;
  is_required: boolean;
  value_range: Json | null;
  display_name_override: Json | null;
  definition: { custom_field_name: string; custom_field_type: string | null } | null;
};

type FormState = {
  name: string;
  legal_name: string;
  tax_id: string;
  description: string;
  status: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  legal_name: "",
  tax_id: "",
  description: "",
  status: "Active",
};

function toForm(c: Company): FormState {
  return {
    name: c.name ?? "",
    legal_name: c.legal_name ?? "",
    tax_id: c.tax_id ?? "",
    description: c.description ?? "",
    status: c.status ?? "Active",
  };
}

function fieldLabel(sf: SiteField, t: TFn): string {
  return (
    pickLang(sf.display_name_override) ||
    sf.definition?.custom_field_name ||
    t("companies.customField.fallback")
  );
}

function EmpresasPage() {
  const { t } = useT();
  const siteId = useDefaultSiteId();
  const activeProfile = useActiveProfile();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Company | null>(null);

  // Empresas do CLIENTE ativo — cada empresa pertence a um cliente (perfil).
  const query = useQuery({
    queryKey: ["companies", activeProfile],
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("profile", activeProfile)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const siteFieldsQuery = useQuery({
    queryKey: ["site-custom-fields-active", siteId],
    queryFn: async (): Promise<SiteField[]> => {
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "id, is_required, value_range, display_name_override, definition:custom_field_definitions(custom_field_name, custom_field_type)",
        )
        .eq("site_id", siteId as string)
        .eq("entity_type", "company")
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false })
        .returns<SiteField[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(siteId),
  });

  const siteFields = siteFieldsQuery.data ?? [];

  const upsert = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        name: values.name.trim(),
        legal_name: values.legal_name.trim() || null,
        tax_id: values.tax_id.trim() || null,
        description: values.description.trim() || null,
        status: values.status,
      };

      let companyId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("companies").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        // Vincula a nova empresa ao cliente ativo.
        const { data, error } = await supabase
          .from("companies")
          .insert({ ...payload, profile: activeProfile })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        companyId = data.id;
      }

      // Persiste os campos personalizados da empresa.
      if (companyId && siteFields.length) {
        const rows = siteFields.map((sf) => ({
          company_id: companyId as string,
          site_custom_field_id: sf.id,
          value: customValues[sf.id]?.trim() ? customValues[sf.id].trim() : null,
        }));
        const { error } = await supabase
          .from("company_custom_fields")
          .upsert(rows, { onConflict: "company_id,site_custom_field_id" });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("companies.toast.updated") : t("companies.toast.created"));
      qc.invalidateQueries({ queryKey: ["companies"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("companies.toast.deleted"));
      qc.invalidateQueries({ queryKey: ["companies"] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCustomValues({});
    setDialogOpen(true);
  };

  const openEdit = async (c: Company) => {
    setEditing(c);
    setForm(toForm(c));
    setCustomValues({});
    setDialogOpen(true);
    const { data } = await supabase
      .from("company_custom_fields")
      .select("site_custom_field_id, value")
      .eq("company_id", c.id);
    setCustomValues(
      Object.fromEntries((data ?? []).map((r) => [r.site_custom_field_id, r.value ?? ""])),
    );
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error(t("companies.validation.nameRequired"));
      return;
    }
    const missing = siteFields.find((sf) => sf.is_required && !customValues[sf.id]?.trim());
    if (missing) {
      toast.error(t("companies.validation.requiredField", { field: fieldLabel(missing, t) }));
      return;
    }
    upsert.mutate(form);
  };

  const setCV = (id: string, v: string) => setCustomValues((c) => ({ ...c, [id]: v }));
  const items = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("companies.title")}
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("shell.profile")}: {activeProfile}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("companies.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {t("companies.refreshButton")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> {t("companies.newButton")}
          </Button>
        </div>
      </div>

      {(
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {query.data
                ? items.length === 1
                  ? t("companies.count.one", { count: items.length })
                  : t("companies.count.other", { count: items.length })
                : t("companies.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : query.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {(query.error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("companies.emptyState")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("companies.col.legalName")}</TableHead>
                    <TableHead>{t("companies.col.taxId")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.legal_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.tax_id ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "Active" ? "default" : "secondary"}>
                          {c.status === "Active" ? t("companies.status.active") : t("companies.status.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {editing ? t("companies.dialog.editTitle") : t("companies.newButton")}
            </DialogTitle>
            <DialogDescription>
              {editing ? t("companies.dialog.editDescription") : t("companies.dialog.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("companies.form.name")}</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("companies.form.namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">{t("companies.col.legalName")}</Label>
              <Input
                id="legal_name"
                value={form.legal_name}
                onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tax_id">{t("companies.col.taxId")}</Label>
                <Input
                  id="tax_id"
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">{t("common.status")}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">{t("companies.status.active")}</SelectItem>
                    <SelectItem value="Inactive">{t("companies.status.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("companies.form.description")}</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Campos personalizados do site */}
            {siteFields.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-sm font-medium text-foreground">
                  {t("companies.customField.section")}
                </p>
                {siteFields.map((sf) => {
                  const kind = typeOf(sf.definition?.custom_field_type);
                  const value = customValues[sf.id] ?? "";
                  const label = fieldLabel(sf, t);
                  return (
                    <div key={sf.id} className="space-y-2">
                      <Label>
                        {label}
                        {sf.is_required && <span className="ml-0.5 text-destructive">*</span>}
                      </Label>
                      {kind === "boolean" ? (
                        <div className="flex h-9 items-center">
                          <Checkbox
                            checked={isTruthy(value)}
                            onCheckedChange={(c) => setCV(sf.id, c ? "true" : "false")}
                          />
                        </div>
                      ) : kind === "list" ? (
                        <Select value={value} onValueChange={(v) => setCV(sf.id, v)}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("companies.customField.selectPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {optionsOf(sf.value_range).map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
                          value={value}
                          onChange={(e) => setCV(sf.id, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.delete.confirmBefore")}
              <span className="font-medium">{toDelete?.name}</span>
              {t("companies.delete.confirmAfter")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? t("companies.delete.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
