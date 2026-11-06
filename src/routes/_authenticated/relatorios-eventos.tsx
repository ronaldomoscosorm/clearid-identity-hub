import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { argusApi, ArgusApiError, useActiveProfile } from "@/lib/argus-client";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUserScope } from "@/lib/user-scope";
import { CheckList } from "@/components/CheckList";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/relatorios-eventos")({
  head: () => ({ meta: [{ title: "Relatório de eventos — Argus ClearID" }] }),
  component: AccessEventsReportPage,
});

type FileType = "json" | "csv" | "xlsx";
type AccessEventRow = Database["public"]["Views"]["access_events_view"]["Row"];

/** Colunas da view pelas quais o relatório pode ser ordenado (ordenação feita no servidor). */
type SortKey =
  | "event_timestamp"
  | "event_name"
  | "door"
  | "side"
  | "full_name"
  | "external_id"
  | "home_site_name"
  | "area_name";

interface EventSort {
  key: SortKey;
  asc: boolean;
}

const DEFAULT_SORT: EventSort = { key: "event_timestamp", asc: true };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "event_timestamp", label: "reportEvents.col.timestamp" },
  { key: "event_name", label: "reportEvents.col.event" },
  { key: "door", label: "reportEvents.col.door" },
  { key: "side", label: "reportEvents.col.side" },
  { key: "full_name", label: "reportEvents.col.person" },
  { key: "external_id", label: "reportEvents.col.externalId" },
  { key: "home_site_name", label: "reportEvents.col.site" },
  { key: "area_name", label: "reportEvents.col.area" },
];

interface EventFilters {
  areas: string[];
  sites: string[];
  events: string[];
  name?: string;
  identityId?: string;
  externalId?: string;
  from: string;
  to: string;
  sort: EventSort;
}

interface EventSearchResult {
  items: AccessEventRow[];
  page: number;
  pageSize: number;
  total: number;
  from: string;
  to: string;
}

/** Combinação site → área observada nos eventos do cliente. */
interface EventCatalogCombo {
  site: string | null;
  area: string | null;
}

interface EventCatalog {
  sites: string[];
  combos: EventCatalogCombo[];
}

/** Valor do item "Todos" nos dropdowns (o Select não aceita valor vazio). */
const ALL = "__all__";

