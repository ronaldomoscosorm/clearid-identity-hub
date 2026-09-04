import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { useActiveProfile } from "@/lib/argus-client";
import { useCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/current-user";
import {
  useClientSettings,
  useUpdateClientSettings,
  type CustomFieldStorage,
} from "@/lib/client-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/configuracoes-cliente")({
  head: () => ({ meta: [{ title: "Configurações do cliente — Argus ClearID" }] }),
  component: ClientSettingsPage,
});

function ClientSettingsPage() {
  const activeProfile = useActiveProfile();
  const currentUser = useCurrentUser();
  const admin = isAdmin(currentUser.data ?? null);

  const query = useClientSettings(activeProfile);
  const update = useUpdateClientSettings();

  const [storage, setStorage] = useState<CustomFieldStorage>("both");

  useEffect(() => {
    if (query.data) setStorage(query.data.defaultCustomFieldStorage);
  }, [query.data]);

  const dirty = query.data ? storage !== query.data.defaultCustomFieldStorage : false;

  const submit = () => {
    update.mutate(
      { profile: activeProfile, defaultCustomFieldStorage: storage },
      {
        onSuccess: () => toast.success("Configurações salvas."),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  if (!admin) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Configurações do cliente
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesso restrito ao perfil Administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Configurações do cliente
            </h1>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Cliente: {activeProfile}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Padrões aplicados a todos os usuários deste cliente.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            Campos personalizados
          </CardTitle>
          <CardDescription>
            Define onde novas definições de campo personalizado são gravadas por padrão. O usuário
            ainda pode escolher outro local em cada campo, no dialog de criação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label>Armazenamento padrão</Label>
            <Select
              value={storage}
              onValueChange={(v) => setStorage(v as CustomFieldStorage)}
              disabled={query.isLoading || update.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clearid">ClearID (SaaS)</SelectItem>
                <SelectItem value="supabase">Local (Supabase)</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <strong>ClearID:</strong> a definição e o valor por identidade ficam no Genetec.
              {" "}<strong>Local:</strong> só no Supabase (não trafega no PIAM).
              {" "}<strong>Ambos:</strong> criado nos dois — ClearID é fonte da verdade.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!dirty || update.isPending}>
              {update.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
