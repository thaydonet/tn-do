import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const vite = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const { createMixedSheet, renderMixedSheetSVG } = await vite.ssrLoadModule('/src/domain/mixed-sheet.ts'), design = createMixedSheet(), svg = renderMixedSheetSVG(design);
  await mkdir('public/forms', { recursive: true }); await mkdir('artifacts', { recursive: true });
  await writeFile('public/forms/TNDO-3P-2026.json', JSON.stringify(design, null, 2));
  await writeFile('public/forms/TNDO-3P-2026.svg', svg);
  const page = await browser.newPage({ viewport: { width: design.width, height: design.height }, deviceScaleFactor: 1 });
  await page.setContent(`<style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm}</style>${svg}`);
  await page.pdf({ path: 'public/forms/TNDO-3P-2026.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  const png = await page.evaluate(async ({ source, width, height }) => { const img = new Image(); img.src = source; await img.decode(); const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png').split(',')[1]; }, { source: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: design.width, height: design.height });
  await writeFile('public/forms/TNDO-3P-2026.png', Buffer.from(png, 'base64'));
  console.log('TNDO-3P-2026 ready: 40 MCQ, 8 true/false questions with four items, 6 short answers. A4 PDF/SVG/PNG + geometry JSON.');
} finally { await browser.close(); await vite.close(); }
