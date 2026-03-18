import { useState } from "react";
import { ChevronDown, ChevronRight, Puzzle } from "lucide-react";
import { SiAsana, SiNotion, SiGoogledrive, SiGoogledocs } from "react-icons/si";

// ─── Integration registry ──────────────────────────────────────────────────────

export type IntegrationId = "asana" | "notion" | "google-drive" | "google-docs";

interface IntegrationMeta {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

const INTEGRATION_META: Record<IntegrationId, IntegrationMeta> = {
  asana: {
    label: "Asana",
    Icon: SiAsana,
    iconColor: "text-[#F06A6A]",
    bgColor: "bg-rose-50 dark:bg-rose-950/30",
    borderColor: "border-rose-200 dark:border-rose-800",
    textColor: "text-rose-700 dark:text-rose-300",
  },
  notion: {
    label: "Notion",
    Icon: SiNotion,
    iconColor: "text-foreground",
    bgColor: "bg-muted/60 dark:bg-muted/30",
    borderColor: "border-border",
    textColor: "text-foreground",
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
      <Icon className={`w-3 h-3 ${meta.iconColor}`} />
      {meta.label}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  integrations: IntegrationUsage[];
  className?: string;
}

export function IntegrationsPanel({ integrations, className = "" }: Props) {
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
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex-1">
          Integrations used
        </span>
        {/* inline tags when collapsed */}
        {!open && (
          <span className="flex items-center gap-1.5 mr-2">
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
        <div className="border-t border-border px-3 pb-3 pt-2.5 grid gap-2.5 sm:grid-cols-2">
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
                    <Icon className={`w-3 h-3 ${meta.iconColor}`} />
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
