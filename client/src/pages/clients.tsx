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
  Database,
  GitCompare,
  CheckCheck,
  XCircle,
  ArrowLeftRight,
  MapPin,
  Loader2,
  RefreshCw,
  ChevronsUpDown,
  Check,
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
  callrailAccountId: string;
  ctmAccountId: string;
  ahrefsProjectUrl: string;
  semrushProjectId: string;
  screamingFrogProfile: string;
  nimbataAccountId: string;
  airtableBaseId: string;
  airtableTableName: string;
  airtableViewName: string;
  gbpLocationName: string;
  gbpProfileUrl: string;
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
  callrailAccountId: "",
  ctmAccountId: "",
  ahrefsProjectUrl: "",
  semrushProjectId: "",
  screamingFrogProfile: "",
  nimbataAccountId: "",
  airtableBaseId: "",
  airtableTableName: "",
  airtableViewName: "Published",
  gbpLocationName: "",
  gbpProfileUrl: "",
  brandTerms: [],
  leadEvents: [],
  moneyPages: [],
  callrailOrganicSourceTerms: ["google / organic"],
  ctmOrganicSourceTerms: ["google / organic"],
};


function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(o => o.value === value);
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="relative w-full">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal text-sm"
        data-testid={testId}
        onClick={() => { setOpen(o => !o); setQuery(""); }}
      >
        <span className="truncate">
          {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-[200] mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-1 border-b">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              onKeyDown={e => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground ${value === opt.value ? "bg-accent/50" : ""}`}
                  onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${value === opt.value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GbpLocationPicker({ value, onChange }: { value: string; onChange: (v: string) => void; clientName?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="gbpLocation" className="flex items-center gap-1.5">
        <MapPin className="w-3 h-3" /> GBP Location Resource Name
      </Label>
      <Input
        id="gbpLocation"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="accounts/123456789/locations/987654321"
        data-testid="input-gbp-location"
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-muted-foreground">
        Paste the resource name from your GBP dashboard URL. Auto-populate will be available once Google approves the API quota increase.
      </p>
    </div>
  );
}

function Ga4PropertyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [properties, setProperties] = useState<{ propertyId: string; displayName: string; accountName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableUrl, setEnableUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchProperties = async () => {
    setLoading(true);
    setError(null);
    setEnableUrl(null);
    try {
      const res = await fetch("/api/ga4/properties");
      const data = await res.json() as any;
      if (!res.ok) {
        if (data.enableUrl) { setEnableUrl(data.enableUrl); setError(data.message); }
        else throw new Error(data.message || "Failed to fetch GA4 properties");
        return;
      }
      setProperties(data.properties ?? []);
      setFetched(true);
      if ((data.properties ?? []).length === 0) {
        toast({ title: "No GA4 properties found", description: "Make sure GA4 is connected in Setup → Analytics & Search.", variant: "destructive" });
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Could not fetch GA4 properties", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> GA4 Property</Label>
      <div className="flex gap-2">
        {fetched && properties.length > 0 ? (
          <div className="flex-1">
            <SearchableSelect
              value={value}
              onChange={onChange}
              options={properties.map(p => ({ value: p.propertyId, label: `${p.displayName} · ${p.accountName}` }))}
              placeholder="— Select a property —"
              testId="select-ga4-property"
            />
          </div>
        ) : (
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Click 'Fetch' to load your GA4 properties"
            data-testid="input-ga4-id"
            className="flex-1"
          />
        )}
        <Button type="button" variant="outline" size="sm" onClick={fetchProperties} disabled={loading} data-testid="button-fetch-ga4-properties" className="shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">{fetched ? "Refresh" : "Fetch"}</span>
        </Button>
      </div>
      {error && (
        <div className="space-y-1">
          <p className="text-[11px] text-destructive">{error}</p>
          {enableUrl && (
            <a href={enableUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary underline hover:opacity-80" data-testid="link-enable-ga4-api">
              → Click here to enable the API in Google Cloud Console
            </a>
          )}
        </div>
      )}
      {!fetched && <p className="text-[11px] text-muted-foreground">Click Fetch to load properties from your connected GA4 account.</p>}
      {fetched && value && <p className="text-[11px] text-muted-foreground font-mono truncate">{value}</p>}
    </div>
  );
}

function GscSitePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sites, setSites] = useState<{ siteUrl: string; permissionLevel: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSites = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gsc/sites");
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || "Failed to fetch sites");
      setSites(data.sites ?? []);
      setFetched(true);
      if ((data.sites ?? []).length === 0) {
        toast({ title: "No GSC sites found", description: "Make sure GSC is connected in Setup → Analytics & Search.", variant: "destructive" });
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Could not fetch GSC sites", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> GSC Site</Label>
      <div className="flex gap-2">
        {fetched && sites.length > 0 ? (
          <div className="flex-1">
            <SearchableSelect
              value={value}
              onChange={onChange}
              options={sites.map(s => ({ value: s.siteUrl, label: `${s.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} (${s.permissionLevel})` }))}
              placeholder="— Select a site —"
              testId="select-gsc-site"
            />
          </div>
        ) : (
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Click 'Fetch' to load your GSC sites"
            data-testid="input-gsc-url"
            className="flex-1"
          />
        )}
        <Button type="button" variant="outline" size="sm" onClick={fetchSites} disabled={loading} data-testid="button-fetch-gsc-sites" className="shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">{fetched ? "Refresh" : "Fetch"}</span>
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!fetched && <p className="text-[11px] text-muted-foreground">Click Fetch to load verified sites from your connected GSC account.</p>}
      {fetched && value && <p className="text-[11px] text-muted-foreground font-mono truncate">{value}</p>}
    </div>
  );
}

function CallRailCompanyPicker({ value, onChange, onAccountIdChange }: { value: string; onChange: (v: string) => void; onAccountIdChange?: (accountId: string) => void }) {
  const [companies, setCompanies] = useState<{ companyId: string; name: string; accountId: string; accountName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCompanies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/callrail/companies");
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || "Failed to fetch companies");
      setCompanies(data.companies ?? []);
      setFetched(true);
      if ((data.companies ?? []).length === 0) {
        toast({ title: "No CallRail companies found", description: "Make sure CallRail is connected in Setup → Analytics & Search.", variant: "destructive" });
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Could not fetch CallRail companies", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (companyId: string) => {
    onChange(companyId);
    if (onAccountIdChange) {
      const match = companies.find(c => c.companyId === companyId);
      onAccountIdChange(match?.accountId ?? "");
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CallRail Company</Label>
      <div className="flex gap-2">
        {fetched && companies.length > 0 ? (
          <div className="flex-1">
            <SearchableSelect
              value={value}
              onChange={handleSelect}
              options={companies.map(c => ({ value: c.companyId, label: c.accountName ? `${c.name} (${c.accountName})` : c.name }))}
              placeholder="— Select a company —"
              testId="select-callrail-company"
            />
          </div>
        ) : (
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Click 'Fetch' to load your CallRail companies"
            data-testid="input-callrail-id"
            className="flex-1"
          />
        )}
        <Button type="button" variant="outline" size="sm" onClick={fetchCompanies} disabled={loading} data-testid="button-fetch-callrail-companies" className="shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">{fetched ? "Refresh" : "Fetch"}</span>
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!fetched && <p className="text-[11px] text-muted-foreground">Click Fetch to load companies from your connected CallRail account.</p>}
      {fetched && value && <p className="text-[11px] text-muted-foreground font-mono truncate">{value}</p>}
    </div>
  );
}

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
            <GscSitePicker value={form.gscSiteUrl} onChange={v => update("gscSiteUrl", v)} />
            <Ga4PropertyPicker value={form.ga4PropertyId} onChange={v => update("ga4PropertyId", v)} />
            <CallRailCompanyPicker value={form.callrailCompanyId} onChange={v => update("callrailCompanyId", v)} onAccountIdChange={v => update("callrailAccountId", v)} />
            <div className="space-y-2">
              <Label htmlFor="ctm" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CTM Account ID</Label>
              <Input id="ctm" value={form.ctmAccountId} onChange={e => update("ctmAccountId", e.target.value)} placeholder="CTM-ABC123" data-testid="input-ctm-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nimbata" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> Nimbata Account ID</Label>
              <Input id="nimbata" value={form.nimbataAccountId} onChange={e => update("nimbataAccountId", e.target.value)} placeholder="Nimbata account ID" data-testid="input-nimbata-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="airtableBase" className="flex items-center gap-1.5"><Database className="w-3 h-3" /> Airtable Base ID</Label>
              <Input id="airtableBase" value={form.airtableBaseId} onChange={e => update("airtableBaseId", e.target.value)} placeholder="appXXXXXXXXXXXXXX" data-testid="input-airtable-base-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="airtableTable" className="flex items-center gap-1.5"><Database className="w-3 h-3" /> Airtable Table Name</Label>
              <Input id="airtableTable" value={form.airtableTableName} onChange={e => update("airtableTableName", e.target.value)} placeholder="e.g., Anchored Tides" data-testid="input-airtable-table-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="airtableView" className="flex items-center gap-1.5"><Database className="w-3 h-3" /> Airtable View Name</Label>
              <Input id="airtableView" value={form.airtableViewName} onChange={e => update("airtableViewName", e.target.value)} placeholder="Published" data-testid="input-airtable-view-name" />
            </div>
            <div className="md:col-span-2">
              <GbpLocationPicker value={form.gbpLocationName} onChange={v => update("gbpLocationName", v)} clientName={form.name} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="gbpProfileUrl" className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> GBP Listing URL
              </Label>
              <Input
                id="gbpProfileUrl"
                value={form.gbpProfileUrl}
                onChange={e => update("gbpProfileUrl", e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                data-testid="input-gbp-profile-url"
              />
              {form.gbpProfileUrl && (
                <a
                  href={form.gbpProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary underline hover:opacity-80"
                  data-testid="link-gbp-profile"
                >
                  → Open Google Business Profile listing
                </a>
              )}
              {!form.gbpProfileUrl && (
                <p className="text-[11px] text-muted-foreground">
                  Paste the Google Maps link for this client's GBP listing so you can access it quickly.
                </p>
              )}
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
    alwaysShow: true,
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
    alwaysShow: true,
  },
  {
    key: "gbp",
    label: "Google Business Profile",
    short: "GBP",
    credService: "google_business_profile",
    icon: MapPin,
    getValue: (c: Client) => (c as any).gbpLocationName,
    format: (v: string) => v,
    isManual: false,
    alwaysShow: true,
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
    alwaysShow: true,
  },
  {
    key: "airtable",
    label: "Airtable Work Log",
    short: "Airtable",
    credService: "airtable",
    icon: Database,
    getValue: (c: Client) => (c as any).airtableBaseId,
    format: (v: string) => v,
    isManual: false,
    alwaysShow: true,
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
    alwaysShow: true,
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
    alwaysShow: false,
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
    alwaysShow: false,
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
    alwaysShow: false,
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
    alwaysShow: false,
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
    alwaysShow: false,
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
  onSfUpload,
  sfUploading,
  onSfCompare,
}: {
  def: (typeof SERVICE_DEFS)[number];
  client: Client;
  credentials: CredentialSafe[];
  sfReport?: SfSummaryRow | null;
  ctReport?: CtSummaryRow | null;
  onCtUpload?: (file: File) => void;
  ctUploading?: boolean;
  onSfUpload?: (file: File) => void;
  sfUploading?: boolean;
  onSfCompare?: () => void;
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
  const brokenConnection = hasId && !hasCred && !isManual;
  const notConfigured = !hasSfUpload && !hasCTUpload && !hasId;

  if (notConfigured) return null;

  const Icon = def.icon;

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-md border text-sm ${
        fullyConnected
          ? "bg-green-50 border-green-100 dark:bg-green-950/20 dark:border-green-900/40"
          : brokenConnection
          ? "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900/40"
          : "bg-muted/30 border-border/50 opacity-60"
      }`}
      data-testid={`service-row-${def.key}-${client.id}`}
    >
      <div className="mt-0.5 shrink-0">
        {fullyConnected ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : brokenConnection ? (
          <XCircle className="w-4 h-4 text-red-500" />
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
          <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">Connection broken — check Setup</p>
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
            {onSfCompare && (
              <button
                onClick={onSfCompare}
                className="inline-flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded px-1.5 py-0.5 hover:underline"
                data-testid={"sf-compare-btn-" + client.id}
              >
                <GitCompare className="w-2.5 h-2.5" />
                Compare crawls
              </button>
            )}
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
  const [sfDiffOpen, setSfDiffOpen] = useState(false);
  const [sfDiffLoading, setSfDiffLoading] = useState(false);
  const [sfDiffData, setSfDiffData] = useState<any>(null);
  const [sfDiffError, setSfDiffError] = useState<string | null>(null);

  const handleSfCompare = async () => {
    setSfDiffOpen(true);
    setSfDiffLoading(true);
    setSfDiffData(null);
    setSfDiffError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}/sf-diff`);
      const json = await res.json();
      if (!res.ok) {
        setSfDiffError(json.message || "Failed to compare crawls");
      } else {
        setSfDiffData(json);
      }
    } catch (e: any) {
      setSfDiffError(e.message || "Network error");
    } finally {
      setSfDiffLoading(false);
    }
  };
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

  const visibleDefs = SERVICE_DEFS.filter(def => {
    if (def.key === "sf") return !!(sfSummary.find(r => r.clientId === client.id));
    if (def.key === "ct_manual") return !!(ctSummary.find(r => r.clientId === client.id));
    return !!def.getValue(client);
  });
  const connectedCount = visibleDefs.filter(def => {
    const hasId = !!def.getValue(client);
    const hasCred = def.credService ? credentials.some(c => c.service === def.credService) : true;
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
              {connectedCount} of {visibleDefs.length} sources connected
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
          <ServiceRow key={def.key} def={def} client={client} credentials={credentials} sfReport={def.key === "sf" ? clientSfReport : undefined} ctReport={def.key === "ct_manual" ? clientCtReport : undefined} onCtUpload={def.key === "ct_manual" ? handleCtUpload : undefined} ctUploading={def.key === "ct_manual" ? ctUploading : undefined} onSfCompare={def.key === "sf" && clientSfReport ? handleSfCompare : undefined} />
        ))}
      </div>

      <Dialog open={sfDiffOpen} onOpenChange={setSfDiffOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GitCompare className="w-4 h-4" /> Crawl Comparison — {client.name}</DialogTitle>
            {sfDiffData && (
              <DialogDescription>
                {sfDiffData.oldReport.filename} → {sfDiffData.newReport.filename}
              </DialogDescription>
            )}
          </DialogHeader>
          {sfDiffLoading && <div className="py-8 text-center text-sm text-muted-foreground">Comparing crawls…</div>}
          {sfDiffError && <div className="py-4 text-sm text-red-600 dark:text-red-400">{sfDiffError}</div>}
          {sfDiffData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40">
                  <p className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="sf-diff-fixed-count">{sfDiffData.summary.fixed}</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 flex items-center justify-center gap-1"><CheckCheck className="w-3 h-3" /> Fixed</p>
                </div>
                <div className="rounded-md border p-3 text-center bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40">
                  <p className="text-xl font-bold text-red-700 dark:text-red-400" data-testid="sf-diff-new-issues-count">{sfDiffData.summary.newIssues}</p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 flex items-center justify-center gap-1"><XCircle className="w-3 h-3" /> New Issues</p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xl font-bold" data-testid="sf-diff-changes-count">{sfDiffData.summary.statusChanges}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Status Changes</p>
                </div>
              </div>
              {sfDiffData.fixed.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5 flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Fixed ({sfDiffData.fixed.length})</h4>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50"><tr><th className="text-left px-2 py-1.5 font-medium">URL</th><th className="text-left px-2 py-1.5 font-medium w-20">Was</th><th className="text-left px-2 py-1.5 font-medium w-20">Now</th></tr></thead>
                      <tbody>{sfDiffData.fixed.map((item: any, i: number) => (
                        <tr key={i} className="border-t"><td className="px-2 py-1.5 truncate max-w-[320px] font-mono text-[11px]" title={item.url}>{item.url}</td><td className="px-2 py-1.5 text-red-600">{item.oldStatus}</td><td className="px-2 py-1.5 text-green-600">{item.newStatus}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {sfDiffData.newIssues.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1"><XCircle className="w-3 h-3" /> New Issues ({sfDiffData.newIssues.length})</h4>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50"><tr><th className="text-left px-2 py-1.5 font-medium">URL</th><th className="text-left px-2 py-1.5 font-medium w-20">Was</th><th className="text-left px-2 py-1.5 font-medium w-20">Now</th></tr></thead>
                      <tbody>{sfDiffData.newIssues.map((item: any, i: number) => (
                        <tr key={i} className="border-t"><td className="px-2 py-1.5 truncate max-w-[320px] font-mono text-[11px]" title={item.url}>{item.url}</td><td className="px-2 py-1.5 text-green-600">{item.oldStatus}</td><td className="px-2 py-1.5 text-red-600">{item.newStatus}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {sfDiffData.statusChanges.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Other Status Changes ({sfDiffData.statusChanges.length})</h4>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50"><tr><th className="text-left px-2 py-1.5 font-medium">URL</th><th className="text-left px-2 py-1.5 font-medium w-20">Was</th><th className="text-left px-2 py-1.5 font-medium w-20">Now</th></tr></thead>
                      <tbody>{sfDiffData.statusChanges.map((item: any, i: number) => (
                        <tr key={i} className="border-t"><td className="px-2 py-1.5 truncate max-w-[320px] font-mono text-[11px]" title={item.url}>{item.url}</td><td className="px-2 py-1.5">{item.oldStatus}</td><td className="px-2 py-1.5">{item.newStatus}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {sfDiffData.newPages.length > 0 && (
                <p className="text-xs text-muted-foreground">{sfDiffData.summary.newPages} new pages crawled · {sfDiffData.summary.removedPages} pages removed since last crawl.</p>
              )}
              {sfDiffData.fixed.length === 0 && sfDiffData.newIssues.length === 0 && sfDiffData.statusChanges.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No status code changes between these two crawls.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                callrailAccountId: (editingClient as any).callrailAccountId || "",
                ctmAccountId: editingClient.ctmAccountId || "",
                ahrefsProjectUrl: editingClient.ahrefsProjectUrl || "",
                semrushProjectId: editingClient.semrushProjectId || "",
                screamingFrogProfile: editingClient.screamingFrogProfile || "",
                nimbataAccountId: (editingClient as any).nimbataAccountId || "",
                airtableBaseId: (editingClient as any).airtableBaseId || "",
                airtableTableName: (editingClient as any).airtableTableName || "",
                airtableViewName: (editingClient as any).airtableViewName || "Published",
                gbpLocationName: (editingClient as any).gbpLocationName || "",
                gbpProfileUrl: (editingClient as any).gbpProfileUrl || "",
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
