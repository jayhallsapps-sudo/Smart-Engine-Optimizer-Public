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
import { Calendar, Clock, Trash2, Plus, CalendarClock, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDINALS = [
  { value: "1", label: "1st" },
  { value: "2", label: "2nd" },
  { value: "3", label: "3rd" },
  { value: "4", label: "4th" },
  { value: "5", label: "Last" },
];
const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ordinalLabel(n: number): string {
  return WEEK_ORDINALS.find(w => w.value === String(n))?.label ?? String(n);
}

function describeSchedule(s: ReportSchedule): string {
  const freq = s.frequency ?? "biweekly";
  const time = formatHour(s.recurrenceHour);
  const tz = s.timezone.replace("America/", "").replace("_", " ");

  if (freq === "weekly") {
    return `Every ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
  }
  if (freq === "biweekly") {
    return `Every other ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
  }
  if (freq === "monthly" || freq === "quarterly") {
    const period = freq === "monthly" ? "month" : "quarter";
    if (s.recurrenceWeekOfMonth != null) {
      return `${ordinalLabel(s.recurrenceWeekOfMonth)} ${DAY_NAMES[s.recurrenceDay]} of every ${period} at ${time} (${tz})`;
    }
    if (s.recurrenceDayOfMonth != null) {
      return `Day ${s.recurrenceDayOfMonth} of every ${period} at ${time} (${tz})`;
    }
  }
  return `Every ${DAY_NAMES[s.recurrenceDay]} at ${time} (${tz})`;
}

function freqBadgeLabel(freq: string): string {
  return FREQUENCIES.find(f => f.value === freq)?.label ?? freq;
}

// ─── Schedule Form State ──────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
];

const defaultForm = {
  clientId: "",
  reportType: "biweekly",
  frequency: "biweekly",
  recurrenceType: "dayofweek", // dayofweek | dayofmonth | nthweekday
  recurrenceDay: "1",           // 0-6 weekday (Sun-Sat)
  recurrenceWeekOfMonth: "1",   // 1-5
  recurrenceDayOfMonth: "1",    // 1-28
  recurrenceHour: "8",
  timezone: "America/New_York",
};

// ─── ScheduleForm subcomponent ────────────────────────────────────────────────

function ScheduleForm({
  form,
  setForm,
  clients,
  showClientSelect = true,
}: {
  form: typeof defaultForm;
  setForm: React.Dispatch<React.SetStateAction<typeof defaultForm>>;
  clients: Client[];
  showClientSelect?: boolean;
}) {
  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));
  const needsMonthly = form.frequency === "monthly" || form.frequency === "quarterly";
  const needsWeekday = !needsMonthly || form.recurrenceType === "dayofweek" || form.recurrenceType === "nthweekday";

  return (
    <div className="space-y-3">
      {showClientSelect && (
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <Select value={form.clientId} onValueChange={v => update("clientId", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-client">
              <SelectValue placeholder="Select a client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Report Type</Label>
        <Select value={form.reportType} onValueChange={v => update("reportType", v)}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-report-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map(rt => (
              <SelectItem key={rt.value} value={rt.value} className="text-xs">{rt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Frequency</Label>
        <Select value={form.frequency} onValueChange={v => update("frequency", v)}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map(f => (
              <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsMonthly && (
        <div className="space-y-1.5">
          <Label className="text-xs">Recurrence type</Label>
          <Select value={form.recurrenceType} onValueChange={v => update("recurrenceType", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nthweekday" className="text-xs">Nth weekday (e.g. 3rd Thursday)</SelectItem>
              <SelectItem value="dayofmonth" className="text-xs">Specific day of month (e.g. 15th)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {needsMonthly && form.recurrenceType === "nthweekday" && (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Which week</Label>
            <Select value={form.recurrenceWeekOfMonth} onValueChange={v => update("recurrenceWeekOfMonth", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-week-of-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_ORDINALS.map(w => (
                  <SelectItem key={w.value} value={w.value} className="text-xs">{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Weekday</Label>
            <Select value={form.recurrenceDay} onValueChange={v => update("recurrenceDay", v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {needsMonthly && form.recurrenceType === "dayofmonth" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Day of month (1–28)</Label>
          <Select value={form.recurrenceDayOfMonth} onValueChange={v => update("recurrenceDayOfMonth", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-day-of-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!needsMonthly && (
        <div className="space-y-1.5">
          <Label className="text-xs">Day of week</Label>
          <Select value={form.recurrenceDay} onValueChange={v => update("recurrenceDay", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-recurrence-day">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((d, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Time</Label>
          <Select value={form.recurrenceHour} onValueChange={v => update("recurrenceHour", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">{formatHour(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Timezone</Label>
          <Select value={form.timezone} onValueChange={v => update("timezone", v)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-schedule-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz} value={tz} className="text-xs">{tz.replace("America/", "").replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Build payload from form ──────────────────────────────────────────────────

function buildPayload(form: typeof defaultForm, clientId?: number) {
  const needsMonthly = form.frequency === "monthly" || form.frequency === "quarterly";
  return {
    clientId: clientId ?? Number(form.clientId),
    reportType: form.reportType,
    frequency: form.frequency,
    recurrenceDay: Number(form.recurrenceDay),
    recurrenceHour: Number(form.recurrenceHour),
    timezone: form.timezone,
    recurrenceWeekOfMonth: needsMonthly && form.recurrenceType === "nthweekday"
      ? Number(form.recurrenceWeekOfMonth)
      : null,
    recurrenceDayOfMonth: needsMonthly && form.recurrenceType === "dayofmonth"
      ? Number(form.recurrenceDayOfMonth)
      : null,
    enabled: true,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminSchedulesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const { data: schedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/report-schedules"],
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/report-schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setDialogOpen(false);
      setForm({ ...defaultForm });
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
    createMut.mutate(buildPayload(form));
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
          <ScheduleForm form={form} setForm={setForm} clients={clients} />
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
