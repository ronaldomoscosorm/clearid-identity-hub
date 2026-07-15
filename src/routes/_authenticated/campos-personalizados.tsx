import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClearIdCustomFieldDef } from "@/lib/argus-client";
import { RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

// Tipos aceitos pela API (CreateIdentityCustomFieldRequest.customFieldType).
const FIELD_TYPES = ["Text", "Numeric", "Boolean", "DateTime", "Decimal", "Date"] as const;

export const Route = createFileRoute("/_authenticated/campos-personalizados")({
  head: () => ({ meta: [{ title: "Campos personalizados — Argus ClearID" }] }),
  component: CustomFieldsPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function CustomFieldsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClearIdCustomFieldDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ClearIdCustomFieldDef | null>(null);

  const query = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    retry: false,
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["custom-fields"] });

  const del = useMutation({
    mutationFn: (name: string) => argusApi.deleteCustomField(name),
    onSuccess: () => {
      toast.success(t("customFields.deleted"));
      setDeleting(null);
      reload();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const items = (query.data ?? []).filter((f) => !f.isDeleted);

  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections"],
    queryFn: () => argusApi.listCustomFieldSections(),
    staleTime: 5 * 60 * 1000,
  });

  // custom_field_name -> nome de exibição da seção.
  const sectionByField = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sectionsQuery.data ?? []) {
      for (const f of sec.fields) m.set(f.name, sec.displayName || sec.sectionName);
    }
    return m;
  }, [sectionsQuery.data]);

  // Agrupa os campos por seção (ordem alfabética de seção e de campo).
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ClearIdCustomFieldDef[]>();
    for (const f of items) {
      const key = sectionByField.get(f.customFieldName) ?? t("customFields.sectionOther");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    const arr = [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }),
    );
    for (const [, fs] of arr) {
      fs.sort((a, b) =>
        (a.displayName || a.customFieldName).localeCompare(
          b.displayName || b.customFieldName,
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
    }
    return arr;
  }, [items, sectionByField, t]);

  // Espelha as definições de campos para o Supabase (cache local, best-effort).
  useEffect(() => {
    if (query.data?.length) void mirrorCustomFieldDefs(query.data);
  }, [query.data]);

  const renderRow = (f: ClearIdCustomFieldDef) => (
    <TableRow key={f.customFieldName}>
      <TableCell className="font-medium">{f.displayName || f.customFieldName}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{f.customFieldName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{f.customFieldType ?? "—"}</Badge>
      </TableCell>
      <TableCell>
        {f.synchronizationEnabled ? (
          <Badge>{t("customFields.syncActive")}</Badge>
        ) : (
          <Badge variant="outline">{t("customFields.syncInactive")}</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {f.isReadOnly ? t("common.yes") : t("common.no")}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(f.lastModificationDateUtc)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => setEditing(f)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t("common.delete")}
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(f)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("customFields.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customFields.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {t("customFields.refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("customFields.newField")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data
              ? items.length === 1
                ? t("customFields.countSingular", { count: items.length })
                : t("customFields.countPlural", { count: items.length })
              : t("customFields.fieldsLabel")}
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
              {(query.error as ArgusApiError).message}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("customFields.emptyState")}
            </p>
          ) : (
            <div className="space-y-6">
              {groupedItems.map(([section, fields]) => (
                <div key={section} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{section}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("customFields.col.displayName")}</TableHead>
                        <TableHead>{t("customFields.col.identifier")}</TableHead>
                        <TableHead>{t("customFields.col.type")}</TableHead>
                        <TableHead>{t("customFields.col.synchronization")}</TableHead>
                        <TableHead>{t("customFields.col.readOnly")}</TableHead>
                        <TableHead>{t("customFields.col.lastModified")}</TableHead>
                        <TableHead className="w-[100px] text-right">
                          {t("common.actions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{fields.map(renderRow)}</TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomFieldDialog
        mode="create"
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          reload();
        }}
      />
      <CustomFieldDialog
        mode="edit"
        field={editing ?? undefined}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customFields.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customFields.confirmDeleteDesc", {
                name: deleting?.displayName || deleting?.customFieldName || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) del.mutate(deleting.customFieldName);
              }}
            >
              {del.isPending ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Criação/edição de campo personalizado. Nome e tipo são imutáveis na edição. */
function CustomFieldDialog({
  mode,
  field,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  field?: ClearIdCustomFieldDef;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<string>("Text");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [sync, setSync] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(field?.customFieldName ?? "");
    setDisplayName(field?.displayName ?? "");
    setType(field?.customFieldType ?? "Text");
    setIsReadOnly(Boolean(field?.isReadOnly));
    setSync(field?.synchronizationEnabled ?? true);
  }, [open, field]);

  const save = useMutation({
    mutationFn: () =>
      mode === "create"
        ? argusApi.createCustomField({
            customFieldName: name.trim(),
            displayName: displayName.trim(),
            customFieldType: type,
            isReadOnly,
            synchronizationEnabled: sync,
          })
        : argusApi.updateCustomField(field!.customFieldName, {
            displayName: displayName.trim(),
            isReadOnly,
            synchronizationEnabled: sync,
            eTag: field?.eTag ?? null,
          }),
    onSuccess: () => {
      toast.success(mode === "create" ? t("customFields.created") : t("customFields.updated"));
      onSaved();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const canSave =
    displayName.trim().length > 0 && (mode === "edit" || name.trim().length > 0) && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("customFields.newField") : t("customFields.editField")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("customFields.createHint")
              : t("customFields.editHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cf-name">{t("customFields.col.identifier")}</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
              placeholder="ex.: cpf_colaborador"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-display">{t("customFields.col.displayName")}</Label>
            <Input
              id="cf-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("customFields.col.type")}</Label>
            <Select value={type} onValueChange={setType} disabled={mode === "edit"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {ft}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={isReadOnly} onCheckedChange={(v) => setIsReadOnly(Boolean(v))} />
            {t("customFields.col.readOnly")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={sync} onCheckedChange={(v) => setSync(Boolean(v))} />
            {t("customFields.col.synchronization")}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}