import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IdentityPicturePanel } from "@/components/IdentityPicturePanel";

interface Props {
  identityId: string;
  identityName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdentityPictureDialog({ identityId, identityName, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atualizar foto</DialogTitle>
          <DialogDescription>
            {identityName ? `Identidade: ${identityName}` : `Identidade: ${identityId}`}
          </DialogDescription>
        </DialogHeader>
        <IdentityPicturePanel identityId={identityId} />
      </DialogContent>
    </Dialog>
  );
}