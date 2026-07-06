import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId } from "@/lib/argus-client";
import { clearIdToFormValues, serializeCustomFieldsForPatch } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentityForm } from "@/components/IdentityForm";
import { IdentityPicturePanel } from "@/components/IdentityPicturePanel";
import { CredentialsDialog } from "@/components/CredentialsDialog";
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
  const credentialsQuery = useQuery({
    queryKey: ["credentials", id],
    queryFn: () => argusApi.listCredentials(id),
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
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, { description: err.traceId ? `TraceId: ${err.traceId}` : undefined });
    },
  });

  const activate = useMutation({
    mutationFn: () => argusApi.activateIdentity(id),
    onSuccess: () => {
      toast.success("Identity ativada");
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, { description: err.traceId ? `TraceId: ${err.traceId}` : undefined });
    },
  });

  const isActive = String(query.data?.status ?? "").toLowerCase() === "active";
  const activationDate = (() => {
    const creds = credentialsQuery.data ?? [];
    const dates = creds
      .map((c) => c.activationDateUtc)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t));
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates)).toISOString();
  })();
  const fmtDate = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleDateString("pt-BR");
  };

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
        {activationDate && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Data de ativação:</span>{" "}
            <span>{fmtDate(activationDate)}</span>
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
          statusBadge={
            <span
              aria-label={isActive ? "Ativo" : "Inativo"}
              title={isActive ? "Ativo" : "Inativo"}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm ${
                isActive
                  ? "border-green-700 bg-green-600 text-white dark:border-green-400 dark:bg-green-500"
                  : "border-red-700 bg-red-600 text-white dark:border-red-400 dark:bg-red-500"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full bg-white ring-2 ring-white/40 sm:h-2.5 sm:w-2.5 ${
                  isActive ? "animate-pulse" : ""
                }`}
              />
              {isActive ? "Ativo" : "Inativo"}
            </span>
          }
          extraActions={
            <>
              <CredentialsDialog identityId={id} />
              <AlertDialog>
              <AlertDialogTrigger asChild>
                {isActive ? (
                  <Button type="button" variant="destructive">
                    <PowerOff className="mr-1 h-4 w-4" /> Desativar
                  </Button>
                ) : (
                  <Button type="button" variant="secondary">
                    <Power className="mr-1 h-4 w-4" /> Ativar
                  </Button>
                )}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isActive ? "Deseja desativar?" : "Deseja ativar?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isActive
                      ? "O registro será marcado como inativo no ClearID."
                      : "O registro será marcado como ativo no ClearID."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => (isActive ? deactivate.mutate() : activate.mutate())}
                  >
                    {isActive ? "Desativar" : "Ativar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
              </AlertDialog>
            </>
          }
          />
        </>
      ) : null}
    </div>
  );
}