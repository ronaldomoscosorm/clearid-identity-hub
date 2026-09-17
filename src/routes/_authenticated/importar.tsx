import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Save, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId, useActiveProfile, type IdentityImportResult } from "@/lib/argus-client";
import { useUserScope } from "@/lib/user-scope";
import {
  withSiteId,
  mapEmployerImport,
  applyColumnMapping,
  readHeaders,
  normalizeHeader,
  EMPLOYER_CODE_TARGET,
  EMPLOYER_NAME_TARGET,
  NATIVE_TARGET_PREFIX,
  CF_TARGET_PREFIX,
  type EmployerSiteMap,
} from "@/lib/import-file";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { pickLang } from "@/lib/custom-fields";
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

// Valor de UI para "ignorar coluna" (o Radix Select não aceita value vazio).
const IGNORE = "__ignore__";
// Sentinela de UI para "sem tipo de trabalhador padrão".
const NO_WT = "__none__";

// Campos NATIVOS do import (coluna aceita pelo backend → rótulo amigável).
const NATIVE_TARGETS: { key: string; label: string }[] = [
  { key: "firstName", label: "Nome" },
  { key: "lastName", label: "Sobrenome" },
  { key: "displayName", label: "Nome social" },
  { key: "email", label: "E-mail" },
  { key: "employeeNumber", label: "Matrícula" },
  { key: "externalId", label: "ID externo" },
  { key: "companyName", label: "Empresa" },
  { key: "jobTitle", label: "Cargo" },
  { key: "departmentName", label: "Departamento" },
  { key: "supervisorName", label: "Supervisor" },
  { key: "siteId", label: "Site (ID ClearID)" },
  { key: "birthday", label: "Nascimento" },
  { key: "phoneNumberPrimary", label: "Telefone" },
  { key: "secondaryEmail", label: "E-mail secundário" },
  { key: "status", label: "Status" },
];

type ImportRow = IdentityImportResult["rows"][number];

// Marcadores de mensagem que indicam erro/aviso relevante para o relatório.
const ISSUE_RE = /falha|erro|ignorad|não é campo|sem chave|sem 'campos|sem site/i;

/** A linha teve algum problema (falha, pulada, ou mensagem de erro/aviso)? */
function rowHasIssue(r: ImportRow): boolean {
  const a = r.action.toLowerCase();
  if (a.includes("fail") || a.includes("skip")) return true;
  return r.messages.some((m) => ISSUE_RE.test(m));
}

