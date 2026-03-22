/**
 * qcr-slides.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated slide rendering components for the Quarterly Content Roadmap.
 *
 * Visual language: matches the Webserv bi-weekly report family.
 *   • Light gray background (#F8FAFC) for all content slides
 *   • Swoosh header image via ReportTopHeaderLarge / ReportTopHeader
 *   • Black (#1F2937) table header rows with white text — per Webserv standard
 *   • Navy (#1B3A6B) month divider slides with red left-stripe accent
 *   • Red (#C0392B) bullet accent dots
 *   • Footer: thin line + "Webserv | webserv.io" / "CONFIDENTIAL"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { CSSProperties } from "react";
import { EditableSection } from "./editable-section";
import {
  RED, PAGE_BG, TEXT_PRIMARY, TEXT_SECONDARY,
  ReportTopHeader,
  ReportTopHeaderLarge,
  ReportTitleBlock,
  ReportFooter,
  SlideTableWithCustomRows,
} from "./report-primitives";
import type { Slide } from "./report-primitives";

export interface QcrSlideProps {
  slide: Slide;
  edits: Record<string, string>;
  onEdit: (k: string, v: string) => void;
  headerUrl: string;
}

// Header heights in px (slide canvas is 720×405)
const INNER_HDR_H = 58;   // content slides
const TITLE_HDR_H = 148;  // title slide

// ─── QcrTitleSlide ────────────────────────────────────────────────────────────
export function QcrTitleSlide({ slide, edits, onEdit, headerUrl }: QcrSlideProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}>
      <ReportTopHeaderLarge headerUrl={headerUrl} height={TITLE_HDR_H} />
      <div style={{ position: "absolute", top: TITLE_HDR_H + 10, left: 36, right: 36, bottom: 30 }}>
        <ReportTitleBlock
          slideId={slide.id}
          title={edits[`${slide.id}_title`] ?? slide.title ?? ""}
          clientName={edits[`${slide.id}_client`] ?? slide.clientName ?? ""}
          date={slide.date}
          edits={edits}
          onEdit={onEdit}
        />
      </div>
      <ReportFooter />
    </div>
  );
}

// ─── QcrDividerSlide ──────────────────────────────────────────────────────────
// Month section break — navy background, red left stripe, large white month name
export function QcrDividerSlide({ slide, edits, onEdit }: QcrSlideProps) {
  const title    = edits[`${slide.id}_title`]    ?? slide.title    ?? "";
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle ?? "";

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#1B3A6B",
      fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
    }}>
      {/* Red left-edge accent stripe */}
      <div style={{
        position: "absolute",
        left: 0, top: "35%",
        width: 10, height: "28%",
        background: RED,
        borderRadius: "0 2px 2px 0",
      }} />

      {/* Text block */}
      <div style={{
        position: "absolute",
        left: 28, right: 28,
        top: "22%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        <EditableSection
          editKey={`${slide.id}_title`}
          value={title}
          edits={edits}
          onEdit={onEdit}
          as="div"
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: "#FFFFFF",
            lineHeight: 1.1,
          } as CSSProperties}
        />
        {subtitle && (
          <EditableSection
            editKey={`${slide.id}_subtitle`}
            value={subtitle}
            edits={edits}
            onEdit={onEdit}
            as="div"
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.52)",
              fontWeight: 400,
              lineHeight: 1.4,
            } as CSSProperties}
          />
        )}
      </div>

      {/* Webserv watermark bottom-right */}
      <div style={{
        position: "absolute",
        bottom: 10, right: 14,
        fontSize: 7.5,
        color: "rgba(255,255,255,0.3)",
        letterSpacing: "0.06em",
      }}>
        Webserv
      </div>
    </div>
  );
}

// ─── QcrStrategySlide ─────────────────────────────────────────────────────────
// Strategy / bullets slide — header swoosh + subtitle + red-dot bullet list
export function QcrStrategySlide({ slide, edits, onEdit, headerUrl }: QcrSlideProps) {
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />

      <div style={{
        position: "absolute",
        top: INNER_HDR_H + 5,
        left: 16, right: 16, bottom: 30,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Subtitle / descriptor */}
        {subtitle && (
          <div style={{ fontSize: 8, color: TEXT_SECONDARY, marginBottom: 5, fontStyle: "italic", flexShrink: 0 }}>
            <EditableSection
              editKey={`${slide.id}_subtitle`}
              value={subtitle}
              edits={edits}
              onEdit={onEdit}
              as="span"
            />
          </div>
        )}

        {/* Thin red accent rule */}
        <div style={{ height: 1.5, background: RED, opacity: 0.35, marginBottom: 9, flexShrink: 0 }} />

        {/* Bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "hidden", flex: 1 }}>
          {(slide.bullets ?? []).map((b, bi) => (
            <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: RED, fontWeight: 900, fontSize: 11, lineHeight: 1.3, flexShrink: 0 }}>•</span>
              <EditableSection
                editKey={`${slide.id}_bullet_${bi}`}
                value={b}
                edits={edits}
                onEdit={onEdit}
                as="div"
                multiline
                className="flex-1"
                style={{ fontSize: 10.5, color: TEXT_PRIMARY, lineHeight: 1.45 } as CSSProperties}
              />
            </div>
          ))}
        </div>
      </div>

      <ReportFooter />
    </div>
  );
}

// ─── QcrProductionSlide ───────────────────────────────────────────────────────
// Monthly production table slide — black header row, white text, alternating rows
export function QcrProductionSlide({ slide, edits, onEdit, headerUrl }: QcrSlideProps) {
  const { headers = [], rows = [] } = slide.table ?? {};
  const subtitle = edits[`${slide.id}_subtitle`] ?? slide.subtitle;

  return (
    <div style={{ position: "absolute", inset: 0, background: PAGE_BG, fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif" }}>
      <ReportTopHeader slideTitle={edits[`${slide.id}_title`] ?? slide.title} headerUrl={headerUrl} />

      <div style={{
        position: "absolute",
        top: INNER_HDR_H + 5,
        left: 16, right: 16, bottom: 30,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Subtitle */}
        {subtitle && (
          <div style={{ fontSize: 8, color: TEXT_SECONDARY, marginBottom: 5, fontStyle: "italic", flexShrink: 0 }}>
            <EditableSection
              editKey={`${slide.id}_subtitle`}
              value={subtitle}
              edits={edits}
              onEdit={onEdit}
              as="span"
            />
          </div>
        )}

        {/* Table with dark header */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <SlideTableWithCustomRows
            slideId={slide.id}
            tableKey="table"
            headers={headers}
            rows={rows}
            edits={edits}
            onEdit={onEdit}
            darkHeader={true}
          />
        </div>
      </div>

      <ReportFooter />
    </div>
  );
}

