import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Globe,
  BarChart3,
  Phone,
  Tag,
  Target,
  FileText,
  Pencil,
  Trash2,
  Building2,
  LinkIcon,
  LineChart,
  Bug,
  CheckCircle2,
  AlertCircle,
  Circle,
  KeyRound,
  Download,
  Upload,
} from "lucide-react";
import type { Client } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

type CredentialSafe = {
  id: number;
  service: string;
  accountLabel: string;
};

type SfSummaryRow = {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
  createdAt: string;
};

type CtSummaryRow = {
  id: number;
  clientId: number;
  reportDate: string;
  filename: string;
  rowCount: number;
  createdAt: string;
};

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 min-h-[36px] rounded-md border bg-background px-3 py-1.5">
      {value.map((tag, idx) => (
        <Badge
          key={idx}
          variant="secondary"
          className="text-xs cursor-pointer"
          onClick={() => onChange(value.filter((_, i) => i !== idx))}
        >
          {tag}
          <span className="ml-1 opacity-50">x</span>
        </Badge>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

interface ClientFormData {
  name: string;
  gscSiteUrl: string;
  ga4PropertyId: string;
  callrailCompanyId: string;
  ctmAccountId: string;
  ahrefsProjectUrl: string;
  semrushProjectId: string;
  screamingFrogProfile: string;
  nimbataAccountId: string;
  brandTerms: string[];
  leadEvents: string[];
  moneyPages: string[];
  callrailOrganicSourceTerms: string[];
  ctmOrganicSourceTerms: string[];
}

const emptyForm: ClientFormData = {
  name: "",
  gscSiteUrl: "",
  ga4PropertyId: "",
  callrailCompanyId: "",
  ctmAccountId: "",
  ahrefsProjectUrl: "",
  semrushProjectId: "",
  screamingFrogProfile: "",
  nimbataAccountId: "",
  brandTerms: [],
  leadEvents: [],
  moneyPages: [],
  callrailOrganicSourceTerms: ["google / organic"],
  ctmOrganicSourceTerms: ["google / organic"],
};

function ClientForm({ initial, onSubmit, isPending }: { initial: ClientFormData; onSubmit: (data: ClientFormData) => void; isPending: boolean }) {
  const [form, setForm] = useState<ClientFormData>(initial);

  const update = (field: keyof ClientFormData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Client / Facility Name *</Label>
        <Input id="name" value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g., Sunrise Recovery Center" data-testid="input-client-name" />
      </div>

      <Tabs defaultValue="data-sources" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
          <TabsTrigger value="seo-tools">SEO Tools</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="data-sources" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gscUrl" className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> GSC Site URL</Label>
              <Input id="gscUrl" value={form.gscSiteUrl} onChange={e => update("gscSiteUrl", e.target.value)} placeholder="https://example.com" data-testid="input-gsc-url" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ga4" className="flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> GA4 Property ID</Label>
              <Input id="ga4" value={form.ga4PropertyId} onChange={e => update("ga4PropertyId", e.target.value)} placeholder="properties/123456" data-testid="input-ga4-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="callrail" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CallRail Company ID</Label>
              <Input id="callrail" value={form.callrailCompanyId} onChange={e => update("callrailCompanyId", e.target.value)} placeholder="COM-ABC123" data-testid="input-callrail-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctm" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CTM Account ID</Label>
              <Input id="ctm" value={form.ctmAccountId} onChange={e => update("ctmAccountId", e.target.value)} placeholder="CTM-ABC123" data-testid="input-ctm-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nimbata" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> Nimbata Account ID</Label>
              <Input id="nimbata" value={form.nimbataAccountId} onChange={e => update("nimbataAccountId", e.target.value)} placeholder="Nimbata account ID" data-testid="input-nimbata-id" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo-tools" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ahrefs" className="flex items-center gap-1.5"><LinkIcon className="w-3 h-3" /> Ahrefs Project URL</Label>
              <Input id="ahrefs" value={form.ahrefsProjectUrl} onChange={e => update("ahrefsProjectUrl", e.target.value)} placeholder="https://example.com" data-testid="input-ahrefs-url" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="semrush" className="flex items-center gap-1.5"><LineChart className="w-3 h-3" /> SEMrush Project ID</Label>
              <Input id="semrush" value={form.semrushProjectId} onChange={e => update("semrushProjectId", e.target.value)} placeholder="proj-abc-123" data-testid="input-semrush-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screamingfrog" className="flex items-center gap-1.5"><Bug className="w-3 h-3" /> Screaming Frog Profile</Label>
              <Input id="screamingfrog" value={form.screamingFrogProfile} onChange={e => update("screamingFrogProfile", e.target.value)} placeholder="Profile name" data-testid="input-sf-profile" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Tag className="w-3 h-3" /> Brand Terms</Label>
            <TagInput value={form.brandTerms} onChange={v => update("brandTerms", v)} placeholder="Type a brand term and press Enter" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Target className="w-3 h-3" /> Lead / Admissions Events</Label>
            <TagInput value={form.leadEvents} onChange={v => update("leadEvents", v)} placeholder="e.g., insurance_verification, admissions_form" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> Money Pages</Label>
            <TagInput value={form.moneyPages} onChange={v => update("moneyPages", v)} placeholder="e.g., /programs/detox, /insurance-verification" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CallRail Organic Source Terms</Label>
            <TagInput value={form.callrailOrganicSourceTerms} onChange={v => update("callrailOrganicSourceTerms", v)} placeholder="e.g., google / organic" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CTM Organic Source Terms</Label>
            <TagInput value={form.ctmOrganicSourceTerms} onChange={v => update("ctmOrganicSourceTerms", v)} placeholder="e.g., google / organic" />
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!form.name.trim() || isPending} data-testid="button-save-client">
          {isPending ? "Saving..." : "Save Client"}
        </Button>
      </DialogFooter>
    </div>
  );
}

const SERVICE_DEFS = [
  {
    key: "gsc",
    label: "Search Console",
    short: "GSC",
    credService: "google_search_console",
    icon: Globe,
    getValue: (c: Client) => c.gscSiteUrl,
    format: (v: string) => v.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    isManual: false,
  },
  {
    key: "ga4",
    label: "Analytics 4",
    short: "GA4",
    credService: "google_analytics_4",
    icon: BarChart3,
    getValue: (c: Client) => c.ga4PropertyId,
    format: (v: string) => v,
    isManual: false,
  },
  {
    key: "callrail",
    label: "CallRail",
    short: "CallRail",
    credService: "callrail",
    icon: Phone,
    getValue: (c: Client) => c.callrailCompanyId,
    format: (v: string) => v,
    isManual: false,
  },
  {
    key: "ctm",
    label: "Call Tracking Metrics",
    short: "CTM",
    credService: "call_tracking_metrics",
    icon: Phone,
    getValue: (c: Client) => c.ctmAccountId,
    format: (v: string) => v,
    isManual: false,
  },
  {
    key: "nimbata",
    label: "Nimbata",
    short: "Nimbata",
    credService: "nimbata",
    icon: Phone,
    getValue: (c: Client) => (c as any).nimbataAccountId,
    format: (v: string) => v,
    isManual: false,
  },
  {
    key: "ahrefs",
    label: "Ahrefs",
    short: "Ahrefs",
    credService: "ahrefs",
    icon: LinkIcon,
    getValue: (c: Client) => c.ahrefsProjectUrl,
    format: (v: string) => v.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    isManual: false,
  },
  {
    key: "semrush",
    label: "SEMrush",
    short: "SEMrush",
    credService: "semrush",
    icon: LineChart,
    getValue: (c: Client) => c.semrushProjectId,
    format: (v: string) => v,
    isManual: false,
  },
  {
    key: "ct_manual",
    label: "Manual Call Tracking",
    short: "CT Manual",
    credService: null,
    icon: Upload,
    getValue: (_c: Client) => null,
    format: (v: string) => v,
    isManual: true,
  },
  {
    key: "sf",
    label: "Screaming Frog",
    short: "SF",
    credService: null,
    icon: Bug,
    getValue: (c: Client) => c.screamingFrogProfile,
    format: (v: string) => v,
    isManual: true,
  },
] as const;

function ServiceRow({
  def,
  client,
  credentials,
  sfReport,
  ctReport,
  onCtUpload,
  ctUploading,
}: {
  def: (typeof SERVICE_DEFS)[number];
  client: Client;
  credentials: CredentialSafe[];
  sfReport?: SfSummaryRow | null;
  ctReport?: CtSummaryRow | null;
  onCtUpload?: (file: File) => void;
  ctUploading?: boolean;
}) {
  const rawValue = def.getValue(client);
  const hasId = !!rawValue;
  const matchingCreds = def.credService
    ? credentials.filter(c => c.service === def.credService)
    : [];
  const hasCred = matchingCreds.length > 0;
  const isManual = def.isManual;
  const hasSfUpload = def.key === "sf" && isManual && !!sfReport;
  const hasCTUpload = def.key === "ct_manual" && isManual && !!ctReport;

  const fullyConnected = hasSfUpload || hasCTUpload || (hasId && (hasCred || isManual));
  const idOnlyMissingCred = hasId && !hasCred && !isManual;
  const notConfigured = !hasSfUpload && !hasCTUpload && !hasId;

  const Icon = def.icon;

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-md border text-sm ${
        fullyConnected
          ? "bg-green-50 border-green-100 dark:bg-green-950/20 dark:border-green-900/40"
          : idOnlyMissingCred
          ? "bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40"
          : "bg-muted/30 border-border/50 opacity-60"
      }`}
      data-testid={`service-row-${def.key}-${client.id}`}
    >
      <div className="mt-0.5 shrink-0">
        {fullyConnected ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : idOnlyMissingCred ? (
          <AlertCircle className="w-4 h-4 text-amber-500" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground/40" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
          <span className="font-medium text-xs">{def.label}</span>
        </div>

        {hasId && (
          <p
            className="text-[11px] text-muted-foreground mt-0.5 truncate font-mono"
            title={rawValue ?? ""}
            data-testid={`service-id-${def.key}-${client.id}`}
          >
            {def.format(rawValue!)}
          </p>
        )}

        {!hasId && !hasSfUpload && (
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">Not configured</p>
        )}

        {hasId && matchingCreds.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {matchingCreds.map(cred => (
              <span
                key={cred.id}
                className="inline-flex items-center gap-0.5 text-[10px] text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded px-1.5 py-0.5"
                data-testid={`cred-label-${def.key}-${cred.id}`}
              >
                <KeyRound className="w-2.5 h-2.5" />
                {cred.accountLabel}
              </span>
            ))}
          </div>
        )}

        {hasId && !hasCred && !isManual && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">No credential saved — go to Setup</p>
        )}

        {def.key === "sf" && isManual && hasSfUpload && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <a
              href={"/api/sf-reports/" + sfReport!.id + "/download"}
              download={sfReport!.filename}
              className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded px-1.5 py-0.5 hover:underline"
              data-testid={"sf-download-link-" + client.id}
            >
              <Download className="w-2.5 h-2.5" />
              {sfReport!.filename}
            </a>
            <span className="text-[10px] text-muted-foreground">{sfReport!.rowCount.toLocaleString()} rows · {sfReport!.reportDate}</span>
          </div>
        )}
        {def.key === "sf" && isManual && !hasSfUpload && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">No uploads</p>
        )}
        {def.key === "ct_manual" && isManual && ctReport && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <a
              href={"/api/call-tracking-reports/" + ctReport.id + "/download"}
              download={ctReport.filename}
              className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded px-1.5 py-0.5 hover:underline"
              data-testid={"ct-download-link-" + client.id}
            >
              <Download className="w-2.5 h-2.5" />
              {ctReport.filename}
            </a>
            <span className="text-[10px] text-muted-foreground">{ctReport.rowCount.toLocaleString()} rows · {ctReport.reportDate}</span>
          </div>
        )}
        {def.key === "ct_manual" && isManual && onCtUpload && (
          <label
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer mt-1 border rounded px-1.5 py-0.5 transition-colors hover:bg-muted/40"
            data-testid={"ct-upload-label-" + client.id}
          >
            <Upload className="w-2.5 h-2.5" />
            {ctUploading ? "Uploading…" : ctReport ? "Replace CSV" : "Upload CSV"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onCtUpload(f); }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  credentials,
  sfSummary,
  ctSummary,
  onEdit,
}: {
  client: Client;
  credentials: CredentialSafe[];
  sfSummary: SfSummaryRow[];
  ctSummary: CtSummaryRow[];
  onEdit: () => void;
}) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/clients/${client.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client deleted" });
    },
  });

  const clientSfReport = sfSummary.find(r => r.clientId === client.id) || null;
  const clientCtReport = ctSummary.find(r => r.clientId === client.id) || null;
  const [ctUploading, setCtUploading] = useState(false);
  const handleCtUpload = async (file: File) => {
    setCtUploading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.match(/(?:"[^"]*"|[^,])+/g) || [];
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
        return obj;
      });
      const today = new Date().toISOString().slice(0, 10);
      await fetch("/api/clients/" + client.id + "/call-tracking-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate: today, filename: file.name, rowCount: rows.length, headers, data: rows }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/call-tracking-reports/summary"] });
      toast({ title: "Uploaded", description: rows.length + " rows from " + file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setCtUploading(false);
    }
  };

  const connectedCount = SERVICE_DEFS.filter(def => {
    const hasId = !!def.getValue(client);
    const hasCred = def.credService
      ? credentials.some(c => c.service === def.credService)
      : true;
    if (def.key === "sf") return !!(sfSummary.find(r => r.clientId === client.id));
    if (def.key === "ct_manual") return !!(ctSummary.find(r => r.clientId === client.id));
    return hasId && hasCred;
  }).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent shrink-0">
            <Building2 className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-sm" data-testid={`text-client-name-${client.id}`}>{client.name}</h3>
            <p className="text-xs text-muted-foreground">
              {connectedCount} of {SERVICE_DEFS.length} sources connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-client-${client.id}`}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid={`button-delete-client-${client.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this client and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {SERVICE_DEFS.map(def => (
          <ServiceRow key={def.key} def={def} client={client} credentials={credentials} sfReport={def.key === "sf" ? clientSfReport : undefined} ctReport={def.key === "ct_manual" ? clientCtReport : undefined} onCtUpload={def.key === "ct_manual" ? handleCtUpload : undefined} ctUploading={def.key === "ct_manual" ? ctUploading : undefined} />
        ))}
      </div>

      {(client.brandTerms && client.brandTerms.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
          <span className="text-[10px] text-muted-foreground mr-1">Brand:</span>
          {client.brandTerms.slice(0, 3).map((term, idx) => (
            <Badge key={idx} variant="secondary" className="text-[10px]">{term}</Badge>
          ))}
          {client.brandTerms.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{client.brandTerms.length - 3} more</span>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ClientsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { toast } = useToast();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: credentials = [] } = useQuery<CredentialSafe[]>({
    queryKey: ["/api/credentials"],
  });

  const { data: sfSummary = [] } = useQuery<SfSummaryRow[]>({
    queryKey: ["/api/sf-reports/summary"],
  });

  const { data: ctSummary = [] } = useQuery<CtSummaryRow[]>({
    queryKey: ["/api/call-tracking-reports/summary"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ClientFormData) => apiRequest("POST", "/api/clients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setDialogOpen(false);
      toast({ title: "Client created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ClientFormData) =>
      apiRequest("PATCH", `/api/clients/${editingClient!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditingClient(null);
      toast({ title: "Client updated successfully" });
    },
  });

  const handleEdit = (client: Client) => {
    setEditingClient(client);
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-clients-title">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage your recovery & addiction centre clients and their data source configurations.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-client">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Configure a new client with their data source connections and SEO tools.</DialogDescription>
            </DialogHeader>
            <ClientForm
              initial={emptyForm}
              onSubmit={(data) => createMutation.mutate(data)}
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">No clients yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first recovery centre client to start querying their data.</p>
          <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-client">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Client
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              credentials={credentials}
              sfSummary={sfSummary}
              ctSummary={ctSummary}
              onEdit={() => handleEdit(client)}
            />
          ))}
        </motion.div>
      )}

      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client configuration and data source connections.</DialogDescription>
          </DialogHeader>
          {editingClient && (
            <ClientForm
              initial={{
                name: editingClient.name,
                gscSiteUrl: editingClient.gscSiteUrl || "",
                ga4PropertyId: editingClient.ga4PropertyId || "",
                callrailCompanyId: editingClient.callrailCompanyId || "",
                ctmAccountId: editingClient.ctmAccountId || "",
                ahrefsProjectUrl: editingClient.ahrefsProjectUrl || "",
                semrushProjectId: editingClient.semrushProjectId || "",
                screamingFrogProfile: editingClient.screamingFrogProfile || "",
                nimbataAccountId: (editingClient as any).nimbataAccountId || "",
                brandTerms: editingClient.brandTerms || [],
                leadEvents: editingClient.leadEvents || [],
                moneyPages: editingClient.moneyPages || [],
                callrailOrganicSourceTerms: editingClient.callrailOrganicSourceTerms || ["google / organic"],
                ctmOrganicSourceTerms: editingClient.ctmOrganicSourceTerms || ["google / organic"],
              }}
              onSubmit={(data) => updateMutation.mutate(data)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
