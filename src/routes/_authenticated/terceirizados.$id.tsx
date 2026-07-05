import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId } from "@/lib/argus-client";
import { clearIdToFormValues, serializeCustomFieldsForPatch } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentityForm } from "@/components/IdentityForm";
import { IdentityPicturePanel } from "@/components/IdentityPicturePanel";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/terceirizados/$id")({
  head: () => ({ meta: [{ title: "Terceirizado — Argus ClearID" }] }),
  component: IdentityDetail,
});

function IdentityDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const siteId = useDefaultSiteId();

  const query = useQuery({
    queryKey: ["identity", siteId, id],
    queryFn: () => argusApi.getIdentity(id),
    retry: false,
  });
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });

  const identitySiteId = query.data
    ? ((query.data as unknown as { siteId?: string }).siteId ??
        (query.data.companyData as { siteId?: string } | null | undefined)?.siteId ??
        (query.data.systemData as { siteId?: string } | null | undefined)?.siteId ??
        siteId ??
        undefined)
    : undefined;
  const siteName = identitySiteId
    ? sitesQuery.data?.find((s) => s.siteId === identitySiteId)?.name
    : undefined;

  const update = useMutation({
    mutationFn: async (data: Parameters<typeof argusApi.updateIdentity>[1]) => {
      // 1) Grava dados gerais (nome/e-mail/status) via PUT — sem custom fields.
      const { customFields, ...general } = data;
      await argusApi.updateIdentity(id, { ...general, customFields: undefined });
      // 2) Grava campos personalizados via PATCH dedicado.
      if (customFields) {
        const defs = (await argusApi.listCustomFields()).filter(
          (f) => !f.isDeleted && f.customFieldName.startsWith("Vylor_"),
        );
        const patch = serializeCustomFieldsForPatch(
          defs,
          customFields,
          query.data?.systemData?.customFields ?? null,
        );
        if (patch.length > 0) {
          await argusApi.patchIdentityCustomFields(id, patch);
        }
      }
    },
    onSuccess: () => {
      toast.success("Identity atualizada");
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
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
      navigate({ to: "/terceirizados" });
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
          <Link to="/terceirizados">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {query.data ? `${query.data.firstName} ${query.data.lastName}` : "Identity"}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
        {identitySiteId && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Site:</span>{" "}
            <span>{siteName ?? "—"}</span>{" "}
            <span className="font-mono text-[10px] opacity-70">({identitySiteId})</span>
          </p>
        )}
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
        <>
          <Card>
            <CardContent className="p-4">
              <IdentityPicturePanel identityId={id} />
            </CardContent>
          </Card>
          <IdentityForm
          mode="edit"
          showCustomFields
          initial={clearIdToFormValues(query.data)}
          submitting={update.isPending}
          onSubmit={(data) => {
            const original = query.data!;
            // ClearID PUT é um replace completo. Preservamos os campos que
            // não estão no formulário para evitar 400 (Falha ao atualizar
            // identidade no ClearID).
            update.mutate({
              ...data,
              // ClearID v4 exige eTag e dados aninhados no PUT. Preservamos
              // tudo que não está no formulário para não perder dados.
              identityType: (original.identityType ?? "employee").toLowerCase(),
              eTag: original.eTag,
              description: original.description ?? undefined,
              countryCode: original.countryCode ?? undefined,
              culture: original.culture ?? undefined,
              middleName: original.middleName ?? undefined,
              displayName: original.displayName ?? undefined,
              privateData: original.privateData ?? undefined,
              companyData: original.companyData ?? undefined,
              systemData: original.systemData ?? undefined,
            });
          }}
          onCancel={() => navigate({ to: "/terceirizados" })}
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
        </>
      ) : null}
    </div>
  );
}