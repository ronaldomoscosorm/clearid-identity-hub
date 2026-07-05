import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/terceirizados")({
  head: () => ({ meta: [{ title: "Terceirizados — Argus ClearID" }] }),
  component: TerceirizadosPage,
});

function TerceirizadosPage() {
  const siteId = useDefaultSiteId();
  const [fName, setFName] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fAllSites, setFAllSites] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({ name: "", company: "", allSites: false });

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
    </div>
  );
}