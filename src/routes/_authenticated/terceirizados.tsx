import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { argusApi, customFieldsToRecord, useDefaultSiteId } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/terceirizados")({
  head: () => ({ meta: [{ title: "Terceirizados — Argus ClearID" }] }),
  component: TerceirizadosPage,
});

function formatValue(type: string | null | undefined, value: string) {
  if (!value) return "—";
  if ((type ?? "").toLowerCase() === "date") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  }
  return value;
}

function TerceirizadosPage() {
  const siteId = useDefaultSiteId();
  const [fName, setFName] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fAllSites, setFAllSites] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ name: "", company: "", allSites: false });

  const fieldsQuery = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    retry: false,
  });

  const identitiesQuery = useQuery({
    queryKey: ["terceirizados", siteId, applied],
    queryFn: () =>
      argusApi.listIdentities({
        firstName: applied.name || undefined,
        company: applied.company || undefined,
        allSites: applied.allSites,
        take: 100,
      }),
    enabled: hasSearched,
    retry: false,
  });

  const fields = useMemo(
    () => (fieldsQuery.data ?? []).filter((f) => !f.isDeleted),
    [fieldsQuery.data],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setApplied({ name: fName.trim(), company: fCompany.trim(), allSites: fAllSites });
  };

  const onClear = () => {
    setFName("");
    setFCompany("");
    setFAllSites(false);
    setHasSearched(false);
    setApplied({ name: "", company: "", allSites: false });
  };

  const items = identitiesQuery.data?.items ?? [];
  const colCount = 3 + fields.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Terceirizados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identities e seus campos personalizados (documentos, treinamentos e certificações).
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nome</Label>
              <Input
                id="t-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="Ex: Maria"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-company">Empresa</Label>
              <Input
                id="t-company"
                value={fCompany}
                onChange={(e) => setFCompany(e.target.value)}
                placeholder="Empresa"
              />
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
                Todos os sites
              </Label>
            </div>
            <Button type="button" variant="ghost" onClick={onClear} disabled={identitiesQuery.isFetching}>
              Limpar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => identitiesQuery.refetch()}
              disabled={identitiesQuery.isFetching || !hasSearched}
              title="Recarregar"
            >
              <RefreshCw className={identitiesQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button type="submit" disabled={identitiesQuery.isFetching}>
              <Search className="mr-1 h-4 w-4" /> Pesquisar
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-[200px] bg-card">Nome</TableHead>
                <TableHead className="min-w-[220px]">E-mail</TableHead>
                <TableHead>Status</TableHead>
                {fields.map((f) => (
                  <TableHead key={f.customFieldName} className="whitespace-nowrap">
                    {f.displayName || f.customFieldName}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasSearched ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-10 text-center text-sm text-muted-foreground">
                    Informe filtros e clique em <span className="font-medium text-foreground">Pesquisar</span> para listar terceirizados.
                  </TableCell>
                </TableRow>
              ) : identitiesQuery.isLoading || identitiesQuery.isFetching || fieldsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: Math.max(colCount, 4) }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : identitiesQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-10 text-center text-sm text-destructive">
                    {(identitiesQuery.error as Error).message}
                  </TableCell>
                </TableRow>
              ) : !items.length ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum terceirizado encontrado para os filtros informados.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => {
                  const status = String(it.status ?? "");
                  const isActive = status.toLowerCase() === "active";
                  const values = customFieldsToRecord(it.systemData?.customFields);
                  return (
                    <TableRow key={it.identityId}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium">
                        <Link
                          to="/identities/$id"
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
                      {fields.map((f) => (
                        <TableCell key={f.customFieldName} className="whitespace-nowrap text-sm">
                          {formatValue(f.customFieldType, values[f.customFieldName] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}