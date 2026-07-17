import { readFile, rename, writeFile } from 'node:fs/promises';

const DEFAULT_MANIFEST_PATH = 'C:/Users/User/Downloads/gp-tyres-&-mags-inventory-tracker (1)/reports/wheel-catalog-chrome-ocr-manifest.json';
const DEFAULT_RAW_PATH = 'C:/Users/User/Downloads/gp-tyres-&-mags-inventory-tracker (1)/reports/wheel-catalog-chrome-ocr-raw.json';
const CATALOG_FOLDER_URL = 'https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx';

const inspectLensPage = async (tab) => tab.playwright.evaluate(() => {
  const captcha = Boolean(document.querySelector('iframe[src*="recaptcha"], [id*="captcha"], [class*="captcha"]'));
  const exact = Array.from(document.querySelectorAll('[role="button"].IwqbBf'))
    .map((element) => (element.getAttribute('aria-label') || '').trim())
    .filter(Boolean);
  if (exact.length) return { captcha, tokens: exact };

  const labels = Array.from(document.querySelectorAll('[role="button"]'))
    .map((element) => (element.getAttribute('aria-label') || '').trim());
  const start = labels.findIndex((label) => label === 'Search by image');
  if (start < 0) return { captcha, tokens: [] };

  const stops = new Set(['Close Choose', 'Google apps', 'Word pronunciation', 'See more', 'About this result']);
  const tokens = [];
  for (let index = start + 1; index < labels.length; index += 1) {
    const label = labels[index];
    if (stops.has(label)) break;
    if (label) tokens.push(label);
  }
  return { captcha, tokens };
});

const saveCheckpoint = async ({ existing, manifest, rawPath, ocrProvider }) => {
  const items = manifest.items
    .filter((item) => existing.has(item.driveFileId))
    .map((item) => existing.get(item.driveFileId));
  const payload = {
    catalogSource: 'Google Drive Wheel Catalog',
    folderUrl: CATALOG_FOLDER_URL,
    ocrProvider,
    updatedAt: new Date().toISOString(),
    items
  };
  await writeFile(`${rawPath}.tmp`, JSON.stringify(payload, null, 2));
  await rename(`${rawPath}.tmp`, rawPath);
};

export const setupWheelCatalogOcrSession = async ({
  browser,
  manifestPath = DEFAULT_MANIFEST_PATH,
  rawPath = DEFAULT_RAW_PATH,
  concurrency = 4,
  ocrProvider = 'Google Lens via Chrome'
}) => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const tabs = [];
  for (let index = 0; index < concurrency; index += 1) tabs.push(await browser.tabs.new());

  const runBatch = async (maxItems = 12) => {
    const checkpoint = JSON.parse(await readFile(rawPath, 'utf8'));
    const existing = new Map(checkpoint.items.map((item) => [item.driveFileId, item]));
    const missing = manifest.items.filter((item) => !existing.has(item.driveFileId));
    const retries = manifest.items.filter((item) => {
      const status = existing.get(item.driveFileId)?.status;
      return status === 'failed' || status === 'captcha';
    });
    const pending = missing.concat(retries).slice(0, maxItems);
    let captchaDetected = false;

    for (let groupStart = 0; groupStart < pending.length; groupStart += tabs.length) {
      const group = pending.slice(groupStart, groupStart + tabs.length);
      const results = await Promise.all(group.map(async (item, itemIndex) => {
        const tab = tabs[itemIndex];
        try {
          await tab.goto(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.imageUrl)}`);
          await tab.playwright.waitForTimeout(5500);
          let inspection = await inspectLensPage(tab);
          if (inspection.captcha) {
            captchaDetected = true;
            return { ...item, ocrTokens: [], visibleText: '', status: 'captcha', error: 'Google CAPTCHA requires user confirmation' };
          }
          if (!inspection.tokens.length) {
            await tab.playwright.waitForTimeout(2500);
            inspection = await inspectLensPage(tab);
          }
          return {
            ...item,
            ocrTokens: inspection.tokens,
            visibleText: inspection.tokens.join(' '),
            status: inspection.tokens.length ? 'completed' : 'needs_review',
            error: inspection.tokens.length ? '' : 'No printed text detected by Google Lens OCR'
          };
        } catch (error) {
          return {
            ...item,
            ocrTokens: [],
            visibleText: '',
            status: 'failed',
            attempts: Number(existing.get(item.driveFileId)?.attempts || 0) + 1,
            error: String(error?.message || error)
          };
        }
      }));

      results.forEach((result) => existing.set(result.driveFileId, result));
      await saveCheckpoint({ existing, manifest, rawPath, ocrProvider });
      if (captchaDetected) break;
    }

    const finalCheckpoint = JSON.parse(await readFile(rawPath, 'utf8'));
    const statusCounts = finalCheckpoint.items.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
    const terminalIds = new Set(finalCheckpoint.items
      .filter((item) => item.status !== 'failed' && item.status !== 'captcha')
      .map((item) => item.driveFileId));
    return {
      processed: finalCheckpoint.items.length,
      total: manifest.items.length,
      remaining: manifest.items.filter((item) => !terminalIds.has(item.driveFileId)).length,
      statusCounts,
      captchaDetected
    };
  };

  return { runBatch, tabs };
};
