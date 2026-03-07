import puppeteer from "puppeteer";
import { execSync } from "child_process";

function findChromium(): string | undefined {
  try {
    const p = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null", { timeout: 3000 }).toString().trim();
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

    // Letter paper at 96 CSS dpi = 816px wide.
    // Setting viewport to exactly this prevents Puppeteer from scaling/stretching content.
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

    const url = `http://localhost:5000/biweekly/pdf-render?token=${token}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

    await page.waitForFunction(
      () => document.title === "pdf-ready",
      { timeout: 15000 }
    );

    // Let images and fonts settle
    await new Promise(r => setTimeout(r, 600));

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
