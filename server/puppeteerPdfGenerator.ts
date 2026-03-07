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

export async function generatePdfViaPuppeteer(token: string): Promise<Buffer> {
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

    // 8.5in at 96dpi = 816px
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });

    const printUrl = `http://localhost:5000/biweekly/pdf-render?token=${token}`;

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await page.waitForSelector("[data-report-root]", { timeout: 15000 });

    await page.emulateMediaType("screen");

    // Wait for fonts and all images (including the header art)
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

    await new Promise(r => setTimeout(r, 300));

    // Measure the full rendered height of the report
    const contentHeight = await page.evaluate(() => {
      return document.documentElement.scrollHeight;
    });

    // Capture the entire report as a single page — exactly what is on screen
    const pdf = await page.pdf({
      width: "816px",
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
