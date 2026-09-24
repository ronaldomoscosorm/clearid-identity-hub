import { useEffect, useRef, useState } from "react";
import { Camera, Upload, User, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { WebcamDialog } from "@/components/IdentityPicturePanel";

/**
 * Captura de foto (webcam / arquivo) que NÃO faz upload — guarda o blob
 * localmente e devolve por `onChange`. Usada em cadastros onde a foto só pode
 * ser enviada depois (ex.: nova identity, cujo id só existe após a criação).
 */
export function PhotoCapture({
  value,
  onChange,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const { t } = useT();
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const pick = (blob: Blob) => {
    if (!blob.type.startsWith("image/")) {
      toast.error(t("photoCapture.notImage"));
      return;
    }
    onChange(blob);
  };

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {preview ? (
          <img src={preview} alt={t("photoCapture.previewAlt")} className="h-full w-full object-cover" />
        ) : (
          <User className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("photoCapture.title")}</p>
        <p className="text-xs text-muted-foreground">
          {value ? t("photoCapture.ready") : t("photoCapture.optional")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setWebcamOpen(true)}>
            <Camera className="mr-1 h-4 w-4" /> {t("photoCapture.takePhoto")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> {t("photoCapture.uploadFile")}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-4 w-4" /> {t("common.remove")}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <WebcamDialog
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        uploading={false}
        onCapture={(blob) => {
          pick(blob);
          setWebcamOpen(false);
        }}
      />
    </div>
  );
}
