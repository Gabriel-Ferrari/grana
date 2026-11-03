import { Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { env } from '../../../env';
import { BrlPipe, Store, must, notify, sb } from '../../core';
import { Icon } from '../../shared/ui/icon';
import { BankLogo, bankByPackage, bankName } from '../../shared/banks';

interface Notif {
    id: string;
    package: string;
    title: string | null;
    body: string;
    posted_at: string;
    status: string;
    transaction_id: string | null;
    parsed: { kind: 'card' | 'expense' | 'income'; amount: number; merchant: string; last4?: string; date: string } | null;
}
interface Device {
    token: string;
    name: string;
    last_seen_at: string | null;
    created_at: string;
}

@Component({
    imports: [BrlPipe, DatePipe, Icon, BankLogo],
    template: `
        <div class="page-title reveal"><h1>Notificações</h1></div>

        <section class="panel reveal">
            <div class="panel-head">
                <h2>Para revisar</h2>
                <span class="chip">{{ pending().length }}</span>
            </div>
            <div class="list">
                @for (n of pending(); track n.id) {
                    <div class="item" style="align-items:flex-start">
                        <g-bank [institution]="bankId(n.package)" fallback="notifications" />
                        <div class="grow">
                            <div class="sub">{{ bank(n.package) }} · {{ n.posted_at | date: 'dd/MM HH:mm' }}</div>
                            @if (n.title) {
                                <div class="title">{{ n.title }}</div>
                            }
                            <div style="white-space:pre-wrap;font-size:.9rem;margin:.15rem 0 .4rem">{{ n.body }}</div>
                            @if (n.parsed; as p) {
                                <span class="tag auto"
                                    ><g-icon name="auto_awesome" [size]="13" />{{
                                        p.kind === 'income' ? 'entrada' : p.kind === 'card' ? 'cartão' : 'saída'
                                    }}
                                    · {{ p.amount | brl }} · {{ p.merchant }}{{ p.last4 ? ' · final ' + p.last4 : '' }}</span
                                >
                            } @else {
                                <span class="tag">não entendi o formato</span>
                            }
                        </div>
                        <div class="row" style="flex-direction:column;align-items:stretch">
                            <button class="btn lime" (click)="review(n)"><g-icon name="add" [size]="18" />Lançar</button>
                            <button class="btn ghost" (click)="setStatus(n, 'ignored')">Ignorar</button>
                        </div>
                    </div>
                } @empty {
                    <div class="empty-state">
                        <g-icon name="check_circle" [fill]="true" />
                        <div>
                            <b>Nada para revisar</b>O que o coletor entende vira lançamento sozinho; só aparece aqui o que precisar de você.
                        </div>
                    </div>
                }
            </div>
        </section>

        <section class="panel reveal">
            <div class="panel-head"><h2>Recentes</h2></div>
            <div class="list">
                @for (n of recent(); track n.id) {
                    <div class="item notif-row">
                        <span class="cat-ico" [style.--cc]="n.status === 'done' ? 'var(--in)' : 'var(--muted)'"
                            ><span class="ms">{{ n.status === 'done' ? 'check' : 'close' }}</span></span
                        >
                        <div class="grow">
                            <div class="title">
                                @if (n.parsed; as p) {
                                    {{ p.amount | brl }} · {{ p.merchant }}
                                } @else {
                                    {{ n.title || n.body }}
                                }
                            </div>
                            <div class="sub">
                                {{ bank(n.package) }} · {{ n.posted_at | date: 'dd/MM HH:mm' }} ·
                                {{ n.status === 'done' ? 'lançado' : 'ignorado' }}
                            </div>
                        </div>
                        @if (n.status === 'ignored') {
                            <button
                                class="btn ghost icon"
                                (click)="setStatus(n, 'pending')"
                                aria-label="Revisar de novo"
                                title="Revisar de novo"
                            >
                                <g-icon name="undo" [size]="20" />
                            </button>
                        } @else {
                            <span class="notif-gap" aria-hidden="true"></span>
                        }
                    </div>
                } @empty {
                    <p class="muted">Ainda nada.</p>
                }
            </div>
        </section>

        <section class="panel reveal">
            <div class="panel-head">
                <h2>Celulares conectados</h2>
                <button class="btn" (click)="addDevice()"><g-icon name="smartphone" [size]="18" />Conectar celular</button>
            </div>
            <div class="list">
                @for (d of devices(); track d.token) {
                    <div class="item" style="flex-wrap:wrap">
                        <span class="cat-ico" style="--cc: var(--brand)"><span class="ms">smartphone</span></span>
                        <div class="grow">
                            <div class="title">{{ d.name }}</div>
                            <div class="sub">último envio: {{ d.last_seen_at ? (d.last_seen_at | date: 'dd/MM HH:mm') : 'nunca' }}</div>
                        </div>
                        <div class="item-actions">
                            <a class="btn lime" [href]="setupLink(d.token)"><g-icon name="link" [size]="18" />Configurar no app</a>
                            <button class="btn ghost icon" (click)="removeDevice(d.token)" aria-label="Desconectar">
                                <g-icon name="delete" [size]="18" />
                            </button>
                        </div>
                    </div>
                } @empty {
                    <div class="empty-state">
                        <g-icon name="smartphone" />
                        <div>
                            <b>Nenhum celular</b>Toque em “Conectar celular” e depois em “Configurar no app” <i>no próprio celular</i> com o
                            app grana instalado.
                        </div>
                    </div>
                }
            </div>
            <p class="muted small">
                Para virar lançamento automático, informe em Ajustes o app que notifica cada conta/cartão e o final do cartão.
            </p>
        </section>
    `,
})
export class Inbox {
    store = inject(Store);
    endpoint = env.supabaseUrl + '/functions/v1/ingest';
    pending = signal<Notif[]>([]);
    recent = signal<Notif[]>([]);
    devices = signal<Device[]>([]);
    bank = bankName;
    bankId = (pkg: string) => bankByPackage(pkg)?.id ?? null;
    setupLink = (token: string) => `grana://setup?endpoint=${encodeURIComponent(this.endpoint)}&token=${encodeURIComponent(token)}`;

    constructor() {
        effect(() => {
            this.store.version();
            untracked(() => this.fetch());
        });
    }

    async fetch() {
        const [p, r, d] = await Promise.all([
            must(sb.from('notifications').select('*').eq('status', 'pending').order('posted_at', { ascending: false })),
            must(sb.from('notifications').select('*').neq('status', 'pending').order('posted_at', { ascending: false }).limit(20)),
            must(sb.from('devices').select('*').order('created_at')),
        ]);
        this.pending.set(p as Notif[]);
        this.recent.set(r as Notif[]);
        this.devices.set(d as Device[]);
    }

    review(n: Notif) {
        const p = n.parsed;
        const card = p?.last4 ? this.store.cards().find((c) => c.last4 === p.last4) : undefined;
        this.store.open(
            {
                kind: p?.kind === 'income' ? 'income' : 'expense',
                description: p?.merchant || n.title || '',
                amount: p ? (p.kind === 'income' ? p.amount : -p.amount) : undefined,
                date: p?.date ?? n.posted_at.slice(0, 10),
                card_id: card?.id ?? null,
                source: 'notification',
            },
            async (txId) => {
                if (!txId) return;
                await must(sb.from('notifications').update({ status: 'done', transaction_id: txId }).eq('id', n.id));
                await this.store.load();
            },
        );
    }

    async setStatus(n: Notif, status: string) {
        await must(sb.from('notifications').update({ status }).eq('id', n.id));
        await this.store.load();
        if (status === 'ignored')
            notify('Notificação ignorada', { action: { label: 'Desfazer', run: () => this.setStatus(n, 'pending') } });
    }

    async addDevice() {
        await must(sb.from('devices').insert({ name: /Android/.test(navigator.userAgent) ? 'Este Android' : 'Android' }));
        this.fetch();
    }

    async removeDevice(token: string) {
        await must(sb.from('devices').delete().eq('token', token));
        this.fetch();
    }
}