const PAGE_SIZE = 50;
const EXPORT_MAX = 10_000;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Data local no formato aceito por <input type="datetime-local"> (sem segundos). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoUtc(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Escapa curingas do ILIKE no trecho digitado pelo usuário. */
function likeTerm(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function buildQuery(profile: string, f: EventFilters) {
  let q = supabase
    .from("access_events_view")
    .select("*", { count: "exact" })
    .eq("profile", profile)
    .gte("event_timestamp", f.from)
    .lte("event_timestamp", f.to);
  if (f.areas.length) q = q.in("area_name", f.areas);
  if (f.sites.length) q = q.in("home_site_name", f.sites);
  if (f.events.length) q = q.in("event_name", f.events);
  if (f.name) q = q.ilike("full_name", likeTerm(f.name));
  if (f.identityId) q = q.eq("identity_id", f.identityId);
  if (f.externalId) q = q.ilike("external_id", likeTerm(f.externalId));
  const { key, asc } = f.sort;
  q = q.order(key, { ascending: asc, nullsFirst: false });
  if (key !== "event_timestamp") q = q.order("event_timestamp", { ascending: asc });
  return q.order("id", { ascending: asc });
}

async function searchEvents(
  profile: string,
  f: EventFilters,
  page: number,
  pageSize: number,
): Promise<EventSearchResult> {
  const start = (page - 1) * pageSize;
  const { data, error, count } = await buildQuery(profile, f).range(start, start + pageSize - 1);
  if (error) throw new Error(error.message);
  return { items: data ?? [], page, pageSize, total: count ?? 0, from: f.from, to: f.to };
}

async function fetchAllEvents(profile: string, f: EventFilters): Promise<AccessEventRow[]> {
  const { data, error } = await buildQuery(profile, f).range(0, EXPORT_MAX - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function AccessEventsReportPage() {
  const { t, lang } = useT();
  const activeProfile = useActiveProfile();
  // Mesma regra do topbar: usuário real só vê os sites com grant para o cliente ativo.
  const { filterSites } = useUserScope();

  // ----- filtros -----
  const [siteSel, setSiteSel] = useState<string>(ALL);
  const [areaSel, setAreaSel] = useState<Set<string>>(new Set());
  const [eventSel, setEventSel] = useState<string>(ALL);
  const [sort, setSort] = useState<EventSort>(DEFAULT_SORT);
  const [identity, setIdentity] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toLocalInput(new Date()));
  const [fileType, setFileType] = useState<FileType>("json");

  // ----- execução -----
  const [running, setRunning] = useState(false);
  const [filters, setFilters] = useState<EventFilters | null>(null);
  const [result, setResult] = useState<EventSearchResult | null>(null);
  const [showJson, setShowJson] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ["access-events-catalog", activeProfile],
    queryFn: async (): Promise<EventCatalog> => {
      const { data, error } = await supabase.rpc("access_events_catalog", {
        p_profile: activeProfile,
      });
      if (error) throw new Error(error.message);
      const c = (data ?? {}) as Partial<EventCatalog>;
      return { sites: c.sites ?? [], combos: c.combos ?? [] };
    },
    enabled: Boolean(activeProfile),
    staleTime: 5 * 60 * 1000,
  });
  const eventTypesQuery = useQuery({
    queryKey: ["access-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_event_types")
        .select("category, name")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Relação site → área vem do ClearID: sites da API e áreas de
  // GET /api/locations?siteId=<site> (uma chamada por site, paginada de 100 em 100).
  // Quando o ClearID falha, usa-se o que os próprios eventos carregados mostram.
  const sitesQuery = useQuery({
    queryKey: ["clearid-sites", activeProfile],
    queryFn: () => argusApi.listSites(),
    enabled: Boolean(activeProfile),
    staleTime: 5 * 60 * 1000,
  });

  const toOptions = (values: Iterable<string>) =>
    [...values].sort((a, b) => a.localeCompare(b, lang)).map((v) => ({ value: v, label: v }));
  const combos = useMemo(() => catalogQuery.data?.combos ?? [], [catalogQuery.data]);

  // Sites visíveis ao usuário (com siteId quando vêm do ClearID).
  const visibleSites = useMemo(() => {
    const sites: { name: string; siteId?: string }[] =
      sitesQuery.data?.map((st) => ({ name: st.name, siteId: st.siteId })) ??
      (catalogQuery.data?.sites ?? []).map((name) => ({ name }));
    return filterSites(sites, activeProfile).filter((st) => Boolean(st.name));
  }, [sitesQuery.data, catalogQuery.data, filterSites, activeProfile]);
  const siteOptions = useMemo(
    () => toOptions(new Set(visibleSites.map((st) => st.name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleSites, lang],
  );

  // Sites cujas áreas devem ser carregadas: o escolhido, ou todos quando "Todos".
  const areaSiteIds = useMemo(() => {
    const ids: string[] = [];
    for (const st of visibleSites) {
      if (st.siteId && (siteSel === ALL || st.name === siteSel)) ids.push(st.siteId);
    }
    return ids.sort();
  }, [visibleSites, siteSel]);
  const locationsQuery = useQuery({
    queryKey: ["clearid-locations", activeProfile, areaSiteIds],
    queryFn: async () => {
      const listSiteLocations = async (siteId: string) => {
        const all: Awaited<ReturnType<typeof argusApi.listLocations>> = [];
        for (let skip = 0; skip < 5000; skip += 100) {
          const page = await argusApi.listLocations({ siteId, skip, take: 100 });
          all.push(...page);
          if (page.length < 100) break;
        }
        return all;
      };
      return (await Promise.all(areaSiteIds.map(listSiteLocations))).flat();
    },
    enabled: Boolean(activeProfile) && sitesQuery.isSuccess && areaSiteIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const areasFromClearId = locationsQuery.isSuccess;

  const areaOptions = useMemo(() => {
    const areas = new Set<string>();
    if (areasFromClearId) {
      for (const l of locationsQuery.data ?? []) if (l.name) areas.add(l.name);
    } else {
      for (const c of combos) {
        if (c.area && (siteSel === ALL || c.site === siteSel)) areas.add(c.area);
      }
    }
    return toOptions(areas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasFromClearId, locationsQuery.data, combos, siteSel, lang]);

  // Mantém só as áreas que continuam válidas quando o site muda.
  useEffect(() => {
    const valid = new Set(areaOptions.map((o) => o.value));
    setAreaSel((prev) =>
      [...prev].every((v) => valid.has(v)) ? prev : new Set([...prev].filter((v) => valid.has(v))),
    );
  }, [areaOptions]);
  const eventOptions = useMemo(
    () =>
      (eventTypesQuery.data ?? []).map((e) => ({
        value: e.name,
        label: `${e.category} · ${e.name}`,
      })),
    [eventTypesQuery.data],
  );

  useEffect(() => {
    setSiteSel(ALL);
    setAreaSel(new Set());
    setEventSel(ALL);
    setResult(null);
    setFilters(null);
  }, [activeProfile]);

  const errorMessage = (e: unknown) =>
    e instanceof ArgusApiError ? e.message : (e as Error).message;

  const buildFilters = (): EventFilters | null => {
    const fromIso = toIsoUtc(from);
    const toIso = toIsoUtc(to);
    if (!fromIso || !toIso || fromIso > toIso) {
      toast.error(t("reportEvents.invalidPeriod"));
      return null;
    }
    const id = identityId.trim();
    if (id && !GUID_RE.test(id)) {
      toast.error(t("reportEvents.invalidIdentityId"));
      return null;
    }
    return {
      areas: [...areaSel],
      sites: siteSel === ALL ? [] : [siteSel],
      events: eventSel === ALL ? [] : [eventSel],
      name: identity.trim() || undefined,
      identityId: id.toLowerCase() || undefined,
      externalId: externalId.trim() || undefined,
      from: fromIso,
      to: toIso,
      sort,
    };
  };

  const loadPage = async (f: EventFilters, page: number) => {
    const r = await searchEvents(activeProfile, f, page, PAGE_SIZE);
    setResult(r);
    return r;
  };

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang) : "—");

  const exportRows = async (f: EventFilters, format: "csv" | "xlsx") => {
    const rows = await fetchAllEvents(activeProfile, f);
    if (rows.length >= EXPORT_MAX)
      toast.warning(t("reportEvents.exportLimit", { max: EXPORT_MAX }));
    const sheetRows = rows.map((e) => ({
      [t("reportEvents.col.timestamp")]: fmtDate(e.event_timestamp),
      [t("reportEvents.col.event")]: e.event_name ?? "",
      [t("reportEvents.col.door")]: e.door ?? "",
      [t("reportEvents.col.side")]: e.side ?? "",
      [t("reportEvents.col.person")]: e.full_name ?? "",
      [t("reportEvents.col.externalId")]: e.external_id ?? "",
      [t("reportEvents.col.identityId")]: e.identity_id ?? "",
      [t("reportEvents.col.credential")]: e.credential ?? "",
      [t("reportEvents.col.site")]: e.home_site_name ?? "",
      [t("reportEvents.col.area")]: e.area_name ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eventos");
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      saveBlob(
        new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
        `eventos-acesso-${stamp}.csv`,
      );
    } else {
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      saveBlob(
        new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `eventos-acesso-${stamp}.xlsx`,
      );
    }
    toast.success(t("reportEvents.downloaded"));
  };

  const search = async () => {
    const f = buildFilters();
    if (!f) return;
    setRunning(true);
    try {
      setFilters(f);
      if (fileType === "json") {
        const r = await loadPage(f, 1);
        if (r.total === 0) toast.info(t("reportEvents.empty"));
      } else {
        await exportRows(f, fileType);
      }
    } catch (e) {
      toast.error(t("reportEvents.failed", { error: errorMessage(e) }));
    } finally {
      setRunning(false);
    }
  };

  const exportCurrent = async (format: "csv" | "xlsx") => {
    if (!filters) return;
    setRunning(true);
    try {
      await exportRows(filters, format);
    } catch (e) {
      toast.error(t("reportEvents.failed", { error: errorMessage(e) }));
    } finally {
      setRunning(false);
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const goToPage = async (p: number) => {
    if (!filters || !result) return;
    const next = Math.min(Math.max(1, p), totalPages);
    if (next === result.page) return;
    setRunning(true);
    try {
      await loadPage(filters, next);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  // Clique no cabeçalho: alterna a direção da coluna atual ou passa a ordenar pela nova
  // (crescente). Reconsulta a primeira página com a mesma pesquisa.
  const sortBy = async (key: SortKey) => {
    const next: EventSort = { key, asc: sort.key === key ? !sort.asc : true };
    setSort(next);
    if (!filters || running) return;
    const f = { ...filters, sort: next };
    setFilters(f);
    setRunning(true);
    try {
      await loadPage(f, 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };
  const sortIcon = (key: SortKey) => {
    if (filters?.sort.key !== key)
      return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />;
    return filters.sort.asc ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const selectedLabel = (n: number) => t("reportEvents.selected", { count: n });
  const sitesLoading = catalogQuery.isLoading || sitesQuery.isLoading;
  const areasLoading = sitesLoading || locationsQuery.isLoading;
  const clearIdFallback = locationsQuery.isError || sitesQuery.isError;

  return (
    <div className={cn("space-y-6", running && "cursor-wait")} aria-busy={running}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("reportEvents.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reportEvents.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportEvents.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ev-site">{t("reportEvents.sites")}</Label>
            <Select value={siteSel} onValueChange={setSiteSel} disabled={running || sitesLoading}>
              <SelectTrigger id="ev-site" className="w-full md:w-1/2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("reportEvents.all")}</SelectItem>
                {siteOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:w-1/2">
            <CheckList
              label={t("reportEvents.areas")}
              searchPlaceholder={t("reportEvents.searchAreas")}
              noMatchLabel={t("reportEvents.noMatch")}
              options={areaOptions}
              selected={areaSel}
              onChange={setAreaSel}
              allLabel={t("reportEvents.all")}
              selectedLabel={selectedLabel}
              loading={areasLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-type">{t("reportEvents.eventType")}</Label>
            <Select
              value={eventSel}
              onValueChange={setEventSel}
              disabled={running || eventTypesQuery.isLoading}
            >
              <SelectTrigger id="ev-type" className="w-full md:w-1/2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("reportEvents.all")}</SelectItem>
                {eventOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {clearIdFallback && !areasLoading && (
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {t("reportEvents.catalogFallback", { source: "ClearID" })}
            </p>
          )}
          {(catalogQuery.isError || eventTypesQuery.isError) && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("reportEvents.catalogError", {
                error: errorMessage(catalogQuery.error ?? eventTypesQuery.error),
              })}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ev-identity">{t("reportEvents.identity")}</Label>
              <Input
                id="ev-identity"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder={t("reportEvents.identityHint")}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-external-id">{t("reportEvents.externalId")}</Label>
              <Input
                id="ev-external-id"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder={t("reportEvents.externalIdHint")}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-identity-id">{t("reportEvents.identityId")}</Label>
              <Input
                id="ev-identity-id"
                value={identityId}
                onChange={(e) => setIdentityId(e.target.value)}
                placeholder={t("reportEvents.identityIdHint")}
                disabled={running}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ev-from">{t("reportEvents.from")}</Label>
              <Input
                id="ev-from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-to">{t("reportEvents.to")}</Label>
              <Input
                id="ev-to"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reportEvents.fileType")}</Label>
              <Select
                value={fileType}
                onValueChange={(v) => setFileType(v as FileType)}
                disabled={running}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">{t("reportEvents.fileType.json")}</SelectItem>
                  <SelectItem value="csv">{t("reportEvents.fileType.csv")}</SelectItem>
                  <SelectItem value="xlsx">{t("reportEvents.fileType.xlsx")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={search} disabled={running}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {running ? t("reportEvents.searching") : t("reportEvents.search")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("reportEvents.periodHint")}</span>
          </div>
        </CardContent>
      </Card>

      {running && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex cursor-wait flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm"
        >
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">{t("reportEvents.searching")}</p>
        </div>
      )}

      {result && (
        <Card>
          <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-base">{t("reportEvents.resultTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("reportEvents.rows", { count: result.total })} · {fmtDate(result.from)} →{" "}
                {fmtDate(result.to)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowJson((v) => !v)}>
                <Code2 className="mr-1 h-4 w-4" />
                {showJson ? t("reportEvents.hideJson") : t("reportEvents.showJson")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCurrent("csv")}
                disabled={running}
              >
                <Download className="mr-1 h-4 w-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCurrent("xlsx")}
                disabled={running}
              >
                <Download className="mr-1 h-4 w-4" />
                Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showJson && (
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}

            {result.total === 0 ? (
              <p className="text-sm text-muted-foreground">{t("reportEvents.empty")}</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {COLUMNS.map((c) => (
                          <TableHead
                            key={c.key}
                            aria-sort={
                              filters?.sort.key === c.key
                                ? filters.sort.asc
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <button
                              type="button"
                              onClick={() => sortBy(c.key)}
                              className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
                            >
                              {t(c.label)}
                              {sortIcon(c.key)}
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.items.map((e) => (
                        <TableRow key={e.id ?? `${e.event_timestamp}-${e.door}`}>
                          <TableCell className="whitespace-nowrap">
                            {fmtDate(e.event_timestamp)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{e.event_name ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>{e.door ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{e.side ?? "—"}</TableCell>
                          <TableCell>{e.full_name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.external_id ?? "—"}
                          </TableCell>
                          <TableCell>{e.home_site_name ?? "—"}</TableCell>
                          <TableCell>{e.area_name ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("reportEvents.page", { page: result.page, total: totalPages })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(result.page - 1)}
                      disabled={result.page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t("reportEvents.prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(result.page + 1)}
                      disabled={result.page >= totalPages}
                    >
                      {t("reportEvents.next")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
