import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BrlPipe, DmyPipe, Store, Tx, catIcon, must, sb } from '../../core';
import { ChipOption, ChipSelect } from '../../shared/ui/fields';
import { Icon } from '../../shared/ui/icon';

/** Lançamentos que chegaram sozinhos (notificação / Open Finance) esperando conferência — como a tela do Organizze. */
@Component({
    imports: [BrlPipe, DmyPipe, Icon, ChipSelect],
    template: `
        <div class="page-title reveal">
            <div>
                <h1>Para revisar</h1>
                <p class="muted" style="margin:.2rem 0 0">
                    Chegaram sozinhos pela notificação do celular ou pelo banco. Toque para editar tudo; troque a categoria ali mesmo;
                    aprove quando estiver certo.
                </p>
            </div>
            @if (items().length > 1) {
                <button class="btn" (click)="approveAll()">
                    <g-icon name="done_all" [size]="18" />Aprovar todos ({{ items().length }})
                </button>
            }
        </div>

        <section class="panel reveal" [class.loading]="loading()">
            @for (g of groups(); track g.date) {
                <div class="day">
                    <span>{{ g.label }}</span
                    ><span class="num">{{ g.sum | brl }}</span>
                </div>
                <div class="list">
                    @for (t of g.items; track t.id) {
                        <div class="item click rev-item" (click)="store.open(t)" (keydown.enter)="store.open(t)" tabindex="0">
                            <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"
                                ><span class="ms">{{ icon(t) }}</span></span
                            >
                            <div class="grow">
                                <div class="title">{{ t.description }}</div>
                                <div class="sub">
                                    <g-icon [name]="t.card_id ? 'credit_card' : 'account_balance'" [size]="14" />
                                    {{ store.originName().get(t.account_id ?? t.card_id ?? '') }} · {{ t.date | dmy: true }} ·
                                    {{ t.source === 'openfinance' ? 'banco' : t.source === 'notification' ? 'notificação' : 'manual' }}
                                </div>
                                @if (t.notes) {
                                    <div class="sub">{{ t.notes }}</div>
                                }
                                <!-- o seletor não abre o formulário -->
                                <div
                                    class="rev-cat"
                                    (click)="$event.stopPropagation()"
                                    (keydown.enter)="$event.stopPropagation()"
                                    tabindex="-1"
                                >
                                    <g-chip-select
                                        label="Sem categoria"
                                        [options]="catOptions(t)"
                                        [value]="t.category_id ?? ''"
                                        (valueChange)="setCat(t, $event)"
                                    />
                                </div>
                            </div>
                            <div class="rev-side">
                                <span class="amt" [class.pos]="t.amount > 0" [class.neg]="t.amount < 0">{{ t.amount | brl }}</span>
                                <button
                                    class="btn rev-ok"
                                    (click)="$event.stopPropagation(); approve(t)"
                                    aria-label="Aprovar"
                                    title="Aprovar"
                                >
                                    <g-icon name="check" [size]="20" />
                                </button>
                            </div>
                        </div>
                    }
                </div>
            } @empty {
                <div class="empty-state">
                    <g-icon name="check_circle" />
                    <div>
                        <b>Tudo revisado</b>Quando chegar lançamento novo pelo celular ou pelo banco, ele aparece aqui para você conferir.
                    </div>
                </div>
            }
        </section>
    `,
})
export class Review {
    store = inject(Store);
    items = signal<Tx[]>([]);
    loading = signal(true);
    icon = (t: Tx) => catIcon(this.store.catById().get(t.category_id ?? ''));
    catOptions = (t: Tx): ChipOption[] =>
        this.store
            .categories()
            .filter((c) => !c.archived && c.kind === (t.amount > 0 ? 'income' : 'expense'))
            .map((c) => ({ value: c.id, label: c.name, icon: catIcon(c), color: c.color, sub: !!c.parent_id }));
    groups = computed(() => {
        const m = new Map<string, Tx[]>();
        for (const t of this.items()) m.set(t.date, [...(m.get(t.date) ?? []), t]);
        return [...m].map(([date, items]) => ({
            date,
            items,
            sum: items.reduce((s, t) => s + t.amount, 0),
            label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }),
        }));
    });

    constructor() {
        effect(() => {
            this.store.version();
            untracked(() => this.fetch());
        });
    }

    async fetch() {
        this.loading.set(true);
        this.items.set(
            (await must(sb.from('transactions').select('*').eq('reviewed', false).order('date', { ascending: false }).limit(500))) as Tx[],
        );
        this.loading.set(false);
    }

    setCat(t: Tx, category_id: string) {
        this.items.update((l) => l.map((x) => (x.id === t.id ? { ...x, category_id: category_id || null } : x)));
        return this.store.setCat(t, category_id);
    }

    approve(t: Tx) {
        this.items.update((l) => l.filter((x) => x.id !== t.id)); // otimista
        return this.store.approve(t);
    }

    async approveAll() {
        const ids = this.items().map((t) => t.id);
        this.items.set([]);
        await this.store.withUndo(`${ids.length} lançamentos aprovados`, { column: 'id', value: ids }, () =>
            must(sb.from('transactions').update({ reviewed: true }).in('id', ids)),
        );
    }
}
