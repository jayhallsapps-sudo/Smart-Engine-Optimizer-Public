import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Globe,
  BarChart3,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  Key,
  Link as LinkIcon,
  AlertTriangle,
  Info,
  Plus,
  Trash2,
  Search,
  Bug,
  LineChart,
  ExternalLink,
  Wifi,
  Loader2,
  Monitor,
  FileSpreadsheet,
  Link,
  CheckCircle,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { SERVICE_CONFIGS, type ServiceConfig } from "@shared/schema";
import { SiGoogle } from "react-icons/si";

interface CredentialSafe {
  id: number;
  service: string;
  credentialType: string;
  accountLabel: string;
  hasValue: boolean;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

function getServiceIcon(serviceId: string) {
  switch (serviceId) {
    case "google_search_console": return Globe;
    case "google_analytics_4": return BarChart3;
    case "callrail": return Phone;
    case "call_tracking_metrics": return Phone;
    case "nimbata": return Phone;
    case "ahrefs": return LinkIcon;
    case "semrush": return LineChart;
    case "screaming_frog": return Bug;
    case "google_business_profile": return MapPin;
    default: return Key;
  }
}

interface TestState {
  testing: boolean;
  success?: boolean;
  message?: string;
}

function ServiceSection({
  config,
  credentials,
  onAddAccount,
  onDeleteAccount,
  onTestAccount,
  testStates,
}: {
  config: ServiceConfig;
  credentials: CredentialSafe[];
  onAddAccount: (config: ServiceConfig) => void;
  onDeleteAccount: (id: number) => void;
  onTestAccount: (id: number) => void;
  testStates: Record<number, TestState>;
}) {
  const Icon = getServiceIcon(config.id);
  const serviceCredentials = credentials.filter(c => c.service === config.id);
  const hasAccounts = serviceCredentials.length > 0;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className={`flex items-center justify-center w-11 h-11 rounded-lg shrink-0 ${config.color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-sm" data-testid={`text-service-${config.id}`}>{config.name}</h3>
            <Badge
            variant={(config.authType as string) === "mcp_only" ? "outline" : config.authType === "desktop" ? "outline" : hasAccounts ? "default" : "secondary"}
            className="text-[10px]"
          >
            {(config.authType as string) === "mcp_only" ? (
              <><XCircle className="w-3 h-3 mr-1" /> Not Connected</>
            ) : config.authType === "desktop" ? (
              <><Monitor className="w-3 h-3 mr-1" /> Manual Import</>
            ) : hasAccounts ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> {serviceCredentials.length} Account{serviceCredentials.length > 1 ? "s" : ""}</>
            ) : (
              <><XCircle className="w-3 h-3 mr-1" /> Not Connected</>
            )}
          </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{config.description}</p>

          {(config.authType as string) === "mcp_only" && (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/5 p-3 mb-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">Not available on this plan</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {config.name} data is only accessible via Ahrefs Connect / MCP integration. Direct API access is disabled. Features using {config.name} data will show an error until the integration is available.
              </p>
            </div>
          )}
          {(config.authType as string) !== "mcp_only" && config.authType === "oauth" && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
              <Shield className="w-3 h-3" />
              Requires OAuth2 with offline access for refresh tokens
            </div>
          )}
          {(config.authType as string) !== "mcp_only" && config.authType === "api_key" && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
              <Key className="w-3 h-3" />
              API key required
            </div>
          )}
          {config.authType === "desktop" && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
              <ExternalLink className="w-3 h-3" />
              Desktop app — export crawls as CSV and import manually
            </div>
          )}

          {(config.authType as string) !== "mcp_only" && serviceCredentials.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {serviceCredentials.map((cred) => {
                const ts = testStates?.[cred.id];
                return (
                  <div key={cred.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                        <span className="text-xs font-medium truncate">{cred.accountLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{cred.credentialType.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onTestAccount(cred.id)}
                          disabled={ts?.testing}
                          title="Test connection"
                          data-testid={`button-test-cred-${cred.id}`}
                        >
                          {ts?.testing
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Wifi className="w-3 h-3" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-delete-cred-${cred.id}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {cred.accountLabel}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will disconnect the {config.name} account "{cred.accountLabel}". You can re-add it later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDeleteAccount(cred.id)} data-testid="button-confirm-delete-cred">
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {ts && !ts.testing && ts.success !== undefined && (
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${ts.success ? "text-green-700 dark:text-green-400 bg-green-500/10" : "text-red-700 dark:text-red-400 bg-red-500/10"}`}>
                        {ts.success
                          ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                          : <XCircle className="w-3 h-3 shrink-0" />}
                        {ts.success ? "Connected — " : "Failed — "}{ts.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(config.authType as string) !== "desktop" && (config.authType as string) !== "mcp_only" && (config.supportsMultiple || !hasAccounts) && (
            <Button
              size="sm"
              variant={hasAccounts ? "outline" : "default"}
              onClick={() => onAddAccount(config)}
              data-testid={`button-add-${config.id}`}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              {hasAccounts ? "Add Another Account" : "Connect"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function SetupPage() {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [activeService, setActiveService] = useState<ServiceConfig | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [testStates, setTestStates] = useState<Record<number, TestState>>({});
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [sheetsConnecting, setSheetsConnecting] = useState(false);
  const { toast } = useToast();

  const { data: googleStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/google/configured"],
  });

  const { data: appSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const savedSheetUrl = appSettings["google_sheet_url"] ?? "";

  const saveSheetUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch("/api/settings/google_sheet_url", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: url }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Sheet URL saved" });
      setSheetUrlInput("");
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const { data: credentials = [], isLoading } = useQuery<CredentialSafe[]>({
    queryKey: ["/api/credentials"],
  });

  const saveCredentialMutation = useMutation({
    mutationFn: async (data: { service: string; credentialType: string; value: string; accountLabel: string }) => {
      return apiRequest("POST", "/api/credentials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Account connected successfully" });
      resetDialog();
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/credentials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Account disconnected" });
    },
  });

  const resetDialog = () => {
    setConnectDialogOpen(false);
    setActiveService(null);
    setAccountLabel("");
    setFieldValues({});
    setGoogleConnecting(false);
  };

  const handleSheetsOAuth = () => {
    setSheetsConnecting(true);
    const w = 600, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const url = `/api/auth/google/start?service=google_sheets&accountLabel=${encodeURIComponent("Google Sheets")}`;
    const popup = window.open(url, "google_oauth", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type !== "google_oauth_result") return;
      window.removeEventListener("message", messageHandler);
      setSheetsConnecting(false);
      if (event.data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
        toast({ title: "Google Sheets access authorized" });
      } else {
        toast({ title: "Authorization failed", description: event.data.message, variant: "destructive" });
      }
    };
    window.addEventListener("message", messageHandler);
    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", messageHandler);
        setSheetsConnecting(false);
      }
    }, 500);
  };

