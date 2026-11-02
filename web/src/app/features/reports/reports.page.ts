import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BalanceLine, Donut, Flow, FlowMonth, RankBars, RankItem } from '../../shared/ui/charts';
import { ChipOption, ChipSelect } from '../../shared/ui/fields';
import { BrlPipe, DmyPipe, Store, Tx, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, sb, today } from '../../core';
import { Recurring, detectRecurring } from './recurring';
import { Icon } from '../../shared/ui/icon';

@Component({
    imports: [BrlPipe, DmyPipe, FormsModule, RouterLink, Flow, RankBars, BalanceLine, Donut, ChipSelect, Icon],
    template: `
        <div class="page-title reveal rep-head">
            <h1>Relatórios</h1>
            <div class="row" style="gap:.4rem;flex-wrap:wrap">
                @if (preset() === 1) {
                    <div class="month-pill" role="group" aria-label="Mês">
                        <button class="btn ghost icon" (click)="go(-1)" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
                        <b>{{ monthTitle() }}</b>
                        <button class="btn ghost icon" (click)="go(1)" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
                    </div>
                }
                <g-chip-select
                    label="Período"
                    [options]="periodOptions"
                    [value]="'' + preset()"
                    [clearable]="false"
                    (valueChange)="setPreset(+$event)"
                />
                @if (preset() === 0) {
                    <input type="month" style="width:auto" [ngModel]="from()" (ngModelChange)="from.set($event)" aria-label="De" />
                    <input type="month" style="width:auto" [ngModel]="to()" (ngModelChange)="to.set($event)" aria-label="Até" />
                }
            </div>
        </div>

        <div class="tabs reveal" role="tablist" aria-label="Relatórios">
            @for (t of tabs; track t.k) {
                <button role="tab" [attr.aria-selected]="tab() === t.k" [class.on]="tab() === t.k" (click)="tab.set(t.k)">
                    <g-icon [name]="t.icon" [size]="18" />{{ t.label }}
                </button>
            }
        </div>

        <div class="stack" [class.loading]="loading()">
            @switch (tab()) {
                @case ('cat') {
                    <section class="panel reveal">
                        <div class="panel-head">
                            <div class="seg" role="group" aria-label="Tipo">
                                <button [class.on]="catKind() === 'exp'" (click)="catKind.set('exp')">Despesas</button>
                                <button [class.on]="catKind() === 'inc'" (click)="catKind.set('inc')">Receitas</button>
                            </div>
                            <div class="rep-total">
                                <span>Total</span
                                ><b [class.neg]="catKind() === 'exp'" [class.pos]="catKind() === 'inc'">{{ catTotal() | brl }}</b>
                            </div>
                        </div>
                        @if (store.v2() && catKind() === 'exp') {
                            <div class="card-date">
                                <g-icon name="credit_card" [size]="16" />Gastos do cartão pela data da
                                <div class="seg small" role="group" aria-label="Data do cartão">
                                    <button [class.on]="!byInvoice()" (click)="setByInvoice(false)">compra</button>
                                    <button [class.on]="byInvoice()" (click)="setByInvoice(true)">fatura</button>
                                </div>
                            </div>
                        }
                        @if (catItems().length) {
                            <g-donut
                                [items]="catItems()"
                                [caption]="catKind() === 'exp' ? 'Despesas' : 'Receitas'"
                                (pick)="toggleCat($event)"
                            />
                            <div class="list cat-list">
                                @for (c of catItems(); track c.id) {
                                    <div
                                        class="item click"
                                        [class.sel]="openedCat() === c.id"
                                        (click)="toggleCat(c.id)"
                                        (keydown.enter)="toggleCat(c.id)"
                                        tabindex="0"
                                        [attr.aria-expanded]="openedCat() === c.id"
                                    >
                                        <span class="cat-ico" [style.--cc]="c.color"
                                            ><span class="ms">{{ c.icon }}</span></span
                                        >
                                        <div class="grow">
                                            <div class="title">{{ c.name }}</div>
                                            <div class="cat-bar">
                                                <span [style.width.%]="pct(c.value)" [style.background]="c.color || 'var(--muted)'"></span>
                                            </div>
                                        </div>
                                        <div class="cat-val">
                                            <b>{{ c.value | brl }}</b
                                            ><span>{{ pct(c.value) }}%</span>
                                        </div>
                                    </div>
                                    @if (openedCat() === c.id) {
                                        <div class="cat-detail" [class.loading]="catTxLoading()">
                                            @for (t of catTx(); track t.id) {
                                                <div
                                                    class="item click"
                                                    (click)="store.open(t)"
                                                    (keydown.enter)="store.open(t)"
                                                    tabindex="0"
                                                >
                                                    <div class="grow">
                                                        <div class="title">{{ t.description }}</div>
                                                        <div class="sub">
                                                            {{ t.date | dmy: true }} ·
                                                            {{ store.originName().get(t.account_id ?? t.card_id ?? '') }}
                                                        </div>
                                                    </div>
                                                    <span class="amt" [class.neg]="t.amount < 0" [class.pos]="t.amount > 0">{{
                                                        t.amount | brl
                                                    }}</span>
                                                </div>
                                            } @empty {
                                                @if (!catTxLoading()) {
                                                    <p class="muted small" style="margin:.4rem 0">Nenhum lançamento.</p>
                                                }
                                            }
                                            <a class="more-link" (click)="openCat(c.id)" (keydown.enter)="openCat(c.id)" tabindex="0"
                                                >Ver em Lançamentos <g-icon name="chevron_right" [size]="18"
                                            /></a>
                                        </div>
                                    }
                                }
                            </div>
                        } @else {
                            <div class="empty-state">
                                <g-icon name="donut_large" />
                                <div><b>Nada no período</b>Escolha outro mês ou período.</div>
                            </div>
                        }
                    </section>
                }
                @case ('bal') {
                    <section class="panel reveal">
                        <div class="rep-sum">
                            <div>
                                <span>Entradas</span><b class="pos">{{ sum().inc | brl }}</b>
                            </div>
                            <div>
                                <span>Saídas</span><b class="neg">{{ -sum().exp | brl }}</b>
                            </div>
                            <div>
                                <span>Resultado</span
                                ><b [class.neg]="sum().inc - sum().exp < 0" [class.pos]="sum().inc - sum().exp > 0">{{
                                    sum().inc - sum().exp | brl
                                }}</b>
                            </div>
                        </div>
                        <g-flow [months]="months()" [active]="current" (pick)="openMonth($event)" />
                        <details class="table-view">
                            <summary>Ver em tabela</summary>
                            <table>
                                <tr>
                                    <th>Mês</th>
                                    <th>Entradas</th>
                                    <th>Saídas</th>
                                    <th>Resultado</th>
                                </tr>
                                @for (m of months(); track m.key) {
                                    <tr>
                                        <td>{{ m.label }}</td>
                                        <td>{{ m.inc | brl }}</td>
                                        <td>{{ m.exp | brl }}</td>
                                        <td>{{ m.inc - m.exp | brl }}</td>
                                    </tr>
                                }
                            </table>
                        </details>
                    </section>
                    <section class="panel reveal">
                        <div class="panel-head">
                            <h2>Saldo nas contas</h2>
                            <div class="seg small" role="group" aria-label="Agrupar por">
                                @for (g of grans; track g.k) {
                                    <button [class.on]="gran() === g.k" (click)="gran.set(g.k)">{{ g.label }}</button>
                                }
                            </div>
                        </div>
                        <g-balance [points]="balLine()" />
                        <g-flow [months]="balBars()" [showNet]="gran() !== 'dia'" [height]="180" (pick)="openRange($event)" />
                        <a class="more-link" routerLink="/balanco">Balanço completo <g-icon name="chevron_right" [size]="18" /></a>
                    </section>
                }
                @case ('tags') {
                    <section class="panel reveal">
                        <p class="muted small" style="margin:0 0 .8rem">Saídas no período por tag; toque para ver os lançamentos</p>
                        <g-rank-bars
                            [items]="tagItems()"
                            [max]="15"
                            (pick)="openTag($event)"
                            empty="Nenhum lançamento com tag no período."
                        />
                    </section>
                }
                @case ('rec') {
                    <section class="panel reveal">
                        <div class="panel-head">
                            <p class="muted small" style="margin:0">Detectadas nos últimos 6 meses: caem quase todo mês</p>
                            <div class="rep-total">
                                <span>Por mês</span><b class="neg">{{ -recTotal() | brl }}</b>
                            </div>
                        </div>
                        <div class="list">
                            @for (r of recurring(); track r.key) {
                                <div
                                    class="item click"
                                    (click)="store.open($any(r.last))"
                                    tabindex="0"
                                    (keydown.enter)="store.open($any(r.last))"
                                >
                                    <span class="cat-ico" [style.--cc]="store.catById().get(r.category_id ?? '')?.color"
                                        ><span class="ms">{{ recIcon(r) }}</span></span
                                    >
                                    <div class="grow">
                                        <div class="title">{{ r.name }}</div>
                                        <div class="sub">
                                            {{ store.catById().get(r.category_id ?? '')?.name ?? 'Sem categoria' }} · {{ r.months }} meses ·
                                            próxima ~{{ r.next | dmy: true }}
                                        </div>
                                    </div>
                                    <span class="amt neg" [title]="r.stable ? 'Valor fixo' : 'Valor varia: mediana dos meses'"
                                        >{{ r.stable ? '' : '≈ ' }}{{ -r.amount | brl }}</span
                                    >
                                </div>
                            } @empty {
                                <div class="empty-state">
                                    <span class="ms">event_repeat</span>
                                    <div>
                                        <b>Nada recorrente ainda</b>Contas e assinaturas aparecem aqui depois de 3 meses de histórico.
                                    </div>
                                </div>
                            }
                        </div>
                    </section>
                }
            }
        </div>
    `,
})
export class Reports {
    store = inject(Store);
    router = inject(Router);
    presets = [
        { n: 1, label: 'Este mês' },
        { n: 3, label: '3 meses' },
        { n: 6, label: '6 meses' },
        { n: 12, label: '12 meses' },
    ];
    current = today().slice(0, 7);
    /** padrão: este mês (como no Organizze) */
    preset = signal(1);
    to = signal(this.current);
    from = signal(this.current);
    periodOptions: ChipOption[] = [
        { value: '1', label: 'Mês', icon: 'calendar_month' },
        { value: '3', label: 'Últimos 3 meses', icon: 'date_range' },
        { value: '6', label: 'Últimos 6 meses', icon: 'date_range' },
        { value: '12', label: 'Últimos 12 meses', icon: 'date_range' },
        { value: '0', label: 'Personalizado', icon: 'tune' },
    ];
    tabs = [
        { k: 'cat', label: 'Categorias', icon: 'donut_large' },
        { k: 'bal', label: 'Balanço', icon: 'balance' },
        { k: 'tags', label: 'Tags', icon: 'sell' },
        { k: 'rec', label: 'Recorrentes', icon: 'event_repeat' },
    ] as const;
    tab = signal<'cat' | 'bal' | 'tags' | 'rec'>('cat');
    catKind = signal<'exp' | 'inc'>('exp');
    /** categoria aberta no relatório: lançamentos dela no período, do maior valor para o menor (Organizze) */
    openedCat = signal('');
    catTx = signal<Tx[]>([]);
    catTxLoading = signal(false);
    async toggleCat(id: string) {
        if (id === '__other' || this.openedCat() === id) return this.openedCat.set('');
        this.openedCat.set(id);
        this.catTxLoading.set(true);
        this.catTx.set([]);
        const ids = [
            id,
            ...this.store
                .categories()
                .filter((c) => c.parent_id === id)
                .map((c) => c.id),
        ];
        let q = sb
            .from('transactions')
            .select('*')
            .gte('date', this.from() + '-01')
            .lte('date', monthEnd(this.to() + '-01'))
            .is('transfer_id', null)
            .is('pays_card_id', null);
        q = id === 'none' ? q.is('category_id', null) : q.in('category_id', ids);
        q = this.catKind() === 'exp' ? q.lt('amount', 0).order('amount') : q.gt('amount', 0).order('amount', { ascending: false });
        const rows = (await must(q.limit(300))) as Tx[];
        if (this.openedCat() === id) this.catTx.set(rows);
        this.catTxLoading.set(false);
    }
    catItems = computed(() =>
        (this.catKind() === 'exp' ? this.expenses() : this.incomes()).filter((c) => c.value > 0).sort((a, b) => b.value - a.value),
    );
    catTotal = computed(() => this.catItems().reduce((s, c) => s + c.value, 0));
    pct = (v: number) => (this.catTotal() ? Math.round((v / this.catTotal()) * 1000) / 10 : 0);
    monthTitle = computed(() => monthLabel(this.to() + '-01'));
    /** setas do mês (período "Mês") */
    go(n: number) {
        const m = addMonths(this.to() + '-01', n).slice(0, 7);
        this.from.set(m);
        this.to.set(m);
    }
    loading = signal(true);
    byMonth = signal<{ month: string; income: number; expense: number }[]>([]);
    byCat = signal<{ category_id: string | null; income: number; expense: number }[]>([]);

