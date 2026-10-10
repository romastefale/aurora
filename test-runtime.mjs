import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'index.html');

function report(msg) {
  console.log(msg);
}

async function main() {
  report('INICIO DO TESTE DE RUNTIME');
  report('Este teste carrega o index.html em um navegador e inspeciona o estado em tempo de execucao.');
  report('Nao confia em correspondencia de texto no arquivo fonte para decidir sucesso.');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    report('FALHA: nao foi possivel iniciar o chromium. ' + e.message);
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  page.on('pageerror', err => logs.push('PAGEERROR: ' + err.message));

  const fileUrl = 'file://' + htmlPath;
  report('Carregando: ' + fileUrl);

  try {
    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    report('FALHA ao carregar a pagina: ' + e.message);
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return { error: 'Nenhum elemento canvas encontrado no DOM' };
    }

    const style = getComputedStyle(canvas);
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    let sample = null;
    let variation = false;
    let alphaMin = 255;
    let alphaMax = 0;
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      try {
        const data = ctx.getImageData(0, 0, Math.min(canvas.width, 32), Math.min(canvas.height, 32));
        sample = [data.data[0], data.data[1], data.data[2], data.data[3]];
        for (let i = 0; i < data.data.length; i += 4) {
          if (data.data[i] !== sample[0] || data.data[i+1] !== sample[1] || data.data[i+2] !== sample[2]) {
            variation = true;
          }
          alphaMin = Math.min(alphaMin, data.data[i+3]);
          alphaMax = Math.max(alphaMax, data.data[i+3]);
        }
      } catch (e) {
        sample = 'erro ao ler pixels: ' + e.message;
      }
    }

    return {
      canvasExists: true,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      styleWidth: style.width,
      styleHeight: style.height,
      position: style.position,
      displayWidth: rect.width,
      displayHeight: rect.height,
      displayTop: rect.top,
      displayLeft: rect.left,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      visualViewport: window.visualViewport ? {
        width: window.visualViewport.width,
        height: window.visualViewport.height,
        offsetTop: window.visualViewport.offsetTop,
        offsetLeft: window.visualViewport.offsetLeft
      } : null,
      documentElementClientWidth: document.documentElement.clientWidth,
      documentElementClientHeight: document.documentElement.clientHeight,
      bodyClientWidth: document.body.clientWidth,
      bodyClientHeight: document.body.clientHeight,
      hasScroll: document.documentElement.scrollHeight > window.innerHeight + 2 ||
                 document.documentElement.scrollWidth > window.innerWidth + 2,
      metaViewport: document.querySelector('meta[name="viewport"]')?.content || null,
      pixelSample: sample,
      pixelVariationInSample: variation,
      alphaRange: { min: alphaMin, max: alphaMax },
      prefersColorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    };
  });

  report('--- RESULTADO DA INSPECAO EM TEMPO DE EXECUCAO ---');
  report(JSON.stringify(result, null, 2));

  if (logs.length) {
    report('--- LOGS DO CONSOLE DA PAGINA ---');
    logs.forEach(l => report(l));
  }

  let failed = false;
  const reasons = [];

  if (result.error) {
    failed = true;
    reasons.push(result.error);
  } else {
    if (!result.canvasExists) {
      failed = true;
      reasons.push('canvas ausente');
    }
    if (result.bufferWidth < 100 || result.bufferHeight < 100) {
      failed = true;
      reasons.push('buffer interno muito pequeno: ' + result.bufferWidth + 'x' + result.bufferHeight);
    }
    if (Math.abs(result.displayWidth - result.windowInnerWidth) > 10 ||
        Math.abs(result.displayHeight - result.windowInnerHeight) > 10) {
      failed = true;
      reasons.push('canvas nao preenche a janela do ambiente: display ' +
        result.displayWidth + 'x' + result.displayHeight +
        ' vs inner ' + result.windowInnerWidth + 'x' + result.windowInnerHeight);
    }
    if (!result.pixelVariationInSample) {
      failed = true;
      reasons.push('amostra de pixels sem variacao de cor');
    }
    if (result.hasScroll) {
      failed = true;
      reasons.push('pagina apresenta rolagem');
    }
  }

  report('--- CONCLUSAO ---');
  if (failed) {
    report('FALHA');
    reasons.forEach(r => report(' - ' + r));
    report('Este resultado NAO se baseia em busca de palavras no fonte.');
    await browser.close();
    process.exit(1);
  } else {
    report('PASSOU');
    report('Este resultado NAO se baseia em busca de palavras no fonte.');
    report('O teste inspecionou o DOM e o contexto 2d em tempo de execucao.');
    await browser.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('ERRO NAO TRATADO: ' + err.message);
  process.exit(1);
});
