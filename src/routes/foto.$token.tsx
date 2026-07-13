import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { getPhotoInfo, submitPhoto, type PhotoUpdateInfo } from "@/lib/photo-public";
import { Button } from "@/components/ui/button";
import { PoweredBy } from "@/components/PoweredBy";

export const Route = createFileRoute("/foto/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Atualização de foto" }] }),
  component: PhotoUpdatePage,
});

const MAX_MB = 8;

type State =
  | { kind: "loading" }
  | { kind: "form"; info: PhotoUpdateInfo }
  | { kind: "sending"; info: PhotoUpdateInfo }
  | { kind: "success" }
  | { kind: "unavailable"; message: string };

function PhotoUpdatePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPhotoInfo(token).then((r) => {
      if (cancelled) return;
      if (r.ok) setState({ kind: "form", info: r.data });
      else setState({ kind: "unavailable", message: r.message });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Libera a URL de prévia quando troca/desmonta.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`A imagem deve ter no máximo ${MAX_MB} MB.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const send = async () => {
    if (!file || state.kind !== "form") return;
    const info = state.info;
    setState({ kind: "sending", info });
    const r = await submitPhoto(token, file);
    if (r.ok) {
      setState({ kind: "success" });
    } else if (r.status === 404 || r.status === 410) {
      setState({ kind: "unavailable", message: r.message });
    } else {
      setError(r.message);
      setState({ kind: "form", info });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Camera className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Atualização de foto</h1>
        </div>

        {state.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Validando o link…</p>
          </div>
        )}

        {(state.kind === "form" || state.kind === "sending") && (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <div>
              <p className="text-base font-medium text-foreground">Olá, {state.info.displayName}!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Envie ou tire uma nova foto para atualizar seu cadastro.
              </p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Prévia"
                className="mx-auto max-h-64 w-full rounded-md object-contain"
              />
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed py-10 text-muted-foreground hover:bg-muted"
                disabled={state.kind === "sending"}
              >
                <Upload className="h-6 w-6" />
                <span className="text-sm">Toque para escolher / tirar a foto</span>
              </button>
            )}

            {previewUrl && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => inputRef.current?.click()}
                disabled={state.kind === "sending"}
              >
                Trocar foto
              </Button>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="button"
              className="w-full"
              onClick={send}
              disabled={!file || state.kind === "sending"}
            >
              {state.kind === "sending" ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                "Enviar foto"
              )}
            </Button>
          </div>
        )}

        {state.kind === "success" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--success)]" />
            <p className="text-base font-medium text-foreground">Foto atualizada!</p>
            <p className="text-sm text-muted-foreground">
              Pronto — você já pode fechar esta página.
            </p>
          </div>
        )}

        {state.kind === "unavailable" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-base font-medium text-foreground">Link indisponível</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              Solicite um novo link ao administrador.
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}
