// Conversão Pluggy -> lançamento do grana. Sem dependências: roda no Deno e no Node (teste).
export interface PluggyTx {
  id: string; description: string; descriptionRaw?: string | null; amount: number; date: string;
  type: 'DEBIT' | 'CREDIT'; status?: 'POSTED' | 'PENDING'; category?: string | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
  creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null } | null;
}
export interface Row {
  user_id: string; ext_id: string; source: 'openfinance'; description: string; amount: number; date: string; paid: true;
  account_id: string | null; card_id: string | null; pays_card_id: string | null; invoice_date: string | null;
  category_id: string | null; installment: number | null; installments: number | null; _pluggyCategory: string | null;
}

const FATURA = /pagamento.*fatura|pagto.*cart|pag.*cart[aã]o|fatura.*cart|pgto fatura|pagamento recebido|pagamento efetuado/i;
const brDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function toRow(t: PluggyTx, ctx: {
  user_id: string; account_id: string | null; card_id: string | null; paysCard: string | null; invoices: { invoice_date: string }[];
}): Row | null {
  if (t.status === 'PENDING') return null;
  const cents = Math.round(Math.abs(t.amount) * 100);
  if (!cents) return null;
  const amount = t.type === 'CREDIT' ? cents : -cents;
  const desc = (t.merchant?.businessName || t.merchant?.name || t.description || t.descriptionRaw || 'Lançamento').trim().slice(0, 120);
  const date = brDate(t.date);
  // no cartão, "pagamento recebido" é a quitação da fatura: o lado da conta já registra
  if (ctx.card_id && t.type === 'CREDIT' && FATURA.test(t.description)) return null;
  // na conta, pagamento de fatura vira pagamento do cartão (não conta como gasto em dobro)
  let pays: string | null = null, invoice_date: string | null = null;
  if (ctx.account_id && t.type === 'DEBIT' && ctx.paysCard && FATURA.test(t.description)) {
    const near = ctx.invoices.map((i) => ({ d: i.invoice_date, diff: (Date.parse(i.invoice_date) - Date.parse(date)) / 864e5 }))
      .filter((x) => x.diff >= -20 && x.diff <= 40).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
    if (near) { pays = ctx.paysCard; invoice_date = near.d; }
  }
  const inst = t.creditCardMetadata?.totalInstallments && t.creditCardMetadata.totalInstallments > 1 ? t.creditCardMetadata : null;
  return {
    user_id: ctx.user_id, ext_id: `pluggy:${t.id}`, source: 'openfinance', description: desc, amount, date, paid: true,
    account_id: ctx.account_id, card_id: ctx.card_id, pays_card_id: pays, invoice_date,
    category_id: null, installment: inst?.installmentNumber ?? null, installments: inst?.totalInstallments ?? null,
    _pluggyCategory: t.category ?? null,
  };
}

/** Junta com lançamentos já existentes (notificação/manual): mesmo valor, até 2 dias de diferença, sem ext_id. */
export function reconcile<R extends { amount: number; date: string; ext_id: string }>(
  rows: R[], existing: { id: string; amount: number; date: string; ext_id: string | null }[],
) {
  const known = new Set(existing.map((e) => e.ext_id).filter(Boolean));
  const free = existing.filter((e) => !e.ext_id);
  const merges: { id: string; ext_id: string }[] = [];
  const inserts: R[] = [];
  for (const r of rows) {
    if (known.has(r.ext_id)) continue; // já sincronizado antes
    const i = free.findIndex((e) => e.amount === r.amount && Math.abs(Date.parse(e.date) - Date.parse(r.date)) <= 2 * 864e5);
    if (i >= 0) { merges.push({ id: free[i].id, ext_id: r.ext_id }); free.splice(i, 1); }
    else inserts.push(r);
  }
  return { merges, inserts };
}

// Categorias da Pluggy (em inglês) -> nomes das categorias padrão do grana
const CAT: [RegExp, string][] = [
  [/groceries|supermarket/i, 'Mercado'], [/restaurant|food delivery|bars/i, 'Bares e restaurantes'], [/food|eating/i, 'Alimentação'],
  [/taxi|ride|transport|gas station|fuel|parking|toll|public transport|airport/i, 'Transporte'], [/travel|accommodation|hotel|flight/i, 'Viagem'],
  [/health|pharmacy|hospital|doctor|dental/i, 'Saúde'], [/education|school|course|book/i, 'Educação'],
  [/streaming|subscription|telecom|internet|mobile|services/i, 'Assinaturas e serviços'], [/rent|housing|electricity|water|utilities|home/i, 'Casa'],
  [/clothing|apparel/i, 'Roupas'], [/shopping|online shopping|electronics|retail/i, 'Compras'], [/leisure|entertainment|gaming|cinema|sports/i, 'Lazer e hobbies'],
  [/pet/i, 'Pets'], [/tax|fee|interest|iof|bank fees/i, 'Impostos e Taxas'], [/gift|donation/i, 'Presentes e doações'],
  [/investment/i, 'Investimentos'], [/loan|financing/i, 'Dívidas e empréstimos'], [/salary|payroll|wage/i, 'Salário'],
];
export function mapCategory(pluggy: string | null, kind: 'expense' | 'income', cats: { id: string; name: string; kind: string }[]): string | null {
  if (!pluggy) return null;
  const name = CAT.find(([re]) => re.test(pluggy))?.[1];
  return cats.find((c) => c.kind === kind && c.name === name)?.id ?? null;
}
