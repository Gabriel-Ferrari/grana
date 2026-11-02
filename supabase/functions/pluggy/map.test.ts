// Rodar: node --test supabase/functions/pluggy/map.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCategory, reconcile, toRow, type PluggyTx } from './map.ts';

const ctxCard = { user_id: 'u', account_id: null, card_id: 'card', paysCard: null, invoices: [] };
const ctxAcc = { user_id: 'u', account_id: 'acc', card_id: null, paysCard: 'card', invoices: [{ invoice_date: '2026-11-05' }, { invoice_date: '2026-12-05' }] };
const tx = (o: Partial<PluggyTx>): PluggyTx => ({ id: 't1', description: 'X', amount: 10, date: '2026-11-02T15:00:00.000Z', type: 'DEBIT', status: 'POSTED', ...o });

test('compra no cartão vira despesa com parcela e data no fuso BR', () => {
  const r = toRow(tx({ id: 'a', description: 'MERCADAO ATACAD', amount: 96.16, date: '2026-10-24T02:00:00.000Z',
    creditCardMetadata: { installmentNumber: 2, totalInstallments: 4 } }), ctxCard)!;
  assert.equal(r.amount, -9616);
  assert.equal(r.date, '2026-10-23'); // 02h UTC = 23h do dia anterior em Brasília
  assert.equal(r.ext_id, 'pluggy:a');
  assert.deepEqual([r.installment, r.installments], [2, 4]);
});

test('pendente é ignorado; pagamento recebido no cartão é ignorado', () => {
  assert.equal(toRow(tx({ status: 'PENDING' }), ctxCard), null);
  assert.equal(toRow(tx({ type: 'CREDIT', description: 'Pagamento recebido' }), ctxCard), null);
  assert.ok(toRow(tx({ type: 'CREDIT', description: 'Estorno loja' }), ctxCard)!.amount > 0);
});

test('pagamento de fatura na conta liga ao cartão e à fatura mais próxima', () => {
  const r = toRow(tx({ description: 'PAGTO CARTAO CREDITO', amount: -1454.49, date: '2026-11-04T13:00:00.000Z' }), ctxAcc)!;
  assert.equal(r.pays_card_id, 'card');
  assert.equal(r.invoice_date, '2026-11-05');
  assert.equal(r.amount, -145449);
});

test('reconcilia com lançamento de notificação (mesmo valor, ±2 dias)', () => {
  const rows = [
    { ext_id: 'pluggy:1', amount: -4590, date: '2026-11-03' },
    { ext_id: 'pluggy:2', amount: -1000, date: '2026-11-03' },
    { ext_id: 'pluggy:3', amount: -500, date: '2026-11-03' },
  ];
  const existing = [
    { id: 'n1', amount: -4590, date: '2026-11-02', ext_id: null },      // veio da notificação
    { id: 'old', amount: -500, date: '2026-11-03', ext_id: 'pluggy:3' }, // já sincronizado
  ];
  const { merges, inserts } = reconcile(rows, existing);
  assert.deepEqual(merges, [{ id: 'n1', ext_id: 'pluggy:1' }]);
  assert.deepEqual(inserts.map((r) => r.ext_id), ['pluggy:2']);
});

test('não duplica o que veio do import do Organizze', () => {
  const rows = [{ ext_id: 'pluggy:9', amount: -6500, date: '2026-10-31' }, { ext_id: 'pluggy:10', amount: -4000, date: '2026-10-31' }];
  const existing = [{ id: 'o1', amount: -6500, date: '2026-10-30', ext_id: 'org:tx:123' }];
  const { merges, inserts, skipped } = reconcile(rows, existing);
  assert.deepEqual(merges, []);
  assert.equal(skipped, 1);
  assert.deepEqual(inserts.map((r) => r.ext_id), ['pluggy:10']);
});

test('baixa automática da poupança vira transferência (não é receita)', () => {
  const r = toRow(tx({ id: 'p1', type: 'CREDIT', amount: 1349.69, description: 'BAIXA AUTOMAT POUPANCA* - DO' }), ctxAcc)!;
  assert.ok(r.transfer_id);
  assert.equal(r.transfer_id, toRow(tx({ id: 'p1', type: 'CREDIT', amount: 1349.69, description: 'BAIXA AUTOMAT POUPANCA* - DO' }), ctxAcc)!.transfer_id);
  assert.equal(toRow(tx({ id: 'p2', description: 'LELLO CONDOMINIOS LTDA', amount: -1349.69 }), ctxAcc)!.transfer_id, null);
  assert.ok(toRow(tx({ id: 'p3', description: 'BAIXA AUTOM C CORRENTE* - DOCTO: 528432', amount: -50 }), ctxAcc)!.transfer_id);
  assert.equal(toRow(tx({ id: 'p4', type: 'CREDIT', description: 'PIX RECEBIDO - REM  JULIA', amount: 10 }), ctxAcc)!.transfer_id, null);
});

test('corrente + poupança na mesma conta: baixa automática não lança; o resto lança', () => {
  const ctx = { ...ctxAcc, skipInternal: true };
  assert.equal(toRow(tx({ id: 'q1', type: 'CREDIT', amount: 50, description: 'BAIXA AUTOMAT POUPANCA* - DOCTO: 528432' }), ctx), null);
  assert.equal(toRow(tx({ id: 'q2', amount: -50, description: 'BAIXA AUTOM C CORRENTE* - DOCTO: 528432' }), ctx), null);
  assert.ok(toRow(tx({ id: 'q3', type: 'CREDIT', amount: 1349.69, description: 'PIX RECEBIDO - REM  JULIA' }), ctx));
});

test('categoria da Pluggy -> categoria do grana', () => {
  const cats = [{ id: 'c1', name: 'Mercado', kind: 'expense' }, { id: 'c2', name: 'Salário', kind: 'income' }];
  assert.equal(mapCategory('Groceries', 'expense', cats), 'c1');
  assert.equal(mapCategory('Salary', 'income', cats), 'c2');
  assert.equal(mapCategory('Unknown thing', 'expense', cats), null);
});
