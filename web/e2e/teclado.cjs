// Teclado numérico no celular: toques muito rápidos, vibração leve a cada tecla (como no Organizze),
// tecla 00, apagar e o ✓ grande centralizado embaixo.
const { chromium } = require('playwright');
const URL = process.env.TARGET_URL || 'http://localhost:4200', OUT = process.env.OUT_DIR;
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
    const b = await chromium.launch({ headless: true });
    try {
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await ctx.addInitScript(() => {
            window.__vib = 0;
            navigator.vibrate = () => (window.__vib++, true);
        });
        const p = await ctx.newPage();
        await p.goto(URL);
        await p.getByLabel('E-mail').fill(process.env.TEST_EMAIL);
        await p.getByLabel('Senha', { exact: true }).fill(process.env.TEST_PASSWORD);
        await p.getByRole('button', { name: 'Entrar', exact: true }).click();
        await p.waitForTimeout(2500);
        await p.locator('.tab-add').tap();
        await p.waitForTimeout(700);
        const pos = {};
        for (const d of '0123456789') {
            const bb = await p.locator('.keypad button', { hasText: new RegExp('^\\s*' + d + '\\s*$') }).first().boundingBox();
            pos[d] = [bb.x + bb.width / 2, bb.y + bb.height / 2];
        }
        const val = async () => (await p.locator('#valor').inputValue()).replace(/\s/g, ' ');
        const zerar = async () => {
            await p.getByRole('button', { name: 'Zerar' }).tap();
            await p.waitForTimeout(150);
        };
        for (const [label, seq, gap] of [
            ['mesmo número 6x a cada 40ms', '111111', 40],
            ['mesmo número 6x a cada 15ms', '222222', 15],
            ['8 números diferentes a cada 20ms', '12345678', 20],
            ['10 toques sem intervalo', '9876543210', 0],
        ]) {
            await zerar();
            const v0 = await p.evaluate(() => window.__vib);
            for (const d of seq) {
                await p.touchscreen.tap(...pos[d]);
                if (gap) await p.waitForTimeout(gap);
            }
            await p.waitForTimeout(400);
            const v = await val(), digits = v.replace(/\D/g, '').replace(/^0+/, '');
            const vib = (await p.evaluate(() => window.__vib)) - v0;
            ok(`${label}`, digits === seq.replace(/^0+/, '').slice(0, 11), `${seq} → ${v}`);
            ok(`vibrou a cada toque (${label})`, vib === seq.length, `${vib} vibrações`);
        }
        await zerar();
        for (const d of '50') await p.touchscreen.tap(...pos[d]);
        await p.getByRole('button', { name: 'Dois zeros' }).tap();
        await p.waitForTimeout(250);
        ok('tecla 00 (50 + 00 = R$ 50,00)', (await val()) === 'R$ 50,00', await val());
        await p.getByRole('button', { name: 'Apagar' }).tap();
        await p.waitForTimeout(250);
        ok('apagar', (await val()) === 'R$ 5,00', await val());
        const done = await p.locator('.keypad-done .k-done').boundingBox();
        ok('✓ centralizado embaixo', Math.abs(done.x + done.width / 2 - 195) < 4, `centro x=${Math.round(done.x + done.width / 2)}`);
        await p.screenshot({ path: `${OUT}/teclado.png` });
        await p.locator('.keypad-done .k-done').tap();
        await p.waitForTimeout(300);
        ok('✓ fecha o teclado', (await p.locator('.keypad').count()) === 0);
        ok('sem zoom de toque duplo', (await p.evaluate(() => visualViewport.scale)) === 1);
    } catch (e) {
        console.log('💥 ' + e.message.split('\n')[0]);
    }
    await b.close();
})();
