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
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface CredentialSafe {
  id: number;
  service: string;
  credentialType: string;
  hasValue: boolean;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

function IntegrationCard({
  title,
  description,
  icon: Icon,
  iconBg,
  connected,
  onConnect,
  onDisconnect,
  children,
}: {
  title: string;
  description: string;
  icon: any;
  iconBg: string;
  connected: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className={`flex items-center justify-center w-11 h-11 rounded-lg ${iconBg}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-sm">{title}</h3>
            <Badge variant={connected ? "default" : "secondary"} className="text-[10px]">
              {connected ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" /> Not Connected</>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
          {children}
          <div className="flex gap-2 mt-3 flex-wrap">
            {!connected && onConnect && (
              <Button size="sm" onClick={onConnect} data-testid={`button-connect-${title.toLowerCase().replace(/\s+/g, "-")}`}>
                <LinkIcon className="w-3 h-3 mr-1.5" />
                Connect
              </Button>
            )}
            {connected && onDisconnect && (
              <Button size="sm" variant="outline" onClick={onDisconnect} data-testid={`button-disconnect-${title.toLowerCase().replace(/\s+/g, "-")}`}>
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function SetupPage() {
  const [callrailKey, setCallrailKey] = useState("");
  const [callrailDialogOpen, setCallrailDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: credentials = [], isLoading } = useQuery<CredentialSafe[]>({
    queryKey: ["/api/credentials"],
  });

  const saveCredentialMutation = useMutation({
    mutationFn: async (data: { service: string; credentialType: string; value: string }) => {
      return apiRequest("POST", "/api/credentials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Credential saved successfully" });
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/credentials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credentials"] });
      toast({ title: "Credential removed" });
    },
  });

  const hasGoogleAuth = credentials.some(c => c.service === "google" && c.hasValue);
  const hasCallrailKey = credentials.some(c => c.service === "callrail" && c.hasValue);
  const callrailCred = credentials.find(c => c.service === "callrail");

  const handleSaveCallrailKey = () => {
    if (!callrailKey.trim()) return;
    saveCredentialMutation.mutate({
      service: "callrail",
      credentialType: "api_key",
      value: callrailKey,
    });
    setCallrailKey("");
    setCallrailDialogOpen(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" data-testid="text-setup-title">Setup</h1>
        <p className="text-sm text-muted-foreground">Connect your data sources and configure API credentials.</p>
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
              <p className="text-sm font-medium mb-1">Demo Mode Active</p>
              <p className="text-xs text-muted-foreground">
                SmartEO is currently running with simulated data. Connect your Google and CallRail accounts below to pull real data. All API keys are encrypted at rest.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Data Sources</h2>

          <IntegrationCard
            title="Google Search Console"
            description="Access search analytics data including queries, pages, clicks, impressions, CTR, and position data."
            icon={Globe}
            iconBg="bg-blue-600"
            connected={hasGoogleAuth}
            onConnect={() => {
              toast({
                title: "Google OAuth",
                description: "Google OAuth integration requires setting up OAuth2 credentials in Google Cloud Console. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as environment variables.",
              });
            }}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Shield className="w-3 h-3" />
              Requires OAuth2 with offline access for refresh tokens
            </div>
          </IntegrationCard>

          <IntegrationCard
            title="Google Analytics 4"
            description="Pull organic funnel metrics including sessions, users, conversions, and landing page performance data."
            icon={BarChart3}
            iconBg="bg-orange-600"
            connected={hasGoogleAuth}
            onConnect={() => {
              toast({
                title: "Google OAuth",
                description: "GA4 uses the same Google OAuth2 credentials as Search Console. Connect Google to enable both.",
              });
            }}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Shield className="w-3 h-3" />
              Uses GA4 Data API (same OAuth as GSC)
            </div>
          </IntegrationCard>

          <IntegrationCard
            title="CallRail"
            description="Track organic phone calls, unique callers, call duration, qualified leads, and call-to-page attribution."
            icon={Phone}
            iconBg="bg-green-600"
            connected={hasCallrailKey}
            onConnect={() => setCallrailDialogOpen(true)}
            onDisconnect={callrailCred ? () => deleteCredentialMutation.mutate(callrailCred.id) : undefined}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Key className="w-3 h-3" />
              API v3 key required
            </div>
          </IntegrationCard>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Security</h2>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-medium mb-1">Encryption Status</h3>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default" className="text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  All API keys and refresh tokens are encrypted at rest using server-side encryption. The encryption key is stored as an environment variable (SESSION_SECRET).
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
              { cmd: "GA4 Organic Funnel", desc: "Sessions, conversions, CVR trends", icon: BarChart3 },
              { cmd: "GA4 Landing Pages", desc: "Top 20 by conversions with CVR", icon: BarChart3 },
              { cmd: "CallRail Organic Calls", desc: "Calls, unique callers, qualified %", icon: Phone },
              { cmd: "CallRail Landing Pages", desc: "Call volume by landing page", icon: Phone },
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

      <Dialog open={callrailDialogOpen} onOpenChange={setCallrailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect CallRail</DialogTitle>
            <DialogDescription>Enter your CallRail API v3 key. You can find this in your CallRail account settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="callrail-key">API Key</Label>
              <Input
                id="callrail-key"
                type="password"
                value={callrailKey}
                onChange={e => setCallrailKey(e.target.value)}
                placeholder="Enter your CallRail API key"
                data-testid="input-callrail-key"
              />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
              <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Your API key will be encrypted and stored securely. It will never be exposed to the frontend.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSaveCallrailKey}
              disabled={!callrailKey.trim() || saveCredentialMutation.isPending}
              data-testid="button-save-callrail-key"
            >
              {saveCredentialMutation.isPending ? "Saving..." : "Save & Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
