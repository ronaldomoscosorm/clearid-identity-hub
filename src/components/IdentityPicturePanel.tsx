import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, RefreshCw, User, X } from "lucide-react";
import { toast } from "sonner";
import { argusApi } from "@/lib/argus-client";
import { useArgusEnv } from "@/lib/argus-env";
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

export function IdentityPicturePanel({ identityId }: Props) {
  const { env } = useArgusEnv();
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["identity-picture", env, identityId],
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
      qc.invalidateQueries({ queryKey: ["identity-picture", env, identityId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Camera className="mr-1 h-4 w-4" /> Tirar foto
          </Button>
        </div>
      </div>

      <WebcamDialog
        open={open}
        onOpenChange={setOpen}
        onCapture={(blob) => upload.mutate(blob)}
        uploading={upload.isPending}
      />
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