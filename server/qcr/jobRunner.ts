import { crawlFullCorpus } from "./fullCorpusCrawler";
import { classifyUrl } from "./urlClassifier";
import { getApplicableRules } from "./pageTypeRules";
import { adjustSeverity, applyNoiseSuppression } from "./severityRules";
import { appendEvent, markJobCompleted, markJobFailed } from "./jobStore";
import { createSavedReport } from "../savedReportService";
import { storage } from "../storage";
import type { QcrReport, QcrCategory, QcrFinding, QcrProgressEvent } from "./types";

function emit(jobId: string, event: QcrProgressEvent) {
  appendEvent(jobId, event);
}

export async function runQcrScan(jobId: string, clientId: number): Promise<void> {
  const t0 = Date.now();
  const scanStartedAt = new Date().toISOString();

  try {
    // Step: load_config
    emit(jobId, { type: "step_start", step: "load_config", label: "Loading client config" });
    const client = await storage.getClient(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);
    if (!client.website) throw new Error(`Client ${client.name} has no website domain configured`);

    const qcrConfig = await storage.getClientQcrConfig(clientId);
    const overrides = (qcrConfig?.urlPatternOverrides as Record<string, string[]>) ?? {};
    emit(jobId, { type: "step_complete", step: "load_config", elapsedMs: Date.now() - t0 });

    // Build base URL
    let baseUrl = client.website.trim();
    if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;

    // Step: crawl
    const crawlT0 = Date.now();
    emit(jobId, { type: "step_start", step: "crawl", label: "Crawling website" });
    const crawlResult = await crawlFullCorpus({
      baseUrl,
      maxUrls: 1000,
      concurrency: 8,
      timeoutMs: 10000,
      onProgress: (current, total) => {
        emit(jobId, { type: "step_progress", step: "crawl", current, total });
      },
    });
    emit(jobId, {
      type: "step_complete",
      step: "crawl",
      elapsedMs: Date.now() - crawlT0,
      findingsCount: crawlResult.pages.length,
    });

    // Step: classify
    const classifyT0 = Date.now();
    emit(jobId, { type: "step_start", step: "classify", label: "Classifying URLs" });
    const allUrls = crawlResult.pages.map((p) => p.url);
    for (const page of crawlResult.pages) {
      page.pageType = classifyUrl(page.url, { overrides, allUrls });
    }
    emit(jobId, { type: "step_complete", step: "classify", elapsedMs: Date.now() - classifyT0 });

    // Build scan context
    const scanContext = {
      clientCanonicalNap: {
        name: client.name,
        phone: client.contactName ? client.contactName.replace(/\D/g, "") : "",
        phoneDisplay: client.contactName ?? "",
        address: "", // We don't have a canonical address field on clients; detectors handle gracefully
        email: client.contactEmail ?? undefined,
      },
      allPages: crawlResult.pages,
      urlStatusMap: crawlResult.urlStatusMap,
      redirectMap: crawlResult.redirectMap,
    };

    // Step: detect_universal
    const universalT0 = Date.now();
    emit(jobId, { type: "step_start", step: "detect_universal", label: "Running universal detectors" });
    const allFindings: QcrFinding[] = [];
    for (let i = 0; i < crawlResult.pages.length; i++) {
      const page = crawlResult.pages[i];
      const rules = getApplicableRules(page.pageType, "universal");
      for (const rule of rules) {
        const findings = rule.detector(page, scanContext);
        allFindings.push(...findings);
      }
      if (i % 20 === 0) {
        emit(jobId, { type: "step_progress", step: "detect_universal", current: i + 1, total: crawlResult.pages.length });
      }
    }
    emit(jobId, { type: "step_complete", step: "detect_universal", elapsedMs: Date.now() - universalT0, findingsCount: allFindings.length });

    // Step: detect_technical
    const technicalT0 = Date.now();
    emit(jobId, { type: "step_start", step: "detect_technical", label: "Running technical detectors" });
    for (let i = 0; i < crawlResult.pages.length; i++) {
      const page = crawlResult.pages[i];
      const rules = getApplicableRules(page.pageType, "technical");
      for (const rule of rules) {
        const findings = rule.detector(page, scanContext);
        allFindings.push(...findings);
      }
      if (i % 20 === 0) {
        emit(jobId, { type: "step_progress", step: "detect_technical", current: i + 1, total: crawlResult.pages.length });
      }
    }
    // Run cross-page detectors
    const technicalRules = getApplicableRules("general", "technical");
    for (const rule of technicalRules) {
      if (rule.crossPageDetector) {
        const findings = rule.crossPageDetector(crawlResult.pages, scanContext);
        allFindings.push(...findings);
      }
    }
    emit(jobId, { type: "step_complete", step: "detect_technical", elapsedMs: Date.now() - technicalT0, findingsCount: allFindings.length });

    // Step: severity_adjust
    const severityT0 = Date.now();
    emit(jobId, { type: "step_start", step: "severity_adjust", label: "Adjusting severity" });
    const ctx = { totalPagesScanned: crawlResult.pages.length };
    let adjusted = allFindings.map((f) => adjustSeverity(f, ctx));
    adjusted = applyNoiseSuppression(adjusted, ctx);
    emit(jobId, { type: "step_complete", step: "severity_adjust", elapsedMs: Date.now() - severityT0 });

    // Step: persist
    const persistT0 = Date.now();
    emit(jobId, { type: "step_start", step: "persist", label: "Saving report" });

    const categories: Record<QcrCategory, { findings: QcrFinding[] }> = {
      technical_seo: { findings: adjusted.filter((f) => f.category === "technical_seo") },
      seo_content: { findings: [] },
      local_seo: { findings: [] },
      seo_strategy: { findings: [] },
    };

    const totalFindings = adjusted.length;
    const byCategory: Record<QcrCategory, number> = {
      technical_seo: categories.technical_seo.findings.length,
      seo_content: 0,
      local_seo: 0,
      seo_strategy: 0,
    };

    const report: QcrReport = {
      reportType: "quarterly_content_roadmap",
      clientId,
      clientName: client.name,
      scanStartedAt,
      scanCompletedAt: new Date().toISOString(),
      scanDurationMs: Date.now() - t0,
      urlsScanned: crawlResult.pages.filter((p) => p.status === 200).length,
      urlsAttempted: crawlResult.pages.length,
      integrationsUsed: { gsc: false, ga4: false, ahrefs: false, gbp: false, airtable: false },
      categories,
    };

    const scanDate = scanStartedAt.split("T")[0];
    const saved = await createSavedReport({
      clientId,
      reportType: "quarterly_content_roadmap",
      reportName: `${client.name} \u2014 QCR \u2014 ${scanDate}`,
      generatedOn: scanDate,
      generatedReportJson: report,
      sourceSnapshotJson: { integrationsUsed: report.integrationsUsed },
    });

    emit(jobId, { type: "step_complete", step: "persist", elapsedMs: Date.now() - persistT0 });

    // Step: update_last_scan
    await storage.updateClientQcrConfigLastScanAt(clientId, new Date());

    markJobCompleted(jobId, report, saved.id);
    emit(jobId, {
      type: "completed",
      jobId,
      reportSummary: { totalFindings, byCategory },
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`[QCR Job ${jobId}] failed:`, message);
    markJobFailed(jobId, message);
    emit(jobId, { type: "error", message });
  }
}
