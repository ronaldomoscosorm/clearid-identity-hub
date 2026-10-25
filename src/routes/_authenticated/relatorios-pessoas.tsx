import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, Download, Images, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  argusApi,
  ArgusApiError,
  useActiveProfile,
  type IdentityReportParams,
  type ReportJob,
  type ReportJobData,
} from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import { pickLang } from "@/lib/custom-fields";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/relatorios-pessoas")({
  head: () => ({ meta: [{ title: "Relatório de pessoas — Argus ClearID" }] }),
  component: PeopleReportPage,
});

type FileType = IdentityReportParams["format"];
type StatusFilter = NonNullable<IdentityReportParams["status"]>;
const PAGE_SIZE = 50;

/** Lista de opções com caixas de seleção (múltipla escolha) e atalho "Todos". */
function CheckList({
  label,
  options,
  selected,
  onChange,
  allLabel,
  selectedLabel,
  loading,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel: string;
  selectedLabel: (n: number) => string;
  loading?: boolean;
}) {
  const allChecked = selected.size === 0;
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{allChecked ? allLabel : selectedLabel(selected.size)}</span>
      </div>
      <ScrollArea className="h-40 rounded-md border p-2">
        {loading ? (
          <p className="p-2 text-xs text-muted-foreground">…</p>
        ) : (
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={allChecked} onCheckedChange={() => onChange(new Set())} />
              <span className="font-medium">{allLabel}</span>
            </label>
            {options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function PeopleReportPage() {
  const { t, lang } = useT();
  const activeProfile = useActiveProfile();
  const scope = useUserScope();

  // ----- filtros -----
  const [workerTypeSel, setWorkerTypeSel] = useState<Set<string>>(new Set());
  const [companySel, setCompanySel] = useState<Set<string>>(new Set());
  const [siteSel, setSiteSel] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [fileType, setFileType] = useState<FileType>("json");
  const [includeCustomFields, setIncludeCustomFields] = useState(true);
  const [photoZip, setPhotoZip] = useState(false);
  const [photoFormat, setPhotoFormat] = useState<"jpeg" | "png">("jpeg");

  // ----- execução -----
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ReportJob | null>(null);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReportJobData | null>(null);
  const [downloading, setDownloading] = useState<"file" | "photos" | null>(null);
  const pollRef = useRef<number | null>(null);

  // Tipos de trabalhador do cliente (Supabase): o código enviado é o NOME, que é o que o ClearID guarda.
  const workerTypesQuery = useQuery({
    queryKey: ["worker-types", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("id, name, code, name_i18n")
        .eq("is_active", true)
        .eq("profile", activeProfile)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const workerTypeOptions = useMemo(
    () => (workerTypesQuery.data ?? []).map((w) => ({ value: w.name, label: pickLang(w.name_i18n, lang) || w.name })),
    [workerTypesQuery.data, lang],
  );

  // Empresas cadastradas no cliente (o filtro do ClearID é por CompanyName).
  const companiesQuery = useQuery({
    queryKey: ["companies-names", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("profile", activeProfile)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const companyOptions = useMemo(
    () => (companiesQuery.data ?? []).map((c) => ({ value: c.name, label: c.name })),
    [companiesQuery.data],
  );

  // Sites do ClearID visíveis ao usuário.
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const siteOptions = useMemo(
    () =>
      scope
        .filterSites(sitesQuery.data ?? [], activeProfile)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"))
        .map((s) => ({ value: s.siteId, label: s.name ?? s.siteId })),
    [scope, sitesQuery.data, activeProfile],
  );

  // Ao trocar de cliente, limpa seleções e resultado.
  useEffect(() => {
    setWorkerTypeSel(new Set());
    setCompanySel(new Set());
    setSiteSel(new Set());
    setJobId(null);
    setJob(null);
    setData(null);
  }, [activeProfile]);

  // Polling do job (a cada 2 s) até concluir ou falhar. Depende só do jobId: cada busca cria um job novo,
  // e o efeito não pode ser reiniciado por re-renders (setJob/setRunning) no meio da leitura dos dados.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const j = await argusApi.getReportJob(jobId);
        if (!alive) return;
        if (j.status === "Completed") {
          const d = await argusApi.getReportJobData(jobId, 1, PAGE_SIZE);
          if (!alive) return;
          setJob(j);
          setPage(1);
          setData(d);
          setRunning(false);
          if (d.total === 0) toast.info(tRef.current("reportPeople.empty"));
        } else if (j.status === "Failed") {
          setJob(j);
          setRunning(false);
          toast.error(tRef.current("reportPeople.failed", { error: j.error ?? "" }));
        } else {
          setJob(j);
          pollRef.current = window.setTimeout(tick, 2000);
        }
      } catch (e) {
        if (!alive) return;
        setRunning(false);
        toast.error(tRef.current("reportPeople.failed", { error: e instanceof ArgusApiError ? e.message : (e as Error).message }));
      }
    };
    pollRef.current = window.setTimeout(tick, 1500);
    return () => {
      alive = false;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [jobId]);

  const search = async () => {
    try {
      setData(null);
      setJob(null);
      setRunning(true);
      const id = await argusApi.startIdentityReportJob({
        format: fileType,
        siteIds: [...siteSel],
        companies: [...companySel],
        workerTypeCodes: [...workerTypeSel],
        status,
        includeCustomFields,
        photoZip,
        photoFormat,
      });
      setJobId(id);
    } catch (e) {
      setRunning(false);
      toast.error(t("reportPeople.failed", { error: e instanceof ArgusApiError ? e.message : (e as Error).message }));
    }
  };

  const goToPage = async (p: number) => {
    if (!jobId || !data) return;
    const next = Math.min(Math.max(1, p), Math.max(1, data.totalPages));
    try {
      const d = await argusApi.getReportJobData(jobId, next, PAGE_SIZE);
      setData(d);
      setPage(next);
    } catch (e) {
      toast.error(e instanceof ArgusApiError ? e.message : (e as Error).message);
    }
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

  const download = async (kind: "file" | "photos") => {
    if (!jobId) return;
    try {
      setDownloading(kind);
      const blob = kind === "file" ? await argusApi.downloadReportJobFile(jobId) : await argusApi.downloadReportJobPhotos(jobId);
      saveBlob(blob, (kind === "file" ? data?.fileName : data?.photoZipFileName) ?? (kind === "file" ? "relatorio" : "fotos.zip"));
      toast.success(t("reportPeople.downloaded"));
    } catch (e) {
      toast.error(e instanceof ArgusApiError ? e.message : (e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  const selectedLabel = (n: number) => t("reportPeople.selected", { count: n });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("reportPeople.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reportPeople.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportPeople.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <CheckList
              label={t("reportPeople.workerTypes")}
              options={workerTypeOptions}
              selected={workerTypeSel}
              onChange={setWorkerTypeSel}
              allLabel={t("reportPeople.all")}
              selectedLabel={selectedLabel}
              loading={workerTypesQuery.isLoading}
            />
            <CheckList
              label={t("reportPeople.companies")}
              options={companyOptions}
              selected={companySel}
              onChange={setCompanySel}
              allLabel={t("reportPeople.all")}
              selectedLabel={selectedLabel}
              loading={companiesQuery.isLoading}
            />
            <CheckList
              label={t("reportPeople.sites")}
              options={siteOptions}
              selected={siteSel}
              onChange={setSiteSel}
              allLabel={t("reportPeople.all")}
              selectedLabel={selectedLabel}
              loading={sitesQuery.isLoading}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("reportPeople.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reportPeople.status.all")}</SelectItem>
                  <SelectItem value="active">{t("reportPeople.status.active")}</SelectItem>
                  <SelectItem value="inactive">{t("reportPeople.status.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reportPeople.fileType")}</Label>
              <Select value={fileType} onValueChange={(v) => setFileType(v as FileType)} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">{t("reportPeople.fileType.json")}</SelectItem>
                  <SelectItem value="csv">{t("reportPeople.fileType.csv")}</SelectItem>
                  <SelectItem value="xlsx">{t("reportPeople.fileType.xlsx")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reportPeople.photoFormat")}</Label>
              <Select value={photoFormat} onValueChange={(v) => setPhotoFormat(v as "jpeg" | "png")} disabled={running || !photoZip}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={includeCustomFields} onCheckedChange={(v) => setIncludeCustomFields(v === true)} disabled={running} />
              <span>{t("reportPeople.includeCustomFields")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={photoZip} onCheckedChange={(v) => setPhotoZip(v === true)} disabled={running} />
              <span>{t("reportPeople.photoZip")}</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={search} disabled={running}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
              {running ? t("reportPeople.running") : t("reportPeople.search")}
            </Button>
            {running && <span className="text-xs text-muted-foreground">{t("reportPeople.runningHint")}</span>}
          </div>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{t("reportPeople.resultTitle")}</CardTitle>
              <CardDescription>
                {t("reportPeople.rows", { count: data.total })}
                {job?.client ? ` · ${job.client}` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => download("file")} disabled={downloading !== null}>
                {downloading === "file" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                {t("reportPeople.downloadFile", { name: data.fileName ?? fileType.toUpperCase() })}
              </Button>
              {photoZip &&
                (data.hasPhotoZip && (data.photoCount ?? 0) > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => download("photos")} disabled={downloading !== null}>
                    {downloading === "photos" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Images className="mr-1 h-4 w-4" />}
                    {t("reportPeople.downloadPhotos", { count: data.photoCount ?? 0 })}
                  </Button>
                ) : (
                  <Badge variant="outline">{t("reportPeople.noPhotos")}</Badge>
                ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.truncated && (
              <p className="flex items-center gap-2 text-sm text-[var(--rm-inactive-ink)]">
                <AlertTriangle className="h-4 w-4" /> {t("reportPeople.truncated")}
              </p>
            )}
            {photoZip && data.photoNote && (
              <p className="flex items-center gap-2 text-sm text-[var(--rm-inactive-ink)]">
                <AlertTriangle className="h-4 w-4" /> {data.photoNote}
              </p>
            )}
            {data.total === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("reportPeople.empty")}</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {data.headers.map((h) => (
                          <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((r, i) => (
                        <TableRow key={`${page}-${i}`}>
                          {r.map((c, j) => (
                            <TableCell key={j} className="max-w-[280px] truncate whitespace-nowrap text-xs" title={c ?? ""}>
                              {c ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t("reportPeople.page", { page, total: Math.max(1, data.totalPages) })}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                      <ChevronLeft className="h-4 w-4" /> {t("reportPeople.prev")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page >= data.totalPages}>
                      {t("reportPeople.next")} <ChevronRight className="h-4 w-4" />
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
