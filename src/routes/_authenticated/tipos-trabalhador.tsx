import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useT } from "@/lib/i18n";
import { pickLang } from "@/lib/custom-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/tipos-trabalhador")({
  head: () => ({ meta: [{ title: "Tipos de trabalhador — Argus ClearID" }] }),
  component: WorkerTypesPage,
});

type WorkerType = Database["public"]["Tables"]["worker_types"]["Row"];

type FormState = {
  namePt: string;
  nameEn: string;
  nameEs: string;
  code: string;
  argus: string;
  displayIndex: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  namePt: "",
  nameEn: "",
  nameEs: "",
  code: "",
  argus: "Colaborador",
  displayIndex: "",
  isActive: true,
};

function langFromJson(v: Json | null | undefined) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    pt: String(o["pt-BR"] ?? ""),
    en: String(o["en-US"] ?? ""),
    es: String(o["es-ES"] ?? ""),
  };
}

function toForm(w: WorkerType): FormState {
  const n = langFromJson(w.name_i18n);
  return {
    namePt: n.pt || w.name || "",
    nameEn: n.en,
    nameEs: n.es,
    code: w.code ?? "",
    argus: w.argus_worker_type_code ?? "Colaborador",
    displayIndex: w.display_index != null ? String(w.display_index) : "",
    isActive: w.is_active,
  };
}

function WorkerTypesPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<WorkerType | null>(null);

  const query = useQuery({
    queryKey: ["worker-types-admin"],
    queryFn: async (): Promise<WorkerType[]> => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .order("display_index", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: FormState) => {
      const namePt = values.namePt.trim();
      const nameI18n: Record<string, string> = { "pt-BR": namePt, default: namePt };
      if (values.nameEn.trim()) nameI18n["en-US"] = values.nameEn.trim();
      if (values.nameEs.trim()) nameI18n["es-ES"] = values.nameEs.trim();

      const payload = {
        name: namePt,
        name_i18n: nameI18n as Json,
        code: values.code.trim(),
        argus_worker_type_code: values.argus,
        display_index: values.displayIndex.trim() ? Number(values.displayIndex) : null,
        is_active: values.isActive,
      };

      if (editing) {
        const { error } = await supabase
          .from("worker_types")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("worker_types").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("workerTypes.toast.updated") : t("workerTypes.toast.created"));
      qc.invalidateQueries({ queryKey: ["worker-types-admin"] });
      qc.invalidateQueries({ queryKey: ["worker-types"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_types").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("workerTypes.toast.deleted"));
      qc.invalidateQueries({ queryKey: ["worker-types-admin"] });
      qc.invalidateQueries({ queryKey: ["worker-types"] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (w: WorkerType) => {
    setEditing(w);
    setForm(toForm(w));
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.namePt.trim()) {
      toast.error(t("workerTypes.validation.nameRequired"));
      return;
    }
    if (!form.code.trim()) {
      toast.error(t("workerTypes.validation.codeRequired"));
      return;
    }
    if (!form.argus) {
      toast.error(t("workerTypes.validation.argusRequired"));
      return;
    }
    upsert.mutate(form);
  };

  const items = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("workerTypes.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("workerTypes.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            {t("workerTypes.refreshButton")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> {t("workerTypes.newButton")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data
              ? items.length === 1
                ? t("workerTypes.count.one", { count: items.length })
                : t("workerTypes.count.other", { count: items.length })
              : t("workerTypes.title")}
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
              {t("workerTypes.emptyState")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("workerTypes.col.code")}</TableHead>
                  <TableHead>{t("workerTypes.col.argus")}</TableHead>
                  <TableHead className="w-[80px] text-center">{t("workerTypes.col.order")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      {pickLang(w.name_i18n, lang) || w.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{w.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.argus_worker_type_code ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {w.display_index ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.is_active ? "default" : "secondary"}>
                        {w.is_active
                          ? t("workerTypes.status.active")
                          : t("workerTypes.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToDelete(w)}
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

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              {editing ? t("workerTypes.dialog.editTitle") : t("workerTypes.newButton")}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? t("workerTypes.dialog.editDescription")
                : t("workerTypes.dialog.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="namePt">{t("workerTypes.form.name")}</Label>
              <Input
                id="namePt"
                value={form.namePt}
                onChange={(e) => setForm((f) => ({ ...f, namePt: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nameEn">{t("workerTypes.form.nameEn")}</Label>
                <Input
                  id="nameEn"
                  value={form.nameEn}
                  onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameEs">{t("workerTypes.form.nameEs")}</Label>
                <Input
                  id="nameEs"
                  value={form.nameEs}
                  onChange={(e) => setForm((f) => ({ ...f, nameEs: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="code">{t("workerTypes.form.code")}</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="EMP"
                />
                <p className="text-xs text-muted-foreground">{t("workerTypes.form.codeHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order">{t("workerTypes.form.order")}</Label>
                <Input
                  id="order"
                  type="number"
                  value={form.displayIndex}
                  onChange={(e) => setForm((f) => ({ ...f, displayIndex: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="argus">{t("workerTypes.form.argus")}</Label>
              <Select
                value={form.argus}
                onValueChange={(v) => setForm((f) => ({ ...f, argus: v }))}
              >
                <SelectTrigger id="argus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Colaborador">{t("workerTypes.argus.colaborador")}</SelectItem>
                  <SelectItem value="Terceiros">{t("workerTypes.argus.terceiros")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("workerTypes.form.argusHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={form.isActive}
                onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: Boolean(c) }))}
              />
              <Label htmlFor="active" className="cursor-pointer">
                {t("workerTypes.form.active")}
              </Label>
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

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workerTypes.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workerTypes.delete.confirmBefore")}
              <span className="font-medium">
                {toDelete ? pickLang(toDelete.name_i18n, lang) || toDelete.name : ""}
              </span>
              {t("workerTypes.delete.confirmAfter")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? t("workerTypes.delete.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
