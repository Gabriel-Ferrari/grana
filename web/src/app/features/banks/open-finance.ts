import { Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankLogo, bankOf } from '../../shared/banks';
import { BrlPipe, Store, must, notify, sb, theme } from '../../core';
import { Icon } from '../../shared/ui/icon';

interface PItem {
    id: string;
    connector: string | null;
    status: string | null;
    error: string | null;
    last_sync_at: string | null;
}
interface PAccount {
    id: string;
    item_id: string;
    name: string | null;
    type: string | null;
    subtype: string | null;
    number: string | null;
    balance: number | null;
    account_id: string | null;
    card_id: string | null;
    ignored: boolean;
}

const MEUPLUGGY = 200; // id do conector MeuPluggy (Open Finance gratuito para uso pessoal)

/** Sincroniza com a Pluggy (função no Supabase). Usado pelo painel e ao abrir o app. */
export async function pluggySync(): Promise<{ inserted: number; merged: number; errors: string[] } | null> {
    const { data, error } = await sb.functions.invoke('pluggy', { body: { action: 'sync' } });
    if (error) {
        notify('Falha ao sincronizar com o banco', { tone: 'error' });
        return null;
    }
    return data;
}

@Component({
    selector: 'g-openfinance',
    imports: [DatePipe, FormsModule, Icon, BankLogo, BrlPipe],
    template: `
        <div class="panel-head">
            <div>
                <h2>Bancos conectados</h2>
                <p class="muted small" style="margin:.15rem 0 0">Open Finance via Pluggy · atualiza 1× por dia</p>
            </div>
            <button class="btn lime" (click)="connect()" [disabled]="busy()"><g-icon name="link" [size]="18" />Conectar banco</button>
        </div>

        @for (it of items(); track it.id) {
            <div class="of-item">
                <div class="row between wrap">
                    <div class="row">
                        <g-icon name="account_balance" class="muted" /><b>{{ it.connector || 'Conexão' }}</b>
                        <span
                            class="chip"
                            [class.ok]="it.status === 'UPDATED'"
                            [class.err]="!!it.error || it.status === 'LOGIN_ERROR' || it.status === 'OUTDATED'"
                            >{{ statusLabel(it) }}</span
                        >
                    </div>
                    <div class="row">
                        <span class="muted small">{{
                            it.last_sync_at ? 'sincronizado ' + (it.last_sync_at | date: 'dd/MM HH:mm') : 'nunca sincronizado'
                        }}</span>
                        <button class="btn" (click)="sync()" [disabled]="busy()"><g-icon name="sync_alt" [size]="18" />Sincronizar</button>
                        <button class="btn ghost icon danger" (click)="remove(it)" aria-label="Remover conexão">
                            <g-icon name="delete" [size]="18" />
                        </button>
                    </div>
                </div>
                @if (it.error) {
                    <p class="neg small" style="margin:.5rem 0 0">{{ it.error }}</p>
                }
                <div class="list" style="margin-top:.6rem">
                    @for (a of accountsOf(it.id); track a.id) {
                        <div class="item" style="flex-wrap:wrap">
                            <g-bank [name]="a.name" [fallback]="a.type === 'CREDIT' ? 'credit_card' : 'account_balance'" />
                            <div class="grow">
                                <div class="title">{{ a.name }}</div>
                                <div class="sub">
                                    {{ a.type === 'CREDIT' ? 'cartão de crédito' : 'conta' }}{{ a.number ? ' · ' + a.number : '' }} · saldo
                                    {{ a.balance | brl }}
                                </div>
                            </div>
                            <select
                                style="width:auto;min-width:220px"
                                [ngModel]="target(a)"
                                (ngModelChange)="map(a, $event)"
                                [attr.aria-label]="'Lançar ' + a.name + ' em'"
                            >
                                <option value="">Escolher onde lançar…</option>
                                <option value="ignore">Não sincronizar</option>
                                @if (a.type === 'CREDIT') {
                                    <optgroup label="Cartões">
                                        @for (c of store.cards(); track c.id) {
                                            <option [value]="'c:' + c.id">{{ c.name }}</option>
                                        }
                                    </optgroup>
                                } @else {
                                    <optgroup label="Contas">
                                        @for (x of store.accounts(); track x.id) {
                                            <option [value]="'a:' + x.id">{{ x.name }}</option>
                                        }
                                    </optgroup>
                                }
                            </select>
                        </div>
                    } @empty {
                        <p class="muted small">As contas aparecem depois da primeira sincronização.</p>
                    }
                </div>
            </div>
        } @empty {
            <div class="empty-state">
                <g-icon name="link" />
                <div>
                    <b>Nenhum banco conectado</b>Conecte pelo MeuPluggy e os lançamentos chegam sozinhos, todo dia. Veja o passo a passo
                    abaixo.
                </div>
            </div>
        }

        <details class="guide">
            <summary><g-icon name="notes" [size]="18" />Passo a passo: conectar seus bancos (grátis)</summary>
            <ol>
                <li>
                    <b>Crie sua conta no MeuPluggy</b> em <a href="https://meu.pluggy.ai" target="_blank" rel="noopener">meu.pluggy.ai</a> e
                    conecte cada banco (Nubank, Bradesco, Itaú…). Cada banco pede autorização pelo próprio app dele — é o Open Finance
                    oficial do Banco Central.
                </li>
                <li>
                    <b>Crie uma conta de desenvolvedor</b> em
                    <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener">dashboard.pluggy.ai</a> (time com qualquer nome,
                    uso pessoal). O trial de 15 dias serve para configurar; a conexão MeuPluggy segue funcionando depois.
                </li>
                <li><b>Copie o Client ID e gere o Client Secret</b> no dashboard (o secret aparece uma vez só).</li>
                <li>
                    <b>Guarde as chaves no Supabase</b> (nunca no código):
                    <code>npx supabase secrets set PLUGGY_CLIENT_ID=… PLUGGY_CLIENT_SECRET=…</code> — ou num arquivo
                    <code>.env.pluggy</code> fora do git e <code>npx supabase secrets set --env-file .env.pluggy</code>.
                </li>
                <li><b>Aqui no grana, toque em “Conectar banco”</b>, escolha <b>MeuPluggy</b> e autorize. Repita uma vez por banco.</li>
                <li>
                    <b>Diga onde lançar cada conta</b>: para cada conta/cartão que aparecer acima, escolha a conta ou cartão do grana
                    correspondente.
                </li>
                <li>
                    <b>Pronto.</b> O app sincroniza ao abrir (até 1× a cada 12 h) e pelo botão “Sincronizar”. O que já tinha chegado por
                    notificação não duplica: o grana junta lançamentos de mesmo valor com até 2 dias de diferença.
                </li>
            </ol>
            <p class="muted small">
                A autorização do Open Finance vale até 12 meses; quando vencer, o status muda e basta conectar de novo.
            </p>
        </details>
    `,
    host: { class: 'panel', style: 'display:block' },
})
export class OpenFinance {
    store = inject(Store);
    busy = signal(false);
    items = signal<PItem[]>([]);
    accounts = signal<PAccount[]>([]);
    accountsOf = (item: string) => this.accounts().filter((a) => a.item_id === item);
    target = (a: PAccount) => (a.ignored ? 'ignore' : a.card_id ? 'c:' + a.card_id : a.account_id ? 'a:' + a.account_id : '');
    statusLabel = (it: PItem) =>
        (
            ({
                UPDATED: 'em dia',
                UPDATING: 'atualizando',
                LOGIN_ERROR: 'reconectar',
                OUTDATED: 'desatualizado',
                WAITING_USER_INPUT: 'aguardando você',
            }) as Record<string, string>
        )[it.status ?? ''] ??
        it.status ??
        'novo';

