import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, type IdentityUpsert } from "@/lib/argus-client";
import { mirrorIdentities, saveIdentityCustomFields, type SiteFieldValue } from "@/lib/supabase-mirror";
import { Button } from "@/components/ui/button";
import { IdentityForm } from "@/components/IdentityForm";

export const Route = createFileRoute("/_authenticated/identities/new")({
  head: () => ({ meta: [{ title: "Nova identity — Argus ClearID" }] }),
  component: NewIdentity,
});

function NewIdentity() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (vars: { data: IdentityUpsert; siteFieldValues: SiteFieldValue[] }) => {
      // Verifica e-mail duplicado antes de criar (o ClearID rejeita com 400).
      const dupes = await argusApi.findIdentitiesByEmail(vars.data.email);
      if (dupes.length) {
        const d = dupes[0];
        throw new ArgusApiError({
          status: 409,
          message: `Já existe uma identidade com o e-mail ${vars.data.email}: ${d.firstName} ${d.lastName} (${d.status}).`,
        });
      }
      return argusApi.createIdentity(vars.data);
    },
    onSuccess: async (data, vars) => {
      // Grava os campos personalizados após a criação (endpoint dedicado).
      const cf = Object.entries(vars.data.customFields ?? {})
        .filter(([, v]) => (v ?? "").trim())
        .map(([customFieldName, customFieldValue]) => ({ customFieldName, customFieldValue }));
      let customSaved = false;
      if (cf.length) {
        try {
          await argusApi.patchIdentityCustomFields(data.identityId, cf);
          customSaved = true;
        } catch (e) {
          toast.warning(
            `Identity criada — dados principais gravados, mas falhou ao gravar os customizáveis: ${(e as Error).message}`,
          );
        }
      }
      if (cf.length === 0) {
        toast.success("Identity criada — dados principais gravados");
      } else if (customSaved) {
        toast.success("Identity criada — dados principais e customizáveis gravados");
      }
      // Se a identidade não tiver nenhuma regra, atribui a regra padrão.
      try {
        const rule = await argusApi.ensureDefaultRule(data.identityId);
        if (rule.assigned) toast.info(`Regra padrão atribuída: ${rule.ruleName ?? "regra"}`);
      } catch (e) {
        console.error("[regra] falha ao atribuir regra padrão:", (e as Error).message);
      }
      await mirrorIdentities([data]);
      await saveIdentityCustomFields(data.identityId, vars.siteFieldValues);
      qc.invalidateQueries({ queryKey: ["identities"] });
      navigate({ to: "/identities/$id", params: { id: data.identityId } });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      const hint =
        err.status === 400
          ? "Causa comum: já existe uma identidade com este e-mail."
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
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Nova identity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cria um novo registro no Identity Service v4.
        </p>
      </div>
      <IdentityForm
        mode="create"
        submitting={mut.isPending}
        onSubmit={(data, siteFieldValues) => mut.mutate({ data, siteFieldValues })}
        onCancel={() => navigate({ to: "/identities" })}
      />
    </div>
  );
}