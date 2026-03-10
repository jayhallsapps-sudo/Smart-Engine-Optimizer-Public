import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Link, SkipForward, CheckCircle2 } from "lucide-react";
import type { GapQuestion, GapAnswer } from "@shared/schema";
import { GAP_CONTEXT_FIELD_LABELS } from "@shared/schema";

interface ClarificationTrailProps {
  questions: GapQuestion[];
  answers: GapAnswer[];
  seoHqLoadStatus?: any;
  enabled: boolean;
  answerUsage?: Record<string, string> | null;
}

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  missing_data_source: "Missing Data",
  low_confidence_metric: "Low Confidence",
  contradictory_signals: "Contradictory",
  strategy_alignment_gap: "Strategy Gap",
  SEO_HQ_alignment_gap: "SEO HQ",
  client_context_enrichment: "Client Context",
  competitive_intelligence: "Competitive",
  reporting_scope: "Scope",
  content_strategy: "Content",
};

const SOURCE_CATEGORY_COLORS: Record<string, string> = {
  missing_data_source: "bg-red-100 text-red-700",
  low_confidence_metric: "bg-orange-100 text-orange-700",
  contradictory_signals: "bg-yellow-100 text-yellow-700",
  strategy_alignment_gap: "bg-blue-100 text-blue-700",
  SEO_HQ_alignment_gap: "bg-purple-100 text-purple-700",
  client_context_enrichment: "bg-green-100 text-green-700",
  competitive_intelligence: "bg-teal-100 text-teal-700",
  reporting_scope: "bg-gray-100 text-gray-700",
  content_strategy: "bg-indigo-100 text-indigo-700",
};

function formatSeoHqStatus(status: any): { text: string; color: string } {
  if (!status) return { text: "Not loaded", color: "text-gray-500" };
  if (typeof status === "string") return { text: status, color: "text-gray-500" };
  if (status.overallStatus) {
    const map: Record<string, { text: string; color: string }> = {
      loaded: { text: "Loaded", color: "text-green-600" },
      partial: { text: "Partial (one source failed)", color: "text-amber-600" },
      unavailable: { text: "Unavailable", color: "text-red-500" },
      timed_out: { text: "Timed out (5s)", color: "text-amber-600" },
    };
    return map[status.overallStatus] ?? { text: status.overallStatus, color: "text-gray-500" };
  }
  return { text: "Unknown", color: "text-gray-400" };
}

function formatAnswerValue(answer: GapAnswer): string {
  if (answer.skipped) return "Skipped";
  if (answer.value === null || answer.value === undefined) return "No answer";
  if (Array.isArray(answer.value)) return answer.value.join(", ") || "None selected";
  if (typeof answer.value === "boolean") return answer.value ? "Yes" : "No";
  return String(answer.value) || "No answer";
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ClarificationTrail({ questions, answers, seoHqLoadStatus, enabled, answerUsage }: ClarificationTrailProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (!enabled || questions.length === 0) return null;

  const answeredCount = answers.filter(a => !a.skipped).length;
  const skippedCount = answers.filter(a => a.skipped).length;
  const usedCount = answerUsage ? Object.keys(answerUsage).length : 0;

  const answerMap = new Map(answers.map(a => [a.questionId, a]));

  const seoHqStatus = formatSeoHqStatus(seoHqLoadStatus);

  return (
    <aside
      className="print:hidden mt-6 border border-dashed border-gray-300 rounded-lg bg-gray-50/70 text-sm"
      data-testid="clarification-trail"
    >
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left select-none"
        onClick={() => setCollapsed(c => !c)}
        data-testid="clarification-trail-toggle"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 font-medium text-gray-600">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Clarification Trail
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
            Internal
          </span>
          {answerUsage && usedCount > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {usedCount} used in report
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">
          {questions.length} question{questions.length !== 1 ? "s" : ""} · {answeredCount} answered · {skippedCount} skipped
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-dashed border-gray-200 pt-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            <span>
              <span className="font-semibold text-gray-700">Fill in the Gaps:</span>{" "}
              <span className="text-green-600 font-medium">Enabled</span>
            </span>
            <span>
              <span className="font-semibold text-gray-700">SEO HQ Context:</span>{" "}
              <span className={seoHqStatus.color}>{seoHqStatus.text}</span>
            </span>
            <span>
              <span className="font-semibold text-gray-700">Questions asked:</span> {questions.length}
              {" · "}
              <span className="font-semibold text-gray-700">Answered:</span> {answeredCount}
              {" · "}
              <span className="font-semibold text-gray-700">Skipped:</span> {skippedCount}
            </span>
          </div>

          <ol className="space-y-3">
            {questions.map((q, idx) => {
              const answer = answerMap.get(q.id);
              const skipped = !answer || answer.skipped;
              const categoryLabel = SOURCE_CATEGORY_LABELS[q.sourceCategory] ?? q.sourceCategory;
              const categoryColor = SOURCE_CATEGORY_COLORS[q.sourceCategory] ?? "bg-gray-100 text-gray-600";
              const answerText = answer ? formatAnswerValue(answer) : "No answer recorded";
              const usedField = answerUsage?.[q.id];
              const usedFieldLabel = usedField ? (GAP_CONTEXT_FIELD_LABELS[usedField] ?? usedField) : null;

              return (
                <li
                  key={q.id}
                  className="border border-gray-200 rounded-md bg-white p-3 space-y-1.5"
                  data-testid={`clarification-trail-item-${q.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-700 font-medium text-xs leading-snug flex-1">
                      <span className="text-gray-400 mr-1.5">Q{idx + 1}.</span>
                      {q.prompt}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {usedFieldLabel && !skipped && (
                        <span
                          className="flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded"
                          data-testid={`usage-badge-${q.id}`}
                          title={`Used in: ${usedFieldLabel}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {usedFieldLabel}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${categoryColor}`}>
                        {categoryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 text-xs">
                    {skipped ? (
                      <span className="flex items-center gap-1 text-gray-400 italic">
                        <SkipForward className="h-3 w-3" /> Skipped
                      </span>
                    ) : (
                      <span className="text-gray-700 break-words max-w-full">
                        <span className="font-medium text-gray-500 mr-1">Answer:</span>
                        {answerText}
                      </span>
                    )}
                  </div>

                  {answer && !answer.skipped && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      {answer.supportingLink && (
                        <a
                          href={answer.supportingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline truncate max-w-xs"
                          data-testid={`clarification-link-${q.id}`}
                        >
                          <Link className="h-3 w-3 shrink-0" />
                          {answer.supportingLink.replace(/^https?:\/\//, "").slice(0, 50)}
                          {answer.supportingLink.length > 55 ? "…" : ""}
                        </a>
                      )}
                      {answer.supportingDocumentName && (
                        <span
                          className="flex items-center gap-1 text-[11px] text-gray-500"
                          data-testid={`clarification-file-${q.id}`}
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          {answer.supportingDocumentName}
                          {answer.supportingDocumentSizeBytes
                            ? ` (${formatFileSize(answer.supportingDocumentSizeBytes)})`
                            : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {q.rationale && q.showRationaleToUser && (
                    <p className="text-[11px] text-gray-400 italic border-t border-gray-100 pt-1.5 mt-1.5">
                      Why asked: {q.rationale}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </aside>
  );
}
