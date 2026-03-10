import { ShieldCheck, ShieldAlert, ShieldOff, ShieldQuestion, Lock, Key, Server, Globe, FileCheck, Filter, Upload, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type SecurityStatus = "active" | "partial" | "unverified" | "not_implemented";

interface SecurityCard {
  title: string;
  status: SecurityStatus;
  explanation: string;
  icon: React.ElementType;
}

const SECURITY_CARDS: SecurityCard[] = [
  {
    title: "Encryption at Rest",
    status: "active",
    explanation:
      "All API keys, refresh tokens, and third-party credentials are encrypted before being written to the database using AES-256-GCM. The encryption key is derived from the SESSION_SECRET environment variable stored in Replit Secrets.",
    icon: Lock,
  },
  {
    title: "Environment Secrets",
    status: "active",
    explanation:
      "Sensitive values (SESSION_SECRET, ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are stored exclusively in Replit Secrets and are never hardcoded in source files or committed to version control.",
    icon: Key,
  },
  {
    title: "API Authentication",
    status: "active",
    explanation:
      "All server API routes require a valid X-Internal-Token header. The token is generated server-side from SESSION_SECRET using SHA-256 and validated on every request, preventing unauthenticated access to the API layer.",
    icon: Server,
  },
  {
    title: "Credential Isolation",
    status: "active",
    explanation:
      "Each service credential (GSC, GA4, CallRail, Ahrefs, etc.) is stored as an individual encrypted record in the api_credentials table. No plaintext values are returned to the frontend — only masked labels and connection status are exposed.",
    icon: ShieldCheck,
  },
  {
    title: "Input Validation",
    status: "active",
    explanation:
      "All API request bodies are validated using Zod schemas (derived from the Drizzle ORM insert schemas) before any database write. Invalid or malformed requests are rejected with a 400 error before reaching storage logic.",
    icon: FileCheck,
  },
  {
    title: "URL Scheme Enforcement",
    status: "active",
    explanation:
      "The Fill in the Gaps answer flow only accepts URLs with http:// or https:// schemes. The schemes javascript:, data:, file:, ftp:, and mailto: are blocked on both the client and server sides to prevent injection through user-supplied links.",
    icon: Filter,
  },
  {
    title: "File Upload Validation",
    status: "active",
    explanation:
      "File attachments in the Fill in the Gaps flow are validated against an explicit MIME-type allowlist (PDF, images, Word, Excel, CSV, plain text) and a 5 MB size limit. Files outside these constraints are rejected before upload.",
    icon: Upload,
  },
  {
    title: "HTTPS / Secure Transport",
    status: "unverified",
    explanation:
      "HTTPS is enforced by the Replit hosting infrastructure for all published deployments. The application itself does not perform programmatic TLS configuration — this protection is inherited from the platform and cannot be independently verified at the application layer.",
    icon: Globe,
  },
  {
    title: "Access Control (Multi-User)",
    status: "partial",
    explanation:
      "SmartEO is an internal single-user tool. There is no multi-user account system or role-based access control (RBAC). Access is controlled entirely by the internal API token. If multi-user support is needed in the future, RBAC would need to be implemented.",
    icon: ShieldAlert,
  },
  {
    title: "Rate Limiting",
    status: "not_implemented",
    explanation:
      "No rate limiting is implemented at the application layer. The server does not throttle API requests per client or per endpoint. Rate limiting is available at the Replit deployment layer for published apps but is not configured in the application code.",
    icon: ShieldOff,
  },
];

const STATUS_CONFIG: Record<SecurityStatus, { label: string; badgeClass: string; iconColor: string; StatusIcon: React.ElementType }> = {
  active: {
    label: "Active",
    badgeClass: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    StatusIcon: ShieldCheck,
  },
  partial: {
    label: "Partial",
    badgeClass: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    StatusIcon: ShieldAlert,
  },
  unverified: {
    label: "Unverified",
    badgeClass: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    iconColor: "text-blue-500 dark:text-blue-400",
    StatusIcon: ShieldQuestion,
  },
  not_implemented: {
    label: "Not Implemented",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconColor: "text-muted-foreground",
    StatusIcon: Minus,
  },
};

function SecurityCardItem({ card }: { card: SecurityCard }) {
  const cfg = STATUS_CONFIG[card.status];
  const CardIcon = card.icon;

  return (
    <Card className="p-4" data-testid={`card-security-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
          <CardIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-medium" data-testid={`text-security-title-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
              {card.title}
            </h3>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.badgeClass}`}>
              <cfg.StatusIcon className={`w-2.5 h-2.5 mr-1 ${cfg.iconColor}`} />
              {cfg.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {card.explanation}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function SecurityPage() {
  const active = SECURITY_CARDS.filter(c => c.status === "active").length;
  const total = SECURITY_CARDS.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" data-testid="text-security-title">Security</h1>
          <p className="text-sm text-muted-foreground">
            An honest overview of security measures implemented in SmartEO. Statuses reflect what is actually active in the codebase — unverified or unimplemented items are labelled clearly.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              {active} of {total} protections active
            </span>
          </div>
        </div>

        <div className="space-y-3" data-testid="list-security-cards">
          {SECURITY_CARDS.map(card => (
            <SecurityCardItem key={card.title} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
