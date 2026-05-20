import { CheckCircle2, XCircle, MinusCircle, AlertCircle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Client } from "@shared/schema";
import { useClientSourceHealth, HEALTH_DOT_COLOR, type HealthStatus, type SourceHealth } from "@/hooks/useClientSourceHealth";

export interface SourceSpec {
  id: string;
  label: string;
  required: boolean;
  connected: (client: Client) => boolean;
  /** Returns true when the source is configured but only partially integrated (e.g. CSV-only, no live API) */
  isPartial?: (client: Client) => boolean;
  missingNote?: string;
  partialNote?: string;
}

export const ALL_SOURCE_SPECS: SourceSpec[] = [
  {
    id: "gsc",
    label: "GSC",
    required: true,
    connected: (c) => !!c.gscSiteUrl,
    missingNote: "Search Console site URL not set — clicks, impressions, CTR, avg position all unavailable (GSC is primary source)",
  },
  {
    id: "ga4",
    label: "GA4",
    required: true,
    connected: (c) => !!c.ga4PropertyId,
    missingNote: "GA4 property ID not set — session and conversion data unavailable",
  },
  {
    id: "callrail",
    label: "CallRail",
    required: false,
    connected: (c) => !!(c.callrailCompanyId || c.callrailAccountId),
    missingNote: "CallRail not configured — call volume section will be omitted",
  },
  {
    id: "ctm",
    label: "CTM",
    required: false,
    connected: (c) => !!c.ctmAccountId,
    missingNote: "CallTrackingMetrics not configured — call tracking section will be omitted",
  },
  {
    id: "nimbata",
    label: "Nimbata",
    required: false,
    connected: (c) => !!c.nimbataAccountId,
    missingNote: "Nimbata not configured — call tracking section will be omitted",
  },
  {
    id: "airtable",
    label: "Airtable",
    required: false,
    connected: (c) => !!c.airtableBaseId,
    missingNote: "Airtable base ID not set — content work log will be empty",
  },
  {
    id: "asana",
    label: "Asana",
    required: false,
    connected: (c) => !!c.asanaProjectId,
    missingNote: "Asana project ID not set — task completion section will be empty",
  },
  {
    id: "semrush",
    label: "SEMrush",
    required: false,
    connected: (c) => !!c.semrushProjectId,
    missingNote: "SEMrush project ID not set — keyword distribution data unavailable (supplemental only; GSC is primary for search performance)",
  },
  {
    id: "ahrefs",
    label: "Ahrefs",
    required: false,
    connected: () => false,
    isPartial: (c) => !!c.ahrefsProjectUrl,
    missingNote: "Ahrefs project URL not set — DR/RD data unavailable",
    partialNote: "Ahrefs project URL set — CSV upload mode only; live Ahrefs API not connected. DR/RD/backlink data requires manual CSV upload.",
  },
  {
    id: "gbp",
    label: "GBP",
    required: false,
    connected: () => false,
    isPartial: (c) => !!c.gbpLocationName,
    missingNote: "Google Business Profile location not set — local SEO evidence requires manual GBP audit",
    partialNote: "GBP location name set — location detection only; review velocity, insights, and map-pack data are NOT fetched automatically for reports.",
  },
  {
    id: "semrush_ai",
    label: "SEMrush AI",
    required: false,
    connected: () => false,
    missingNote: "SEMrush AI Toolkit not integrated — AI visibility score, AI mentions, and cited sources always show — until connected.",
  },
];

export const MONTHLY_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush"];
export const BIWEEKLY_SOURCES = ["gsc", "ga4", "airtable", "asana"];
export const QBS_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush", "ahrefs", "gbp"];
export const QBR_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush", "ahrefs", "gbp"];

interface Props {
  client: Client;
  sourceIds: string[];
}

export function SourceReadinessBanner({ client, sourceIds }: Props) {
  const { data: health, isLoading: healthLoading } = useClientSourceHealth(client.id);
  const specs = ALL_SOURCE_SPECS.filter((s) => sourceIds.includes(s.id));

  const getStatus = (spec: SourceSpec): { status: HealthStatus; message: string } => {
    if (!health) {
      const isConnected = spec.connected(client);
      const isPartial = !isConnected && (spec.isPartial?.(client) ?? false);
      if (isConnected) return { status: "ok", message: `${spec.label} connected` };
      if (isPartial) return { status: "partial", message: spec.partialNote ?? `${spec.label} partially configured` };
      return { status: spec.required ? "broken" : "not_configured", message: spec.missingNote ?? `${spec.label} not configured` };
    }
    const h = (health as any)[spec.id] as SourceHealth | undefined;
    if (h) return { status: h.status, message: h.message };
    const isConnected = spec.connected(client);
    const isPartial = !isConnected && (spec.isPartial?.(client) ?? false);
    if (isConnected) return { status: "ok", message: `${spec.label} connected` };
    if (isPartial) return { status: "partial", message: spec.partialNote ?? `${spec.label} partially configured` };
    return { status: spec.required ? "broken" : "not_configured", message: spec.missingNote ?? `${spec.label} not configured` };
  };

  const connected = specs.filter((s) => getStatus(s).status === "ok");
  const partial = specs.filter((s) => getStatus(s).status === "partial");
  const missingRequired = specs.filter((s) => s.required && getStatus(s).status !== "ok");
  const missingOptional = specs.filter((s) => !s.required && getStatus(s).status !== "ok" && getStatus(s).status !== "partial");

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1.5" data-testid="source-readiness-banner">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Data Sources
        </span>
        <span className="text-[10px] text-muted-foreground">
          {connected.length}/{specs.length} connected{partial.length > 0 ? `, ${partial.length} partial` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {specs.map((spec) => {
          const { status, message } = getStatus(spec);
          const dotColor = HEALTH_DOT_COLOR[status];
          return (
            <Tooltip key={spec.id}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border cursor-default select-none ${
                    status === "ok"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : status === "partial"
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400"
                      : status === "broken"
                      ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                      : "bg-muted border-border/40 text-muted-foreground"
                  }`}
                  data-testid={`source-chip-${spec.id}`}
                >
                  {healthLoading ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : status === "ok" ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : status === "partial" ? (
                    <AlertCircle className="w-2.5 h-2.5" />
                  ) : status === "broken" ? (
                    <XCircle className="w-2.5 h-2.5" />
                  ) : (
                    <MinusCircle className="w-2.5 h-2.5" />
                  )}
                  {spec.label}
                  {status === "partial" && <span className="text-[8px] opacity-70">partial</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                {message}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {missingRequired.length > 0 && (
        <p className="text-[10px] text-red-600 dark:text-red-400">
          {missingRequired.map((s) => s.label).join(", ")} required — report may have gaps.{" "}
          <a href="/integrations" className="underline underline-offset-2 hover:no-underline">
            Configure in Integrations
          </a>
        </p>
      )}
      {partial.length > 0 && missingRequired.length === 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          {partial.map((s) => s.label).join(", ")} partially connected — some data requires manual upload or additional integration.
        </p>
      )}
      {missingRequired.length === 0 && partial.length === 0 && missingOptional.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {missingOptional.map((s) => s.label).join(", ")} not connected — those sections will be omitted.
        </p>
      )}
    </div>
  );
}
