import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { IDENTITY_FIELD_KEYS } from "@/lib/identity-labels";
import { pickLang } from "@/lib/custom-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/apelidos")({
  head: () => ({ meta: [{ title: "Apelidos dos campos — Argus ClearID" }] }),
  component: ApelidosPage,
});

type LabelRow = Database["public"]["Tables"]["identity_field_labels"]["Row"];

type FormState = {
  field_key: string;
  ptBR: string;
  enUS: string;
  display_index: string;
  is_visible: boolean;
};

const EMPTY_FORM: FormState = {
  field_key: "",
  ptBR: "",
  enUS: "",
  display_index: "",
  is_visible: true,
};

function ApelidosPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabelRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<LabelRow | null>(null);

  const query = useQuery({
    queryKey: ["identity-field-labels-admin"],
    queryFn: async (): Promise<LabelRow[]> => {
      const { data, error } = await supabase
        .from("identity_field_labels")
        .select("*")
        .order("display_index", { ascending: true, nullsFirst: false })
        .order("field_key", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      const alias: Record<string, string> = {};
      if (f.ptBR.trim()) alias["pt-BR"] = f.ptBR.trim();
      if (f.enUS.trim()) alias["en-US"] = f.enUS.trim();
      const payload = {
        field_key: f.field_key.trim(),
        alias: alias as Json,
        display_index: f.display_index.trim() ? Number(f.display_index) : null,
        is_visible: f.is_visible,
      };
      if (editing) {
        const { error } = await supabase
          .from("identity_field_labels")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("identity_field_labels").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Apelido atualizado" : "Apelido criado");
      qc.invalidateQueries({ queryKey: ["identity-field-labels-admin"] });
      qc.invalidateQueries({ queryKey: ["identity-field-labels"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("identity_field_labels").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Apelido removido");
      qc.invalidateQueries({ queryKey: ["identity-field-labels-admin"] });
      qc.invalidateQueries({ queryKey: ["identity-field-labels"] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (row: LabelRow) => {
    setEditing(row);
    setForm({
      field_key: row.field_key,
      ptBR: pickLang(row.alias, "pt-BR"),
      enUS: pickLang(row.alias, "en-US"),
      display_index: row.display_index == null ? "" : String(row.display_index),
      is_visible: row.is_visible,
    });
    setDialogOpen(true);
  };
  const submit = () => {
    if (!form.field_key.trim()) {
      toast.error("Informe o campo (field_key)");
      return;
    }
    if (!form.ptBR.trim() && !form.enUS.trim()) {
      toast.error("Informe ao menos um apelido");
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
            Apelidos dos campos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina apelidos multilíngues para os campos de identidade exibidos no frontend.
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
            Atualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Novo apelido
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.data ? `${items.length} ${items.length === 1 ? "apelido" : "apelidos"}` : "Apelidos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : query.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(query.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum apelido cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>pt-BR</TableHead>
                  <TableHead>en-US</TableHead>
                  <TableHead>Visível</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.field_key}</TableCell>
                    <TableCell>{pickLang(row.alias, "pt-BR") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {pickLang(row.alias, "en-US") || "—"}
                    </TableCell>
                    <TableCell>
                      {row.is_visible ? (
                        <Badge variant="secondary">Sim</Badge>
                      ) : (
                        <Badge variant="outline">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToDelete(row)}
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {editing ? "Editar apelido" : "Novo apelido"}
            </DialogTitle>
            <DialogDescription>Apelido multilíngue para um campo de identidade.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="field_key">Campo (field_key) *</Label>
              <Input
                id="field_key"
                list="identity-field-keys"
                value={form.field_key}
                onChange={(e) => setForm((f) => ({ ...f, field_key: e.target.value }))}
                placeholder="ex.: first_name"
                disabled={Boolean(editing)}
              />
              <datalist id="identity-field-keys">
                {IDENTITY_FIELD_KEYS.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Apelido (pt-BR)</Label>
                <Input
                  value={form.ptBR}
                  onChange={(e) => setForm((f) => ({ ...f, ptBR: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Apelido (en-US)</Label>
                <Input
                  value={form.enUS}
                  onChange={(e) => setForm((f) => ({ ...f, enUS: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.display_index}
                  onChange={(e) => setForm((f) => ({ ...f, display_index: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_visible}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible: v }))}
                />
                <Label className="cursor-pointer">Visível</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de remoção */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover apelido</AlertDialogTitle>
            <AlertDialogDescription>
              Remover o apelido de <span className="font-mono">{toDelete?.field_key}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
