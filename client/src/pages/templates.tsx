import { Link } from "wouter";
import { LayoutTemplate, FileText, Presentation, Map, ChevronRight, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TemplateCard {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  accentColor: string;
}

const TEMPLATES: TemplateCard[] = [
  {
    id: "quarterly-content-roadmap",
    name: "Quarterly Content Roadmap",
    description: "Quarter-based planning deck with per-month strategy from QBS and Airtable production deliverables. Includes title, divider, strategy, and production slides.",
    badge: "PPTX",
    badgeColor: "bg-[#C0392B]/10 text-[#C0392B]",
    icon: <Map className="w-5 h-5 text-[#C0392B]" />,
    accentColor: "#C0392B",
  },
  {
    id: "biweekly-docx",
    name: "Bi-Weekly SEO Report",
    description: "Client-facing DOCX report covering performance pulse, progress wins, and partnership alignment. Fully branded with header image and accent colors.",
    badge: "DOCX",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <FileText className="w-5 h-5 text-blue-600" />,
    accentColor: "#1B3A6B",
  },
  {
    id: "monthly-pptx",
    name: "Monthly SEO Report",
    description: "Monthly PPTX deck with performance metrics, keyword rankings, content highlights, and SEO health overview. Designed for client review sessions.",
    badge: "PPTX",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    icon: <Presentation className="w-5 h-5 text-violet-600" />,
    accentColor: "#1B3A6B",
  },
  {
    id: "qbr-pptx",
    name: "Quarterly Business Review",
    description: "Comprehensive QBR PPTX deck covering quarter performance, strategy wins, data analysis, and planning for the next quarter. Includes executive summary.",
    badge: "PPTX",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: <LayoutTemplate className="w-5 h-5 text-emerald-600" />,
    accentColor: "#1B3A6B",
  },
];

export default function TemplatesPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background" data-testid="page-templates">
      {/* Header */}
      <div className="border-b px-8 py-6 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-[11px] text-muted-foreground">
          <span>SmartEO</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Templates</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#1B3A6B] shrink-0">
            <LayoutTemplate className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Report Templates</h1>
            <p className="text-sm text-muted-foreground">
              Visually edit the layout, colors, and typography of each report template. Changes apply to future generated decks.
            </p>
          </div>
        </div>
      </div>

      {/* Template grid */}
      <div className="flex-1 px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
          {TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              className="group flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
              data-testid={`card-template-${tpl.id}`}
            >
              {/* Color stripe */}
              <div
                className="h-1.5 w-full shrink-0"
                style={{ backgroundColor: tpl.accentColor }}
              />

              <div className="flex flex-col flex-1 p-5 gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0">
                      {tpl.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground leading-snug">{tpl.name}</h3>
                      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${tpl.badgeColor}`}>
                        {tpl.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {tpl.description}
                </p>

                <Link href={`/templates/${tpl.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5"
                    data-testid={`button-edit-template-${tpl.id}`}
                  >
                    <Edit2 className="w-3 h-3" />
                    Open Visual Editor
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 max-w-4xl rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-5 py-4 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <p className="font-semibold mb-1">How templates work</p>
          <p>Template changes control the visual presentation: colors, fonts, element positioning, and header/footer styling. Content is always generated fresh from live data (QBS, Airtable, GSC, etc.) each time a deck is created. Template edits do not retroactively change already-saved reports.</p>
        </div>
      </div>
    </div>
  );
}
