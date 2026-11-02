import { signal } from '@angular/core';
import { env } from '../../env';
import { must, sb } from './supabase';
import { notify } from './ui-state';

/** Avisos no celular (Web Push), como os lembretes do Organizze: conta do dia, fatura vencendo/fechando, limite.
 *  O servidor manda (cron 08:00, função remind); aqui só a inscrição deste aparelho. */
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushState = signal<'off' | 'on' | 'blocked' | 'unsupported'>(
    !supported() ? 'unsupported' : Notification.permission === 'denied' ? 'blocked' : 'off',
);
const key = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** dá para perguntar (nunca respondeu) e ainda não está ligado */
export const canAskPush = () => pushState() === 'off' && 'Notification' in window && Notification.permission === 'default';

/** quiet: na abertura do app, só reconfirma a inscrição se já tinha permitido (o navegador troca o endpoint às vezes) */
export async function enablePush(quiet = false): Promise<boolean> {
    if (!supported()) return (quiet || notify('Este navegador não manda avisos', { tone: 'error' }), false);
    if (quiet ? Notification.permission !== 'granted' : (await Notification.requestPermission()) !== 'granted') {
        if (Notification.permission === 'denied') pushState.set('blocked');
        if (!quiet) notify('Avisos bloqueados. Libere nas configurações do app no celular.', { tone: 'error' });
        return false;
    }
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub =
            (await reg.pushManager.getSubscription()) ??
            (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(env.vapidPublic) }));
        const j = sub.toJSON();
        await must(sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys!['p256dh'], auth: j.keys!['auth'] }));
        pushState.set('on');
        if (!quiet) notify('Avisos ligados');
        return true;
    } catch (e) {
        if (!quiet) notify('Não deu para ligar os avisos: ' + (e as Error).message, { tone: 'error' });
        return false;
    }
}

export async function disablePush() {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
    }
    pushState.set('off');
    notify('Avisos desligados neste aparelho');
}

/** Convite na hora em que faz sentido (salvou conta a pagar, criou limite), nunca ao abrir o app.
 *  Só se ainda não respondeu, no máximo a cada 14 dias. true = mostrou o convite (no lugar do aviso normal). */
export function offerPush(text: string): boolean {
    if (!supported() || Notification.permission !== 'default') return false;
    if (Date.now() - Number(localStorage.getItem('grana.push.ask') ?? 0) < 14 * 864e5) return false;
    localStorage.setItem('grana.push.ask', String(Date.now()));
    notify(text, { action: { label: 'Ativar', run: () => enablePush() } });
    return true;
}
