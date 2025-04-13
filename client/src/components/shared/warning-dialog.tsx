import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface WarningDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function WarningDialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
}: WarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="text-orange-500 mb-2">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end space-x-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            キャンセル
          </Button>
          <Button
            variant="default"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={onConfirm}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
