import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrlPipe, DmyPipe, Invoice, Store, Tx, addMonths, monthEnd, monthStart, sb, today } from '../core';
import { TxDraft, TxForm } from '../tx-form';

interface Row { amount: number; root_category_id: string | null }

@Component({
  imports: [BrlPipe, DmyPipe, RouterLink, TxForm],
  template: `
    <section class="box row between wrap">
      <div>
        <h2>Olá{{ name() ? ', ' + name() : '' }}!</h2>
        <div class="row">
          <div><small class="muted">Receitas do mês</small><div class="pos big">{{ income() | brl }}</div></div>
          <div><small class="muted">Despesas do mês</small><div class="neg big">{{ -expense() | brl }}</div></div>
        </div>
      </div>
      <div class="row wrap">
        <button (click)="draft.set({ kind: 'expense' })">− Despesa</button>
        <button (click)="draft.set({ kind: 'income' })">+ Receita</button>
        <button (click)="draft.set({ kind: 'transfer' })">⇄ Transferência</button>
      </div>
    </section>

    @if (store.pending()) {
      <a class="box notice" routerLink="/notificacoes">{{ store.pending() }} notificação(ões) aguardando revisão →</a>
    }

    <div class="grid">
      <section class="box">
        <small class="muted">Saldo geral</small>
        <div class="big">{{ total() | brl }}</div>
        <h3>Minhas contas</h3>
        @for (a of accounts(); track a.id) {
          <div class="item"><span class="dot" [style.background]="a.color || '#1fa463'"></span><span class="grow">{{ a.name }}</span>
            <b [class.neg]="a.balance < 0">{{ a.balance | brl }}</b></div>
        } @empty { <p class="muted">Cadastre contas em <a routerLink="/ajustes">Ajustes</a>.</p> }
      </section>

      <section class="box">
        <h3>Contas a pagar</h3>
        @for (t of bills(); track t.id) {
          <div class="item" [class.late]="t.date < hoje"><span class="grow">{{ t.description }}<br /><small class="muted">{{ t.date | dmy }}</small></span>
            <b class="neg">{{ t.amount | brl }}</b></div>
        }
        @for (i of invoices(); track i.card_id + i.invoice_date) {
          <a class="item" routerLink="/cartoes"><span class="grow">Fatura {{ store.originName().get(i.card_id) }}<br /><small class="muted">vence {{ i.invoice_date | dmy }}</small></span>
            <b class="neg">{{ -(i.total - i.paid) | brl }}</b></a>
        }
        @if (!bills().length && !invoices().length) { <p class="muted">Nada pendente.</p> }
      </section>

      <section class="box">
        <h3>Meus cartões</h3>
        @for (c of cards(); track c.id) {
          <a class="item" routerLink="/cartoes"><span class="grow">{{ c.name }}<br /><small class="muted">disponível {{ c.available | brl }}</small></span>
            <span class="right"><b class="neg">{{ -c.current_invoice_due | brl }}</b><br /><small class="muted">venc. {{ c.current_invoice_date | dmy }}</small></span></a>
        } @empty { <p class="muted">Nenhum cartão.</p> }
      </section>

      <section class="box">
        <h3>Maiores gastos do mês</h3>
        @for (g of top(); track g.id) {
          <div class="bar-row"><span>{{ g.name }}</span><b>{{ g.value | brl }}</b>
            <div class="bar"><i [style.width.%]="g.pct" [style.background]="g.color"></i></div></div>
        } @empty { <p class="muted">Sem despesas neste mês.</p> }
      </section>
    </div>

    @if (draft(); as d) { <tx-form [draft]="d" (close)="draft.set(null)" /> }
  `,
})
export class Home {
  store = inject(Store);
  hoje = today();
  draft = signal<TxDraft | null>(null);
  rows = signal<Row[]>([]);
  bills = signal<Tx[]>([]);
  invoices = signal<Invoice[]>([]);

  name = computed(() => (this.store.session()?.user.user_metadata?.['full_name'] ?? '').split(' ')[0]);
  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  total = computed(() => this.accounts().reduce((s, a) => s + a.balance, 0));
  income = computed(() => this.rows().filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0));
  expense = computed(() => this.rows().filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0));
  top = computed(() => {
    const by = new Map<string, number>();
    for (const r of this.rows()) if (r.amount < 0) by.set(r.root_category_id ?? '', (by.get(r.root_category_id ?? '') ?? 0) - r.amount);
    const max = Math.max(...by.values(), 1);
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => {
      const c = this.store.catById().get(id);
      return { id, value, name: c?.name ?? 'Sem categoria', color: c?.color ?? '#b3b3b3', pct: (value / max) * 100 };
    });
  });

  constructor() {
    effect(() => { this.store.version(); untracked(() => this.fetch()); });
  }

  async fetch() {
    const m = monthStart(this.hoje);
    const [r, b, i] = await Promise.all([
      sb.from('report_rows').select('amount, root_category_id').gte('date', m).lte('date', monthEnd(m)),
      sb.from('transactions').select('*').eq('paid', false).not('account_id', 'is', null).lt('amount', 0)
        .lte('date', addMonths(this.hoje, 1)).order('date').limit(8),
      sb.from('invoices').select('*').eq('is_paid', false).gt('total', 0).gte('invoice_date', addMonths(this.hoje, -2))
        .lte('invoice_date', addMonths(this.hoje, 2)).order('invoice_date').limit(8),
    ]);
    this.rows.set((r.data ?? []) as Row[]);
    this.bills.set((b.data ?? []) as Tx[]);
    this.invoices.set((i.data ?? []) as Invoice[]);
  }
}
