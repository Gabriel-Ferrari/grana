// Rodar: node --test supabase/functions/ingest/parser.test.ts
// Amostras plausíveis por banco. Quando chegar notificação real que não casar, copie o texto da
// caixa de entrada do app pra cá e ajuste o parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './parser.ts';

const at = Date.parse('2026-10-31T17:00:00Z');
const cases: [string, ReturnType<typeof parse>][] = [
    [
        'Compra de R$ 45,90 APROVADA em IFOOD *IFOOD para o cartão com final 1234.',
        { kind: 'card', amount: 4590, merchant: 'IFOOD *IFOOD', last4: '1234', date: '2026-10-31' },
    ],
    [
        'BRADESCO CARTOES: COMPRA APROVADA NO CARTAO FINAL 5678 DE R$ 65,00 EM 31/10/2026 14:34 THE CAPTAINS BA.',
        { kind: 'card', amount: 6500, merchant: 'THE CAPTAINS BA', last4: '5678', date: '2026-10-31' },
    ],
    [
        'Sicoobcard informa: compra aprovada no valor de R$ 1.209,30 no estabelecimento STEAMGAMES.COM em 24/10 às 10:20, cartão final 9999.',
        { kind: 'card', amount: 120930, merchant: 'STEAMGAMES.COM', last4: '9999', date: '2026-10-24' },
    ],
    [
        'Transferência recebida\nVocê recebeu uma transferência de R$ 2.295,26 de EMPRESA XPTO LTDA.',
        { kind: 'income', amount: 229526, merchant: 'EMPRESA XPTO LTDA', date: '2026-10-31' },
    ],
    [
        'Você recebeu um Pix de R$ 100,00 de MARIA SOUZA, CPF ***.123.456-**',
        { kind: 'income', amount: 10000, merchant: 'MARIA SOUZA', date: '2026-10-31' },
    ],
    [
        'Pix enviado\nVocê enviou um Pix de R$ 33,00 para JOAO DA SILVA.',
        { kind: 'expense', amount: 3300, merchant: 'JOAO DA SILVA', date: '2026-10-31' },
    ],
    [
        'CAIXA: Compra no débito de R$ 50,00 em POSTO SHELL 12.345.678/0001-90',
        { kind: 'expense', amount: 5000, merchant: 'POSTO SHELL', date: '2026-10-31' },
    ],
    ['Compra de R$ 900,00 recusada em LOJA X', null],
    ['Aproveite 10% de desconto no seu próximo Pix de R$ 10,00', null],
    ['Sua fatura fechou! Valor R$ 1.771,21', null],
    ['Seu código de segurança é 123456', null],
];

for (const [text, expected] of cases) {
    test(text.slice(0, 50), () => assert.deepEqual(parse(text, at), expected));
}
