import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { argusApi, ArgusApiError } from "@/lib/argus-client";
import type { CredentialUpsert } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

function toIsoOrNull(v: string): string | null {
  if (!v) return null;
  // input type=date returns yyyy-mm-dd
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface CredentialsDialogProps {
  identityId: string;
}

export function CredentialsDialog({ identityId }: CredentialsDialogProps) {
  const [open, setOpen] = useState(false);
  const [formatId, setFormatId] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [activation, setActivation] = useState("");
  const [expiration, setExpiration] = useState("");
  const qc = useQueryClient();

  const formatsQuery = useQuery({
    queryKey: ["credential-formats"],
    queryFn: () => argusApi.listCredentialFormats(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const credsQuery = useQuery({
    queryKey: ["credentials", identityId],
    queryFn: () => argusApi.listCredentials(identityId),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (data: CredentialUpsert) => argusApi.createCredential(data),
    onSuccess: () => {
      toast.success("Credencial cadastrada");
      qc.invalidateQueries({ queryKey: ["credentials", identityId] });
      setFormatId("");
      setFacilityCode("");
      setCardNumber("");
      setActivation("");
      setExpiration("");
    },
    onError: (e) => {
      const err = e as ArgusApiError;
      toast.error(err.message, {
        description: err.traceId ? `TraceId: ${err.traceId}` : undefined,
      });
    },
  });

  const canSubmit = !!formatId && !!cardNumber.trim() && !create.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate({
      identityId,
      formatId,
      facilityCode: facilityCode.trim() || null,
      cardNumber: cardNumber.trim(),
      activationDateUtc: toIsoOrNull(activation),
      expirationDateUtc: toIsoOrNull(expiration),
    });
  };

  const formatName = (id?: string | null) =>
    formatsQuery.data?.find((f) => f.formatId === id)?.name ?? id ?? "—";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <KeyRound className="mr-1 h-4 w-4" /> Credenciais
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Credenciais</DialogTitle>
          <DialogDescription>
            Cadastre e visualize as credenciais desta identidade.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cred-format">Tipo de credencial</Label>
            <Select value={formatId} onValueChange={setFormatId}>
              <SelectTrigger id="cred-format">
                <SelectValue
                  placeholder={
                    formatsQuery.isLoading ? "Carregando..." : "Selecione o tipo"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(formatsQuery.data ?? []).map((f) => (
                  <SelectItem key={f.formatId} value={f.formatId}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cred-facility">Facility code</Label>
            <Input
              id="cred-facility"
              value={facilityCode}
              onChange={(e) => setFacilityCode(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="cred-card">Card number</Label>
            <Input
              id="cred-card"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              inputMode="numeric"
              required
            />
          </div>
          <div>
            <Label htmlFor="cred-activation">Ativação</Label>
            <Input
              id="cred-activation"
              type="date"
              value={activation}
              onChange={(e) => setActivation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cred-expiration">Expiração</Label>
            <Input
              id="cred-expiration"
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        </form>

        <div className="mt-2">
          <h3 className="mb-2 text-sm font-semibold">Credenciais cadastradas</h3>
          {credsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : credsQuery.isError ? (
            <p className="text-sm text-destructive">
              {(credsQuery.error as Error).message}
            </p>
          ) : (credsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma credencial cadastrada.</p>
          ) : (
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Ativação</TableHead>
                    <TableHead>Expiração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(credsQuery.data ?? []).map((c, i) => (
                    <TableRow key={c.credentialId ?? i}>
                      <TableCell>{c.formatName ?? formatName(c.formatId)}</TableCell>
                      <TableCell>{c.facilityCode ?? "—"}</TableCell>
                      <TableCell>{c.cardNumber ?? "—"}</TableCell>
                      <TableCell>{fmtDate(c.activationDateUtc)}</TableCell>
                      <TableCell>{fmtDate(c.expirationDateUtc)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}