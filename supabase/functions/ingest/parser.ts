// Parser de notificações bancárias. Sem dependências: roda no Deno (Edge Function) e no Node (teste).
// Estratégia igual à observada no Organizze (NLService + catálogo zv2): normaliza texto
// (sem acento, sem CNPJ), descarta ruído, acha valor, decide tipo, extrai estabelecimento.
// ponytail: regex genéricas; formato novo de banco que não casar cai na caixa de entrada (texto cru salvo).

export type Kind = 'card' | 'expense' | 'income';
export interface Parsed {
    kind: Kind;
    amount: number;
    merchant: string;
    last4?: string;
    date: string;
}

const IGNORE =
    /(recusad|negad|nao autorizad|cancelad|bloquead|saldo disponivel|seu saldo|desconto|promoc|cashback|vem conferir|aproveite|rendimento|boas noticias|fatura (fechou|fechada|disponivel|vence|esta)|pagamento (da|de) fatura|fatura paga|limite (disponivel|aumentou|ajustado)|codigo|senha|token|agendad|caixinha|cofrinho)/i;
const INCOME = /(recebeu|recebid[oa]|recebimento|credito em conta|deposito|estorno|devolvemos|reembolso)/i;
const EXPENSE = /(pix|transferencia|\bted\b|\bdoc\b|pagamento|pagou|enviou|enviad|saque|debito|boleto)/i;
const CARD = /(compra|aprovad|cartao)/i;

const END = String.raw`(?=\s+(?:para o cartao|no cartao|com o cartao|com cartao|no valor|valor|cpf|chave|em \d)|[,;]|\.(?:\s|$)|$)`;
const MERCHANT: Record<Kind, RegExp[]> = {
    card: [
        new RegExp(String.raw`aprovad[ao] em (?!\d)(.+?)` + END, 'i'),
        new RegExp(String.raw`(?:no estabelecimento|estab\.?|local:)\s*(.+?)` + END, 'i'),
        /\d{2}:\d{2}\s+(?!em\b)(.+?)\.?$/i,
        new RegExp(
            String.raw`compra (?:aprovada )?(?:de R\$\s*[\d.,]+ )?(?:no|na|em)\s+(?!\d|debito|credito|cartao|valor)(.+?)` + END,
            'i',
        ),
    ],
    income: [new RegExp(String.raw`R\$\s*[\d.,]+\s+de\s+(.+?)` + END, 'i'), new RegExp(String.raw`\bde\s+(?!R\$)(.+?)` + END, 'i')],
    expense: [
        new RegExp(String.raw`\b(?:para|pra)\s+(.+?)` + END, 'i'),
        new RegExp(String.raw`(?:no estabelecimento|\bem)\s+(?!\d)(.+?)` + END, 'i'),
    ],
};

export function normalize(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}[-.]\d{2}\b/g, '') // CNPJ
        .replace(/R¤|\bRS(?=\s*\d)/g, 'R$')
        .replace(/\s+/g, ' ')
        .trim();
}

function cents(v: string): number {
    return Math.round(parseFloat(v.replace(/\./g, '').replace(',', '.')) * 100);
}

function brDate(ms: number): string {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function parse(raw: string, postedAt: number): Parsed | null {
    const t = normalize(raw);
    if (IGNORE.test(t)) return null;

    const m = t.match(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i) ?? t.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/);
    if (!m) return null;
    const amount = cents(m[1]);
    if (!amount) return null;

    const kind: Kind | null = INCOME.test(t)
        ? 'income'
        : /debito/i.test(t) && /compra/i.test(t)
          ? 'expense'
          : CARD.test(t)
            ? 'card'
            : EXPENSE.test(t)
              ? 'expense'
              : null;
    if (!kind) return null;

    let merchant = '';
    for (const re of MERCHANT[kind]) {
        const mm = t.match(re);
        if (mm?.[1]?.trim()) {
            merchant = mm[1].trim();
            break;
        }
    }
    merchant = merchant
        .replace(/\s*R\$\s*[\d.,]+/g, '')
        .replace(/[.\s]+$/, '')
        .slice(0, 60);

    let date = brDate(postedAt);
    const d = t.match(/\b(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/);
    if (d && +d[1] >= 1 && +d[1] <= 31 && +d[2] >= 1 && +d[2] <= 12) {
        const y = d[3] ? (d[3].length === 2 ? '20' + d[3] : d[3]) : date.slice(0, 4);
        date = `${y}-${d[2]}-${d[1]}`;
    }

    const last4 = t.match(/final\s*(\d{4})/i)?.[1];
    return { kind, amount, merchant, date, ...(last4 ? { last4 } : {}) };
}
