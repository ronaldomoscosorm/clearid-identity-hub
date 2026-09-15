import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  useSensor,
  useSensors,
  useDroppable,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Hourglass, Plus, Trash2, Search, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STANDARD_IDENTITY_FIELDS, useIdentityFieldLabels } from "@/lib/identity-labels";
import {
  useFormLayoutConfig,
  saveFormLayoutConfig,
  exportFormLayoutToClients,
  REQUIRED_KEYS,
  CF_PREFIX,
  type FormLayout,
  type FormLayoutConfig,
} from "@/lib/form-layout";
import { argusApi, useDefaultSiteId, useActiveProfile, setSessionProfile, setSessionSiteId } from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSpecialFields } from "@/lib/special-fields";
import { pickLang } from "@/lib/custom-fields";
import type { Json } from "@/integrations/supabase/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/layout-formulario")({
  head: () => ({ meta: [{ title: "Layout do formulário — Argus ClearID" }] }),
  component: LayoutFormularioPage,
});

const LABEL_KEY: Record<string, string> = {
  company_worker_type_code: "identityForm.workerType",
  first_name: "common.name",
  last_name: "identityForm.lastName",
  display_name: "identityForm.displayName",
  email: "common.email",
  company_site_id: "identityForm.site",
  company_id: "identityForm.company",
};
const REQUIRED = new Set(REQUIRED_KEYS);
const ALL_KEYS = STANDARD_IDENTITY_FIELDS.map((f) => f.key);
const AVAILABLE = "available";
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.round(performance.now() * 1000)}`;

type EditGroup = { gid: string; name: string; fields: string[] };
type Model = { available: string[]; groups: EditGroup[] };

// Monta o model de edição; `pool` são todas as chaves disponíveis (padrão + cf).
function layoutToModel(layout: FormLayout, pool: string[]): Model {
  const groups: EditGroup[] = layout.groups.map((g) => ({
    gid: uid(),
    name: g.name,
    fields: [...g.fields],
  }));
  if (groups.length === 0) groups.push({ gid: uid(), name: "", fields: [] });
  const used = new Set(groups.flatMap((g) => g.fields));
  const available = pool.filter((k) => !used.has(k));
  return { available, groups };
}

const modelToGroups = (m: Model) =>
  m.groups.map((g) => ({ name: g.name.trim(), fields: g.fields }));

function LayoutFormularioPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const { alias } = useIdentityFieldLabels();

  // Layout e tipos de trabalhador são POR CLIENTE (perfil ClearID). O designer
  // escolhe o CLIENTE; um site do cliente é usado internamente apenas como fonte
  // dos campos disponíveis na paleta (inclui campos locais, ex.: Anexo).
  const activeProfile = useActiveProfile();
  const defaultSiteId = useDefaultSiteId();
  const scope = useUserScope();

  // Sites reativos ao cliente ativo (a key inclui o perfil).
  const sitesQuery = useQuery({
    queryKey: ["sites", activeProfile],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = scope
    .filterSites(sitesQuery.data ?? [], activeProfile)
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  // Site fonte dos campos: o do topbar se pertence ao cliente, senão o primeiro.
  const editSiteId =
    sites.find((s) => s.siteId === defaultSiteId)?.siteId ?? sites[0]?.siteId ?? "";
  const editSiteName = sites.find((s) => s.siteId === editSiteId)?.name ?? "";

  // Troca o cliente (perfil) na sessão — mesmo comportamento do topbar: reseta o
  // site da sessão e limpa os caches para recarregar layout, tipos e campos do
  // novo cliente (sem estado obsoleto).
  const changeClient = (code: string) => {
    if (code === activeProfile) return;
    setSessionProfile(code);
    setSessionSiteId(null);
    qc.clear();
  };

  const { config, loaded } = useFormLayoutConfig(activeProfile, editSiteId || null);

  // Campos customizáveis — endpoint UNIFICADO (source=all): união ClearID +
  // Supabase, por cliente, com `storage`. Todos ficam disponíveis no palette.
  const customFieldsQuery = useQuery({
    queryKey: ["custom-fields", "unified", activeProfile],
    queryFn: () => argusApi.listCustomFieldsUnified({ source: "all", profile: activeProfile }),
    staleTime: 5 * 60 * 1000,
  });
  const allCustomDefs = (customFieldsQuery.data ?? []).filter((f) => !f.isDeleted);

  // Campos do SITE EDITADO. Buscamos as linhas com a origem (definição do
  // catálogo OU nativo) e o worker_type_id, para derivar o POOL "permitido no
  // site" (worker_type_id null) que limita os campos disponíveis no layout.
  type SiteDef = { custom_field_name: string; display_name: Json; is_local: boolean };
  type SiteRow = {
    worker_type_id: string | null;
    native_field_key: string | null;
    definition: SiteDef | null;
  };
  const siteFieldsQuery = useQuery({
    queryKey: ["layout-site-field-names", activeProfile],
    queryFn: async (): Promise<SiteRow[]> => {
      // Campos por CLIENTE (profile), não mais por site.
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "worker_type_id, native_field_key, definition:custom_field_definitions(custom_field_name, display_name, is_local)",
        )
        .eq("profile", activeProfile)
        .eq("entity_type", "identity")
        .eq("is_active", true)
        .returns<SiteRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(activeProfile),
    staleTime: 5 * 60 * 1000,
  });
  const siteRows = siteFieldsQuery.data ?? [];
  const siteDefs = siteRows
    .map((r) => r.definition)
    .filter((d): d is SiteDef => Boolean(d));

  // "Permitido no site" = linhas com worker_type_id null. Se o site ainda não
  // tem nenhum permitido configurado, mantém o pool completo (não quebra sites
  // existentes que só usam o Layout do formulário).
  const allowedRows = siteRows.filter((r) => r.worker_type_id === null);
  const allowedConfigured = allowedRows.length > 0;
  const allowedNative = new Set(
    allowedRows.map((r) => r.native_field_key).filter((k): k is string => Boolean(k)),
  );
  const allowedCustomNames = new Set(
    allowedRows
      .map((r) => r.definition?.custom_field_name)
      .filter((n): n is string => Boolean(n)),
  );

  // Dropdowns especiais — ficam disponíveis independentemente do site.
  const { list: specialList, loaded: specialLoaded } = useSpecialFields();

  const siteCustomDefs = allCustomDefs;
  const cfLabel = new Map(
    allCustomDefs.map((d) => [CF_PREFIX + d.customFieldName, d.displayName || d.customFieldName]),
  );
  for (const s of specialList) if (s.label) cfLabel.set(CF_PREFIX + s.custom_field_name, s.label);
  // Campos locais (ex.: Anexo) do site — rótulo pelo display_name multilíngue.
  const localSiteDefs = siteDefs.filter((d) => d.is_local);
  for (const d of localSiteDefs) {
    cfLabel.set(CF_PREFIX + d.custom_field_name, pickLang(d.display_name) || d.custom_field_name);
  }

  // Pool limitado ao permitido no site (quando configurado). Os campos NATIVOS
  // obrigatórios entram sempre (o formulário precisa deles); os dropdowns
  // especiais também (mecanismo global). O resto é gated pelo permitido.
  const nativePool = allowedConfigured
    ? ALL_KEYS.filter((k) => REQUIRED.has(k) || allowedNative.has(k))
    : ALL_KEYS;
  const catalogCustomKeys = siteCustomDefs
    .filter((d) => !allowedConfigured || allowedCustomNames.has(d.customFieldName))
    .map((d) => CF_PREFIX + d.customFieldName);
  const specialKeys = specialList.map((s) => CF_PREFIX + s.custom_field_name);
  const localKeys = localSiteDefs
    .filter((d) => !allowedConfigured || allowedCustomNames.has(d.custom_field_name))
    .map((d) => CF_PREFIX + d.custom_field_name);
  const customKeys = [...new Set([...catalogCustomKeys, ...specialKeys, ...localKeys])];
  const pool = [...nativePool, ...customKeys];
  const siteReady = !editSiteId || siteFieldsQuery.isSuccess;
  const ready = loaded && customFieldsQuery.isSuccess && siteReady && specialLoaded;

  const labelOf = (key: string) => {
    if (key.startsWith(CF_PREFIX))
      return alias(key.slice(CF_PREFIX.length), cfLabel.get(key) ?? key.slice(CF_PREFIX.length));
    return alias(key, t(LABEL_KEY[key] ?? `identityForm.extra.${key}`));
  };

  const [layouts, setLayouts] = useState<FormLayout[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [selId, setSelId] = useState<string>("");
  const [model, setModel] = useState<Model>({ available: [], groups: [] });
  const [search, setSearch] = useState("");

  // Reinicializa o editor ao trocar o CLIENTE (a config/layouts são por cliente)
  // ou o site ativo (recompõe a paleta). A chave inclui o perfil para garantir
  // o re-seed mesmo quando o site derivado não muda.
  const initedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const key = `${activeProfile}::${editSiteId}`;
    if (initedKey.current === key) return;
    initedKey.current = key;
    setLayouts(config.layouts.map((l) => ({ ...l, groups: l.groups.map((g) => ({ ...g })) })));
    setLinks({ ...config.links });
    const first = config.layouts[0];
    setSelId(first.id);
    setModel(layoutToModel(first, pool));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeProfile, editSiteId]);

  const workerTypesQuery = useQuery({
    queryKey: ["worker-types", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .eq("is_active", true)
        .eq("profile", activeProfile)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const workerTypes = workerTypesQuery.data ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selName = layouts.find((l) => l.id === selId)?.name ?? "";

  // Grava o model atual de volta no layout selecionado (chamado antes de trocar/salvar).
  const commit = (ls: FormLayout[]): FormLayout[] =>
    ls.map((l) => (l.id === selId ? { ...l, groups: modelToGroups(model) } : l));

  const switchTo = (id: string) => {
    if (id === selId) return;
    const committed = commit(layouts);
    const target = committed.find((l) => l.id === id);
    setLayouts(committed);
    setSelId(id);
    if (target) setModel(layoutToModel(target, pool));
  };

  const addLayout = () => {
    const committed = commit(layouts);
    const nl: FormLayout = {
      id: uid(),
      name: t("formLayout.newLayoutName"),
      groups: [{ name: "", fields: [...REQUIRED_KEYS] }],
    };
    setLayouts([...committed, nl]);
    setSelId(nl.id);
    setModel(layoutToModel(nl, pool));
  };

  const deleteLayout = () => {
    if (layouts.length <= 1) return;
    const remaining = layouts.filter((l) => l.id !== selId);
    setLinks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === selId) delete next[k];
      return next;
    });
    const next = remaining[0];
    setLayouts(remaining);
    setSelId(next.id);
    setModel(layoutToModel(next, pool));
  };

  const renameLayout = (name: string) =>
    setLayouts((prev) => prev.map((l) => (l.id === selId ? { ...l, name } : l)));

  // ---- DnD ----
  const containerOf = (m: Model, id: string): string | null => {
    if (id === AVAILABLE || m.available.includes(id)) return AVAILABLE;
    const byId = m.groups.find((g) => g.gid === id);
    if (byId) return byId.gid;
    const byField = m.groups.find((g) => g.fields.includes(id));
    return byField ? byField.gid : null;
  };
  const listOf = (m: Model, c: string): string[] =>
    c === AVAILABLE ? m.available : (m.groups.find((g) => g.gid === c)?.fields ?? []);

  const isContainerId = (id: string) => id === AVAILABLE || model.groups.some((g) => g.gid === id);

  // Detecção de colisão robusta para múltiplos contêineres: usa o ponteiro para
  // achar o contêiner sob o cursor (funciona com grupos vazios) e só refina para
  // o item mais próximo quando o grupo alvo já tem campos (precisão da inserção).
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    const intersections = pointer.length ? pointer : rectIntersection(args);
    const first = getFirstCollision(intersections, "id");
    if (first == null) return closestCorners(args);
    const overId = String(first);
    if (isContainerId(overId)) {
      const items = listOf(model, overId);
      if (items.length > 0) {
        const refined = closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.id !== overId && items.includes(String(c.id)),
          ),
        });
        if (refined.length) return refined;
      }
    }
    return [{ id: overId }];
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    setModel((prev) => {
      const from = containerOf(prev, activeId);
      const to = containerOf(prev, overId);
      if (!from || !to) return prev;
      if (to === AVAILABLE && REQUIRED.has(activeId)) return prev;
      const m: Model = {
        available: [...prev.available],
        groups: prev.groups.map((g) => ({ ...g, fields: [...g.fields] })),
      };
      const src = listOf(m, from);
      const oldIdx = src.indexOf(activeId);
      if (oldIdx < 0) return prev;
      if (from === to) {
        // Reordena dentro do mesmo grupo, respeitando a posição de destino.
        let newIdx = overId === to ? src.length - 1 : src.indexOf(overId);
        if (newIdx < 0) newIdx = src.length - 1;
        src.splice(oldIdx, 1);
        src.splice(newIdx, 0, activeId);
      } else {
        // Ao incluir num outro grupo, o campo entra sempre por último.
        src.splice(oldIdx, 1);
        listOf(m, to).push(activeId);
      }
      return m;
    });
  };

  const renameGroup = (gid: string, name: string) =>
    setModel((m) => ({ ...m, groups: m.groups.map((g) => (g.gid === gid ? { ...g, name } : g)) }));
  const addGroup = () =>
    setModel((m) => ({ ...m, groups: [...m.groups, { gid: uid(), name: "", fields: [] }] }));
  const removeGroup = (gid: string) =>
    setModel((m) => {
      if (m.groups.length <= 1) return m;
      const g = m.groups.find((x) => x.gid === gid);
      if (!g) return m;
      const rest = m.groups.filter((x) => x.gid !== gid);
      const req = g.fields.filter((k) => REQUIRED.has(k));
      const opt = g.fields.filter((k) => !REQUIRED.has(k));
      rest[0] = { ...rest[0], fields: [...rest[0].fields, ...req] };
      return { available: [...m.available, ...opt], groups: rest };
    });

  const setLink = (wtId: string, layoutId: string) =>
    setLinks((prev) => {
      const next = { ...prev };
      if (layoutId === "__default__") delete next[wtId];
      else next[wtId] = layoutId;
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      const payload: FormLayoutConfig = { layouts: commit(layouts), links };
      await saveFormLayoutConfig(activeProfile, payload);
    },
    onSuccess: () => {
      toast.success(t("formLayout.saved"));
      qc.invalidateQueries({ queryKey: ["form-layout"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Exportação do layout do cliente atual para outros clientes.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTargets, setExportTargets] = useState<Record<string, boolean>>({});
  const toggleTarget = (id: string) => setExportTargets((prev) => ({ ...prev, [id]: !prev[id] }));

  const exportMut = useMutation({
    mutationFn: async () => {
      const targets = Object.keys(exportTargets).filter(
        (code) => exportTargets[code] && code !== activeProfile,
      );
      if (targets.length === 0) throw new Error(t("formLayout.export.none"));
      // Exporta exatamente o que está na tela (inclui edições não salvas).
      const payload: FormLayoutConfig = { layouts: commit(layouts), links };
      await exportFormLayoutToClients(payload, targets);
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(t("formLayout.export.done", { count }));
      qc.invalidateQueries({ queryKey: ["form-layout"] });
      setExportOpen(false);
      setExportTargets({});
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const q = search.trim().toLowerCase();
  const availShown = q
    ? model.available.filter((k) => labelOf(k).toLowerCase().includes(q))
    : model.available;

  if (!ready) {
    return (
      <div className="flex cursor-wait items-center justify-center py-24 text-muted-foreground">
        <Hourglass className="mr-2 h-5 w-5 animate-pulse" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", save.isPending && "cursor-wait")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("formLayout.title")}
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t("shell.profile")}: {activeProfile}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("formLayout.subtitle")}
            {editSiteName && ` · ${t("formLayout.fieldsFromSite", { site: editSiteName })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Share2 className="mr-1 h-4 w-4" />
                {t("formLayout.export.button")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px]">
              <DialogHeader>
                <DialogTitle>{t("formLayout.export.title")}</DialogTitle>
                <DialogDescription>{t("formLayout.export.hint")}</DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto py-2">
                {scope.visibleProfiles.filter((p) => p.code !== activeProfile).map((p) => (
                  <label
                    key={p.code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={Boolean(exportTargets[p.code])}
                      onCheckedChange={() => toggleTarget(p.code)}
                    />
                    {p.label}
                  </label>
                ))}
                {scope.visibleProfiles.filter((p) => p.code !== activeProfile).length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("formLayout.export.noOthers")}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                  {exportMut.isPending ? t("common.saving") : t("formLayout.export.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Hourglass className="mr-1 h-4 w-4 animate-pulse" />}
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Seletor de layout + nome */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("shell.profile")}</Label>
            <Select value={activeProfile} onValueChange={changeClient}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scope.visibleProfiles.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("formLayout.selectLayout")}</Label>
            <Select value={selId} onValueChange={switchTo}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {layouts.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name.trim() || t("formLayout.newLayoutName")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5 min-w-48">
            <Label className="text-xs text-muted-foreground">{t("formLayout.layoutName")}</Label>
            <Input value={selName} onChange={(e) => renameLayout(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={addLayout}>
            <Plus className="mr-1 h-4 w-4" />
            {t("formLayout.newLayout")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-muted-foreground hover:text-destructive"
            disabled={layouts.length <= 1}
            onClick={deleteLayout}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {t("formLayout.deleteLayout")}
          </Button>
        </CardContent>
      </Card>

      {/* Vínculos: tipo de trabalhador → layout (logo após escolher o cliente) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("formLayout.links")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("formLayout.linksHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {workerTypes.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <span className="text-sm">{pickLang(w.name_i18n, lang) || w.name}</span>
              <Select value={links[w.id] ?? "__default__"} onValueChange={(v) => setLink(w.id, v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">{t("formLayout.useDefault")}</SelectItem>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name.trim() || t("formLayout.newLayoutName")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Editor de grupos do layout selecionado */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <div>
            <div className="mb-2">
              <p className="text-base font-semibold text-foreground">{t("formLayout.available")}</p>
              <p className="text-xs text-muted-foreground">{t("formLayout.availableHint")}</p>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="h-9 pl-8"
              />
            </div>
            <Droppable id={AVAILABLE} items={availShown} strategy="list" className="min-h-24">
              {availShown.map((k) => (
                <FieldItem key={k} id={k} label={labelOf(k)} />
              ))}
            </Droppable>
          </div>

          <div className="space-y-4">
            {model.groups.map((g) => (
              <Card key={g.gid}>
                <CardHeader className="gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={g.name}
                      onChange={(e) => renameGroup(g.gid, e.target.value)}
                      placeholder={t("formLayout.groupNamePlaceholder")}
                      className="h-8 font-medium"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={model.groups.length <= 1}
                      title={t("formLayout.removeGroup")}
                      onClick={() => removeGroup(g.gid)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Droppable
                    id={g.gid}
                    items={g.fields}
                    strategy="grid"
                    emptyHint={t("formLayout.emptyGroup")}
                  >
                    {g.fields.map((k) => (
                      <FieldItem key={k} id={k} label={labelOf(k)} />
                    ))}
                  </Droppable>
                </CardContent>
              </Card>
            ))}
            <Button type="button" variant="outline" className="w-full" onClick={addGroup}>
              <Plus className="mr-1 h-4 w-4" />
              {t("formLayout.addGroup")}
            </Button>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function Droppable({
  id,
  items,
  emptyHint,
  className,
  strategy,
  children,
}: {
  id: string;
  items: string[];
  emptyHint?: string;
  className?: string;
  strategy: "grid" | "list";
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext
      items={items}
      strategy={strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-16 rounded-md border border-dashed p-2 transition-colors",
          strategy === "grid" ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "space-y-2",
          isOver && "border-primary bg-primary/5",
          className,
        )}
      >
        {children}
        {items.length === 0 && (
          <p
            className={cn(
              "py-4 text-center text-xs text-muted-foreground",
              strategy === "grid" && "sm:col-span-2",
            )}
          >
            {emptyHint || " "}
          </p>
        )}
      </div>
    </SortableContext>
  );
}

function FieldItem({ id, label }: { id: string; label: string }) {
  const required = REQUIRED.has(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate">{label}</span>
      {required && (
        <span title="Obrigatório" className="text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
