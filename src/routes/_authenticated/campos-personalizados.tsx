import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClearIdCustomFieldDef, CustomFieldSectionSummary } from "@/lib/argus-client";
import { RefreshCw, Plus, Pencil, Trash2, Search, ListChecks, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { SpecialFieldsDialog } from "@/components/SpecialFieldsDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { ATTACHMENT_FIELD_TYPE, pickLang } from "@/lib/custom-fields";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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

// Grupo dos campos que não pertencem a nenhuma seção.
const OTHER_SECTION = "__other__";
// Valor do dropdown de seção quando o campo não fica em nenhuma.
const NO_SECTION = "__none__";

// Limites da API (swagger custom-fields).
const SECTION_NAME_MAX = 30;
const FIELD_NAME_MAX = 50;
const DISPLAY_NAME_MAX = 100;

// Definição local de um campo de Anexo (existe só no sistema, nunca no Argus).
type LocalAttachmentDef = Pick<
  Database["public"]["Tables"]["custom_field_definitions"]["Row"],
  "id" | "custom_field_name" | "display_name" | "attachment_accept"
>;

// Opções de restrição de tipo de arquivo do anexo.
const ACCEPT_OPTIONS = [
  { value: "image/*,application/pdf", key: "attachmentDef.acceptBoth" },
  { value: "image/*", key: "attachmentDef.acceptImage" },
  { value: "application/pdf", key: "attachmentDef.acceptPdf" },
] as const;

export const Route = createFileRoute("/_authenticated/campos-personalizados")({
  head: () => ({ meta: [{ title: "Campos personalizados — Argus ClearID" }] }),
  component: CustomFieldsPage,
});

/** Minúsculas sem acento, para a busca casar "apolice" com "Apólice". */
function normalize(s?: string | null) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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
  const [editingSection, setEditingSection] = useState<CustomFieldSectionSummary | null>(null);
  const [creatingSection, setCreatingSection] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);
  const [deletingSection, setDeletingSection] = useState<CustomFieldSectionSummary | null>(null);
  const [attachmentDialog, setAttachmentDialog] = useState<{
    mode: "create" | "edit";
    def?: LocalAttachmentDef;
  } | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState<LocalAttachmentDef | null>(null);

  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    retry: false,
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["custom-fields"] });
  const reloadSections = () => qc.invalidateQueries({ queryKey: ["custom-field-sections"] });

  // Campos de Anexo (locais — só do sistema).
  const attachmentsQuery = useQuery({
    queryKey: ["local-attachment-fields"],
    queryFn: async (): Promise<LocalAttachmentDef[]> => {
      const { data, error } = await supabase
        .from("custom_field_definitions")
        .select("id, custom_field_name, display_name, attachment_accept")
        .eq("is_local", true)
        .eq("is_deleted", false)
        .order("custom_field_name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const reloadAttachments = () => qc.invalidateQueries({ queryKey: ["local-attachment-fields"] });
  const attachmentDefs = attachmentsQuery.data ?? [];

  const delAttachment = useMutation({
    mutationFn: async (def: LocalAttachmentDef) => {
      // Cascata remove os vínculos por site (site_custom_fields) e os anexos
      // já enviados (identity_attachments) via FK on delete cascade.
      const { error } = await supabase.from("custom_field_definitions").delete().eq("id", def.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("attachmentDef.deleted"));
      setDeletingAttachment(null);
      reloadAttachments();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delSection = useMutation({
    mutationFn: (name: string) => argusApi.deleteCustomFieldSection(name),
    onSuccess: () => {
      toast.success(t("customFields.sectionDeleted"));
      setDeletingSection(null);
      reloadSections();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const del = useMutation({
    mutationFn: async (f: ClearIdCustomFieldDef) => {
      // O ClearID recusa (400) excluir um campo que ainda pertence a uma seção.
      // Tiramos o vínculo antes: PUT da seção com a lista de campos sem ele.
      const secName = sectionOfField.get(f.customFieldName);
      const sec = secName ? sectionByName.get(secName) : undefined;
      if (sec) {
        await argusApi.updateCustomFieldSection(sec.sectionName, {
          displayName: sec.displayName,
          index: sec.index,
          identityCustomFields: sec.fields.filter((x) => x.name !== f.customFieldName),
          eTag: sec.eTag,
        });
      }
      return argusApi.deleteCustomField(f.customFieldName);
    },
    onSuccess: () => {
      toast.success(t("customFields.deleted"));
      setDeleting(null);
      reload();
      reloadSections(); // o campo pode ter sido desvinculado de uma seção
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const q = normalize(search);
  const allItems = useMemo(() => (query.data ?? []).filter((f) => !f.isDeleted), [query.data]);
  // Busca por nome de exibição ou identificador, ignorando acentos/caixa.
  const items = useMemo(
    () =>
      q
        ? allItems.filter(
            (f) => normalize(f.displayName).includes(q) || normalize(f.customFieldName).includes(q),
          )
        : allItems,
    [allItems, q],
  );

  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections"],
    queryFn: () => argusApi.listCustomFieldSections(),
    staleTime: 5 * 60 * 1000,
  });

  // custom_field_name -> sectionName (chave única da seção).
  const sectionOfField = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sectionsQuery.data ?? []) {
      for (const f of sec.fields) m.set(f.name, sec.sectionName);
    }
    return m;
  }, [sectionsQuery.data]);

  const sectionByName = useMemo(() => {
    const m = new Map<string, CustomFieldSectionSummary>();
    for (const s of sectionsQuery.data ?? []) m.set(s.sectionName, s);
    return m;
  }, [sectionsQuery.data]);

  const labelOf = (key: string) =>
    key === OTHER_SECTION
      ? t("customFields.sectionOther")
      : sectionByName.get(key)?.displayName || key;

  // Agrupa os campos por seção. Sem busca, seções vazias também aparecem (para
  // poderem ser editadas/excluídas); com busca, só grupos com resultado.
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ClearIdCustomFieldDef[]>();
    if (!q) for (const s of sectionsQuery.data ?? []) groups.set(s.sectionName, []);
    for (const f of items) {
      const key = sectionOfField.get(f.customFieldName) ?? OTHER_SECTION;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    if (groups.get(OTHER_SECTION)?.length === 0) groups.delete(OTHER_SECTION);
    const name = (k: string) =>
      k === OTHER_SECTION ? t("customFields.sectionOther") : sectionByName.get(k)?.displayName || k;
    const arr = [...groups.entries()].sort((a, b) =>
      name(a[0]).localeCompare(name(b[0]), "pt-BR", { sensitivity: "base" }),
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
  }, [items, sectionOfField, sectionByName, sectionsQuery.data, q, t]);

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
          <Button
            variant="ghost"
            size="icon"
            title={t("common.edit")}
            onClick={() => setEditing(f)}
          >
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
          <p className="mt-1 text-sm text-muted-foreground">{t("customFields.subtitle")}</p>
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
          <Button variant="outline" size="sm" onClick={() => setCreatingSection(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("customFields.newSection")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSpecialOpen(true)}>
            <ListChecks className="mr-1 h-4 w-4" /> {t("specialFields.button")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAttachmentDialog({ mode: "create" })}
          >
            <Paperclip className="mr-1 h-4 w-4" /> {t("attachmentDef.newButton")}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("customFields.newField")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {query.data
              ? items.length === 1
                ? t("customFields.countSingular", { count: items.length })
                : t("customFields.countPlural", { count: items.length })
              : t("customFields.fieldsLabel")}
          </CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customFields.searchPlaceholder")}
              className="pl-8"
            />
          </div>
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
              {q
                ? t("customFields.noSearchResults", { query: search.trim() })
                : t("customFields.emptyState")}
            </p>
          ) : (
            <div className="space-y-6">
              {groupedItems.map(([sectionKey, fields]) => {
                const sec = sectionKey === OTHER_SECTION ? null : sectionByName.get(sectionKey);
                return (
                  <div key={sectionKey} className="space-y-2">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-foreground">{labelOf(sectionKey)}</p>
                      {sec && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title={t("customFields.editSection")}
                            onClick={() => setEditingSection(sec)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            title={t("customFields.deleteSection")}
                            onClick={() => setDeletingSection(sec)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {fields.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        {t("customFields.sectionEmpty")}
                      </p>
                    ) : (
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campos de Anexo (só do sistema) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" /> {t("attachmentDef.sectionTitle")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("attachmentDef.sectionHint")}</p>
          </div>
        </CardHeader>
        <CardContent>
          {attachmentsQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : attachmentDefs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("attachmentDef.emptyState")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customFields.col.displayName")}</TableHead>
                  <TableHead>{t("customFields.col.identifier")}</TableHead>
                  <TableHead>{t("attachmentDef.acceptCol")}</TableHead>
                  <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachmentDefs.map((def) => (
                  <TableRow key={def.id}>
                    <TableCell className="font-medium">
                      {pickLang(def.display_name) || def.custom_field_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {def.custom_field_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(
                          ACCEPT_OPTIONS.find(
                            (o) => o.value === (def.attachment_accept ?? "image/*,application/pdf"),
                          )?.key ?? "attachmentDef.acceptBoth",
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("common.edit")}
                          onClick={() => setAttachmentDialog({ mode: "edit", def })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("common.delete")}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingAttachment(def)}
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

      <CustomFieldDialog
        mode="create"
        sections={sectionsQuery.data ?? []}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          reload();
          reloadSections(); // o campo pode ter sido vinculado a uma seção
        }}
      />
      <CustomFieldDialog
        mode="edit"
        field={editing ?? undefined}
        sections={sectionsQuery.data ?? []}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <SpecialFieldsDialog
        open={specialOpen}
        onOpenChange={setSpecialOpen}
        fields={(query.data ?? []).filter((f) => !f.isDeleted)}
      />

      <SectionDialog
        mode="create"
        sections={sectionsQuery.data ?? []}
        open={creatingSection}
        onClose={() => setCreatingSection(false)}
        onSaved={() => {
          setCreatingSection(false);
          reloadSections();
        }}
      />
      <SectionDialog
        mode="edit"
        section={editingSection ?? undefined}
        sections={sectionsQuery.data ?? []}
        open={Boolean(editingSection)}
        onClose={() => setEditingSection(null)}
        onSaved={() => {
          setEditingSection(null);
          reloadSections();
        }}
      />

      <AlertDialog
        open={Boolean(deletingSection)}
        onOpenChange={(v) => !v && setDeletingSection(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customFields.confirmDeleteSectionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customFields.confirmDeleteSectionDesc", {
                name: deletingSection?.displayName || deletingSection?.sectionName || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delSection.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={delSection.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingSection) delSection.mutate(deletingSection.sectionName);
              }}
            >
              {delSection.isPending ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                if (deleting) del.mutate(deleting);
              }}
            >
              {del.isPending ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AttachmentDefDialog
        open={Boolean(attachmentDialog)}
        mode={attachmentDialog?.mode ?? "create"}
        def={attachmentDialog?.def}
        existingNames={attachmentDefs.map((d) => d.custom_field_name)}
        onClose={() => setAttachmentDialog(null)}
        onSaved={() => {
          setAttachmentDialog(null);
          reloadAttachments();
        }}
      />

      <AlertDialog
        open={Boolean(deletingAttachment)}
        onOpenChange={(v) => !v && setDeletingAttachment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attachmentDef.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("attachmentDef.confirmDeleteDesc", {
                name:
                  (deletingAttachment && pickLang(deletingAttachment.display_name)) ||
                  deletingAttachment?.custom_field_name ||
                  "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delAttachment.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={delAttachment.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingAttachment) delAttachment.mutate(deletingAttachment);
              }}
            >
              {delAttachment.isPending ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Criação/edição de um campo de Anexo (local — só do sistema). */
function AttachmentDefDialog({
  open,
  mode,
  def,
  existingNames,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  def?: LocalAttachmentDef;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accept, setAccept] = useState<string>(ACCEPT_OPTIONS[0].value);

  useEffect(() => {
    if (!open) return;
    setName(def?.custom_field_name ?? "");
    setDisplayName(pickLang(def?.display_name) || "");
    setAccept(def?.attachment_accept ?? ACCEPT_OPTIONS[0].value);
  }, [open, def]);

  // Sanitiza o identificador (letras, números e _), como os campos do ClearID.
  const cleanName = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
  const nameTaken =
    mode === "create" && existingNames.some((n) => n.toLowerCase() === cleanName.toLowerCase());

  const save = useMutation({
    mutationFn: async () => {
      const display_name = { default: displayName.trim() } as Json;
      if (mode === "edit") {
        const { error } = await supabase
          .from("custom_field_definitions")
          .update({ display_name, attachment_accept: accept })
          .eq("id", def!.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("custom_field_definitions").insert({
        custom_field_name: cleanName,
        display_name,
        custom_field_type: ATTACHMENT_FIELD_TYPE,
        is_local: true,
        synchronization_enabled: false,
        attachment_accept: accept,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(mode === "create" ? t("attachmentDef.created") : t("attachmentDef.updated"));
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSave =
    displayName.trim().length > 0 &&
    (mode === "edit" || (cleanName.length > 0 && !nameTaken)) &&
    !save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("attachmentDef.newTitle") : t("attachmentDef.editTitle")}
          </DialogTitle>
          <DialogDescription>{t("attachmentDef.dialogHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="att-name">{t("customFields.col.identifier")}</Label>
            <Input
              id="att-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
              maxLength={FIELD_NAME_MAX}
              placeholder="ex.: contrato_assinado"
              className={cn(nameTaken && "border-destructive")}
            />
            {mode === "create" && (
              <p className="text-xs text-muted-foreground">
                {nameTaken
                  ? t("attachmentDef.nameTaken")
                  : cleanName
                    ? `${t("attachmentDef.identifierPreview")}: ${cleanName}`
                    : `${name.length}/${FIELD_NAME_MAX}`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="att-display">{t("customFields.col.displayName")}</Label>
            <Input
              id="att-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("attachmentDef.acceptCol")}</Label>
            <Select value={accept} onValueChange={setAccept}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCEPT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

/** Criação/edição de seção. O nome é imutável na edição. */
function SectionDialog({
  mode,
  section,
  sections,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  section?: CustomFieldSectionSummary;
  sections: CustomFieldSectionSummary[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [index, setIndex] = useState("0");

  useEffect(() => {
    if (!open) return;
    setName(section?.sectionName ?? "");
    setDisplayName(section?.displayName ?? "");
    // O índice precisa ser único: no create, já sugere o próximo livre.
    const next = sections.length ? Math.max(...sections.map((s) => s.index)) + 1 : 0;
    setIndex(String(section?.index ?? next));
  }, [open, section, sections]);

  const idxNum = Number.parseInt(index, 10);
  const indexTaken =
    Number.isFinite(idxNum) &&
    sections.some((s) => s.index === idxNum && s.sectionName !== section?.sectionName);

  const save = useMutation({
    mutationFn: () => {
      const idx = Number.parseInt(index, 10);
      return mode === "create"
        ? argusApi.createCustomFieldSection({
            identityCustomFieldsSectionName: name.trim(),
            displayName: displayName.trim(),
            index: Number.isFinite(idx) ? idx : 0,
          })
        : argusApi.updateCustomFieldSection(section!.sectionName, {
            displayName: displayName.trim(),
            index: Number.isFinite(idx) ? idx : 0,
            // PUT substitui o agrupamento: reenvia os campos atuais para não
            // esvaziar a seção.
            identityCustomFields: section!.fields,
            eTag: section!.eTag,
          });
    },
    onSuccess: () => {
      toast.success(
        mode === "create" ? t("customFields.sectionCreated") : t("customFields.sectionUpdated"),
      );
      onSaved();
    },
    onError: (e) => toast.error((e as ArgusApiError).message),
  });

  const canSave =
    displayName.trim().length > 0 &&
    (mode === "edit" || name.trim().length > 0) &&
    !indexTaken &&
    !save.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("customFields.newSection") : t("customFields.editSection")}
          </DialogTitle>
          <DialogDescription>{t("customFields.sectionHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="sec-name">{t("customFields.sectionIdentifier")}</Label>
            <Input
              id="sec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === "edit"}
              maxLength={SECTION_NAME_MAX}
              placeholder="ex.: DocumentosEmpresa"
            />
            {mode === "create" && (
              <p className="text-xs text-muted-foreground">
                {name.length}/{SECTION_NAME_MAX}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-display">{t("customFields.col.displayName")}</Label>
            <Input
              id="sec-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-index">{t("customFields.sectionIndex")}</Label>
            <Input
              id="sec-index"
              type="number"
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              className={cn(indexTaken && "border-destructive")}
            />
            {indexTaken && (
              <p className="text-xs text-destructive">{t("customFields.sectionIndexTaken")}</p>
            )}
          </div>
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

/** Criação/edição de campo personalizado. Nome e tipo são imutáveis na edição. */
function CustomFieldDialog({
  mode,
  field,
  sections,
  open,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  field?: ClearIdCustomFieldDef;
  sections: CustomFieldSectionSummary[];
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
  const [sectionName, setSectionName] = useState<string>(NO_SECTION);

  useEffect(() => {
    if (!open) return;
    setName(field?.customFieldName ?? "");
    setDisplayName(field?.displayName ?? "");
    setType(field?.customFieldType ?? "Text");
    setIsReadOnly(Boolean(field?.isReadOnly));
    setSync(field?.synchronizationEnabled ?? true);
    setSectionName(NO_SECTION);
  }, [open, field]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "edit") {
        return argusApi.updateCustomField(field!.customFieldName, {
          displayName: displayName.trim(),
          isReadOnly,
          synchronizationEnabled: sync,
          eTag: field?.eTag ?? null,
        });
      }

      const created = await argusApi.createCustomField({
        customFieldName: name.trim(),
        displayName: displayName.trim(),
        customFieldType: type,
        isReadOnly,
        synchronizationEnabled: sync,
      });

      // A API não aceita seção no create: o vínculo é feito pelo PUT da seção,
      // que substitui a lista de campos — por isso reenviamos os atuais + o novo.
      const sec = sections.find((s) => s.sectionName === sectionName);
      if (sec) {
        const nextIdx = sec.fields.length ? Math.max(...sec.fields.map((f) => f.index)) + 1 : 0;
        await argusApi.updateCustomFieldSection(sec.sectionName, {
          displayName: sec.displayName,
          index: sec.index,
          identityCustomFields: [...sec.fields, { name: name.trim(), index: nextIdx }],
          eTag: sec.eTag,
        });
      }
      return created;
    },
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
            {mode === "create" ? t("customFields.createHint") : t("customFields.editHint")}
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
              maxLength={FIELD_NAME_MAX}
              placeholder="ex.: cpf_colaborador"
            />
            {mode === "create" && (
              <p className="text-xs text-muted-foreground">
                {name.length}/{FIELD_NAME_MAX}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-display">{t("customFields.col.displayName")}</Label>
            <Input
              id="cf-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
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

          {mode === "create" && (
            <div className="space-y-2">
              <Label>{t("customFields.sectionLabel")}</Label>
              <Select value={sectionName} onValueChange={setSectionName}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECTION}>{t("customFields.noSection")}</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.sectionName} value={s.sectionName}>
                      {s.displayName || s.sectionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
