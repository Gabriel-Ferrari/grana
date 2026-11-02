// Rodar: node --test web/src/app/recurring.spec.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring, normDesc, type RecTx } from './recurring.ts';

let n = 0;
const tx = (description: string, amount: number, date: string): RecTx => ({
    id: String(n++),
    description,
    amount,
    date,
    category_id: null,
});

test('normaliza parcela, caixa e acento', () => {
    assert.equal(normDesc('Imposto de renda 6/8'), normDesc('IMPOSTO DE RENDA  7/8'));
    assert.equal(normDesc('Condomínio '), 'condominio');
});

test('acha assinatura e conta fixa; ignora gasto frequente, antigo e avulso', () => {
    const rows = [
        ...['2026-06-10', '2026-07-10', '2026-08-11', '2026-09-10', '2026-10-10'].map((d) => tx('NETFLIX.COM', -5590, d)),
        ...['2026-08-08', '2026-09-08', '2026-10-08'].map((d, i) => tx('Condomínio', -(154369 + i * 30000), d)),
        ...['2026-08-02', '2026-08-15', '2026-09-03', '2026-09-20', '2026-10-05', '2026-10-21'].map((d) => tx('Mercado', -30000, d)),
        ...['2026-04-01', '2026-05-01', '2026-06-01'].map((d) => tx('Academia velha', -9990, d)),
        tx('Presente', -20000, '2026-10-12'),
        ...[
            ['2026-07-04', -2552],
            ['2026-08-04', -3127],
            ['2026-09-12', -2320],
            ['2026-10-21', -4442],
        ].map(([d, v]) => tx('Uber', v as number, d as string)),
    ];
    const r = detectRecurring(rows, '2026-11-02');
    assert.deepEqual(
        r.map((x) => x.key),
        ['condominio', 'netflix com'],
    );
    const nf = r.find((x) => x.key === 'netflix com')!;
    assert.equal(nf.amount, 5590);
    assert.equal(nf.stable, true);
    assert.equal(nf.next, '2026-11-10');
    assert.equal(r.find((x) => x.key === 'condominio')!.stable, false);
});

test('próxima cobrança: se já caiu neste mês, vai para o mês seguinte', () => {
    const rows = ['2026-09-01', '2026-10-01', '2026-11-01'].map((d) => tx('Spotify', -2190, d));
    assert.equal(detectRecurring(rows, '2026-11-02')[0].next, '2026-12-01');
});
