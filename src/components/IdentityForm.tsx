import { useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useIdentityFieldLabels } from "@/lib/identity-labels";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { typeOf as siteFieldKind, pickLang, optionsOf, isTruthy as cfTruthy } from "@/lib/custom-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { SiteFieldValue } from "@/lib/supabase-mirror";

type TFunc = (k: string, vars?: Record<string, string | number>) => string;

const makeBaseSchema = (t: TFunc) =>
  z.object({
    externalId: z.string().trim().max(120).optional().default(""),
    firstName: z.string().trim().min(1, t("identityForm.validation.required")).max(100),
    lastName: z.string().trim().min(1, t("identityForm.validation.required")).max(100),
    email: z.string().trim().email(t("identityForm.validation.invalidEmail")).max(255),
    status: z.enum(["Active", "Inactive"]),
  });

// Campos adicionais do modelo ClearID, além dos fixos (nome/sobrenome/email/
// site/tipo). Cada um é controlável por apelido (visibilidade + rótulo).
type ExtraField = {
  key: string; // field_key (apelido) e chave do estado
  label: string; // rótulo padrão
  section: "ident" | "personal" | "company";
  target: "top" | "private" | "company"; // onde entra no payload
  argusKey: string; // chave enviada ao Argus
  type?: "text" | "email" | "date";
};

const EXTRA_FIELDS: ExtraField[] = [
  // Identificação (top-level)
  { key: "middle_name", label: "Nome do meio", section: "ident", target: "top", argusKey: "middleName" },
  { key: "description", label: "Descrição", section: "ident", target: "top", argusKey: "description" },
  { key: "country_code", label: "País", section: "ident", target: "top", argusKey: "countryCode" },
  { key: "culture", label: "Idioma/Cultura", section: "ident", target: "top", argusKey: "culture" },
  // Dados pessoais (privateData)
  { key: "private_birthday", label: "Data de nascimento", section: "personal", target: "private", argusKey: "birthday", type: "date" },
  { key: "private_employee_number", label: "Matrícula", section: "personal", target: "private", argusKey: "employeeNumber" },
  { key: "private_secondary_email", label: "E-mail secundário", section: "personal", target: "private", argusKey: "secondaryEmail", type: "email" },
  { key: "private_city_of_residence", label: "Cidade", section: "personal", target: "private", argusKey: "cityOfResidence" },
  { key: "private_state_of_residence", label: "Estado", section: "personal", target: "private", argusKey: "stateOfResidence" },
  { key: "private_zip_code", label: "CEP", section: "personal", target: "private", argusKey: "zipCode" },
  { key: "private_phone_primary", label: "Telefone principal", section: "personal", target: "private", argusKey: "phoneNumberPrimary" },
  { key: "private_phone_secondary", label: "Telefone secundário", section: "personal", target: "private", argusKey: "phoneNumberSecondary" },
  // Vínculo corporativo (companyData)
  { key: "company_name", label: "Empresa", section: "company", target: "company", argusKey: "companyName" },
  { key: "company_job_title", label: "Cargo", section: "company", target: "company", argusKey: "jobTitle" },
  { key: "company_department_name", label: "Departamento", section: "company", target: "company", argusKey: "departmentName" },
  { key: "company_supervisor_name", label: "Supervisor", section: "company", target: "company", argusKey: "supervisorName" },
];

