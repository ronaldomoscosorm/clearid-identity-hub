import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { typeOf, pickLang } from "@/lib/custom-fields";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/campos-do-site")({
  head: () => ({ meta: [{ title: "Campos do site — Argus ClearID" }] }),
  component: CamposDoSitePage,
});

const ALL_WORKER_TYPES = "__ALL__";
const ALL_SECTIONS = "__ALL_SECTIONS__";

type Definition = Database["public"]["Tables"]["custom_field_definitions"]["Row"];
type WorkerType = Database["public"]["Tables"]["worker_types"]["Row"];
type SiteFieldRow = Database["public"]["Tables"]["site_custom_fields"]["Row"] & {
  definition: Pick<Definition, "custom_field_name" | "custom_field_type" | "display_name"> | null;
  worker_type: Pick<WorkerType, "name"> | null;
};

type MultiLang = { "pt-BR": string; "en-US": string; "es-ES": string };

const NO_RELATION = "__NONE__";

type FormState = {
  entity_type: string; // identity | company
  section: string; // sectionName do ClearID ou ALL_SECTIONS
  definition_id: string; // usado na EDIÇÃO (campo único)
  selectedIds: string[]; // usado ao ADICIONAR (múltiplos)
  worker_type_id: string;
  is_required: boolean;
  is_active: boolean;
  fillable: boolean; // identidade: pode ser preenchido no cadastro
  related_identity_field_id: string; // empresa: campo de identidade relacionado
  display_index: string;
  override: MultiLang;
  // value_range por tipo
  rangeMin: string;
  rangeMax: string;
  options: string; // uma opção por linha
};

const EMPTY_FORM: FormState = {
  entity_type: "identity",
  section: ALL_SECTIONS,
  definition_id: "",
  selectedIds: [],
  worker_type_id: "",
  is_required: false,
  is_active: true,
  fillable: true,
  related_identity_field_id: NO_RELATION,
  display_index: "",
  override: { "pt-BR": "", "en-US": "", "es-ES": "" },
  rangeMin: "",
  rangeMax: "",
  options: "",
};

// Máscara dd/MM/yyyy a partir dos dígitos digitados.
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
// Converte ISO (yyyy-MM-dd) para dd/MM/yyyy; deixa o resto intacto.
function isoToBr(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function langFromJson(v: Json | null | undefined): MultiLang {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    "pt-BR": String(o["pt-BR"] ?? ""),
    "en-US": String(o["en-US"] ?? ""),
    "es-ES": String(o["es-ES"] ?? ""),
  };
}

function buildOverride(m: MultiLang): Json {
  const o: Record<string, string> = {};
  if (m["pt-BR"].trim()) o["pt-BR"] = m["pt-BR"].trim();
  if (m["en-US"].trim()) o["en-US"] = m["en-US"].trim();
  if (m["es-ES"].trim()) o["es-ES"] = m["es-ES"].trim();
  return o as Json;
}

function buildRange(kind: ReturnType<typeof typeOf>, f: FormState): Json | null {
  if (kind === "number" || kind === "date") {
    const min = f.rangeMin.trim();
    const max = f.rangeMax.trim();
    if (!min && !max) return null;
    return { min: min || null, max: max || null } as Json;
  }
  if (kind === "list") {
    const opts = f.options
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!opts.length) return null;
    return { options: opts } as Json;
  }
  if (kind === "text") {
    // Valor padrão opcional para campo de texto (pode ficar em branco).
    const t = f.rangeMin.trim();
    return t ? ({ text: t } as Json) : null;
  }
  return null;
}

function rangeToForm(v: Json | null): Pick<FormState, "rangeMin" | "rangeMax" | "options"> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const opts = Array.isArray(o.options) ? (o.options as unknown[]).map(String) : [];
  return {
    // rangeMin guarda o min (número/data em dd/MM/yyyy) ou o texto padrão.
    rangeMin: isoToBr(o.min != null ? String(o.min) : o.text != null ? String(o.text) : ""),
    rangeMax: isoToBr(o.max == null ? "" : String(o.max)),
    options: opts.join("\n"),
  };
}

