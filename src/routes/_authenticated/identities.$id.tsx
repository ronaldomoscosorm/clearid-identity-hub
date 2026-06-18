import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import { useArgusEnv } from "@/lib/argus-env";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentityForm } from "@/components/IdentityForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/identities/$id")({
  head: () => ({ meta: [{ title: "Identity — Argus ClearID" }] }),
  component: IdentityDetail,
});

function IdentityDetail() {
  const { id } = Route.useParams();
  const { env } = useArgusEnv();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["identity", env, id],
    queryFn: () => argusApi.getIdentity(id),
    retry: false,
  });

  const update = useMutation({
    mutationFn: (data: Parameters<typeof argusApi.updateIdentity>[1]) => argusApi.updateIdentity(id, data),
    onSuccess: () => {
      toast.success("Identity atualizada");
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", env, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, { description: err.traceId ? `TraceId: ${err.traceId}` : undefined });
    },
  });

  const deactivate = useMutation({
    mutationFn: () => argusApi.deactivateIdentity(id),
    onSuccess: () => {
      toast.success("Identity desativada");
      qc.invalidateQueries({ queryKey: ["identities"] });
      navigate({ to: "/identities" });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, { description: err.traceId ? `TraceId: ${err.traceId}` : undefined });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/identities">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {query.data ? `${query.data.firstName} ${query.data.lastName}` : "Identity"}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : query.data ? (
        <IdentityForm
          mode="edit"
          initial={query.data}
          submitting={update.isPending}
          onSubmit={(data) => update.mutate(data)}
          onCancel={() => navigate({ to: "/identities" })}
          extraActions={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  <PowerOff className="mr-1 h-4 w-4" /> Desativar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desativar esta identity?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O registro será marcado como inativo no ClearID. Esta ação pode ser revertida pela atualização do status.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deactivate.mutate()}>Desativar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
      ) : null}
    </div>
  );
}