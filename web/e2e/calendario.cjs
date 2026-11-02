const { chromium } = require('playwright');
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
async function run(b, mode) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((m) => {
    if (m === 'nativo') { window.__picker = 0; HTMLInputElement.prototype.showPicker = function () { window.__picker++; }; }
    else HTMLInputElement.prototype.showPicker = undefined;
  }, mode);
  const p = await ctx.newPage();
  await p.goto(process.env.TARGET_URL); await p.getByLabel('E-mail').fill(process.env.TEST_EMAIL); await p.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
  await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForTimeout(2500);
  await p.locator('.tab-add').click(); await p.waitForTimeout(800);
  await p.locator('.keypad-done .k-done').click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /Outra data/ }).click(); await p.waitForTimeout(500);
  if (mode === 'nativo') {
    ok('celular: abre o calendário do sistema', (await p.evaluate(() => window.__picker)) === 1 && !(await p.locator('.cal').count()));
    // simula a escolha no picker nativo
    await p.locator('.native-date').evaluate((i) => { i.value = '2026-10-15'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(300);
    ok('data escolhida no picker vira o valor', (await p.getByRole('button', { name: /15 de out/ }).count()) === 1, await p.locator('.date-quick').innerText());
  } else {
    const r = await p.locator('.cal').boundingBox();
    const pos = await p.locator('.cal').evaluate((e) => getComputedStyle(e).position);
    ok('fallback: calendário em modal fixo e centralizado', pos === 'fixed' && Math.abs(r.y + r.height / 2 - 422) < 30, `${pos} y=${Math.round(r.y)} h=${Math.round(r.height)}`);
    ok('fallback: fundo escuro por trás', (await p.locator('.cal-scrim').isVisible()));
    await p.screenshot({ path: process.env.OUT_DIR + '/cal-modal.png' });
    await p.locator('.cal-d').nth(11).click(); await p.waitForTimeout(300);
    ok('fallback: escolher dia fecha o modal', !(await p.locator('.cal').count()));
  }
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ headless: true });
  await run(b, 'nativo'); await run(b, 'sem');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.TARGET_URL); await p.getByLabel('E-mail').fill(process.env.TEST_EMAIL); await p.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
  await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForTimeout(2500);
  await p.keyboard.press('d'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Outra data/ }).click(); await p.waitForTimeout(400);
  ok('desktop: calendário próprio em popover', (await p.locator('.cal').evaluate((e) => getComputedStyle(e).position)) === 'absolute');
  await p.screenshot({ path: process.env.OUT_DIR + '/cal-desk.png' });
  await b.close();
})();