function CamposDoSitePage() {
  const { t } = useT();
  const siteId = useDefaultSiteId();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteFieldRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<SiteFieldRow | null>(null);

  const fieldsQuery = useQuery({
    queryKey: ["site-custom-fields", siteId],
    queryFn: async (): Promise<SiteFieldRow[]> => {
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "*, definition:custom_field_definitions(custom_field_name, custom_field_type, display_name), worker_type:worker_types(name)",
        )
        .eq("site_id", siteId as string)
        .order("display_index", { ascending: true, nullsFirst: false })
        .returns<SiteFieldRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(siteId),
  });

  const workerTypesQuery = useQuery({
    queryKey: ["worker-types"],
    queryFn: async (): Promise<WorkerType[]> => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const workerTypes = workerTypesQuery.data ?? [];

  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections"],
    queryFn: () => argusApi.listCustomFieldSections(),
    staleTime: 5 * 60 * 1000,
  });
  const sections = sectionsQuery.data ?? [];
  // custom_field_name -> nome de exibição da seção
  const sectionByField = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sections) {
      for (const f of sec.fields) m.set(f.name, sec.displayName || sec.sectionName);
    }
    return m;
  }, [sections]);
  // Campos da seção selecionada no formulário (null = todas).
  const sectionFieldNames = useMemo(() => {
    if (!form.section || form.section === ALL_SECTIONS) return null;
    const sec = sections.find((s) => s.sectionName === form.section);
    return new Set((sec?.fields ?? []).map((f) => f.name));
  }, [sections, form.section]);

  const defsQuery = useQuery({
    queryKey: ["custom-field-definitions", siteId],
    queryFn: async (): Promise<Definition[]> => {
      // Sincroniza o catálogo direto do Argus (não depende de visitar outra tela).
      try {
        const argusDefs = await argusApi.listCustomFields();
        await mirrorCustomFieldDefs(argusDefs.filter((d) => !d.isDeleted));
      } catch {
        // Argus indisponível — segue com o que já houver no catálogo do Supabase.
      }
      const { data, error } = await supabase
        .from("custom_field_definitions")
        .select("*")
        .eq("is_deleted", false)
        .order("custom_field_name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Um campo pode ser usado uma vez por (entidade, tipo de trabalhador).
  // company ignora o tipo. Filtra os já usados no escopo selecionado.
  const usedIdsForScope = useMemo(
    () =>
      new Set(
        (fieldsQuery.data ?? [])
          .filter(
            (f) =>
              f.entity_type === form.entity_type &&
              (form.entity_type === "company" || f.worker_type_id === form.worker_type_id),
          )
          .map((f) => f.definition_id),
      ),
    [fieldsQuery.data, form.entity_type, form.worker_type_id],
  );
  const availableDefs = useMemo(
    () =>
      (defsQuery.data ?? []).filter(
        (d) =>
          editing?.definition_id === d.id ||
          (!usedIdsForScope.has(d.id) &&
            (!sectionFieldNames || sectionFieldNames.has(d.custom_field_name))),
      ),
    [defsQuery.data, usedIdsForScope, editing, sectionFieldNames],
  );

  const defsById = useMemo(
    () => new Map((defsQuery.data ?? []).map((d) => [d.id, d])),
    [defsQuery.data],
  );

  // Campos disponíveis agrupados por seção (para a seleção múltipla).
  const availableBySection = useMemo(() => {
    const groups = new Map<string, Definition[]>();
    for (const d of availableDefs) {
      const key = sectionByField.get(d.custom_field_name) ?? t("siteFields.otherSection");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }),
    );
  }, [availableDefs, sectionByField, t]);

  const selectedDef = useMemo(
    () => (defsQuery.data ?? []).find((d) => d.id === form.definition_id) ?? null,
    [defsQuery.data, form.definition_id],
  );
  const kind = typeOf(selectedDef?.custom_field_type);

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      const common = {
        site_id: siteId as string,
        entity_type: f.entity_type,
        is_required: f.is_required,
        is_active: f.is_active,
        fillable: f.entity_type === "identity" ? f.fillable : true,
        related_identity_field_id:
          f.entity_type === "company" && f.related_identity_field_id !== NO_RELATION
            ? f.related_identity_field_id
            : null,
        display_index: f.display_index.trim() ? Number(f.display_index) : null,
      };

      if (editing) {
        // Edição de um único campo (com override/faixa próprios).
        const { error } = await supabase
          .from("site_custom_fields")
          .update({
            ...common,
            definition_id: f.definition_id,
            worker_type_id: f.entity_type === "identity" ? f.worker_type_id : null,
            display_name_override: buildOverride(f.override),
            value_range: buildRange(kind, f),
          })
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
        return;
      }

      // Adição em lote: múltiplos campos × tipos de trabalhador.
      const workerTypeIds =
        f.entity_type === "company"
          ? [null]
          : f.worker_type_id === ALL_WORKER_TYPES
            ? workerTypes.map((w) => w.id)
            : [f.worker_type_id];

      // (entity, definition, worker_type) já existentes — para não duplicar.
      const existing = new Set(
        (fieldsQuery.data ?? [])
          .filter((r) => r.entity_type === f.entity_type)
          .map((r) => `${r.definition_id}|${r.worker_type_id ?? ""}`),
      );

      const rows: Database["public"]["Tables"]["site_custom_fields"]["Insert"][] = [];
      for (const defId of f.selectedIds) {
        const def = defsById.get(defId);
        for (const wt of workerTypeIds) {
          if (existing.has(`${defId}|${wt ?? ""}`)) continue;
          rows.push({
            ...common,
            definition_id: defId,
            worker_type_id: wt,
            // Nome de exibição = descrição do campo (display_name do catálogo).
            display_name_override: (def?.display_name ?? {}) as Json,
            value_range: null,
          });
        }
      }
      if (!rows.length) return;
      const { error } = await supabase.from("site_custom_fields").insert(rows);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(editing ? t("siteFields.toast.updated") : t("siteFields.toast.added"));
      qc.invalidateQueries({ queryKey: ["site-custom-fields", siteId] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_custom_fields").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("siteFields.toast.removed"));
      qc.invalidateQueries({ queryKey: ["site-custom-fields", siteId] });
      setToDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (row: SiteFieldRow) => {
    setEditing(row);
    setForm({
      entity_type: row.entity_type,
      section: ALL_SECTIONS,
      definition_id: row.definition_id,
      selectedIds: [],
      worker_type_id: row.worker_type_id ?? "",
      is_required: row.is_required,
      fillable: row.fillable,
      related_identity_field_id: row.related_identity_field_id ?? NO_RELATION,
      is_active: row.is_active,
      display_index: row.display_index == null ? "" : String(row.display_index),
      override: langFromJson(row.display_name_override),
      ...rangeToForm(row.value_range),
    });
    setDialogOpen(true);
  };
  const submit = () => {
    if (form.entity_type === "identity" && !form.worker_type_id) {
      toast.error(t("siteFields.validation.workerType"));
      return;
    }
    if (editing ? !form.definition_id : form.selectedIds.length === 0) {
      toast.error(t("siteFields.validation.field"));
      return;
    }
    upsert.mutate(form);
  };

  const toggleSelected = (id: string) =>
    setForm((f) => ({
      ...f,
      selectedIds: f.selectedIds.includes(id)
        ? f.selectedIds.filter((x) => x !== id)
        : [...f.selectedIds, id],
    }));
  const toggleGroup = (ids: string[], all: boolean) =>
    setForm((f) => ({
      ...f,
      selectedIds: all
        ? f.selectedIds.filter((x) => !ids.includes(x))
        : [...new Set([...f.selectedIds, ...ids])],
    }));

  const items = fieldsQuery.data ?? [];
  // Agrupa os campos existentes por seção (ClearID), em ordem alfabética.
  const groupedItems = useMemo(() => {
    const groups = new Map<string, SiteFieldRow[]>();
    for (const row of items) {
      const key = sectionByField.get(row.definition?.custom_field_name ?? "") ?? t("siteFields.otherSection");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    const arr = [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }),
    );
    for (const [, rows] of arr) {
      rows.sort((a, b) =>
        (a.definition?.custom_field_name ?? "").localeCompare(
          b.definition?.custom_field_name ?? "",
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
    }
    return arr;
  }, [items, sectionByField, t]);

  const renderRow = (row: SiteFieldRow) => (
    <TableRow key={row.id}>
      <TableCell className="font-medium">{row.definition?.custom_field_name ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={row.entity_type === "company" ? "default" : "secondary"}>
          {row.entity_type === "company" ? t("siteFields.entity.company") : t("siteFields.entity.identity")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{row.worker_type?.name ?? "—"}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.definition?.custom_field_type ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {langFromJson(row.display_name_override)["pt-BR"] || "—"}
      </TableCell>
      <TableCell>
        {row.is_required ? (
          <Badge>{t("common.yes")}</Badge>
        ) : (
          <Badge variant="secondary">{t("common.no")}</Badge>
        )}
      </TableCell>
      <TableCell>
        {row.is_active ? (
          <Badge variant="secondary">{t("common.yes")}</Badge>
        ) : (
          <Badge variant="outline">{t("common.no")}</Badge>
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("siteFields.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("siteFields.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fieldsQuery.refetch()}
            disabled={fieldsQuery.isFetching || !siteId}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${fieldsQuery.isFetching ? "animate-spin" : ""}`} />
            {t("siteFields.refresh")}
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!siteId}>
            <Plus className="mr-1 h-4 w-4" /> {t("siteFields.addButton")}
          </Button>
        </div>
      </div>

      {!siteId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("siteFields.noSite.prefix")}{" "}
            <span className="font-medium">{t("siteFields.noSite.settings")}</span>{" "}
            {t("siteFields.noSite.suffix")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {fieldsQuery.data
                ? items.length === 1
                  ? t("siteFields.countOne", { count: items.length })
                  : t("siteFields.countOther", { count: items.length })
                : t("siteFields.countLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fieldsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : fieldsQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {(fieldsQuery.error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("siteFields.emptyState")}
              </p>
            ) : (
              <div className="space-y-6">
                {groupedItems.map(([section, rows]) => (
                  <div key={section} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{section}</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("siteFields.col.field")}</TableHead>
                          <TableHead>{t("siteFields.col.entity")}</TableHead>
                          <TableHead>{t("siteFields.col.worker")}</TableHead>
                          <TableHead>{t("siteFields.col.type")}</TableHead>
                          <TableHead>{t("siteFields.col.display")}</TableHead>
                          <TableHead>{t("siteFields.col.required")}</TableHead>
                          <TableHead>{t("siteFields.col.active")}</TableHead>
                          <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>{rows.map(renderRow)}</TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              {editing ? t("siteFields.dialog.editTitle") : t("siteFields.dialog.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("siteFields.dialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("siteFields.form.entity")}</Label>
              <Select
                value={form.entity_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, entity_type: v, worker_type_id: "", definition_id: "" }))
                }
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="identity">{t("siteFields.entity.identity")}</SelectItem>
                  <SelectItem value="company">{t("siteFields.entity.company")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.entity_type === "identity" && (
              <div className="space-y-2">
                <Label>{t("siteFields.form.workerType")}</Label>
                <Select
                  value={form.worker_type_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, worker_type_id: v, definition_id: "" }))
                  }
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("siteFields.form.workerTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_WORKER_TYPES}>{t("siteFields.form.allWorkerTypes")}</SelectItem>
                    {workerTypes.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("siteFields.form.section")}</Label>
              <Select
                value={form.section}
                onValueChange={(v) => setForm((f) => ({ ...f, section: v, definition_id: "" }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("siteFields.form.allSections")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SECTIONS}>{t("siteFields.form.allSections")}</SelectItem>
                  {[...sections]
                    .sort((a, b) =>
                      (a.displayName || a.sectionName).localeCompare(
                        b.displayName || b.sectionName,
                        "pt-BR",
                        { sensitivity: "base" },
                      ),
                    )
                    .map((s) => (
                      <SelectItem key={s.sectionName} value={s.sectionName}>
                        {s.displayName || s.sectionName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {editing ? (
              <div className="space-y-2">
                <Label>{t("siteFields.col.field")}</Label>
                <Select value={form.definition_id} onValueChange={() => {}} disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={t("siteFields.form.fieldPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDefs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {pickLang(d.display_name) || d.custom_field_name}
                        {d.custom_field_type ? ` · ${d.custom_field_type}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>
                  {t("siteFields.form.fields")}{" "}
                  <span className="text-muted-foreground">({form.selectedIds.length})</span>
                </Label>
                {form.entity_type === "identity" && !form.worker_type_id ? (
                  <p className="text-xs text-muted-foreground">
                    {t("siteFields.form.selectWorkerFirst")}
                  </p>
                ) : defsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    {t("siteFields.form.loadingFields")}
                  </p>
                ) : availableBySection.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("siteFields.form.noFieldsAvailable")}
                  </p>
                ) : (
                  <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                    {availableBySection.map(([section, defs]) => {
                      const ids = defs.map((d) => d.id);
                      const allSelected = ids.every((id) => form.selectedIds.includes(id));
                      return (
                        <div key={section} className="space-y-1.5">
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() => toggleGroup(ids, allSelected)}
                            />
                            {section}
                          </label>
                          <div className="ml-6 space-y-1">
                            {defs.map((d) => (
                              <label
                                key={d.id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={form.selectedIds.includes(d.id)}
                                  onCheckedChange={() => toggleSelected(d.id)}
                                />
                                <span>{pickLang(d.display_name) || d.custom_field_name}</span>
                                {d.custom_field_type && (
                                  <span className="text-xs text-muted-foreground">
                                    · {d.custom_field_type}
                                  </span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {editing && (
            <>
            <div className="space-y-2">
              <Label>{t("siteFields.form.displayName")}</Label>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  value={form.override["pt-BR"]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, override: { ...f.override, "pt-BR": e.target.value } }))
                  }
                  placeholder={t("siteFields.form.ptDefault")}
                />
                <Input
                  value={form.override["en-US"]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, override: { ...f.override, "en-US": e.target.value } }))
                  }
                  placeholder="en-US"
                />
                <Input
                  value={form.override["es-ES"]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, override: { ...f.override, "es-ES": e.target.value } }))
                  }
                  placeholder="es-ES"
                />
              </div>
            </div>

            {/* Faixa de valores conforme o tipo */}
            {kind === "number" || kind === "date" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("siteFields.form.minValue")}</Label>
                  <Input
                    type={kind === "date" ? "text" : "number"}
                    inputMode={kind === "date" ? "numeric" : undefined}
                    placeholder={kind === "date" ? "dd/MM/yyyy" : undefined}
                    value={form.rangeMin}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        rangeMin: kind === "date" ? maskDate(e.target.value) : e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("siteFields.form.maxValue")}</Label>
                  <Input
                    type={kind === "date" ? "text" : "number"}
                    inputMode={kind === "date" ? "numeric" : undefined}
                    placeholder={kind === "date" ? "dd/MM/yyyy" : undefined}
                    value={form.rangeMax}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        rangeMax: kind === "date" ? maskDate(e.target.value) : e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : kind === "list" ? (
              <div className="space-y-2">
                <Label>{t("siteFields.form.options")}</Label>
                <Textarea
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  rows={4}
                  placeholder={t("siteFields.form.optionsPlaceholder")}
                />
              </div>
            ) : kind === "text" ? (
              <div className="space-y-2">
                <Label>{t("siteFields.form.defaultValue")}</Label>
                <Input
                  value={form.rangeMin}
                  onChange={(e) => setForm((f) => ({ ...f, rangeMin: e.target.value }))}
                  placeholder={t("siteFields.form.defaultValuePlaceholder")}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("siteFields.form.rangeNotApplicable")}
              </p>
            )}
            </>
            )}

            <div className="grid grid-cols-3 items-end gap-3">
              <div className="space-y-2">
                <Label>{t("siteFields.form.order")}</Label>
                <Input
                  type="number"
                  value={form.display_index}
                  onChange={(e) => setForm((f) => ({ ...f, display_index: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_required}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_required: v }))}
                />
                <Label className="cursor-pointer">{t("siteFields.form.required")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label className="cursor-pointer">{t("siteFields.form.active")}</Label>
              </div>
            </div>

            {form.entity_type === "identity" && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.fillable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, fillable: v }))}
                />
                <Label className="cursor-pointer">{t("siteFields.form.fillable")}</Label>
              </div>
            )}

            {form.entity_type === "company" && (
              <div className="space-y-2">
                <Label>{t("siteFields.form.relatedField")}</Label>
                <Select
                  value={form.related_identity_field_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, related_identity_field_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("siteFields.form.none")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RELATION}>{t("siteFields.form.none")}</SelectItem>
                    {(fieldsQuery.data ?? [])
                      .filter((r) => r.entity_type === "identity")
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.definition?.custom_field_name ?? "—"}
                          {r.worker_type?.name ? ` · ${r.worker_type.name}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("siteFields.form.relatedFieldHint")}
                </p>
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

      {/* Confirmação de remoção */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("siteFields.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("siteFields.delete.prefix")}{" "}
              <span className="font-medium">{toDelete?.definition?.custom_field_name}</span>{" "}
              {t("siteFields.delete.suffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? t("siteFields.delete.removing") : t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
