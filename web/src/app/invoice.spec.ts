// Rodar: node --test web/src/app/invoice.spec.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceClosing, invoiceStatus } from './invoice.ts';

test('fechamento: vencimento no mês seguinte, no mesmo mês e fim de fevereiro', () => {
  assert.equal(invoiceClosing('2026-11-07', 30, 7), '2026-10-30');
  assert.equal(invoiceClosing('2026-11-10', 3, 10), '2026-11-03');
  assert.equal(invoiceClosing('2026-03-10', 31, 10), '2026-02-28');
  assert.equal(invoiceClosing('2027-01-05', 28, 5), '2026-12-28');
});

test('situação ao longo do ciclo (fecha 30, vence 7)', () => {
  const s = (today: string) => invoiceStatus('2026-11-07', 30, 7, today).text;
  assert.equal(s('2026-10-27'), 'fecha em 3 dias');
  assert.equal(s('2026-10-29'), 'fecha amanhã');
  assert.equal(s('2026-10-30'), 'fecha hoje');
  assert.equal(s('2026-11-02'), 'fechada · vence em 5 dias');
  assert.equal(s('2026-11-06'), 'vence amanhã');
  assert.equal(s('2026-11-07'), 'vence hoje');
  assert.equal(s('2026-11-08'), 'vencida há 1 dia');
  assert.equal(invoiceStatus('2026-11-07', 30, 7, '2026-11-12').tone, 'late');
});
