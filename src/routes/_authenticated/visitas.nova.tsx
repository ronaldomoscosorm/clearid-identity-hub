import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError, useDefaultSiteId } from "@/lib/argus-client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/visitas/nova")({
  head: () => ({ meta: [{ title: "Nova visita — Argus ClearID" }] }),
  component: NovaVisitaPage,
});

type Picked = { identityId: string; label: string };
type VisitorRow = { firstName: string; lastName: string; email: string };

/** datetime-local (hora local) → ISO UTC exigido pela API. */
function toUtcIso(local: string): string {
  return new Date(local).toISOString();
}

function NovaVisitaPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const defaultSite = useDefaultSiteId();

  // "now" = Fluxo A (cria + check-in); "schedule" = Fluxo B (só agenda).
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [siteId, setSiteId] = useState<string>(defaultSite ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [requester, setRequester] = useState<Picked | null>(null);
  const [hosts, setHosts] = useState<Picked[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([
    { firstName: "", lastName: "", email: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => argusApi.listSites(),
    staleTime: 5 * 60 * 1000,
  });

  // O perfil do site define os motivos aceitos: o ClearID rejeita (400) qualquer
  // motivo fora de `visitReasons`.
  const profilesQuery = useQuery({
    queryKey: ["visit-profiles"],
    queryFn: () => argusApi.listVisitProfiles(),
    staleTime: 5 * 60 * 1000,
  });
  const profile =
    (profilesQuery.data ?? []).find((p) => p.siteId === siteId && p.isDefault) ??
    (profilesQuery.data ?? []).find((p) => p.siteId === siteId);
  const reasons = profile?.plannedVisitSettings?.visitReasons ?? [];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("visits.validation.required");
    if (!reason.trim()) e.reason = t("visits.validation.required");
    if (!siteId) e.siteId = t("visits.validation.required");
    if (!start) e.start = t("visits.validation.required");
    if (!end) e.end = t("visits.validation.required");
    if (start && end && new Date(end) <= new Date(start)) e.end = t("visits.validation.endAfterStart");
    if (!requester) e.requester = t("visits.validation.required");
    if (hosts.length === 0) e.hosts = t("visits.validation.atLeastOneHost");
    if (!visitors.some((v) => v.firstName.trim())) e.visitors = t("visits.validation.atLeastOneVisitor");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const create = useMutation({
    mutationFn: async () => {
      const visit = await argusApi.createVisit({
        visitEventName: name.trim(),
        startDateTimeUtc: toUtcIso(start),
        endDateTimeUtc: toUtcIso(end),
        reason: reason.trim(),
        siteId,
        requesterId: requester!.identityId,
        visitProfileId: profile?.visitProfileId ?? null,
        hosts: hosts.map((h) => ({ identityId: h.identityId })),
        visitors: visitors
          .filter((v) => v.firstName.trim())
          .map((v) => ({
            firstName: v.firstName.trim(),
            lastName: v.lastName.trim() || null,
            email: v.email.trim() || null,
          })),
      });

      if (mode === "schedule") return { visit, checkedIn: 0 };

      // Fluxo A: busca os visitorId gerados e faz o check-in em lote.
      const vs = await argusApi.listVisitVisitors(visit.visitEventId);
      const ids = vs.map((v) => v.visitorId).filter(Boolean);
      if (ids.length) await argusApi.checkInVisitors(visit.visitEventId, ids);
      return { visit, checkedIn: ids.length };
    },
    onSuccess: ({ checkedIn }) => {
      toast.success(
        mode === "schedule"
          ? t("visits.createdScheduled")
          : t("visits.createdCheckedIn", { n: checkedIn }),
        { description: mode === "now" ? t("visits.credentialHint") : undefined, duration: 8000 },
      );
      navigate({ to: "/visitas" });
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      // Watchlist / aprovação pendente / validação vêm aqui.
      toast.error(err.message, {
        description: err.traceId ? `TraceId: ${err.traceId}` : undefined,
        duration: 12000,
      });
    },
  });

  const submit = () => {
    if (!validate()) return;
    create.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/visitas">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("visits.back")}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("visits.newVisit")}
        </h1>
      </div>

      {/* Seletor de modo (Fluxo A x Fluxo B) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("visits.mode")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={cn(
              "flex-1 rounded-md border p-3 text-left text-sm",
              mode === "now" ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "hover:bg-muted",
            )}
          >
            <p className="font-medium text-foreground">{t("visits.modeNow")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("visits.modeNowHint")}</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={cn(
              "flex-1 rounded-md border p-3 text-left text-sm",
              mode === "schedule"
                ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                : "hover:bg-muted",
            )}
          >
            <p className="font-medium text-foreground">{t("visits.modeSchedule")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("visits.modeScheduleHint")}</p>
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("visits.details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("visits.name")} error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("visits.reason")} error={errors.reason}>
            {reasons.length > 0 ? (
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder={t("visits.selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // Perfil sem motivos configurados: cai para texto livre.
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <Field label={t("visits.site")} error={errors.siteId}>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder={t("visits.selectSite")} />
              </SelectTrigger>
              <SelectContent>
                {(sitesQuery.data ?? []).map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>
                    {s.name ?? s.siteId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div />
          <Field label={t("visits.start")} error={errors.start}>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t("visits.end")} error={errors.end}>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("visits.people")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t("visits.requester")} error={errors.requester}>
            {requester ? (
              <Chip label={requester.label} onRemove={() => setRequester(null)} />
            ) : (
              <IdentityPicker onPick={(p) => setRequester(p)} />
            )}
          </Field>

          <Field label={t("visits.hosts")} error={errors.hosts}>
            <div className="space-y-2">
              {hosts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {hosts.map((h) => (
                    <Chip
                      key={h.identityId}
                      label={h.label}
                      onRemove={() => setHosts((prev) => prev.filter((x) => x.identityId !== h.identityId))}
                    />
                  ))}
                </div>
              )}
              <IdentityPicker
                onPick={(p) =>
                  setHosts((prev) =>
                    prev.some((x) => x.identityId === p.identityId) ? prev : [...prev, p],
                  )
                }
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("visits.visitors")}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisitors((p) => [...p, { firstName: "", lastName: "", email: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> {t("visits.addVisitor")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {visitors.map((v, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
              <Input
                placeholder={t("visits.firstName")}
                value={v.firstName}
                onChange={(e) =>
                  setVisitors((p) => p.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)))
                }
              />
              <Input
                placeholder={t("visits.lastName")}
                value={v.lastName}
                onChange={(e) =>
                  setVisitors((p) => p.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)))
                }
              />
              <Input
                type="email"
                placeholder={t("common.email")}
                value={v.email}
                onChange={(e) =>
                  setVisitors((p) => p.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                disabled={visitors.length === 1}
                onClick={() => setVisitors((p) => p.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {errors.visitors && <p className="text-xs text-destructive">{errors.visitors}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/visitas" })}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {mode === "now" ? t("visits.createAndCheckIn") : t("visits.schedule")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1">
      {label}
      <button type="button" onClick={onRemove} className="ml-1">
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

/** Busca identidades e devolve a escolhida (para requester/host). */
function IdentityPicker({ onPick }: { onPick: (p: Picked) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");

  const query = useQuery({
    queryKey: ["identity-picker", applied],
    queryFn: () => argusApi.listIdentities({ query: applied, take: 10 }),
    enabled: applied.length > 0,
    retry: false,
  });

  const results = query.data?.items ?? [];

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setApplied(q.trim());
            }
          }}
          placeholder={t("visits.searchIdentity")}
        />
        <Button type="button" variant="outline" size="icon" onClick={() => setApplied(q.trim())}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {applied && (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {query.isFetching ? (
            <p className="p-2 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : results.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">{t("visits.noIdentityFound")}</p>
          ) : (
            results.map((i) => {
              const label = `${i.firstName} ${i.lastName}`.trim();
              return (
                <button
                  key={i.identityId}
                  type="button"
                  onClick={() => {
                    onPick({ identityId: i.identityId, label });
                    setQ("");
                    setApplied("");
                  }}
                  className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted"
                >
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground">{i.email ?? ""}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
