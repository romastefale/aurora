import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, 'index.html');

function report(msg) {
  console.log(msg);
}

async function decode(browser, png) {
  const page = await browser.newPage();
  const stats = await page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { width: c.width, height: c.height, distinctColors: colors.size };
  }, 'data:image/png;base64,' + png.toString('base64'));
  await page.close();
  return stats;
}

async function main() {
  report('INICIO DO TESTE ANTITESE');
  report('O teste do repositorio aprova um canvas confinado a window.innerWidth x window.innerHeight e reprova rolagem.');
  report('Este teste reprova qualquer superficie confinada a janela e exige que a propria pagina seja o fundo.');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const logs = [];
  page.on('pageerror', err => logs.push('PAGEERROR: ' + err.message));

  const fileUrl = 'file://' + htmlPath;
  report('Carregando: ' + fileUrl);
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const probe = unit => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;visibility:hidden;width:0;height:100${unit}`;
      document.documentElement.appendChild(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      return h;
    };

    const innerW = window.innerWidth;
    const innerH = window.innerHeight;
    const confined = [];
    const rendered = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.tagName === 'SCRIPT') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height === 0) continue;
      rendered.push(el.tagName.toLowerCase());
      if (Math.abs(r.width - innerW) <= 10 && Math.abs(r.height - innerH) <= 10) {
        confined.push(`${el.tagName.toLowerCase()} ${r.width}x${r.height} position:${getComputedStyle(el).position}`);
      }
    }

    const meta = document.querySelector('meta[name="viewport"]')?.content || '';
    const keys = Object.fromEntries(meta.split(',').map(p => p.split('=').map(s => s.trim().toLowerCase())));
    const rootStyle = getComputedStyle(document.documentElement);
    const rootRect = document.documentElement.getBoundingClientRect();

    return {
      innerW,
      innerH,
      svh: probe('svh'),
      lvh: probe('lvh'),
      rootHeight: rootRect.height,
      rootWidth: rootRect.width,
      rootBackgroundImage: rootStyle.backgroundImage,
      viewportFit: keys['viewport-fit'] || null,
      renderedElements: rendered,
      confinedToWindow: confined
    };
  });

  const imageA = await page.screenshot();
  const firstBackground = result.rootBackgroundImage;
  await page.waitForTimeout(1500);
  const imageB = await page.screenshot();
  const secondBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundImage);
  const decoded = await decode(browser, imageA);

  report('--- RESULTADO ---');
  report(JSON.stringify({
    ...result,
    rootBackgroundImage: result.rootBackgroundImage.slice(0, 120) + (result.rootBackgroundImage.length > 120 ? '…' : ''),
    rootBackgroundChanged: firstBackground !== secondBackground,
    screenshotChanged: !imageA.equals(imageB),
    screenshot: decoded
  }, null, 2));
  logs.forEach(l => report(l));

  const reasons = [];
  if (result.confinedToWindow.length) reasons.push('superficie confinada a janela: ' + result.confinedToWindow.join('; '));
  if (result.renderedElements.length) reasons.push('a pagina tem elementos desenhados por cima de si mesma: ' + result.renderedElements.join(', '));
  if (result.viewportFit !== 'cover') reasons.push('viewport-fit=cover ausente na meta viewport (valor: ' + result.viewportFit + ')');
  if (result.rootBackgroundImage === 'none') reasons.push('o fundo do elemento raiz esta vazio');
  if (result.rootHeight + 1 < result.lvh) reasons.push(`elemento raiz (${result.rootHeight}px) menor que o viewport grande (${result.lvh}px)`);
  if (firstBackground === secondBackground) reasons.push('o fundo da raiz nao muda com o tempo');
  if (imageA.equals(imageB)) reasons.push('a tela renderizada nao muda com o tempo');
  if (decoded.distinctColors < 16) reasons.push('a tela renderizada tem pouca variacao de cor: ' + decoded.distinctColors);
  if (logs.length) reasons.push('erros na pagina');

  report('--- LIMITE DESTE AMBIENTE ---');
  if (Math.abs(result.lvh - result.svh) < 1) {
    report(`svh = lvh = ${result.lvh}px: este navegador nao tem barras dinamicas, entao a area alem da parte visivel nao existe aqui e nao pode ser observada.`);
  } else {
    report(`svh = ${result.svh}px, lvh = ${result.lvh}px.`);
  }

  report('--- CONCLUSAO ---');
  await browser.close();
  if (reasons.length) {
    report('FALHA');
    reasons.forEach(r => report(' - ' + r));
    process.exit(1);
  }
  report('PASSOU');
  process.exit(0);
}

main().catch(err => {
  console.error('ERRO NAO TRATADO: ' + err.message);
  process.exit(1);
});
