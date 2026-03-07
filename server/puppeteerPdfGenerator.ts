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

    // Match the exact preview viewport width (794px container + some room)
    await page.setViewport({ width: 900, height: 1056, deviceScaleFactor: 1 });

    const printUrl = `http://localhost:5000/biweekly/pdf-render?token=${token}`;

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await page.waitForSelector("[data-report-root]", { timeout: 15000 });

    await page.emulateMediaType("screen");

    // Wait for fonts and images — same as what the browser renders on screen
    await page.evaluate(async () => {
      await document.fonts.ready;

      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>(resolve => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        })
      );
    });

    await new Promise(r => setTimeout(r, 300));

    // Measure the actual rendered content height — capture the whole thing as-is
    const contentHeight = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='docx-preview-page']");
      if (el) {
        const rect = el.getBoundingClientRect();
        return Math.ceil(rect.bottom + 32); // add bottom padding
      }
      return document.documentElement.scrollHeight;
    });

    // Use the exact same dimensions the preview uses: 794px wide, full content height
    const pdf = await page.pdf({
      width: "794px",
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
