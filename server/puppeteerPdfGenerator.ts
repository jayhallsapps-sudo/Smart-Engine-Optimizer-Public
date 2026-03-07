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

    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });

    const printUrl = `http://localhost:5000/biweekly/pdf-render?token=${token}`;

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await page.waitForSelector(".pdf-page", { timeout: 15000 });

    await page.emulateMediaType("print");

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

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
