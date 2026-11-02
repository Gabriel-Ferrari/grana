import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BrlPipe, DmyPipe, Invoice, Store, Tx, must, sb, toCents, today } from '../core';
import { TxDraft, TxForm } from '../tx-form';

@Component({
  imports: [BrlPipe, DmyPipe, FormsModule, RouterLink, TxForm],
  template: `
    @if (!cards().length) { <section class="box muted">Nenhum cartão. Cadastre em <a routerLink="/ajustes">Ajustes</a>.</section> }
    <div class="row wrap">
      @for (c of cards(); track c.id) {
        <button [class.on]="c.id === cardId()" (click)="cardId.set(c.id); inv.set('')">{{ c.name }}</button>
      }
    </div>

    @if (card(); as c) {
      <section class="box row between wrap">
        <div><small class="muted">Limite</small><div>{{ c.limit_cents | brl }}</div></div>
        <div><small class="muted">Disponível</small><div class="big">{{ c.available | brl }}</div></div>
        <div><small class="muted">Fecha dia {{ c.closing_day }} · vence dia {{ c.due_day }}</small></div>
      </section>

      <div class="grid2">
        <section class="box">
          <h3>Faturas</h3>
          @for (i of invoices(); track i.invoice_date) {
            <div class="item click" [class.sel]="i.invoice_date === sel()?.invoice_date" (click)="inv.set(i.invoice_date)">
              <span class="grow">{{ i.invoice_date | dmy }}<br /><small class="muted">{{ i.items }} lançamentos</small></span>
              <span class="right"><b>{{ i.total | brl }}</b><br /><small [class.pos]="i.is_paid" [class.neg]="!i.is_paid && i.invoice_date < hoje">{{ i.is_paid ? 'paga' : i.invoice_date < hoje ? 'vencida' : 'aberta' }}</small></span>
            </div>
          } @empty { <p class="muted">Sem faturas.</p> }
        </section>

        <section class="box">
          @if (sel(); as i) {
            <div class="row between"><h3>Fatura {{ i.invoice_date | dmy }}</h3><b>{{ i.total | brl }}</b></div>
            @for (t of txs(); track t.id) {
              <div class="item click" (click)="draft.set(t)"><span class="grow">{{ t.description }}
                @if (t.installments) { <small class="muted">{{ t.installment }}/{{ t.installments }}</small> }
                <br /><small class="muted">{{ t.date | dmy }} · {{ store.catById().get(t.category_id ?? '')?.name ?? 'Sem categoria' }}</small></span>
                <b [class.neg]="t.amount < 0" [class.pos]="t.amount > 0">{{ t.amount | brl }}</b></div>
            }
            @if (i.paid) { <p class="muted">Pago: {{ i.paid | brl }}</p> }
            @if (!i.is_paid) {
              <form class="row wrap pay" (ngSubmit)="pay(i)">
                <select name="acc" [(ngModel)]="payAcc" required>
                  @for (a of store.accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
                </select>
                <input name="v" type="number" step="0.01" [(ngModel)]="payValue" [placeholder]="((i.total - i.paid) / 100).toFixed(2)" />
                <input name="d" type="date" [(ngModel)]="payDate" />
                <button class="primary">Pagar fatura</button>
              </form>
            }
          }
        </section>
      </div>
    }
    @if (draft(); as d) { <tx-form [draft]="d" (close)="draft.set(null)" /> }
  `,
})
export class Cards {
  store = inject(Store);
  hoje = today();
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  cardId = signal('');
  card = computed(() => this.cards().find((c) => c.id === this.cardId()) ?? this.cards()[0]);
  invoices = signal<Invoice[]>([]);
  inv = signal('');
  sel = computed(() => this.invoices().find((i) => i.invoice_date === (this.inv() || this.card()?.current_invoice_date)) ?? this.invoices()[0]);
  txs = signal<Tx[]>([]);
  draft = signal<TxDraft | null>(null);
  payAcc = '';
  payValue: number | null = null;
  payDate = today();

  constructor() {
    effect(() => {
      this.store.version();
      const c = this.card();
      untracked(() => { if (!c) return; this.payAcc = c.payment_account_id ?? this.store.accounts()[0]?.id ?? ''; this.fetch(c.id); });
    });
    effect(() => { const i = this.sel(); untracked(() => this.fetchTxs(i)); });
  }

  async fetch(cardId: string) {
    this.invoices.set(await must(sb.from('invoices').select('*').eq('card_id', cardId).order('invoice_date', { ascending: false }).limit(24)) as Invoice[]);
  }

  async fetchTxs(i: Invoice | undefined) {
    if (!i) return this.txs.set([]);
    this.txs.set(await must(sb.from('transactions').select('*').eq('card_id', i.card_id).eq('invoice_date', i.invoice_date).order('date', { ascending: false })) as Tx[]);
  }

  async pay(i: Invoice) {
    const value = this.payValue ? toCents(this.payValue) : i.total - i.paid;
    const account = this.payAcc || this.store.accounts()[0]?.id;
    if (!account || value <= 0) return;
    await must(sb.from('transactions').insert({
      description: `Pagamento fatura ${this.card()?.name} ${i.invoice_date.slice(5, 7)}/${i.invoice_date.slice(0, 4)}`,
      amount: -value, date: this.payDate, account_id: account, pays_card_id: i.card_id, invoice_date: i.invoice_date,
    }));
    this.payValue = null;
    await this.store.load();
  }
}