    months = computed<FlowMonth[]>(() =>
        this.byMonth().map((m) => ({
            key: m.month.slice(0, 7),
            inc: m.income,
            exp: m.expense,
            label: monthLabel(m.month, true).replace('.', '') + (this.byMonth().length > 12 ? '/' + m.month.slice(2, 4) : ''),
        })),
    );
    sum = computed(() => this.months().reduce((s, m) => ({ inc: s.inc + m.inc, exp: s.exp + m.exp }), { inc: 0, exp: 0 }));
    private rank = (k: 'income' | 'expense') =>
        this.byCat().map((c): RankItem => {
            const cat = this.store.catById().get(c.category_id ?? '');
            return { id: c.category_id ?? 'none', name: cat?.name ?? 'Sem categoria', value: c[k], color: cat?.color, icon: catIcon(cat) };
        });
    expenses = computed(() => this.rank('expense'));
    incomes = computed(() => this.rank('income'));

    /** compras no cartão contam pela data da compra/parcela (padrão) ou pelo vencimento da fatura, como no Organizze */
    byInvoice = signal(localStorage.getItem('grana.byInvoice') === '1');
    setByInvoice(on: boolean) {
        this.byInvoice.set(on);
        localStorage.setItem('grana.byInvoice', on ? '1' : '0');
    }
    grans = [
        { k: 'dia', label: 'Dia' },
        { k: 'semana', label: 'Semana' },
        { k: 'mes', label: 'Mês' },
    ] as const;
    gran = signal<'dia' | 'semana' | 'mes'>('dia'); // padrão "este mês": por dia
    balDays = signal<{ day: string; income: number; expense: number; balance: number }[]>([]);
    /** agrupa o balanço diário: soma entradas/saídas e pega o saldo do último dia */
    private buckets = computed(() => {
        const g = this.gran(),
            out = new Map<string, { from: string; to: string; label: string; inc: number; exp: number; bal: number }>();
        for (const d of this.balDays()) {
            const dt = new Date(d.day + 'T12:00:00');
            const monday = new Date(dt);
            monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
            const key = g === 'dia' ? d.day : g === 'semana' ? monday.toLocaleDateString('en-CA') : d.day.slice(0, 7);
            const label =
                g === 'mes'
                    ? monthLabel(d.day, true).replace('.', '')
                    : (g === 'semana' ? monday : dt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const b = out.get(key) ?? { from: d.day, to: d.day, label, inc: 0, exp: 0, bal: 0 };
            b.inc += d.income;
            b.exp += d.expense;
            b.bal = d.balance;
            b.to = d.day;
            out.set(key, b);
        }
        return [...out.values()];
    });
    balBars = computed<FlowMonth[]>(() =>
        this.buckets().map((b) => ({ key: b.from + '|' + b.to, label: b.label, inc: b.inc, exp: b.exp })),
    );
    balLine = computed(() => this.buckets().map((b) => ({ label: b.label, value: b.bal })));
    tags = signal<{ tag: string; expense: number }[]>([]);
    tagItems = computed<RankItem[]>(() =>
        this.tags()
            .filter((t) => t.expense > 0)
            .map((t) => ({ id: t.tag, name: t.tag, value: t.expense, icon: 'sell' })),
    );
    openRange(key: string) {
        const [de, ate] = key.split('|');
        this.router.navigate(['/lancamentos'], { queryParams: { de, ate } });
    }
    openTag(tag: string) {
        this.router.navigate(['/lancamentos'], { queryParams: { q: tag, de: this.from() + '-01', ate: monthEnd(this.to() + '-01') } });
    }

    recurring = signal<Recurring[]>([]);
    recTotal = computed(() => this.recurring().reduce((s, r) => s + r.amount, 0));
    recIcon = (r: Recurring) => catIcon(this.store.catById().get(r.category_id ?? ''));

    constructor() {
        effect(() => {
            this.store.version();
            const f = this.from(),
                t = this.to(),
                bi = this.byInvoice() && this.store.v2();
            untracked(() => this.fetch(f, t, bi));
        });
        effect(() => {
            this.store.version();
            untracked(() => this.fetchRecurring());
        });
    }

    /** despesas dos últimos 6 meses (sem parcelas, transferências e pagamentos de fatura) */
    async fetchRecurring() {
        const rows = await must(
            sb
                .from('transactions')
                .select('*')
                .lt('amount', 0)
                .gte('date', addMonths(monthStart(today()), -6))
                .lte('date', today())
                .is('transfer_id', null)
                .is('pays_card_id', null)
                .is('installments', null)
                .limit(5000),
        );
        this.recurring.set(detectRecurring(rows as Tx[], today()));
    }

    setPreset(n: number) {
        this.preset.set(n);
        if (n === 0) return; // personalizado: mantém o intervalo e mostra os campos
        this.gran.set(n === 1 ? 'dia' : 'mes'); // um mês só: balanço por dia
        this.to.set(this.current);
        this.from.set(addMonths(this.current + '-01', -(n - 1)).slice(0, 7));
    }

    async fetch(from: string, to: string, byInvoice = false) {
        if (!from || !to) return;
        this.loading.set(true);
        const args = { p_from: from + '-01', p_to: monthEnd(to + '-01'), ...(byInvoice ? { p_by_invoice: true } : {}) };
        const end = monthEnd(to + '-01') < today() ? monthEnd(to + '-01') : today();
        const [m, c, b, t] = await Promise.all([
            must(sb.rpc('report_by_month', args)),
            must(sb.rpc('report_by_category', args)),
            sb.rpc('balance_by_day', { p_from: from + '-01', p_to: end }).then((r) => r.data ?? []),
            sb.rpc('report_by_tag', args).then((r) => r.data ?? []),
        ]);
        this.balDays.set(b as never);
        this.tags.set(t as never);
        this.byMonth.set(m as never);
        this.byCat.set(c as never);
        this.loading.set(false);
    }

    openMonth(key: string) {
        this.router.navigate(['/lancamentos'], { queryParams: { m: key } });
    }
    openCat(id: string) {
        if (id !== '__other') this.router.navigate(['/lancamentos'], { queryParams: { cat: id, m: this.to() } });
    }
}
