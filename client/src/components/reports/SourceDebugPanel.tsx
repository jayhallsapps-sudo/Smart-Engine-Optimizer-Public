import { useState } from "react";

interface RawWorkItem { area: string; task: string; url?: string; }

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-white text-[10px] font-mono ${ok ? "bg-green-600" : "bg-amber-600"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

function WorkItemList({ items, emptyLabel }: { items: RawWorkItem[]; emptyLabel: string }) {
  if (!items || items.length === 0) return <span className="italic text-muted-foreground">{emptyLabel}</span>;
  return (
    <ul className="space-y-0.5 mt-0.5">
      {items.map((r, i) => (
        <li key={i} className="text-[9px] font-mono text-foreground/70">
          <span className="text-muted-foreground">[{r.area}]</span> {r.task}
          {r.url && r.url !== "—" && <span className="text-blue-500 ml-1">↗{r.url.length > 40 ? r.url.slice(0, 40) + "…" : r.url}</span>}
        </li>
      ))}
    </ul>
  );
}

function StringList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items || items.length === 0) return <span className="italic text-muted-foreground">{emptyLabel}</span>;
  return (
    <ul className="space-y-0.5 mt-0.5">
      {items.map((s, i) => (
        <li key={i} className="text-[9px] font-mono text-foreground/70">{s}</li>
      ))}
    </ul>
  );
}

export function SourceDebugPanel({ sourceFacts }: { sourceFacts?: any }) {
  const [open, setOpen] = useState(false);

  if (!sourceFacts) return null;

  const sf = sourceFacts;

  return (
    <div className="border border-border rounded-md overflow-hidden mx-4 mb-4">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/60 hover:bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-source-debug"
      >
        <span>Source Evidence Debug</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-3 space-y-3 text-[10px] font-mono bg-muted/20">
          {/* Narration status row */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-white text-[10px] ${sf.aiNarrationUsed ? "bg-green-600" : "bg-amber-600"}`}>
              AI Narration: {sf.aiNarrationUsed ? `✓ ${sf.aiNarrationProvider ?? "unknown"}` : "✗ deterministic fallback"}
            </span>
            {sf.fallbackTriggered && (
              <span className="px-2 py-0.5 rounded text-white text-[10px] bg-amber-500">
                ⚠ fallback triggered
              </span>
            )}
            {sf.promptVersion && (
              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700 text-foreground">
                prompt {sf.promptVersion}
              </span>
            )}
          </div>

          {/* Data source badges */}
          <div className="flex gap-2 flex-wrap">
            {sf.hasGsc !== undefined && <Badge ok={sf.hasGsc} label="GSC" />}
            {sf.hasGa4 !== undefined && <Badge ok={sf.hasGa4} label="GA4" />}
            {sf.hasCalls !== undefined && <Badge ok={sf.hasCalls} label="Calls" />}
            {sf.hasSf !== undefined && <Badge ok={sf.hasSf} label="SF Snapshot" />}
            {sf.airtableRecords !== undefined && (
              <span className={`px-2 py-0.5 rounded text-white text-[10px] ${sf.airtableRecords > 0 ? "bg-green-600" : "bg-amber-600"}`}>
                Airtable: {sf.airtableRecords} records
              </span>
            )}
            {sf.asanaCompleted !== undefined && (
              <span className="px-2 py-0.5 rounded text-white text-[10px] bg-slate-600">
                Asana done: {sf.asanaCompleted}
              </span>
            )}
            {sf.asanaUpcoming !== undefined && (
              <span className="px-2 py-0.5 rounded text-white text-[10px] bg-slate-600">
                Asana upcoming: {sf.asanaUpcoming}
              </span>
            )}
            {sf.asanaRecords !== undefined && (
              <span className="px-2 py-0.5 rounded text-white text-[10px] bg-slate-600">
                Asana tasks: {sf.asanaRecords}
              </span>
            )}
            {sf.totalOpportunities !== undefined && (
              <span className="px-2 py-0.5 rounded text-white text-[10px] bg-blue-600">
                Opportunities: {sf.totalOpportunities} / {sf.opportunityCategories} cats
              </span>
            )}
            {sf.crawlUrlCount !== undefined && (
              <span className={`px-2 py-0.5 rounded text-white text-[10px] ${sf.crawlUrlCount > 0 ? "bg-green-600" : "bg-amber-600"}`}>
                Crawl URLs: {sf.crawlUrlCount}
              </span>
            )}
            {sf.integrationGapCount !== undefined && (
              <span className={`px-2 py-0.5 rounded text-white text-[10px] ${sf.integrationGapCount > 0 ? "bg-amber-600" : "bg-green-600"}`}>
                Integration gaps: {sf.integrationGapCount}
              </span>
            )}
          </div>

          {/* Raw work log items */}
          {sf.rawWorkLogItems && sf.rawWorkLogItems.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Raw Work Log ({sf.rawWorkLogItems.length} items)</p>
              <WorkItemList items={sf.rawWorkLogItems} emptyLabel="none" />
            </div>
          )}

          {/* Raw next priority items (monthly only) */}
          {sf.rawNextPriorityItems && sf.rawNextPriorityItems.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Raw Next-Month Priorities ({sf.rawNextPriorityItems.length} items)</p>
              <StringList items={sf.rawNextPriorityItems} emptyLabel="none" />
            </div>
          )}

          {/* Category names (QBR Prep only) */}
          {sf.categoryNames && sf.categoryNames.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Opportunity Categories ({sf.categoryNames.length})</p>
              <StringList items={sf.categoryNames} emptyLabel="none" />
            </div>
          )}

          {/* Data sources used (Mid-Strategy) */}
          {sf.dataSourcesUsed && sf.dataSourcesUsed.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Data Sources Used</p>
              <StringList items={sf.dataSourcesUsed} emptyLabel="none" />
            </div>
          )}

          <p className="text-[9px] text-muted-foreground">Generated: {sf.generatedAt ? new Date(sf.generatedAt).toLocaleString() : "—"}</p>
        </div>
      )}
    </div>
  );
}
