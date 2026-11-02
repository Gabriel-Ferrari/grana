import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrlPipe, DmyPipe, Store, Tx, addMonths, monthEnd, monthLabel, monthStart, must, sb, today } from '../core';
import { TxDraft, TxForm } from '../tx-form';

@Component({
  imports: [BrlPipe, DmyPipe, FormsModule, TxForm],
  template: `
    <section class="box">
      <div class="row between wrap">
        <div class="row">
          <button (click)="month.set(prev())">‹</button>
          <b class="month">{{ label() }}</b>
          <button (click)="month.set(next())">›</button>
        </div>
        <div class="row wrap">
          <button (click)="draft.set({ kind: 'expense' })">− Despesa</button>
          <button (click)="draft.set({ kind: 'income' })">+ Receita</button>
          <button (click)="draft.set({ kind: 'transfer' })">⇄ Transferência</button>
        </div>
      </div>
      <div class="row wrap filters">
        <select [ngModel]="origin()" (ngModelChange)="origin.set($event)">
          <option value="">Todas as contas e cartões</option>
          <optgroup label="Contas">@for (a of store.accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }</optgroup>
          <optgroup label="Cartões">@for (c of store.cards(); track c.id) { <option [value]="'c:' + c.id">{{ c.name }}</option> }</optgroup>
        </select>
        <select [ngModel]="cat()" (ngModelChange)="cat.set($event)">
          <option value="">Todas as categorias</option>
          @for (c of store.categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
        </select>
        <input placeholder="Buscar…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
    </section>

    <section class="box">
      @for (g of groups(); track g.date) {
        <div class="day">{{ g.date | dmy }}</div>
        @for (t of g.items; track t.id) {
          <div class="item click" (click)="draft.set(t)">
            <span class="dot" [style.background]="store.catById().get(t.category_id ?? '')?.color ?? '#ccc'"></span>
            <span class="grow">{{ t.description }}
              @if (t.installments) { <small class="muted">{{ t.installment }}/{{ t.installments }}</small> }
              @if (t.source === 'notification') { <small class="tag">notificação</small> }
              @for (tag of t.tags; track tag) { <small class="tag">{{ tag }}</small> }
              <br /><small class="muted">{{ store.catById().get(t.category_id ?? '')?.name ?? (t.transfer_id ? 'Transferência' : t.pays_card_id ? 'Pagamento de fatura' : 'Sem categoria') }}
                · {{ store.originName().get(t.account_id ?? t.card_id ?? '') }}</small>
            </span>
            <b [class.pos]="t.amount > 0" [class.neg]="t.amount < 0">{{ t.amount | brl }}</b>
            @if (t.account_id) {
              <button class="link paid" [class.on]="t.paid" [title]="t.paid ? 'Pago' : 'Pendente'" (click)="$event.stopPropagation(); togglePaid(t)">{{ t.paid ? '✔' : '○' }}</button>
            } @else { <span class="paid"></span> }
          </div>
        }
      } @empty { <p class="muted">Nenhum lançamento neste mês.</p> }
      <div class="totals">
        <span>Receitas <b class="pos">{{ totals().inc | brl }}</b></span>
        <span>Despesas <b class="neg">{{ totals().exp | brl }}</b></span>
        <span>Resultado <b [class.neg]="totals().inc + totals().exp < 0">{{ totals().inc + totals().exp | brl }}</b></span>
      </div>
    </section>

    @if (draft(); as d) { <tx-form [draft]="d" (close)="draft.set(null)" /> }
  `,
})
export class Transactions {
  store = inject(Store);
  month = signal(monthStart(today()));
  origin = signal('');
  cat = signal('');
  q = signal('');
  rows = signal<Tx[]>([]);
  draft = signal<TxDraft | null>(null);

  label = computed(() => monthLabel(this.month()));
  prev = () => addMonths(this.month(), -1);
  next = () => addMonths(this.month(), 1);

  filtered = computed(() => {
    const q = this.q().toLowerCase().trim();
    const cat = this.cat();
    const byId = this.store.catById();
    return this.rows().filter((t) =>
      (!q || t.description.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))) &&
      (!cat || t.category_id === cat || byId.get(t.category_id ?? '')?.parent_id === cat));
  });
  groups = computed(() => {
    const m = new Map<string, Tx[]>();
    for (const t of this.filtered()) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m].map(([date, items]) => ({ date, items }));
  });
  totals = computed(() => {
    let inc = 0, exp = 0;
    for (const t of this.filtered()) {
      if (t.transfer_id || t.pays_card_id) continue;
      if (t.amount > 0) inc += t.amount; else exp += t.amount;
    }
    return { inc, exp };
  });

  constructor() {
    effect(() => { this.store.version(); this.month(); this.origin(); untracked(() => this.fetch()); });
  }

  async fetch() {
    let q = sb.from('transactions').select('*').gte('date', this.month()).lte('date', monthEnd(this.month()));
    const [t, id] = this.origin().split(':');
    if (t === 'a') q = q.eq('account_id', id);
    if (t === 'c') q = q.eq('card_id', id);
    this.rows.set(await must(q.order('date', { ascending: false }).order('created_at', { ascending: false })) as Tx[]);
  }

  async togglePaid(t: Tx) {
    await must(sb.from('transactions').update({ paid: !t.paid }).eq('id', t.id));
    await this.store.load();
  }
}