    constructor() {
        effect(() => {
            this.store.version();
            untracked(() => this.fetch());
        });
    }

    async fetch() {
        const [i, a] = await Promise.all([
            must(sb.from('pluggy_items').select('*').order('created_at')),
            must(sb.from('pluggy_accounts').select('*').order('name')),
        ]);
        this.items.set(i as PItem[]);
        this.accounts.set(a as PAccount[]);
        // sugere o destino de contas novas pelo banco (ex.: "Nubank" -> conta/cartão Nubank)
        for (const acc of (a as PAccount[]).filter((x) => !x.account_id && !x.card_id && !x.ignored)) {
            const byLast4 = acc.type === 'CREDIT' ? this.store.cards().find((c) => c.last4 && acc.number?.endsWith(c.last4)) : undefined;
            if (byLast4) {
                await this.map(acc, 'c:' + byLast4.id, true);
                continue;
            }
            const bank = bankOf(acc.name);
            if (!bank || acc.subtype === 'SAVINGS_ACCOUNT') continue; // poupança: o usuário decide
            const pool = acc.type === 'CREDIT' ? this.store.cards() : this.store.accounts();
            const match = pool.filter((p) => bankOf(p.name, (p as { institution?: string | null }).institution)?.id === bank.id);
            if (match.length === 1) await this.map(acc, (acc.type === 'CREDIT' ? 'c:' : 'a:') + match[0].id, true);
        }
    }

