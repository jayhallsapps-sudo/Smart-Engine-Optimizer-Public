import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  ImageRun,
  Header,
  Footer,
  convertInchesToTwip,
} from "docx";
import * as fs from "fs";
import * as path from "path";

const WEBSERV_RED = "C0392B";
const DARK_HEADER = "111827";
const LIGHT_BG = "F9FAFB";
const GRAY = "6B7280";
const WHITE = "FFFFFF";
const BLACK = "000000";
const BORDER_COLOR = "E5E7EB";

const TEXT_AREA_DXA = 8640;

function cellBorder() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
  };
}

function hdrCell(text: string, widthPct?: number) {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.SOLID, color: DARK_HEADER },
    borders: cellBorder(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 16, font: "Calibri" })],
      }),
    ],
  });
}

function bodyCell(text: string, shade = false) {
  const isManual = text.includes("Manual entry needed");
  return new TableCell({
    shading: shade ? { type: ShadingType.SOLID, color: LIGHT_BG } : undefined,
    borders: cellBorder(),
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || "—",
            size: 18,
            font: "Calibri",
            italics: isManual,
            color: isManual ? "9CA3AF" : BLACK,
          }),
        ],
      }),
    ],
  });
}

function sectionHeading(num: number, title: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${num}. ${title}`,
        bold: true,
        size: 24,
        color: WEBSERV_RED,
        font: "Calibri",
      }),
    ],
    spacing: { before: 320, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 3, color: WEBSERV_RED },
    },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: "374151", font: "Calibri" })],
    spacing: { before: 160, after: 80 },
  });
}

function makeTable(headers: string[], rows: string[][]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => hdrCell(h)),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell => bodyCell(cell, ri % 2 === 1)),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function resolveCell(key: string, value: string, edits?: Record<string, string>): string {
  return edits?.[key] ?? value;
}

export async function generateQbrPrepV2Docx(
  reportData: any,
  edits?: Record<string, string>
): Promise<Buffer> {
  const meta = reportData.meta;
  const docChildren: any[] = [];

  let headerImage: Buffer | undefined;
  try {
    const headerPath = path.join(process.cwd(), "attached_assets", "biweekly_header.png");
    if (fs.existsSync(headerPath)) {
      headerImage = fs.readFileSync(headerPath);
    }
  } catch {}

  docChildren.push(
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: "QBR Prep: SEO Planning Snapshot", bold: true, size: 36, color: BLACK, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: resolveCell("meta_site", meta.site, edits),
          bold: true,
          size: 28,
          color: "374151",
          font: "Calibri",
        }),
      ],
    }),
  );

  const metaFields = [
    ["Domain", resolveCell("meta_domain", meta.domain, edits)],
    ["Primary Location", resolveCell("meta_location", meta.primaryLocation, edits)],
    ["Program / Positioning", resolveCell("meta_program", meta.programPositioning, edits)],
    ["Analysis Window", meta.analysisWindow],
    ["Planning Quarter", meta.planningQuarter],
    ["Generated On", meta.generatedOn],
  ];

  for (const [label, val] of metaFields) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 18, color: GRAY, font: "Calibri" }),
          new TextRun({ text: val, size: 18, color: "374151", font: "Calibri" }),
        ],
      })
    );
  }

  docChildren.push(new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }));

  const ami = reportData.sourceSnapshot?.manualInputs;
  if (ami && (ami.clientSentiment || ami.sentiment || ami.amThoughts || ami.hypothesis || ami.priorityChecks || ami.auditNotes || ami.clientNotes)) {
    docChildren.push(sectionHeading(0, "AM Inputs"));
    const amFields: [string, string][] = [];
    if (ami.clientSentiment || ami.sentiment) amFields.push(["Client Sentiment", resolveCell("am_sentiment", ami.clientSentiment ?? ami.sentiment ?? "", edits)]);
    if (ami.amThoughts || ami.hypothesis) amFields.push(["AM's Thoughts", resolveCell("am_thoughts", ami.amThoughts ?? ami.hypothesis ?? "", edits)]);
    if (ami.priorityChecks || ami.auditNotes) amFields.push(["Priority Checks", resolveCell("am_priority_checks", ami.priorityChecks ?? ami.auditNotes ?? "", edits)]);
    if (ami.clientNotes) amFields.push(["Client Notes", resolveCell("am_client_notes", ami.clientNotes, edits)]);
    for (const [label, val] of amFields) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 18, color: DARK_HEADER, font: "Calibri" }),
            new TextRun({ text: val, size: 18, color: "374151", font: "Calibri" }),
          ],
        })
      );
    }
    docChildren.push(new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }));
  }

  const s1 = reportData.section1Goals;
  docChildren.push(sectionHeading(1, "What Matters Most This Quarter"));
  const s1Rows = s1.rows.map((r: any, ri: number) => [
    resolveCell(`s1_${ri}_0`, r.goalType, edits),
    resolveCell(`s1_${ri}_1`, r.goal, edits),
    resolveCell(`s1_${ri}_2`, r.measurementSource, edits),
    resolveCell(`s1_${ri}_3`, r.goalShift, edits),
    resolveCell(`s1_${ri}_4`, r.reason, edits),
  ]);
  docChildren.push(makeTable(["Goal Type", "Goal", "Measurement Source", "Goal Shift", "Reason"], s1Rows));

  const s2 = reportData.section2Conversions;
  docChildren.push(sectionHeading(2, "Where Conversions Actually Happen"));
  docChildren.push(subHeading("Top Converting Pages"));
  const s2aRows = s2.topConvertingPages.map((r: any, ri: number) => [
    resolveCell(`s2a_${ri}_0`, r.dataSource ? `${r.type} [${r.dataSource}]` : r.type, edits),
    resolveCell(`s2a_${ri}_1`, r.page, edits),
    resolveCell(`s2a_${ri}_2`, r.notes, edits),
  ]);
  docChildren.push(makeTable(["Type", "Page / Pattern", "Notes / What We're Learning"], s2aRows));

  docChildren.push(subHeading("Top Converting Sources"));
  const s2bRows = s2.topConvertingSources.map((r: any, ri: number) => [
    resolveCell(`s2b_${ri}_0`, r.source, edits),
    resolveCell(`s2b_${ri}_1`, r.whatsConverting, edits),
    resolveCell(`s2b_${ri}_2`, r.notes, edits),
  ]);
  docChildren.push(makeTable(["Source", "What's Converting", "Notes"], s2bRows));

  if (s2.trackingDisclaimer) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({ text: s2.trackingDisclaimer, italics: true, size: 16, color: GRAY, font: "Calibri" }),
        ],
      })
    );
  }

  const s3 = reportData.section3Traffic;
  docChildren.push(sectionHeading(3, "Top Organic Traffic Drivers"));
  docChildren.push(subHeading("Top Traffic Topics"));
  const hasTopicDeltas = s3.topTrafficTopics.some((r: any) => r.queryCount != null);
  const s3aRows = s3.topTrafficTopics.map((r: any, ri: number) => {
    const cells = [resolveCell(`s3a_${ri}_0`, r.topic, edits)];
    if (hasTopicDeltas) {
      cells.push(
        String(r.queryCount ?? "—"),
        r.queryCountDelta ?? "—",
        r.impressions != null ? r.impressions.toLocaleString("en-US") : "—",
        r.impressionsDelta ?? "—",
      );
    }
    cells.push(
      resolveCell(`s3a_${ri}_1`, r.exampleQueries, edits),
      resolveCell(`s3a_${ri}_2`, r.connectionToAdmits, edits),
      resolveCell(`s3a_${ri}_3`, r.insight, edits),
    );
    return cells;
  });
  const s3aHeaders = hasTopicDeltas
    ? ["Topic", "# Queries", "Δ Queries", "Impressions", "Δ Impressions", "Example Queries", "Connection to Admits", "Insight"]
    : ["Topic", "Example Queries", "Connection to Admits", "Insight"];
  docChildren.push(makeTable(s3aHeaders, s3aRows));

  docChildren.push(subHeading("Top Traffic Pages"));
  const hasPageDeltas = s3.topTrafficPages.some((r: any) => r.clicksDelta || r.impressions || r.queries);
  const s3bRows = s3.topTrafficPages.map((r: any, ri: number) => {
    const cells = [
      resolveCell(`s3b_${ri}_0`, r.page, edits),
      resolveCell(`s3b_${ri}_1`, r.clicks, edits),
    ];
    if (hasPageDeltas) {
      cells.push(r.clicksDelta ?? "—", r.impressions ?? "—", r.impressionsDelta ?? "—", r.queries ?? "—", r.queriesDelta ?? "—");
    }
    cells.push(
      resolveCell(`s3b_${ri}_2`, r.ctr, edits),
      resolveCell(`s3b_${ri}_3`, r.connectionToAdmits, edits),
      resolveCell(`s3b_${ri}_4`, r.insight, edits),
    );
    return cells;
  });
  const s3bHeaders = hasPageDeltas
    ? ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "Δ Queries", "CTR", "Connection to Admits", "Insight"]
    : ["Page", "Clicks", "CTR", "Connection to Admits", "Insight"];
  docChildren.push(makeTable(s3bHeaders, s3bRows));

  const s4 = reportData.section4Services;
  docChildren.push(sectionHeading(4, "Site Service Overview"));
  const s4Rows = s4.services.map((r: any, ri: number) => [
    resolveCell(`s4_${ri}_0`, r.service, edits),
    resolveCell(`s4_${ri}_1`, r.examplePage, edits),
  ]);
  docChildren.push(makeTable(["Service", "Example Page"], s4Rows));

  const s5 = reportData.section5Diagnosis;
  docChildren.push(sectionHeading(5, "SEO Tier Diagnosis"));
  docChildren.push(
    new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({
          text: `Tier ${s5.tier} — ${s5.tierName}`,
          bold: true,
          size: 22,
          color: WEBSERV_RED,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: resolveCell("s5_diagnosis", s5.diagnosis, edits),
          size: 20,
          color: "374151",
          font: "Calibri",
        }),
      ],
    })
  );

  const s6 = reportData.section6Priorities;
  docChildren.push(sectionHeading(6, "What We Need to Do Next"));
  const s6Rows = s6.priorities.map((r: any, ri: number) => [
    resolveCell(`s6_${ri}_0`, String(r.priority), edits),
    resolveCell(`s6_${ri}_1`, r.initiative, edits),
    resolveCell(`s6_${ri}_2`, r.tier, edits),
    resolveCell(`s6_${ri}_3`, r.action, edits),
    resolveCell(`s6_${ri}_4`, r.reason, edits),
  ]);
  docChildren.push(makeTable(["#", "Initiative", "Tier", "Action", "Reason"], s6Rows));

  const s7 = reportData.section7Tracking;
  docChildren.push(sectionHeading(7, "What We Track"));
  if (edits) {
    const trackingLen = s7.tracking?.length ?? 0;
    for (let ri = 0; ri < trackingLen; ri++) {
      const hasStatus = s7.tracking[ri]?.status;
      if (!hasStatus && edits[`s7_${ri}_3`] && !edits[`s7_${ri}_4`]) {
        edits[`s7_${ri}_4`] = edits[`s7_${ri}_3`];
        delete edits[`s7_${ri}_3`];
      }
    }
  }
  const s7Rows = s7.tracking.map((r: any, ri: number) => [
    resolveCell(`s7_${ri}_0`, r.focusArea, edits),
    resolveCell(`s7_${ri}_1`, r.metric, edits),
    resolveCell(`s7_${ri}_2`, r.source, edits),
    resolveCell(`s7_${ri}_3`, r.status ?? "Needs Verification", edits),
    resolveCell(`s7_${ri}_4`, r.whyItMatters, edits),
  ]);
  docChildren.push(makeTable(["Focus Area", "Metric", "Source", "Status", "Why It Matters"], s7Rows));

  const qssb = reportData.sectionQssb;
  if (qssb?.clientInsights?.length > 0) {
    docChildren.push(sectionHeading(8, "Client Insights"));
    for (let i = 0; i < qssb.clientInsights.length; i++) {
      const q = qssb.clientInsights[i];
      docChildren.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: convertInchesToTwip(0.25) },
          border: { left: { color: ACCENT.replace("#", ""), size: 6, style: "single" as any, space: 4 } },
          children: [
            new TextRun({ text: resolveCell(`qssb_insight_${i}`, q.question, edits), size: 20, color: "374151", font: "Calibri" }),
          ],
        })
      );
    }
  }

  if (qssb?.additionalOpportunities?.length > 0) {
    const oppNum = qssb?.clientInsights?.length > 0 ? 9 : 8;
    docChildren.push(sectionHeading(oppNum, "Additional Opportunities"));
    const oppRows = qssb.additionalOpportunities.map((o: any, i: number) => [
      resolveCell(`qssb_opp_${i}_0`, o.service, edits),
      resolveCell(`qssb_opp_${i}_1`, o.description, edits),
      o.source ?? "",
    ]);
    docChildren.push(makeTable(["Service", "Description", "Source"], oppRows));
  }

  if (reportData.generationMeta) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({ text: "Sources: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
          new TextRun({ text: (reportData.generationMeta.dataSources ?? []).join(", ") || "None", size: 16, color: GRAY, font: "Calibri" }),
          ...(reportData.generationMeta.missingData?.length > 0
            ? [
                new TextRun({ text: " · Missing: ", bold: true, size: 16, color: GRAY, font: "Calibri" }),
                new TextRun({ text: reportData.generationMeta.missingData.join(", "), size: 16, color: GRAY, font: "Calibri" }),
              ]
            : []),
        ],
      })
    );
  }

  const headerChildren: any[] = [];
  if (headerImage) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: headerImage,
            transformation: { width: 612, height: 100 },
            type: "png",
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        headers: headerChildren.length > 0
          ? { default: new Header({ children: headerChildren }) }
          : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Webserv  |  32 Discovery Suite 130, Irvine, CA 92618  |  webserv.io",
                    size: 16,
                    color: GRAY,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(headerImage ? 1.8 : 1),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
