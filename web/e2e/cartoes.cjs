const { chromium } = require('playwright');
const URL = process.env.TARGET_URL || 'http://localhost:4200', OUT = process.env.OUT_DIR;
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL);
  await page.getByLabel('E-mail').fill(process.env.TEST_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForTimeout(2500);
  await page.goto(URL + '/cartoes'); await page.waitForTimeout(2000);
  const cards = page.locator('.cc-rail .cc');
  const n = await cards.count();
  if (n < 2) { ok('precisa de 2+ cartões nos dados de teste', false, `${n}`); return b.close(); }
  const on = () => page.locator('.cc-rail .cc.on').evaluate((el) => [...el.parentElement.children].indexOf(el));
  ok('começa no primeiro', (await on()) === 0);
  // arrastar o trilho até o 2º cartão (rolagem do trilho = gesto de arrastar)
  await page.locator('.cc-rail').evaluate((r) => r.scrollTo({ left: r.children[1].offsetLeft - r.offsetLeft }));
  await page.waitForTimeout(1200);
  ok('arrastar seleciona o cartão do centro', (await on()) === 1, `on=${await on()}`);
  await page.locator('.cc-rail').evaluate((r) => r.scrollTo({ left: 0 }));
  await page.waitForTimeout(1200);
  ok('voltar arrastando seleciona o primeiro', (await on()) === 0);
  await cards.nth(1).tap({ position: { x: 10, y: 60 } }); // borda esquerda do 2º, que aparece à direita
  await page.waitForTimeout(1200);
  const left = await page.locator('.cc-rail').evaluate((r) => r.children[1].getBoundingClientRect().left - r.getBoundingClientRect().left);
  ok('toque no cartão da borda seleciona e traz para o centro', (await on()) === 1 && left < 60, `left=${Math.round(left)}`);
  await page.screenshot({ path: `${OUT}/cartoes-mobile.png` });
  ok('sem erros no console', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
})();