export type IdentityFormProps = {
  initial?: Partial<IdentityUpsert>;
  mode: "create" | "edit";
  submitting?: boolean;
  onSubmit: (
    data: IdentityUpsert,
    siteFieldValues: SiteFieldValue[],
    companyId: string | null,
    workerTypeId: string | null,
  ) => void;
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
  const { t } = useT();
  const [externalId, setExternalId] = useState(initial?.externalId ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [status, setStatus] = useState<"Active" | "Inactive">(initial?.status ?? "Active");
  const [workerTypeId, setWorkerTypeId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
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
  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const priv = (initial?.privateData ?? {}) as Record<string, unknown>;
    const comp = (initial?.companyData ?? {}) as Record<string, unknown>;
    const top = (initial ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const f of EXTRA_FIELDS) {
      const src = f.target === "private" ? priv : f.target === "company" ? comp : top;
      const v = src[f.argusKey];
      out[f.key] = v == null ? "" : String(v);
    }
    return out;
  });
  const setExtraField = (key: string, value: string) =>
    setExtra((prev) => ({ ...prev, [key]: value }));
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
  const { alias, isVisible } = useIdentityFieldLabels();

  // Tipos de trabalhador (Supabase) → mapeados para o workerTypeCode do Argus.
  const workerTypesQuery = useQuery({
    queryKey: ["worker-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_types")
        .select("*")
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const workerTypes = workerTypesQuery.data ?? [];

  // Na edição, pré-seleciona o tipo cujo código Argus bate com o inicial.
  useEffect(() => {
    if (workerTypeId || !initial?.workerTypeCode || !workerTypes.length) return;
    const match = workerTypes.find((w) => w.argus_worker_type_code === initial.workerTypeCode);
    if (match) setWorkerTypeId(match.id);
  }, [workerTypes, initial?.workerTypeCode, workerTypeId]);

  // Campos personalizados do site para o tipo de trabalhador selecionado.
  type SiteFieldLite = {
    id: string;
    is_required: boolean;
    fillable: boolean;
    value_range: Json | null;
    display_name_override: Json | null;
    definition: { custom_field_name: string; custom_field_type: string | null } | null;
  };
  const siteFieldsQuery = useQuery({
    queryKey: ["identity-site-fields", siteId, workerTypeId],
    queryFn: async (): Promise<SiteFieldLite[]> => {
      const { data, error } = await supabase
        .from("site_custom_fields")
        .select(
          "id, is_required, fillable, value_range, display_name_override, definition:custom_field_definitions(custom_field_name, custom_field_type)",
        )
        .eq("site_id", siteId)
        .eq("entity_type", "identity")
        .eq("worker_type_id", workerTypeId)
        .eq("is_active", true)
        .order("display_index", { ascending: true, nullsFirst: false })
        .returns<SiteFieldLite[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(siteId && workerTypeId),
  });
  const siteFields = siteFieldsQuery.data ?? [];
  // Havendo campos do site para o tipo, exibe apenas os obrigatórios + esses.
  const hasSiteFields = siteFields.length > 0;
  const siteFieldLabel = (sf: SiteFieldLite) =>
    pickLang(sf.display_name_override) || sf.definition?.custom_field_name || t("identityForm.fieldFallback");

  // Empresas do site (para vincular a identidade e herdar valores).
  const companiesQuery = useQuery({
    queryKey: ["companies", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("site_id", siteId)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: Boolean(siteId),
  });
  const companies = companiesQuery.data ?? [];

  // Na edição, carrega a empresa já vinculada (Supabase).
  const initialIdentityId = (initial as { identityId?: string } | undefined)?.identityId;
  useEffect(() => {
    if (!initialIdentityId) return;
    let cancelled = false;
    void supabase
      .from("identities")
      .select("company_id, worker_type_id")
      .eq("identity_id", initialIdentityId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.company_id) setCompanyId(data.company_id);
        // Tipo do trabalhador exato vindo do Supabase tem prioridade sobre o
        // reverse-lookup ambíguo do workerTypeCode do Argus.
        const wt = (data as { worker_type_id?: string | null }).worker_type_id;
        if (wt) setWorkerTypeId(wt);
      });
    return () => {
      cancelled = true;
    };
  }, [initialIdentityId]);

  // Valores dos campos relacionados, vindos da empresa selecionada.
  const companyRelatedQuery = useQuery({
    queryKey: ["company-related-values", companyId],
    queryFn: async (): Promise<{ rel: string; value: string }[]> => {
      const { data, error } = await supabase
        .from("company_custom_fields")
        .select("value, site_custom_field:site_custom_fields(related_identity_field_id)")
        .eq("company_id", companyId)
        .returns<
          { value: string | null; site_custom_field: { related_identity_field_id: string | null } | null }[]
        >();
      if (error) throw new Error(error.message);
      const out: { rel: string; value: string }[] = [];
      for (const r of data ?? []) {
        const rel = r.site_custom_field?.related_identity_field_id;
        if (rel) out.push({ rel, value: r.value ?? "" });
      }
      return out;
    },
    enabled: Boolean(companyId),
  });

  // Preenche os campos de identidade relacionados com o valor da empresa.
  useEffect(() => {
    const rows = companyRelatedQuery.data;
    if (!rows?.length || !siteFields.length) return;
    const nameById = new Map(
      siteFields.filter((sf) => sf.definition).map((sf) => [sf.id, sf.definition!.custom_field_name]),
    );
    setCustomFields((prev) => {
      const next = { ...prev };
      for (const { rel, value } of rows) {
        const name = nameById.get(rel);
        if (name) next[name] = value;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyRelatedQuery.data, siteFieldsQuery.data]);

  // Seções dos campos personalizados (ClearID) → agrupa os campos do site.
  const sectionsQuery = useQuery({
    queryKey: ["custom-field-sections"],
    queryFn: () => argusApi.listCustomFieldSections(),
    staleTime: 5 * 60 * 1000,
  });
  const sectionByField = new Map<string, { display: string; sIdx: number; fIdx: number }>();
  for (const sec of sectionsQuery.data ?? []) {
    for (const f of sec.fields) {
      sectionByField.set(f.name, {
        display: sec.displayName || sec.sectionName,
        sIdx: sec.index,
        fIdx: f.index,
      });
    }
  }
  const OUTROS = t("identityForm.otherSection");
  const groupedSiteFields = (() => {
    const groups = new Map<string, { display: string; sIdx: number; items: { sf: SiteFieldLite; fIdx: number }[] }>();
    for (const sf of siteFields) {
      const name = sf.definition?.custom_field_name ?? "";
      const info = sectionByField.get(name);
      const key = info?.display ?? OUTROS;
      const sIdx = info?.sIdx ?? 999;
      if (!groups.has(key)) groups.set(key, { display: key, sIdx, items: [] });
      groups.get(key)!.items.push({ sf, fIdx: info?.fIdx ?? 0 });
    }
    const arr = [...groups.values()].sort((a, b) => a.sIdx - b.sIdx);
    for (const g of arr) g.items.sort((a, b) => a.fIdx - b.fIdx);
    return arr;
  })();

  const renderSiteField = (sf: SiteFieldLite) => {
    const name = sf.definition?.custom_field_name ?? sf.id;
    const kind = siteFieldKind(sf.definition?.custom_field_type);
    const value = customFields[name] ?? "";
    const err = errors[`sf-${sf.id}`];
    const disabled = !sf.fillable; // não preenchível → somente leitura
    return (
      <div key={sf.id} className="space-y-1.5">
        <Label htmlFor={`sf-${sf.id}`} className="text-xs text-muted-foreground">
          {siteFieldLabel(sf)}
          {sf.is_required && <span className="ml-0.5 text-destructive">*</span>}
          {disabled && <span className="ml-1 text-muted-foreground">{t("identityForm.readOnly")}</span>}
        </Label>
        {kind === "boolean" ? (
          <div className="flex h-9 items-center">
            <Checkbox
              id={`sf-${sf.id}`}
              checked={cfTruthy(value)}
              onCheckedChange={(c) => setField(name, c ? "true" : "false")}
              disabled={disabled}
            />
          </div>
        ) : kind === "list" ? (
          <Select value={value} onValueChange={(v) => setField(name, v)} disabled={disabled}>
            <SelectTrigger id={`sf-${sf.id}`} className={cn(err && "border-destructive")}>
              <SelectValue placeholder={t("identityForm.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {optionsOf(sf.value_range).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`sf-${sf.id}`}
            type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => setField(name, e.target.value)}
            className={cn(err && "border-destructive")}
            disabled={disabled}
          />
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

  const renderExtraFields = (section: ExtraField["section"]) =>
    EXTRA_FIELDS.filter((f) => f.section === section && isVisible(f.key)).map((f) => (
      <div key={f.key} className="space-y-2">
        <Label htmlFor={`x-${f.key}`}>{alias(f.key, t(`identityForm.extra.${f.key}`))}</Label>
        <Input
          id={`x-${f.key}`}
          type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
          value={extra[f.key] ?? ""}
          onChange={(e) => setExtraField(f.key, e.target.value)}
        />
      </div>
    ));
  const hasSection = (section: ExtraField["section"]) =>
    EXTRA_FIELDS.some((f) => f.section === section && isVisible(f.key));

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
    const parsed = makeBaseSchema(t).safeParse({ externalId, firstName, lastName, email, status });
    const out: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) out[i.path[0] as string] = i.message;
    }
    // O dropdown (workerTypeId) é a fonte da verdade; o código Argus é derivado
    // dele no submit (evita ficar dessincronizado do estado ao carregar).
    const effectiveWorkerTypeCode =
      workerTypes.find((w) => w.id === workerTypeId)?.argus_worker_type_code ?? "";
    if (!workerTypeId) {
      out.workerTypeCode = t("identityForm.validation.selectWorkerType");
    } else if (!effectiveWorkerTypeCode) {
      out.workerTypeCode = t("identityForm.validation.workerTypeUnmapped");
    }
    if (!siteId) {
      out.siteId = t("identityForm.validation.selectSite");
    }
    for (const sf of siteFields) {
      if (
        sf.is_required &&
        sf.fillable &&
        sf.definition &&
        isBlank(customFields[sf.definition.custom_field_name])
      ) {
        out[`sf-${sf.id}`] = t("identityForm.validation.requiredField");
      }
    }
    if (Object.keys(out).length) {
      setErrors(out);
      return;
    }
    const parsedData = parsed.success ? parsed.data : null;
    if (!parsedData) return;
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
          cfErrors[`cf-${key}`] = t("identityForm.validation.invalidDate");
          continue;
        }
        cf[key] = iso;
      } else {
        const val = (v ?? "").trim();
        if (!val) {
          // Não envia string vazia (ClearID rejeita "" em tipos Date/Numeric/
          // Boolean). Na edição preserva o clear apenas para campos já Vylor.
          continue;
        }
        // Campo de data do site (input nativo → ISO): normaliza para yyyy-MM-dd.
        cf[key] = /^\d{4}-\d{2}-\d{2}/.test(val) ? val.slice(0, 10) : val;
      }
    }
    if (Object.keys(cfErrors).length) {
      setErrors(cfErrors);
      return;
    }
    setErrors({});
    const siteFieldValues: SiteFieldValue[] = siteFields
      .filter((sf) => sf.definition)
      .map((sf) => ({
        site_custom_field_id: sf.id,
        value: cf[sf.definition!.custom_field_name] ? cf[sf.definition!.custom_field_name] : null,
      }));

    // Monta os campos adicionais (top-level, privateData, companyData),
    // preservando o que veio do initial (edit) e sobrescrevendo com o form.
    const topExtra: Record<string, unknown> = {};
    const privExtra: Record<string, unknown> = { ...((initial?.privateData ?? {}) as object) };
    const compExtra: Record<string, unknown> = { ...((initial?.companyData ?? {}) as object) };
    for (const f of EXTRA_FIELDS) {
      const val = (extra[f.key] ?? "").trim();
      const bag = f.target === "private" ? privExtra : f.target === "company" ? compExtra : topExtra;
      if (val) bag[f.argusKey] = val;
      else if (f.argusKey in bag) bag[f.argusKey] = null; // limpa valor existente (edição)
    }

    const payload: Record<string, unknown> = {
      ...parsedData,
      ...topExtra,
      displayName: displayName.trim() || `${firstName} ${lastName}`.trim() || undefined,
      privateData: Object.keys(privExtra).length ? privExtra : undefined,
      companyData: Object.keys(compExtra).length ? compExtra : undefined,
      customFields: cf,
      siteId: siteId || undefined,
      workerTypeCode: effectiveWorkerTypeCode || undefined,
    };
    onSubmit(payload as unknown as IdentityUpsert, siteFieldValues, companyId || null, workerTypeId || null);
  };

  const dateDefs = defs.filter((f) => isDate(f.customFieldType));
  const boolDefs = defs.filter((f) => isBool(f.customFieldType));
  const textDefs = defs.filter(
    (f) => !isDate(f.customFieldType) && !isBool(f.customFieldType),
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Tipo do trabalhador — primeira linha, isolado. Condiciona os campos
          do site e customizáveis exibidos abaixo. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {alias("company_worker_type_code", t("identityForm.workerType"))}
            <span className="ml-0.5 text-destructive">*</span>
          </CardTitle>
          {statusBadge}
        </CardHeader>
        <CardContent>
          <div className="space-y-2 sm:max-w-sm">
            <Select
              value={workerTypeId}
              onValueChange={(id) => setWorkerTypeId(id)}
            >
              <SelectTrigger className={cn(errors.workerTypeCode && "border-destructive")}>
                <SelectValue placeholder={t("identityForm.selectWorkerTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {workerTypes.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.workerTypeCode && (
              <p className="text-xs text-destructive">{errors.workerTypeCode}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("identityForm.identification")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Obrigatórios — sempre exibidos (apelido apenas renomeia). */}
          <div className="space-y-2">
            <Label htmlFor="firstName">
              {alias("first_name", t("common.name"))}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">
              {alias("last_name", t("identityForm.lastName"))}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="displayName">{alias("display_name", t("identityForm.displayName"))}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("identityForm.displayNamePlaceholder")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">
              {alias("email", t("common.email"))}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>
              {alias("company_site_id", t("identityForm.site"))}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className={cn(errors.siteId && "border-destructive")}>
                <SelectValue placeholder={sitesQuery.isLoading ? t("common.loading") : t("identityForm.selectSitePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.siteId && <p className="text-xs text-destructive">{errors.siteId}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t("identityForm.company")}</Label>
            <Select
              value={companyId || "__NONE__"}
              onValueChange={(v) => setCompanyId(v === "__NONE__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("identityForm.none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__">{t("identityForm.none")}</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!hasSiteFields && renderExtraFields("ident")}
        </CardContent>
      </Card>

      {!hasSiteFields && hasSection("personal") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("identityForm.personalData")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {renderExtraFields("personal")}
          </CardContent>
        </Card>
      )}

      {!hasSiteFields && hasSection("company") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("identityForm.corporateLink")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {renderExtraFields("company")}
          </CardContent>
        </Card>
      )}

      {workerTypeId && siteFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("identityForm.siteCustomFields")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {groupedSiteFields.map((g) => (
              <div key={g.display} className="space-y-3">
                <p className="border-b pb-1 text-sm font-medium text-foreground">{g.display}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {g.items.map(({ sf }) => renderSiteField(sf))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {showCustomFields && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("identityForm.customAttributes")}</CardTitle>
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
              {t("identityForm.noCustomFields")}
            </p>
          ) : (
            <div className="space-y-6">
              {(dateDefs.length > 0 || textDefs.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[...dateDefs, ...textDefs].map((f) => {
                    const name = f.customFieldName;
                    const label = alias(name, f.displayName || name);
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
                                      {selected ? format(selected, "dd/MM/yyyy", { locale: ptBR }) : t("identityForm.datePlaceholder")}
                                      {isExpired && (
                                        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                                          {t("identityForm.expiredBadge")}
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
                                          {t("identityForm.clear")}
                                        </Button>
                                      </div>
                                    )}
                                  </PopoverContent>
                                </Popover>
                                {isExpired && (
                                  <p className="text-xs font-medium text-destructive">
                                    {t("identityForm.expiredDate")}
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
                    const label = alias(name, f.displayName || name);
                    const value = customFields[name] ?? "";
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <Checkbox
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
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? t("common.saving") : mode === "create" ? t("identityForm.create") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}