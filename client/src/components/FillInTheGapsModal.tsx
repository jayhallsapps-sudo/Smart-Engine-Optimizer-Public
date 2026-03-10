import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Paperclip, Link as LinkIcon, Loader2, CheckCircle2, AlertCircle, Sparkles, SkipForward } from "lucide-react";
import type { GapQuestion, GapAnswer } from "@shared/schema";
import { ALLOWED_GAP_FILE_TYPES, MAX_GAP_FILE_SIZE_BYTES } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface FillInTheGapsModalProps {
  questions: GapQuestion[];
  onComplete: (answers: GapAnswer[]) => void;
  onCancel: () => void;
  isGenerating?: boolean;
  initialAnswers?: Record<string, GapAnswer>;
  onAnswersChange?: (answers: Record<string, GapAnswer>) => void;
}

function validateUrl(url: string): string | null {
  if (!url) return null;
  try {
    let normalized = url.trim();
    if (normalized.match(/^(javascript|data|file|ftp|mailto):/i)) return "Only http:// and https:// URLs are allowed.";
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return `URL scheme "${parsed.protocol}" is not allowed.`;
    return null;
  } catch {
    return "Invalid URL format — must be a valid web address.";
  }
}

function normalizeUrl(url: string): string | null {
  if (!url) return null;
  let normalized = url.trim();
  if (normalized.match(/^(javascript|data|file|ftp|mailto):/i)) return null;
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function QuestionCard({
  question,
  answer,
  onAnswer,
  onSkip,
}: {
  question: GapQuestion;
  answer: GapAnswer | undefined;
  onAnswer: (id: string, update: Partial<GapAnswer>) => void;
  onSkip: (id: string) => void;
}) {
  const { toast } = useToast();
  const urlError = useMemo(() => validateUrl(answer?.supportingLink ?? ""), [answer?.supportingLink]);
  const isSkipped = answer?.skipped === true;
  const hasValue = (() => {
    if (isSkipped) return true;
    const v = answer?.value;
    if (question.type === "multi_select") return Array.isArray(v) && v.length > 0;
    if (question.type === "boolean") return v === true || v === false;
    return typeof v === "string" && v.trim().length > 0;
  })();

  function setValue(value: any) {
    onAnswer(question.id, { value, skipped: false });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_GAP_FILE_TYPES.includes(file.type as any)) {
      toast({ title: "Invalid file type", description: "Allowed: PDF, TXT, CSV, DOC, PNG, JPG", variant: "destructive" });
      return;
    }
    if (file.size > MAX_GAP_FILE_SIZE_BYTES) {
      toast({ title: "File too large", description: "Maximum file size is 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onAnswer(question.id, {
        supportingDocumentName: file.name,
        supportingDocumentData: reader.result as string,
        supportingDocumentMimeType: file.type,
        supportingDocumentSizeBytes: file.size,
        supportingDocumentUploadedAt: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  }

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`relative rounded-lg border p-4 transition-all ${
        isSkipped
          ? "border-dashed border-muted-foreground/30 bg-muted/20 opacity-60"
          : hasValue
            ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
            : "border-border bg-card"
      }`}
      data-testid={`gap-card-${question.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {question.sourceCategory.replace(/_/g, " ")}
            </span>
            {hasValue && !isSkipped && (
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            )}
            {isSkipped && (
              <span className="text-[10px] text-muted-foreground italic">Skipped</span>
            )}
          </div>
          <p className="text-sm font-medium leading-snug text-foreground">{question.prompt}</p>
          {question.showRationaleToUser && question.rationale && (
            <p className="text-[11px] text-muted-foreground mt-1 italic">{question.rationale}</p>
          )}
        </div>
        {!isSkipped && (
          <button
            onClick={() => onSkip(question.id)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 mt-0.5"
            data-testid={`button-skip-${question.id}`}
            title="Skip this question"
          >
            <SkipForward className="w-3 h-3" />
            Skip
          </button>
        )}
        {isSkipped && (
          <button
            onClick={() => onAnswer(question.id, { skipped: false })}
            className="text-[10px] text-primary hover:underline shrink-0 mt-0.5"
            data-testid={`button-unskip-${question.id}`}
          >
            Answer
          </button>
        )}
      </div>

      {!isSkipped && (
        <div className="space-y-3">
          <div>
            {question.type === "short_text" && (
              <Input
                value={(answer?.value as string) || ""}
                onChange={(e) => setValue(e.target.value)}
                placeholder={question.placeholder || "Enter your answer..."}
                className="text-sm"
                data-testid={`input-gap-short-${question.id}`}
              />
            )}
            {question.type === "long_text" && (
              <Textarea
                value={(answer?.value as string) || ""}
                onChange={(e) => setValue(e.target.value)}
                placeholder={question.placeholder || "Provide details..."}
                className="text-sm min-h-[80px] resize-none"
                data-testid={`input-gap-long-${question.id}`}
              />
            )}
            {question.type === "single_select" && (
              <Select value={(answer?.value as string) || ""} onValueChange={setValue}>
                <SelectTrigger className="text-sm" data-testid={`select-gap-single-${question.id}`}>
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent>
                  {question.options?.map((opt) => (
                    <SelectItem key={opt} value={opt} data-testid={`option-gap-${opt}`}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {question.type === "multi_select" && (
              <div className="space-y-1.5">
                {question.options?.map((opt) => {
                  const selected = ((answer?.value as string[]) || []).includes(opt);
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        id={`${question.id}-${opt}`}
                        checked={selected}
                        onCheckedChange={(checked) => {
                          const curr = (answer?.value as string[]) || [];
                          setValue(checked ? [...curr, opt] : curr.filter((o) => o !== opt));
                        }}
                        data-testid={`checkbox-gap-${question.id}-${opt}`}
                      />
                      <Label htmlFor={`${question.id}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                    </div>
                  );
                })}
              </div>
            )}
            {question.type === "boolean" && (
              <div className="flex gap-2">
                <Button
                  variant={answer?.value === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setValue(true)}
                  className="flex-1"
                  data-testid={`button-gap-yes-${question.id}`}
                >
                  Yes
                </Button>
                <Button
                  variant={answer?.value === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setValue(false)}
                  className="flex-1"
                  data-testid={`button-gap-no-${question.id}`}
                >
                  No
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="relative flex-1">
                  <Input
                    placeholder="Supporting link (optional)"
                    className={`h-7 text-xs pr-7 ${urlError ? "border-destructive" : ""}`}
                    value={answer?.supportingLink || ""}
                    onChange={(e) => onAnswer(question.id, { supportingLink: e.target.value })}
                    data-testid="input-gap-link"
                  />
                  {answer?.supportingLink && !urlError && <CheckCircle2 className="w-3 h-3 text-green-500 absolute right-2 top-2" />}
                  {urlError && <AlertCircle className="w-3 h-3 text-destructive absolute right-2 top-2" />}
                </div>
              </div>
              {urlError && <p className="text-[10px] text-destructive ml-5">{urlError}</p>}
            </div>

            <div className="flex items-center gap-2">
              <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <Input
                  type="file"
                  className="hidden"
                  id={`gap-file-${question.id}`}
                  onChange={handleFileUpload}
                  accept={ALLOWED_GAP_FILE_TYPES.join(",")}
                />
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`gap-file-${question.id}`}
                    className="h-7 flex items-center px-3 border rounded-md text-xs cursor-pointer hover:bg-muted transition-colors flex-1"
                    data-testid={`label-gap-file-${question.id}`}
                  >
                    {answer?.supportingDocumentName ? (
                      <span className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="truncate max-w-[180px]">{answer.supportingDocumentName}</span>
                        <span className="text-muted-foreground ml-1">{formatFileSize(answer.supportingDocumentSizeBytes)}</span>
                      </span>
                    ) : "Attach file (optional)"}
                  </Label>
                  {answer?.supportingDocumentName && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive text-xs"
                      onClick={() => onAnswer(question.id, {
                        supportingDocumentName: undefined,
                        supportingDocumentData: undefined,
                        supportingDocumentMimeType: undefined,
                        supportingDocumentSizeBytes: undefined,
                        supportingDocumentUploadedAt: undefined,
                      })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FillInTheGapsModal({
  questions,
  onComplete,
  onCancel,
  isGenerating = false,
  initialAnswers = {},
  onAnswersChange,
}: FillInTheGapsModalProps) {
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>(initialAnswers);

  function updateAnswer(id: string, update: Partial<GapAnswer>) {
    setAnswers((prev) => {
      const existing = prev[id] ?? {
        questionId: id,
        answerType: questions.find((q) => q.id === id)?.type ?? "short_text",
        value: null,
        skipped: false,
      };
      const next = { ...existing, ...update };
      const updated = { ...prev, [id]: next };
      if (onAnswersChange) onAnswersChange(updated);
      return updated;
    });
  }

  function skipQuestion(id: string) {
    updateAnswer(id, { skipped: true, value: null });
  }

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    if (!a) return false;
    if (a.skipped) return true;
    const v = a.value;
    if (q.type === "multi_select") return Array.isArray(v) && v.length > 0;
    if (q.type === "boolean") return v === true || v === false;
    return typeof v === "string" && v.trim().length > 0;
  }).length;

  const hasUrlErrors = questions.some((q) => {
    const link = answers[q.id]?.supportingLink;
    return link && validateUrl(link) !== null;
  });

  function handleSubmit() {
    if (hasUrlErrors) return;
    const finalAnswers = questions.map((q) => {
      const a = answers[q.id] ?? {
        questionId: q.id,
        answerType: q.type,
        value: null,
        skipped: true,
      };
      const link = a.supportingLink;
      return { ...a, supportingLink: link ? normalizeUrl(link) : null };
    });
    onComplete(finalAnswers);
  }

  if (questions.length === 0) {
    return (
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
        <DialogContent className="sm:max-w-lg" data-testid="gap-analysis-modal">
          <DialogHeader>
            <DialogTitle>Fill in the Gaps</DialogTitle>
            <DialogDescription className="sr-only">No questions to answer.</DialogDescription>
          </DialogHeader>
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">All data sources are connected.</p>
            <p className="text-xs text-muted-foreground mt-1">No additional context is needed — generating your report now.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" onClick={() => onComplete([])} data-testid="button-gap-generate">Generate Report</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="sm:max-w-2xl p-0 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        data-testid="gap-analysis-modal"
      >
        <DialogDescription className="sr-only">
          Answer questions to improve your report quality. You can skip any question.
        </DialogDescription>

        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <DialogTitle className="text-base font-semibold">Fill in the Gaps</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We've auto-filled everything we could from your connected data sources. The {questions.length === 1 ? "question" : `${questions.length} questions`} below need a quick answer to make your report more accurate.
            Every field is optional — skip anything you'd rather omit.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((answeredCount / questions.length) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {answeredCount} of {questions.length} answered
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" data-testid="gap-questions-list">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              answer={answers[q.id]}
              onAnswer={updateAnswer}
              onSkip={skipQuestion}
            />
          ))}
        </div>

        <div className="px-6 py-4 border-t bg-muted/30 shrink-0 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isGenerating}
            data-testid="button-gap-cancel"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {answeredCount < questions.length && (
              <span className="text-[11px] text-muted-foreground">
                {questions.length - answeredCount} unanswered {questions.length - answeredCount === 1 ? "question" : "questions"} will be skipped
              </span>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={hasUrlErrors || isGenerating}
              data-testid="button-gap-generate"
              className="min-w-[130px]"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1.5" /> Generate Report</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
