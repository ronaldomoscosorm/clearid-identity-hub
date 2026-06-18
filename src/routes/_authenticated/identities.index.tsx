import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, MoreHorizontal, Eye, Power, PowerOff } from "lucide-react";
import { argusApi } from "@/lib/argus-client";
import { useArgusEnv } from "@/lib/argus-env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { IdentityThumb } from "@/components/IdentityThumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/identities/")({
  head: () => ({ meta: [{ title: "Identities — Argus ClearID" }] }),
  component: IdentitiesList,
});

function IdentitiesList() {
  const { env } = useArgusEnv();
  const queryClient = useQueryClient();
  // Campos do formulário (não disparam busca automaticamente)
  const [fFirstName, setFFirstName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fJobTitle, setFJobTitle] = useState("");
  const [fDepartment, setFDepartment] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");

  // Filtros efetivamente aplicados — só mudam ao clicar em Pesquisar
  const [applied, setApplied] = useState<{
    firstName: string;
    email: string;
    company: string;
    jobTitle: string;
    department: string;
    status: string;
  }>({ firstName: "", email: "", company: "", jobTitle: "", department: "", status: "all" });

  const query = useQuery({
    queryKey: ["identities", env, applied],
    queryFn: () =>
      argusApi.listIdentities({
        firstName: applied.firstName || undefined,
        email: applied.email || undefined,
        company: applied.company || undefined,
        jobTitle: applied.jobTitle || undefined,
        department: applied.department || undefined,
        status: applied.status === "all" ? undefined : applied.status,
      }),
    retry: false,
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) =>
      activate ? argusApi.activateIdentity(id) : argusApi.deactivateIdentity(id),
    onSuccess: (_d, vars) => {
      toast.success(vars.activate ? "Identity ativada" : "Identity desativada");
      queryClient.invalidateQueries({ queryKey: ["identities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied({
      firstName: fFirstName.trim(),
      email: fEmail.trim(),
      company: fCompany.trim(),
      jobTitle: fJobTitle.trim(),
      department: fDepartment.trim(),
      status: fStatus,
    });
  };

  const onClear = () => {
    setFFirstName("");
    setFEmail("");
    setFCompany("");
    setFJobTitle("");
    setFDepartment("");
    setFStatus("all");
    setApplied({ firstName: "", email: "", company: "", jobTitle: "", department: "", status: "all" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Identities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastros sincronizados com o Identity Service v4 do ClearID.
          </p>
        </div>
        <Button asChild>
          <Link to="/identities/new">
            <Plus className="mr-1 h-4 w-4" /> Nova identity
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="f-first-name">Nome</Label>
              <Input
                id="f-first-name"
                value={fFirstName}
                onChange={(e) => setFFirstName(e.target.value)}
                placeholder="Ex: Maria"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-email">E-mail</Label>
              <Input
                id="f-email"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-company">Empresa</Label>
              <Input
                id="f-company"
                value={fCompany}
                onChange={(e) => setFCompany(e.target.value)}
                placeholder="Empresa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-job-title">Cargo</Label>
              <Input
                id="f-job-title"
                value={fJobTitle}
                onChange={(e) => setFJobTitle(e.target.value)}
                placeholder="Cargo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-department">Departamento</Label>
              <Input
                id="f-department"
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
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="Active">Ativos</SelectItem>
                  <SelectItem value="Inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClear} disabled={query.isFetching}>
              Limpar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
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

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Foto</TableHead>
              <TableHead>IdentityId</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Relevância</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  {(query.error as Error).message}
                </TableCell>
              </TableRow>
            ) : !query.data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma identity encontrada para os filtros informados.
                </TableCell>
              </TableRow>
            ) : (
              query.data.items.map((it) => {
                const status = String(it.status ?? "");
                const isActive = status.toLowerCase() === "active";
                return (
                  <TableRow key={it.identityId} className="cursor-pointer">
                    <TableCell>
                      <IdentityThumb identityId={it.identityId} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/identities/$id"
                        params={{ id: it.identityId }}
                        className="hover:underline"
                      >
                        {it.identityId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {it.firstName} {it.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{it.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? "Active" : status || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {typeof it.score === "number" ? it.score.toFixed(2) : "—"}
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