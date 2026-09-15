import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { argusApi, useActiveProfile } from "@/lib/argus-client";
import { mirrorCustomFieldDefs } from "@/lib/supabase-mirror";
import { typeOf, pickLang } from "@/lib/custom-fields";
import { STANDARD_IDENTITY_FIELDS, useIdentityFieldLabels } from "@/lib/identity-labels";
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
  head: () => ({ meta: [{ title: "Campos do cliente — Argus ClearID" }] }),
  component: CamposDoSitePage,
});

const ALL_WORKER_TYPES = "__ALL__";
// "Permitido no site": campo do pool do site (worker_type_id null), sem vínculo
// a um tipo de trabalhador. É o nível que alimenta o layout do formulário.
const ALLOWED_SITE = "__ALLOWED_SITE__";
const ALL_SECTIONS = "__ALL_SECTIONS__";
// Campos NATIVOS do ClearID (básicos/private/company) selecionáveis no site.
// No `selectedIds`, uma chave nativa vem prefixada para não colidir com os
// UUIDs das definições do catálogo.
const NATIVE_PREFIX = "native:";
const NATIVE_SECTION = "ClearID (nativos)";
const NATIVE_KEYS = STANDARD_IDENTITY_FIELDS.map((f) => f.key);
const NATIVE_LABEL_KEY: Record<string, string> = {
  company_worker_type_code: "identityForm.workerType",
  first_name: "common.name",
  last_name: "identityForm.lastName",
  display_name: "identityForm.displayName",
  email: "common.email",
  company_site_id: "identityForm.site",
  company_id: "identityForm.company",
};

type Definition = Database["public"]["Tables"]["custom_field_definitions"]["Row"];
type WorkerType = Database["public"]["Tables"]["worker_types"]["Row"];
type SiteFieldRow = Database["public"]["Tables"]["site_custom_fields"]["Row"] & {
  definition: Pick<Definition, "custom_field_name" | "custom_field_type" | "display_name"> | null;
  worker_type: Pick<WorkerType, "name" | "name_i18n"> | null;
};

type MultiLang = { "pt-BR": string; "en-US": string; "es-ES": string };

const NO_RELATION = "__NONE__";

