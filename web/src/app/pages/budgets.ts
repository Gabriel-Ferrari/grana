import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrlPipe, Store, addMonths, monthEnd, monthLabel, monthStart, must, sb, toCents, today } from '../core';

@Component({
  imports: [BrlPipe, FormsModule],
  template: `
    <section class="box row between wrap">
      <div class="row">
        <button (click)="month.set(addMonths(month(), -1))">‹</button>
        <b class="month">{{ label() }}</b>
        <button (click)="month.set(addMonths(month(), 1))">›</button>
      </div>
      <form class="row wrap" (ngSubmit)="add()">
        <select name="c" [(ngModel)]="newCat" required>
          <option value="">Categoria…</option>
          @for (c of expenseCats(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
        </select>
        <input name="v" type="number" step="0.01" min="1" placeholder="Limite mensal (R$)" [(ngModel)]="newValue" required />
        <button class="primary">Definir limite</button>
      </form>
    </section>

    <section class="box">
      <div class="row between"><b>Total</b><span>{{ totalUsed() | brl }} de {{ totalLimit() | brl }}</span></div>
      @for (b of items(); track b.category_id) {
        <div class="bar-row">
          <span>{{ b.name }}</span>
          <span><b [class.neg]="b.used > b.amount">{{ b.used | brl }}</b> / {{ b.amount | brl }}
            <button class="link" (click)="remove(b.category_id)">✕</button></span>
          <div class="bar"><i [style.width.%]="b.pct" [style.background]="b.used > b.amount ? '#e5484d' : b.pct > 80 ? '#f5a524' : '#1fa463'"></i></div>
        </div>
      } @empty { <p class="muted">Nenhum limite definido. O limite vale para todos os meses.</p> }
    </section>
  `,
})
export class Budgets {
  store = inject(Store);
  addMonths = addMonths;
  month = signal(monthStart(today()));
  label = computed(() => monthLabel(this.month()));
  budgets = signal<{ category_id: string; amount: number }[]>([]);
  spent = signal(new Map<string, number>());
  newCat = '';
  newValue: number | null = null;

  expenseCats = computed(() => this.store.categories().filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived));
  items = computed(() => this.budgets().map((b) => {
    const used = this.spent().get(b.category_id) ?? 0;
    return { ...b, used, name: this.store.catById().get(b.category_id)?.name ?? '?', pct: Math.min(100, (used / b.amount) * 100) };
  }).sort((a, b) => b.pct - a.pct));
  totalUsed = computed(() => this.items().reduce((s, b) => s + b.used, 0));
  totalLimit = computed(() => this.items().reduce((s, b) => s + b.amount, 0));

  constructor() {
    effect(() => { this.store.version(); const m = this.month(); untracked(() => this.fetch(m)); });
  }

  async fetch(m: string) {
    const [b, r] = await Promise.all([
      must(sb.from('budgets').select('category_id, amount')),
      must(sb.from('report_rows').select('amount, root_category_id').lt('amount', 0).gte('date', m).lte('date', monthEnd(m))),
    ]);
    const spent = new Map<string, number>();
    for (const x of r as { amount: number; root_category_id: string | null }[])
      spent.set(x.root_category_id ?? '', (spent.get(x.root_category_id ?? '') ?? 0) - x.amount);
    this.budgets.set(b as { category_id: string; amount: number }[]);
    this.spent.set(spent);
  }

  async add() {
    if (!this.newCat || !this.newValue) return;
    await must(sb.from('budgets').upsert({ category_id: this.newCat, amount: toCents(this.newValue) }, { onConflict: 'user_id,category_id' }));
    this.newCat = ''; this.newValue = null;
    this.fetch(this.month());
  }

  async remove(category_id: string) {
    await must(sb.from('budgets').delete().eq('category_id', category_id));
    this.fetch(this.month());
  }
}
