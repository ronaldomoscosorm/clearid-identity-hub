import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IdentityPicturePanel } from "@/components/IdentityPicturePanel";
import { useT } from "@/lib/i18n";

interface Props {
  identityId: string;
  identityName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdentityPictureDialog({ identityId, identityName, open, onOpenChange }: Props) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("pictureDialog.title")}</DialogTitle>
          <DialogDescription>
            {identityName
              ? t("pictureDialog.identity", { value: identityName })
              : t("pictureDialog.identity", { value: identityId })}
          </DialogDescription>
        </DialogHeader>
        <IdentityPicturePanel identityId={identityId} />
      </DialogContent>
    </Dialog>
  );
}