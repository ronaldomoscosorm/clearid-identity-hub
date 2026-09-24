import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { IdentityThumb } from "@/components/IdentityThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/terceirizados/")({
  head: () => ({ meta: [{ title: "Terceirizados — Argus ClearID" }] }),
  component: TerceirizadosPage,
});

function TerceirizadosPage() {
  const { t } = useT();
  const siteId = useDefaultSiteId();
  const SEARCH_KEY = "terceirizados:last-search";
  const emptyApplied = {
    firstName: "",
    email: "",
    company: "",
    jobTitle: "",
    department: "",
    status: "all",
    allSites: false,
  };
  const saved = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(SEARCH_KEY);
      return raw ? (JSON.parse(raw) as typeof emptyApplied) : null;
    } catch {
      return null;
    }
  })();

  const [fFirstName, setFFirstName] = useState(saved?.firstName ?? "");
  const [fEmail, setFEmail] = useState(saved?.email ?? "");
  const [fCompany, setFCompany] = useState(saved?.company ?? "");
  const [fJobTitle, setFJobTitle] = useState(saved?.jobTitle ?? "");
  const [fDepartment, setFDepartment] = useState(saved?.department ?? "");
  const [fStatus, setFStatus] = useState<string>(saved?.status ?? "all");
  const [fAllSites, setFAllSites] = useState<boolean>(saved?.allSites ?? false);

  const [hasSearched, setHasSearched] = useState<boolean>(true);
  const [applied, setApplied] = useState(saved ?? emptyApplied);

  const query = useQuery({
    queryKey: ["terceirizados", siteId, applied],
    queryFn: async () => {
      // A API de /search não filtra por workerTypeCode e nem retorna esse
      // campo na listagem. Buscamos os detalhes de cada identity em paralelo
      // (onde workerTypeCode existe em companyData) e filtramos por
      // "Terceiros" no cliente.
      const res = await argusApi.listIdentities({
        firstName: applied.firstName || undefined,
        email: applied.email || undefined,
        company: applied.company || undefined,
        jobTitle: applied.jobTitle || undefined,
        department: applied.department || undefined,
        status: applied.status === "all" ? undefined : applied.status,
        allSites: applied.allSites,
      });
      const base = res.items ?? [];
      const details = await Promise.all(
        base.map(async (it) => {
          try {
            const full = await argusApi.getIdentity(it.identityId);
            return { ...it, ...full };
          } catch {
            return it;
          }
        }),
      );
      const items = details.filter((it) => {
        const company = (it.companyData ?? null) as Record<string, unknown> | null;
        const code =
          (company && typeof company.workerTypeCode === "string"
            ? (company.workerTypeCode as string)
            : null) ??
          it.workerTypeCode ??
          "";
        return code.trim().toLowerCase() === "terceiros";
      });
      return { items, total: items.length };
    },
    enabled: hasSearched,
    retry: false,
  });
  const totalCols = 5;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    const next = {
      firstName: fFirstName.trim(),
      email: fEmail.trim(),
      company: fCompany.trim(),
      jobTitle: fJobTitle.trim(),
      department: fDepartment.trim(),
      status: fStatus,
      allSites: fAllSites,
    };
    setApplied(next);
    try {
      sessionStorage.setItem(SEARCH_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  };

  const onClear = () => {
    setFFirstName("");
    setFEmail("");
    setFCompany("");
    setFJobTitle("");
    setFDepartment("");
    setFStatus("all");
    setFAllSites(false);
    setApplied(emptyApplied);
    try {
      sessionStorage.removeItem(SEARCH_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("contractors.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("contractors.subtitle")}
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("contractors.workerType")}</Label>
            <Select value="Terceiros" disabled>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Terceiros">{t("contractors.workerTypeContractors")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("contractors.workerTypeHint")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-first-name">{t("common.name")}</Label>
              <Input
                id="t-first-name"
                value={fFirstName}
                onChange={(e) => setFFirstName(e.target.value)}
                placeholder={t("contractors.firstNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">{t("common.email")}</Label>
              <Input
                id="t-email"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder={t("contractors.emailPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-company">{t("contractors.company")}</Label>
              <Input
                id="t-company"
                value={fCompany}
                onChange={(e) => setFCompany(e.target.value)}
                placeholder={t("contractors.company")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-job-title">{t("contractors.jobTitle")}</Label>
              <Input
                id="t-job-title"
                value={fJobTitle}
                onChange={(e) => setFJobTitle(e.target.value)}
                placeholder={t("contractors.jobTitle")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-department">{t("contractors.department")}</Label>
              <Input
                id="t-department"
                value={fDepartment}
                onChange={(e) => setFDepartment(e.target.value)}
                placeholder={t("contractors.department")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">{t("contractors.statusActive")}</SelectItem>
                  <SelectItem value="Inactive">{t("contractors.statusInactive")}</SelectItem>
                  <SelectItem value="all">{t("contractors.statusAll")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <div className="mr-auto flex items-center gap-2">
              <Checkbox
                id="t-all-sites"
                checked={fAllSites}
                onCheckedChange={(v) => setFAllSites(!!v)}
              />
              <Label htmlFor="t-all-sites" className="cursor-pointer text-sm font-normal">
                {t("contractors.allSites")}
              </Label>
            </div>
            <Button type="button" variant="ghost" onClick={onClear} disabled={query.isFetching}>
              {t("contractors.clear")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => query.refetch()}
              disabled={query.isFetching || !hasSearched}
              title={t("contractors.reload")}
            >
              <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button type="submit" disabled={query.isFetching}>
              <Search className="mr-1 h-4 w-4" /> {t("common.search")}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14"></TableHead>
              <TableHead>{t("contractors.col.identityId")}</TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasSearched ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-10 text-center text-sm text-muted-foreground">
                  {t("contractors.emptyPromptBefore")} <span className="font-medium text-foreground">{t("common.search")}</span> {t("contractors.emptyPromptAfter")}
                </TableCell>
              </TableRow>
            ) : query.isLoading || query.isFetching ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: totalCols }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-10 text-center text-sm text-destructive">
                  {(query.error as Error).message}
                </TableCell>
              </TableRow>
            ) : !query.data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-10 text-center text-sm text-muted-foreground">
                  {t("contractors.emptyState")}
                </TableCell>
              </TableRow>
            ) : (
              query.data.items.map((it) => {
                const status = String(it.status ?? "");
                const isActive = status.toLowerCase() === "active";
                return (
                  <TableRow key={it.identityId}>
                    <TableCell>
                      <IdentityThumb identityId={it.identityId} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {it.identityId}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        to="/terceirizados/$id"
                        params={{ id: it.identityId }}
                        className="hover:underline"
                      >
                        {it.firstName} {it.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{it.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? "Active" : status || "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}