  const handleGoogleOAuth = () => {
    if (!activeService || !accountLabel.trim()) return;
    setGoogleConnecting(true);

    const w = 600, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const url = `/api/auth/google/start?service=${activeService.id}&accountLabel=${encodeURIComponent(accountLabel.trim())}`;
    const popup = window.open(url, "google_oauth", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type !== "google_oauth_result") return;
      window.removeEventListener("message", messageHandler);
      if (event.data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
        toast({ title: `${activeService.name} connected successfully` });
        resetDialog();
      } else {
        setGoogleConnecting(false);
        toast({ title: "Connection failed", description: event.data.message, variant: "destructive" });
      }
    };
    window.addEventListener("message", messageHandler);

    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", messageHandler);
        setGoogleConnecting(false);
      }
    }, 500);
  };

  const handleTestAccount = async (id: number) => {
    setTestStates(prev => ({ ...prev, [id]: { testing: true } }));
    try {
      const res = await fetch(`/api/credentials/${id}/test`, { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      setTestStates(prev => ({ ...prev, [id]: { testing: false, success: data.success, message: data.message } }));
    } catch {
      setTestStates(prev => ({ ...prev, [id]: { testing: false, success: false, message: "Request failed" } }));
    }
  };

  const handleOpenConnect = (config: ServiceConfig) => {
    setActiveService(config);
    setAccountLabel("");
    setFieldValues({});
    setConnectDialogOpen(true);
  };

  const handleSaveCredentials = () => {
    if (!activeService || !accountLabel.trim()) return;

    for (const field of activeService.credentialFields) {
      const value = fieldValues[field.key];
      if (!value?.trim()) {
        toast({ title: `Please provide ${field.label}`, variant: "destructive" });
        return;
      }

      saveCredentialMutation.mutate({
        service: activeService.id,
        credentialType: field.key,
        value: value.trim(),
        accountLabel: accountLabel.trim(),
      });
    }
  };

  const connectableServiceIds = new Set(
    SERVICE_CONFIGS
      .filter(s => s.authType !== "desktop" && (s.authType as string) !== "mcp_only")
      .map(s => s.id)
  );
  const connectedCount = new Set(
    credentials.filter(c => connectableServiceIds.has(c.service as any)).map(c => c.service)
  ).size;
  const totalServices = connectableServiceIds.size;

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" data-testid="text-setup-title">Setup</h1>
        <p className="text-sm text-muted-foreground">
          Connect your data sources. Each service supports multiple accounts for managing different clients.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <Card className="p-4 bg-accent/30">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">
                {connectedCount > 0 ? `${connectedCount} of ${totalServices} services connected` : "Demo Mode Active"}
              </p>
              <p className="text-xs text-muted-foreground">
                {connectedCount > 0
                  ? "Connect additional services below to expand your data sources. All credentials are encrypted at rest."
                  : "SmartEO is currently running with simulated data. Connect your accounts below to pull real data from your recovery & addiction centre clients. All API keys are encrypted at rest."
                }
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Analytics & Search
          </h2>
          {SERVICE_CONFIGS.filter(s => ["google_search_console", "google_analytics_4", "google_business_profile"].includes(s.id)).map(config => (
            <ServiceSection
              key={config.id}
              config={config}
              credentials={credentials}
              onAddAccount={handleOpenConnect}
              onDeleteAccount={(id) => deleteCredentialMutation.mutate(id)}
              onTestAccount={handleTestAccount}
              testStates={testStates}
            />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Call Tracking
          </h2>
          {SERVICE_CONFIGS.filter(s => ["callrail", "call_tracking_metrics", "nimbata"].includes(s.id)).map(config => (
            <ServiceSection
              key={config.id}
              config={config}
              credentials={credentials}
              onAddAccount={handleOpenConnect}
              onDeleteAccount={(id) => deleteCredentialMutation.mutate(id)}
              onTestAccount={handleTestAccount}
              testStates={testStates}
            />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            SEO Tools
          </h2>
          {SERVICE_CONFIGS.filter(s => ["ahrefs", "semrush", "screaming_frog"].includes(s.id)).map(config => (
            <ServiceSection
              key={config.id}
              config={config}
              credentials={credentials}
              onAddAccount={handleOpenConnect}
              onDeleteAccount={(id) => deleteCredentialMutation.mutate(id)}
              onTestAccount={handleTestAccount}
              testStates={testStates}
            />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Work Tracking
          </h2>
          {SERVICE_CONFIGS.filter(s => ["airtable"].includes(s.id)).map(config => (
            <ServiceSection
              key={config.id}
              config={config}
              credentials={credentials}
              onAddAccount={handleOpenConnect}
              onDeleteAccount={(id) => deleteCredentialMutation.mutate(id)}
              onTestAccount={handleTestAccount}
              testStates={testStates}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Report Data Source
          </h2>
          <Card className="p-5">
            {(() => {
              const sheetsAuthorized = credentials.some(c => c.service === "google_sheets");
              const fullyConnected = sheetsAuthorized && !!savedSheetUrl;
              return (
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0 bg-emerald-600">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-medium text-sm">Google Sheets Data Source</h3>
                      {fullyConnected ? (
                        <Badge variant="default" className="text-[10px]">
                          <CheckCircle className="w-3 h-3 mr-1" /> Connected
                        </Badge>
                      ) : sheetsAuthorized ? (
                        <Badge variant="outline" className="text-[10px] text-yellow-700 dark:text-yellow-400 border-yellow-400">
                          Authorized — add sheet URL
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      The app reads your sheet using your Google account, so your existing share settings work as-is — no need to make it public.
                    </p>

                    {/* Step 1: Google authorization */}
                    <div className={`rounded-md border p-3 mb-3 ${sheetsAuthorized ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-muted/30"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {sheetsAuthorized
                            ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground shrink-0" />
                          }
                          <div>
                            <p className="text-xs font-medium">{sheetsAuthorized ? "Google account authorized" : "Step 1 — Authorize your Google account"}</p>
                            {!sheetsAuthorized && <p className="text-[11px] text-muted-foreground mt-0.5">Grants read-only access to Sheets on your behalf.</p>}
                          </div>
                        </div>
                        {!sheetsAuthorized && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSheetsOAuth}
                            disabled={sheetsConnecting || !googleStatus?.configured}
                            className="gap-1.5 shrink-0"
                            data-testid="button-authorize-sheets"
                          >
                            <SiGoogle className="w-3 h-3" />
                            {sheetsConnecting ? "Waiting…" : "Authorize"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Sheet URL */}
                    <div className={`rounded-md border p-3 ${!sheetsAuthorized ? "opacity-50 pointer-events-none" : "border-border"}`}>
                      <p className="text-xs font-medium mb-2">{savedSheetUrl ? "Sheet URL" : "Step 2 — Paste your sheet URL"}</p>
                      {savedSheetUrl && (
                        <div className="flex items-center gap-2 p-1.5 rounded bg-muted/50 mb-2">
                          <Link className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <a
                            href={savedSheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs hover:underline truncate"
                            style={{ color: "hsl(var(--link))" }}
                          >
                            {savedSheetUrl}
                          </a>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://docs.google.com/spreadsheets/d/…"
                          value={sheetUrlInput}
                          onChange={e => setSheetUrlInput(e.target.value)}
                          className="text-xs h-8"
                          data-testid="input-sheet-url"
                        />
                        <Button
                          size="sm"
                          onClick={() => saveSheetUrlMutation.mutate(sheetUrlInput.trim())}
                          disabled={!sheetUrlInput.trim() || saveSheetUrlMutation.isPending}
                          data-testid="button-save-sheet-url"
                        >
                          {savedSheetUrl ? "Update" : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Security</h2>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-medium mb-1">Encryption Status</h3>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default" className="text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    AES-256-GCM Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  All API keys, refresh tokens, and secrets are encrypted at rest using AES-256-GCM. The encryption key is derived from the server-side SESSION_SECRET environment variable.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Commands</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { cmd: "GSC QoQ Queries", desc: "Top 20 winners & losers by clicks delta", icon: Globe },
              { cmd: "GSC QoQ Pages", desc: "Page performance with money pages focus", icon: Globe },
              { cmd: "GA4 Organic Funnel", desc: "Sessions, admissions leads, CVR trends", icon: BarChart3 },
              { cmd: "GA4 Landing Pages", desc: "Top 20 by admissions leads with CVR", icon: BarChart3 },
              { cmd: "CallRail Organic Calls", desc: "Calls, unique callers, qualified %", icon: Phone },
              { cmd: "CTM Organic Calls", desc: "Call tracking metrics call volume", icon: Phone },
              { cmd: "Ahrefs Backlinks", desc: "DR, referring domains, top referrers", icon: LinkIcon },
              { cmd: "Ahrefs Keywords", desc: "Keyword rankings and movements", icon: LinkIcon },
              { cmd: "SEMrush Overview", desc: "Organic traffic and keyword estimates", icon: LineChart },
              { cmd: "SEMrush Rankings", desc: "Position tracking with CPC data", icon: LineChart },
            ].map((item, idx) => (
              <Card key={idx} className="p-3 flex items-start gap-3">
                <item.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">{item.cmd}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </motion.div>

      <Dialog open={connectDialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {activeService?.name}</DialogTitle>
            <DialogDescription>
              Add credentials for a {activeService?.name} account. You can add multiple accounts to manage different clients.
            </DialogDescription>
          </DialogHeader>
          {activeService && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-label">Account Label *</Label>
                <Input
                  id="account-label"
                  value={accountLabel}
                  onChange={e => setAccountLabel(e.target.value)}
                  placeholder="e.g., Main Agency Account, Client X Account"
                  data-testid="input-account-label"
                />
                <p className="text-[10px] text-muted-foreground">
                  A name to identify this account (e.g., your agency name or client name)
                </p>
              </div>

              {activeService.authType === "oauth" ? (
                <>
                  {!googleStatus?.configured && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        <strong>Google OAuth not configured.</strong> Add <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">GOOGLE_CLIENT_SECRET</code> secrets, then register <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">/api/auth/google/callback</code> as an authorized redirect URI in your Google Cloud Console.
                      </p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                    <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      You'll be redirected to Google to approve access. The refresh token is stored encrypted — your password is never shared with this app.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {activeService.credentialFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={field.key}>{field.label} *</Label>
                      <Input
                        id={field.key}
                        type={field.type}
                        value={fieldValues[field.key] || ""}
                        onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        data-testid={`input-${field.key}`}
                      />
                    </div>
                  ))}
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Your credentials are encrypted with AES-256-GCM and stored securely. They will never be exposed to the frontend.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancel</Button>
            {activeService?.authType === "oauth" ? (
              <Button
                onClick={handleGoogleOAuth}
                disabled={!accountLabel.trim() || googleConnecting || !googleStatus?.configured}
                data-testid="button-google-oauth"
                className="gap-2"
              >
                <SiGoogle className="w-3.5 h-3.5" />
                {googleConnecting ? "Waiting for Google..." : "Sign in with Google"}
              </Button>
            ) : (
              <Button
                onClick={handleSaveCredentials}
                disabled={!accountLabel.trim() || saveCredentialMutation.isPending}
                data-testid="button-save-credentials"
              >
                {saveCredentialMutation.isPending ? "Saving..." : "Save & Connect"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
