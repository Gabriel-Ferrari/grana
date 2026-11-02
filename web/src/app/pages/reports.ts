import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Flow, FlowMonth, RankBars, RankItem } from '../charts';
import { BrlPipe, Store, addMonths, catIcon, monthEnd, monthLabel, must, sb, today } from '../core';

@Component({
  imports: [BrlPipe, FormsModule, Flow, RankBars],
  template: `
    <div class="page-title reveal">
      <h1>Relatórios</h1>
      <div class="row wrap">
        <div class="seg">
          @for (p of presets; track p.n) { <button [class.on]="preset() === p.n" (click)="setPreset(p.n)">{{ p.label }}</button> }
        </div>
        <input type="month" style="width:auto" [ngModel]="from()" (ngModelChange)="from.set($event); preset.set(0)" aria-label="De" />
        <input type="month" style="width:auto" [ngModel]="to()" (ngModelChange)="to.set($event); preset.set(0)" aria-label="Até" />
      </div>
    </div>

    <div class="stack" [class.loading]="loading()">
      <section class="panel reveal">
        <div class="panel-head">
          <div><h2>Entradas × saídas</h2><p class="muted small" style="margin:.15rem 0 0">Toque num mês para ver os lançamentos</p></div>
          <div style="text-align:right"><span class="muted small">Resultado do período</span>
            <div style="font-weight:750;font-size:1.25rem" [class.neg]="sum().inc - sum().exp < 0" [class.pos]="sum().inc - sum().exp > 0">{{ sum().inc - sum().exp | brl }}</div></div>
        </div>
        <g-flow [months]="months()" [active]="current" (pick)="openMonth($event)" />
        <details class="table-view"><summary>Ver em tabela</summary>
          <table><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr>
            @for (m of months(); track m.key) { <tr><td>{{ m.label }}</td><td>{{ m.inc | brl }}</td><td>{{ m.exp | brl }}</td><td>{{ m.inc - m.exp | brl }}</td></tr> }
          </table>
        </details>
      </section>

      <div class="grid-2">
        <section class="panel reveal">
          <div class="panel-head"><h2>Saídas por categoria</h2><span class="muted small num">{{ sum().exp | brl }}</span></div>
          <g-rank-bars [items]="expenses()" [max]="10" (pick)="openCat($event)" />
        </section>
        <section class="panel reveal">
          <div class="panel-head"><h2>Entradas por categoria</h2><span class="muted small num">{{ sum().inc | brl }}</span></div>
          <g-rank-bars [items]="incomes()" tone="in" [max]="10" (pick)="openCat($event)" />
        </section>
      </div>
    </div>
  `,
})
export class Reports {
  store = inject(Store);
  router = inject(Router);
  presets = [{ n: 3, label: '3 meses' }, { n: 6, label: '6 meses' }, { n: 12, label: '12 meses' }];
  current = today().slice(0, 7);
  preset = signal(6);
  to = signal(this.current);
  from = signal(addMonths(today(), -5).slice(0, 7));
  loading = signal(true);
  byMonth = signal<{ month: string; income: number; expense: number }[]>([]);
  byCat = signal<{ category_id: string | null; income: number; expense: number }[]>([]);

  months = computed<FlowMonth[]>(() => this.byMonth().map((m) => ({
    key: m.month.slice(0, 7), inc: m.income, exp: m.expense,
    label: monthLabel(m.month, true).replace('.', '') + (this.byMonth().length > 12 ? '/' + m.month.slice(2, 4) : ''),
  })));
  sum = computed(() => this.months().reduce((s, m) => ({ inc: s.inc + m.inc, exp: s.exp + m.exp }), { inc: 0, exp: 0 }));
  private rank = (k: 'income' | 'expense') => this.byCat().map((c): RankItem => {
    const cat = this.store.catById().get(c.category_id ?? '');
    return { id: c.category_id ?? 'none', name: cat?.name ?? 'Sem categoria', value: c[k], color: cat?.color, icon: catIcon(cat) };
  });
  expenses = computed(() => this.rank('expense'));
  incomes = computed(() => this.rank('income'));

  constructor() {
    effect(() => { this.store.version(); const f = this.from(), t = this.to(); untracked(() => this.fetch(f, t)); });
  }

  setPreset(n: number) {
    this.preset.set(n);
    this.to.set(this.current);
    this.from.set(addMonths(this.current + '-01', -(n - 1)).slice(0, 7));
  }

  async fetch(from: string, to: string) {
    if (!from || !to) return;
    this.loading.set(true);
    const args = { p_from: from + '-01', p_to: monthEnd(to + '-01') };
    const [m, c] = await Promise.all([must(sb.rpc('report_by_month', args)), must(sb.rpc('report_by_category', args))]);
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
