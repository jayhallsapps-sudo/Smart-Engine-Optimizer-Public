import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Client } from "@shared/schema";

export interface SourceSpec {
  id: string;
  label: string;
  required: boolean;
  connected: (client: Client) => boolean;
  missingNote?: string;
}

export const ALL_SOURCE_SPECS: SourceSpec[] = [
  {
    id: "gsc",
    label: "GSC",
    required: true,
    connected: (c) => !!c.gscSiteUrl,
    missingNote: "Search Console site URL not set — organic performance data unavailable",
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
    missingNote: "SEMrush project ID not set — keyword distribution data unavailable",
  },
  {
    id: "ahrefs",
    label: "Ahrefs",
    required: false,
    connected: (c) => !!c.ahrefsProjectUrl,
    missingNote: "Ahrefs project URL not set — ranking data will rely on GSC only",
  },
];

export const MONTHLY_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush"];
export const BIWEEKLY_SOURCES = ["gsc", "ga4", "airtable", "asana"];
export const QBS_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush", "ahrefs"];
export const QBR_SOURCES = ["gsc", "ga4", "callrail", "ctm", "nimbata", "airtable", "asana", "semrush", "ahrefs"];

interface Props {
  client: Client;
  sourceIds: string[];
}

export function SourceReadinessBanner({ client, sourceIds }: Props) {
  const specs = ALL_SOURCE_SPECS.filter((s) => sourceIds.includes(s.id));

  const connected = specs.filter((s) => s.connected(client));
  const missingRequired = specs.filter((s) => s.required && !s.connected(client));
  const missingOptional = specs.filter((s) => !s.required && !s.connected(client));

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1.5" data-testid="source-readiness-banner">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Data Sources
        </span>
        <span className="text-[10px] text-muted-foreground">
          {connected.length}/{specs.length} connected
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {specs.map((spec) => {
          const isConnected = spec.connected(client);
          return (
            <Tooltip key={spec.id}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border cursor-default select-none ${
                    isConnected
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : spec.required
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                      : "bg-muted border-border/40 text-muted-foreground"
                  }`}
                  data-testid={`source-chip-${spec.id}`}
                >
                  {isConnected ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : spec.required ? (
                    <XCircle className="w-2.5 h-2.5" />
                  ) : (
                    <MinusCircle className="w-2.5 h-2.5" />
                  )}
                  {spec.label}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                {isConnected
                  ? `${spec.label} connected`
                  : spec.missingNote ?? `${spec.label} not configured`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {missingRequired.length > 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          {missingRequired.map((s) => s.label).join(", ")} required — report may have gaps.{" "}
          <a href="/integrations" className="underline underline-offset-2 hover:no-underline">
            Configure in Integrations
          </a>
        </p>
      )}
      {missingRequired.length === 0 && missingOptional.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {missingOptional.map((s) => s.label).join(", ")} not connected — those sections will be omitted.
        </p>
      )}
    </div>
  );
}
