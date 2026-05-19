import { useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
  clientName: string;
  onDeleted?: () => void;
}

export function DeleteClientDialog({ open, onOpenChange, clientId, clientName, onDeleted }: DeleteClientDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/clients/${clientId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setConfirmText("");
      setErrorMessage(null);
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? "Failed to delete client");
    },
  });

  const canDelete = confirmText.trim() === "DELETE";

  const handleClose = (next: boolean) => {
    if (!deleteMut.isPending) {
      setConfirmText("");
      setErrorMessage(null);
      onOpenChange(next);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent data-testid="dialog-delete-client">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Delete {clientName}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This will permanently delete <span className="font-semibold">{clientName}</span> and all associated data:
              </p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                <li>All saved reports (bi-weekly, monthly, QBR, etc.)</li>
                <li>Report schedules</li>
                <li>Competitors</li>
                <li>Comments, eval batches, mid-strategy decks</li>
                <li>Gap analyses, finding history, query logs</li>
                <li>AMA conversations</li>
              </ul>
              <p className="font-semibold text-red-500 pt-2">This action cannot be undone.</p>
              <p className="pt-2">Type <span className="font-mono font-bold">DELETE</span> below to confirm:</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          autoFocus
          disabled={deleteMut.isPending}
          data-testid="input-delete-confirm"
        />

        {errorMessage && (
          <p className="text-xs text-red-500" data-testid="text-delete-error">{errorMessage}</p>
        )}

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={deleteMut.isPending} data-testid="button-cancel-delete">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMut.mutate()}
            disabled={!canDelete || deleteMut.isPending}
            data-testid="button-confirm-delete"
          >
            {deleteMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {deleteMut.isPending ? "Deleting..." : "Delete Permanently"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
