// Itens do Organizze: ordem manual, previsão do cartão na conta, saldo do dia, categoria aberta no relatório,
// sugestão de descrição, deslizar lançamento e ritmo no 50/30/20.
const { chromium } = require('playwright');
const URL = process.env.TARGET_URL || 'http://localhost:4200', OUT = process.env.OUT_DIR;
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
async function login(page) {
    await page.goto(URL);
    await page.getByLabel('E-mail').fill(process.env.TEST_EMAIL);
    await page.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForTimeout(2500);
}
(async () => {
    const b = await chromium.launch({ headless: true });
    const errs = [];
    try {
        const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', (e) => errs.push(e.message));
        await login(page);
        // 13: ritmo nos medidores do 50/30/20
        ok('50/30/20 com marca de ritmo', (await page.locator('section.panel', { hasText: 'Equilíbrio financeiro' }).locator('.pace-mark').count()) >= 1);
        // 8: previsto da conta inclui fatura do cartão que ela paga
        const contas = page.locator('section.panel', { hasText: 'Contas' }).last();
        ok('conta mostra previsto com fatura', /inclui fatura|previsto fim do mês/.test(await contas.innerText()), (await contas.locator('.sub').first().innerText().catch(() => '')).slice(0, 60));
        // 11: sugestão de descrição
        await page.keyboard.press('d'); await page.waitForTimeout(800);
        await page.locator('.drawer input[name=d]').fill('Bil'); await page.waitForTimeout(900);
        const hints = await page.locator('.desc-hints button').allInnerTexts();
        ok('sugere descrições já usadas', hints.some((h) => /bilhete/i.test(h)), hints.slice(0, 3).join(' | ').replace(/\n/g, ' '));
        if (hints.length) {
            await page.locator('.desc-hints button').first().click(); await page.waitForTimeout(300);
            ok('tocar preenche descrição', (await page.locator('.drawer input[name=d]').inputValue()).length > 3);
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        // 9: saldo do dia (modo Caixa)
        await page.goto(URL + '/lancamentos?m=2026-10'); await page.waitForTimeout(1500);
        await page.getByRole('button', { name: 'Caixa' }).click(); await page.waitForTimeout(1200);
        ok('saldo no fim do dia (Caixa)', (await page.locator('.day-bal').count()) > 0, (await page.locator('.day-bal').first().innerText().catch(() => '')));
        await page.getByRole('button', { name: 'Tudo' }).click(); await page.waitForTimeout(800);
        ok('sem saldo do dia no modo Tudo sem conta', (await page.locator('.day-bal').count()) === 0);
        // 10: categoria abre os lançamentos no relatório
        await page.goto(URL + '/relatorios'); await page.waitForTimeout(1500);
        await page.locator('.month-pill button').first().click(); await page.waitForTimeout(1500);
        await page.locator('.cat-list > .item').first().click(); await page.waitForTimeout(1500);
        const det = page.locator('.cat-detail .item');
        const vals = (await det.locator('.amt').allInnerTexts()).map((v) => Math.abs(Number(v.replace(/[^\d,-]/g, '').replace(',', '.'))));
        ok('categoria abre lançamentos ali mesmo', vals.length > 0, `${vals.length} lançamentos`);
        ok('do maior para o menor', vals.every((v, i) => i === 0 || v <= vals[i - 1] + 0.001));
        // 7: ordem manual de contas
        await page.goto(URL + '/ajustes'); await page.waitForTimeout(1500);
        const contasAj = page.locator('section.panel', { hasText: 'Contas' }).first().locator('.list > .item');
        const before = await contasAj.locator('.title').allInnerTexts();
        await contasAj.first().getByRole('button', { name: 'Descer' }).click(); await page.waitForTimeout(1500);
        const after = await contasAj.locator('.title').allInnerTexts();
        ok('descer conta troca a ordem', after[0] === before[1] && after[1] === before[0], `${before.slice(0, 2).join(',')} → ${after.slice(0, 2).join(',')}`);
        await contasAj.nth(1).getByRole('button', { name: 'Subir' }).click(); await page.waitForTimeout(1500);
        ok('subir volta', (await contasAj.locator('.title').first().innerText()) === before[0]);
        // arrastar pela alça: contas em Ajustes
        const drag = async (from, to) => {
            const h = from.locator('.reorder-handle'), hb = await h.boundingBox(), tb = await to.boundingBox();
            await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
            await page.mouse.down();
            for (let k = 1; k <= 8; k++) await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + (((tb.y > hb.y ? tb.y + tb.height * 0.75 : tb.y + tb.height * 0.25) - hb.y - hb.height / 2) * k) / 8);
            await page.mouse.up();
            await page.waitForTimeout(1500);
        };
        const t0 = await contasAj.locator('.title').allInnerTexts();
        await drag(contasAj.first(), contasAj.nth(1));
        const t1 = await contasAj.locator('.title').allInnerTexts();
        ok('arrastar conta para baixo', t1[1] === t0[0], `${t0.slice(0, 2).join(',')} → ${t1.slice(0, 2).join(',')}`);
        ok('arrastar não abre a edição', (await page.locator('.drawer').count()) === 0);
        await drag(contasAj.nth(1), contasAj.first());
        await page.waitForTimeout(500);
        ok('arrastar de volta', (await contasAj.locator('.title').first().innerText()) === t0[0]);
        // arrastar seções do Início
        await page.goto(URL); await page.waitForTimeout(2500);
        await page.getByRole('button', { name: /Personalizar/ }).click(); await page.waitForTimeout(500);
        const rows = page.locator('.custom-row');
        const n0 = await rows.locator('label').allInnerTexts();
        await drag(rows.first(), rows.nth(2));
        const n1 = await rows.locator('label').allInnerTexts();
        ok('arrastar seção do Início', n1[2].trim() === n0[0].trim() || n1[1].trim() === n0[0].trim(), `${n0[0].trim()} → posição ${n1.findIndex((x) => x.trim() === n0[0].trim()) + 1}`);
        await page.getByRole('button', { name: 'Restaurar padrão' }).click();
        await page.getByRole('button', { name: 'Pronto' }).click();
        await page.close();
        // 12: deslizar no celular (eventos de toque)
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const m = await ctx.newPage();
        m.on('pageerror', (e) => errs.push(e.message));
        await login(m);
        await m.goto(URL + '/lancamentos?m=2026-10'); await m.waitForTimeout(2000);
        const row = m.locator('.panel .item', { has: m.locator('.paid-btn') }).first();
        const wasPaid = await row.locator('.paid-btn.on').count();
        const swipe = (dx) =>
            row.evaluate((el, dx) => {
                const r = el.getBoundingClientRect(), y = r.top + r.height / 2, x = r.left + r.width / 2;
                const ev = (type, cx) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: cx, clientY: y, bubbles: true }));
                ev('pointerdown', x);
                for (let k = 1; k <= 6; k++) ev('pointermove', x + (dx * k) / 6);
                ev('pointerup', x + dx);
            }, dx);
        await swipe(130); await m.waitForTimeout(1500);
        ok('deslizar → alterna pago', (await row.locator('.paid-btn.on').count()) !== wasPaid);
        await m.locator('.toast button', { hasText: 'Desfazer' }).click().catch(() => {}); await m.waitForTimeout(1500);
        ok('desfazer volta o pago', (await row.locator('.paid-btn.on').count()) === wasPaid);
        await ctx.close();
    } catch (e) {
        console.log('💥 ' + e.message.split('\n')[0]);
    }
    console.log('erros de página:', errs.length ? errs : 'nenhum');
    await b.close();
})();
