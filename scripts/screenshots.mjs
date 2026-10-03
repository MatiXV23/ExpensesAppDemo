// Genera las capturas y GIFs del README navegando la demo con Playwright.
// Uso: npm run build && npm run screenshots
// Sirve dist/ bajo una subcarpeta (/cuentas-claras/) para comprobar que el build funciona como en GitHub Pages.
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'docs', 'screenshots');
const BASE = '/cuentas-claras/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

if (!existsSync(path.join(dist, 'index.html'))) { console.error('Falta dist/: corre "npm run build" primero.'); process.exit(1); }
await mkdir(out, { recursive: true });

// Servidor estático mínimo (sin fallback: la app usa HashRouter).
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(BASE)) { res.writeHead(302, { location: BASE }); return res.end(); }
  let file = path.join(dist, url.slice(BASE.length) || 'index.html');
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('No encontrado'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}${BASE}`;
console.log(`Demo servida en ${origin}`);

// Usa el Chrome instalado; si no hay, el Chromium de Playwright (npx playwright install chromium).
let browser;
try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch(); }

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-UY', colorScheme: 'light' };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-UY', colorScheme: 'light' };
// El script inicial se serializa sin closure: el tema va como argumento.
const lightTheme = context => context.addInitScript(theme => { if (!localStorage.getItem('cc-theme')) localStorage.setItem('cc-theme', theme); }, 'light');
const hideChrome = page => page.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}.demo-fab{display:none!important}' });
const shot = async (page, name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, name) }); console.log(`  ✓ ${name}`); };
const failOnErrors = page => page.on('pageerror', error => { throw new Error(`Error en la página: ${error.message}`); });

async function loginAs(page, name) {
  await page.goto(`${origin}#/login`);
  await page.getByRole('button', { name: `Entrar como ${name}` }).click();
  await page.getByText('Un hogar. Las cuentas claras.').waitFor();
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------------------
// Capturas de escritorio
// ---------------------------------------------------------------------------
console.log('Capturas de escritorio');
{
  const context = await browser.newContext(desktop);
  await lightTheme(context);
  const page = await context.newPage();
  failOnErrors(page);

  await page.goto(`${origin}#/login`);
  await page.getByRole('button', { name: 'Entrar como Matías' }).waitFor();
  await shot(page, '01-login.png');

  await loginAs(page, 'Matías');
  await hideChrome(page);
  await shot(page, '02-inicio.png');

  await page.goto(`${origin}#/receipts/1`);
  await page.getByText('Posible duplicado').waitFor();
  await hideChrome(page);
  await shot(page, '03-comprobante-ia.png');

  await page.goto(`${origin}#/`);
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click();
  await page.getByText('Carga rápida con texto').click();
  await page.getByLabel('Describe tu gasto').fill('Chivitos 1.980 en La Pasiva con Mercado Pago, entre todos\nNetflix 15,99 dólares con la OCA, pagó Sofía');
  await page.getByRole('button', { name: 'Interpretar gasto' }).click();
  await page.getByRole('button', { name: 'Confirmar 2 gastos' }).waitFor();
  await page.locator('.modal-body').evaluate(el => { el.scrollTop = 150; });
  await hideChrome(page);
  await shot(page, '04-carga-por-texto.png');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Agregar gasto' }).first().click();
  await page.getByText('Cargar gasto manual').click();
  await page.locator('#expense-amount').fill('3.600');
  await page.getByPlaceholder('Por ejemplo: compra de la semana').fill('Cena de cumpleaños');
  await page.getByPlaceholder('¿Dónde fue?').fill('Parrilla El Fogón');
  await page.getByRole('button', { name: 'Delivery y restaurantes' }).click();
  await page.getByRole('switch', { name: 'Dividir gasto' }).click();
  await page.getByLabel('Cómo dividir').selectOption('percentage');
  for (const [name, value] of [['Matías', '50'], ['Sofía', '30'], ['Lucas', '20']]) await page.getByLabel(`Parte de ${name}`).fill(value);
  await page.locator('.modal-body').evaluate(el => { const box = el.querySelector('.split-box'); el.scrollTop = box.offsetTop - 24; });
  await hideChrome(page);
  await shot(page, '05-gasto-dividido.png');
  await page.keyboard.press('Escape');

  await page.goto(`${origin}#/analytics`);
  await page.getByRole('button', { name: 'Generar informe con IA' }).click();
  await page.getByText('Tu mes en perspectiva').waitFor();
  await hideChrome(page);
  await shot(page, '06-analisis-informe.png');
  await page.locator('.analytics-chart').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -120);
  await shot(page, '07-analisis-tendencias.png');

  for (const [route, text, name] of [['budgets', 'Cada categoría, su espacio', '08-presupuestos.png'], ['balances', 'Menos transferencias, más simple', '09-cuentas-compartidas.png'], ['recurring', 'Pendientes de confirmar', '10-gastos-fijos.png'], ['expenses', 'Total del período', '11-gastos.png']]) {
    await page.goto(`${origin}#/${route}`);
    await page.getByText(text).first().waitFor();
    await hideChrome(page);
    await shot(page, name);
  }

  // Panel de la demo con parte del recorrido hecho.
  await page.evaluate(() => localStorage.setItem('cuentas-claras-demo:progress', JSON.stringify(['receipt', 'text', 'expense', 'report'])));
  await page.goto(`${origin}#/`);
  await page.reload();
  await page.getByText('Un hogar. Las cuentas claras.').waitFor();
  await page.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' });
  await page.getByRole('button', { name: 'Abrir el panel de la demo' }).click();
  await page.getByText('Panel de la demo').waitFor();
  await shot(page, '12-panel-demo.png');

  // Modo oscuro.
  await page.evaluate(() => localStorage.setItem('cc-theme', 'dark'));
  await page.goto(`${origin}#/`);
  await page.reload();
  await page.getByText('Un hogar. Las cuentas claras.').waitFor();
  await hideChrome(page);
  await shot(page, '13-inicio-oscuro.png');
  await context.close();
}

