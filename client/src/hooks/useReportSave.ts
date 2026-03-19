import { useState, useRef, useCallback, type MutableRefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export interface SaveMeta {
  reportName?: string;
  reportPeriodLabel?: string;
  analysisWindowStart?: string;
  analysisWindowEnd?: string;
  planningQuarter?: number | null;
  planningYear?: number;
  currentCrawlAssetId?: number | null;
  comparisonCrawlAssetId?: number | null;
  versionLabel?: string;
}

export interface UseReportSaveOptions {
  reportType: string;
  clientId: number | null | undefined;
  initialSavedId?: number | null;
  debounceMs?: number;
  onCreated?: (id: number) => void;
}

export interface UseReportSaveReturn {
  savedReportId: number | null;
  setSavedReportId: (id: number | null) => void;
  saveStatus: SaveStatus;
  save: (reportData: any, edits: Record<string, string>, meta?: SaveMeta) => void;
  markDirty: () => void;
  pendingPayloadRef: MutableRefObject<{
    reportData: any;
    edits: Record<string, string>;
    meta: SaveMeta;
  } | null>;
}

export function useReportSave({
  reportType,
  clientId,
  initialSavedId = null,
  debounceMs = 2000,
  onCreated,
}: UseReportSaveOptions): UseReportSaveReturn {
  const [savedReportId, setSavedReportId] = useState<number | null>(initialSavedId ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedReportIdRef = useRef<number | null>(initialSavedId ?? null);
  const pendingPayloadRef = useRef<{
    reportData: any;
    edits: Record<string, string>;
    meta: SaveMeta;
  } | null>(null);

  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const updateSavedReportIdRef = useCallback((id: number | null) => {
    savedReportIdRef.current = id;
    setSavedReportId(id);
  }, []);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/saved-reports", payload);
      return res.json();
    },
    onSuccess: (data, variables) => {
      updateSavedReportIdRef(data.id);
      setSaveStatus("saved");
      onCreatedRef.current?.(data.id);
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && key.includes("/api/saved-reports") && key.includes(`clientId=${variables.clientId}`);
        },
      });
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/saved-reports/${id}`, payload);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && key.includes("/api/saved-reports") && key.includes(`clientId=${clientId}`);
        },
      });
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  const executeSave = useCallback(
    (reportData: any, edits: Record<string, string>, meta: SaveMeta) => {
      if (!clientId) return;
      setSaveStatus("saving");

      const generatedOn = new Date().toISOString().split("T")[0];
      const reportName =
        meta.reportName ??
        `${reportType} — ${meta.reportPeriodLabel ?? generatedOn}`;

      const currentId = savedReportIdRef.current;
      const sourceSnapshot = {
        clientId,
        reportType,
        reportPeriodLabel: meta.reportPeriodLabel ?? null,
        analysisWindowStart: meta.analysisWindowStart ?? null,
        analysisWindowEnd: meta.analysisWindowEnd ?? null,
        planningQuarter: meta.planningQuarter ?? null,
        planningYear: meta.planningYear ?? null,
        currentCrawlAssetId: meta.currentCrawlAssetId ?? null,
        comparisonCrawlAssetId: meta.comparisonCrawlAssetId ?? null,
        versionLabel: meta.versionLabel ?? null,
        capturedAt: new Date().toISOString(),
      };

      if (currentId != null) {
        updateMutation.mutate({
          id: currentId,
          payload: {
            generatedReportJson: reportData,
            editsJson: edits,
            reportName,
            reportPeriodLabel: meta.reportPeriodLabel,
            currentCrawlAssetId: meta.currentCrawlAssetId,
            comparisonCrawlAssetId: meta.comparisonCrawlAssetId,
            versionLabel: meta.versionLabel,
            sourceSnapshotJson: sourceSnapshot,
          },
        });
      } else {
        createMutation.mutate({
          clientId,
          reportType,
          reportName,
          reportPeriodLabel: meta.reportPeriodLabel ?? null,
          analysisWindowStart: meta.analysisWindowStart ?? null,
          analysisWindowEnd: meta.analysisWindowEnd ?? null,
          planningQuarter: meta.planningQuarter ?? null,
          planningYear: meta.planningYear ?? null,
          generatedOn,
          generatedReportJson: reportData,
          editsJson: edits,
          currentCrawlAssetId: meta.currentCrawlAssetId ?? null,
          comparisonCrawlAssetId: meta.comparisonCrawlAssetId ?? null,
          versionLabel: meta.versionLabel ?? null,
          sourceSnapshotJson: sourceSnapshot,
        });
      }
    },
    [clientId, reportType, createMutation, updateMutation]
  );

  const save = useCallback(
    (reportData: any, edits: Record<string, string>, meta: SaveMeta = {}) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      executeSave(reportData, edits, meta);
    },
    [executeSave]
  );

  const markDirty = useCallback(() => {
    setSaveStatus("unsaved");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const pending = pendingPayloadRef.current;
      if (pending) {
        executeSave(pending.reportData, pending.edits, pending.meta);
      } else {
        setSaveStatus("saved");
      }
    }, debounceMs);
  }, [executeSave, debounceMs]);

  return {
    savedReportId,
    setSavedReportId: updateSavedReportIdRef,
    saveStatus,
    save,
    markDirty,
    pendingPayloadRef,
  };
}
