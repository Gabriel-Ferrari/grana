#!/usr/bin/env node
// Importa contas, cartões, categorias, faturas e lançamentos do Organizze (API pública v2) para o Grana.
// Idempotente: usa ext_id ("org:...") e upsert, pode rodar de novo para sincronizar.
//
// Uso:
//   ORGANIZZE_EMAIL=voce@gmail.com ORGANIZZE_TOKEN=... \      # token em app.organizze.com.br/configuracoes/api-keys
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... GRANA_EMAIL=voce@gmail.com \
//   node scripts/import-organizze.mjs [AAAA-MM inicial, padrão 2018-01]
//
// GRANA_EMAIL = e-mail com que você já entrou no Grana (precisa ter logado uma vez).
// Sem dependências (Node 18+).
import { createHash } from 'node:crypto';

const { ORGANIZZE_EMAIL, ORGANIZZE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GRANA_EMAIL } = process.env;
if (!ORGANIZZE_EMAIL || !ORGANIZZE_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GRANA_EMAIL) {
    console.error('Faltam variáveis de ambiente (veja o cabeçalho do script).');
    process.exit(1);
}
const START = process.argv[2] ?? '2018-01';

const org = async (path, attempt = 1) => {
    const r = await fetch((process.env.ORGANIZZE_API ?? 'https://api.organizze.com.br/rest/v2') + path, {
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${ORGANIZZE_EMAIL}:${ORGANIZZE_TOKEN}`).toString('base64'),
            'User-Agent': `grana-import (${ORGANIZZE_EMAIL})`,
        },
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
        // limite de taxa / instabilidade: espera e tenta de novo
        await new Promise((ok) => setTimeout(ok, 2000 * attempt));
        return org(path, attempt + 1);
    }
    if (!r.ok) throw new Error(`Organizze ${path}: ${r.status} ${await r.text()}`);
    return r.json();
};
const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
};
const db = async (method, path, body, prefer = 'return=representation') => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: { ...sbHeaders, Prefer: prefer },
        body: body && JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase ${method} ${path}: ${r.status} ${await r.text()}`);
    return r.status === 204 ? null : r.json();
};
const upsert = (table, rows) =>
    rows.length ? db('POST', `${table}?on_conflict=user_id,ext_id`, rows, 'resolution=merge-duplicates,return=representation') : [];
const uuidFrom = (s) => {
    const h = createHash('md5').update(s).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const lastDay = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
const nextMonth = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)).toISOString().slice(0, 7);

// usuário do Grana
const users = await (await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: sbHeaders })).json();
const user = users.users?.find((u) => u.email?.toLowerCase() === GRANA_EMAIL.toLowerCase());
if (!user) throw new Error(`Usuário ${GRANA_EMAIL} não encontrado no Grana. Entre no app uma vez antes.`);
const user_id = user.id;

// 1. lançamentos (precisamos deles para saber se cada categoria é de receita ou despesa)
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7); // 13 meses à frente (parcelas futuras)
const txs = [];
for (let ym = START; ym < end; ym = nextMonth(ym)) {
    txs.push(...(await org(`/transactions?start_date=${ym}-01&end_date=${lastDay(ym)}`)));
    process.stdout.write(`\rlançamentos ${ym}: ${txs.length}`);
}
console.log();

// 2. contas
const accounts = await org('/accounts');
const accRows = await upsert(
    'accounts',
    accounts.map((a) => ({
        user_id,
        name: a.name,
        archived: !!a.archived,
        ext_id: `org:acc:${a.id}`,
        kind: a.type === 'savings' ? 'savings' : a.type === 'checking' ? 'checking' : 'other',
    })),
);
const accId = new Map(accRows.map((r) => [r.ext_id, r.id]));

// 3. cartões + faturas (id da fatura -> data de vencimento)
const cards = await org('/credit_cards');
const cardRows = await upsert(
    'cards',
    cards.map((c) => ({
        user_id,
        name: c.name,
        archived: !!c.archived,
        ext_id: `org:card:${c.id}`,
        limit_cents: c.limit_cents ?? 0,
        closing_day: c.closing_day,
        due_day: c.due_day,
    })),
);
const cardId = new Map(cardRows.map((r) => [r.ext_id, r.id]));
// ATENÇÃO: o id de fatura do Organizze é sequencial POR CARTÃO (Bradesco, Sicoob e Nubank têm "fatura 322"),
// então a chave precisa ser cartão + fatura.
const invoiceDate = new Map();
const invKey = (cardId, invoiceId) => `${cardId}:${invoiceId}`;
for (const c of cards) {
    for (let y = +START.slice(0, 4); y <= new Date().getFullYear() + 1; y++) {
        for (const i of await org(`/credit_cards/${c.id}/invoices?start_date=${y}-01-01&end_date=${y}-12-31`))
            invoiceDate.set(invKey(c.id, i.id), i.date);
    }
}

