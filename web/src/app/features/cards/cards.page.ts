import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Meter } from '../../shared/ui/charts';
import { BrlPipe, Card, DmyPipe, Invoice, Store, Tx, catIcon, monthLabel, must, notify, sb, toCents, today } from '../../core';
import { Icon } from '../../shared/ui/icon';
import { BankLogo, networkLogo, bankColor } from '../../shared/banks';
import { invoiceStatus } from './invoice';

type Inv = Invoice & { due: number; running_due: number };

@Component({
    imports: [BrlPipe, DmyPipe, FormsModule, RouterLink, Icon, Meter, BankLogo],
    template: `
        <div class="page-title reveal"><h1>Cartões</h1></div>

        @if (!cards().length) {
            <section class="panel empty-state">
                <g-icon name="credit_card" />
                <div>
                    <b>Nenhum cartão</b>Cadastre em <a routerLink="/ajustes" class="link-more">Ajustes</a> com dia de fechamento e
                    vencimento.
                </div>
            </section>
        }

        <div class="cc-rail reveal" role="tablist">
            @for (c of cards(); track c.id) {
                <button
                    class="cc"
                    role="tab"
                    [attr.aria-selected]="c.id === card()?.id"
                    [class.on]="c.id === card()?.id"
                    [style.--c]="color(c.name, c.color, c.institution)"
                    (click)="select(c.id)"
                >
                    <div class="cc-top">
                        <span class="row" style="gap:.6rem"
                            ><g-bank [name]="c.name" [institution]="c.institution" [size]="30" fallback="credit_card" />{{ c.name }}</span
                        ><span class="ms">contactless</span>
                    </div>
                    <div class="row between">
                        <span class="cc-chip"></span>
                        <span class="row" style="gap:.6rem"
                            ><span class="cc-num">•••• {{ c.last4 || '····' }}</span>
                            @if (net(c.network); as n) {
                                <img class="net-logo light" [src]="n" alt="" referrerpolicy="no-referrer" />
                            }
                        </span>
                    </div>
                    <div class="cc-foot">
                        <span
                            >Disponível<b>{{ c.available | brl }}</b></span
                        >
                        <span style="text-align:right"
                            >Fatura {{ c.current_invoice_date | dmy: true }}<b>{{ c.current_invoice_due | brl }}</b></span
                        >
                    </div>
                </button>
            }
        </div>

        @if (card(); as c) {
            <section class="panel reveal">
                <g-meter label="Limite usado" [value]="c.limit_cents - c.available" [max]="c.limit_cents" />
                <p class="muted small" style="margin:.6rem 0 0">
                    Fecha dia {{ c.closing_day }} · vence dia {{ c.due_day }}
                    @if (c.current_invoice_date && c.current_invoice_due > 0) {
                        · fatura {{ c.current_invoice_date | dmy: true }} <b [class]="'inv-' + status(c).tone">{{ status(c).text }}</b>
                    }
                </p>
            </section>

            <div class="inv-strip reveal" role="tablist" aria-label="Faturas">
                @for (i of invoices(); track i.invoice_date) {
                    <button
                        role="tab"
                        [class.on]="i.invoice_date === sel()?.invoice_date"
                        [attr.aria-selected]="i.invoice_date === sel()?.invoice_date"
                        (click)="inv.set(i.invoice_date)"
                    >
                        <span
                            ><i
                                class="status-dot"
                                [class.paid]="i.is_paid"
                                [class.late]="!i.is_paid && i.invoice_date < hoje"
                                [class.open]="!i.is_paid && i.invoice_date >= hoje"
                            ></i
                            >{{ short(i.invoice_date) }}</span
                        >
                        <b>{{ i.total | brl }}</b>
                    </button>
                }
            </div>

            @if (sel(); as i) {
                <section class="panel reveal">
                    <div class="panel-head">
                        <div>
                            <h2>Fatura de {{ long(i.invoice_date) }}</h2>
                            <p class="muted small" style="margin:.15rem 0 0">
                                vence {{ i.invoice_date | dmy }} ·
                                <span [class.pos]="i.is_paid" [class.neg]="!i.is_paid && i.invoice_date < hoje">{{
                                    i.is_paid ? 'paga' : i.invoice_date < hoje ? 'vencida' : 'em aberto'
                                }}</span>
                            </p>
                        </div>
                        <div style="text-align:right">
                            <div class="big" style="font-size:1.5rem;font-weight:750">{{ i.total | brl }}</div>
                            @if (i.due !== i.total) {
                                <span class="muted small">a pagar {{ i.due | brl }}</span>
                            }
                        </div>
                    </div>

                    <div class="inv-break">
                        <div>
                            <span>{{ carry(i) < 0 ? 'Crédito anterior' : 'Saldo anterior' }}</span
                            ><b [class.pos]="carry(i) < 0">{{ 0 - carry(i) | brl }}</b>
                        </div>
                        <div>
                            <span>Gastos do mês</span><b>{{ 0 - i.total | brl }}</b>
                        </div>
                        <div>
                            <span>Pagamentos</span><b [class.pos]="i.paid > 0">{{ i.paid | brl }}</b>
                        </div>
                        <div>
                            <span>{{ i.is_paid ? 'Fatura' : 'Falta pagar' }}</span
                            ><b [class.neg]="i.due > 0">{{ i.is_paid ? 'paga' : (0 - i.due | brl) }}</b>
                        </div>
                    </div>

                    @for (p of payments(); track p.id) {
                        <div class="item click pay-row" (click)="store.open(p)" tabindex="0" (keydown.enter)="store.open(p)">
                            <span class="cat-ico" style="--cc: var(--in)"><span class="ms">check_circle</span></span>
                            <div class="grow">
                                <div class="title">Pagamento em {{ p.date | dmy }}</div>
                                <div class="sub">
                                    {{ store.originName().get(p.account_id ?? '') }}
                                    @if (!p.paid) {
                                        · <span class="neg">agendado</span>
                                    }
                                </div>
                            </div>
                            <span class="amt">{{ p.amount | brl }}</span>
                        </div>
                    }

                    @if (i.due > 0) {
                        <form
                            class="row wrap"
                            (ngSubmit)="pay(i)"
                            style="padding:.8rem;border-radius:14px;background:var(--sunk);margin-bottom:.6rem"
                        >
                            <label style="min-width:150px"
                                >Pagar com
                                <select name="acc" [(ngModel)]="payAcc">
                                    @for (a of store.accounts(); track a.id) {
                                        <option [value]="a.id">{{ a.name }}</option>
                                    }
                                </select></label
                            >
                            <label style="min-width:110px"
                                >Valor
                                <input name="v" type="number" step="0.01" [(ngModel)]="payValue" [placeholder]="(i.due / 100).toFixed(2)"
                            /></label>
                            <label style="min-width:130px">Data <input name="d" type="date" [(ngModel)]="payDate" /></label>
                            <button class="btn lime" style="align-self:flex-end"><g-icon name="payments" [size]="18" />Pagar fatura</button>
                        </form>
                    }

                    <div class="list" [class.loading]="loadingTx()">
                        @for (t of txs(); track t.id) {
                            <div class="item click" (click)="store.open(t)" (keydown.enter)="store.open(t)" tabindex="0">
                                <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"
                                    ><span class="ms">{{ icon(t) }}</span></span
                                >
                                <div class="grow">
                                    <div class="title">
                                        {{ t.description }}
                                        @if (t.installments) {
                                            <span class="tag">{{ t.installment }}/{{ t.installments }}</span>
                                        }
                                    </div>
                                    <div class="sub">
                                        {{ t.date | dmy: true }} · {{ store.catById().get(t.category_id ?? '')?.name ?? 'Sem categoria' }}
                                    </div>
                                </div>
                                <span class="amt" [class.pos]="t.amount > 0" [class.neg]="t.amount < 0">{{ t.amount | brl }}</span>
                            </div>
                        } @empty {
                            <div class="empty-state">
                                <g-icon name="receipt_long" />
                                <div><b>Fatura vazia</b>Compras feitas até o dia {{ c.closing_day }} entram aqui.</div>
                            </div>
                        }
                    </div>
                </section>
            }
        }
    `,
})
export class Cards {
    store = inject(Store);
    router = inject(Router);
    c = input<string>(); // ?c=<card id>
    hoje = today();
    status = (c: Card) => invoiceStatus(c.current_invoice_date, c.closing_day, c.due_day, this.hoje);
    cards = computed(() => this.store.cards().filter((x) => !x.archived));
    card = computed(() => this.cards().find((x) => x.id === this.c()) ?? this.cards()[0]);
    invoices = signal<Inv[]>([]);
    inv = signal('');
    sel = computed(
        () => this.invoices().find((i) => i.invoice_date === (this.inv() || this.card()?.current_invoice_date)) ?? this.invoices()[0],
    );
    txs = signal<Tx[]>([]);
    payments = signal<Tx[]>([]);
    /** dívida (+) ou crédito (−) que veio das faturas anteriores: running_due = anterior + gastos − pagamentos */
    carry = (i: Inv) => i.running_due - i.total + i.paid;
    loadingTx = signal(false);
    payAcc = '';
    payValue: number | null = null;
    payDate = today();
    short = (d: string) => monthLabel(d, true).replace('.', '') + '/' + d.slice(2, 4);
    long = (d: string) => monthLabel(d);
    icon = (t: Tx) => catIcon(this.store.catById().get(t.category_id ?? ''));
    color = (name: string, c: string | null, inst: string | null) => bankColor(name, c, inst) ?? 'var(--forest)';
    net = networkLogo;

