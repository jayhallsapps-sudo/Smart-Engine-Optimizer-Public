import { useState, useCallback, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { GapQuestion, GapAnswer, AmInputs } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface UseFillInTheGapsProps {
  reportType: string;
}

interface GapDraft {
  questions: GapQuestion[];
  partialAnswers: Record<string, GapAnswer>;
  seoHqLoadStatus: any;
  savedAt: string;
}

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getDraftKey(reportType: string, clientId?: number) {
  return `gap_draft_${reportType}_${clientId ?? "none"}`;
}

function loadDraft(reportType: string, clientId?: number): GapDraft | null {
  try {
    const key = getDraftKey(reportType, clientId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft: GapDraft = JSON.parse(raw);
    if (Date.now() - new Date(draft.savedAt).getTime() > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(reportType: string, clientId: number | undefined, draft: GapDraft) {
  try {
    localStorage.setItem(getDraftKey(reportType, clientId), JSON.stringify(draft));
  } catch {}
}

function clearDraft(reportType: string, clientId: number | undefined) {
  try {
    localStorage.removeItem(getDraftKey(reportType, clientId));
  } catch {}
}

export function useFillInTheGaps({ reportType }: UseFillInTheGapsProps) {
  const { toast } = useToast();
  const [fillInGapsEnabled, setFillInGapsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [questions, setQuestions] = useState<GapQuestion[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [seoHqLoadStatus, setSeoHqLoadStatus] = useState<any>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, GapAnswer>>({});
  const [answerUsage, setAnswerUsage] = useState<Record<string, string> | null>(null);

  const currentClientIdRef = useRef<number | undefined>(undefined);

  const isRunningRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);

  const answersRef = useRef<GapAnswer[]>([]);

  const runGapAnalysis = useCallback(async (
    clientId: number,
    amInputs: AmInputs,
    reportContext?: any
  ) => {
    if (isRunningRef.current) return { hasQuestions: false };
    isRunningRef.current = true;
    currentClientIdRef.current = clientId;
    setIsAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/reports/gap-analysis", {
        reportType,
        clientId,
        amInputs,
        reportContext,
      });
      const result = await res.json();

      setSeoHqLoadStatus(result.seoHqLoadStatus);

      if (result.shouldAskQuestions && result.questions?.length > 0) {
        const existingDraft = loadDraft(reportType, clientId);
        if (existingDraft && JSON.stringify(existingDraft.questions.map((q: any) => q.id)) === JSON.stringify(result.questions.map((q: any) => q.id))) {
          setDraftAnswers(existingDraft.partialAnswers);
        } else {
          setDraftAnswers({});
        }
        setQuestions(result.questions);
        setShowModal(true);
        return { hasQuestions: true };
      } else {
        return { hasQuestions: false };
      }
    } catch (err: any) {
      toast({
        title: "Gap analysis failed",
        description: err.message,
        variant: "destructive",
      });
      return { hasQuestions: false, error: err };
    } finally {
      setIsAnalyzing(false);
      isRunningRef.current = false;
    }
  }, [reportType, toast]);

  const handleAnswersChange = useCallback((partialAnswers: Record<string, GapAnswer>) => {
    if (questions.length === 0) return;
    saveDraft(reportType, currentClientIdRef.current, {
      questions,
      partialAnswers,
      seoHqLoadStatus,
      savedAt: new Date().toISOString(),
    });
    setDraftAnswers(partialAnswers);
  }, [reportType, questions, seoHqLoadStatus]);

  const submitAnswers = useCallback(async (
    clientId: number,
    answers: GapAnswer[]
  ) => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (isSubmittingRef.current) return null;

    isSubmittingRef.current = true;
    answersRef.current = answers;
    try {
      const res = await apiRequest("POST", "/api/reports/gap-analysis/session", {
        clientId,
        reportType,
        questions,
        answers,
        seoHqLoadStatus,
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      clearDraft(reportType, clientId);
      return data.sessionId;
    } catch (err: any) {
      toast({
        title: "Failed to save gap analysis session",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    } finally {
      isSubmittingRef.current = false;
    }
  }, [reportType, questions, seoHqLoadStatus, toast]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const fetchAnswerUsage = useCallback(async (sid: number) => {
    try {
      const res = await apiRequest("GET", `/api/reports/gap-analysis/session/${sid}`);
      const data = await res.json();
      if (data.answerUsage) setAnswerUsage(data.answerUsage);
    } catch {}
  }, []);

  return {
    fillInGapsEnabled,
    setFillInGapsEnabled,
    isAnalyzing,
    showModal,
    questions,
    runGapAnalysis,
    submitAnswers,
    sessionId,
    seoHqLoadStatus,
    closeModal,
    answers: answersRef.current,
    draftAnswers,
    handleAnswersChange,
    answerUsage,
    fetchAnswerUsage,
  };
}
