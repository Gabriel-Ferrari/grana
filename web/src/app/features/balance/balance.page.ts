import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { BrlPipe, Store, addMonths, monthEnd, monthLabel, monthStart, must, sb, today } from '../../core';
import { BalanceLine, Flow, FlowMonth } from '../../shared/ui/charts';
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

/** Balanço do mês (e dos últimos meses): o que entrou, saiu e como ficou o saldo nas contas. */
@Component({
    imports: [BrlPipe, Icon, Flow, BalanceLine],
    template: `
        <div class="page-title reveal">
            <h1>Balanço</h1>
            <div class="month-pill" role="group" aria-label="Mês">
                <button class="btn ghost icon" (click)="go(-1)" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
                <b>{{ label() }}</b>
                <button class="btn ghost icon" (click)="go(1)" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
            </div>
        </div>

        <section class="sum-strip reveal" [class.loading]="loading()">
            <div>
                <span>Entradas</span><b class="pos">{{ cur().income | brl }}</b>
            </div>
            <div>
                <span>Saídas</span><b class="neg">{{ -cur().expense | brl }}</b>
            </div>
            <div>
                <span>Resultado</span
                ><b [class.neg]="cur().income - cur().expense < 0" [class.pos]="cur().income - cur().expense > 0">{{
                    cur().income - cur().expense | brl
                }}</b>
            </div>
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
        this.loading.set(true);
        const end = monthEnd(m) < today() ? monthEnd(m) : today();
        const [d, mo] = await Promise.all([
            m <= today()
                ? sb.rpc('balance_by_day', { p_from: m, p_to: end }).then((r) => (r.data ?? []) as Day[])
                : Promise.resolve([] as Day[]),
            must(sb.rpc('report_by_month', { p_from: addMonths(m, -5), p_to: monthEnd(m) })),
        ]);
        this.days.set(d);
        this.months.set(mo as Month[]);
        this.loading.set(false);
    }

    go(n: number) {
        this.setMonth(addMonths(this.month(), n).slice(0, 7));
    }
    setMonth(key: string) {
        this.router.navigate([], { queryParams: { m: key }, replaceUrl: true });
    }
    openDay(day: string) {
        this.router.navigate(['/lancamentos'], { queryParams: { de: day, ate: day } });
    }
}
