import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageIcon, Loader2, Upload, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPhotoInfo, submitPhoto, type PhotoUpdateInfo } from "@/lib/photo-public";
import { Button } from "@/components/ui/button";
import { SilhouetteGuide, PersonBadge, usePersonDetection } from "@/components/CameraGuide";
import { PoweredBy } from "@/components/PoweredBy";
import { useApplyBranding, useBranding } from "@/lib/branding";
import { ensureTechnicalSession } from "@/lib/tech-auth";
import { hydrateSettings } from "@/lib/supabase-settings";

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
  useApplyBranding();
  const branding = useBranding();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const personDetected = usePersonDetection(videoRef, cameraOn);

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

  // Carrega o branding do site (logo/nome/cores) via usuário técnico do Supabase.
  useEffect(() => {
    ensureTechnicalSession()
      .then((ok) => (ok ? hydrateSettings() : undefined))
      .catch(() => {});
  }, []);

  // Libera a URL de prévia quando troca/desmonta.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Garante que a câmera seja liberada ao desmontar.
  useEffect(() => stopCamera, []);

  // Atribui o stream ao <video> depois que ele monta (cameraOn = true).
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    const tryPlay = () => video.play().catch(() => {});
    if (video.readyState >= 1) tryPlay();
    else video.onloadedmetadata = tryPlay;
    return () => {
      video.onloadedmetadata = null;
    };
  }, [cameraOn]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  const setImage = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

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
    setImage(f);
  };

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Câmera não disponível neste dispositivo/navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true); // o useEffect abaixo atribui o stream ao <video>
    } catch {
      setError("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setImage(new File([blob], "foto.jpg", { type: "image/jpeg" }));
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  }

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

  const expires =
    (state.kind === "form" || state.kind === "sending") && state.info.expiresUtc
      ? safeFormat(state.info.expiresUtc)
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Cabeçalho com a identidade do site */}
        <div className="flex flex-col items-center gap-2 text-center">
          {branding.clientLogo ? (
            <img
              src={branding.clientLogo}
              alt={branding.clientName || "Logo"}
              className="max-h-16 w-auto object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Camera className="h-6 w-6" />
            </div>
          )}
          {branding.clientName && (
            <p className="text-sm font-medium text-foreground">{branding.clientName}</p>
          )}
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
                {state.info.hasPhoto
                  ? "Envie ou tire uma nova foto para substituir a atual."
                  : "Envie ou tire uma foto para o seu cadastro."}
              </p>
              {expires && (
                <p className="mt-1 text-xs text-muted-foreground">Este link expira em {expires}.</p>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {cameraOn ? (
              <div className="space-y-3">
                <div className="relative mx-auto h-64 w-full overflow-hidden rounded-md bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  <SilhouetteGuide
                    state={personDetected === null ? "neutral" : personDetected ? "ok" : "warn"}
                  />
                  <PersonBadge detected={personDetected} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={capturePhoto}>
                    <Camera className="mr-1 h-4 w-4" /> Capturar
                  </Button>
                  <Button type="button" variant="outline" onClick={stopCamera}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Prévia"
                className="mx-auto max-h-64 w-full rounded-md object-contain"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-muted-foreground hover:bg-muted"
                  disabled={state.kind === "sending"}
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-sm">Tirar foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-muted-foreground hover:bg-muted"
                  disabled={state.kind === "sending"}
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">Enviar arquivo</span>
                </button>
              </div>
            )}

            {previewUrl && !cameraOn && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={startCamera}
                  disabled={state.kind === "sending"}
                >
                  <Camera className="mr-1 h-4 w-4" /> Tirar de novo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => inputRef.current?.click()}
                  disabled={state.kind === "sending"}
                >
                  <ImageIcon className="mr-1 h-4 w-4" /> Trocar arquivo
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="button"
              className="w-full"
              onClick={send}
              disabled={!file || cameraOn || state.kind === "sending"}
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

function safeFormat(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}
