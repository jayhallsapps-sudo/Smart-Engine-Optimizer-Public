import { useEffect, useState } from "react";

const NAVY = "#1B3A6B";
const RED = "#C0392B";
const LIGHT_BLUE = "#E8F0FE";
const FOOTER_TEXT = "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io";

interface SlideData {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  commentary?: string;
  clientName?: string;
  date?: string;
  sectionLabel?: string;
  metrics?: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }>;
  table?: { headers: string[]; rows: (string | number)[][] };
  chartData?: Array<{ label: string; [key: string]: string | number }>;
  chartKeys?: string[];
  bullets?: string[];
  leftContent?: { type: string; bullets?: string[]; table?: { headers: string[]; rows: (string | number)[][] } };
  rightContent?: { type: string; chartData?: any[]; chartKeys?: string[]; metrics?: any[] };
  decisionOptions?: Array<{ label: string; subtitle?: string; pros: string[]; cons?: string[]; recommended?: boolean }>;
  decisionConclusion?: string;
  currentIA?: Array<{ label: string; children?: string[] }>;
  futureIA?: Array<{ label: string; children?: string[] }>;
  clusters?: Array<{ hub: string; pages: string[] }>;
  hidden?: boolean;
  sourceType?: "client_specific" | "system_derived" | "needs_input" | "template_draft";
  exportAllowed?: boolean;
}

function resolveEdit(edits: Record<string, string>, key: string, fallback: string): string {
  return edits[key] ?? fallback;
}

function PrintSlideHeader({ title }: { title: string }) {
  return (
    <div>
      <div style={{ height: 38, background: NAVY, display: "flex", alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
        <span style={{ color: "white", fontWeight: "bold", fontSize: 14, flex: 1 }}>{title}</span>
        <span style={{ fontSize: 9, color: "#93C5FD" }}>Webserv</span>
      </div>
      <div style={{ height: 3, background: RED }} />
    </div>
  );
}

function PrintSlideFooter() {
  return (
    <div>
      <div style={{ height: 2, background: RED }} />
      <div style={{ height: 18, background: "#F0F4FA", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14, paddingLeft: 14 }}>
        <span style={{ fontSize: 8, color: "#9CA3AF" }}>{FOOTER_TEXT}</span>
      </div>
    </div>
  );
}

function MetricBox({ m }: { m: { label: string; current: string; previous?: string; delta?: string; isPositive?: boolean } }) {
  const arrow = m.delta ? (m.isPositive ? "▲" : "▼") : "";
  const deltaColor = m.isPositive ? "#10B981" : "#EF4444";
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, padding: "8px 10px", background: "white", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#6B7280", fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{m.current}</div>
      {m.delta && (
        <div style={{ fontSize: 9, color: deltaColor, fontWeight: 600, marginTop: 2 }}>
          {arrow} {m.delta}
        </div>
      )}
      {m.previous && <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 1 }}>prev: {m.previous}</div>}
    </div>
  );
}

function PrintTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, border: "1px solid #E5E7EB" }}>
      <thead>
        <tr style={{ backgroundColor: `${RED}10` }}>
          {headers.map((h, hi) => (
            <th key={hi} style={{ color: RED, padding: "4px 8px", textAlign: "left", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `2px solid ${RED}30` }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? "white" : LIGHT_BLUE }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ padding: "3px 8px", borderBottom: "1px solid #E5E7EB", color: "#1F2937", fontSize: 10 }}>
                {String(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  if (!confidence || confidence === "data-backed") return null;
  const map: Record<string, { label: string; bg: string; color: string }> = {
    "mixed-source": { label: "Mixed Source", bg: "#EFF6FF", color: "#1D4ED8" },
    "ai-synthesized": { label: "AI-Synthesized Draft", bg: "#FFFBEB", color: "#92400E" },
    "missing-data": { label: "Missing Data — add sources for better analysis", bg: "#FEF2F2", color: "#991B1B" },
  };
  const cfg = map[confidence];
  if (!cfg) return null;
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, borderRadius: 3, padding: "4px 10px", marginBottom: 8, fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      ◆ {cfg.label}
    </div>
  );
}

function PrintSlide({ slide, edits }: { slide: SlideData; edits: Record<string, string> }) {
  const r = (key: string, fallback: string) => resolveEdit(edits, key, fallback);
  const confidence = (slide as any).confidence as string | undefined;

  if (slide.type === "title") {
    return (
      <div style={{ background: `linear-gradient(135deg, ${NAVY} 60%, #0f2547)`, padding: "36px 40px", position: "relative", minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: RED }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, background: RED }} />
        <div style={{ color: "white", fontSize: 28, fontWeight: "bold", lineHeight: 1.2, marginBottom: 10 }}>
          {r(`${slide.id}_title`, slide.title ?? "")}
        </div>
        <div style={{ color: "#BFD7FF", fontSize: 18, marginBottom: 6 }}>
          {r(`${slide.id}_client`, slide.clientName ?? "")}
        </div>
        <div style={{ color: "#93C5FD", fontSize: 12 }}>{slide.date}</div>
        <div style={{ position: "absolute", bottom: 18, left: 40, color: "#BFD7FF", fontSize: 9 }}>Webserv  |  webserv.io</div>
      </div>
    );
  }

  if (slide.type === "divider") {
    return (
      <div style={{ background: `linear-gradient(135deg, ${NAVY} 55%, #162d57)`, padding: "32px 48px", textAlign: "center", position: "relative", minHeight: 140 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: RED }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: RED }} />
        <div style={{ color: "#93C5FD", fontSize: 10, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>Section</div>
        <div style={{ color: "white", fontSize: 22, fontWeight: "bold", lineHeight: 1.25 }}>
          {r(`${slide.id}_title`, slide.title ?? "")}
        </div>
        {slide.subtitle && <div style={{ color: "#BFD7FF", fontSize: 12, marginTop: 10 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
      </div>
    );
  }

  const title = r(`${slide.id}_title`, slide.title ?? "");

  if (slide.type === "metrics") {
    const mets = slide.metrics ?? [];
    const cols = Math.min(4, mets.length || 1);
    const commentary = r(`${slide.id}_commentary`, slide.commentary ?? "");
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 8 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
            {mets.map((m, mi) => <MetricBox key={mi} m={m} />)}
          </div>
          {commentary && (
            <div style={{ marginTop: 8, padding: "6px 12px", background: "#F0F4FA", borderLeft: `3px solid ${RED}`, borderRadius: 2, fontSize: 10, color: "#374151", fontStyle: "italic", lineHeight: 1.5 }}>
              {commentary}
            </div>
          )}
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "table" && slide.table) {
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          <PrintTable headers={slide.table.headers} rows={slide.table.rows} />
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if ((slide.type === "chart-bar" || slide.type === "chart-line") && slide.chartData) {
    const keys = slide.chartKeys ?? ["value"];
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          <PrintTable
            headers={["Label", ...keys]}
            rows={(slide.chartData as any[]).map(d => [d.label, ...keys.map(k => String(d[k] ?? ""))])}
          />
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "bullets") {
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          <ConfidenceBadge confidence={confidence} />
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          {(slide.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5 }}>
              <span style={{ color: RED, fontWeight: "bold", fontSize: 13, lineHeight: 1, marginTop: 1 }}>•</span>
              <span style={{ fontSize: 11, color: "#1F2937", lineHeight: 1.5 }}>{r(`${slide.id}_bullet_${bi}`, b)}</span>
            </div>
          ))}
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "two-col" && slide.leftContent && slide.rightContent) {
    const renderColContent = (col: typeof slide.leftContent) => {
      if (!col) return null;
      if (col.type === "bullets") {
        const bullets: string[] = (col as any).bullets ?? [];
        return bullets.map((bullet, bi) => {
          const isHeader = bullet.endsWith(":") || (bi === 0 && bullet.trim() === bullet.trim().toUpperCase() && bullet.length < 30);
          return (
            <div key={bi} style={{ display: "flex", gap: 6, marginBottom: isHeader ? 6 : 3, fontSize: isHeader ? 9 : 10 }}>
              {!isHeader && <span style={{ color: RED, fontWeight: "bold", marginTop: 1 }}>•</span>}
              <span style={{ color: isHeader ? "#6B7280" : "#1F2937", fontWeight: isHeader ? 700 : 400, textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? "0.05em" : "normal" }}>{bullet}</span>
            </div>
          );
        });
      }
      if (col.type === "table" && col.table) {
        return <PrintTable headers={col.table.headers} rows={col.table.rows} />;
      }
      if (col.type === "metrics") {
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {((col as any).metrics ?? []).map((m: any, mi: number) => <MetricBox key={mi} m={m} />)}
          </div>
        );
      }
      if ((col.type === "chart-bar" || col.type === "chart-line") && (col as any).chartData) {
        return (
          <div style={{ fontSize: 10, color: "#6B7280" }}>
            <PrintTable
              headers={["Label", ...((col as any).chartKeys ?? ["value"])]}
              rows={((col as any).chartData as any[]).map((d: any) => [d.label, ...((col as any).chartKeys ?? ["value"]).map((k: string) => String(d[k] ?? ""))])}
            />
          </div>
        );
      }
      return null;
    };

    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          <ConfidenceBadge confidence={confidence} />
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 8 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>{renderColContent(slide.leftContent)}</div>
            <div style={{ flex: 1 }}>{renderColContent(slide.rightContent as any)}</div>
          </div>
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "scorecard") {
    const mets = slide.metrics ?? [];
    const { headers, rows } = slide.table ?? { headers: [], rows: [] };
    const commentary = r(`${slide.id}_commentary`, slide.commentary ?? "");
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px", display: "flex", gap: 14 }}>
          <div style={{ flex: 2 }}>
            {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
            {headers.length > 0 && <PrintTable headers={headers} rows={rows} />}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
            {mets.slice(0, 4).map((m, mi) => <MetricBox key={mi} m={m} />)}
            {commentary && (
              <div style={{ marginTop: 4, padding: "5px 8px", background: "#FFF3F0", borderLeft: `3px solid ${RED}`, borderRadius: 2, fontSize: 9, color: "#374151", fontStyle: "italic", lineHeight: 1.5 }}>
                {commentary}
              </div>
            )}
          </div>
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "decision-card" && slide.decisionOptions) {
    const options = slide.decisionOptions;
    const conclusion = r(`${slide.id}_conclusion`, slide.decisionConclusion ?? "");
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.subtitle && <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 8, textAlign: "center" }}>{r(`${slide.id}_subtitle`, slide.subtitle)}</div>}
          <div style={{ display: "flex", gap: 12 }}>
            {options.map((opt, oi) => (
              <div key={oi} style={{
                flex: 1, border: opt.recommended ? `2px solid ${RED}` : "1px solid #D1D5DB",
                borderRadius: 6, padding: 12, background: opt.recommended ? "#FFF5F5" : "white",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                  {r(`${slide.id}_opt_${oi}_label`, opt.label)}
                </div>
                {opt.subtitle && <div style={{ fontSize: 9, color: opt.recommended ? RED : "#6B7280", fontWeight: 600, marginBottom: 2 }}>{opt.subtitle}</div>}
                {opt.recommended && <div style={{ fontSize: 8, color: RED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Recommended</div>}
                {opt.pros.map((p, pi) => (
                  <div key={pi} style={{ display: "flex", gap: 4, fontSize: 10, color: "#374151", marginBottom: 2 }}>
                    <span style={{ color: "#10B981", fontWeight: 700 }}>✓</span>
                    <span>{r(`${slide.id}_opt_${oi}_pro_${pi}`, p)}</span>
                  </div>
                ))}
                {(opt.cons ?? []).map((c, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 4, fontSize: 10, color: "#374151", marginBottom: 2 }}>
                    <span style={{ color: "#EF4444", fontWeight: 700 }}>✗</span>
                    <span>{r(`${slide.id}_opt_${oi}_con_${ci}`, c)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {conclusion && (
            <div style={{ marginTop: 8, padding: "6px 12px", background: "#F0F4FA", borderLeft: `3px solid ${RED}`, borderRadius: 2, fontSize: 10, color: "#374151", fontStyle: "italic", lineHeight: 1.5 }}>
              {conclusion}
            </div>
          )}
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "ia-comparison") {
    const currentItems = slide.currentIA ?? [];
    const futureItems = slide.futureIA ?? [];
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.commentary && (
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 8 }}>{r(`${slide.id}_commentary`, slide.commentary)}</div>
          )}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Current</div>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 4, padding: 8, background: "#FAFAFA" }}>
                {currentItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, padding: "2px 6px", background: LIGHT_BLUE, borderRadius: 2, display: "inline-block" }}>
                      {r(`${slide.id}_cur_${ii}`, item.label)}
                    </div>
                    {item.children?.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 9, color: "#4B5563", paddingLeft: 14, marginTop: 2 }}>— {c}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 22, color: RED, fontWeight: 700 }}>→</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Future</div>
              <div style={{ border: `1px solid ${RED}30`, borderRadius: 4, padding: 8, background: "#FFF5F5" }}>
                {futureItems.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, padding: "2px 6px", background: `${RED}15`, borderRadius: 2, display: "inline-block" }}>
                      {r(`${slide.id}_fut_${ii}`, item.label)}
                    </div>
                    {item.children?.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 9, color: "#4B5563", paddingLeft: 14, marginTop: 2 }}>— {c}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  if (slide.type === "cluster-map") {
    const cols = Math.max(1, Math.min(4, (slide.clusters ?? []).length));
    return (
      <div>
        <PrintSlideHeader title={title} />
        <div style={{ padding: "12px 20px 8px" }}>
          {slide.commentary && (
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 8 }}>{r(`${slide.id}_commentary`, slide.commentary)}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
            {(slide.clusters ?? []).map((cluster, ci) => (
              <div key={ci} style={{ border: "1px solid #E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ background: NAVY, color: "white", fontSize: 10, fontWeight: 700, padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {r(`${slide.id}_cluster_${ci}_hub`, cluster.hub)}
                </div>
                <div style={{ padding: 6 }}>
                  {cluster.pages.map((page, pi) => (
                    <div key={pi} style={{ fontSize: 9, color: "#374151", padding: "2px 6px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ color: RED, fontSize: 7 }}>●</span>
                      <span>{r(`${slide.id}_cluster_${ci}_page_${pi}`, page)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <PrintSlideFooter />
      </div>
    );
  }

  return (
    <div>
      <PrintSlideHeader title={title} />
      <div style={{ padding: "12px 20px 8px", fontSize: 10, color: "#9CA3AF" }}>
        Slide type: {slide.type}
      </div>
      <PrintSlideFooter />
    </div>
  );
}

export default function MidStrategyPrint() {
  const [data, setData] = useState<{ report: any; edits: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError("No token."); return; }
    fetch("/api/auth/bootstrap")
      .then(r => r.json())
      .then(({ token: authToken }) =>
        fetch(`/api/print-cache/${token}`, { headers: { "X-Internal-Token": authToken } })
          .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
          .then(d => setData(d))
      )
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 32 }}>Loading…</div>;

  const { report, edits } = data;
  const slides: SlideData[] = (report.slides ?? []).filter((s: SlideData) => !s.hidden);

  return (
    <div data-report-root style={{ background: "white", margin: 0, padding: 0 }}>
      <style>{`
        html, body { margin: 0; padding: 0; background: white; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        button { display: none !important; }
      `}</style>

      <div style={{ width: "10in", margin: "0 auto", padding: 0, background: "#fff" }}>
        {slides.map((slide, i) => (
          <div key={slide.id} style={{ marginBottom: i < slides.length - 1 ? 2 : 0, pageBreakAfter: i < slides.length - 1 ? "always" : "auto" }}>
            <PrintSlide slide={slide} edits={edits} />
          </div>
        ))}
      </div>
    </div>
  );
}
