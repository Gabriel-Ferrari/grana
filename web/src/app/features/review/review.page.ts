import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
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
                    aprove quando estiver certo. Segure (ou toque no ícone) para selecionar vários.
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
                        <!-- segurar (contextmenu no celular) seleciona, como em Lançamentos -->
                        <div
                            class="item click rev-item"
                            [class.sel]="sel().has(t.id)"
                            (click)="sel().size ? toggleSel(t) : store.open(t)"
                            (contextmenu)="$event.preventDefault(); toggleSel(t)"
                            (keydown.enter)="store.open(t)"
                            (keydown.space)="$event.preventDefault(); toggleSel(t)"
                            tabindex="0"
                        >
                            <span
                                class="cat-ico pickable"
                                [class.picked]="sel().has(t.id)"
                                [style.--cc]="store.catById().get(t.category_id ?? '')?.color"
                                role="checkbox"
                                [attr.aria-checked]="sel().has(t.id)"
                                aria-label="Selecionar"
                                tabindex="-1"
                                (click)="$event.stopPropagation(); toggleSel(t)"
                                (keydown.space)="$event.preventDefault(); $event.stopPropagation(); toggleSel(t)"
                                title="Selecionar"
                                ><span class="ms">{{ sel().has(t.id) ? 'check' : icon(t) }}</span></span
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

        @if (sel().size) {
            <div class="sel-bar" role="toolbar" aria-label="Ações nos selecionados">
                <button class="btn ghost icon" (click)="sel.set(empty)" aria-label="Limpar seleção (Esc)" title="Limpar seleção (Esc)">
                    <g-icon name="close" />
                </button>
                <div class="grow">
                    <b>{{ sel().size }} {{ sel().size > 1 ? 'selecionados' : 'selecionado' }}</b>
                    <span class="num" [class.neg]="selSum() < 0" [class.pos]="selSum() > 0">{{ selSum() | brl }}</span>
                    @if (sel().size < items().length) {
                        <button class="link" (click)="selectAll()">todos ({{ items().length }})</button>
                    }
                </div>
                <button class="btn ghost" (click)="approveSel()" title="Aprovar selecionados">
                    <g-icon name="check" [size]="18" />Aprovar
                </button>
                <button class="btn ghost danger" (click)="removeSel()" title="Excluir selecionados">
                    <g-icon name="delete" [size]="18" />Excluir
                </button>
            </div>
        }
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

    approveAll() {
        return this.approveMany(this.items());
    }

    /** seleção múltipla (segurar o item), como em Lançamentos */
    readonly empty: ReadonlySet<string> = new Set();
    sel = signal<ReadonlySet<string>>(this.empty);
    selRows = computed(() => this.items().filter((t) => this.sel().has(t.id)));
    selSum = computed(() => this.selRows().reduce((s, t) => s + t.amount, 0));
    toggleSel(t: Tx) {
        const s = new Set(this.sel());
        if (!s.delete(t.id)) s.add(t.id);
        this.sel.set(s);
    }
    selectAll() {
        this.sel.set(new Set(this.items().map((t) => t.id)));
    }
    @HostListener('document:keydown.escape') esc() {
        if (this.sel().size && !this.store.form()) this.sel.set(this.empty);
    }
    approveSel() {
        const rows = this.selRows();
        this.sel.set(this.empty);
        return this.approveMany(rows);
    }
    removeSel() {
        const rows = this.selRows();
        this.sel.set(this.empty);
        this.items.update((l) => l.filter((x) => !rows.includes(x))); // otimista
        return this.store.removeMany(rows);
    }

    private async approveMany(rows: Tx[]) {
        const ids = rows.map((t) => t.id);
        this.items.update((l) => l.filter((x) => !ids.includes(x.id)));
        await this.store.withUndo(
            `${ids.length} ${ids.length > 1 ? 'lançamentos aprovados' : 'lançamento aprovado'}`,
            { column: 'id', value: ids },
            () => must(sb.from('transactions').update({ reviewed: true }).in('id', ids)),
        );
    }
}
