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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/terceirizados")({
  head: () => ({ meta: [{ title: "Terceirizados — Argus ClearID" }] }),
  component: TerceirizadosPage,
});

function TerceirizadosPage() {
  const siteId = useDefaultSiteId();
  const [fFirstName, setFFirstName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fJobTitle, setFJobTitle] = useState("");
  const [fDepartment, setFDepartment] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fAllSites, setFAllSites] = useState(false);

  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState({
    firstName: "",
    email: "",
    company: "",
    jobTitle: "",
    department: "",
    status: "all",
    allSites: false,
  });

  const query = useQuery({
    queryKey: ["terceirizados", siteId, applied],
    queryFn: () =>
      argusApi.listIdentities({
        firstName: applied.firstName || undefined,
        email: applied.email || undefined,
        company: applied.company || undefined,
        jobTitle: applied.jobTitle || undefined,
        department: applied.department || undefined,
        status: applied.status === "all" ? undefined : applied.status,
        allSites: applied.allSites,
      }),
    enabled: hasSearched,
    retry: false,
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setApplied({
      firstName: fFirstName.trim(),
      email: fEmail.trim(),
      company: fCompany.trim(),
      jobTitle: fJobTitle.trim(),
      department: fDepartment.trim(),
      status: fStatus,
      allSites: fAllSites,
    });
  };

  const onClear = () => {
    setFFirstName("");
    setFEmail("");
    setFCompany("");
    setFJobTitle("");
    setFDepartment("");
    setFStatus("all");
    setFAllSites(false);
    setHasSearched(false);
    setApplied({ firstName: "", email: "", company: "", jobTitle: "", department: "", status: "all", allSites: false });
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-first-name">Nome</Label>
              <Input
                id="t-first-name"
                value={fFirstName}
                onChange={(e) => setFFirstName(e.target.value)}
                placeholder="Ex: Maria"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">E-mail</Label>
              <Input
                id="t-email"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder="usuario@empresa.com"
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
            <div className="space-y-1.5">
              <Label htmlFor="t-job-title">Cargo</Label>
              <Input
                id="t-job-title"
                value={fJobTitle}
                onChange={(e) => setFJobTitle(e.target.value)}
                placeholder="Cargo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-department">Departamento</Label>
              <Input
                id="t-department"
                value={fDepartment}
                onChange={(e) => setFDepartment(e.target.value)}
                placeholder="Departamento"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Ativos</SelectItem>
                  <SelectItem value="Inactive">Inativos</SelectItem>
                  <SelectItem value="all">Todos os status</SelectItem>
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
                Todos os sites
              </Label>
            </div>
            <Button type="button" variant="ghost" onClick={onClear} disabled={query.isFetching}>
              Limpar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => query.refetch()}
              disabled={query.isFetching || !hasSearched}
              title="Recarregar"
            >
              <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button type="submit" disabled={query.isFetching}>
              <Search className="mr-1 h-4 w-4" /> Pesquisar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}