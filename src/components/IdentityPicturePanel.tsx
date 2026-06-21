import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ClipboardPaste, RefreshCw, User, X } from "lucide-react";
import { toast } from "sonner";
import { argusApi, useDefaultSiteId } from "@/lib/argus-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  identityId: string;
}

async function toJpeg(blob: Blob, quality = 0.92): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao converter imagem"))),
      "image/jpeg",
      quality,
    );
  });
}

export function IdentityPicturePanel({ identityId }: Props) {
  const qc = useQueryClient();
  const siteId = useDefaultSiteId();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pasteBlob, setPasteBlob] = useState<Blob | null>(null);
  const [pasteUrl, setPasteUrl] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["identity-picture", siteId, identityId],
    queryFn: () => argusApi.getIdentityPicture(identityId),
    retry: false,
  });

  useEffect(() => {
    if (!q.data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);

  const upload = useMutation({
    mutationFn: (blob: Blob) => argusApi.uploadIdentityPicture(identityId, blob),
    onSuccess: () => {
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["identity-picture"] });
      setOpen(false);
      clearPaste();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearPaste = () => {
    setPasteBlob(null);
    setPasteUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleBlob = async (blob: Blob) => {
    if (!blob.type.startsWith("image/")) {
      toast.error("O conteúdo da área de transferência não é uma imagem.");
      return;
    }
    try {
      const jpeg = blob.type === "image/jpeg" ? blob : await toJpeg(blob);
      clearPaste();
      setPasteBlob(jpeg);
      setPasteUrl(URL.createObjectURL(jpeg));
    } catch (e) {
      toast.error("Não foi possível processar a imagem: " + (e as Error).message);
    }
  };

  const pasteFromClipboard = async () => {
    // navigator.clipboard.read() is blocked inside the Lovable preview iframe
    // (Permissions-Policy). Try it first, but fall back to instructing the user
    // to press Ctrl+V — the window 'paste' listener below will pick it up.
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) {
            const blob = await item.getType(type);
            await handleBlob(blob);
            return;
          }
        }
        toast.message("Nenhuma imagem encontrada. Copie uma imagem e tecle Ctrl+V.");
        return;
      }
      toast.message("Tecle Ctrl+V para colar a imagem.");
    } catch {
      toast.message("Tecle Ctrl+V para colar a imagem.");
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleBlob(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {url ? (
          <img src={url} alt="Foto" className="h-full w-full object-cover" />
        ) : (
          <User className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Foto biométrica</p>
        <p className="text-xs text-muted-foreground">
          {url ? "Foto cadastrada no ClearID." : "Nenhuma foto cadastrada."}
          {" "}
          Você também pode colar uma imagem com Ctrl+V.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Camera className="mr-1 h-4 w-4" /> Tirar foto
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={pasteFromClipboard}>
            <ClipboardPaste className="mr-1 h-4 w-4" /> Colar imagem
          </Button>
        </div>
      </div>

      <WebcamDialog
        open={open}
        onOpenChange={setOpen}
        onCapture={(blob) => upload.mutate(blob)}
        uploading={upload.isPending}
      />

      <AlertDialog
        open={!!pasteBlob}
        onOpenChange={(o) => {
          if (upload.isPending) return;
          if (!o) clearPaste();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar esta imagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A imagem da área de transferência substituirá a foto atual da identidade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pasteUrl && (
            <div className="overflow-hidden rounded-md border bg-muted">
              <img src={pasteUrl} alt="Pré-visualização" className="mx-auto max-h-64 object-contain" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={upload.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={upload.isPending || !pasteBlob}
              onClick={(e) => {
                e.preventDefault();
                if (pasteBlob) upload.mutate(pasteBlob);
              }}
            >
              {upload.isPending ? "Enviando..." : "Sim, gravar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WebcamDialog({
  open,
  onOpenChange,
  onCapture,
  uploading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCapture: (blob: Blob) => void;
  uploading: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);
    setSnapshot(null);
    setSnapshotBlob(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((e: Error) => setErr(e.message));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSnapshotBlob(blob);
        setSnapshot(URL.createObjectURL(blob));
        setConfirmOpen(true);
      },
      "image/jpeg",
      0.92,
    );
  };

  const retake = () => {
    if (snapshot) URL.revokeObjectURL(snapshot);
    setSnapshot(null);
    setSnapshotBlob(null);
    setConfirmOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Capturar foto</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-black">
          {err ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
              {err}
            </div>
          ) : snapshot ? (
            <img src={snapshot} alt="Captura" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          {snapshot ? (
            <Button type="button" variant="outline" onClick={retake} disabled={uploading}>
              <RefreshCw className="mr-1 h-4 w-4" /> Repetir
            </Button>
          ) : (
            <Button type="button" onClick={capture} disabled={!!err}>
              <Camera className="mr-1 h-4 w-4" /> Capturar
            </Button>
          )}
        </DialogFooter>

        <AlertDialog
          open={confirmOpen}
          onOpenChange={(o) => {
            if (uploading) return;
            setConfirmOpen(o);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gravar esta foto?</AlertDialogTitle>
              <AlertDialogDescription>
                A foto capturada será enviada e substituirá a foto atual da identidade. Deseja
                continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={uploading} onClick={() => retake()}>
                Não, repetir
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={uploading || !snapshotBlob}
                onClick={(e) => {
                  e.preventDefault();
                  if (snapshotBlob) onCapture(snapshotBlob);
                }}
              >
                {uploading ? "Enviando..." : "Sim, gravar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}