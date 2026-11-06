import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  argusApi,
  ArgusApiError,
  useActiveProfile,
  type AccessEventsImportResult,
} from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/importar-eventos")({
  head: () => ({ meta: [{ title: "Importar eventos — Argus ClearID" }] }),
  component: ImportAccessEventsPage,
});

const IMPORT_ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Importação dos relatórios de eventos (CSV/XLSX) exportados pelo Security Center. */
function ImportAccessEventsPage() {
  const { t } = useT();
  const activeProfile = useActiveProfile();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState<"dry" | "run" | null>(null);
  const [importResults, setImportResults] = useState<AccessEventsImportResult[] | null>(null);

  const errorMessage = (e: unknown) =>
    e instanceof ArgusApiError ? e.message : (e as Error).message;

  const runImport = async (dryRun: boolean) => {
    if (importFiles.length === 0) {
      toast.error(t("reportEvents.import.noFiles"));
      return;
    }
    setImporting(dryRun ? "dry" : "run");
    try {
      const results = await argusApi.importAccessEvents(importFiles, { dryRun });
      setImportResults(results);
      const sum = (k: "imported" | "updated" | "failed") => results.reduce((n, r) => n + r[k], 0);
      const params = { imported: sum("imported"), updated: sum("updated"), failed: sum("failed") };
      if (dryRun) {
        toast.info(t("reportEvents.import.simulated", params));
      } else {
        (params.failed > 0 ? toast.warning : toast.success)(t("reportEvents.import.done", params));
        setImportFiles([]);
        if (importInputRef.current) importInputRef.current.value = "";
        void queryClient.invalidateQueries({ queryKey: ["access-events-catalog", activeProfile] });
      }
    } catch (e) {
      toast.error(t("reportEvents.import.failed", { error: errorMessage(e) }));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("reportEvents.import.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reportEvents.import.description")}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="ev-import-files">{t("reportEvents.import.files")}</Label>
            <Input
              ref={importInputRef}
              id="ev-import-files"
              type="file"
              multiple
              accept={IMPORT_ACCEPT}
              onChange={(e) => setImportFiles(Array.from(e.target.files ?? []))}
              disabled={importing !== null}
            />
            {importFiles.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {t("reportEvents.import.selected", { count: importFiles.length })} ·{" "}
                {importFiles.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runImport(true)} disabled={importing !== null}>
              {importing === "dry" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {t("reportEvents.import.simulate")}
            </Button>
            <Button onClick={() => runImport(false)} disabled={importing !== null}>
              {importing === "run" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {importing === "run"
                ? t("reportEvents.import.running")
                : t("reportEvents.import.run")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {importResults && importResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {t("reportEvents.import.resultTitle")}
              {importResults[0].dryRun && (
                <Badge variant="outline">{t("reportEvents.import.dryRunBadge")}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportEvents.import.col.file")}</TableHead>
                    <TableHead className="text-right">
                      {t("reportEvents.import.col.rows")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reportEvents.import.col.imported")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reportEvents.import.col.updated")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reportEvents.import.col.duplicates")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("reportEvents.import.col.failed")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResults.map((r) => (
                    <TableRow key={r.fileName}>
                      <TableCell>{r.fileName}</TableCell>
                      <TableCell className="text-right">{r.rows}</TableCell>
                      <TableCell className="text-right">{r.imported}</TableCell>
                      <TableCell className="text-right">{r.updated}</TableCell>
                      <TableCell className="text-right">{r.duplicates}</TableCell>
                      <TableCell className="text-right">
                        {r.failed > 0 ? <Badge variant="destructive">{r.failed}</Badge> : r.failed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {importResults.map((r) =>
              r.unknownEventTypes.length > 0 ||
              r.unresolvedSites.length > 0 ||
              r.errors.length > 0 ? (
                <div key={`${r.fileName}-issues`} className="space-y-1 text-sm">
                  <p className="font-medium">{r.fileName}</p>
                  {r.unknownEventTypes.length > 0 && (
                    <p className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {t("reportEvents.import.unknownTypes", {
                        list: r.unknownEventTypes.join(", "),
                      })}
                    </p>
                  )}
                  {r.unresolvedSites.length > 0 && (
                    <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      {t("reportEvents.import.unresolvedSites", {
                        list: r.unresolvedSites.join(", "),
                      })}
                    </p>
                  )}
                  {r.errors.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                      {r.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>
                          {e.line ? `${t("reportEvents.import.line", { line: e.line })}: ` : ""}
                          {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null,
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
