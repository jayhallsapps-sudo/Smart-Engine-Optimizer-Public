import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Map, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQcrJob } from "@/hooks/useQcrJob";
import { ClientPicker } from "@/components/qcr/ClientPicker";
import { ScanProgress } from "@/components/qcr/ScanProgress";
import { FindingsView } from "@/components/qcr/FindingsView";
import { PastReportsList } from "@/components/qcr/PastReportsList";
import { AsanaPushDialog } from "@/components/qcr/AsanaPushDialog";
import type { Client } from "@shared/schema";

export default function QuarterlyContentRoadmapPage() {
  const { toast } = useToast();
  const [view, setView] = useState<"picker" | "scanning" | "findings" | "error">("picker");
  const [clientId, setClientId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("client") ?? "";
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  const [pushFinding, setPushFinding] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const selectedClient = clients.find((c) => String(c.id) === clientId);

  const { events, status: jobStatus, error: jobError } = useQcrJob(jobId);

  // Handle job completion / failure transitions
  useEffect(() => {
    if (jobStatus === "completed" && jobId) {
      fetch(`/api/qcr/scan/${jobId}/result`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "completed") {
            setReportData(data.report);
            setSavedReportId(data.savedReportId);
            setView("findings");
          }
        })
        .catch(() => {});
    }
    if (jobStatus === "failed" && jobError) {
      setErrorMessage(jobError);
      setView("error");
    }
  }, [jobStatus, jobId, jobError]);

  // Deep-link to past report
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("report");
    if (reportId && clientId) {
      fetch(`/api/saved-reports/${reportId}`)
        .then((r) => r.json())
        .then((saved) => {
          if (saved?.generatedReportJson) {
            setReportData(saved.generatedReportJson);
            setSavedReportId(saved.id);
            setView("findings");
          }
        })
        .catch(() => {});
    }
  }, [clientId]);

  const startScan = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await apiRequest("POST", "/api/qcr/scan/start", { clientId: Number(clientId) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Scan failed to start");
      setJobId(data.jobId);
      setView("scanning");
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    }
  }, [clientId, toast]);

  function handleLoadPastReport(savedId: number, reportJson: any) {
    setReportData(reportJson);
    setSavedReportId(savedId);
    setView("findings");
  }

  function handlePushed(findingId: string, taskGid: string, taskUrl: string) {
    if (!reportData) return;
    const updated = { ...reportData };
    for (const cat of Object.keys(updated.categories)) {
      const findings = updated.categories[cat]?.findings ?? [];
      const idx = findings.findIndex((f: any) => f.id === findingId);
      if (idx >= 0) {
        findings[idx].asanaTaskId = taskGid;
        findings[idx].asanaTaskUrl = taskUrl;
        findings[idx].pushedAt = new Date().toISOString();
        break;
      }
    }
    setReportData(updated);
  }

  return (
    <div className="flex h-full overflow-hidden bg-background" data-testid="page-quarterly-content-roadmap">
      {/* Left sidebar */}
      <div className="w-72 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
            {view !== "picker" && (
              <button onClick={() => setView("picker")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#C0392B] shrink-0">
              <Map className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#C0392B]">Quarterly Content Roadmap</h1>
              <p className="text-[10px] text-muted-foreground">Technical SEO scanning &amp; findings</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 flex-1">
          {view === "picker" && (
            <>
              <ClientPicker
                selectedClientId={clientId}
                onSelectClientId={setClientId}
                onRunScan={startScan}
                isScanning={false}
              />
              <Separator />
              <PastReportsList clientId={clientId} onSelectReport={handleLoadPastReport} />
            </>
          )}
          {view === "scanning" && (
            <div className="text-xs text-muted-foreground">
              Scanning {selectedClient?.name ?? "client"}...
              <p className="text-[10px] mt-1">Watch the main panel for progress.</p>
            </div>
          )}
          {view === "findings" && reportData && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{reportData.clientName}</p>
              <p className="text-[10px]">{new Date(reportData.scanCompletedAt).toLocaleDateString()}</p>
            </div>
          )}
          {view === "error" && (
            <div className="text-xs text-red-600">
              <p className="font-medium">Scan failed</p>
              <p className="text-[10px] mt-1">{errorMessage}</p>
              <Button variant="outline" className="w-full h-7 text-[10px] mt-2" onClick={() => setView("picker")}>
                Back to picker
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {view === "picker" && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C0392B]/10 mb-4">
              <Map className="w-7 h-7 text-[#C0392B]" />
            </div>
            <p className="font-semibold text-foreground text-sm">Quarterly Content Roadmap</p>
            <p className="text-xs mt-1 max-w-sm text-center">
              Select a client and click <strong>Run Scan</strong> to start a technical SEO audit of their website.
            </p>
          </div>
        )}

        {view === "scanning" && jobStatus !== "idle" && (
          <ScanProgress
            events={events}
            status={jobStatus}
            error={jobError}
            onBack={() => setView("picker")}
          />
        )}

        {view === "findings" && reportData && savedReportId && (
          <FindingsView
            report={reportData}
            clientId={Number(clientId)}
            savedReportId={savedReportId}
            onRunNewScan={() => {
              setReportData(null);
              setSavedReportId(null);
              setJobId(null);
              startScan();
            }}
            onPushAsana={(finding) => setPushFinding(finding)}
          />
        )}

        {view === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8">
            <p className="text-sm font-semibold text-red-600">Scan failed</p>
            <p className="text-xs text-muted-foreground max-w-sm">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => setView("picker")}>
              Back to picker
            </Button>
          </div>
        )}
      </div>

      <AsanaPushDialog
        open={!!pushFinding}
        onClose={() => setPushFinding(null)}
        finding={pushFinding}
        clientId={Number(clientId)}
        savedReportId={savedReportId ?? 0}
        onPushed={handlePushed}
      />
    </div>
  );
}
