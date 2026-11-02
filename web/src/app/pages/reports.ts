import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrlPipe, Store, addMonths, monthEnd, monthStart, must, sb, today } from '../core';

interface Row { date: string; amount: number; root_category_id: string | null }

@Component({
  imports: [BrlPipe, FormsModule],
  template: `
    <section class="box row wrap between">
      <div class="seg">
        <button [class.on]="mode() === 'expense'" (click)="mode.set('expense')">Despesas por categoria</button>
        <button [class.on]="mode() === 'income'" (click)="mode.set('income')">Receitas por categoria</button>
        <button [class.on]="mode() === 'flow'" (click)="mode.set('flow')">Entradas × saídas</button>
      </div>
      <div class="row">
        <input type="month" [ngModel]="from()" (ngModelChange)="from.set($event)" /> até
        <input type="month" [ngModel]="to()" (ngModelChange)="to.set($event)" />
      </div>
    </section>

    <section class="box">
      @if (mode() === 'flow') {
        @for (m of months(); track m.month) {
          <div class="bar-row"><span>{{ m.month }}</span><b [class.neg]="m.inc - m.exp < 0">{{ m.inc - m.exp | brl }}</b>
            <div class="bar"><i class="pos-bg" [style.width.%]="m.inc / maxMonth() * 100"></i></div>
            <div class="bar"><i class="neg-bg" [style.width.%]="m.exp / maxMonth() * 100"></i></div>
            <small class="muted">entradas {{ m.inc | brl }} · saídas {{ m.exp | brl }}</small></div>
        }
      } @else {
        <div class="row between"><b>Total</b><b>{{ total() | brl }}</b></div>
        @for (g of byCategory(); track g.id) {
          <div class="bar-row"><span>{{ g.name }} <small class="muted">{{ g.pct.toFixed(1) }}%</small></span><b>{{ g.value | brl }}</b>
            <div class="bar"><i [style.width.%]="g.pct" [style.background]="g.color"></i></div></div>
        } @empty { <p class="muted">Sem dados no período.</p> }
      }
    </section>
  `,
})
export class Reports {
  store = inject(Store);
  mode = signal<'expense' | 'income' | 'flow'>('expense');
  to = signal(today().slice(0, 7));
  from = signal(addMonths(today(), -5).slice(0, 7));
  rows = signal<Row[]>([]);

  byCategory = computed(() => {
    const exp = this.mode() === 'expense';
    const by = new Map<string, number>();
    for (const r of this.rows()) {
      if (exp ? r.amount >= 0 : r.amount <= 0) continue;
      by.set(r.root_category_id ?? '', (by.get(r.root_category_id ?? '') ?? 0) + Math.abs(r.amount));
    }
    const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
    return [...by].sort((a, b) => b[1] - a[1]).map(([id, value]) => {
      const c = this.store.catById().get(id);
      return { id, value, name: c?.name ?? 'Sem categoria', color: c?.color ?? '#b3b3b3', pct: (value / total) * 100 };
    });
  });
  total = computed(() => this.byCategory().reduce((s, g) => s + g.value, 0));
  months = computed(() => {
    const m = new Map<string, { inc: number; exp: number }>();
    for (const r of this.rows()) {
      const k = r.date.slice(0, 7);
      const v = m.get(k) ?? { inc: 0, exp: 0 };
      if (r.amount > 0) v.inc += r.amount; else v.exp -= r.amount;
      m.set(k, v);
    }
    return [...m].sort().map(([month, v]) => ({ month: month.slice(5) + '/' + month.slice(0, 4), ...v }));
  });
  maxMonth = computed(() => Math.max(1, ...this.months().flatMap((m) => [m.inc, m.exp])));

  constructor() {
    effect(() => { this.store.version(); const f = this.from(), t = this.to(); untracked(() => this.fetch(f, t)); });
  }

  async fetch(from: string, to: string) {
    if (!from || !to) return;
    this.rows.set(await must(sb.from('report_rows').select('date, amount, root_category_id')
      .gte('date', monthStart(from + '-01')).lte('date', monthEnd(to + '-01'))) as Row[]);
  }
}
