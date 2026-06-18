import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
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
    mutationFn: argusApi.createIdentity,
    onSuccess: (data) => {
      toast.success("Identity criada");
      qc.invalidateQueries({ queryKey: ["identities"] });
      navigate({ to: "/identities/$id", params: { id: data.id ?? data.externalId } });
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Nova identity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cria um novo registro no Identity Service v4.
        </p>
      </div>
      <IdentityForm
        mode="create"
        submitting={mut.isPending}
        onSubmit={(data) => mut.mutate(data)}
        onCancel={() => navigate({ to: "/identities" })}
      />
    </div>
  );
}