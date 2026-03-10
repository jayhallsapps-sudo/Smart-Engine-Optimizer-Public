import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, BarChart3, TrendingUp, Sparkles, Download, Loader2, FileText, Presentation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SampleReport {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  format: string;
  formatIcon: "docx" | "pptx";
  endpoint: string;
  filename: string;
  icon: any;
  sections: string[];
}

const SAMPLE_REPORTS: SampleReport[] = [
  {
    id: "biweekly",
    title: "Bi-Weekly Report",
    subtitle: "Word Document (.docx)",
    description:
      "A bi-weekly client meeting document for Acme Plumbing & HVAC. Shows a performance pulse with GSC, GA4, and call data, a work log table with completed tasks, and partnership / next steps notes.",
    format: "docx",
    formatIcon: "docx",
    endpoint: "/api/reports/biweekly/sample",
    filename: "Sample_Biweekly_AcmePlumbing.docx",
    icon: CalendarDays,
    sections: ["Purpose", "Performance Pulse & Key Insights", "Progress & Quick Wins (Work Log)", "Partnerships & Alignment"],
  },
  {
    id: "monthly",
    title: "Monthly Report",
    subtitle: "PowerPoint Slide Deck (.pptx)",
    description:
      "A full monthly performance slide deck for Acme Plumbing & HVAC. Covers QTD KPIs, top conversion pages, GSC performance trends, keyword ranking distribution, strategic initiatives, audit health, and content output.",
    format: "pptx",
    formatIcon: "pptx",
    endpoint: "/api/reports/monthly/sample",
    filename: "Sample_Monthly_AcmePlumbing.pptx",
    icon: BarChart3,
    sections: ["QTD Key Performance Indicators", "Top Conversion Locations", "GSC Performance", "Keyword Tracking", "Strategic Initiatives", "Audit & Content"],
  },
  {
    id: "qbr",
    title: "Quarterly Business Review (QBR)",
    subtitle: "PowerPoint Slide Deck (.pptx)",
    description:
      "A full QBR slide deck for Acme Plumbing & HVAC covering Q1 2025. Includes full-funnel performance review (GSC, GA4, CallRail), strategy overview with top pages and keyword trends, Q2 strategic plan, and an initiative roadmap.",
    format: "pptx",
    formatIcon: "pptx",
    endpoint: "/api/reports/qbr/sample",
    filename: "Sample_QBR_AcmePlumbing.pptx",
    icon: TrendingUp,
    sections: ["Performance Review (QoQ)", "Strategy Overview", "Strategic Plan", "Q2 Roadmap & Alignment", "Partnership Items"],
  },
  {
    id: "qbr-prep",
    title: "QBS",
    subtitle: "Word Document (.docx)",
    description:
      "An internal strategy document for Acme Plumbing & HVAC's Q1 → Q2 review. Contains an executive summary of wins, a prioritized opportunity backlog with evidence, problem statements, and recommended next steps across Content, Technical, CRO, and Local categories.",
    format: "docx",
    formatIcon: "docx",
    endpoint: "/api/reports/qbr-prep/sample",
    filename: "Sample_QBRPrep_AcmePlumbing.docx",
    icon: Sparkles,
    sections: ["Executive Summary (Wins + Top Opportunities)", "Content Opportunities", "Technical Opportunities", "CRO Opportunities", "Local SEO Opportunities"],
  },
];

function FormatBadge({ format }: { format: "docx" | "pptx" }) {
  if (format === "docx") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <FileText className="w-3 h-3" />
        Word .docx
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] gap-1">
      <Presentation className="w-3 h-3" />
      PowerPoint .pptx
    </Badge>
  );
}

export default function SampleReportsPage() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  async function handleDownload(report: SampleReport) {
    setLoading(prev => ({ ...prev, [report.id]: true }));
    try {
      const res = await fetch(report.endpoint);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        throw new Error(err.message ?? "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = report.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [report.id]: false }));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold" data-testid="text-page-title">Sample Report Exports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Download a fully populated example of each report type — generated with dummy data for a fictional client, Acme Plumbing & HVAC.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
          {SAMPLE_REPORTS.map(report => {
            const Icon = report.icon;
            const isLoading = loading[report.id];
            return (
              <Card key={report.id} className="flex flex-col" data-testid={`card-sample-${report.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                        <Icon className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base leading-tight">{report.title}</CardTitle>
                        <div className="mt-1">
                          <FormatBadge format={report.formatIcon} />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 gap-4">
                  <CardDescription className="text-xs leading-relaxed">
                    {report.description}
                  </CardDescription>

                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What's inside</p>
                    <ul className="space-y-0.5">
                      {report.sections.map((section, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                          {section}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto pt-2">
                    <Button
                      className="w-full"
                      onClick={() => handleDownload(report)}
                      disabled={isLoading}
                      data-testid={`button-download-sample-${report.id}`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Download Sample
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-6 max-w-2xl">
          All data in these samples is fictional and for demonstration purposes only. Numbers, client names, and URLs are invented. Generated files are identical in format to real exports produced by SmartEO.
        </p>
      </div>
    </div>
  );
}
