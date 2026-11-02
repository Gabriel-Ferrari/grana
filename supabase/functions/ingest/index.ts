// POST /functions/v1/ingest   header x-ingest-token: <devices.token>
// body: { package, title, text, big_text, sub_text, info_text, text_lines, posted_at (ms), key }
// Salva notificação crua; se o parser entender e achar conta/cartão, cria o lançamento.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parse } from './parser.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const token = req.headers.get('x-ingest-token') ?? '';
  const { data: dev } = await db.from('devices').select('user_id').eq('token', token).maybeSingle();
  if (!dev) return json({ error: 'invalid token' }, 401);
  const user_id = dev.user_id as string;

  let n: Record<string, unknown>;
  try { n = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const pkg = String(n.package ?? '');
  const title = n.title ? String(n.title) : null;
  const body = [n.big_text || n.text, n.text_lines, n.sub_text, n.info_text].filter(Boolean).map(String).join('\n');
  const postedAt = Number(n.posted_at) || Date.now();
  if (!pkg || !body) return json({ error: 'package and text required' }, 400);

  await db.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('token', token);

  const parsed = parse(`${title ?? ''}\n${body}`, postedAt);
  const hash = await sha256(`${pkg}|${n.key ?? ''}|${postedAt}|${body}`);
  const { data: row, error } = await db.from('notifications')
    .upsert({ user_id, package: pkg, title, body, posted_at: new Date(postedAt).toISOString(), hash, parsed },
      { onConflict: 'user_id,hash', ignoreDuplicates: true })
    .select('id').maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ duplicate: true });
  if (!parsed) return json({ id: row.id, parsed: null });

  // destino: cartão pelo final ou pelo app; conta pelo app
  let card_id: string | null = null, account_id: string | null = null;
  if (parsed.kind === 'card') {
    const { data: cards } = await db.from('cards').select('id, last4, notify_package').eq('user_id', user_id).eq('archived', false);
    const byLast4 = cards?.find((c) => parsed.last4 && c.last4 === parsed.last4);
    const byPkg = cards?.filter((c) => c.notify_package === pkg);
    card_id = byLast4?.id ?? (byPkg?.length === 1 ? byPkg[0].id : null);
  } else {
    const { data: accs } = await db.from('accounts').select('id').eq('user_id', user_id).eq('notify_package', pkg).eq('archived', false);
    account_id = accs?.length === 1 ? accs[0].id : null;
  }
  if (!card_id && !account_id) return json({ id: row.id, parsed, pending: 'sem conta/cartão para este app' });

  // categoria: a última usada para a mesma descrição
  const desc = parsed.merchant || title || pkg;
  const { data: prev } = await db.from('transactions').select('category_id')
    .eq('user_id', user_id).ilike('description', desc.replace(/[%_\\]/g, '\\$&'))
    .not('category_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const { data: tx, error: txErr } = await db.from('transactions').insert({
    user_id, description: desc, amount: parsed.kind === 'income' ? parsed.amount : -parsed.amount,
    date: parsed.date, paid: true, card_id, account_id, category_id: prev?.category_id ?? null, source: 'notification', reviewed: false,
  }).select('id').single();
  if (txErr) return json({ id: row.id, parsed, error: txErr.message }, 500);

  await db.from('notifications').update({ status: 'done', transaction_id: tx.id }).eq('id', row.id);
  return json({ id: row.id, parsed, transaction_id: tx.id });
});
