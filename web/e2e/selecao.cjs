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
  await page.getByRole('button', { name: /^Entrar$/ }).click(); await page.waitForTimeout(250);
  await page.waitForTimeout(2500);
  await page.goto(URL + '/lancamentos?m=2026-10'); await page.waitForTimeout(2000);
  const items = page.locator('.panel .item');
  const n0 = await items.count();
  const amt = async (i) => await items.nth(i).locator('.amt').innerText();
  const a0 = await amt(0), a1 = await amt(1), d1 = await items.nth(1).locator('.title').innerText();
  await items.nth(0).locator('.cat-ico').click(); await page.waitForTimeout(250);
  ok('ícone seleciona e mostra barra', await page.locator('.sel-bar').isVisible());
  await items.nth(1).click(); await page.waitForTimeout(250); // com seleção ativa, clique seleciona
  const bar = await page.locator('.sel-bar').innerText();
  ok('soma de 2 selecionados', /2 selecionados/.test(bar), `${a0} + ${a1} → ${bar.split('\n').slice(1, 3).join(' ')}`);
  ok('drawer não abriu', !(await page.locator('.drawer').count()));
  await page.screenshot({ path: `${OUT}/sel.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok('Esc limpa seleção', !(await page.locator('.sel-bar').count()));
  await items.nth(2).click({ button: 'right' }); await page.waitForTimeout(250);
  ok('clique direito / toque longo seleciona', (await page.locator('.sel-bar').count()) === 1);
  await page.locator('.sel-bar .link').click(); await page.waitForTimeout(250);
  ok('selecionar todos', (await page.locator('.sel-bar').innerText()).includes(`${n0} selecionados`), `${n0}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  // categoria em lote + desfazer (2 primeiros que são saídas)
  const outs = page.locator('.panel .item:has(.amt.neg)');
  const c0 = await outs.nth(0).locator('.sub').innerText(), c1 = await outs.nth(1).locator('.sub').innerText();
  await outs.nth(0).locator('.cat-ico').click(); await page.waitForTimeout(200); await outs.nth(1).locator('.cat-ico').click(); await page.waitForTimeout(200); await page.waitForTimeout(250);
  await page.locator('.sel-bar g-chip-select button').first().click(); await page.waitForTimeout(300);
  await page.getByRole('option', { name: /Lazer/ }).first().click().catch(async () => { await page.getByText('Lazer e hobbies', { exact: true }).first().click(); });
  await page.waitForTimeout(1200);
  const toast = await page.locator('.toast').innerText().catch(() => '');
  const n0c = await outs.nth(0).locator('.sub').innerText();
  ok('categoria em lote', /em Lazer/.test(toast) && /Lazer/.test(n0c), toast.split('\n')[0]);
  await page.locator('.toast button').click(); await page.waitForTimeout(1500);
  ok('desfazer categoria', (await outs.nth(0).locator('.sub').innerText()) === c0 && (await outs.nth(1).locator('.sub').innerText()) === c1);
  // excluir em lote + desfazer
  await items.nth(1).locator('.cat-ico').click(); await page.waitForTimeout(200); await items.nth(3).locator('.cat-ico').click(); await page.waitForTimeout(200); await page.waitForTimeout(250);
  await page.locator('.sel-bar .danger').click(); await page.waitForTimeout(1500);
  const n1 = await items.count();
  ok('excluir em lote', n1 <= n0 - 2, `${n0} → ${n1}`);
  await page.locator('.toast button').click(); await page.waitForTimeout(1800);
  ok('desfazer exclusão', (await items.count()) === n0 && (await items.nth(1).locator('.title').innerText()) === d1, `${await items.count()}`);
  // mobile
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  await items.nth(0).locator('.cat-ico').click(); await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/sel-m.png` });
  const bb = await page.locator('.sel-bar').boundingBox(), tb = await page.locator('.tabbar').boundingBox();
  ok('mobile: barra acima da tabbar', bb && tb && bb.y + bb.height <= tb.y + 1, `${Math.round(bb?.y + bb?.height)} ≤ ${Math.round(tb?.y)}`);
  console.log('erros console:', errs);
  await b.close();
})();
