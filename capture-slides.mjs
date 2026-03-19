import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const outDir = '/tmp/monthly-verify';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Load the pre-saved report JSON
const reportJson = JSON.parse(fs.readFileSync('/tmp/report199.json', 'utf8'));
const slides = reportJson.slides;
console.log('Loaded report — slides:', slides.length, '(client:', reportJson.client_name, ')');

// ── Step 1: Open browser and bootstrap auth in-browser
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Navigate to any app page first (so we have same-origin context)
await page.goto('http://localhost:5000/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 1000));

// In-browser: bootstrap + POST print-cache
const cacheId = await page.evaluate(async (reportJsonStr) => {
  const { token: authToken } = await fetch('/api/auth/bootstrap').then(r => r.json());
  const res = await fetch('/api/print-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': authToken },
    body: JSON.stringify({ report: JSON.parse(reportJsonStr), edits: {} })
  });
  const data = await res.json();
  return data.id;
}, JSON.stringify(reportJson));

console.log('Cache ID:', cacheId);
if (!cacheId) { console.error('Failed to create print cache'); await browser.close(); process.exit(1); }

// ── Step 2: Navigate to print page
const printUrl = `/monthly/print?token=${cacheId}`;
console.log('Navigating to:', printUrl);
await page.goto(`http://localhost:5000${printUrl}`, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for slides to render
console.log('Waiting for slides...');
let wrapperCount = 0;
for (let i = 0; i < 30; i++) {
  wrapperCount = await page.$$eval('.slide-wrapper', els => els.length).catch(() => 0);
  if (wrapperCount > 0) { console.log('Got', wrapperCount, 'slide wrappers after', ((i+1)*500), 'ms'); break; }
  await new Promise(r => setTimeout(r, 500));
}
if (wrapperCount === 0) {
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 400));
  console.log('No slides. Page text:\n', bodyText);
}
await new Promise(r => setTimeout(r, 2000)); // Let images load

const slideWrappers = await page.$$('.slide-wrapper');
console.log('Final wrapper count:', slideWrappers.length);

// ── Step 3: Screenshot each target slide
async function screenshotSlide(slideIndex, filename) {
  if (slideIndex < 0 || slideIndex >= slideWrappers.length) {
    console.log(`Skip: slide ${slideIndex} out of range (${slideWrappers.length} available)`);
    return;
  }
  // Use element.screenshot() — automatically clips to the element's bounding rect
  await slideWrappers[slideIndex].screenshot({ path: path.join(outDir, filename) });
  const box = await slideWrappers[slideIndex].boundingBox();
  const type = slides[slideIndex]?.type ?? '?';
  console.log(`Saved: ${filename} (index:${slideIndex} type:${type} ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)})`);
}

const titleIdx = slides.findIndex(s => s.type === 'title');
const kpiIdx   = slides.findIndex(s => s.type === 'metrics');
const tableIdx = slides.findIndex(s => s.type === 'table');
const chartIdx = slides.findIndex(s => s.type === 'chart-bar');
const lastIdx  = slides.length - 1;
console.log(`Indices — title:${titleIdx} kpi:${kpiIdx} table:${tableIdx} chart:${chartIdx} last:${lastIdx}`);

await screenshotSlide(titleIdx >= 0 ? titleIdx : 0, '01-title-slide.png');
await screenshotSlide(kpiIdx   >= 0 ? kpiIdx   : 1, '02-kpi-slide.png');
await screenshotSlide(tableIdx >= 0 ? tableIdx : 2, '03-table-slide.png');
await screenshotSlide(chartIdx >= 0 ? chartIdx : 7, '04-chart-slide.png');
await screenshotSlide(lastIdx,                        '05-last-slide.png');

// ── Step 4: DOM verification
const checks = await page.evaluate(() => {
  const r = {};
  r.hasBlueE8F0FE  = document.body.innerHTML.includes('E8F0FE');
  r.hasSvgSwoosh   = /path d="M0/.test(document.body.innerHTML);
  r.hasExportBanner= document.body.innerText.includes('Ready to export');
  r.hasAddRow      = document.body.innerText.includes('+ Add row');
  r.totalSlides    = document.querySelectorAll('.slide-wrapper').length;
  const firstSlide = document.querySelector('.slide-wrapper');
  const img        = firstSlide?.querySelector('img');
  r.firstSlideImg  = img ? img.src.substring(0, 90) : 'NONE';
  const th = document.querySelector('table th');
  if (th) {
    const s = window.getComputedStyle(th);
    r.thColor = s.color; r.thBg = s.backgroundColor; r.thFontWeight = s.fontWeight;
  } else { r.thColor = 'no th found'; }
  r.totalImgs = document.querySelectorAll('.slide-wrapper img').length;
  return r;
});

const tSlide = slideWrappers[tableIdx >= 0 ? tableIdx : 2];
const tableCheck = tSlide ? await tSlide.evaluate(el => {
  const th = el.querySelector('table th');
  if (!th) return 'no th in slide';
  const s = window.getComputedStyle(th);
  return { text: th.textContent, color: s.color, bg: s.backgroundColor, fontWeight: s.fontWeight };
}) : 'slide not found';

console.log('\n=== DOM CHECKS ===');
console.log(JSON.stringify(checks, null, 2));
console.log('\nTable header check:', JSON.stringify(tableCheck));

// ── Verdict
console.log('\n=== VERDICT ===');
const pass = !checks.hasBlueE8F0FE && !checks.hasSvgSwoosh &&
             !checks.hasExportBanner && !checks.hasAddRow &&
             checks.firstSlideImg !== 'NONE';
console.log(pass ? '✅ READY' : '❌ NOT READY');
if (checks.hasBlueE8F0FE)              console.log('  FAIL: #E8F0FE blue still present');
if (checks.hasSvgSwoosh)               console.log('  FAIL: SVG swoosh path still present');
if (checks.hasExportBanner)            console.log('  FAIL: "Ready to export" banner visible');
if (checks.hasAddRow)                  console.log('  FAIL: "+ Add row" button visible');
if (checks.firstSlideImg === 'NONE')   console.log('  FAIL: No header image in first slide');

console.log('\nFiles saved:', fs.readdirSync(outDir));
await browser.close();
