import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { BrlPipe, DmyPipe, Store, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, sb, today, swr, cached } from '../../core';
import { BalanceLine, Donut, Flow, FlowMonth, RankItem } from '../../shared/ui/charts';
import { Icon } from '../../shared/ui/icon';

interface Day {
    day: string;
    income: number;
    expense: number;
    balance: number;
}
interface Month {
    month: string;
    income: number;
    expense: number;
}
interface CatRow {
    category_id: string | null;
    income: number;
    expense: number;
}

/** Balanço do mês (como o Relatórios do Organizze): entradas x saídas, onde mais gastou, saldo nas contas e últimos meses. */
@Component({
    imports: [BrlPipe, DmyPipe, Icon, Flow, BalanceLine, Donut],
    template: `
        <div class="page-title reveal">
            <h1>Balanço</h1>
            <div class="month-pill" role="group" aria-label="Mês">
                <button class="btn ghost icon" (click)="go(-1)" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
                <b>{{ label() }}</b>
                <button class="btn ghost icon" (click)="go(1)" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
            </div>
        </div>

        <section class="panel reveal" [class.loading]="loading()">
            <div class="panel-head">
                <h2>Entradas x Saídas</h2>
                <span class="muted small">{{ month() | dmy: true }} a {{ lastDay() | dmy: true }}</span>
            </div>
            <div class="io">
                <div class="io-bars" aria-hidden="true">
                    <span [style.height.%]="barPct(cur().income)" style="background:var(--in)"></span>
                    <span [style.height.%]="barPct(cur().expense)" style="background:var(--out)"></span>
                </div>
                <div class="io-rows">
                    <div>
                        <span>Entradas</span><b class="pos">{{ cur().income | brl }}</b>
                    </div>
                    <div>
                        <span>Saídas</span><b class="neg">{{ -cur().expense | brl }}</b>
                    </div>
                    <div class="res">
                        <span>Resultado</span
                        ><b [class.neg]="cur().income - cur().expense < 0" [class.pos]="cur().income - cur().expense > 0">{{
                            cur().income - cur().expense | brl
                        }}</b>
                    </div>
                </div>
            </div>
        </section>

        <section class="panel reveal" [class.loading]="loading()">
            <div class="panel-head cat-head">
                <h2>{{ kind() === 'exp' ? 'Onde você mais gastou' : 'De onde veio o dinheiro' }}</h2>
                <div class="seg small" role="group" aria-label="Tipo">
                    <button [class.on]="kind() === 'exp'" (click)="kind.set('exp')">Despesas</button>
                    <button [class.on]="kind() === 'inc'" (click)="kind.set('inc')">Receitas</button>
                </div>
            </div>
            @if (catItems().length) {
                <g-donut [items]="catItems()" [caption]="kind() === 'exp' ? 'Despesas' : 'Receitas'" (pick)="openCat($event)" />
                <div class="list cat-list">
                    @for (c of catItems(); track c.id) {
                        <div class="item click" (click)="openCat(c.id)" (keydown.enter)="openCat(c.id)" tabindex="0">
                            <span class="cat-ico" [style.--cc]="c.color"
                                ><span class="ms">{{ c.icon }}</span></span
                            >
                            <div class="grow">
                                <div class="title">{{ c.name }}</div>
                            </div>
                            <div class="cat-val">
                                <b>{{ c.value | brl }}</b
                                ><span>{{ pct(c.value) }}%</span>
                            </div>
                        </div>
                    }
                </div>
            } @else if (!loading()) {
                <div class="empty-state">
                    <g-icon name="donut_large" />
                    <div><b>Nenhum lançamento no mês</b>Escolha outro mês ou adicione lançamentos.</div>
                </div>
            }
        </section>

        <section class="panel reveal" [class.loading]="loading()">
            <div class="panel-head">
                <div>
                    <h2>Saldo nas contas</h2>
                    <p class="muted small" style="margin:.15rem 0 0">Só contas (sem cartões); toque num dia para ver os lançamentos</p>
                </div>
            </div>
            <div class="bal-ends">
                <div>
                    <span>Começou o mês com</span><b>{{ startBal() | brl }}</b>
                </div>
                <g-icon name="arrow_forward" class="muted" />
                <div>
                    <span>{{ isCurrent() ? 'Hoje' : 'Terminou com' }}</span
                    ><b [class.neg]="endBal() < startBal()" [class.pos]="endBal() > startBal()">{{ endBal() | brl }}</b>
                </div>
            </div>
            <g-balance [points]="line()" />
            <h3 class="small muted" style="margin:1rem 0 .2rem">Entrou e saiu das contas, por dia</h3>
            <g-flow [months]="bars()" [showNet]="false" [height]="180" (pick)="openDay($event)" />
        </section>

        <section class="panel reveal">
            <div class="panel-head">
                <div>
                    <h2>Últimos meses</h2>
                    <p class="muted small" style="margin:.15rem 0 0">Toque num mês para ver o balanço dele</p>
                </div>
            </div>
            <g-flow [months]="monthBars()" [active]="month().slice(0, 7)" (pick)="setMonth($event)" />
            <div class="list" style="margin-top:.6rem">
                @for (x of months().slice().reverse(); track x.month) {
                    <div
                        class="item click"
                        [class.sel]="x.month.slice(0, 7) === month().slice(0, 7)"
                        (click)="setMonth(x.month.slice(0, 7))"
                        (keydown.enter)="setMonth(x.month.slice(0, 7))"
                        tabindex="0"
                    >
                        <div class="grow">
                            <div class="title">{{ monthName(x.month) }}</div>
                            <div class="sub">entrou {{ x.income | brl }} · saiu {{ x.expense | brl }}</div>
                        </div>
                        <span class="amt" [class.pos]="x.income - x.expense > 0" [class.neg]="x.income - x.expense < 0">{{
                            x.income - x.expense | brl
                        }}</span>
                    </div>
                }
            </div>
        </section>
    `,
    styles: [
        `
            .io {
                display: flex;
                align-items: flex-end;
                gap: 1.2rem;
            }
            .io-bars {
                display: flex;
                align-items: flex-end;
                gap: 6px;
                height: 92px;
                flex: none;
            }
            .io-bars span {
                width: 28px;
                min-height: 3px;
                border-radius: 6px 6px 2px 2px;
                transition: height 0.3s;
            }
            .io-rows {
                flex: 1;
                min-width: 0;
                display: grid;
                gap: 0.4rem;
            }
            .io-rows div {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 0.6rem;
            }
            .io-rows span {
                font-size: 0.8rem;
                font-weight: 650;
                color: var(--muted);
            }
            .io-rows b {
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }
            .io-rows .res {
                padding-top: 0.4rem;
                border-top: 1px solid var(--line);
            }
            /* título + Despesas/Receitas: no celular o seletor desce para a linha de baixo */
            .cat-head {
                flex-wrap: wrap;
                row-gap: 0.5rem;
            }
            /* ícone redondo como no Organizze */
            .cat-list .cat-ico {
                border-radius: 50%;
            }
        `,
    ],
})
export class Balance {
    store = inject(Store);
    router = inject(Router);
    /** ?m=2026-10 */
    m = input<string>();
    month = computed(() => (this.m() ? this.m() + '-01' : monthStart(today())));
    loading = signal(true);
    days = signal<Day[]>([]);
    months = signal<Month[]>([]);
    label = computed(() => monthLabel(this.month()));
    isCurrent = computed(() => this.month().slice(0, 7) === today().slice(0, 7));
    cur = computed(
        () => this.months().find((x) => x.month.slice(0, 7) === this.month().slice(0, 7)) ?? { month: this.month(), income: 0, expense: 0 },
    );
    /** saldo antes do 1º dia = saldo do 1º dia − o que mexeu nele */
    startBal = computed(() => {
        const d = this.days()[0];
        return d ? d.balance - d.income + d.expense : 0;
    });
    endBal = computed(() => this.days().at(-1)?.balance ?? 0);
    lastDay = computed(() => monthEnd(this.month()));
    /** barras de entradas x saídas: a maior ocupa a altura toda */
    barPct = (v: number) => (v / (Math.max(this.cur().income, this.cur().expense) || 1)) * 100;
    /** categorias do mês (já somadas na categoria-pai pelo banco), da maior para a menor, como no Organizze */
    kind = signal<'exp' | 'inc'>('exp');
    byCat = signal<CatRow[]>([]);
    catItems = computed(() => {
        const k = this.kind() === 'exp' ? 'expense' : 'income';
        return this.byCat()
            .map((c): RankItem => {
                const cat = this.store.catById().get(c.category_id ?? '');
                return {
                    id: c.category_id ?? 'none',
                    name: cat?.name ?? 'Sem categoria',
                    value: c[k],
                    color: cat?.color,
                    icon: catIcon(cat),
                };
            })
            .filter((c) => c.value > 0)
            .sort((a, b) => b.value - a.value);
    });
    catTotal = computed(() => this.catItems().reduce((s, c) => s + c.value, 0));
    pct = (v: number) => (this.catTotal() ? Math.round((v / this.catTotal()) * 1000) / 10 : 0);
    line = computed(() => this.days().map((d) => ({ label: d.day.slice(8) + '/' + d.day.slice(5, 7), value: d.balance })));
    bars = computed<FlowMonth[]>(() =>
        this.days().map((d) => ({ key: d.day, label: String(+d.day.slice(8)), inc: d.income, exp: d.expense })),
    );
    monthBars = computed<FlowMonth[]>(() =>
        this.months().map((x) => ({
            key: x.month.slice(0, 7),
            label: monthLabel(x.month, true).replace('.', ''),
            inc: x.income,
            exp: x.expense,
        })),
    );
    monthName = (iso: string) => monthLabel(iso);