    async connect() {
        this.busy.set(true);
        try {
            const { data, error } = await sb.functions.invoke('pluggy', { body: { action: 'connect-token' } });
            if (error || !data?.accessToken) throw new Error('não consegui falar com a Pluggy');
            const { PluggyConnect } = await import('pluggy-connect-sdk');
            const dark = theme() === 'dark' || (!theme() && matchMedia('(prefers-color-scheme: dark)').matches);
            new PluggyConnect({
                connectToken: data.accessToken,
                connectorIds: [MEUPLUGGY],
                selectedConnectorId: MEUPLUGGY,
                language: 'pt',
                theme: dark ? 'dark' : 'light',
                onSuccess: async ({
                    item,
                }: { item: { id: string; status: string; connector?: { name?: string } } } & Record<string, unknown>) => {
                    await must(
                        sb
                            .from('pluggy_items')
                            .upsert({ id: item.id, connector: item.connector?.name ?? 'MeuPluggy', status: item.status }),
                    );
                    notify('Banco conectado. Buscando contas…');
                    await this.sync();
                },
                onError: () => notify('A conexão não foi concluída', { tone: 'error' }),
            }).init();
        } catch (e) {
            notify((e as Error).message, { tone: 'error' });
        } finally {
            this.busy.set(false);
        }
    }

    async sync() {
        this.busy.set(true);
        const r = await pluggySync();
        this.busy.set(false);
        if (r)
            notify(
                r.errors?.length ? `Sincronizado com avisos: ${r.errors[0]}` : `Sincronizado: ${r.inserted} novos, ${r.merged} já existiam`,
                { tone: r.errors?.length ? 'error' : 'ok' },
            );
        await this.store.load();
    }

    async map(a: PAccount, v: string, silent = false) {
        const [t, id] = v.split(':');
        const patch = { ignored: v === 'ignore', account_id: t === 'a' ? id : null, card_id: t === 'c' ? id : null };
        await must(sb.from('pluggy_accounts').update(patch).eq('id', a.id));
        this.accounts.update((l) => l.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
        if (!silent)
            notify(v === 'ignore' ? 'Conta não será sincronizada' : 'Destino salvo. Toque em Sincronizar para trazer os lançamentos.');
    }

    async remove(it: PItem) {
        await must(sb.from('pluggy_items').delete().eq('id', it.id));
        notify('Conexão removida (os lançamentos já trazidos continuam)');
        this.fetch();
    }
}
