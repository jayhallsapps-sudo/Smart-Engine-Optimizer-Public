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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock, Trash2, Plus, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

type ReportSchedule = {
  id: number;
  clientId: number;
  reportType: string;
  recurrenceDay: number;
  recurrenceHour: number;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];

function formatDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

export default function AdminSchedulesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    recurrenceDay: "1",
    recurrenceHour: "8",
    timezone: "America/New_York",
  });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: schedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/report-schedules"],
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/report-schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setDialogOpen(false);
      setForm({ clientId: "", recurrenceDay: "1", recurrenceHour: "8", timezone: "America/New_York" });
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

  const handleCreate = () => {
    if (!form.clientId) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    createMut.mutate({
      clientId: Number(form.clientId),
      reportType: "biweekly",
      recurrenceDay: Number(form.recurrenceDay),
      recurrenceHour: Number(form.recurrenceHour),
      timezone: form.timezone,
      enabled: true,
    });
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
            <p className="text-xs mt-1">Create a schedule to auto-generate bi-weekly reports for a client.</p>
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
                    <Badge variant="secondary" className="text-[10px]">Bi-Weekly</Badge>
                    {!s.enabled && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Paused</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Every {DAY_NAMES[s.recurrenceDay]} at {formatHour(s.recurrenceHour)} ({s.timezone})
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
              Set up an automatic bi-weekly report for a client. When generated, it posts a Slack notification to the client's configured channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger data-testid="select-schedule-client">
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Day of week</Label>
              <Select value={form.recurrenceDay} onValueChange={v => setForm(f => ({ ...f, recurrenceDay: v }))}>
                <SelectTrigger data-testid="select-schedule-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hour (every other occurrence)</Label>
              <Select value={form.recurrenceHour} onValueChange={v => setForm(f => ({ ...f, recurrenceHour: v }))}>
                <SelectTrigger data-testid="select-schedule-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{formatHour(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={v => setForm(f => ({ ...f, timezone: v }))}>
                <SelectTrigger data-testid="select-schedule-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
