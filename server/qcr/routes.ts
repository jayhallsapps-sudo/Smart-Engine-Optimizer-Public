import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { createJob, getJob, subscribeToJob, appendEvent, markJobFailed } from "./jobStore";
import { runQcrScan } from "./jobRunner";
import { pushFindingToAsana } from "./asanaRouter";
import { getSavedReportById, updateSavedReport } from "../savedReportService";
import { renderReportToMarkdown, makeFilename } from "./markdownExporter";
import { requireAuth, requireAdminRole } from "../auth";

export function registerQcrRoutes(app: Express): void {
  // POST /api/qcr/scan/start
  app.post("/api/qcr/scan/start", requireAuth, async (req, res) => {
    const { clientId } = req.body;
    if (!clientId || !Number.isFinite(Number(clientId))) {
      return res.status(400).json({ message: "clientId is required" });
    }
    const client = await storage.getClient(Number(clientId));
    if (!client) return res.status(404).json({ message: "Client not found" });
    if (!client.website) return res.status(400).json({ message: "Client has no website configured" });

    const job = createJob(Number(clientId));
    appendEvent(job.jobId, {
      type: "started",
      jobId: job.jobId,
      clientId: Number(clientId),
      clientName: client.name,
    });

    // Run async; do not await
    runQcrScan(job.jobId, Number(clientId)).catch((err) => {
      console.error("[QCR] Background scan error:", err);
      markJobFailed(job.jobId, err?.message ?? String(err));
    });

    res.json({ jobId: job.jobId });
  });

  // GET /api/qcr/scan/:jobId/progress
  app.get("/api/qcr/scan/:jobId/progress", requireAuth, async (req, res) => {
    const jobId = req.params.jobId as string;
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const unsubscribe = subscribeToJob(jobId, (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "completed" || event.type === "error") {
          res.end();
        }
      } catch {
        // client disconnected
      }
    });

    req.on("close", () => {
      unsubscribe();
      try {
        res.end();
      } catch {
        // already ended
      }
    });
  });

  // GET /api/qcr/scan/:jobId/result
  app.get("/api/qcr/scan/:jobId/result", requireAuth, async (req, res) => {
    const job = getJob(req.params.jobId as string);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status === "running" || job.status === "queued") return res.status(202).json({ status: "running" });
    if (job.status === "failed") return res.status(500).json({ status: "failed", error: job.error });
    return res.json({ status: "completed", report: job.result, savedReportId: job.savedReportId });
  });

  // POST /api/qcr/findings/:findingId/push-asana
  app.post("/api/qcr/findings/:findingId/push-asana", requireAuth, async (req, res) => {
    const { clientId, savedReportId, overrides } = req.body;
    if (!clientId || !savedReportId) {
      return res.status(400).json({ message: "clientId and savedReportId are required" });
    }

    const report = await getSavedReportById(Number(savedReportId));
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.clientId !== Number(clientId)) {
      return res.status(403).json({ message: "Report does not belong to this client" });
    }

    const findingId = req.params.findingId;
    const allFindings = Object.values((report.generatedReportJson as any)?.categories ?? {}).flatMap(
      (cat: any) => cat.findings ?? [],
    );
    const finding = allFindings.find((f: any) => f.id === findingId);
    if (!finding) return res.status(404).json({ message: "Finding not found" });

    if (finding.asanaTaskId) {
      return res.status(409).json({
        message: "Already pushed",
        existing: { taskId: finding.asanaTaskId, taskUrl: finding.asanaTaskUrl },
      });
    }

    const client = await storage.getClient(Number(clientId));
    if (!client?.asanaProjectId) {
      return res.status(400).json({ message: "Client has no Asana project configured" });
    }

    const qcrConfig = await storage.getClientQcrConfig(Number(clientId));
    const sectionIds = (qcrConfig?.asanaSectionIds ?? {}) as Record<string, string>;
    const sectionKey = finding.category === "technical_seo" ? "technical_seo" : "seo_strategy";
    const sectionGid = sectionIds[sectionKey];
    if (!sectionGid) {
      return res.status(400).json({
        message: `No Asana section ID configured for category ${sectionKey} on this client. Set it in Client Integrations.`,
      });
    }

    try {
      const result = await pushFindingToAsana({
        clientId: Number(clientId),
        finding,
        overrides,
        projectGid: client.asanaProjectId,
        sectionGid,
      });

      // Mutate and persist
      finding.asanaTaskId = result.taskGid;
      finding.asanaTaskUrl = result.taskUrl;
      finding.pushedAt = new Date().toISOString();
      await updateSavedReport(Number(savedReportId), { generatedReportJson: report.generatedReportJson });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Asana push failed" });
    }
  });

  // GET /api/qcr/config/:clientId
  app.get("/api/qcr/config/:clientId", requireAuth, async (req, res) => {
    const config = await storage.getClientQcrConfig(Number(req.params.clientId));
    res.json(config ?? { asanaSectionIds: {}, urlPatternOverrides: {}, lastScanAt: null });
  });

  // PUT /api/qcr/config/:clientId
  app.put("/api/qcr/config/:clientId", requireAuth, requireAdminRole, async (req, res) => {
    const clientId = Number(req.params.clientId);
    const { asanaSectionIds, urlPatternOverrides } = req.body;
    const config = await storage.upsertClientQcrConfig({
      clientId,
      asanaSectionIds: asanaSectionIds ?? {},
      urlPatternOverrides: urlPatternOverrides ?? {},
    });
    res.json(config);
  });

  // GET /api/qcr/reports/:savedReportId/markdown
  app.get("/api/qcr/reports/:savedReportId/markdown", requireAuth, async (req, res) => {
    const report = await getSavedReportById(Number(req.params.savedReportId));
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.reportType !== "quarterly_content_roadmap") {
      return res.status(400).json({ message: "Report is not a QCR report" });
    }
    const json = report.generatedReportJson as import("./types").QcrReport | undefined;
    if (!json) return res.status(404).json({ message: "Report has no data" });

    const md = renderReportToMarkdown(json);
    const filename = makeFilename(json.clientName, json.scanCompletedAt.split("T")[0]);
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(md);
  });
}
