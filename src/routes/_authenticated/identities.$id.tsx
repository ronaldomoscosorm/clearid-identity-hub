import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Power, PowerOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId } from "@/lib/argus-client";
import {
  mirrorIdentities,
  saveIdentityCustomFields,
  type SiteFieldValue,
} from "@/lib/supabase-mirror";
import { updateIdentityAtomic } from "@/lib/identity-atomic";
import { saveIdentityAttachments, type PendingAttachment } from "@/lib/attachments";
import { clearIdToFormValues } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentityForm } from "@/components/IdentityForm";
import { IdentityPicturePanel } from "@/components/IdentityPicturePanel";
import { CredentialsDialog } from "@/components/CredentialsDialog";
import { TeamsDialog } from "@/components/TeamsDialog";
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

export const Route = createFileRoute("/_authenticated/identities/$id")({
  head: () => ({ meta: [{ title: "Identity — Argus ClearID" }] }),
  component: IdentityDetail,
});

function IdentityDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const siteId = useDefaultSiteId();
  const { t } = useT();

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

  // Espelha a identidade carregada para o Supabase (cobre visualização e
  // refetch pós-update). Best-effort — o save atomic já garante consistência;
  // aqui é só cache.
  useEffect(() => {
    if (query.data)
      mirrorIdentities([query.data]).catch((err) =>
        console.error("[mirror] falha ao espelhar identidade em cache:", err),
      );
  }, [query.data]);

  // Site conforme o ClearID (sem cair no site padrão): se a identidade não tiver
  // site, fica indefinido e o cabeçalho não exibe um site "falso".
  const identitySiteId = query.data
    ? ((query.data as unknown as { siteId?: string }).siteId ??
      (query.data.companyData as { siteId?: string } | null | undefined)?.siteId ??
      (query.data.systemData as { siteId?: string } | null | undefined)?.siteId ??
      undefined)
    : undefined;
  // Escopo para sincronização/times: site do registro ou, na falta, o padrão.
  const scopeSiteId = identitySiteId ?? siteId ?? undefined;
  const siteName = identitySiteId
    ? sitesQuery.data?.find((s) => s.siteId === identitySiteId)?.name
    : undefined;

  const update = useMutation({
    mutationFn: async (vars: {
      data: Parameters<typeof argusApi.updateIdentity>[1];
      siteFieldValues: SiteFieldValue[];
      companyId: string | null;
      workerTypeId: string | null;
      attachments: PendingAttachment[];
    }) => {
      // Snapshot ANTES do update para poder reverter no ClearID caso o
      // Supabase falhe. Se por acaso query.data ainda não estiver disponível
      // (edge case), refazemos o GET.
      const originalIdentity = query.data ?? (await argusApi.getIdentity(id));
      return updateIdentityAtomic(
        id,
        vars.data,
        { companyId: vars.companyId, workerTypeId: vars.workerTypeId },
        originalIdentity,
      );
    },
    onSuccess: async (updated, vars) => {
      const ok: string[] = [t("identityDetail.mainData")];
      const fail: string[] = [];

      // Etapa — campos personalizados via PATCH (isola erros de valor, ex.: CPF
      // inválido, que não bloqueiam mais a atualização da identity).
      // NÃO re-filtra vazios aqui: o formulário (buildPayload) já removeu os
      // campos que não devem ser enviados e mantém `""` de propósito para datas
      // que o usuário zerou (ex.: certidão vencida) — o PATCH precisa levar o
      // vazio para o ClearID limpar o valor. Só descarta null/undefined.
      const cf = Object.entries(vars.data.customFields ?? {})
        .filter(([, v]) => v != null)
        .map(([customFieldName, v]) => ({
          customFieldName,
          // Vazio → null (o ClearID limpa o campo com null; "" numa data não
          // limpa e acaba virando a data de hoje). Só datas chegam vazias aqui,
          // pois o buildPayload já descartou os demais campos sem valor.
          customFieldValue: (v ?? "").toString().trim() === "" ? null : String(v),
        }));
      if (cf.length) {
        try {
          await argusApi.patchIdentityCustomFields(id, cf);
          ok.push(t("identityDetail.customFieldsShort"));
        } catch (e) {
          fail.push(t("identityDetail.customFieldsFail", { error: (e as Error).message }));
        }
      }

      // Etapa — regra padrão (se não houver nenhuma).
      try {
        const rule = await argusApi.ensureDefaultRule(id);
        if (rule.assigned)
          ok.push(
            t("identityDetail.defaultRuleAssigned", {
              rule: rule.ruleName ?? t("identityDetail.rule"),
            }),
          );
      } catch (e) {
        fail.push(t("identityDetail.defaultRuleFail", { error: (e as Error).message }));
      }

      // Etapa — sincroniza a identidade com os sistemas integrados.
      try {
        await argusApi.synchronizeIdentities([id], scopeSiteId);
        ok.push(t("identityDetail.syncShort"));
      } catch (e) {
        fail.push(t("identityDetail.syncFail", { error: (e as Error).message }));
      }

      if (fail.length) {
        toast.warning(t("identityDetail.updatePartial", { saved: ok.join(", ") }), {
          description: t("identityDetail.updateFailedDesc", { failed: fail.join("; ") }),
          duration: 12000,
        });
      } else {
        toast.success(t("identityDetail.updateSuccess", { saved: ok.join(", ") }));
      }
      // Re-mirror (mantém cache fresco após alterações; mirror/company/workerType
      // já foram gravados na etapa atomic dentro de updateIdentityAtomic).
      // Best-effort — falha aqui não interrompe o fluxo pós-save.
      mirrorIdentities([updated]).catch((err) =>
        console.error("[mirror] falha pós-update:", err),
      );
      await saveIdentityCustomFields(id, vars.siteFieldValues);
      // Anexos (Storage + versionamento).
      if (vars.attachments.length) {
        const { failed } = await saveIdentityAttachments(id, vars.attachments);
        if (failed.length) toast.warning(t("attachment.uploadPartial", { n: failed.length }));
        qc.invalidateQueries({ queryKey: ["identity-attachments"] });
        qc.invalidateQueries({ queryKey: ["identity-attachment-presence"] });
      }
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, {
        description: err.traceId ? `TraceId: ${err.traceId}` : undefined,
      });
    },
  });

  const deactivate = useMutation({
    mutationFn: () => argusApi.deactivateIdentity(id),
    onSuccess: () => {
      toast.success(t("identityDetail.deactivated"));
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, {
        description: err.traceId ? `TraceId: ${err.traceId}` : undefined,
      });
    },
  });

  const activate = useMutation({
    mutationFn: () => argusApi.activateIdentity(id),
    onSuccess: () => {
      toast.success(t("identityDetail.activated"));
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["identity", siteId, id] });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, {
        description: err.traceId ? `TraceId: ${err.traceId}` : undefined,
      });
    },
  });

  const isActive = String(query.data?.status ?? "").toLowerCase() === "active";
  const isToggling = deactivate.isPending || activate.isPending;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/identities">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("identityDetail.back")}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {query.data
            ? `${query.data.firstName} ${query.data.lastName}`
            : t("identityDetail.fallbackTitle")}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
        {identitySiteId && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t("identityDetail.siteLabel")}</span>{" "}
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
            initial={clearIdToFormValues(query.data)}
            submitting={update.isPending}
            onSubmit={(data, siteFieldValues, companyId, workerTypeId, _photo, attachments) => {
              const original = query.data!;
              // ClearID PUT é um replace completo. Preservamos os campos que
              // não estão no formulário para evitar 400 (Falha ao atualizar
              // identidade no ClearID).
              update.mutate({
                data: {
                  ...data,
                  // ClearID v4 exige eTag e identityType no PUT. systemData é
                  // preservado (contém customFields). Os demais campos (incl.
                  // privateData/companyData) vêm do formulário.
                  identityType: (original.identityType ?? "employee").toLowerCase(),
                  eTag: original.eTag,
                  systemData: original.systemData ?? undefined,
                },
                siteFieldValues,
                companyId,
                workerTypeId,
                attachments,
              });
            }}
            onCancel={() => navigate({ to: "/identities" })}
            statusBadge={
              <span
                aria-label={isActive ? t("identityDetail.active") : t("identityDetail.inactive")}
                title={isActive ? t("identityDetail.active") : t("identityDetail.inactive")}
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
                {isActive ? t("identityDetail.active") : t("identityDetail.inactive")}
              </span>
            }
            extraActions={
              <>
                <TeamsDialog identityId={id} siteId={scopeSiteId} />
                <CredentialsDialog identityId={id} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    {isActive ? (
                      <Button type="button" variant="destructive" disabled={isToggling}>
                        {isToggling ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <PowerOff className="mr-1 h-4 w-4" />
                        )}
                        {isToggling
                          ? t("identityDetail.processing")
                          : t("identityDetail.deactivate")}
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" disabled={isToggling}>
                        {isToggling ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Power className="mr-1 h-4 w-4" />
                        )}
                        {isToggling ? t("identityDetail.processing") : t("identityDetail.activate")}
                      </Button>
                    )}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {isActive
                          ? t("identityDetail.confirmDeactivateTitle")
                          : t("identityDetail.confirmActivateTitle")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {isActive
                          ? t("identityDetail.confirmDeactivateDesc")
                          : t("identityDetail.confirmActivateDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => (isActive ? deactivate.mutate() : activate.mutate())}
                      >
                        {isActive ? t("identityDetail.deactivate") : t("identityDetail.activate")}
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
