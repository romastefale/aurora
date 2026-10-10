import { spawnSync } from 'child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, 'index.html');

function report(msg) {
  console.log(msg);
}

function workflowTest() {
  const yml = readFileSync(join(__dirname, '.github/workflows/test.yml'), 'utf8').split('\n');
  const start = yml.findIndex(l => l.includes("cat > test.mjs << 'EOF'"));
  const end = yml.findIndex((l, i) => i > start && l.trim() === 'EOF');
  if (start < 0 || end < 0) throw new Error('bloco do teste nao encontrado em .github/workflows/test.yml');
  const body = yml.slice(start + 1, end);
  const indent = Math.min(...body.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return body.map(l => l.slice(indent)).join('\n') + '\n';
}

function run(dir, file) {
  const r = spawnSync(process.execPath, [file], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, output: (r.stdout || '') + (r.stderr || '') };
}

const dir = mkdtempSync(join(__dirname, '.teses-'));
try {
  copyFileSync(htmlPath, join(dir, 'index.html'));
  copyFileSync(join(__dirname, 'test-runtime.mjs'), join(dir, 'test-runtime.mjs'));
  copyFileSync(join(__dirname, 'test-antithesis.mjs'), join(dir, 'test-antithesis.mjs'));
  writeFileSync(join(dir, 'test.mjs'), workflowTest());

  report('TESTE ANTITESES. TESES.');
  report('Pagina: ' + htmlPath);
  report('As teses rodam como estao no repositorio. O veredito vem do codigo de saida de cada processo, nao do que cada um imprime.');

  const theses = [
    { name: 'test-runtime.mjs', ...run(dir, 'test-runtime.mjs') },
    { name: '.github/workflows/test.yml', ...run(dir, 'test.mjs') }
  ];
  const antithesis = { name: 'test-antithesis.mjs', ...run(dir, 'test-antithesis.mjs') };

  for (const t of [...theses, antithesis]) {
    report(`--- ${t.name}: saida ${t.code} (${t.code === 0 ? 'passou' : 'falhou'}) ---`);
    report(t.output.trim());
  }

  const reasons = [];
  if (antithesis.code !== 0) reasons.push('a antitese falhou ao rodar');
  for (const t of theses) {
    if (t.code === 0) reasons.push(`a tese ${t.name} passou ao rodar`);
    if (t.code === antithesis.code) reasons.push(`${t.name} e a antitese tiveram o mesmo resultado (${t.code})`);
  }

  report('--- CONCLUSAO ---');
  report(theses.map(t => `${t.name}: ${t.code}`).concat(`${antithesis.name}: ${antithesis.code}`).join(' | '));
  if (reasons.length) {
    report('FALHA');
    reasons.forEach(r => report(' - ' + r));
    process.exitCode = 1;
  } else {
    report('PASSOU');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
