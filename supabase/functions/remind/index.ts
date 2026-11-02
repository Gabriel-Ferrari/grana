// POST /functions/v1/remind  (Web Push, como os lembretes do Organizze)
//   service_role (cron diário 08:00): envia os avisos do dia (sql push_reminders) a todos os aparelhos inscritos
//   JWT do usuário { test: true }: notificação de teste nos aparelhos dele (botão em Ajustes)
// Secret VAPID_KEYS = chaves VAPID em JWK (exportVapidKeys do @negrel/webpush); a pública vai no env do app web.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type Msg = { user_id: string; tag: string; title: string; body: string; url: string };

let server: Promise<webpush.ApplicationServer> | undefined;
const app = () =>
    (server ??= webpush
        .importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS')!))
        .then((vapidKeys) =>
            webpush.ApplicationServer.new({ contactInformation: 'https://grana.ferrari-gabriel2002.workers.dev', vapidKeys }),
        ));

async function send(subs: Sub[], msgs: Msg[]) {
    const as = await app();
    let sent = 0;
    const gone: string[] = [];
    for (const m of msgs)
        for (const s of subs.filter((s) => s.user_id === m.user_id))
            try {
                await as
                    .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
                    .pushTextMessage(JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), { ttl: 12 * 3600 });
                sent++;
            } catch (e) {
                // aparelho desinstalou/revogou: tira a inscrição
                if (e instanceof webpush.PushMessageError && e.isGone()) gone.push(s.endpoint);
                else console.error(s.endpoint.slice(0, 60), String(e));
            }
    if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
    return { avisos: msgs.length, enviados: sent, removidos: gone.length };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
    const role = (() => {
        try {
            return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
        } catch {
            return null;
        }
    })();
    try {
        if (role === 'service_role') {
            const { data: msgs, error } = await db.rpc('push_reminders');
            if (error) throw error;
            const users = [...new Set((msgs as Msg[]).map((m) => m.user_id))];
            const { data: subs } = users.length ? await db.from('push_subscriptions').select('*').in('user_id', users) : { data: [] };
            return json(await send((subs ?? []) as Sub[], msgs as Msg[]));
        }
        const { data, error } = await db.auth.getUser(jwt);
        if (error || !data.user) return json({ error: 'unauthorized' }, 401);
        const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', data.user.id);
        return json(
            await send((subs ?? []) as Sub[], [
                {
                    user_id: data.user.id,
                    tag: 'teste',
                    title: 'Avisos ligados',
                    body: 'Assim o grana te lembra de contas do dia, faturas e limites.',
                    url: '/',
                },
            ]),
        );
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
});
