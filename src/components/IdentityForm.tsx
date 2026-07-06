import { useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  externalId: z.string().trim().max(120).optional().default(""),
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
  statusBadge?: React.ReactNode;
  showCustomFields?: boolean;
};

export function IdentityForm({
  initial,
  mode,
  submitting,
  onSubmit,
  onCancel,
  extraActions,
  statusBadge,
  showCustomFields = false,
}: IdentityFormProps) {
  const [externalId, setExternalId] = useState(initial?.externalId ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [status, setStatus] = useState<"Active" | "Inactive">(initial?.status ?? "Active");
  const [workerTypeCode, setWorkerTypeCode] = useState<string>(initial?.workerTypeCode ?? "");
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
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    { ...(initial?.customFields ?? {}) },
  );
  const fieldsQuery = useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => argusApi.listCustomFields(),
    staleTime: 5 * 60 * 1000,
  });
  const sectionQuery = useQuery({
    queryKey: ["custom-fields-section", "VylorTerceiros"],
    queryFn: () => argusApi.getCustomFieldSection("VylorTerceiros"),
    staleTime: 5 * 60 * 1000,
    enabled: showCustomFields,
  });
  const orderMap = new Map(
    (sectionQuery.data?.identityCustomFields ?? []).map((f) => [f.name, f.index]),
  );
  const defs = (fieldsQuery.data ?? [])
    .filter((f) => !f.isDeleted && f.customFieldName.startsWith("Vylor_"))
    .sort((a, b) => {
      const ai = orderMap.get(a.customFieldName);
      const bi = orderMap.get(b.customFieldName);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return (a.displayName ?? a.customFieldName).localeCompare(
        b.displayName ?? b.customFieldName,
        "pt-BR",
      );
    });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (name: string, value: string) =>
    setCustomFields((prev) => ({ ...prev, [name]: value }));

  const typeOf = (t?: string | null) => (t ?? "").toLowerCase();
  const isDate = (t?: string | null) => typeOf(t) === "date" || typeOf(t) === "datetime";
  const isBool = (t?: string | null) =>
    ["bool", "boolean", "switch", "toggle"].includes(typeOf(t));

  const isBlank = (v: string | null | undefined) => {
    if (v == null) return true;
    const s = String(v).trim();
    return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined";
  };
  const toTextValue = (v: string) => (isBlank(v) ? "" : v);
  const toDateInputValue = (v: string) => {
    if (isBlank(v)) return "";
    // Accept ISO or yyyy-MM-dd already
    const iso = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
    if (iso) {
      // Ignore sentinel epoch dates the API sometimes returns for "no value".
      if (iso.startsWith("0001-") || iso === "1900-01-01" || iso === "1970-01-01") return "";
      return iso;
    }
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      const out = d.toISOString().slice(0, 10);
      if (out.startsWith("0001-")) return "";
      return out;
    }
    return "";
  };
  // Converte ISO (yyyy-MM-dd) -> dd/MM/yyyy para exibição
  const isoToBr = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };
  // Valida dd/MM/yyyy: retorna ISO se válida, null se inválida, "" se vazia
  const brToIso = (v: string): string | null => {
    const s = (v ?? "").trim();
    if (!s) return "";
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = Number(dd), mo = Number(mm), y = Number(yyyy);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${yyyy}-${mm}-${dd}`;
  };
  // Aplica máscara dd/MM/yyyy ao digitar
  const maskDateInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const p1 = digits.slice(0, 2);
    const p2 = digits.slice(2, 4);
    const p3 = digits.slice(4, 8);
    if (digits.length <= 2) return p1;
    if (digits.length <= 4) return `${p1}/${p2}`;
    return `${p1}/${p2}/${p3}`;
  };
  const isTruthy = (v: string) => !isBlank(v) && ["true", "1", "yes", "sim"].includes(v.toLowerCase());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = baseSchema.safeParse({ externalId, firstName, lastName, email, status });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[i.path[0] as string] = i.message;
      setErrors(out);
      return;
    }
    const cfErrors: Record<string, string> = {};
    const dateFieldNames = new Set(defs.filter((f) => isDate(f.customFieldType)).map((f) => f.customFieldName));
    const cf: Record<string, string> = {};
    for (const [k, v] of Object.entries(customFields)) {
      const key = k.trim();
      if (!key) continue;
      if (dateFieldNames.has(key)) {
        const raw = (v ?? "").trim();
        if (!raw) {
          // Mantém o campo no payload (PUT do ClearID é replace);
          // valor vazio significa "sem data".
          cf[key] = "";
          continue;
        }
        // Aceita ISO (vindo do GET sem edição) ou dd/MM/yyyy
        const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : brToIso(raw);
        if (iso === null || iso === "") {
          cfErrors[`cf-${key}`] = "Data inválida (use dd/mm/aaaa)";
          continue;
        }
        cf[key] = iso;
      } else {
        cf[key] = v ?? "";
      }
    }
    if (Object.keys(cfErrors).length) {
      setErrors(cfErrors);
      return;
    }
    setErrors({});
    onSubmit({
      ...parsed.data,
      customFields: cf,
      siteId: siteId || undefined,
      workerTypeCode: workerTypeCode || undefined,
    });
  };

  const dateDefs = defs.filter((f) => isDate(f.customFieldType));
  const boolDefs = defs.filter((f) => isBool(f.customFieldType));
  const textDefs = defs.filter(
    (f) => !isDate(f.customFieldType) && !isBool(f.customFieldType),
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Identificação</CardTitle>
          {statusBadge}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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

      {showCustomFields && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atributos customizados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fieldsQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : defs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum campo personalizado definido.
            </p>
          ) : (
            <div className="space-y-6">
              {(dateDefs.length > 0 || textDefs.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[...dateDefs, ...textDefs].map((f) => {
                    const name = f.customFieldName;
                    const label = f.displayName || name;
                    const value = customFields[name] ?? "";
                    return (
                      <div key={name} className="space-y-1.5">
                        <Label htmlFor={`cf-${name}`} className="text-xs text-muted-foreground">
                          {label}
                        </Label>
                        {isDate(f.customFieldType) ? (
                          <>
                            {(() => {
                              const iso = toDateInputValue(value);
                              const selected = iso ? parse(iso, "yyyy-MM-dd", new Date()) : undefined;
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const isExpired = !!selected && selected < today;
                              return (
                                <>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      id={`cf-${name}`}
                                      type="button"
                                      variant="outline"
                                      disabled={f.isReadOnly}
                                      className={cn(
                                        "w-full justify-start rounded-full text-left font-normal",
                                        !selected && "text-muted-foreground",
                                        isExpired &&
                                          "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {selected ? format(selected, "dd/MM/yyyy", { locale: ptBR }) : "dd/mm/aaaa"}
                                      {isExpired && (
                                        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                                          Vencida
                                        </span>
                                      )}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      locale={ptBR}
                                      selected={selected}
                                      onSelect={(d) =>
                                        setField(name, d ? format(d, "yyyy-MM-dd") : "")
                                      }
                                      initialFocus
                                      className={cn("p-3 pointer-events-auto")}
                                    />
                                    {selected && !f.isReadOnly && (
                                      <div className="border-t p-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="w-full"
                                          onClick={() => setField(name, "")}
                                        >
                                          Limpar
                                        </Button>
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                                {isExpired && (
                                  <p className="text-xs font-medium text-destructive">
                                    Data vencida
                                  </p>
                                )}
                                </>
                              );
                            })()}
                            {errors[`cf-${name}`] && (
                              <p className="text-xs text-destructive">{errors[`cf-${name}`]}</p>
                            )}
                          </>
                        ) : (
                          <Input
                            id={`cf-${name}`}
                            value={toTextValue(value)}
                            onChange={(e) => setField(name, e.target.value)}
                            disabled={f.isReadOnly}
                            className="rounded-full"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {boolDefs.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {boolDefs.map((f) => {
                    const name = f.customFieldName;
                    const label = f.displayName || name;
                    const value = customFields[name] ?? "";
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <Switch
                          id={`cf-${name}`}
                          checked={isTruthy(value)}
                          onCheckedChange={(v) => setField(name, v ? "true" : "false")}
                          disabled={f.isReadOnly}
                        />
                        <Label htmlFor={`cf-${name}`} className="cursor-pointer text-sm font-normal">
                          {label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

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