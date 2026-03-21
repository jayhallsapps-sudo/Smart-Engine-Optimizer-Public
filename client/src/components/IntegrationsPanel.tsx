import { useState } from "react";
import { ChevronDown, ChevronRight, Puzzle } from "lucide-react";
import {
  SiAsana,
  SiNotion,
  SiGoogleanalytics,
  SiGooglesheets,
  SiGoogledrive,
  SiGoogledocs,
  SiAirtable,
  SiSemrush,
  SiAnthropic,
  SiOpenai,
  SiGooglegemini,
} from "react-icons/si";

// ─── Integration registry ──────────────────────────────────────────────────────

export type IntegrationId =
  | "gsc"
  | "ga4"
  | "callrail"
  | "ctm"
  | "semrush"
  | "ahrefs"
  | "gbp"
  | "airtable"
  | "asana"
  | "google-sheets"
  | "notion"
  | "screaming-frog"
  | "ai-providers"
  | "google-drive"
  | "google-docs";

interface IntegrationMeta {
  label: string;
  Icon: React.ComponentType<{ className?: string }> | null;
  abbrev?: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  abbrevBg?: string;
}

const INTEGRATION_META: Record<IntegrationId, IntegrationMeta> = {
  gsc: {
    label: "Search Console",
    Icon: null,
    abbrev: "GSC",
    iconColor: "text-[#4285F4]",
    abbrevBg: "#4285F4",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  ga4: {
    label: "Google Analytics 4",
    Icon: SiGoogleanalytics,
    iconColor: "text-[#E37400]",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-200 dark:border-orange-800",
    textColor: "text-orange-700 dark:text-orange-300",
  },
  callrail: {
    label: "CallRail",
    Icon: null,
    abbrev: "CR",
    iconColor: "text-[#F26722]",
    abbrevBg: "#F26722",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-200 dark:border-orange-800",
    textColor: "text-orange-700 dark:text-orange-300",
  },
  ctm: {
    label: "CallTrackingMetrics",
    Icon: null,
    abbrev: "CTM",
    iconColor: "text-[#00ADEF]",
    abbrevBg: "#00ADEF",
    bgColor: "bg-sky-50 dark:bg-sky-950/30",
    borderColor: "border-sky-200 dark:border-sky-800",
    textColor: "text-sky-700 dark:text-sky-300",
  },
  semrush: {
    label: "SEMrush",
    Icon: SiSemrush,
    iconColor: "text-[#FF642D]",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    textColor: "text-red-700 dark:text-red-300",
  },
  ahrefs: {
    label: "Ahrefs",
    Icon: null,
    abbrev: "AH",
    iconColor: "text-[#FF8000]",
    abbrevBg: "#FF8000",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    textColor: "text-amber-700 dark:text-amber-300",
  },
  gbp: {
    label: "Google Business Profile",
    Icon: null,
    abbrev: "GBP",
    iconColor: "text-[#34A853]",
    abbrevBg: "#34A853",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-200 dark:border-green-800",
    textColor: "text-green-700 dark:text-green-300",
  },
  airtable: {
    label: "Airtable",
    Icon: SiAirtable,
    iconColor: "text-[#18BFFF]",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
    borderColor: "border-cyan-200 dark:border-cyan-800",
    textColor: "text-cyan-700 dark:text-cyan-300",
  },
  asana: {
    label: "Asana",
    Icon: SiAsana,
    iconColor: "text-[#F06A6A]",
    bgColor: "bg-rose-50 dark:bg-rose-950/30",
    borderColor: "border-rose-200 dark:border-rose-800",
    textColor: "text-rose-700 dark:text-rose-300",
  },
  "google-sheets": {
    label: "Google Sheets",
    Icon: SiGooglesheets,
    iconColor: "text-[#34A853]",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-200 dark:border-green-800",
    textColor: "text-green-700 dark:text-green-300",
  },
  notion: {
    label: "Notion",
    Icon: SiNotion,
    iconColor: "text-foreground",
    bgColor: "bg-muted/60 dark:bg-muted/30",
    borderColor: "border-border",
    textColor: "text-foreground",
  },
  "screaming-frog": {
    label: "Screaming Frog",
    Icon: null,
    abbrev: "SF",
    iconColor: "text-[#7DC543]",
    abbrevBg: "#7DC543",
    bgColor: "bg-lime-50 dark:bg-lime-950/30",
    borderColor: "border-lime-200 dark:border-lime-800",
    textColor: "text-lime-700 dark:text-lime-300",
  },
  "ai-providers": {
    label: "AI Providers",
    Icon: SiAnthropic,
    iconColor: "text-[#D97757]",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    textColor: "text-amber-700 dark:text-amber-300",
  },
  "google-drive": {
    label: "Google Drive",
    Icon: SiGoogledrive,
    iconColor: "text-[#4285F4]",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  "google-docs": {
    label: "Google Docs",
    Icon: SiGoogledocs,
    iconColor: "text-[#4285F4]",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-700 dark:text-blue-300",
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntegrationUsage {
  id: IntegrationId;
  how: string;
  why: string;
}

// ─── Integration tag (pill) ───────────────────────────────────────────────────

function IntegrationTag({ id }: { id: IntegrationId }) {
  const meta = INTEGRATION_META[id];
  if (!meta) return null;
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${meta.bgColor} ${meta.borderColor} ${meta.textColor}`}
    >
      {Icon ? (
        <Icon className={`w-3 h-3 ${meta.iconColor}`} />
      ) : meta.abbrev ? (
        <span
          className="inline-flex items-center justify-center rounded text-[8px] font-bold text-white leading-none"
          style={{ background: meta.abbrevBg, width: 14, height: 14, minWidth: 14 }}
        >
          {meta.abbrev}
        </span>
      ) : null}
      {meta.label}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  integrations: IntegrationUsage[];
  className?: string;
  hideLabel?: boolean;
}

export function IntegrationsPanel({ integrations, className = "", hideLabel = false }: Props) {
  const [open, setOpen] = useState(false);

  if (integrations.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border bg-muted/30 overflow-hidden ${className}`} data-testid="integrations-panel">
      {/* Trigger row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors group"
        data-testid="button-integrations-panel-toggle"
        aria-expanded={open}
      >
        <Puzzle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {!hideLabel && (
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex-1">
            Data sources
          </span>
        )}
        {/* inline tags when collapsed */}
        {!open && (
          <span className="flex items-center gap-1.5 flex-wrap mr-2">
            {integrations.map((i) => (
              <IntegrationTag key={i.id} id={i.id} />
            ))}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((usage) => {
            const meta = INTEGRATION_META[usage.id];
            if (!meta) return null;
            const { Icon } = meta;
            return (
              <div
                key={usage.id}
                className={`rounded-lg border p-3 ${meta.bgColor} ${meta.borderColor}`}
                data-testid={`integration-card-${usage.id}`}
              >
                {/* Tag header */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgColor} ${meta.borderColor} ${meta.textColor}`}
                    style={{ filter: "brightness(0.9)" }}
                  >
                    {Icon ? (
                      <Icon className={`w-3 h-3 ${meta.iconColor}`} />
                    ) : meta.abbrev ? (
                      <span
                        className="inline-flex items-center justify-center rounded text-[8px] font-bold text-white leading-none"
                        style={{ background: meta.abbrevBg, width: 14, height: 14, minWidth: 14 }}
                      >
                        {meta.abbrev}
                      </span>
                    ) : null}
                    {meta.label}
                  </span>
                </div>
                {/* How */}
                <p className="text-[11px] text-foreground leading-relaxed mb-1.5">
                  <span className="font-semibold">How: </span>
                  {usage.how}
                </p>
                {/* Why */}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Why: </span>
                  {usage.why}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