type FormState = {
  entity_type: string; // identity | company
  section: string; // sectionName do ClearID ou ALL_SECTIONS
  definition_id: string; // usado na EDIÇÃO (campo único do catálogo)
  native_field_key: string; // usado na EDIÇÃO (campo único nativo do ClearID)
  selectedIds: string[]; // usado ao ADICIONAR (múltiplos; nativo vem "native:<key>")
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
  native_field_key: "",
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
  const { t, lang } = useT();
  const qc = useQueryClient();
  // Campos são por CLIENTE (profile), válidos em todos os sites do cliente.
  const activeProfile = useActiveProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteFieldRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<SiteFieldRow | null>(null);

  const fieldsQuery = useQuery({
    queryKey: ["site-custom-fields", activeProfile],
    queryFn: async (): Promise<SiteFieldRow[]> => {
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "*, definition:custom_field_definitions(custom_field_name, custom_field_type, display_name), worker_type:worker_types(name, name_i18n)",
        )
        .eq("profile", activeProfile)
        .order("display_index", { ascending: true, nullsFirst: false })
        .returns<SiteFieldRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
  });

  const workerTypesQuery = useQuery({
    queryKey: ["worker-types", activeProfile],
    queryFn: async (): Promise<WorkerType[]> => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .eq("is_active", true)
        .eq("profile", activeProfile)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const workerTypes = workerTypesQuery.data ?? [];

  // Seções unificadas (ClearID + Supabase) — direto do backend, com `storage`.
  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections", "unified", activeProfile],
    queryFn: () =>
      argusApi.listCustomFieldSectionsUnified({ source: "all", profile: activeProfile }),
    staleTime: 5 * 60 * 1000,
  });
  const sections = sectionsQuery.data ?? [];
  // custom_field_name -> nome de exibição da seção
  const sectionByField = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sections) {
      for (const name of sec.fieldNames) m.set(name, sec.displayName || sec.sectionName);
    }
    return m;
  }, [sections]);
  // Campos da seção selecionada no formulário (null = todas).
  const sectionFieldNames = useMemo(() => {
    if (!form.section || form.section === ALL_SECTIONS) return null;
    const sec = sections.find((s) => s.sectionName === form.section);
    return new Set(sec?.fieldNames ?? []);
  }, [sections, form.section]);

  const defsQuery = useQuery({
    queryKey: ["custom-field-definitions", activeProfile],
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
  const { alias } = useIdentityFieldLabels();
  // Rótulo de um campo nativo do ClearID (com apelido, quando houver).
  const nativeLabel = (key: string) =>
    alias(key, t(NATIVE_LABEL_KEY[key] ?? `identityForm.extra.${key}`));

  // Escopo do seletor: "Permitido no site" → linhas com worker_type_id null;
  // um tipo específico → linhas daquele tipo. (ALL_WORKER_TYPES não casa com
  // nenhuma linha → mostra tudo; a duplicação é evitada no insert.)
  const scopeWt = form.worker_type_id === ALLOWED_SITE ? null : form.worker_type_id;
  const rowsInScope = useMemo(
    () =>
      (fieldsQuery.data ?? []).filter(
        (f) =>
          f.entity_type === form.entity_type &&
          (form.entity_type === "company" || f.worker_type_id === scopeWt),
      ),
    [fieldsQuery.data, form.entity_type, scopeWt],
  );
  const usedIdsForScope = useMemo(
    () => new Set(rowsInScope.map((f) => f.definition_id).filter(Boolean) as string[]),
    [rowsInScope],
  );
  // Chaves nativas já usadas no escopo (para não reoferecer no seletor).
  const usedNativeForScope = useMemo(
    () => new Set(rowsInScope.map((f) => f.native_field_key).filter(Boolean) as string[]),
    [rowsInScope],
  );
  // Campos nativos disponíveis para adicionar (só identity; company não usa).
  const availableNative = useMemo(
    () =>
      form.entity_type === "company"
        ? []
        : NATIVE_KEYS.filter(
            (k) => editing?.native_field_key === k || !usedNativeForScope.has(k),
          ),
    [form.entity_type, usedNativeForScope, editing],
  );
  const availableDefs = useMemo(
    () =>
      (defsQuery.data ?? []).filter(
        (d) =>
          editing?.definition_id === d.id ||
          (!usedIdsForScope.has(d.id) &&
            (!sectionFieldNames || sectionFieldNames.has(d.custom_field_name)) &&
            // Anexo só se aplica a identidade (não há upload por empresa).
            !(form.entity_type === "company" && typeOf(d.custom_field_type) === "attachment")),
      ),
    [defsQuery.data, usedIdsForScope, editing, sectionFieldNames, form.entity_type],
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
        profile: activeProfile,
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
        // Edição de um único campo (do catálogo OU nativo do ClearID).
        const isNative = Boolean(f.native_field_key);
        const { error } = await supabase
          .from("site_custom_fields")
          .update({
            ...common,
            definition_id: isNative ? null : f.definition_id,
            native_field_key: isNative ? f.native_field_key : null,
            worker_type_id:
              f.entity_type === "identity"
                ? f.worker_type_id === ALLOWED_SITE
                  ? null
                  : f.worker_type_id
                : null,
            display_name_override: buildOverride(f.override),
            value_range: buildRange(kind, f),
          })
          .eq("id", editing.id);
        if (error) throw new Error(error.message);
        return;
      }

      // Adição em lote: múltiplos campos × tipos de trabalhador.
      const workerTypeIds: (string | null)[] =
        f.entity_type === "company"
          ? [null]
          : f.worker_type_id === ALLOWED_SITE
            ? [null] // permitido no site (pool)
            : f.worker_type_id === ALL_WORKER_TYPES
              ? workerTypes.map((w) => w.id)
              : [f.worker_type_id];

      // (entity, campo, worker_type) já existentes — para não duplicar. A chave
      // do campo é a definição do catálogo OU a chave nativa.
      const keyOf = (defId: string | null, nativeKey: string | null, wt: string | null) =>
        `${defId ?? ""}|${nativeKey ?? ""}|${wt ?? ""}`;
      const existing = new Set(
        (fieldsQuery.data ?? [])
          .filter((r) => r.entity_type === f.entity_type)
          .map((r) => keyOf(r.definition_id, r.native_field_key, r.worker_type_id)),
      );

      const rows: Database["public"]["Tables"]["site_custom_fields"]["Insert"][] = [];
      for (const sel of f.selectedIds) {
        const isNative = sel.startsWith(NATIVE_PREFIX);
        const nativeKey = isNative ? sel.slice(NATIVE_PREFIX.length) : null;
        const defId = isNative ? null : sel;
        const def = defId ? defsById.get(defId) : undefined;
        for (const wt of workerTypeIds) {
          if (existing.has(keyOf(defId, nativeKey, wt))) continue;
          rows.push({
            ...common,
            definition_id: defId,
            native_field_key: nativeKey,
            worker_type_id: wt,
            // Nome de exibição = descrição do catálogo; nativos ficam sem override
            // (usam o rótulo padrão do ClearID).
            display_name_override: (isNative ? {} : (def?.display_name ?? {})) as Json,
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
      qc.invalidateQueries({ queryKey: ["site-custom-fields", activeProfile] });
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
      qc.invalidateQueries({ queryKey: ["site-custom-fields", activeProfile] });
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
      definition_id: row.definition_id ?? "",
      native_field_key: row.native_field_key ?? "",
      selectedIds: [],
      // Identity sem tipo = "permitido no site"; empresa não usa tipo.
      worker_type_id:
        row.worker_type_id ?? (row.entity_type === "identity" ? ALLOWED_SITE : ""),
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
    if (editing ? !form.definition_id && !form.native_field_key : form.selectedIds.length === 0) {
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
      const key = row.native_field_key
        ? NATIVE_SECTION
        : (sectionByField.get(row.definition?.custom_field_name ?? "") ??
          t("siteFields.otherSection"));
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
      <TableCell className="font-medium">
        {row.native_field_key
          ? nativeLabel(row.native_field_key)
          : (row.definition?.custom_field_name ?? "—")}
      </TableCell>
      <TableCell>
        <Badge variant={row.entity_type === "company" ? "default" : "secondary"}>
          {row.entity_type === "company"
            ? t("siteFields.entity.company")
            : t("siteFields.entity.identity")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {row.worker_type_id
            ? pickLang(row.worker_type?.name_i18n, lang) || row.worker_type?.name || "—"
            : row.entity_type === "identity"
              ? t("siteFields.allowedSite")
              : "—"}
        </Badge>
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
            disabled={fieldsQuery.isFetching || !activeProfile}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${fieldsQuery.isFetching ? "animate-spin" : ""}`} />
            {t("siteFields.refresh")}
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!activeProfile}>
            <Plus className="mr-1 h-4 w-4" /> {t("siteFields.addButton")}
          </Button>
        </div>
      </div>

      {!activeProfile ? (
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
                          <TableHead className="w-[100px] text-right">
                            {t("common.actions")}
                          </TableHead>
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
                    <SelectItem value={ALLOWED_SITE}>
                      {t("siteFields.form.allowedSite")}
                    </SelectItem>
                    <SelectItem value={ALL_WORKER_TYPES}>
                      {t("siteFields.form.allWorkerTypes")}
                    </SelectItem>
                    {workerTypes.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {pickLang(w.name_i18n, lang) || w.name}
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
                ) : availableBySection.length === 0 && availableNative.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("siteFields.form.noFieldsAvailable")}
                  </p>
                ) : (
                  <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                    {availableNative.length > 0 && (
                      <div className="space-y-1.5">
                        {(() => {
                          const nids = availableNative.map((k) => NATIVE_PREFIX + k);
                          const allSel = nids.every((id) => form.selectedIds.includes(id));
                          return (
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <Checkbox
                                checked={allSel}
                                onCheckedChange={() => toggleGroup(nids, allSel)}
                              />
                              {NATIVE_SECTION}
                            </label>
                          );
                        })()}
                        <div className="ml-6 space-y-1">
                          {availableNative.map((k) => (
                            <label
                              key={k}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={form.selectedIds.includes(NATIVE_PREFIX + k)}
                                onCheckedChange={() => toggleSelected(NATIVE_PREFIX + k)}
                              />
                              <span>{nativeLabel(k)}</span>
                              <span className="text-xs text-muted-foreground">· ClearID</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
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
                        setForm((f) => ({
                          ...f,
                          override: { ...f.override, "pt-BR": e.target.value },
                        }))
                      }
                      placeholder={t("siteFields.form.ptDefault")}
                    />
                    <Input
                      value={form.override["en-US"]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          override: { ...f.override, "en-US": e.target.value },
                        }))
                      }
                      placeholder="en-US"
                    />
                    <Input
                      value={form.override["es-ES"]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          override: { ...f.override, "es-ES": e.target.value },
                        }))
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
                  onValueChange={(v) => setForm((f) => ({ ...f, related_identity_field_id: v }))}
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
                          {r.worker_type
                            ? ` · ${pickLang(r.worker_type.name_i18n, lang) || r.worker_type.name}`
                            : ""}
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
