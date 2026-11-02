// POST /functions/v1/pluggy  (JWT do usuário, ou service_role pelo cron)
//   { action: 'connect-token' }      -> { accessToken }  (abre o widget Pluggy Connect no app)
//   { action: 'sync', all?: true }   -> sincroniza contas e transações (all = todos os usuários; só service_role)
// Segredos: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET (supabase secrets set).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapCategory, reconcile, toRow, type PluggyTx } from './map.ts';

const PLUGGY = 'https://api.pluggy.ai';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function pluggyKey(): Promise<string> {
  const r = await fetch(`${PLUGGY}/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: Deno.env.get('PLUGGY_CLIENT_ID'), clientSecret: Deno.env.get('PLUGGY_CLIENT_SECRET') }),
  });
  if (!r.ok) throw new Error(`Pluggy auth ${r.status}`);
  return (await r.json()).apiKey;
}
const pget = async (key: string, path: string) => {
  const r = await fetch(PLUGGY + path, { headers: { 'X-API-KEY': key } });
  if (!r.ok) throw new Error(`Pluggy ${path.split('?')[0]} ${r.status}`);
  return r.json();
};
const brDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function syncUser(user_id: string, key: string) {
  const out = { items: 0, accounts: 0, inserted: 0, merged: 0, skipped: 0, errors: [] as string[] };
  const { data: items } = await db.from('pluggy_items').select('*').eq('user_id', user_id);
  const { data: cats } = await db.from('categories').select('id, name, kind').eq('user_id', user_id);

  for (const it of items ?? []) {
    out.items++;
    try {
      const item = await pget(key, `/items/${it.id}`);
      await db.from('pluggy_items').update({ status: item.status, connector: item.connector?.name ?? it.connector, error: item.error?.message ?? null }).eq('id', it.id);

      const { results: accs } = await pget(key, `/accounts?itemId=${it.id}`);
      for (const a of accs) {
        // insere conta nova sem mapear; mantém o mapa (account_id/card_id/ignored) das existentes
        await db.from('pluggy_accounts').upsert({
          id: a.id, user_id, item_id: it.id, name: a.marketingName || a.name, type: a.type, subtype: a.subtype,
          number: a.number, balance: Math.round((a.balance ?? 0) * 100),
        }, { onConflict: 'id' });
      }
      const { data: mapped } = await db.from('pluggy_accounts').select('*').eq('item_id', it.id).eq('ignored', false)
        .or('account_id.not.is.null,card_id.not.is.null');
      const cardOfItem = (mapped ?? []).filter((m) => m.card_id);
      // mais de uma conta do banco no mesmo destino (ex.: corrente + poupança automática do Bradesco)
      const shared = new Set((mapped ?? []).map((m) => m.account_id).filter((id, i, a) => id && a.indexOf(id) !== i));

      const from = brDate(new Date(it.last_sync_at ? Date.parse(it.last_sync_at) - 10 * 864e5 : Date.now() - 90 * 864e5).toISOString());
      for (const m of mapped ?? []) {
        out.accounts++;
        // /v2/transactions (paginação por cursor; o /transactions antigo responde 410)
        const txs: PluggyTx[] = [];
        let path: string | null = `/v2/transactions?accountId=${m.id}&dateFrom=${from}`;
        for (let guard = 0; path && guard < 50; guard++) {
          const r = await pget(key, path);
          txs.push(...(r.results ?? []));
          path = r.next ? (String(r.next).startsWith('/v2/') ? r.next : `/v2/transactions${r.next}`) : null;
        }
        // pagamento de fatura na conta -> liga ao cartão do mesmo banco (um item = um banco no MeuPluggy)
        const invoices = cardOfItem.length === 1
          ? (await db.from('invoices').select('invoice_date').eq('card_id', cardOfItem[0].card_id)).data ?? [] : [];
        const rows = txs.map((t) => toRow(t, { user_id, account_id: m.account_id, card_id: m.card_id, paysCard: cardOfItem[0]?.card_id ?? null, invoices, skipInternal: shared.has(m.account_id) }))
          .filter((r): r is NonNullable<typeof r> => !!r);
        if (!rows.length) continue;

        // categoria: a última usada com a mesma descrição; senão a categoria da Pluggy traduzida
        for (const r of rows) {
          if (r.pays_card_id || r.transfer_id) continue;
          const { data: prev } = await db.from('transactions').select('category_id').eq('user_id', user_id)
            .ilike('description', r.description.replace(/[%_\\]/g, '\\$&')).not('category_id', 'is', null).limit(1).maybeSingle();
          r.category_id = prev?.category_id ?? mapCategory(r._pluggyCategory, r.amount > 0 ? 'income' : 'expense', cats ?? []);
        }

        // reconcilia com o que já veio por notificação/manual (mesmo valor, ±2 dias, sem ext_id)
        const dates = rows.map((r) => r.date).sort();
        const lo = brDate(new Date(Date.parse(dates[0]) - 2 * 864e5).toISOString()), hi = brDate(new Date(Date.parse(dates.at(-1)!) + 2 * 864e5).toISOString());
        let q = db.from('transactions').select('id, amount, date, ext_id').eq('user_id', user_id).gte('date', lo).lte('date', hi);
        q = m.card_id ? q.eq('card_id', m.card_id) : q.eq('account_id', m.account_id);
        const { data: existing } = await q;
        const { merges, inserts, skipped, confirmed } = reconcile(rows, existing ?? []);
        out.skipped += skipped;
        // o banco confirmou: o que estava "a pagar" vira pago
        if (confirmed.length) await db.from('transactions').update({ paid: true }).in('id', confirmed).eq('paid', false);
        for (const mg of merges) {
          await db.from('transactions').update({ ext_id: mg.ext_id }).eq('id', mg.id).is('ext_id', null);
        }
        out.merged += merges.length;
        if (inserts.length) {
          const clean = inserts.map(({ _pluggyCategory, ...r }) => r);
          const { data: ins, error } = await db.from('transactions').upsert(clean, { onConflict: 'user_id,ext_id', ignoreDuplicates: true }).select('id');
          if (error) throw new Error(error.message);
          out.inserted += ins?.length ?? 0;
        }
      }
      await db.from('pluggy_items').update({ last_sync_at: new Date().toISOString(), error: null }).eq('id', it.id);
    } catch (e) {
      const msg = (e as Error).message;
      out.errors.push(`${it.id}: ${msg}`);
      await db.from('pluggy_items').update({ error: msg }).eq('id', it.id);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  const body = await req.json().catch(() => ({}));

  // service_role (cron) pode sincronizar todos; usuário só a si mesmo
  const role = (() => { try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { return null; } })();
  let userId: string | null = null;
  if (role !== 'service_role') {
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data.user) return json({ error: 'unauthorized' }, 401);
    userId = data.user.id;
  }

  try {
    const key = await pluggyKey();
    if (body.action === 'connect-token') {
      if (!userId) return json({ error: 'user only' }, 400);
      const r = await fetch(`${PLUGGY}/connect_token`, {
        method: 'POST', headers: { 'X-API-KEY': key, 'content-type': 'application/json' },
        body: JSON.stringify({ options: { clientUserId: userId } }),
      });
      return json({ accessToken: (await r.json()).accessToken });
    }
    if (body.action === 'sync') {
      const users = userId ? [userId] : body.all
        ? [...new Set(((await db.from('pluggy_items').select('user_id')).data ?? []).map((r) => r.user_id as string))] : [];
      const results: Record<string, unknown> = {};
      for (const u of users) results[u] = await syncUser(u, key);
      return json(userId ? results[userId] : results);
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
