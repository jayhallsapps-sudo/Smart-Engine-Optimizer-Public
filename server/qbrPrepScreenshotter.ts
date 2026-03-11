import puppeteer, { Browser } from "puppeteer";
import { execSync } from "child_process";
import * as fs from "fs";

let _browser: Browser | null = null;

function findChromiumPath(): string {
  // 1. Try `which chromium` — works in Replit Nix environment
  try {
    const p = execSync("which chromium", { timeout: 3000 }).toString().trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}

  // 2. Try puppeteer's bundled Chrome
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {}

  // 3. Common system paths
  for (const p of [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ]) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    "Could not locate Chrome/Chromium. " +
    "Run `which chromium` or `npx puppeteer browsers install chrome` in the project environment."
  );
}

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;

  const executablePath = findChromiumPath();

  _browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--font-render-hinting=none",
    ],
  });
  return _browser;
}

export interface ScreenshotResult {
  data: Buffer;
  widthPx: number;
  heightPx: number;
}

const VIEWPORT_WIDTH = 794;

export async function screenshotHtml(html: string): Promise<ScreenshotResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: VIEWPORT_WIDTH, height: 900, deviceScaleFactor: 1.5 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const body = await page.$("div.page");
    if (!body) throw new Error("No .page element found in HTML template");

    const clip = await body.boundingBox();
    if (!clip) throw new Error("Could not compute bounding box of .page element");

    const buf = await page.screenshot({
      clip: {
        x:      clip.x,
        y:      clip.y,
        width:  clip.width,
        height: clip.height,
      },
      type: "png",
      omitBackground: false,
    });

    const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return {
      data,
      widthPx:  Math.round(clip.width),
      heightPx: Math.round(clip.height),
    };
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
