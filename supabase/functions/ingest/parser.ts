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
    /** estorno no cartão de crédito: volta na fatura (valor positivo no cartão), não entra na conta */
    refund?: true;
    /** compra parcelada no cartão ("APROVADA em 12 X em LOJA"): amount é o total */
    installments?: number;
}

const IGNORE =
    /(recusad|negad|nao autorizad|cancelad|bloquead|saldo disponivel|seu saldo|desconto|promoc|cashback|vem conferir|aproveite|rendimento|boas noticias|fatura (fechou|fechada|disponivel|vence|esta)|pagamento (da|de) fatura|fatura paga|limite (disponivel|aumentou|ajustado)|codigo|senha|token|agendad|caixinha|cofrinho)/i;
const INCOME = /(recebeu|recebid[oa]|recebimento|credito em conta|deposito|estorno|devolvemos|reembolso)/i;
const EXPENSE = /(pix|transferencia|\bted\b|\bdoc\b|pagamento|pagou|enviou|enviad|saque|debito|boleto)/i;
const CARD = /(compra|aprovad|cartao)/i;

const END = String.raw`(?=\s+(?:para o cartao|no cartao|com o cartao|com cartao|no valor|valor|cpf|chave|em \d)|[,;]|\.(?:\s|$)|$)`;
const MERCHANT: Record<Kind, RegExp[]> = {
    card: [
        new RegExp(String.raw`aprovad[ao] em (?!\d{1,2}\/)(.+?)` + END, 'i'),
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

/** Notificação que não vira lançamento e nem precisa de revisão: compra negada ou aviso do banco (promo, saldo, código…). */
export function ignoredReason(raw: string): string | null {
    const t = normalize(raw);
    if (/(recusad|negad|nao autorizad|nao aprovad)/i.test(t)) return 'compra negada';
    if (/cancelad|bloquead/i.test(t)) return 'cancelada ou bloqueada';
    return IGNORE.test(t) ? 'aviso do banco' : null;
}

export function parse(raw: string, postedAt: number): Parsed | null {
    let t = normalize(raw);
    if (IGNORE.test(t)) return null;
    // Bradesco: "APROVADA em 12 X em AMAZON BR"; sai do texto para não virar o estabelecimento
    const inst = t.match(/\s+em (\d{1,2}) ?x\b/i);
    if (inst) t = t.replace(inst[0], '');

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
        // sem ano: "31/12" numa notificação de 01/01 é do ano anterior
        if (!d[3] && date > brDate(postedAt + 2 * 864e5)) date = `${+y - 1}-${d[2]}-${d[1]}`;
    }

    const last4 = t.match(/final\s*(\d{4})/i)?.[1];
    const refund = kind === 'income' && !!last4 && /estorno|devolvemos|reembolso/i.test(t) && !/debito/i.test(t);
    const n = kind === 'card' && inst ? +inst[1] : 0;
    return {
        kind,
        amount,
        merchant,
        date,
        ...(last4 ? { last4 } : {}),
        ...(refund ? { refund: true as const } : {}),
        ...(n > 1 ? { installments: n } : {}),
    };
}

/** Uma linha por mês da compra parcelada; a 1ª leva os centavos que sobram (como o banco manda pela Open Finance). */
export function split(p: Pick<Parsed, 'amount' | 'date' | 'installments'>) {
    const n = p.installments ?? 1,
        per = Math.floor(p.amount / n);
    return Array.from({ length: n }, (_, i) => ({
        amount: i ? per : p.amount - per * (n - 1),
        date: addMonths(p.date, i),
        installment: n > 1 ? i + 1 : null,
        installments: n > 1 ? n : null,
    }));
}

/** mesma regra do app (core/format.ts): 31/01 + 1 mês = 28/02 */
function addMonths(iso: string, n: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, last));
    return first.toISOString().slice(0, 10);
}