// 4. categorias: tipo pelo sinal predominante dos lançamentos; casa com as padrão pelo nome
const sign = new Map();
for (const t of txs) if (t.category_id) sign.set(t.category_id, (sign.get(t.category_id) ?? 0) + Math.sign(t.amount_cents));
const orgCats = await org('/categories');
const kindOf = (c) => ((sign.get(c.id) ?? 0) > 0 ? 'income' : 'expense');
const existing = await db('GET', `categories?user_id=eq.${user_id}&select=id,name,kind,ext_id`);
const catId = new Map();
for (const c of orgCats.sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0))) {
    const ext_id = `org:cat:${c.id}`;
    const kind = c.parent_id ? kindOf(orgCats.find((p) => p.id === c.parent_id) ?? c) : kindOf(c);
    const row = {
        color: '#' + (c.color ?? 'b3b3b3').replace('#', ''),
        parent_id: c.parent_id ? (catId.get(c.parent_id) ?? null) : null,
        ext_id,
    };
    const same =
        existing.find((e) => e.ext_id === ext_id) ??
        existing.find((e) => !e.ext_id && e.kind === kind && e.name.toLowerCase() === c.name.toLowerCase());
    const [saved] = same
        ? await db('PATCH', `categories?id=eq.${same.id}`, row)
        : await db('POST', 'categories', { ...row, user_id, name: c.name, kind });
    if (same) same.ext_id = ext_id;
    catId.set(c.id, saved.id);
}

// 5. lançamentos
const rows = txs.map((t) => {
    const card = t.credit_card_id ? cardId.get(`org:card:${t.credit_card_id}`) : null;
    const paysCard = t.paid_credit_card_id ? cardId.get(`org:card:${t.paid_credit_card_id}`) : null;
    return {
        user_id,
        ext_id: `org:tx:${t.id}`,
        source: 'import',
        // hora real de criação no Organizze: a lista ordena o dia por ela (último lançado primeiro)
        created_at: t.created_at,
        description: t.description || '(sem descrição)',
        amount: t.amount_cents,
        date: t.date,
        paid: !!t.paid,
        card_id: card ?? null,
        account_id: card ? null : (accId.get(`org:acc:${t.account_id}`) ?? null),
        invoice_date: card
            ? (invoiceDate.get(invKey(t.credit_card_id, t.credit_card_invoice_id)) ?? null)
            : paysCard
              ? (invoiceDate.get(invKey(t.paid_credit_card_id, t.paid_credit_card_invoice_id)) ?? null)
              : null,
        pays_card_id: paysCard ?? null,
        category_id: t.category_id ? (catId.get(t.category_id) ?? null) : null,
        transfer_id: t.oposite_transaction_id ? uuidFrom(`org:transfer:${Math.min(t.id, t.oposite_transaction_id)}`) : null,
        installment: t.total_installments > 1 ? t.installment : null,
        installments: t.total_installments > 1 ? t.total_installments : null,
        recurring: !!t.recurring,
        tags: (t.tags ?? []).map((g) => (typeof g === 'string' ? g : g.name)).filter(Boolean),
        notes: t.notes || null,
    };
});
const orphans = rows.filter((r) => !r.card_id && !r.account_id);
if (orphans.length)
    console.warn(
        `${orphans.length} lançamentos sem conta/cartão conhecidos foram ignorados:`,
        orphans.slice(0, 5).map((r) => r.description),
    );
const valid = rows.filter((r) => r.card_id || r.account_id);
for (let i = 0; i < valid.length; i += 500) {
    await upsert('transactions', valid.slice(i, i + 500));
    process.stdout.write(`\rgravados ${Math.min(i + 500, valid.length)}/${valid.length}`);
}
// 6. Pagamentos de fatura lançados no Organizze como despesa comum ("Pagamento de fatura - Nubank - Dezembro de 2022"):
// liga ao cartão citado e à fatura com vencimento mais próximo. Sem isso contam como gasto duas vezes
// e a fatura fica "não paga". Cartão que não existe mais (ex.: Rappi) fica como despesa: é o único registro do gasto.
const invs = cardRows.length
    ? await db('GET', `invoices?select=card_id,invoice_date,total,paid&card_id=in.(${cardRows.map((r) => r.id)})`)
    : [];
const loose = await db(
    'GET',
    `transactions?user_id=eq.${user_id}&pays_card_id=is.null&account_id=not.is.null&amount=lt.0&description=ilike.*fatura*&select=id,description,date`,
);
let linked = 0;
for (const t of loose) {
    const card = cardRows.find((c) => t.description.toLowerCase().includes(c.name.trim().toLowerCase()));
    if (!card) continue;
    // só fatura ainda em aberto: se o Organizze já a considera paga, o lançamento é outra coisa (fica como despesa)
    const near = invs
        .filter((i) => i.card_id === card.id && i.paid < i.total)
        .map((i) => ({ i, d: (Date.parse(i.invoice_date) - Date.parse(t.date)) / 864e5 }))
        .filter((x) => x.d >= -20 && x.d <= 40)
        .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    if (!near) continue;
    await db('PATCH', `transactions?id=eq.${t.id}`, { pays_card_id: card.id, invoice_date: near.i.invoice_date }, 'return=minimal');
    near.i.paid += 1; // ponytail: marca como tocada; precisão real vem do recálculo da view
    linked++;
}
console.log(`\n${linked} pagamentos de fatura avulsos ligados aos cartões.`);
console.log(`OK: ${accounts.length} contas, ${cards.length} cartões, ${orgCats.length} categorias, ${valid.length} lançamentos.`);
console.log('Confira os saldos das contas no app; se divergir, ajuste o "saldo inicial" da conta em Ajustes.');
