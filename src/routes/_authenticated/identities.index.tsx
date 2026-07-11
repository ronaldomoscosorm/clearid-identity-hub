import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mirrorIdentities } from "@/lib/supabase-mirror";
import { Plus, RefreshCw, Search, MoreHorizontal, Eye, Power, PowerOff, Camera, Loader2 } from "lucide-react";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { IdentityPictureDialog } from "@/components/IdentityPictureDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClearIdIdentity } from "@/lib/argus-client";

export const Route = createFileRoute("/_authenticated/identities/")({
  head: () => ({ meta: [{ title: "Identities — Argus ClearID" }] }),
  component: IdentitiesList,
});

function IdentitiesList() {
  const queryClient = useQueryClient();
  const siteId = useDefaultSiteId();
  const [confirm, setConfirm] = useState<{ id: string; activate: boolean; name: string } | null>(
    null,
  );
  const [pictureFor, setPictureFor] = useState<{ id: string; name: string } | null>(null);
  // Campos do formulário (não disparam busca automaticamente)
  const [fFirstName, setFFirstName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fJobTitle, setFJobTitle] = useState("");
  const [fDepartment, setFDepartment] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fWorkerType, setFWorkerType] = useState<string>("all");
  const [fAllSites, setFAllSites] = useState(false);

  // Filtros efetivamente aplicados — só mudam ao clicar em Pesquisar
  const [hasSearched, setHasSearched] = useState(false);
  const [applied, setApplied] = useState<{
    firstName: string;
    email: string;
    company: string;
    jobTitle: string;
    department: string;
    status: string;
    workerTypeCode: string;
    allSites: boolean;
  }>({ firstName: "", email: "", company: "", jobTitle: "", department: "", status: "all", workerTypeCode: "all", allSites: false });

  const query = useQuery({
    queryKey: ["identities", siteId, applied],
    queryFn: () =>
      argusApi.listIdentities({
        firstName: applied.firstName || undefined,
        email: applied.email || undefined,
        company: applied.company || undefined,
        jobTitle: applied.jobTitle || undefined,
        department: applied.department || undefined,
        status: applied.status === "all" ? undefined : applied.status,
        workerTypeCode: applied.workerTypeCode === "all" ? undefined : applied.workerTypeCode,
        allSites: applied.allSites,
      }),
    enabled: hasSearched,
    retry: false,
  });

  // Espelha as identidades retornadas para o Supabase (cache local, best-effort).
  useEffect(() => {
    if (query.data?.items?.length) void mirrorIdentities(query.data.items);
  }, [query.data]);

  const toggleStatus = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      if (activate) await argusApi.activateIdentity(id);
      else await argusApi.deactivateIdentity(id);
      // Re-pesquisar essa identity após a operação
      return await argusApi.getIdentity(id);
    },
    onSuccess: (updated, vars) => {
      toast.success(vars.activate ? "Identity ativada" : "Identity desativada");
      // Atualiza o item dentro do cache da listagem atual
      queryClient.setQueryData(
        ["identities", applied],
        (prev: { items: ClearIdIdentity[]; total: number } | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) => (i.identityId === updated.identityId ? updated : i)),
          };
        },
      );
    },
    onError: (e: Error) => toast.error(e.message),
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
      workerTypeCode: fWorkerType,
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
    setFWorkerType("all");
    setFAllSites(false);
    setHasSearched(false);
    setApplied({ firstName: "", email: "", company: "", jobTitle: "", department: "", status: "all", workerTypeCode: "all", allSites: false });
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
                  <SelectItem value="Active">Ativos</SelectItem>
                  <SelectItem value="Inactive">Inativos</SelectItem>
                  <SelectItem value="all">Todos os status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo do Trabalhador</Label>
              <Select value={fWorkerType} onValueChange={setFWorkerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="Terceiros">Terceiros</SelectItem>
                  <SelectItem value="Colaborador">Colaborador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <div className="mr-auto flex items-center gap-2">
              <Checkbox
                id="f-all-sites"
                checked={fAllSites}
                onCheckedChange={(v) => setFAllSites(!!v)}
              />
              <Label htmlFor="f-all-sites" className="cursor-pointer text-sm font-normal">
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
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasSearched ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Informe filtros e clique em <span className="font-medium text-foreground">Pesquisar</span> para listar identities.
                </TableCell>
              </TableRow>
            ) : query.isLoading || query.isFetching ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-destructive">
                  {(query.error as Error).message}
                </TableCell>
              </TableRow>
            ) : !query.data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma identity encontrada para os filtros informados.
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
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/identities/$id" params={{ id: it.identityId }}>
                              <Eye className="mr-2 h-4 w-4" /> Visualizar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setPictureFor({
                                id: it.identityId,
                                name:
                                  `${it.firstName ?? ""} ${it.lastName ?? ""}`.trim() ||
                                  it.identityId,
                              })
                            }
                          >
                            <Camera className="mr-2 h-4 w-4" /> Atualizar foto
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {isActive ? (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirm({
                                  id: it.identityId,
                                  activate: false,
                                  name: `${it.firstName ?? ""} ${it.lastName ?? ""}`.trim() ||
                                    it.identityId,
                                })
                              }
                              disabled={toggleStatus.isPending}
                            >
                              <PowerOff className="mr-2 h-4 w-4" /> Desativar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirm({
                                  id: it.identityId,
                                  activate: true,
                                  name: `${it.firstName ?? ""} ${it.lastName ?? ""}`.trim() ||
                                    it.identityId,
                                })
                              }
                              disabled={toggleStatus.isPending}
                            >
                              <Power className="mr-2 h-4 w-4" /> Ativar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.activate ? "Ativar identity?" : "Desativar identity?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja {confirm?.activate ? "ativar" : "desativar"}{" "}
              <strong>{confirm?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleStatus.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggleStatus.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                toggleStatus.mutate(
                  { id: confirm.id, activate: confirm.activate },
                  { onSettled: () => setConfirm(null) },
                );
              }}
            >
              {toggleStatus.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processando...
                </>
              ) : (
                "Confirmar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pictureFor && (
        <IdentityPictureDialog
          identityId={pictureFor.id}
          identityName={pictureFor.name}
          open={!!pictureFor}
          onOpenChange={(o) => !o && setPictureFor(null)}
        />
      )}
    </div>
  );
}