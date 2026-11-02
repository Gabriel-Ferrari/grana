const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:4200';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const OUT = process.env.OUT_DIR;
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

async function login(page, pass = PASSWORD) {
  await page.goto(TARGET_URL);
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForSelector('.hero-value', { timeout: 15000 });
  await page.waitForTimeout(1500); // animações + fontes
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const errors = [];
  try {
    // ───── DESKTOP ─────
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push('[desktop] ' + m.text()));
    page.on('pageerror', (e) => errors.push('[desktop pageerror] ' + e.message));

    // senha errada -> mensagem em português
    await page.goto(TARGET_URL);
    ok('botão Google com logo', await page.locator('.google-btn svg').count() === 1);
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha', { exact: true }).fill('errada123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForSelector('.toast.error');
    ok('senha errada avisa em pt-BR', (await page.locator('.toast').innerText()).includes('E-mail ou senha incorretos'));
    await page.screenshot({ path: `${OUT}/d-login.png` });
    // cadastro com e-mail e senha, sem Google; a conta nova não vê dados de ninguém
    const novo = `teste${Date.now()}@grana.local`;
    await page.getByRole('button', { name: 'Criar conta com e-mail' }).click();
    await page.getByLabel('Seu nome').fill('Conta Teste');
    await page.getByLabel('E-mail').fill(novo);
    await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123');
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
    await page.waitForSelector('.hero-value', { timeout: 15000 });
    await page.waitForTimeout(1200);
    ok('criar conta com e-mail', (await page.locator('.greet').innerText()).includes('Conta'));
    ok('conta nova isolada (saldo zero, sem contas)', (await page.locator('.hero-value').innerText()).includes('0,00') && (await page.locator('g-bank').count()) === 0);
    await page.locator('button[aria-label=Conta]').click();
    await page.locator('#user-menu button', { hasText: 'Sair' }).click();
    await page.waitForSelector('.google-btn');
    await login(page);
    ok('login e-mail e senha', true);
    const hero = await page.locator('.hero-value').innerText();
    ok('saldo no hero', /R\$/.test(hero), hero);
    ok('gráfico ritmo renderizou', await page.locator('g-pace canvas').count() === 1);
    const bars = await page.locator('.rank button').count();
    ok('barras por categoria', bars > 0, `${bars} barras`);
    ok('ícones Material carregados', await page.evaluate(() => document.fonts.check('20px "Material Symbols Rounded"')));
    await page.screenshot({ path: `${OUT}/d-home.png`, fullPage: true });

    // fila "Para revisar"
    ok('fila para revisar', (await page.locator('.panel.review .rev-item').count()) === 2);
    await page.locator('.rev-item', { hasText: 'PADARIA TESTE' }).locator('.fchip').click();
    await page.locator('.fpop .fopt', { hasText: 'Alimentação' }).first().click();
    ok('categoria trocada na fila', (await page.locator('.rev-item', { hasText: 'PADARIA TESTE' }).locator('.fchip').innerText()).includes('Alimentação'));
    await page.locator('.rev-item', { hasText: 'PADARIA TESTE' }).locator('.rev-ok').click();
    await page.waitForSelector('.toast >> text=revisado');
    ok('aprovar tira da fila', (await page.locator('.rev-item').count()) === 1);
    await page.locator('.toast button', { hasText: 'Desfazer' }).click();
    await page.waitForTimeout(1200);
    ok('desfazer volta pra fila', (await page.locator('.rev-item').count()) === 2);
    await page.screenshot({ path: `${OUT}/d-revisar.png` });

    // hover no gráfico de ritmo -> tooltip
    const box = await page.locator('g-pace canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    ok('números de destaque', (await page.locator('.pace-stats b').count()) === 3);

    // barra clicável -> lançamentos filtrados
    const firstBar = await page.locator('.rank button .name').first().innerText();
    await page.locator('.rank button').first().click();
    await page.waitForURL(/lancamentos\?.*cat=/);
    await page.waitForTimeout(800);
    const n = await page.locator('.item.click').count();
    ok('barra -> lançamentos filtrados', n > 0, `${firstBar.trim()}: ${n} itens, url ${page.url().replace(TARGET_URL, '')}`);
    await page.screenshot({ path: `${OUT}/d-lancamentos-filtro.png`, fullPage: true });

    // busca com "/"
    await page.goto(`${TARGET_URL}/lancamentos?m=2026-10`);
    await page.waitForSelector('.item.click');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    ok('atalho / foca a busca', await page.evaluate(() => document.activeElement?.id === 'search'));
    await page.keyboard.type('uber');
    await page.waitForTimeout(300);
    ok('busca filtra', await page.locator('.item.click').count() >= 1, `${await page.locator('.item.click').count()} com "uber"`);
    await page.locator('#search').fill('');

    // filtro em chip: Tipo -> Saídas
    await page.locator('g-chip-select', { hasText: 'Tipo' }).locator('.fchip').click();
    await page.locator('.fpop .fopt', { hasText: 'Saídas' }).click();
    const amts = await page.locator('.item.click .amt').allInnerTexts();
    ok('chip Tipo filtra saídas', amts.length > 0 && amts.every((a) => a.includes('-')), `${amts.length} itens`);
    await page.screenshot({ path: `${OUT}/d-chips.png` });
    await page.locator('.fchip.clear').click();

    // marcar pago + desfazer
    const paidBtn = page.locator('.paid-btn').first();
    const before = await paidBtn.getAttribute('class');
    await paidBtn.click();
    await page.waitForSelector('.toast');
    ok('toast com Desfazer', await page.locator('.toast button', { hasText: 'Desfazer' }).isVisible());
    await page.locator('.toast button').click();
    await page.waitForSelector('.toast >> text=Desfeito');
    await page.waitForTimeout(600);
    ok('desfazer restaurou', (await page.locator('.paid-btn').first().getAttribute('class')) === before);

    // atalho D -> gaveta, salvar, excluir com desfazer
    await page.goto(`${TARGET_URL}/lancamentos`);
    await page.waitForTimeout(800);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('d');
    await page.waitForSelector('.drawer');
    ok('atalho D abre gaveta', true);
    ok('foco no valor', await page.evaluate(() => document.activeElement?.id === 'valor'));
    await page.keyboard.type('1234');
    ok('valor a partir dos centavos', (await page.locator('#valor').inputValue()).replace(/\s/g, ' ') === 'R$ 12,34', await page.locator('#valor').inputValue());
    ok('joinha de pago no topo', await page.locator('.drawer .thumb').isVisible());
    await page.locator('.drawer .thumb').click();
    ok('joinha alterna pendente', (await page.locator('.tx-paid').innerText()).includes('A pagar'));
    await page.locator('.drawer .thumb').click();
    await page.getByRole('button', { name: 'Outra data' }).click();
    await page.waitForSelector('.cal');
    await page.locator('.cal-d').nth(14).click();
    ok('calendário escolhe dia 15', (await page.locator('.date-quick .pill.grow').innerText()).includes('15'));
    await page.getByRole('button', { name: 'Hoje' }).click();
    await page.getByRole('tab', { name: 'Receita' }).click();
    ok('aba receita muda a cor', (await page.locator('.drawer.tx').getAttribute('data-kind')) === 'income');
    await page.getByRole('tab', { name: 'Despesa' }).click();
    await page.locator('.drawer input[name=d]').fill('Uber');
    await page.waitForSelector('.suggest', { timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(300);
    const sug = await page.locator('.suggest').count();
    ok('sugestões de categoria pelo histórico (até 3)', sug >= 1 && sug <= 3, (await page.locator('.suggest').allInnerTexts()).join(', '));
    if (sug) await page.locator('.suggest').first().click();
    await page.locator('.drawer input[name=d]').fill('Teste playwright');
    await page.locator('.tx-row', { hasText: 'Pago com' }).locator('.frow').click();
    await page.locator('.fpop .fopt', { hasText: 'Bradesco' }).last().click();
    ok('mostra fatura do cartão', (await page.locator('.invoice-hint').innerText()).includes('Entra na fatura de'));
    await page.locator('.tx-row', { hasText: 'Pago com' }).locator('.frow').click();
    await page.locator('.fpop .fopt', { hasText: 'Bradesco' }).first().click();
    await page.screenshot({ path: `${OUT}/d-gaveta.png` });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.waitForSelector('.toast >> text=Lançamento salvo');
    ok('salvar despesa', true);
    await page.waitForTimeout(800);
    await page.locator('.item.click', { hasText: 'Teste playwright' }).first().click();
    await page.waitForSelector('.drawer');
    await page.getByRole('button', { name: 'Excluir' }).click();
    await page.waitForSelector('.toast >> text=Lançamento excluído');
    ok('excluir com toast', await page.locator('.toast button', { hasText: 'Desfazer' }).isVisible());
    await page.waitForTimeout(800);
    ok('item sumiu da lista', (await page.locator('.item.click', { hasText: 'Teste playwright' }).count()) === 0);

    // cartões
    await page.goto(`${TARGET_URL}/cartoes`);
    await page.waitForSelector('.cc');
    await page.waitForTimeout(1200);
    const ccs = await page.locator('.cc').count();
    ok('cartões físicos', ccs > 0, `${ccs} cartões`);
    ok('faixa de faturas', (await page.locator('.inv-strip button').count()) > 0);
    await page.screenshot({ path: `${OUT}/d-cartoes.png`, fullPage: true });
    if (ccs > 1) {
      await page.locator('.cc').nth(1).click();
      await page.waitForURL(/cartoes\?c=/);
      await page.waitForTimeout(800);
      ok('troca de cartão via URL', true);
    }

    // relatórios
    await page.goto(`${TARGET_URL}/relatorios`);
    await page.waitForSelector('g-donut canvas');
    ok('relatório abre em categorias com rosca', (await page.locator('.cat-list .item').count()) > 0);
    await page.locator('.rep-head g-chip-select button').first().click(); await page.waitForTimeout(300);
    await page.locator('.fpop .fopt', { hasText: 'Últimos 6 meses' }).click(); await page.waitForTimeout(800);
    await page.getByRole('tab', { name: /Balanço/ }).click();
    await page.waitForSelector('g-flow canvas');
    await page.waitForTimeout(1200);
    const cols = await page.evaluate(() => document.querySelectorAll('.table-view tr').length - 1);
    ok('colunas entradas×saídas', cols >= 3, `${cols} meses`);
    await page.locator('g-flow canvas').first().click({ position: { x: 300, y: 150 } }); await page.waitForURL(/lancamentos\?m=/); await page.goBack();
    ok('clique na coluna abre o mês', true);
    await page.screenshot({ path: `${OUT}/d-relatorios.png`, fullPage: true });

    // limites e ajustes
    await page.goto(`${TARGET_URL}/limites`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/d-limites.png`, fullPage: true });
    await page.goto(`${TARGET_URL}/ajustes`);
    await page.waitForTimeout(1000);
    await page.locator('section', { hasText: 'Categorias' }).locator('.item.click').first().click();
    await page.waitForSelector('.icon-grid');
    ok('seletor de ícone', (await page.locator('.icon-grid button').count()) > 30);
    ok('painel Open Finance', await page.locator('g-openfinance').isVisible());
    ok('passo a passo Pluggy', (await page.locator('details.guide summary').innerText()).includes('Passo a passo'));
    await page.screenshot({ path: `${OUT}/d-ajustes-icone.png` });
    await page.locator('.drawer button[aria-label=Fechar]').click();
    // seletor de banco com logos
    await page.locator('section', { hasText: 'Contas' }).first().getByRole('button', { name: 'Conta' }).click();
    await page.waitForSelector('.bank-grid');
    const nb = await page.locator('.bank-grid button').count();
    ok('catálogo de bancos', nb >= 25, `${nb} bancos`);
    await page.waitForTimeout(1500);
    const logos = await page.locator('.bank-grid img').evaluateAll((im) => im.filter((i) => i.complete && i.naturalWidth > 0).length);
    ok('logos carregados', logos >= 20, `${logos}/${nb}`);
    await page.locator('.bank-grid input, .drawer .search input').first().fill('itau');
    await page.locator('.bank-grid button').first().click();
    ok('banco preenche nome', (await page.locator('.drawer input[name=n]').inputValue()) === 'Itaú');
    ok('banco preenche app que notifica', (await page.locator('.drawer select[name=p]').inputValue()).includes('itau'));
    await page.screenshot({ path: `${OUT}/d-banco.png` });
    await page.locator('.drawer button[aria-label=Fechar]').click();
    // definir senha nova, sair, entrar com ela, voltar a senha original
    await page.getByLabel('Nova senha').fill('grana-teste-123');
    await page.getByLabel('Repita').fill('grana-teste-123');
    await page.getByRole('button', { name: 'Definir senha' }).click();
    await page.waitForSelector('.toast >> text=Senha definida');
    ok('definir senha em Ajustes', true);
    await page.locator('button[aria-label=Conta]').click();
    await page.locator('#user-menu button', { hasText: 'Sair' }).click();
    await page.waitForSelector('.google-btn');
    await login(page, 'grana-teste-123');
    ok('entra com a senha nova', true);
    await page.goto(`${TARGET_URL}/ajustes`);
    await page.getByLabel('Nova senha').fill(PASSWORD);
    await page.getByLabel('Repita').fill(PASSWORD);
    await page.getByRole('button', { name: 'Definir senha' }).click();
    await page.waitForSelector('.toast >> text=Senha definida');
    await page.goto(`${TARGET_URL}/cartoes`);
    await page.waitForTimeout(1500);
    ok('logo do banco no cartão', (await page.locator('.cc .bank-logo img').count()) > 0);
    await page.screenshot({ path: `${OUT}/d-cartoes2.png` });

    // tema claro/escuro manual
    await page.goto(TARGET_URL);
    await page.waitForSelector('.hero-value');
    await page.locator('button[aria-label^="Tema"]').click();
    const t1 = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('button[aria-label^="Tema"]').click();
    const t2 = await page.evaluate(() => document.documentElement.dataset.theme);
    ok('alterna tema', t1 === 'light' && t2 === 'dark', `${t1} → ${t2}`);
    await page.screenshot({ path: `${OUT}/d-home-dark.png` });
    await page.locator('button[aria-label^="Tema"]').click();

    // ───── MOBILE ─────
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    mp.on('console', (msg) => msg.type() === 'error' && errors.push('[mobile] ' + msg.text()));
    mp.on('pageerror', (e) => errors.push('[mobile pageerror] ' + e.message));
    await login(mp);
    ok('mobile: barra inferior', await mp.locator('.tabbar').isVisible());
    ok('mobile: + no centro da barra', await mp.locator('.tab-add').isVisible());
    await mp.screenshot({ path: `${OUT}/m-home.png`, fullPage: false });
    await mp.locator('.tab-add').tap();
    await mp.waitForSelector('.drawer');
    await mp.waitForTimeout(600);
    ok('mobile: teclado numérico', await mp.locator('.keypad').isVisible());
    for (const d of ['1', '2', '3']) await mp.locator('.keypad button', { hasText: new RegExp('^' + d + '$') }).tap();
    ok('mobile: teclado digita centavos', (await mp.locator('#valor').inputValue()).replace(/\s/g, ' ') === 'R$ 1,23');
    await mp.screenshot({ path: `${OUT}/m-keypad.png` });
    await mp.locator('.tx-row').first().tap();
    await mp.waitForTimeout(300);
    ok('mobile: tocar num campo fecha o teclado', (await mp.locator('.keypad').count()) === 0);
    await mp.locator('.tx-row', { hasText: 'Categoria' }).locator('.frow').tap();
    await mp.waitForSelector('.fpop');
    ok('mobile: categoria abre folha com ícones', (await mp.locator('.fpop .fopt .cat-ico').count()) > 10);
    await mp.screenshot({ path: `${OUT}/m-categoria.png` });
    await mp.locator('.fpop .fopt').nth(3).tap();
    ok('mobile: categoria escolhida', (await mp.locator('.tx-row', { hasText: 'Categoria' }).locator('.frow-val').innerText()) !== 'Sem categoria');
    await mp.screenshot({ path: `${OUT}/m-gaveta.png` });
    await mp.locator('.drawer button[aria-label=Fechar]').tap();
    await mp.locator('.tabbar button', { hasText: 'Mais' }).tap();
    await mp.waitForTimeout(400);
    ok('mobile: menu Mais', await mp.locator('#more-menu').isVisible());
    await mp.screenshot({ path: `${OUT}/m-mais.png` });
    await mp.locator('#more-menu a', { hasText: 'Limites' }).tap();
    await mp.waitForURL(/limites/); await mp.waitForTimeout(800);
    await mp.locator('.tabbar a', { hasText: 'Lançamentos' }).tap();
    await mp.waitForTimeout(1200);
    await mp.screenshot({ path: `${OUT}/m-lancamentos.png` });
    await mp.locator('.tabbar a', { hasText: 'Balanço' }).tap();
    await mp.waitForURL(/balanco/); await mp.waitForTimeout(1500);
    ok('mobile: aba Balanço', (await mp.locator('g-balance canvas').count()) === 1 && (await mp.locator('.bal-ends').count()) === 1);
    await mp.screenshot({ path: `${OUT}/m-balanco.png` });
  } catch (e) {
    results.push('💥 ' + e.message.split('\n')[0]);
  } finally {
    console.log(results.join('\n'));
    console.log(errors.length ? 'ERROS DE CONSOLE:\n' + [...new Set(errors)].slice(0, 15).join('\n') : 'Console sem erros');
    await browser.close();
  }
})();
