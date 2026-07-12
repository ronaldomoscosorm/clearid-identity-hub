import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useDefaultSiteId } from "@/lib/argus-client";
import { typeOf, pickLang, optionsOf } from "@/lib/custom-fields";
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

function fieldLabel(sf: SiteField): string {
  return pickLang(sf.display_name_override) || sf.definition?.custom_field_name || "Campo";
}

function EmpresasPage() {
  const siteId = useDefaultSiteId();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Company | null>(null);

  const query = useQuery({
    queryKey: ["companies", siteId],
    queryFn: async (): Promise<Company[]> => {
      let q = supabase.from("companies").select("*").order("name", { ascending: true });
      q = siteId ? q.eq("site_id", siteId) : q;
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(siteId),
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
        const { data, error } = await supabase
          .from("companies")
          .insert({ ...payload, site_id: siteId as string })
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
      toast.success(editing ? "Empresa atualizada" : "Empresa criada");
      qc.invalidateQueries({ queryKey: ["companies", siteId] });
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
      toast.success("Empresa excluída");
      qc.invalidateQueries({ queryKey: ["companies", siteId] });
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
      toast.error("Informe o nome da empresa");
      return;
    }
    const missing = siteFields.find((sf) => sf.is_required && !customValues[sf.id]?.trim());
    if (missing) {
      toast.error(`Campo obrigatório: ${fieldLabel(missing)}`);
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro de empresas do site selecionado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching || !siteId}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!siteId}>
            <Plus className="mr-1 h-4 w-4" /> Nova empresa
          </Button>
        </div>
      </div>

      {!siteId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Selecione um site em <span className="font-medium">Configurações</span> para gerenciar
            empresas.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {query.data ? `${items.length} ${items.length === 1 ? "empresa" : "empresas"}` : "Empresas"}
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
                Nenhuma empresa cadastrada para este site.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Razão social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
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
                          {c.status === "Active" ? "Ativa" : "Inativa"}
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
              {editing ? "Editar empresa" : "Nova empresa"}
            </DialogTitle>
            <DialogDescription>
              {editing ? "Atualize os dados da empresa." : "Cadastre uma nova empresa para o site."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome fantasia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">Razão social</Label>
              <Input
                id="legal_name"
                value={form.legal_name}
                onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tax_id">CNPJ</Label>
                <Input
                  id="tax_id"
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Ativa</SelectItem>
                    <SelectItem value="Inactive">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
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
                <p className="text-sm font-medium text-foreground">Campos personalizados</p>
                {siteFields.map((sf) => {
                  const kind = typeOf(sf.definition?.custom_field_type);
                  const value = customValues[sf.id] ?? "";
                  const label = fieldLabel(sf);
                  return (
                    <div key={sf.id} className="space-y-2">
                      <Label>
                        {label}
                        {sf.is_required && <span className="ml-0.5 text-destructive">*</span>}
                      </Label>
                      {kind === "list" ? (
                        <Select value={value} onValueChange={(v) => setCV(sf.id, v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
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
              Cancelar
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-medium">{toDelete?.name}</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
