import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BrlPipe, Invoice, Store, Tx, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, sb, today } from '../core';
import { Icon } from '../icon';
import { ChipOption, ChipSelect } from '../fields';

type Inv = Invoice & { due: number; running_due: number };

@Component({
  imports: [BrlPipe, FormsModule, Icon, ChipSelect],
  template: `
    <div class="tx-toolbar reveal">
      <div class="month-pill" role="group" aria-label="Mês">
        <button class="btn ghost icon" (click)="go(-1)" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
        <b>{{ label() }}</b>
        <button class="btn ghost icon" (click)="go(1)" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
      </div>
      <div class="row" style="gap:.4rem">
        @if (searching() || q()) {
          <div class="search grow-in"><g-icon name="search" /><input id="search" placeholder="Buscar descrição ou tag" [ngModel]="q()" (ngModelChange)="q.set($event)" (blur)="!q() && searching.set(false)" /></div>
        } @else {
          <button class="btn ghost icon" (click)="openSearch()" aria-label="Buscar (/)" title="Buscar (/)"><g-icon name="search" /></button>
        }
        <button class="btn primary hide-m" (click)="store.open({ kind: 'expense' })"><g-icon name="add" [size]="18" />Lançamento</button>
      </div>
    </div>

    <div class="chips-row reveal" role="toolbar" aria-label="Filtros">
      <div class="seg" role="group" aria-label="Modo de visualização">
        <button [class.on]="!cash()" (click)="setCash(false)" title="Todos os lançamentos, inclusive compras no cartão">Tudo</button>
        <button [class.on]="cash()" (click)="setCash(true)" title="Fluxo de caixa: só o que mexe no saldo; faturas no lugar das compras do cartão">Caixa</button>
      </div>
      <g-chip-select label="Contas e cartões" [options]="originOptions()" [value]="origin()" (valueChange)="setParam('o', $event)" />
      <g-chip-select label="Tipo" [options]="kindOptions" [value]="kind()" (valueChange)="kind.set($any($event))" />
      <g-chip-select label="Categoria" [options]="catOptions()" [value]="catSel()" (valueChange)="setParam('cat', $event)" />
      <g-chip-select label="Situação" [options]="paidOptions" [value]="paidSel()" (valueChange)="paidSel.set($any($event))" />
      @if (origin() || kind() || catSel() || paidSel() || q()) {
        <button class="fchip clear" (click)="clearAll()"><span class="ms">close</span>Limpar</button>
      }
    </div>

    @if (isCash()) {
      <section class="sum-strip reveal">
        <div><span>Saldo hoje</span><b [class.neg]="cashBox().now < 0">{{ cashBox().now | brl }}</b></div>
        <div><span>Resultado do mês</span><b [class.neg]="cashBox().result < 0">{{ cashBox().result | brl }}</b></div>
        <div><span>Previsto em {{ endLabel() }}</span><b [class.neg]="cashBox().end < 0">{{ cashBox().end | brl }}</b></div>
      </section>
    } @else {
    <section class="sum-strip reveal">
      <div><span>Entradas</span><b class="pos">{{ totals().inc | brl }}</b></div>
      <div><span>Saídas</span><b class="neg">{{ -totals().exp | brl }}</b></div>
      <div><span>Resultado</span><b [class.neg]="totals().inc + totals().exp < 0">{{ totals().inc + totals().exp | brl }}</b></div>
    </section>
    }

    <section class="panel reveal" [class.loading]="loading()">
      @for (g of groups(); track g.date) {
        <div class="day"><span>{{ g.label }}</span><span class="num">{{ g.sum | brl }}</span></div>
        <div class="list">
          @for (t of g.items; track t.id) {
            <div class="item click" (click)="open(t)" tabindex="0" (keydown.enter)="open(t)">
              <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"><span class="ms">{{ icon(t) }}</span></span>
              <div class="grow">
                <div class="title">@if (!t.reviewed) {<i class="unrev" title="Para revisar"></i>}{{ t.description }}
                  @if (t.installments) { <span class="tag">{{ t.installment }}/{{ t.installments }}</span> }
                  @if (t.recurring) { <span class="tag"><g-icon name="repeat" [size]="13" />fixo</span> }
                  @if (t.source === 'notification') { <span class="tag auto"><g-icon name="notifications" [size]="13" />auto</span> }
                  @if (t.source === 'openfinance') { <span class="tag auto"><g-icon name="account_balance" [size]="13" />banco</span> }
                  @for (tag of t.tags; track tag) { <span class="tag"><g-icon name="sell" [size]="13" />{{ tag }}</span> }
                </div>
                <div class="sub">
                  {{ t.source === 'invoice' ? 'Fatura a pagar' : store.catById().get(t.category_id ?? '')?.name ?? (t.transfer_id ? 'Transferência' : t.pays_card_id ? 'Pagamento de fatura' : 'Sem categoria') }}
                  · <g-icon [name]="t.card_id ? 'credit_card' : 'account_balance'" [size]="14" />{{ store.originName().get(t.account_id ?? t.card_id ?? '') }}
                </div>
              </div>
              <span class="amt" [class.pos]="t.amount > 0" [class.neg]="t.amount < 0 && !t.transfer_id">{{ t.amount | brl }}</span>
              @if (t.account_id) {
                <button class="paid-btn" [class.on]="t.paid" (click)="$event.stopPropagation(); togglePaid(t)"
                        [attr.aria-label]="t.paid ? 'Pago — marcar como pendente' : 'Pendente — marcar como pago'" [title]="t.paid ? 'Pago' : 'Pendente'">
                  <g-icon name="thumb_up" [size]="18" [fill]="t.paid" />
                </button>
              } @else { <span style="width:30px;flex:none"></span> }
            </div>
          }
        </div>
      } @empty {
        <div class="empty-state"><g-icon name="receipt_long" />
          <div><b>{{ q() || catSel() || origin() ? 'Nada com esses filtros' : 'Nenhum lançamento neste mês' }}</b>
            Aperte <kbd>D</kbd> para despesa, <kbd>R</kbd> para receita, ou ative o coletor no celular para lançar sozinho.</div>
        </div>
      }
    </section>
  `,
})
export class Transactions {
  store = inject(Store);
  router = inject(Router);
  /** query params (?m=2026-10&cat=..&o=a:..) — vêm dos gráficos e listas */
  m = input<string>();
  cat = input<string>();
  o = input<string>();
  month = computed(() => (this.m() ? this.m() + '-01' : monthStart(today())));
  catSel = computed(() => this.cat() ?? '');
  origin = computed(() => this.o() ?? '');
  q = signal('');
  searching = signal(false);
  kind = signal<'' | 'in' | 'out' | 'tr' | 'fixo' | 'parc'>('');
  paidSel = signal<'' | 'paid' | 'open'>('');
  kindOptions: ChipOption[] = [{ value: 'out', label: 'Saídas', icon: 'arrow_upward', color: 'var(--out)' }, { value: 'in', label: 'Entradas', icon: 'arrow_downward', color: 'var(--in)' },
    { value: 'tr', label: 'Transferências', icon: 'swap_horiz' }, { value: 'fixo', label: 'Fixos', icon: 'event_repeat' }, { value: 'parc', label: 'Parcelados', icon: 'splitscreen' }];
  paidOptions: ChipOption[] = [{ value: 'paid', label: 'Pagos', icon: 'thumb_up', color: 'var(--in)' }, { value: 'open', label: 'Pendentes', icon: 'schedule', color: 'var(--warn)' }];
  originOptions = computed<ChipOption[]>(() => [
    ...this.store.accounts().filter((a) => !a.archived).map((a) => ({ value: 'a:' + a.id, label: a.name, group: 'Contas', bank: { name: a.name, institution: a.institution } })),
    ...this.store.cards().filter((c) => !c.archived).map((c) => ({ value: 'c:' + c.id, label: c.name, group: 'Cartões', bank: { name: c.name, institution: c.institution } })),
  ]);
  catOptions = computed<ChipOption[]>(() => [
    { value: 'none', label: 'Sem categoria', icon: 'category' },
    ...this.store.categories().filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, icon: catIcon(c), color: c.color, group: c.kind === 'income' ? 'Entradas' : 'Saídas', sub: !!c.parent_id }))
      .sort((a, b) => (a.group! > b.group! ? -1 : a.group! < b.group! ? 1 : 0)),
  ]);
  rows = signal<Tx[]>([]);
  loading = signal(true);

  label = computed(() => monthLabel(this.month()));
  icon = (t: Tx) => (t.source === 'invoice' ? 'receipt_long' : t.transfer_id ? 'swap_horiz' : t.pays_card_id ? 'credit_card' : catIcon(this.store.catById().get(t.category_id ?? '')));

  /** Fluxo de caixa (como no Organizze): sem compras do cartão; a fatura em aberto entra como uma linha no vencimento. */
  cash = signal(localStorage.getItem('grana.cash') === '1');
  isCash = computed(() => this.cash() && !this.origin().startsWith('c:'));
  /** faturas dos últimos meses até o fim do mês e lançamentos de conta pendentes até lá (para a previsão) */
  invs = signal<Inv[]>([]);
  pend = signal<{ amount: number; account_id: string }[]>([]);
  accIds = computed(() => {
    const [t, id] = this.origin().split(':');
    return new Set(t === 'a' ? [id] : this.store.accounts().filter((a) => !a.archived).map((a) => a.id));
  });
  scopedInvs = computed(() => {
    const [t, id] = this.origin().split(':');
    return this.invs().filter((i) => t !== 'a' || this.store.cards().find((c) => c.id === i.card_id)?.payment_account_id === id);
  });
  invRows = computed<Tx[]>(() => this.scopedInvs().filter((i) => i.invoice_date >= this.month() && i.due > 0).map((i) => ({
    id: 'inv:' + i.card_id + ':' + i.invoice_date, description: 'Fatura ' + (this.store.originName().get(i.card_id) ?? ''), amount: -i.due,
    date: i.invoice_date, paid: false, account_id: null, card_id: i.card_id, invoice_date: i.invoice_date, pays_card_id: null,
    category_id: null, transfer_id: null, group_id: null, installment: null, installments: null, recurring: false, tags: [], notes: null,
    source: 'invoice', reviewed: true,
  })));
  /** dívida de cartão até o fim do mês: saldo acumulado (running_due) da última fatura de cada cartão — não soma resíduos antigos duas vezes */
  owed = computed(() => {
    const last = new Map<string, Inv>();
    for (const i of this.scopedInvs()) if ((last.get(i.card_id)?.invoice_date ?? '') < i.invoice_date) last.set(i.card_id, i);
    return [...last.values()].reduce((s, i) => s + Math.max(0, i.running_due), 0);
  });
  endLabel = computed(() => new Date(monthEnd(this.month()) + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }));
  cashBox = computed(() => {
    const ids = this.accIds();
    const now = this.store.accounts().filter((a) => ids.has(a.id)).reduce((s, a) => s + a.balance, 0);
    const end = now + this.pend().filter((p) => ids.has(p.account_id)).reduce((s, p) => s + p.amount, 0)
      - this.owed();
    const result = this.filtered().filter((t) => !t.transfer_id).reduce((s, t) => s + t.amount, 0);
    return { now, end, result };
  });
  setCash(on: boolean) { this.cash.set(on); localStorage.setItem('grana.cash', on ? '1' : '0'); }
  open(t: Tx) {
    if (t.source === 'invoice') this.router.navigate(['/cartoes'], { queryParams: { c: t.card_id } });
    else this.store.open(t);
  }

  filtered = computed(() => {
    const q = this.q().toLowerCase().trim();
    const cat = this.catSel(), k = this.kind();
    const byId = this.store.catById();
    const base = this.isCash()
      ? [...this.rows().filter((t) => !t.card_id), ...this.invRows()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      : this.rows();
    return base.filter((t) =>
      (!q || t.description.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))) &&
      (!cat || (cat === 'none' ? !t.category_id && !t.transfer_id && !t.pays_card_id && t.source !== 'invoice' : t.category_id === cat || byId.get(t.category_id ?? '')?.parent_id === cat)) &&
      (!k || (k === 'in' ? t.amount > 0 && !t.transfer_id : k === 'out' ? t.amount < 0 && !t.transfer_id
        : k === 'tr' ? !!t.transfer_id : k === 'fixo' ? t.recurring : !!t.installments)) &&
      (!this.paidSel() || (this.paidSel() === 'paid' ? t.paid : !t.paid)));
  });
  groups = computed(() => {
    const m = new Map<string, Tx[]>();
    for (const t of this.filtered()) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m].map(([date, items]) => ({
      date, items, sum: items.filter((t) => !t.transfer_id && (this.isCash() || !t.pays_card_id)).reduce((s, t) => s + t.amount, 0),
      label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }),
    }));
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
    effect(() => { this.store.version(); const m = this.month(), o = this.origin(); untracked(() => this.fetch(m, o)); });
  }

  async fetch(month: string, origin: string) {
    this.loading.set(true);
    let q = sb.from('transactions').select('*').gte('date', month).lte('date', monthEnd(month));
    const [t, id] = origin.split(':');
    if (t === 'a') q = q.eq('account_id', id);
    if (t === 'c') q = q.eq('card_id', id);
    const end = monthEnd(month);
    const [rows, invs, pend] = await Promise.all([
      must(q.order('date', { ascending: false }).order('created_at', { ascending: false })),
      must(sb.from('invoices').select('*').gte('invoice_date', addMonths(month, -2)).lte('invoice_date', end)),
      must(sb.from('transactions').select('amount, account_id').eq('paid', false).not('account_id', 'is', null).lte('date', end)),
    ]);
    this.rows.set(rows as Tx[]);
    this.invs.set(invs as Inv[]);
    this.pend.set(pend as { amount: number; account_id: string }[]);
    this.loading.set(false);
  }

  setParam(key: string, value: string) {
    this.router.navigate([], { queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  openSearch() { this.searching.set(true); setTimeout(() => document.getElementById('search')?.focus()); }
  clearAll() {
    this.kind.set(''); this.paidSel.set(''); this.q.set(''); this.searching.set(false);
    this.router.navigate([], { queryParams: { o: null, cat: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  go(n: number) {
    this.setParam('m', addMonths(this.month(), n).slice(0, 7));
  }

  async togglePaid(t: Tx) {
    this.rows.update((l) => l.map((x) => (x.id === t.id ? { ...x, paid: !t.paid } : x))); // otimista
    await this.store.withUndo(t.paid ? 'Marcado como pendente' : 'Marcado como pago', { column: 'id', value: t.id },
      () => must(sb.from('transactions').update({ paid: !t.paid }).eq('id', t.id)));
  }
}