    constructor() {
        effect(() => {
            this.store.version();
            const c = this.card();
            untracked(() => {
                if (!c) return;
                this.payAcc ||= c.payment_account_id ?? this.store.accounts()[0]?.id ?? '';
                this.fetch(c.id);
            });
        });
        effect(() => {
            const i = this.sel();
            untracked(() => this.fetchTxs(i));
        });
    }

    select(id: string) {
        this.inv.set('');
        this.payAcc = this.cards().find((x) => x.id === id)?.payment_account_id ?? this.payAcc;
        this.router.navigate([], { queryParams: { c: id }, replaceUrl: true });
    }

    async fetch(cardId: string) {
        const all = (await must(
            sb.from('invoices').select('*').eq('card_id', cardId).order('invoice_date', { ascending: false }).limit(24),
        )) as Inv[];
        this.invoices.set(all.reverse()); // antigas à esquerda, futuras à direita
        setTimeout(
            () => document.querySelector('.inv-strip .on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
            60,
        );
    }

    async fetchTxs(i: Inv | undefined) {
        if (!i) {
            this.payments.set([]);
            return this.txs.set([]);
        }
        this.loadingTx.set(true);
        const [txs, pays] = await Promise.all([
            must(
                sb
                    .from('transactions')
                    .select('*')
                    .eq('card_id', i.card_id)
                    .eq('invoice_date', i.invoice_date)
                    .order('date', { ascending: false }),
            ),
            must(sb.from('transactions').select('*').eq('pays_card_id', i.card_id).eq('invoice_date', i.invoice_date).order('date')),
        ]);
        this.txs.set(txs as Tx[]);
        this.payments.set(pays as Tx[]);
        this.loadingTx.set(false);
    }

    async pay(i: Inv) {
        const value = this.payValue ? toCents(this.payValue) : i.due;
        if (!this.payAcc || value <= 0) return;
        await must(
            sb.from('transactions').insert({
                description: `Pagamento fatura ${this.card()?.name} ${i.invoice_date.slice(5, 7)}/${i.invoice_date.slice(0, 4)}`,
                amount: -value,
                date: this.payDate,
                account_id: this.payAcc,
                pays_card_id: i.card_id,
                invoice_date: i.invoice_date,
            }),
        );
        this.payValue = null;
        await this.store.load();
        notify('Fatura paga. Limite liberado.');
    }
}
