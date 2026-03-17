import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
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

type HealthData = Record<number, { success: boolean; message: string }>;

function CredStatusIcon({ status, loading }: { status?: { success: boolean }; loading?: boolean }) {
  if (loading) return <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />;
  if (!status) return <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />;
  if (status.success) return <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />;
  return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
}

function ServiceSection({
  config,
  credentials,
  onAddAccount,
  onDeleteAccount,
  onTestAccount,
  testStates,
  healthData,
  healthLoading,
}: {
  config: ServiceConfig;
  credentials: CredentialSafe[];
  onAddAccount: (config: ServiceConfig) => void;
  onDeleteAccount: (id: number) => void;
  onTestAccount: (id: number) => void;
  testStates: Record<number, TestState>;
  healthData?: HealthData;
  healthLoading?: boolean;
}) {
  const Icon = getServiceIcon(config.id);
  const serviceCredentials = credentials.filter(c => c.service === config.id);
  const hasAccounts = serviceCredentials.length > 0;

  // Determine per-credential effective status (manual test overrides health check)
  const getEffective = (id: number): { success: boolean; message: string } | undefined => {
    const ts = testStates[id];
    if (ts?.success !== undefined) return { success: ts.success, message: ts.message ?? "" };
    return healthData?.[id];
  };

  // Service-level health: any failed credential = "needs attention"
  const anyFailed = hasAccounts && serviceCredentials.some(c => getEffective(c.id)?.success === false);
  const allOk = hasAccounts && serviceCredentials.every(c => getEffective(c.id)?.success === true);
  const isChecking = hasAccounts && healthLoading && serviceCredentials.every(c => testStates[c.id]?.success === undefined);

  const badgeContent = (() => {
    if ((config.authType as string) === "mcp_only") return <><XCircle className="w-3 h-3 mr-1" /> Not Connected</>;
    if (config.authType === "desktop") return <><Monitor className="w-3 h-3 mr-1" /> Manual Import</>;
    if (!hasAccounts) return <><XCircle className="w-3 h-3 mr-1" /> Not Connected</>;
    if (anyFailed) return <><AlertTriangle className="w-3 h-3 mr-1" /> Needs Attention</>;
    if (isChecking) return <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking…</>;
    if (allOk) return <><CheckCircle2 className="w-3 h-3 mr-1" /> {serviceCredentials.length} Account{serviceCredentials.length > 1 ? "s" : ""}</>;
    return <><CheckCircle2 className="w-3 h-3 mr-1" /> {serviceCredentials.length} Account{serviceCredentials.length > 1 ? "s" : ""}</>;
  })();

  const badgeVariant = anyFailed
    ? "outline"
    : (config.authType as string) === "mcp_only" || config.authType === "desktop" || !hasAccounts
      ? "secondary"
      : "default";

  const badgeClass = anyFailed
    ? "text-[10px] border-amber-400 text-amber-700 dark:text-amber-400"
    : "text-[10px]";

  return (
    <Card className={`p-5 ${anyFailed ? "border-amber-300 dark:border-amber-700" : ""}`}>
      <div className="flex items-start gap-4">
        <div className={`flex items-center justify-center w-11 h-11 rounded-lg shrink-0 ${config.color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-sm" data-testid={`text-service-${config.id}`}>{config.name}</h3>
            <Badge variant={badgeVariant} className={badgeClass}>
              {badgeContent}
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
                const effective = getEffective(cred.id);
                const isTesting = ts?.testing;
                const rowFailed = effective?.success === false;

                return (
                  <div key={cred.id} className="flex flex-col gap-1">
                    <div className={`flex items-center justify-between gap-2 p-2 rounded-md ${rowFailed ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-muted/50"}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <CredStatusIcon status={effective} loading={isTesting || (!effective && isChecking)} />
                        <span className="text-xs font-medium truncate">{cred.accountLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{cred.credentialType.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onTestAccount(cred.id)}
                          disabled={isTesting}
                          title="Retest connection"
                          data-testid={`button-test-cred-${cred.id}`}
                        >
                          {isTesting
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
                    {effective && !isTesting && (
                      <div className={`flex items-start gap-1.5 px-2 py-1.5 rounded text-[10px] leading-snug ${effective.success ? "text-green-700 dark:text-green-400 bg-green-500/10" : "text-red-700 dark:text-red-400 bg-red-500/10"}`}>
                        {effective.success
                          ? <CheckCircle2 className="w-3 h-3 shrink-0 mt-px" />
                          : <XCircle className="w-3 h-3 shrink-0 mt-px" />}
                        <span>{effective.success ? "Connected — " : ""}{effective.message}</span>
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
  const [qssbDocInput, setQssbDocInput] = useState("");
  const [qssbTesting, setQssbTesting] = useState(false);
  const [notionPageUrl, setNotionPageUrl] = useState("");
  const [notionPageLabel, setNotionPageLabel] = useState("");
  const [notionTestStates, setNotionTestStates] = useState<Record<string, { loading: boolean; success?: boolean; entries?: number; childPages?: number; childPageList?: { id: string; title: string; accessible: boolean; entries: number }[]; source?: string; error?: string }>>({});
  const [notionExpandedPages, setNotionExpandedPages] = useState<Record<string, boolean>>({});
  const [notionRenamingId, setNotionRenamingId] = useState<string | null>(null);
  const [notionRenameValue, setNotionRenameValue] = useState("");
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
      await apiRequest("PUT", "/api/settings/google_sheet_url", { value: url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Sheet URL saved" });
      setSheetUrlInput("");
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const savedQssbDocId = appSettings["qssb_document_id"] ?? "";

  const { data: notionPages = [], isLoading: notionPagesLoading, refetch: refetchNotionPages } = useQuery<{ id: string; label: string; addedAt: string }[]>({
    queryKey: ["/api/notion-pages"],
    staleTime: 60 * 1000,
  });

  const saveQssbMutation = useMutation({
    mutationFn: async (docUrl: string) => {
      const match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const docId = match ? match[1] : docUrl.trim();
      await apiRequest("PUT", "/api/settings/qssb_document_id", { value: docId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "QSSB Document ID saved" });
      setQssbDocInput("");
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const addNotionPageMutation = useMutation({
    mutationFn: async ({ url, label }: { url: string; label: string }) => {
      return apiRequest("POST", "/api/notion-pages", { url, label });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion-pages"] });
      toast({ title: "Notion page added" });
      setNotionPageUrl("");
      setNotionPageLabel("");
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to add page", variant: "destructive" }),
  });

  const deleteNotionPageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return apiRequest("DELETE", `/api/notion-pages/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion-pages"] });
      toast({ title: "Notion page removed" });
    },
    onError: () => toast({ title: "Failed to remove page", variant: "destructive" }),
  });

  const renameNotionPageMutation = useMutation({
    mutationFn: async ({ pageId, label }: { pageId: string; label: string }) => {
      return apiRequest("PUT", `/api/notion-pages/${pageId}`, { label });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notion-pages"] });
      setNotionRenamingId(null);
      setNotionRenameValue("");
      toast({ title: "Page renamed" });
    },
    onError: () => toast({ title: "Failed to rename page", variant: "destructive" }),
  });

  const testNotionPage = async (pageId: string) => {
    setNotionTestStates(s => ({ ...s, [pageId]: { loading: true } }));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notion-pages/${pageId}/test`, { headers });
      const data = await res.json();
      setNotionTestStates(s => ({ ...s, [pageId]: { loading: false, ...data } }));
      if (data.childPageList?.length > 0) {
        setNotionExpandedPages(s => ({ ...s, [pageId]: true }));
      }
    } catch {
      setNotionTestStates(s => ({ ...s, [pageId]: { loading: false, error: "Test failed" } }));
    }
  };

  const testQssbConnection = async () => {
    setQssbTesting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/qssb/test", { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: `QSSB connected: ${data.insights} insights, ${data.opportunities} opportunities` });
      } else {
        toast({ title: data.message || "QSSB connection failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "QSSB test failed", variant: "destructive" });
    }
    setQssbTesting(false);
  };

  const { data: credentials = [], isLoading } = useQuery<CredentialSafe[]>({
    queryKey: ["/api/credentials"],
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["/api/credentials/health"],
    enabled: !isLoading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveCredentialMutation = useMutation({
    mutationFn: async (data: { service: string; credentialType: string; value: string; accountLabel: string }) => {
      return apiRequest("POST", "/api/credentials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credentials/health"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/credentials/health"] });
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
        queryClient.invalidateQueries({ queryKey: ["/api/credentials/health"] });
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
        queryClient.invalidateQueries({ queryKey: ["/api/credentials/health"] });
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
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/credentials/${id}/test`, { method: "POST", headers });
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

  // Compute how many services need attention based on health data
  const attentionServices = healthData
    ? SERVICE_CONFIGS.filter(s => {
        const svcCreds = credentials.filter(c => c.service === s.id);
        return svcCreds.some(c => {
          const ts = testStates[c.id];
          if (ts?.success !== undefined) return ts.success === false;
          return healthData[c.id]?.success === false;
        });
      })
    : [];

  const sharedSectionProps = {
    credentials,
    onAddAccount: handleOpenConnect,
    onDeleteAccount: (id: number) => deleteCredentialMutation.mutate(id),
    onTestAccount: handleTestAccount,
    testStates,
    healthData,
    healthLoading,
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "#0891B2" }} data-testid="text-setup-title">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect your data sources and reporting tools. Each service supports multiple accounts for managing different clients. Use the Available Commands section at the bottom to see what each integration powers inside SmartEO.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {attentionServices.length > 0 && (
          <Card className="p-4 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-0.5">
                  {attentionServices.length} integration{attentionServices.length > 1 ? "s" : ""} need{attentionServices.length === 1 ? "s" : ""} attention
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {attentionServices.map(s => s.name).join(", ")} — see the error details below each affected account and follow the instructions to reconnect.
                </p>
              </div>
            </div>
          </Card>
        )}

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
            <ServiceSection key={config.id} config={config} {...sharedSectionProps} />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Call Tracking
          </h2>
          {SERVICE_CONFIGS.filter(s => ["callrail", "call_tracking_metrics", "nimbata"].includes(s.id)).map(config => (
            <ServiceSection key={config.id} config={config} {...sharedSectionProps} />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            SEO Tools
          </h2>
          {SERVICE_CONFIGS.filter(s => ["ahrefs", "semrush", "screaming_frog"].includes(s.id)).map(config => (
            <ServiceSection key={config.id} config={config} {...sharedSectionProps} />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Work Tracking
          </h2>
          {SERVICE_CONFIGS.filter(s => ["airtable"].includes(s.id)).map(config => (
            <ServiceSection key={config.id} config={config} {...sharedSectionProps} />
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
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">QSSB & Strategy Bank</h2>
          <Card className="p-4">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">QSSB Google Document</h3>
                  {savedQssbDocId && (
                    <Badge variant="default" className="text-[10px]">
                      <CheckCircle className="w-3 h-3 mr-1" /> Configured
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Paste the Google Docs URL or document ID for the QSSB document. This powers the "Client Insights" and "Additional Opportunities" sections in QBR reports.
                </p>
                {savedQssbDocId && (
                  <div className="flex items-center gap-2 p-1.5 rounded bg-muted/50 mb-2">
                    <Link className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate" data-testid="text-qssb-doc-id">{savedQssbDocId}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/document/d/… or document ID"
                    value={qssbDocInput}
                    onChange={e => setQssbDocInput(e.target.value)}
                    className="text-xs h-8"
                    data-testid="input-qssb-doc"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveQssbMutation.mutate(qssbDocInput.trim())}
                    disabled={!qssbDocInput.trim() || saveQssbMutation.isPending}
                    data-testid="button-save-qssb"
                  >
                    {savedQssbDocId ? "Update" : "Save"}
                  </Button>
                  {savedQssbDocId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={testQssbConnection}
                      disabled={qssbTesting}
                      data-testid="button-test-qssb"
                    >
                      {qssbTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">Notion SEO Strategy Bank</h3>
                  {notionPages.length > 0 && (
                    <Badge variant="default" className="text-[10px]">
                      <CheckCircle className="w-3 h-3 mr-1" /> {notionPages.length} {notionPages.length === 1 ? "page" : "pages"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Add up to 50 Notion pages. SmartEO reads each page and its direct sub-pages, then merges all entries into reports. Each page must have the SmartEO integration connected in Notion (••• → Connections).
                </p>

                {notionPagesLoading ? (
                  <div className="space-y-1.5 mb-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : notionPages.length > 0 ? (
                  <div className="space-y-1 mb-3">
                    {notionPages.map((page) => {
                      const ts = notionTestStates[page.id];
                      const expanded = notionExpandedPages[page.id] ?? false;
                      const hasChildPages = (ts?.childPageList?.length ?? 0) > 0;
                      return (
                        <div key={page.id} className="rounded border border-border overflow-hidden">
                          <div className="flex items-center gap-2 p-2 bg-muted/30">
                            {ts?.loading ? (
                              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                            ) : ts?.success === false ? (
                              <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            ) : ts?.entries != null && ts.entries > 0 ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Link className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              {notionRenamingId === page.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={notionRenameValue}
                                    onChange={e => setNotionRenameValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") renameNotionPageMutation.mutate({ pageId: page.id, label: notionRenameValue });
                                      if (e.key === "Escape") { setNotionRenamingId(null); setNotionRenameValue(""); }
                                    }}
                                    className="text-xs h-6 py-0 px-1.5"
                                    autoFocus
                                    data-testid={`input-rename-notion-${page.id}`}
                                  />
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-500" onClick={() => renameNotionPageMutation.mutate({ pageId: page.id, label: notionRenameValue })} disabled={!notionRenameValue.trim() || renameNotionPageMutation.isPending}>
                                    <CheckCircle2 className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setNotionRenamingId(null); setNotionRenameValue(""); }}>
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 group">
                                  <span className="text-xs font-medium truncate">{page.label}</span>
                                  <button
                                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0 h-4 w-4 shrink-0 text-muted-foreground"
                                    onClick={() => { setNotionRenamingId(page.id); setNotionRenameValue(page.label); }}
                                    data-testid={`button-rename-notion-${page.id}`}
                                    title="Rename"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                </div>
                              )}
                              {notionRenamingId !== page.id && ts?.entries != null && (
                                <span className={`text-[10px] ${ts.success === false ? "text-red-500" : ts.entries > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                                  {ts.success === false ? (ts.error ?? "Access error") : ts.entries === 0 ? "0 entries — check Notion access" : `${ts.entries} entries${ts.childPages ? `, ${ts.childPages} sub-page${ts.childPages !== 1 ? "s" : ""}` : ""} via ${ts.source === "database" ? "database" : "page blocks"}`}
                                </span>
                              )}
                            </div>
                            {hasChildPages && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
                                onClick={() => setNotionExpandedPages(s => ({ ...s, [page.id]: !expanded }))}
                                data-testid={`button-expand-notion-${page.id}`}
                                title={expanded ? "Hide sub-pages" : "Show sub-pages"}
                              >
                                <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={() => testNotionPage(page.id)}
                              disabled={ts?.loading}
                              data-testid={`button-test-notion-${page.id}`}
                              title="Test page access"
                            >
                              <Wifi className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-600 shrink-0"
                              onClick={() => deleteNotionPageMutation.mutate(page.id)}
                              disabled={deleteNotionPageMutation.isPending}
                              data-testid={`button-delete-notion-${page.id}`}
                              title="Remove page"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          {expanded && hasChildPages && (
                            <div className="border-t border-border bg-muted/10 px-2 py-1.5 space-y-0.5">
                              {(() => {
                                const accessible = ts.childPageList!.filter(c => c.accessible).length;
                                const total = ts.childPageList!.length;
                                const locked = total - accessible;
                                return (
                                  <div className="flex items-start justify-between mb-1.5">
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{accessible}/{total} sub-pages readable</p>
                                    {locked > 0 && (
                                      <span className="text-[10px] text-muted-foreground italic ml-2 text-right leading-tight">
                                        Open locked pages in Notion → ··· → Connections → add integration
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {ts.childPageList!.map((child) => (
                                <div key={child.id} className="flex items-center gap-2 py-0.5">
                                  {child.accessible ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                  ) : (
                                    <svg className="w-3 h-3 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                  )}
                                  <span className={`text-xs flex-1 truncate ${child.accessible ? "" : "text-muted-foreground"}`}>{child.title}</span>
                                  {child.accessible ? (
                                    <span className="text-[10px] text-muted-foreground shrink-0">{child.entries} entries</span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground shrink-0">not shared</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Input
                    placeholder="Label (e.g. Anchored Tides Strategy)"
                    value={notionPageLabel}
                    onChange={e => setNotionPageLabel(e.target.value)}
                    className="text-xs h-8 w-40 shrink-0"
                    data-testid="input-notion-label"
                  />
                  <Input
                    placeholder="https://www.notion.so/… or page ID"
                    value={notionPageUrl}
                    onChange={e => setNotionPageUrl(e.target.value)}
                    className="text-xs h-8"
                    data-testid="input-notion-url"
                  />
                  <Button
                    size="sm"
                    onClick={() => addNotionPageMutation.mutate({ url: notionPageUrl.trim(), label: notionPageLabel.trim() })}
                    disabled={!notionPageUrl.trim() || !notionPageLabel.trim() || addNotionPageMutation.isPending}
                    data-testid="button-add-notion-page"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>
            </div>
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
