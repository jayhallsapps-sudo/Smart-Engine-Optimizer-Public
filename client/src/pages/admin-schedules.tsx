import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock, Trash2, Plus, CalendarClock, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";
import {
  ScheduleFormFields,
  defaultScheduleForm,
  buildSchedulePayload,
  describeSchedule,
  formatDateTime,
  freqBadgeLabel,
  ALL_REPORT_TYPES,
  type ScheduleFormState,
} from "@/components/ScheduleFormFields";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportSchedule = {
  id: number;
  clientId: number;
  reportType: string;
  frequency: string;
  recurrenceDay: number;
  recurrenceHour: number;
  timezone: string;
  recurrenceWeekOfMonth: number | null;
  recurrenceDayOfMonth: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminSchedulesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ScheduleFormState>({ ...defaultScheduleForm });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: schedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/report-schedules"],
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/report-schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setDialogOpen(false);
      setForm({ ...defaultScheduleForm });
      toast({ title: "Schedule created" });
    },
    onError: (err: any) => toast({ title: "Failed to create schedule", description: err.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/report-schedules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] }),
    onError: () => toast({ title: "Failed to update schedule", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/report-schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Schedule deleted" });
    },
    onError: () => toast({ title: "Failed to delete schedule", variant: "destructive" }),
  });

  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  const triggerMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/report-schedules/${id}/trigger`),
    onMutate: (id) => setTriggeringId(id),
    onSuccess: (_data, _id) => {
      setTriggeringId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Report generated", description: "The report was generated and saved. Check Saved Reports and your Slack channel." });
    },
    onError: (err: any) => {
      setTriggeringId(null);
      toast({ title: "Run failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!form.clientId) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    createMut.mutate(buildSchedulePayload(form));
  };

  const clientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client ${id}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 border-b px-5 py-3 flex items-center gap-3">
        <CalendarClock className="w-4 h-4 text-[#0369A1]" />
        <h1 className="text-sm font-semibold">Scheduled Reports</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-schedule">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Schedule
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <CalendarClock className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No schedules yet</p>
            <p className="text-xs mt-1">Create a schedule to auto-generate reports for a client.</p>
            <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-add-first-schedule">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Schedule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => (
              <Card key={s.id} className="px-4 py-3 flex items-center gap-4" data-testid={`schedule-row-${s.id}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{clientName(s.clientId)}</span>
                    <Badge variant="secondary" className="text-[10px]">{freqBadgeLabel(s.frequency ?? "biweekly")}</Badge>
                    {!s.enabled && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Paused</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {describeSchedule(s)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next: {formatDateTime(s.nextRunAt)}
                    </span>
                    {s.lastRunAt && (
                      <span>Last run: {formatDateTime(s.lastRunAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
                    disabled={triggeringId === s.id}
                    onClick={() => {
                      if (confirm(`Run the ${freqBadgeLabel(s.frequency ?? "biweekly").toLowerCase()} report for ${clientName(s.clientId)} right now?`)) {
                        triggerMut.mutate(s.id);
                      }
                    }}
                    data-testid={`btn-run-now-${s.id}`}
                    title="Run now"
                  >
                    <Play className="w-3 h-3" />
                    {triggeringId === s.id ? "Running…" : "Run Now"}
                  </Button>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(checked) => toggleMut.mutate({ id: s.id, enabled: checked })}
                    data-testid={`toggle-schedule-${s.id}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this schedule?")) deleteMut.mutate(s.id);
                    }}
                    data-testid={`btn-delete-schedule-${s.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Report Schedule</DialogTitle>
            <DialogDescription>
              Auto-generate reports on a schedule and notify via Slack.
            </DialogDescription>
          </DialogHeader>
          <ScheduleFormFields form={form} setForm={setForm} clients={clients} reportTypes={ALL_REPORT_TYPES} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending} data-testid="button-confirm-create-schedule">
              {createMut.isPending ? "Creating…" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