/** Monta um CSV detalhado só com as linhas problemáticas. */
function buildErrorReport(result: IdentityImportResult): string {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Linha", "Ação", "Identidade", "ExternalId", "Email", "Mensagens"];
  const lines = [header.map(esc).join(",")];
  for (const r of result.rows) {
    if (!rowHasIssue(r)) continue;
    lines.push(
      [
        String(r.rowNumber),
        r.action,
        r.displayName ?? "",
        r.externalId ?? "",
        r.email ?? "",
        r.messages.join(" | "),
      ]
        .map((c) => esc(String(c)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}

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
  const [siteMode, setSiteMode] = useState<"single" | "employer" | "mapped">("single");
  const [dryRun, setDryRun] = useState(true);
  const [afastamentoOnly, setAfastamentoOnly] = useState(false);
  const [result, setResult] = useState<IdentityImportResult | null>(null);
  // Tela de mapeamento (modo "mapped"): cabeçalhos da planilha + coluna→alvo.
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultWorkerTypeId, setDefaultWorkerTypeId] = useState<string>("");
  const [mappingName, setMappingName] = useState<string>("");
  const [selectedMappingId, setSelectedMappingId] = useState<string>("");

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
  // Campos CUSTOMIZÁVEIS do cliente — alvos disponíveis no mapeamento.
  const cfDefsQuery = useQuery({
    queryKey: ["import-cf-defs", importActiveProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_field_definitions")
        .select("custom_field_name, display_name")
        .eq("profile", importActiveProfile);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(importActiveProfile),
  });
  const cfTargets = useMemo(
    () =>
      (cfDefsQuery.data ?? [])
        .map((d) => ({
          name: d.custom_field_name,
          label: pickLang(d.display_name) || d.custom_field_name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [cfDefsQuery.data],
  );

  // Tipos de trabalhador do cliente — para o "tipo padrão" do mapeamento.
  const workerTypesQuery = useQuery({
    queryKey: ["import-worker-types", importActiveProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("id, name, name_i18n, argus_worker_type_code")
        .eq("profile", importActiveProfile)
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(importActiveProfile),
  });
  const workerTypes = workerTypesQuery.data ?? [];

  // Mapeamentos salvos deste cliente (import_mappings).
  const mappingsQuery = useQuery({
    queryKey: ["import-mappings", importActiveProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_mappings")
        .select("id, name, mapping, default_worker_type_id")
        .eq("profile", importActiveProfile)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(importActiveProfile),
  });

  // Carrega um mapeamento salvo (descrição, colunas e tipo padrão).
  const loadMapping = (id: string) => {
    setSelectedMappingId(id);
    const m = (mappingsQuery.data ?? []).find((x) => x.id === id);
    if (!m) return;
    setMappingName(m.name);
    setDefaultWorkerTypeId(m.default_worker_type_id ?? "");
    setMapping({ ...((m.mapping as Record<string, string>) ?? {}) });
  };

  // Salva (cria ou sobrescreve pela descrição) o mapeamento atual.
  const saveMapping = useMutation({
    mutationFn: async () => {
      const name = mappingName.trim();
      if (!name) throw new Error(t("import.map.nameRequired"));
      const payload = {
        profile: importActiveProfile,
        name,
        mapping: mapping as unknown as Json,
        default_worker_type_id: defaultWorkerTypeId || null,
      };
      const existing = (mappingsQuery.data ?? []).find(
        (x) => x.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        const { error } = await supabase
          .from("import_mappings")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("import_mappings").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(t("import.map.savedOk"));
      mappingsQuery.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Exclui o mapeamento salvo selecionado.
  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("import_mappings").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("import.map.removed"));
      setSelectedMappingId("");
      mappingsQuery.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Sugere o alvo de uma coluna casando o cabeçalho (normalizado) com os campos.
  const suggestTarget = useMemo(() => {
    const cfByNorm = new Map<string, string>();
    for (const c of cfTargets) {
      cfByNorm.set(normalizeHeader(c.name), CF_TARGET_PREFIX + c.name);
      cfByNorm.set(normalizeHeader(c.label), CF_TARGET_PREFIX + c.name);
    }
    const natByNorm = new Map<string, string>();
    for (const n of NATIVE_TARGETS) {
      natByNorm.set(normalizeHeader(n.key), NATIVE_TARGET_PREFIX + n.key);
      natByNorm.set(normalizeHeader(n.label), NATIVE_TARGET_PREFIX + n.key);
    }
    return (header: string): string => {
      const h = normalizeHeader(header);
      if (["filial", "nome (employer)"].includes(h)) return EMPLOYER_NAME_TARGET;
      if (["codigo", "cod", "codigo (employer)"].includes(h)) return EMPLOYER_CODE_TARGET;
      return cfByNorm.get(h) ?? natByNorm.get(h) ?? "";
    };
  }, [cfTargets]);

  // Ao escolher arquivo (modo mapeado), lê os cabeçalhos e pré-sugere o mapeamento.
  useEffect(() => {
    if (siteMode !== "mapped" || !file) {
      setHeaders([]);
      return;
    }
    let alive = true;
    readHeaders(file)
      .then((hs) => {
        if (!alive) return;
        setHeaders(hs);
        setMapping((prev) => {
          const next: Record<string, string> = {};
          // Preserva escolha já feita; se ainda vazia, (re)sugere — útil quando os
          // campos customizáveis carregam depois dos cabeçalhos.
          for (const h of hs) next[h] = prev[h] ? prev[h] : suggestTarget(h);
          return next;
        });
      })
      .catch((e) => toast.error((e as Error).message));
    return () => {
      alive = false;
    };
  }, [file, siteMode, suggestTarget]);

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
      if (siteMode === "mapped") {
        // Aplica o mapeamento coluna→campo definido na tela. O tipo de trabalhador
        // padrão só é injetado quando a planilha não trouxer o tipo.
        const defaultWorkerTypeCode =
          workerTypes.find((w) => w.id === defaultWorkerTypeId)?.argus_worker_type_code ?? "";
        const r = await applyColumnMapping(f, mapping, employerMap, {
          defaultWorkerTypeCode,
          defaultWorkerTypeId,
        });
        if (r.unresolved > 0) {
          toast.warning(t("import.employer.unresolved", { count: r.unresolved, total: r.total }));
        }
        prepared = r.file;
      } else if (siteMode === "employer") {
        // Aplica o de→para das colunas da Employer (site + nome/CPF/datas Vylor).
        const r = await mapEmployerImport(f, employerMap);
        if (r.unresolved > 0) {
          toast.warning(t("import.employer.unresolved", { count: r.unresolved, total: r.total }));
        }
        prepared = r.file;
      } else {
        // Injeta o site escolhido na coluna `siteId` de todas as linhas.
        prepared = await withSiteId(f, siteId);
      }
      // Processamento ASSÍNCRONO (background) + polling — evita timeout de gateway.
      const jobId = await argusApi.startImportAsync(prepared, {
        dryRun,
        updateAfastamentoOnly: afastamentoOnly,
      });
      // Até ~20 min (600 × 2s), suficiente para lotes grandes.
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await argusApi.getImportJob(jobId);
        if (job.status === "Completed") {
          if (!job.result) throw new ArgusApiError({ status: 0, message: "Job sem resultado." });
          return job.result;
        }
        if (job.status === "Failed") {
          throw new ArgusApiError({ status: 0, message: job.error ?? "Falha na importação." });
        }
      }
      throw new ArgusApiError({ status: 0, message: "Tempo excedido aguardando a importação." });
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

  // No modo mapeado, o site precisa ser resolvível: por Código/Nome (Employer)
  // ou por uma coluna mapeada diretamente para o siteId nativo.
  const mappedHasSite = useMemo(
    () =>
      Object.values(mapping).some(
        (tgt) =>
          tgt === EMPLOYER_CODE_TARGET ||
          tgt === EMPLOYER_NAME_TARGET ||
          tgt === NATIVE_TARGET_PREFIX + "siteId",
      ),
    [mapping],
  );

  const onSubmit = () => {
    if (!file) return;
    if (siteMode === "single" && !siteId) return;
    if (siteMode === "mapped" && (!headers.length || !mappedHasSite)) return;
    importMut.mutate(file);
  };

  // Baixa o relatório detalhado dos erros/avisos da última importação.
  const downloadErrorReport = () => {
    if (!result) return;
    const csv = buildErrorReport(result);
    // BOM para o Excel abrir com acentuação correta.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `erros-importacao-${(result.fileName ?? "import").replace(/\.[^.]+$/, "")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
              onValueChange={(v) => setSiteMode(v as "single" | "employer" | "mapped")}
              disabled={importMut.isPending}
            >
              <SelectTrigger id="siteMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">{t("import.siteMode.single")}</SelectItem>
                <SelectItem value="employer">{t("import.siteMode.employer")}</SelectItem>
                <SelectItem value="mapped">{t("import.siteMode.mapped")}</SelectItem>
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
          ) : siteMode === "employer" ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("import.employer.hint", { count: employerSitesQuery.data?.length ?? 0 })}
            </p>
          ) : (
            <div className="space-y-3">
              <Label>{t("import.map.title")}</Label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("import.map.saved")}</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedMappingId}
                      onValueChange={loadMapping}
                      disabled={importMut.isPending || (mappingsQuery.data ?? []).length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("import.map.savedPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(mappingsQuery.data ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMappingId && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMapping.mutate(selectedMappingId)}
                        disabled={deleteMapping.isPending}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("import.map.defaultWorkerType")}
                  </Label>
                  <Select
                    value={defaultWorkerTypeId || NO_WT}
                    onValueChange={(v) => setDefaultWorkerTypeId(v === NO_WT ? "" : v)}
                    disabled={importMut.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_WT}>{t("import.map.noDefaultWorkerType")}</SelectItem>
                      {workerTypes.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {pickLang(w.name_i18n) || w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!file ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t("import.map.pickFirst")}
                </p>
              ) : headers.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("import.map.column")}</TableHead>
                          <TableHead>{t("import.map.target")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headers.map((h) => (
                          <TableRow key={h}>
                            <TableCell className="font-medium">{h}</TableCell>
                            <TableCell>
                              <Select
                                value={mapping[h] || IGNORE}
                                onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}
                                disabled={importMut.isPending}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={IGNORE}>{t("import.map.ignore")}</SelectItem>
                                  <SelectItem value={EMPLOYER_CODE_TARGET}>
                                    {t("import.map.employerCode")}
                                  </SelectItem>
                                  <SelectItem value={EMPLOYER_NAME_TARGET}>
                                    {t("import.map.employerName")}
                                  </SelectItem>
                                  {NATIVE_TARGETS.map((n) => (
                                    <SelectItem key={n.key} value={NATIVE_TARGET_PREFIX + n.key}>
                                      {n.label}
                                    </SelectItem>
                                  ))}
                                  {cfTargets.map((c) => (
                                    <SelectItem key={c.name} value={CF_TARGET_PREFIX + c.name}>
                                      {c.label} · {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {!mappedHasSite && (
                    <p className="text-xs text-[var(--rm-inactive-ink)]">{t("import.map.needSite")}</p>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="mapName" className="text-xs text-muted-foreground">
                        {t("import.map.nameLabel")}
                      </Label>
                      <Input
                        id="mapName"
                        value={mappingName}
                        onChange={(e) => setMappingName(e.target.value)}
                        placeholder={t("import.map.namePlaceholder")}
                        disabled={importMut.isPending}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => saveMapping.mutate()}
                      disabled={saveMapping.isPending || !mappingName.trim()}
                    >
                      <Save className="mr-1 h-4 w-4" />
                      {t("import.map.save")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("import.map.hint")}</p>
                </>
              )}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={importMut.isPending} />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">{t("import.dryRun.label")}</span>
              <span className="block text-xs text-muted-foreground">{t("import.dryRun.hint")}</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <Switch
              checked={afastamentoOnly}
              onCheckedChange={setAfastamentoOnly}
              disabled={importMut.isPending}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t("import.afastamentoOnly.label")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("import.afastamentoOnly.hint")}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSubmit}
              disabled={
                !file ||
                (siteMode === "single" && !siteId) ||
                (siteMode === "mapped" && (!headers.length || !mappedHasSite)) ||
                importMut.isPending
              }
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

            {(() => {
              const issues = result.rows.filter(rowHasIssue);
              if (issues.length === 0) {
                return (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5 p-3 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                    {t("import.errors.none")}
                  </div>
                );
              }
              return (
                <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {t("import.errors.title", { count: issues.length })}
                    </span>
                    <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                      <Download className="mr-1 h-4 w-4" />
                      {t("import.errors.download")}
                    </Button>
                  </div>
                  <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                    {issues.map((r) => (
                      <li key={r.rowNumber} className="border-b border-destructive/10 pb-1.5 last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={actionTone(r.action).variant}>{actionTone(r.action).label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {t("import.col.row")} {r.rowNumber}
                          </span>
                          <span className="font-medium text-foreground">
                            {r.displayName || r.externalId || r.email || "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.messages.length ? r.messages.join(" · ") : "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

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
