import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  X,
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
  History,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAttachmentVersions, signedUrlFor, type AttachmentVersion } from "@/lib/attachments";

const DEFAULT_ACCEPT = "image/*,application/pdf";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Abre o arquivo (URL assinada temporária) em nova aba, para baixar/visualizar. */
async function openAttachment(path: string, onError: (msg: string) => void) {
  try {
    const url = await signedUrlFor(path);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    onError((e as Error).message);
  }
}

/** Miniatura da imagem da versão atual (resolve URL assinada sob demanda). */
function CurrentThumb({ version }: { version: AttachmentVersion }) {
  const { data: url } = useQuery({
    queryKey: ["attachment-thumb", version.id],
    queryFn: () => signedUrlFor(version.storage_path),
    enabled: isImage(version.mime_type),
    staleTime: 4 * 60 * 1000,
  });
  if (!isImage(version.mime_type)) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {url ? (
        <img src={url} alt={version.file_name} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}

export type AttachmentFieldProps = {
  siteFieldId: string;
  /** identities.id (uuid) — nulo no cadastro novo (ainda não existe). */
  identityDbId: string | null;
  label: string;
  required?: boolean;
  disabled?: boolean;
  /** Restrição de MIME (ex.: "image/*"). Padrão: imagem + PDF. */
  accept?: string | null;
  /** Arquivo preparado para envio (enviado ao salvar o formulário). */
  staged: File | null;
  onStage: (file: File | null) => void;
  error?: string;
};

export function AttachmentField({
  siteFieldId,
  identityDbId,
  label,
  required,
  disabled,
  accept,
  staged,
  onStage,
  error,
}: AttachmentFieldProps) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  const versionsQuery = useAttachmentVersions(identityDbId, siteFieldId);
  const versions = versionsQuery.data ?? [];
  const current = versions.find((v) => v.is_current) ?? null;
  const history = versions.filter((v) => !v.is_current);

  const onError = (msg: string) => toast.error(msg);

  const pick = (f: File | null) => {
    if (!f) return;
    onStage(f);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {disabled && (
          <span className="ml-1 text-muted-foreground">{t("identityForm.readOnly")}</span>
        )}
      </Label>

      <div className={cn("rounded-md border p-3", error && "border-destructive")}>
        {/* Versão atual */}
        {versionsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
          </div>
        ) : current ? (
          <div className="flex items-center gap-3">
            <CurrentThumb version={current} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {t("attachment.versionLabel", { n: current.version })} ·{" "}
                {formatBytes(current.size_bytes)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openAttachment(current.storage_path, onError)}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> {t("attachment.download")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" /> {t("attachment.none")}
          </div>
        )}

        {/* Arquivo preparado para envio */}
        {staged && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs">
            <Upload className="h-3.5 w-3.5 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium">{staged.name}</span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(staged.size)}</span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onStage(null)}
              aria-label={t("common.remove")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Ações */}
        {!disabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {current || staged ? t("attachment.replace") : t("attachment.upload")}
            </Button>
            {history.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="mr-1 h-3.5 w-3.5" />
                {t("attachment.history", { n: history.length })}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={accept || DEFAULT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Histórico de versões */}
        {showHistory && history.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3">
            {history.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-xs">
                {isImage(v.mime_type) ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="shrink-0 text-muted-foreground">
                  {t("attachment.versionLabel", { n: v.version })}
                </span>
                <span className="min-w-0 flex-1 truncate">{v.file_name}</span>
                <button
                  type="button"
                  className="shrink-0 text-primary hover:underline"
                  onClick={() => openAttachment(v.storage_path, onError)}
                >
                  {t("attachment.download")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
