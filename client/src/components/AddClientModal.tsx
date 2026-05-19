import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Trash2, AlertCircle } from "lucide-react";

interface Competitor {
  name: string;
  url: string;
}

interface FormState {
  name: string;
  website: string;
  creditsTotal: string;
  brandTerms: string;
  asanaProjectId: string;
  airtableBaseId: string;
  airtableTableName: string;
  airtableProductionView: string;
  airtableEverythingView: string;
  slackChannelId: string;
  slackUserId: string;
  competitors: Competitor[];
  assignedAmUserId: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  website: "",
  creditsTotal: "",
  brandTerms: "",
  asanaProjectId: "",
  airtableBaseId: "",
  airtableTableName: "Content",
  airtableProductionView: "",
  airtableEverythingView: "",
  slackChannelId: "",
  slackUserId: "",
  competitors: [{ name: "", url: "" }],
  assignedAmUserId: "",
};

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface AddClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddClientModal({ open, onOpenChange, onCreated }: AddClientModalProps) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const adminMode = isAdmin();

  // Load AM users when admin is creating
  const { data: amUsers = [] } = useQuery<Array<{ id: number; fullName: string; email: string }>>({
    queryKey: ["/api/users", "am"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users?role=am");
      return res.json();
    },
    enabled: open && adminMode,
  });

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => { const { [field as string]: _, ...rest } = e; return rest; });
  };

  const updateCompetitor = (idx: number, field: keyof Competitor, value: string) => {
    setForm(f => ({
      ...f,
      competitors: f.competitors.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const addCompetitor = () => {
    if (form.competitors.length >= 10) return;
    setForm(f => ({ ...f, competitors: [...f.competitors, { name: "", url: "" }] }));
  };

  const removeCompetitor = (idx: number) => {
    if (form.competitors.length <= 1) return;
    setForm(f => ({ ...f, competitors: f.competitors.filter((_, i) => i !== idx) }));
  };

  const validateClientSide = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Client name is required";
    if (!form.website.trim()) e.website = "Website is required";
    else if (!isValidUrl(form.website.trim())) e.website = "Must be a valid http(s) URL";
    if (!form.creditsTotal.trim()) e.creditsTotal = "Credits total is required";
    else if (!/^\d+$/.test(form.creditsTotal.trim()) || Number(form.creditsTotal) <= 0) {
      e.creditsTotal = "Must be a positive integer";
    }
    if (!form.brandTerms.trim()) e.brandTerms = "At least one brand term is required";
    if (!form.asanaProjectId.trim()) e.asanaProjectId = "Asana project ID is required";
    if (!form.airtableBaseId.trim()) e.airtableBaseId = "Airtable base ID is required";
    if (!form.airtableTableName.trim()) e.airtableTableName = "Airtable table name is required";
    if (!form.airtableProductionView.trim()) e.airtableProductionView = "Production view is required";
    if (!form.airtableEverythingView.trim()) e.airtableEverythingView = "Everything view is required";
    if (!form.slackChannelId.trim()) e.slackChannelId = "Slack channel ID is required";
    if (!form.slackUserId.trim()) e.slackUserId = "Slack user ID is required";
    if (adminMode && !form.assignedAmUserId) e.assignedAmUserId = "Please assign an AM";
    const cleanCompetitors = form.competitors.filter(c => c.name.trim() || c.url.trim());
    if (cleanCompetitors.length === 0) e.competitors = "At least one competitor is required";
    cleanCompetitors.forEach((c, i) => {
      if (!c.name.trim()) e[`competitor_${i}_name`] = "Competitor name is required";
      if (!c.url.trim()) e[`competitor_${i}_url`] = "Competitor URL is required";
      else if (!isValidUrl(c.url.trim())) e[`competitor_${i}_url`] = "Must be a valid http(s) URL";
    });
    return e;
  };

  const handleSubmit = async () => {
    setBannerError(null);
    const clientErrors = validateClientSide();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setBannerError("Please fix the errors below before saving.");
      return;
    }

    setSubmitting(true);
    try {
      // Run all three validation endpoints in parallel
      const [asanaRes, airtableRes, slackRes] = await Promise.all([
        apiRequest("POST", "/api/validate/asana", { projectId: form.asanaProjectId.trim() }).then(r => r.json()),
        apiRequest("POST", "/api/validate/airtable", {
          baseId: form.airtableBaseId.trim(),
          tableName: form.airtableTableName.trim(),
          productionView: form.airtableProductionView.trim(),
          everythingView: form.airtableEverythingView.trim(),
        }).then(r => r.json()),
        apiRequest("POST", "/api/validate/slack", {
          channelId: form.slackChannelId.trim(),
          userId: form.slackUserId.trim(),
        }).then(r => r.json()),
      ]);

      const validationErrors: Record<string, string> = {};
      if (!asanaRes.ok) validationErrors.asanaProjectId = asanaRes.error ?? "Asana validation failed";
      if (!airtableRes.ok) {
        if (airtableRes.errors) Object.assign(validationErrors, airtableRes.errors);
        else validationErrors.airtableBaseId = airtableRes.error ?? "Airtable validation failed";
      }
      if (!slackRes.ok) {
        if (slackRes.errors) Object.assign(validationErrors, slackRes.errors);
        else validationErrors.slackChannelId = slackRes.error ?? "Slack validation failed";
      }

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setBannerError("Integration validation failed. Fix the errors below.");
        setSubmitting(false);
        return;
      }

      // All validations passed. Create the client.
      const brandTermsArr = form.brandTerms.split(",").map(s => s.trim()).filter(Boolean);
      const cleanCompetitors = form.competitors
        .filter(c => c.name.trim() && c.url.trim())
        .map((c, i) => ({ name: c.name.trim(), url: c.url.trim(), ordinal: i }));

      const assignedAmId = adminMode
        ? Number(form.assignedAmUserId)
        : user?.id ?? null;

      const createRes = await apiRequest("POST", "/api/clients", {
        name: form.name.trim(),
        website: form.website.trim(),
        creditsTotal: Number(form.creditsTotal),
        brandTerms: brandTermsArr,
        asanaProjectId: form.asanaProjectId.trim(),
        airtableBaseId: form.airtableBaseId.trim(),
        airtableTableName: form.airtableTableName.trim(),
        airtableProductionView: form.airtableProductionView.trim(),
        airtableEverythingView: form.airtableEverythingView.trim(),
        slackChannelId: form.slackChannelId.trim(),
        slackUserId: form.slackUserId.trim(),
        assignedAmUserId: assignedAmId,
      });
      const created = await createRes.json();

      // Save competitors via the bulk replace endpoint
      if (cleanCompetitors.length > 0 && created?.id) {
        await apiRequest("PUT", `/api/clients/${created.id}/competitors`, {
          competitors: cleanCompetitors,
        });
      }

      // Refresh and close
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setForm(INITIAL_FORM);
      setErrors({});
      setBannerError(null);
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      setBannerError(err?.message ?? "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key: string) => errors[key] ? (
    <p className="text-xs text-red-500 mt-1" data-testid={`error-${key}`}>{errors[key]}</p>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modal-add-client">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
        </DialogHeader>

        {bannerError && (
          <Alert variant="destructive" data-testid="alert-banner-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{bannerError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-4">
          {/* Basics */}
          <div className="space-y-1">
            <Label>Client Name *</Label>
            <Input value={form.name} onChange={e => update("name", e.target.value)} data-testid="input-name" />
            {fieldError("name")}
          </div>

          <div className="space-y-1">
            <Label>Website *</Label>
            <Input value={form.website} onChange={e => update("website", e.target.value)} placeholder="https://example.com" data-testid="input-website" />
            {fieldError("website")}
          </div>

          <div className="space-y-1">
            <Label>Credits Total *</Label>
            <Input type="number" value={form.creditsTotal} onChange={e => update("creditsTotal", e.target.value)} placeholder="e.g., 12" data-testid="input-credits" />
            {fieldError("creditsTotal")}
          </div>

          <div className="space-y-1">
            <Label>Brand Terms * <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
            <Input value={form.brandTerms} onChange={e => update("brandTerms", e.target.value)} placeholder="e.g., Sol Womens, Sol Womens Treatment, sol-womens.com" data-testid="input-brand-terms" />
            {fieldError("brandTerms")}
          </div>

          {/* Asana */}
          <div className="pt-2 border-t">
            <h3 className="text-sm font-semibold mb-2">Asana</h3>
            <div className="space-y-1">
              <Label>Project ID *</Label>
              <Input value={form.asanaProjectId} onChange={e => update("asanaProjectId", e.target.value)} placeholder="e.g., 1234567890123456" data-testid="input-asana-project-id" />
              {fieldError("asanaProjectId")}
            </div>
          </div>

          {/* Airtable */}
          <div className="pt-2 border-t">
            <h3 className="text-sm font-semibold mb-2">Airtable</h3>
            <div className="space-y-1">
              <Label>Base ID *</Label>
              <Input value={form.airtableBaseId} onChange={e => update("airtableBaseId", e.target.value)} placeholder="e.g., appXXXXXXXXXXXXXX" data-testid="input-airtable-base-id" />
              {fieldError("airtableBaseId")}
            </div>
            <div className="space-y-1 mt-2">
              <Label>Table Name *</Label>
              <Input value={form.airtableTableName} onChange={e => update("airtableTableName", e.target.value)} data-testid="input-airtable-table" />
              {fieldError("airtableTableName")}
            </div>
            <div className="space-y-1 mt-2">
              <Label>Production View *</Label>
              <Input value={form.airtableProductionView} onChange={e => update("airtableProductionView", e.target.value)} placeholder="e.g., Client Production View" data-testid="input-airtable-production-view" />
              {fieldError("airtableProductionView")}
            </div>
            <div className="space-y-1 mt-2">
              <Label>Everything View *</Label>
              <Input value={form.airtableEverythingView} onChange={e => update("airtableEverythingView", e.target.value)} placeholder="e.g., Client Everything" data-testid="input-airtable-everything-view" />
              {fieldError("airtableEverythingView")}
            </div>
          </div>

          {/* Slack */}
          <div className="pt-2 border-t">
            <h3 className="text-sm font-semibold mb-2">Slack</h3>
            <div className="space-y-1">
              <Label>Channel ID *</Label>
              <Input value={form.slackChannelId} onChange={e => update("slackChannelId", e.target.value)} placeholder="e.g., C012ABCDEF" data-testid="input-slack-channel-id" />
              {fieldError("slackChannelId")}
            </div>
            <div className="space-y-1 mt-2">
              <Label>AM User ID (for @-mentions) *</Label>
              <Input value={form.slackUserId} onChange={e => update("slackUserId", e.target.value)} placeholder="e.g., U012ABCDEF" data-testid="input-slack-user-id" />
              {fieldError("slackUserId")}
            </div>
          </div>

          {/* Assigned AM (admin only) */}
          {adminMode && (
            <div className="pt-2 border-t">
              <h3 className="text-sm font-semibold mb-2">Assignment</h3>
              <div className="space-y-1">
                <Label>Assigned AM *</Label>
                <Select value={form.assignedAmUserId} onValueChange={v => update("assignedAmUserId", v)}>
                  <SelectTrigger data-testid="select-assigned-am">
                    <SelectValue placeholder="Pick an AM" />
                  </SelectTrigger>
                  <SelectContent>
                    {amUsers.map(u => (
                      <SelectItem key={u.id} value={String(u.id)} data-testid={`option-am-${u.id}`}>
                        {u.fullName || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("assignedAmUserId")}
              </div>
            </div>
          )}

          {/* Competitors */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Competitors *</h3>
              <span className="text-xs text-muted-foreground">{form.competitors.length}/10</span>
            </div>
            {fieldError("competitors")}
            <div className="space-y-2">
              {form.competitors.map((c, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={c.name}
                      onChange={e => updateCompetitor(i, "name", e.target.value)}
                      placeholder="Competitor name"
                      data-testid={`input-competitor-name-${i}`}
                    />
                    {fieldError(`competitor_${i}_name`)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <Input
                      value={c.url}
                      onChange={e => updateCompetitor(i, "url", e.target.value)}
                      placeholder="https://competitor.com"
                      data-testid={`input-competitor-url-${i}`}
                    />
                    {fieldError(`competitor_${i}_url`)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(i)}
                    disabled={form.competitors.length <= 1}
                    data-testid={`button-remove-competitor-${i}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={addCompetitor}
                disabled={form.competitors.length >= 10}
                data-testid="button-add-competitor"
                className="gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add competitor
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="button-create-client">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitting ? "Validating..." : "Create Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
