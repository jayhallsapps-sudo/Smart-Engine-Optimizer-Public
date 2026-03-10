import { useState, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { GapQuestion, GapAnswer, AmInputs } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface UseFillInTheGapsProps {
  reportType: string;
}

export function useFillInTheGaps({ reportType }: UseFillInTheGapsProps) {
  const { toast } = useToast();
  const [fillInGapsEnabled, setFillInGapsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [questions, setQuestions] = useState<GapQuestion[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [seoHqLoadStatus, setSeoHqLoadStatus] = useState<any>(null);

  // Guard refs for idempotency
  const isRunningRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);

  // We store answers in a ref to persist within the page lifecycle even if modal closes/reopens
  const answersRef = useRef<GapAnswer[]>([]);

  const runGapAnalysis = useCallback(async (
    clientId: number,
    amInputs: AmInputs,
    reportContext?: any
  ) => {
    if (isRunningRef.current) return { hasQuestions: false };
    isRunningRef.current = true;
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
  };
}