    constructor() {
        effect(() => {
            this.store.version();
            const m = this.month();
            untracked(() => this.fetch(m));
        });
    }

    async fetch(m: string) {
        const end = monthEnd(m) < today() ? monthEnd(m) : today();
        if (!cached('bal:' + m)) this.loading.set(true);
        await swr(
            'bal:' + m,
            () =>
                Promise.all([
                    m <= today()
                        ? sb.rpc('balance_by_day', { p_from: m, p_to: end }).then((r) => (r.data ?? []) as Day[])
                        : Promise.resolve([] as Day[]),
                    must(sb.rpc('report_by_month', { p_from: addMonths(m, -5), p_to: monthEnd(m) })),
                    must(sb.rpc('report_by_category', { p_from: m, p_to: monthEnd(m) })),
                ]),
            ([d, mo, c]) => {
                this.days.set(d);
                this.months.set(mo as Month[]);
                this.byCat.set(c as CatRow[]);
                this.loading.set(false);
            },
        );
    }

    go(n: number) {
        this.setMonth(addMonths(this.month(), n).slice(0, 7));
    }
    setMonth(key: string) {
        this.router.navigate([], { queryParams: { m: key }, replaceUrl: true });
    }
    /** "Outras" da rosca não é categoria: ignora */
    openCat(id: string) {
        if (id !== '__other') this.router.navigate(['/lancamentos'], { queryParams: { m: this.month().slice(0, 7), cat: id } });
    }
    openDay(day: string) {
        this.router.navigate(['/lancamentos'], { queryParams: { de: day, ate: day } });
    }
}
