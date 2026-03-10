import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Paperclip, Link as LinkIcon, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { GapQuestion, GapAnswer, GapQuestionType } from "@shared/schema";
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

export function FillInTheGapsModal({
  questions,
  onComplete,
  onCancel,
  isGenerating = false,
  initialAnswers = {},
  onAnswersChange,
}: FillInTheGapsModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, GapAnswer>>(initialAnswers);
  const [showRationale, setShowRationale] = useState(false);
  const { toast } = useToast();

  const currentQuestion = questions[currentStep];
  const progress = ((currentStep + 1) / questions.length) * 100;

  useEffect(() => {
    if (onAnswersChange) onAnswersChange(answers);
  }, [answers]);


  const urlError = useMemo(() => {
    const url = answers[currentQuestion.id]?.supportingLink;
    if (!url) return null;
    try {
      let normalizedUrl = url.trim();
      if (normalizedUrl.match(/^(javascript|data|file|ftp|mailto):/i)) {
        return "Only http:// and https:// URLs are allowed.";
      }
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      const parsed = new URL(normalizedUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return `URL scheme "${parsed.protocol}" is not allowed. Only http:// and https:// are permitted.`;
      }
      return null;
    } catch (e) {
      return "Invalid URL format — must be a valid web address.";
    }
  }, [answers, currentQuestion.id]);

  const handleAnswerChange = (value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        answerType: currentQuestion.type,
        value,
        skipped: false,
        supportingLink: prev[currentQuestion.id]?.supportingLink,
        supportingDocumentName: prev[currentQuestion.id]?.supportingDocumentName,
        supportingDocumentData: prev[currentQuestion.id]?.supportingDocumentData,
        supportingDocumentMimeType: prev[currentQuestion.id]?.supportingDocumentMimeType,
        supportingDocumentSizeBytes: prev[currentQuestion.id]?.supportingDocumentSizeBytes,
        supportingDocumentUploadedAt: prev[currentQuestion.id]?.supportingDocumentUploadedAt,
      },
    }));
  };

  const handleMetadataChange = (field: keyof GapAnswer, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        answerType: currentQuestion.type,
        [field]: value,
        skipped: prev[currentQuestion.id]?.skipped ?? false,
        value: prev[currentQuestion.id]?.value ?? (currentQuestion.type === "multi_select" ? [] : currentQuestion.type === "boolean" ? null : ""),
      },
    }));
  };

  const handleUrlChange = (url: string) => {
    let normalizedUrl = url.trim();
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    // We update the state with the raw input for the user to see, 
    // but the useMemo will calculate the error
    handleMetadataChange("supportingLink", url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_GAP_FILE_TYPES.includes(file.type as any)) {
      toast({
        title: "Invalid file type",
        description: `Allowed types: PDF, TXT, CSV, DOC, PNG, JPG`,
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_GAP_FILE_SIZE_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum file size is 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      handleMetadataChange("supportingDocumentName", file.name);
      handleMetadataChange("supportingDocumentData", reader.result as string);
      handleMetadataChange("supportingDocumentMimeType", file.type);
      handleMetadataChange("supportingDocumentSizeBytes", file.size);
      handleMetadataChange("supportingDocumentUploadedAt", new Date().toISOString());
    };
    reader.readAsDataURL(file);
  };

  const next = () => {
    if (urlError) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid URL or clear the field.",
        variant: "destructive",
      });
      return;
    }

    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
      setShowRationale(false);
    } else {
      // Final normalization + scheme safety check before completion
      const finalAnswers = Object.values(answers).map(ans => {
        if (ans.supportingLink) {
          let url = ans.supportingLink.trim();
          if (url.match(/^(javascript|data|file|ftp|mailto):/i)) {
            return { ...ans, supportingLink: null };
          }
          if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
          }
          try {
            const parsed = new URL(url);
            if (!["http:", "https:"].includes(parsed.protocol)) {
              return { ...ans, supportingLink: null };
            }
            return { ...ans, supportingLink: parsed.toString() };
          } catch {
            return { ...ans, supportingLink: null };
          }
        }
        return ans;
      });
      onComplete(finalAnswers);
    }
  };

  const back = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setShowRationale(false);
    }
  };

  const skip = () => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        answerType: currentQuestion.type,
        value: null,
        skipped: true,
      },
    }));
    next();
  };

  const renderQuestionInput = () => {
    const answer = answers[currentQuestion.id];
    const value = answer?.value;

    switch (currentQuestion.type) {
      case "short_text":
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder={currentQuestion.placeholder || "Enter your answer..."}
            className="w-full"
            data-testid={`input-gap-short-${currentQuestion.id}`}
          />
        );
      case "long_text":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder={currentQuestion.placeholder || "Provide details..."}
            className="w-full min-h-[100px] mt-1"
            data-testid={`input-gap-long-${currentQuestion.id}`}
          />
        );
      case "single_select":
        return (
          <Select
            value={(value as string) || ""}
            onValueChange={handleAnswerChange}
          >
            <SelectTrigger className="w-full" data-testid={`select-gap-single-${currentQuestion.id}`}>
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {currentQuestion.options?.map((opt) => (
                <SelectItem key={opt} value={opt} data-testid={`option-gap-${opt}`}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multi_select":
        const selectedOptions = (value as string[]) || [];
        return (
          <div className="space-y-2 mt-2">
            {currentQuestion.options?.map((opt) => (
              <div key={opt} className="flex items-center space-x-2">
                <Checkbox
                  id={opt}
                  checked={selectedOptions.includes(opt)}
                  onCheckedChange={(checked) => {
                    const nextValue = checked
                      ? [...selectedOptions, opt]
                      : selectedOptions.filter((o) => o !== opt);
                    handleAnswerChange(nextValue);
                  }}
                  data-testid={`checkbox-gap-${opt}`}
                />
                <Label htmlFor={opt} className="text-sm font-normal">
                  {opt}
                </Label>
              </div>
            ))}
          </div>
        );
      case "boolean":
        return (
          <div className="flex gap-2 mt-2">
            <Button
              variant={value === true ? "default" : "outline"}
              onClick={() => handleAnswerChange(true)}
              className="flex-1"
              data-testid={`button-gap-yes-${currentQuestion.id}`}
            >
              Yes
            </Button>
            <Button
              variant={value === false ? "default" : "outline"}
              onClick={() => handleAnswerChange(false)}
              className="flex-1"
              data-testid={`button-gap-no-${currentQuestion.id}`}
            >
              No
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  const isNextDisabled = () => {
    const answer = answers[currentQuestion.id];
    if (!answer || answer.skipped) return false; // Allowed to skip or move forward if skipping
    if (urlError) return true;
    if (currentQuestion.type === "multi_select") return (answer.value as string[]).length === 0;
    if (currentQuestion.type === "boolean") return answer.value === null;
    return !(answer.value as string)?.trim();
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden gap-0" data-testid="gap-analysis-modal">
        <div className="absolute top-0 left-0 w-full h-1 bg-muted">
          <Progress value={progress} className="h-full rounded-none transition-all duration-300" />
        </div>

        <DialogHeader className="p-6 pb-2 pt-8">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Question {currentStep + 1} of {questions.length}
            </span>
            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              {currentQuestion.sourceCategory.replace(/_/g, " ")}
            </span>
          </div>
          <DialogTitle className="text-lg font-semibold leading-tight">
            {currentQuestion.prompt}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Answer this question to improve your report quality. You can skip any question.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-2 space-y-4">
          <div className="min-h-[120px]">
            {renderQuestionInput()}
          </div>

          <div className="space-y-3 pt-2 border-t mt-4">
            <div className="flex flex-col gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                  <div className="relative flex-1">
                    <Input
                      placeholder="Supporting link (optional)"
                      className={`h-8 text-xs pr-8 ${urlError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      value={answers[currentQuestion.id]?.supportingLink || ""}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      data-testid="input-gap-link"
                    />
                    {answers[currentQuestion.id]?.supportingLink && !urlError && (
                      <CheckCircle2 className="w-3 h-3 text-green-500 absolute right-2.5 top-2.5" />
                    )}
                    {urlError && (
                      <AlertCircle className="w-3 h-3 text-destructive absolute right-2.5 top-2.5" />
                    )}
                  </div>
                </div>
                {urlError && (
                  <p className="text-[10px] text-destructive ml-5">{urlError}</p>
                )}
                {answers[currentQuestion.id]?.supportingLink && !urlError && (
                  <p className="text-[10px] text-green-600 ml-5 flex items-center gap-1">
                    Valid link: <span className="truncate max-w-[200px]">{answers[currentQuestion.id]?.supportingLink}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Paperclip className="w-3 h-3 text-muted-foreground" />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      className="hidden"
                      id="gap-file-upload"
                      onChange={handleFileUpload}
                      accept={ALLOWED_GAP_FILE_TYPES.join(",")}
                    />
                    <Label
                      htmlFor="gap-file-upload"
                      className="h-8 flex items-center px-3 border rounded-md text-xs cursor-pointer hover:bg-muted transition-colors flex-1"
                      data-testid="label-gap-file"
                    >
                      {answers[currentQuestion.id]?.supportingDocumentName ? (
                        <span className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="w-3 h-3" />
                          <span className="truncate max-w-[200px]">{answers[currentQuestion.id]?.supportingDocumentName}</span>
                        </span>
                      ) : "Attach file (optional)"}
                    </Label>
                    {answers[currentQuestion.id]?.supportingDocumentName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive"
                        onClick={() => {
                          handleMetadataChange("supportingDocumentName", null);
                          handleMetadataChange("supportingDocumentData", null);
                          handleMetadataChange("supportingDocumentMimeType", null);
                          handleMetadataChange("supportingDocumentSizeBytes", null);
                          handleMetadataChange("supportingDocumentUploadedAt", null);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {answers[currentQuestion.id]?.supportingDocumentName && (
                    <p className="text-[10px] text-muted-foreground ml-1">
                      {formatFileSize(answers[currentQuestion.id]?.supportingDocumentSizeBytes)} • {answers[currentQuestion.id]?.supportingDocumentMimeType?.split("/")[1]?.toUpperCase()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {currentQuestion.showRationaleToUser && (
              <Collapsible open={showRationale} onOpenChange={setShowRationale} className="w-full">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between p-0 h-auto text-[11px] text-muted-foreground hover:bg-transparent">
                    Why are we asking this?
                    {showRationale ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <p className="text-[11px] leading-relaxed text-muted-foreground italic">
                    {currentQuestion.rationale}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-muted/30 flex-row justify-between sm:justify-between items-center gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={back}
              disabled={currentStep === 0 || isGenerating}
              data-testid="button-gap-back"
            >
              Back
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={skip}
              disabled={isGenerating}
              data-testid="button-gap-skip"
            >
              Skip
            </Button>
            <Button
              size="sm"
              onClick={next}
              disabled={isNextDisabled() || isGenerating}
              data-testid="button-gap-next"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : currentStep === questions.length - 1 ? (
                "Generate Report"
              ) : (
                "Next"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

