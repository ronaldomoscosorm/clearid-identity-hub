import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pickLang } from "@/lib/custom-fields";
import { argusApi, ArgusApiError, type IdentityUpsert } from "@/lib/argus-client";
import {
  mirrorIdentities,
  saveIdentityCustomFields,
  saveIdentityCompany,
  saveIdentityWorkerType,
  type SiteFieldValue,
} from "@/lib/supabase-mirror";
import { Button } from "@/components/ui/button";
import { IdentityForm } from "@/components/IdentityForm";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/identities/new")({
  head: () => ({ meta: [{ title: "Nova identity — Argus ClearID" }] }),
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: typeof search.type === "string" ? search.type : undefined,
  }),
  component: NewIdentity,
});

function NewIdentity() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { type: workerTypeId } = Route.useSearch();

  // Nome do tipo de trabalhador para o título "Novo [Tipo]".
  const workerTypesQuery = useQuery({
    queryKey: ["worker-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("id, name, name_i18n")
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const wt = workerTypesQuery.data?.find((w) => w.id === workerTypeId);
  const heading =
    workerTypeId && wt
      ? t("identityNew.newOf", { type: pickLang(wt.name_i18n, lang) || wt.name })
      : t("identityNew.title");
  const mut = useMutation({
    mutationFn: async (vars: {
      data: IdentityUpsert;
      siteFieldValues: SiteFieldValue[];
      companyId: string | null;
      workerTypeId: string | null;
      photo: Blob | null;
    }) => {
      // Verifica e-mail duplicado antes de criar (o ClearID rejeita com 400).
      const dupes = await argusApi.findIdentitiesByEmail(vars.data.email);
      if (dupes.length) {
        const d = dupes[0];
        throw new ArgusApiError({
          status: 409,
          message: t("identityNew.duplicateEmail", {
            email: vars.data.email,
            name: `${d.firstName} ${d.lastName}`,
            status: d.status,
          }),
        });
      }
      return argusApi.createIdentity(vars.data);
    },
    onSuccess: async (data, vars) => {
      // Sem transação: cada etapa é gravada em separado. Rastreamos o resultado
      // de cada uma (identity / customizáveis / regra) e notificamos o que
      // deu certo e o que falhou.
      const ok: string[] = [t("identityNew.step.main")]; // etapa 1 (identity) já concluída aqui
      const fail: string[] = [];

      // Etapa 2 — campos personalizados (endpoint dedicado).
      const cf = Object.entries(vars.data.customFields ?? {})
        .filter(([, v]) => (v ?? "").trim())
        .map(([customFieldName, customFieldValue]) => ({ customFieldName, customFieldValue }));
      if (cf.length) {
        try {
          await argusApi.patchIdentityCustomFields(data.identityId, cf);
          ok.push(t("identityNew.step.customFields"));
        } catch (e) {
          fail.push(t("identityNew.fail.customFields", { error: (e as Error).message }));
        }
      }

      // Etapa 3 — foto (o upload só é possível após a criação, já com o id).
      if (vars.photo) {
        try {
          await argusApi.uploadIdentityPicture(data.identityId, vars.photo);
          ok.push(t("identityNew.step.photo"));
        } catch (e) {
          fail.push(t("identityNew.fail.photo", { error: (e as Error).message }));
        }
      }

      // Etapa 4 — regra padrão (se não houver nenhuma).
      try {
        const rule = await argusApi.ensureDefaultRule(data.identityId);
        if (rule.assigned)
          ok.push(
            t("identityNew.step.defaultRule", {
              rule: rule.ruleName ?? t("identityNew.defaultRuleFallback"),
            }),
          );
      } catch (e) {
        fail.push(t("identityNew.fail.defaultRule", { error: (e as Error).message }));
      }

      // Etapa 5 — sincroniza a identidade com os sistemas integrados (após os
      // dados complementares já terem sido gravados).
      try {
        await argusApi.synchronizeIdentities([data.identityId], vars.data.siteId);
        ok.push(t("identityNew.step.sync"));
      } catch (e) {
        fail.push(t("identityNew.fail.sync", { error: (e as Error).message }));
      }

      if (fail.length) {
        toast.warning(t("identityNew.createdWithIssues", { ok: ok.join(", ") }), {
          description: t("identityNew.failedList", { fail: fail.join("; ") }),
          duration: 12000,
        });
      } else {
        toast.success(t("identityNew.createdSuccess", { ok: ok.join(", ") }));
      }

      // Espelhamento no Supabase (best-effort, fora das 3 etapas do Argus).
      await mirrorIdentities([data]);
      await saveIdentityCompany(data.identityId, vars.companyId);
      await saveIdentityWorkerType(data.identityId, vars.workerTypeId);
      await saveIdentityCustomFields(data.identityId, vars.siteFieldValues);
      qc.invalidateQueries({ queryKey: ["identities"] });
      navigate({ to: "/identities/$id", params: { id: data.identityId } });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      const hint =
        err.status === 400
          ? t("identityNew.error.duplicateHint")
          : undefined;
      const description = [hint, err.traceId ? `TraceId: ${err.traceId}` : undefined]
        .filter(Boolean)
        .join(" · ");
      toast.error(err.message, { description: description || undefined });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/identities">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("identityNew.back")}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {heading}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("identityNew.subtitle")}</p>
      </div>
      <IdentityForm
        key={workerTypeId ?? "novo"}
        mode="create"
        submitting={mut.isPending}
        initialWorkerTypeId={workerTypeId}
        lockWorkerType={Boolean(workerTypeId)}
        onSubmit={(data, siteFieldValues, companyId, wtId, photo) =>
          mut.mutate({ data, siteFieldValues, companyId, workerTypeId: wtId, photo })
        }
        onCancel={() => navigate({ to: "/identities" })}
      />
    </div>
  );
}