import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const vite = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const { largePrintTemplates } = await vite.ssrLoadModule('/src/domain/templates.ts');
  const { renderSheetSVG } = await vite.ssrLoadModule('/src/domain/sheet-renderer.ts');
  await mkdir('public/forms', { recursive: true });
  const page = await browser.newPage();
  for (const template of largePrintTemplates) {
    const svg = renderSheetSVG(template), stem = `public/forms/${template.code}-v${template.version}`;
    await writeFile(`${stem}.svg`, svg);
    await writeFile(`${stem}.json`, JSON.stringify(template, null, 2));
    // The SVG already contains exact 25 mm margins. Do not shrink it with a second PDF margin.
    await page.setContent(`<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}svg{display:block;width:210mm;height:297mm}</style>${svg}`);
    await page.pdf({ path: `${stem}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const png = await page.evaluate(async ({ svg, width, height }) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, width: template.width, height: template.height });
    await writeFile(`${stem}.png`, Buffer.from(png, 'base64'));
    for (const ext of ['svg', 'json', 'pdf', 'png']) await copyFile(`${stem}.${ext}`, `public/forms/${template.code}.${ext}`);
    console.log(`${template.code} v${template.version}: A4 PDF/SVG/PNG + OMR JSON; 25 mm margins, 1.5x anchors, 2x identifier bubbles.`);
  }
} finally { await browser.close(); await vite.close(); }
