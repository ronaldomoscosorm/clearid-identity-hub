import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId, useActiveProfile, type IdentityImportResult } from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import { withSiteId, withResolvedSiteId, type EmployerSiteMap } from "@/lib/import-file";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar — Argus ClearID" }] }),
  component: ImportPage,
});

const ACCEPT = ".csv,.xlsx,.xls";

function actionTone(action: string): { variant: "default" | "secondary" | "outline" | "destructive"; label: string } {
  const a = action.toLowerCase();
  if (a.includes("fail")) return { variant: "destructive", label: action };
  if (a.includes("skip")) return { variant: "outline", label: action };
  return { variant: a.includes("would") ? "secondary" : "default", label: action };
}

function ImportPage() {
  const { t } = useT();
  const defaultSiteId = useDefaultSiteId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [siteId, setSiteId] = useState<string>(defaultSiteId ?? "");
  // Origem do site: "single" = um site para todo o lote; "employer" = resolver
  // por linha pelo código/nome do site da Employer (via employer_sites).
  const [siteMode, setSiteMode] = useState<"single" | "employer">("single");
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<IdentityImportResult | null>(null);

  const importActiveProfile = useActiveProfile();
  // Mapeamento Employer → siteId (para o modo "employer").
  const employerSitesQuery = useQuery({
    queryKey: ["employer-sites", importActiveProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_sites")
        .select("site_id, nome, codigo")
        .eq("profile", importActiveProfile);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(importActiveProfile),
  });
  const employerMap: EmployerSiteMap = useMemo(() => {
    const byCodigo = new Map<string, string>();
    const byNome = new Map<string, string>();
    for (const r of employerSitesQuery.data ?? []) {
      if (r.codigo) byCodigo.set(r.codigo.toLowerCase(), r.site_id);
      if (r.nome) byNome.set(r.nome.toLowerCase(), r.site_id);
    }
    return { byCodigo, byNome };
  }, [employerSitesQuery.data]);
  const importScope = useUserScope();
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = importScope
    .filterSites(sitesQuery.data ?? [], importActiveProfile)
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));

  const importMut = useMutation({
    mutationFn: async (f: File) => {
      let prepared: File;
      if (siteMode === "employer") {
        // Resolve o site por linha pelo código/nome da Employer (employer_sites).
        const r = await withResolvedSiteId(f, employerMap);
        if (r.unresolved > 0) {
          toast.warning(t("import.employer.unresolved", { count: r.unresolved, total: r.total }));
        }
        prepared = r.file;
      } else {
        // Injeta o site escolhido na coluna `siteId` de todas as linhas.
        prepared = await withSiteId(f, siteId);
      }
      return argusApi.importIdentities(prepared, { dryRun });
    },
    onSuccess: (r) => {
      setResult(r);
      const msg = t("import.toast.done", {
        created: r.created,
        updated: r.updated,
        skipped: r.skipped,
        failed: r.failed,
      });
      if (r.failed > 0) toast.warning(msg);
      else toast.success(msg);
    },
    onError: (e) => {
      const message = e instanceof ArgusApiError ? e.message : (e as Error).message;
      toast.error(t("import.toast.error", { message }));
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
  };

  const onSubmit = () => {
    if (!file) return;
    if (siteMode === "single" && !siteId) return;
    importMut.mutate(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("import.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("import.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("import.file.title")}</CardTitle>
          <CardDescription>{t("import.file.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">{t("import.file.label")}</Label>
            <Input
              ref={inputRef}
              id="file"
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              disabled={importMut.isPending}
            />
            {file && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="siteMode">{t("import.siteMode.label")}</Label>
            <Select
              value={siteMode}
              onValueChange={(v) => setSiteMode(v as "single" | "employer")}
              disabled={importMut.isPending}
            >
              <SelectTrigger id="siteMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">{t("import.siteMode.single")}</SelectItem>
                <SelectItem value="employer">{t("import.siteMode.employer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {siteMode === "single" ? (
            <div className="space-y-2">
              <Label htmlFor="site">{t("import.site.label")}</Label>
              <Select value={siteId} onValueChange={setSiteId} disabled={importMut.isPending || sitesQuery.isLoading}>
                <SelectTrigger id="site">
                  <SelectValue placeholder={sitesQuery.isLoading ? t("import.site.loading") : t("import.site.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.siteId} value={s.siteId}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("import.site.hint")}</p>
            </div>
          ) : (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("import.employer.hint", { count: employerSitesQuery.data?.length ?? 0 })}
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={importMut.isPending} />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">{t("import.dryRun.label")}</span>
              <span className="block text-xs text-muted-foreground">{t("import.dryRun.hint")}</span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSubmit}
              disabled={!file || (siteMode === "single" && !siteId) || importMut.isPending}
            >
              {importMut.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> {t("import.running")}
                </>
              ) : (
                <>
                  <Upload className="mr-1 h-4 w-4" /> {dryRun ? t("import.simulate") : t("import.execute")}
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t("import.columnsHint")}</p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {result.failed > 0 ? (
                <AlertTriangle className="h-4 w-4 text-[var(--rm-inactive-ink)]" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
              )}
              {result.dryRun ? t("import.result.simTitle") : t("import.result.title")}
            </CardTitle>
            <CardDescription>
              {result.fileName} · {result.environment}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat value={result.totalRows} label={t("import.stat.total")} />
              <Stat value={result.created} label={t("import.stat.created")} tone="active" />
              <Stat value={result.updated} label={t("import.stat.updated")} tone="brand" />
              <Stat value={result.skipped} label={t("import.stat.skipped")} />
              <Stat value={result.failed} label={t("import.stat.failed")} tone={result.failed > 0 ? "inactive" : undefined} />
            </div>

            {result.unknownColumns.length > 0 && (
              <div className="rounded-lg border border-[var(--rm-line)] bg-[var(--rm-panel-2)] p-3 text-sm">
                <span className="font-medium text-foreground">{t("import.unknownColumns")}</span>{" "}
                <span className="text-muted-foreground">{result.unknownColumns.join(", ")}</span>
              </div>
            )}

            {result.detectedColumns.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.detectedColumns.map((c) => (
                  <Badge key={c} variant="outline" className="font-normal">{c}</Badge>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-[var(--rm-line)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t("import.col.row")}</TableHead>
                    <TableHead className="w-28">{t("import.col.action")}</TableHead>
                    <TableHead>{t("import.col.identity")}</TableHead>
                    <TableHead className="w-16 text-right">{t("import.col.custom")}</TableHead>
                    <TableHead>{t("import.col.messages")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r) => {
                    const tone = actionTone(r.action);
                    return (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="tabular-nums text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell>
                          <Badge variant={tone.variant}>{tone.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-foreground">{r.displayName || r.email || r.externalId || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[r.email, r.externalId && `ext: ${r.externalId}`].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.customFieldsSet ?? 0}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.messages.length ? r.messages.join(" ") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "active" | "inactive" | "brand";
}) {
  const color =
    tone === "active"
      ? "var(--rm-active-ink)"
      : tone === "inactive"
        ? "var(--rm-inactive-ink)"
        : tone === "brand"
          ? "var(--rm-brand-ink)"
          : "var(--foreground)";
  return (
    <div className="rounded-lg border border-[var(--rm-line)] bg-[var(--rm-panel)] p-3">
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
