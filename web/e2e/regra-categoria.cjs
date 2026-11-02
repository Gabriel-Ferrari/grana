const { chromium } = require('playwright');
const URL = process.env.TARGET_URL || 'http://localhost:4200', OUT = process.env.OUT_DIR;
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL);
  await page.getByLabel('E-mail').fill(process.env.TEST_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForTimeout(2500);
  await page.goto(URL + '/lancamentos?m=2026-10'); await page.waitForTimeout(2000);
  const row = page.locator('.panel .item', { hasText: 'Bilhete' }).first();
  const orig = (await row.locator('.sub').innerText()).split('·')[0].trim();
  const pick = async (cat) => {
    await row.click(); await page.waitForTimeout(700);
    await page.locator('.drawer .tx-row', { hasText: 'Categoria' }).locator('.frow').click(); await page.waitForTimeout(300);
    await page.locator('.fpop .fopt', { hasText: cat }).first().click(); await page.waitForTimeout(200);
    await page.locator('.drawer .btn.save').click(); await page.waitForTimeout(1800);
    return page.locator('.toast').innerText().catch(() => '');
  };
  const t1 = await pick('Lazer e hobbies');
  ok('oferece aplicar aos outros', /Aplicar Lazer e hobbies a outros? .*Bilhete/.test(t1), t1.replace(/\n/g, ' '));
  await page.screenshot({ path: `${OUT}/regra.png` });
  await page.locator('.toast button', { hasText: 'Aplicar' }).click(); await page.locator('.toast', { hasText: 'em Lazer' }).waitFor(); await page.waitForTimeout(1200);
  const t2 = await page.locator('.toast').innerText().catch(() => '');
  const bilhetes = page.locator('.panel .item', { hasText: 'Bilhete' });
  const subs = await bilhetes.locator('.sub').allInnerTexts();
  ok('aplicou a todos do mês', subs.every((s) => s.includes('Lazer')), subs.join(' ; ').replace(/\n/g,' '));
  await page.locator('.toast button', { hasText: 'Desfazer' }).click(); await page.waitForTimeout(1800);
  const subs2 = await bilhetes.locator('.sub').allInnerTexts();
  ok('desfazer volta os outros', subs2.filter((s) => s.includes(orig)).length === subs2.length - 1, subs2.map((s) => s.split('·')[0].trim()).join(', '));
  const t3 = await pick(orig); // volta o primeiro: deve oferecer? (os outros já estão em orig → não oferece)
  ok('volta original sem oferta redundante', !/Aplicar/.test(t3), t3.replace(/\n/g, ' '));
  console.log('erros console:', errs);
  await b.close();
})();