// ---------------------------------------------------------------------------
// Capturas en el celular
// ---------------------------------------------------------------------------
console.log('Capturas en el celular');
{
  const context = await browser.newContext(mobile);
  await lightTheme(context);
  const page = await context.newPage();
  failOnErrors(page);
  await loginAs(page, 'Sofía');
  await hideChrome(page);
  await shot(page, 'movil-inicio.png');
  await page.goto(`${origin}#/receipts/2`);
  await page.getByText('Pedido de comida').waitFor();
  await hideChrome(page);
  await shot(page, 'movil-comprobante.png');
  await page.goto(`${origin}#/balances`);
  await page.getByText('Menos transferencias, más simple').waitFor();
  await hideChrome(page);
  await shot(page, 'movil-cuentas.png');
  await context.close();
}

// ---------------------------------------------------------------------------
// GIFs de los flujos principales (video de Playwright → GIF con ffmpeg)
// ---------------------------------------------------------------------------
let ffmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = false; console.log('ffmpeg no está instalado: se omiten los GIFs.'); }

async function record(name, flow, { trim = 0.6, width = 960 } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-video-'));
  const context = await browser.newContext({ ...desktop, viewport: { width: 1280, height: 800 }, recordVideo: { dir, size: { width: 1280, height: 800 } } });
  await lightTheme(context);
  const page = await context.newPage();
  failOnErrors(page);
  await flow(page);
  await context.close();
  const [video] = (await readdir(dir)).filter(f => f.endsWith('.webm'));
  const filters = `fps=10,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(trim), '-i', path.join(dir, video), '-vf', filters, '-loop', '0', path.join(out, name)]);
  await rm(dir, { recursive: true, force: true });
  console.log(`  ✓ ${name} (${Math.round((await stat(path.join(out, name))).size / 1024)} KB)`);
}

if (ffmpeg) {
  console.log('GIFs');
  await record('flujo-comprobante.gif', async page => {
    await page.goto(`${origin}#/login`);
    await page.getByRole('button', { name: 'Entrar como Matías' }).waitFor();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Entrar como Matías' }).click();
    await page.getByText('Un hogar. Las cuentas claras.').waitFor();
    await page.waitForTimeout(1200);
    await page.locator('.desktop-nav').getByText('Comprobantes').click();
    await page.getByText('Prueba con uno de ejemplo').waitFor();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Ticket del súper/ }).click();
    await page.getByRole('button', { name: 'Entendido' }).waitFor();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Entendido' }).click();
    await page.locator('.receipt-card').first().getByText('Para revisar').waitFor({ timeout: 15000 });
    await page.locator('.receipt-card').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.locator('.receipt-card').first().getByRole('button', { name: 'Revisar gastos' }).click();
    await page.getByRole('button', { name: 'Confirmar 1 gasto' }).waitFor();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Confirmar 1 gasto' }).click();
    await page.waitForTimeout(1800);
  });
  await record('flujo-carga-por-texto.gif', async page => {
    await page.goto(`${origin}#/login`);
    await page.getByRole('button', { name: 'Entrar como Sofía' }).click();
    await page.getByText('Un hogar. Las cuentas claras.').waitFor();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Agregar gasto' }).first().click();
    await page.waitForTimeout(700);
    await page.getByText('Carga rápida con texto').click();
    await page.getByLabel('Describe tu gasto').pressSequentially('Súper 2.350 en Tienda Inglesa con débito, entre todos', { delay: 35 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Interpretar gasto' }).click();
    await page.getByRole('button', { name: 'Confirmar 1 gasto' }).waitFor();
    await page.locator('.modal-body').evaluate(el => el.scrollTo({ top: 260, behavior: 'smooth' }));
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Confirmar 1 gasto' }).click();
    await page.waitForTimeout(1800);
  }, { trim: 1.2 });
}

await browser.close();
server.close();
console.log(`Listo: ${out}`);
