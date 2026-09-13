import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pickLang } from "@/lib/custom-fields";
import { argusApi, ArgusApiError, useActiveProfile, type IdentityUpsert } from "@/lib/argus-client";
import {
  saveIdentityCustomFields,
  type SiteFieldValue,
} from "@/lib/supabase-mirror";
import { createIdentityAtomic } from "@/lib/identity-atomic";
import { saveIdentityAttachments, type PendingAttachment } from "@/lib/attachments";
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
  const activeProfile = useActiveProfile();
  const workerTypesQuery = useQuery({
    queryKey: ["worker-types", activeProfile],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("id, name, name_i18n")
        .eq("is_active", true)
        .eq("profile", activeProfile);
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
      attachments: PendingAttachment[];
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
      // Etapa ATÔMICA (fonte de verdade da identity): grava no ClearID e no
      // Supabase; se qualquer lado falhar, a criação inteira é revertida e o
      // erro sobe para onError.
      return createIdentityAtomic(vars.data, {
        companyId: vars.companyId,
        workerTypeId: vars.workerTypeId,
      });
    },
    onSuccess: async (data, vars) => {
      // A partir daqui, a identity já existe em AMBOS os sistemas (ClearID +
      // Supabase). As etapas abaixo são complementares e best-effort: cada
      // uma falha isolada não invalida a criação.
      const ok: string[] = [t("identityNew.step.main")]; // etapa 1 (atomic) já concluída aqui
      const fail: string[] = [];

      // Etapa 2 — campos personalizados (endpoint dedicado).
      // NÃO re-filtra vazios: o formulário (buildPayload) já removeu os campos
      // que não devem ir e mantém `""` de propósito para datas não preenchidas —
      // enviar o vazio faz o ClearID gravar nulo em vez de assumir a data de hoje
      // (registro novo sem informação = data nula). Só descarta null/undefined.
      const cf = Object.entries(vars.data.customFields ?? {})
        .filter(([, v]) => v != null)
        .map(([customFieldName, v]) => ({
          customFieldName,
          // Vazio → null: o ClearID grava nulo (não a data de hoje) para datas
          // não preenchidas. Só datas chegam vazias aqui (buildPayload já
          // descartou os demais campos sem valor).
          customFieldValue: (v ?? "").toString().trim() === "" ? null : String(v),
        }));
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

      // Espelhamento adicional no Supabase — valores de campos personalizados
      // por site. Mirror/company/workerType já foram gravados na etapa atomic.
      await saveIdentityCustomFields(data.identityId, vars.siteFieldValues);
      // Anexos (Storage + versionamento) — após a identidade existir no Supabase.
      if (vars.attachments.length) {
        const { failed } = await saveIdentityAttachments(data.identityId, vars.attachments);
        if (failed.length) {
          toast.warning(t("attachment.uploadPartial", { n: failed.length }));
        }
      }
      qc.invalidateQueries({ queryKey: ["identities"] });
      navigate({ to: "/identities/$id", params: { id: data.identityId } });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      const hint = err.status === 400 ? t("identityNew.error.duplicateHint") : undefined;
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("identityNew.subtitle")}</p>
      </div>
      <IdentityForm
        key={workerTypeId ?? "novo"}
        mode="create"
        submitting={mut.isPending}
        initialWorkerTypeId={workerTypeId}
        lockWorkerType={Boolean(workerTypeId)}
        onSubmit={(data, siteFieldValues, companyId, wtId, photo, attachments) =>
          mut.mutate({ data, siteFieldValues, companyId, workerTypeId: wtId, photo, attachments })
        }
        onCancel={() => navigate({ to: "/identities" })}
      />
    </div>
  );
}
