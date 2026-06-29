import { useEffect, useState } from "react";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IdentityUpsert } from "@/lib/argus-client";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";

const baseSchema = z.object({
  externalId: z.string().trim().min(1, "Obrigatório").max(120),
  firstName: z.string().trim().min(1, "Obrigatório").max(100),
  lastName: z.string().trim().min(1, "Obrigatório").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  status: z.enum(["Active", "Inactive"]),
});

export type IdentityFormProps = {
  initial?: Partial<IdentityUpsert>;
  mode: "create" | "edit";
  submitting?: boolean;
  onSubmit: (data: IdentityUpsert) => void;
  onCancel?: () => void;
  extraActions?: React.ReactNode;
};

export function IdentityForm({
  initial,
  mode,
  submitting,
  onSubmit,
  onCancel,
  extraActions,
}: IdentityFormProps) {
  const [externalId, setExternalId] = useState(initial?.externalId ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [status, setStatus] = useState<"Active" | "Inactive">(initial?.status ?? "Active");
  const defaultSiteId = useDefaultSiteId();
  const [siteId, setSiteId] = useState<string>(initial?.siteId ?? defaultSiteId ?? "");
  useEffect(() => {
    if (!siteId && defaultSiteId) setSiteId(defaultSiteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSiteId]);
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });
  const sites = (sitesQuery.data ?? []).slice().sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"),
  );
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>(
    Object.entries(initial?.customFields ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = baseSchema.safeParse({ externalId, firstName, lastName, email, status });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path[0] as string] = i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    const cf: Record<string, string> = {};
    for (const { key, value } of customFields) if (key.trim()) cf[key.trim()] = value;
    onSubmit({ ...parsed.data, customFields: cf, siteId: siteId || undefined });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="externalId">External ID</Label>
            <Input
              id="externalId"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              disabled={mode === "edit"}
              placeholder="ex: RM-12345"
            />
            {errors.externalId && <p className="text-xs text-destructive">{errors.externalId}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "Active" | "Inactive")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Ativo</SelectItem>
                <SelectItem value="Inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder={sitesQuery.isLoading ? "Carregando..." : "Selecione um site"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atributos customizados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customFields.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum atributo. Adicione abaixo.</p>
          )}
          {customFields.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                placeholder="chave"
                value={row.key}
                onChange={(e) => {
                  const copy = [...customFields];
                  copy[idx] = { ...copy[idx], key: e.target.value };
                  setCustomFields(copy);
                }}
              />
              <Input
                placeholder="valor"
                value={row.value}
                onChange={(e) => {
                  const copy = [...customFields];
                  copy[idx] = { ...copy[idx], value: e.target.value };
                  setCustomFields(copy);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCustomFields([...customFields, { key: "", value: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar atributo
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {extraActions}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}