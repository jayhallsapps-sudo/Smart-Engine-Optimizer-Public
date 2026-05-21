import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AsanaPushDialogProps {
  open: boolean;
  onClose: () => void;
  finding: any;
  clientId: number;
  savedReportId: number;
  onPushed: (findingId: string, taskGid: string, taskUrl: string) => void;
}

export function AsanaPushDialog({ open, onClose, finding, clientId, savedReportId, onPushed }: AsanaPushDialogProps) {
  const { toast } = useToast();
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isPushing, setIsPushing] = useState(false);

  useEffect(() => {
    if (!finding) return;
    setTaskName(`[${finding.severity?.toUpperCase() ?? "FINDING"}] ${finding.title ?? ""}`);
    let text = finding.description + "\n\nAffected URLs:\n";
    for (const url of finding.affectedUrls.slice(0, 50)) {
      text += `- ${url}\n`;
    }
    if (finding.affectedUrls.length > 50) {
      text += `(+${finding.affectedUrls.length - 50} more)\n`;
    }
    setDescription(text);
    setDueDate("");
  }, [finding]);

  async function handlePush() {
    if (!finding) return;
    setIsPushing(true);
    try {
      const res = await apiRequest("POST", `/api/qcr/findings/${finding.id}/push-asana`, {
        clientId,
        savedReportId,
        overrides: {
          taskName: taskName || undefined,
          description: description || undefined,
          dueDate: dueDate || undefined,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Push failed");
      onPushed(finding.id, data.taskGid, data.taskUrl);
      toast({ title: "Pushed to Asana", description: "Task created successfully." });
      onClose();
    } catch (err: any) {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPushing(false);
    }
  }

  if (!finding) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Push to Asana</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Task name</Label>
            <Input
              className="h-8 text-xs"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Description</Label>
            <Textarea
              className="text-xs min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Due date (optional)</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={handlePush} disabled={isPushing}>
              {isPushing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Push to Asana
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
