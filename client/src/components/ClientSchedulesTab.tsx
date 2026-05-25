/**
 * client/src/components/ClientSchedulesTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-client Scheduling tab. Lives inside the Edit Client dialog as the 4th
 * tab next to Data Sources, SEO Tools, and Config.
 *
 * Renders one section per report type (Biweekly, Monthly, QBR Prep, QBR Full,
 * Mid-Strategy, QCR, Discoverability). For each type:
 *   - If schedule(s) exist for this client + type: list them with controls
 *     (Run Now, Pause/Resume, Delete) plus a "+ Add another schedule" button
 *     (multiple schedules of the same type are allowed by design)
 *   - If no schedule exists for this report type: show "+ Create schedule"
 *
 * A header links to the global /admin-schedules page for the god-view across
 * all clients.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Trash2, Plus, Play, ExternalLink } from "lucide-react";
import {
  ScheduleFormFields,
  defaultScheduleForm,
  buildSchedulePayload,
  describeSchedule,
  formatDateTime,
  freqBadgeLabel,
  reportTypeLabel,
  ALL_REPORT_TYPES,
  type ScheduleFormState,
} from "@/components/ScheduleFormFields";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a ReportSchedule (DB row shape, numeric fields) into ScheduleFormState
 * (string-typed form shape) so the user can edit an existing schedule.
 * Decides recurrenceType from whichever cadence field is populated.
 */
function scheduleToFormState(s: ReportSchedule): ScheduleFormState {
  const recurrenceType =
    s.recurrenceDayOfMonth != null ? "dayofmonth" :
    s.recurrenceWeekOfMonth != null ? "nthweekday" :
    "dayofweek";
  return {
    clientId: String(s.clientId),
    reportType: s.reportType,
    frequency: s.frequency ?? "biweekly",
    recurrenceType,
    recurrenceDay: String(s.recurrenceDay),
    recurrenceWeekOfMonth: String(s.recurrenceWeekOfMonth ?? 1),
    recurrenceDayOfMonth: String(s.recurrenceDayOfMonth ?? 1),
    recurrenceHour: String(s.recurrenceHour),
    timezone: s.timezone,
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ClientSchedulesTab({ client }: { client: Client }) {
  const { toast } = useToast();
  const clientId = client.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleFormState>({ ...defaultScheduleForm });
  const [triggeringId, setTriggeringId] = useState<number | null>(null);

  // Fetch ALL schedules; filter to this client client-side. This keeps the
  // implementation simple (no new API needed) and the response is small enough
  // that the cost is negligible.
  const { data: allSchedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/report-schedules"],
  });

  const clientSchedules = allSchedules.filter(s => s.clientId === clientId);

  // Group schedules by reportType for rendering
  const schedulesByType: Record<string, ReportSchedule[]> = {};
  for (const s of clientSchedules) {
    if (!schedulesByType[s.reportType]) schedulesByType[s.reportType] = [];
    schedulesByType[s.reportType].push(s);
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/report-schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...defaultScheduleForm });
      toast({ title: "Schedule created" });
    },
    onError: (err: any) => toast({ title: "Failed to create schedule", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/report-schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...defaultScheduleForm });
      toast({ title: "Schedule updated" });
    },
    onError: (err: any) => toast({ title: "Failed to update schedule", description: err.message, variant: "destructive" }),
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

  const triggerMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/report-schedules/${id}/trigger`),
    onMutate: (id) => setTriggeringId(id),
    onSuccess: () => {
      setTriggeringId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Report generated", description: "Saved to this client. Check the Slack channel for the notification." });
    },
    onError: (err: any) => {
      setTriggeringId(null);
      toast({ title: "Run failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Open dialog: create new for a specific report type ──────────────────

  const openCreate = (reportType: string) => {
    setEditingId(null);
    setForm({
      ...defaultScheduleForm,
      clientId: String(clientId),
      reportType,
      frequency: reportType === "biweekly" ? "biweekly" : "monthly",
    });
    setDialogOpen(true);
  };

  // ─── Open dialog: edit an existing schedule ──────────────────────────────

  const openEdit = (s: ReportSchedule) => {
    setEditingId(s.id);
    setForm(scheduleToFormState(s));
    setDialogOpen(true);
  };

  // ─── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = () => {
    const payload = buildSchedulePayload(form, clientId);
    if (editingId != null) {
      updateMut.mutate({ id: editingId, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-muted-foreground max-w-md">
          Schedule automated reports for <strong>{client.name}</strong>. Each report type
          can have multiple schedules — for example, two different biweekly cadences for
          different audiences. Slack notifications post to{" "}
          {client.slackChannelId
            ? <code className="px-1 py-0.5 rounded bg-muted">{client.slackChannelId}</code>
            : <em className="text-amber-500">no Slack channel configured</em>}.
        </div>
        <Link
          href="/admin-schedules"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          data-testid="link-all-schedules"
        >
          All schedules
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {ALL_REPORT_TYPES.map(rt => {
            const schedulesForType = schedulesByType[rt.value] ?? [];
            return (
              <div key={rt.value} className="space-y-2" data-testid={`report-type-section-${rt.value}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{rt.label}</h3>
                  {schedulesForType.length === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => openCreate(rt.value)}
                      data-testid={`btn-create-schedule-${rt.value}`}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Create schedule
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] text-muted-foreground"
                      onClick={() => openCreate(rt.value)}
                      data-testid={`btn-add-another-${rt.value}`}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add another
                    </Button>
                  )}
                </div>

                {schedulesForType.length === 0 ? (
                  <Card className="px-3 py-2 border-dashed">
                    <div className="text-[11px] text-muted-foreground italic">Not scheduled</div>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {schedulesForType.map(s => (
                      <Card key={s.id} className="px-3 py-2 flex items-center gap-3" data-testid={`schedule-row-${s.id}`}>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{freqBadgeLabel(s.frequency ?? "biweekly")}</Badge>
                            {!s.enabled && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">Paused</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
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
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
                            disabled={triggeringId === s.id}
                            onClick={() => {
                              if (confirm(`Run the ${reportTypeLabel(s.reportType).toLowerCase()} report for ${client.name} right now?`)) {
                                triggerMut.mutate(s.id);
                              }
                            }}
                            data-testid={`btn-run-now-${s.id}`}
                            title="Run now"
                          >
                            <Play className="w-3 h-3" />
                            {triggeringId === s.id ? "Running…" : "Run Now"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-muted-foreground"
                            onClick={() => openEdit(s)}
                            data-testid={`btn-edit-schedule-${s.id}`}
                          >
                            Edit
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
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingId(null);
          setForm({ ...defaultScheduleForm });
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId != null ? "Edit Schedule" : "New Schedule"}</DialogTitle>
            <DialogDescription>
              {editingId != null
                ? `Update the cadence for ${client.name}'s ${reportTypeLabel(form.reportType).toLowerCase()} report.`
                : `Auto-generate ${reportTypeLabel(form.reportType).toLowerCase()} reports for ${client.name} and notify via Slack.`}
            </DialogDescription>
          </DialogHeader>
          <ScheduleFormFields
            form={form}
            setForm={setForm}
            clients={[client]}
            showClientSelect={false}
            lockReportType={true}
            reportTypes={ALL_REPORT_TYPES}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              data-testid="button-confirm-schedule"
            >
              {(createMut.isPending || updateMut.isPending)
                ? (editingId != null ? "Saving…" : "Creating…")
                : (editingId != null ? "Save" : "Create Schedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
