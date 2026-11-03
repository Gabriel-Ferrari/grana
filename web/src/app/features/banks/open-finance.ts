import { Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BankLogo, bankOf } from '../../shared/banks';
import { BrlPipe, Store, must, notify, onBack, sb, theme } from '../../core';
import { Icon } from '../../shared/ui/icon';
import { SheetDrag } from '../../shared/ui/sheet';
import { bankCount, ofGuide, pluggySync } from './pluggy';
export { offerBank } from './pluggy';

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

@Component({
    selector: 'g-openfinance',
    imports: [DatePipe, FormsModule, Icon, BankLogo, BrlPipe, SheetDrag],
    template: `
        <div class="panel-head">
            <div>
                <h2>Bancos conectados</h2>
                <p class="muted small" style="margin:.15rem 0 0">Open Finance via Pluggy · atualiza 1× por dia</p>
            </div>
            <button class="btn lime" (click)="openGuide()" [disabled]="busy()"><g-icon name="link" [size]="18" />Conectar banco</button>
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

        <button type="button" class="btn ghost sm" style="margin-top:.4rem" (click)="guide.set(0)">
            <g-icon name="menu_book" [size]="16" />Como funciona (passo a passo)
        </button>

        @if (guide() >= 0) {
            <!-- passo a passo ilustrado (abre ao tocar em "Conectar banco"): o que fazer no MeuPluggy e aqui -->
            <div class="scrim ask-scrim" (click)="guide.set(-1)" (keydown.escape)="guide.set(-1)" tabindex="-1"></div>
            <div #guideSheet class="sheet of-guide" role="dialog" aria-modal="true" aria-label="Conectar banco: passo a passo">
                <div class="sheet-grab" [gSheetDrag]="guideSheet" (dismissed)="guide.set(-1)"><span class="grabber"></span></div>
                <div class="of-art" aria-hidden="true">
                    @switch (steps[guide()].art) {
                        @case ('account') {
                            <div class="of-phone">
                                <div class="of-url"><g-icon name="lock" [size]="12" />meu.pluggy.ai</div>
                                <div class="of-logo"><g-icon name="hub" [size]="26" /></div>
                                <span class="of-field"></span><span class="of-field"></span>
                                <span class="of-cta">Criar conta grátis</span>
                            </div>
                        }
                        @case ('banks') {
                            <div class="of-hub">
                                <span class="of-core"><g-icon name="hub" [size]="22" />MeuPluggy</span>
                                @for (b of hubBanks; track b; let i = $index) {
                                    <span class="of-sat" [style.--i]="i"><g-bank [name]="b" [institution]="b" [size]="40" /></span>
                                }
                            </div>
                        }
                        @case ('link') {
                            <div class="of-pair">
                                <span class="of-app grana">g</span>
                                <span class="of-wire"><g-icon name="sync_alt" [size]="22" /></span>
                                <span class="of-app pluggy"><g-icon name="hub" [size]="26" /></span>
                            </div>
                            <span class="of-badge"><g-icon name="verified_user" [size]="16" />Só leitura · revogue quando quiser</span>
                        }
                        @case ('map') {
                            <div class="of-map">
                                @for (r of mapDemo; track r.from) {
                                    <div class="of-map-row">
                                        <g-bank [name]="r.bank" [institution]="r.bank" [size]="28" /><span>{{ r.from }}</span>
                                        <g-icon name="arrow_forward" [size]="18" class="muted" /><b>{{ r.to }}</b>
                                    </div>
                                }
                            </div>
                        }
                    }
                </div>
                <p class="of-step-n">Passo {{ guide() + 1 }} de {{ steps.length }}</p>
                <h3 class="of-step-title">{{ steps[guide()].title }}</h3>
                <p class="of-step-text">{{ steps[guide()].text }}</p>
                @if (steps[guide()].art === 'account') {
                    <a class="btn" href="https://meu.pluggy.ai" target="_blank" rel="noopener"
                        ><g-icon name="open_in_new" [size]="18" />Abrir meu.pluggy.ai</a
                    >
                }
                <div class="of-dots" aria-hidden="true">
                    @for (st of steps; track st.title; let i = $index) {
                        <i [class.on]="i === guide()"></i>
                    }
                </div>
                <div class="row between">
                    @if (guide() > 0) {
                        <button type="button" class="btn ghost" (click)="guide.set(guide() - 1)">
                            <g-icon name="chevron_left" [size]="18" />Voltar
                        </button>
                    } @else {
                        <button type="button" class="btn ghost" (click)="guide.set(-1)">Agora não</button>
                    }
                    @if (guide() < steps.length - 1) {
                        <button type="button" class="btn primary" (click)="guide.set(guide() + 1)">
                            Próximo<g-icon name="chevron_right" [size]="18" />
                        </button>
                    } @else {
                        <button type="button" class="btn lime" (click)="guide.set(-1); connect()" [disabled]="busy()">
                            <g-icon name="link" [size]="18" />Conectar agora
                        </button>
                    }
                </div>
            </div>
        }
    `,
    host: { class: 'panel', id: 'bancos', style: 'display:block;scroll-margin-top:1rem' },
})
export class OpenFinance {
    store = inject(Store);
    busy = signal(false);
    /** passo aberto do guia ilustrado; -1 = fechado */
    guide = signal(-1);
    steps = [
        {
            art: 'account',
            title: 'Crie sua conta no MeuPluggy',
            text: 'É grátis para uso pessoal. Entre em meu.pluggy.ai e crie a conta com seu e-mail.',
        },
        {
            art: 'banks',
            title: 'Conecte seus bancos lá',
            text: 'No MeuPluggy, adicione cada banco. Cada um pede autorização no próprio app dele: é o Open Finance oficial do Banco Central.',
        },
        {
            art: 'link',
            title: 'Autorize o grana',
            text: 'Na próxima tela escolha MeuPluggy, entre com o mesmo e-mail e autorize. O grana só lê: não move dinheiro.',
        },
        {
            art: 'map',
            title: 'Diga onde lançar',
            text: 'Para cada conta ou cartão que aparecer, escolha o do grana. Depois chega tudo sozinho, 1× por dia, sem duplicar o que veio pela notificação.',
        },
    ];
    hubBanks = ['nubank', 'bradesco', 'itau', 'caixa'];
    mapDemo = [
        { bank: 'nubank', from: 'Nubank · conta', to: 'Nubank' },
        { bank: 'nubank', from: 'Nubank · cartão', to: 'Cartão Nubank' },
    ];
    /** "Conectar banco": guia do começo; quem já conectou um banco vai direto ao passo de autorizar */
    openGuide() {
        this.guide.set(this.items().length ? 2 : 0);
    }
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
        // voltar do Android / Esc fecha o guia
        effect((onCleanup) => {
            if (this.guide() >= 0) onCleanup(onBack(() => this.guide.set(-1)));
        });
        // convite de outra tela (offerBank): abre o guia aqui
        effect(() => {
            if (!ofGuide()) return;
            untracked(() => {
                ofGuide.set(false);
                this.openGuide();
            });
        });
    }

    async fetch() {
        const [i, a] = await Promise.all([
            must(sb.from('pluggy_items').select('*').order('created_at')),
            must(sb.from('pluggy_accounts').select('*').order('name')),
        ]);
        this.items.set(i as PItem[]);
        bankCount.set(i.length);
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
