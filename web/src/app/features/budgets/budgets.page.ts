import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Meter } from '../../shared/ui/charts';
import { BrlPipe, Store, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, notify, sb, toCents, today } from '../../core';
import { Icon } from '../../shared/ui/icon';

@Component({
    imports: [BrlPipe, FormsModule, Meter, Icon],
    template: `
        <div class="page-title reveal">
            <h1>Limites de gasto</h1>
            <div class="month-nav">
                <button class="btn ghost icon" (click)="month.set(addMonths(month(), -1))" aria-label="Mês anterior">
                    <g-icon name="chevron_left" />
                </button>
                <b>{{ label() }}</b>
                <button class="btn ghost icon" (click)="month.set(addMonths(month(), 1))" aria-label="Próximo mês">
                    <g-icon name="chevron_right" />
                </button>
            </div>
        </div>

        <section class="panel hero reveal">
            <span class="muted">Gasto nas categorias com limite</span>
            <div class="hero-value" style="font-size:clamp(2rem,5vw,2.8rem)">
                {{ totalUsed() | brl }} <span style="font-size:.45em;font-weight:600" class="muted">de {{ totalLimit() | brl }}</span>
            </div>
            @if (totalLimit()) {
                <p style="margin:.1rem 0 .3rem;font-weight:650" [class.neg]="totalUsed() > totalLimit()">
                    {{ totalUsed() > totalLimit() ? 'Passou' : 'Disponível' }} {{ abs(totalLimit() - totalUsed()) | brl }} · {{ verdict() }}
                </p>
            }
            @if (pace() !== null) {
                <p class="muted" style="margin:0">
                    Passaram {{ (pace()! * 100).toFixed(0) }}% do mês. O traço em cada barra marca até onde seria o ritmo ideal hoje.
                </p>
            }
        </section>

        <section class="panel reveal" [class.loading]="loading()">
            <div class="stack" style="gap:1.4rem">
                @for (b of items(); track b.category_id) {
                    <div>
                        <div
                            class="bud-open"
                            role="link"
                            tabindex="0"
                            (click)="open(b.category_id)"
                            (keydown.enter)="open(b.category_id)"
                            title="Ver lançamentos da categoria"
                        >
                            <g-meter [label]="b.name" [value]="b.used" [max]="b.amount" [pace]="pace()" />
                        </div>
                        <div class="row between small" style="margin-top:.25rem;gap:.6rem">
                            <span class="muted">
                                @if (b.prev) {
                                    {{ b.used >= b.prev ? '▲' : '▼' }} {{ pct(b.used, b.prev) }}% vs {{ prevLabel() }} ({{ b.prev | brl }})
                                } @else {
                                    sem gasto em {{ prevLabel() }}
                                }
                            </span>
                            <button class="btn ghost" style="font-size:.78rem;padding:.2rem .4rem" (click)="remove(b.category_id, b.name)">
                                <g-icon name="close" [size]="15" />remover
                            </button>
                        </div>
                    </div>
                } @empty {
                    <div class="empty-state">
                        <g-icon name="track_changes" />
                        <div><b>Nenhum limite ainda</b>Defina quanto quer gastar por mês numa categoria — vale para todos os meses.</div>
                    </div>
                }
            </div>
        </section>

        <section class="panel reveal">
            <h2 style="margin-bottom:.8rem">Novo limite</h2>
            <form class="row wrap" (ngSubmit)="add()">
                <label style="min-width:200px"
                    >Categoria
                    <select name="c" [(ngModel)]="newCat" required>
                        <option value="">Escolha</option>
                        @for (c of expenseCats(); track c.id) {
                            <option [value]="c.id">{{ c.name }}</option>
                        }
                    </select></label
                >
                <label style="min-width:160px"
                    >Limite mensal (R$) <input name="v" type="number" step="0.01" min="1" [(ngModel)]="newValue" required
                /></label>
                <button class="btn primary" style="align-self:flex-end"><g-icon name="add" [size]="18" />Definir</button>
            </form>
            @if (suggestions().length) {
                <p class="muted small" style="margin:1rem 0 .4rem">Maiores gastos sem limite neste mês:</p>
                <div class="row wrap">
                    @for (s of suggestions(); track s.id) {
                        <button class="chip" style="cursor:pointer" (click)="newCat = s.id; newValue = s.round">
                            <span class="ms" style="font-size:16px">{{ s.icon }}</span
                            >{{ s.name }} · {{ s.value | brl }}
                        </button>
                    }
                </div>
            }
        </section>
    `,
})
export class Budgets {
    store = inject(Store);
    router = inject(Router);
    addMonths = addMonths;
    month = signal(monthStart(today()));
    label = computed(() => monthLabel(this.month()));
    loading = signal(true);
    budgets = signal<{ category_id: string; amount: number }[]>([]);
    spent = signal(new Map<string, number>());
    prevSpent = signal(new Map<string, number>());
    prevLabel = computed(() => monthLabel(addMonths(this.month(), -1), true).replace('.', ''));
    abs = Math.abs;
    pct = (a: number, b: number) => Math.round((Math.abs(a - b) / b) * 100);
    /** leitura do total, como a dica do rodapé do Organizze */
    verdict = computed(() => {
        const used = this.totalUsed(),
            lim = this.totalLimit(),
            p = this.pace();
        if (used > lim) return 'limite do mês estourado';
        if (p === null) return used / lim > 0.9 ? 'quase no limite' : 'dentro do limite';
        return used / lim <= p ? 'no ritmo, boa margem' : 'acima do ritmo: segure até o fim do mês';
    });
    open(cat: string) {
        this.router.navigate(['/lancamentos'], { queryParams: { cat, m: this.month().slice(0, 7) } });
    }
    newCat = '';
    newValue: number | null = null;

