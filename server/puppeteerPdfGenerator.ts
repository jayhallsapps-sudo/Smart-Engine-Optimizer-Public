import puppeteer from "puppeteer";
import { execSync } from "child_process";

function findChromium(): string | undefined {
  try {
    const p = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      { timeout: 3000 }
    ).toString().trim();
    if (p) return p;
  } catch {}
  return undefined;
}

export async function generatePdfViaPuppeteer(token: string, renderPath?: string, cookies?: Array<{ name: string; value: string }>): Promise<Buffer> {
  const route = renderPath || "biweekly/pdf-render";
  const printUrl = `http://localhost:5000/${route}?token=${token}`;
  const startMs = Date.now();
  console.log(`[PDF] Starting PDF generation — route: ${route}, token: ${token}`);

  const executablePath = findChromium();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });

    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies.map(c => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
    }

    const gotoResult = await page.goto(printUrl, { waitUntil: "networkidle2", timeout: 45000 });
    if (!gotoResult?.ok()) {
      const status = gotoResult?.status() ?? 0;
      throw new Error(`Print page returned HTTP ${status}. Ensure the report data is valid and the server is running.`);
    }

    try {
      await page.waitForSelector("[data-report-root]", { timeout: 20000 });
    } catch {
      const pageText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      const preview = pageText.slice(0, 300).trim();
      throw new Error(
        `Report content did not render within 20 seconds. ` +
        `Page content: "${preview || "(empty)"}". ` +
        `Check that the report was generated before downloading PDF.`
      );
    }

    await page.emulateMediaType("screen");

    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        })
      );
    });

    await new Promise(r => setTimeout(r, 400));

    const contentHeight = await page.evaluate(() => {
      const el = document.querySelector("[data-report-root]");
      if (el) return Math.ceil((el as HTMLElement).getBoundingClientRect().bottom);
      return document.documentElement.scrollHeight;
    });

    const pdf = await page.pdf({
      width: "816px",
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const buf = Buffer.from(pdf);
    console.log(`[PDF] Done — ${buf.length} bytes in ${Date.now() - startMs}ms`);
    return buf;
  } finally {
    await browser.close();
  }
}