    /** fração do mês já passada (só no mês atual; meses passados = fechado, futuros = sem ritmo) */
    pace = computed(() => {
        const m = this.month(),
            t = today();
        if (m.slice(0, 7) !== t.slice(0, 7)) return null;
        return +t.slice(8) / +monthEnd(m).slice(8);
    });
    expenseCats = computed(() => this.store.categories().filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived));
    items = computed(() =>
        this.budgets()
            .map((b) => {
                const c = this.store.catById().get(b.category_id);
                return {
                    ...b,
                    used: this.spent().get(b.category_id) ?? 0,
                    prev: this.prevSpent().get(b.category_id) ?? 0,
                    name: c?.name ?? '?',
                };
            })
            .sort((a, b) => b.used / b.amount - a.used / a.amount),
    );
    totalUsed = computed(() => this.items().reduce((s, b) => s + b.used, 0));
    totalLimit = computed(() => this.items().reduce((s, b) => s + b.amount, 0));
    suggestions = computed(() => {
        const has = new Set(this.budgets().map((b) => b.category_id));
        return [...this.spent()]
            .filter(([id, v]) => id && !has.has(id) && v > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, value]) => {
                const c = this.store.catById().get(id);
                return { id, value, name: c?.name ?? '?', icon: catIcon(c), round: Math.ceil(value / 100 / 50) * 50 };
            });
    });

    constructor() {
        effect(() => {
            this.store.version();
            const m = this.month();
            untracked(() => this.fetch(m));
        });
    }

    async fetch(m: string) {
        this.loading.set(true);
        const prev = addMonths(m, -1);
        const [b, r, pr] = await Promise.all([
            must(sb.from('budgets').select('category_id, amount')),
            must(sb.rpc('report_by_category', { p_from: m, p_to: monthEnd(m) })),
            must(sb.rpc('report_by_category', { p_from: prev, p_to: monthEnd(prev) })),
        ]);
        this.prevSpent.set(new Map((pr as { category_id: string; expense: number }[]).map((x) => [x.category_id, x.expense])));
        this.budgets.set(b as { category_id: string; amount: number }[]);
        this.spent.set(new Map((r as { category_id: string; expense: number }[]).map((x) => [x.category_id, x.expense])));
        this.loading.set(false);
    }

    async add() {
        if (!this.newCat || !this.newValue) return;
        await must(
            sb.from('budgets').upsert({ category_id: this.newCat, amount: toCents(this.newValue) }, { onConflict: 'user_id,category_id' }),
        );
        this.newCat = '';
        this.newValue = null;
        notify('Limite definido');
        this.fetch(this.month());
    }

    async remove(category_id: string, name: string) {
        const prev = this.budgets().find((b) => b.category_id === category_id);
        await must(sb.from('budgets').delete().eq('category_id', category_id));
        this.fetch(this.month());
        notify(`Limite de ${name} removido`, {
            action: {
                label: 'Desfazer',
                run: async () => {
                    await must(sb.from('budgets').insert(prev!));
                    this.fetch(this.month());
                },
            },
        });
    }
}
