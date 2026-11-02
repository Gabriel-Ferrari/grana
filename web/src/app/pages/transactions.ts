import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BrlPipe, Store, Tx, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, sb, today } from '../core';
import { Icon } from '../icon';
import { ChipOption, ChipSelect } from '../fields';

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
      <g-chip-select label="Contas e cartões" [options]="originOptions()" [value]="origin()" (valueChange)="setParam('o', $event)" />
      <g-chip-select label="Tipo" [options]="kindOptions" [value]="kind()" (valueChange)="kind.set($any($event))" />
      <g-chip-select label="Categoria" [options]="catOptions()" [value]="catSel()" (valueChange)="setParam('cat', $event)" />
      <g-chip-select label="Situação" [options]="paidOptions" [value]="paidSel()" (valueChange)="paidSel.set($any($event))" />
      @if (origin() || kind() || catSel() || paidSel() || q()) {
        <button class="fchip clear" (click)="clearAll()"><span class="ms">close</span>Limpar</button>
      }
    </div>

    <section class="sum-strip reveal">
      <div><span>Entradas</span><b class="pos">{{ totals().inc | brl }}</b></div>
      <div><span>Saídas</span><b class="neg">{{ -totals().exp | brl }}</b></div>
      <div><span>Resultado</span><b [class.neg]="totals().inc + totals().exp < 0">{{ totals().inc + totals().exp | brl }}</b></div>
    </section>

    <section class="panel reveal" [class.loading]="loading()">
      @for (g of groups(); track g.date) {
        <div class="day"><span>{{ g.label }}</span><span class="num">{{ g.sum | brl }}</span></div>
        <div class="list">
          @for (t of g.items; track t.id) {
            <div class="item click" (click)="store.open(t)" tabindex="0" (keydown.enter)="store.open(t)">
              <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"><span class="ms">{{ icon(t) }}</span></span>
              <div class="grow">
                <div class="title">{{ t.description }}
                  @if (t.installments) { <span class="tag">{{ t.installment }}/{{ t.installments }}</span> }
                  @if (t.recurring) { <span class="tag"><g-icon name="repeat" [size]="13" />fixo</span> }
                  @if (t.source === 'notification') { <span class="tag auto"><g-icon name="notifications" [size]="13" />auto</span> }
                  @if (t.source === 'openfinance') { <span class="tag auto"><g-icon name="account_balance" [size]="13" />banco</span> }
                  @for (tag of t.tags; track tag) { <span class="tag"><g-icon name="sell" [size]="13" />{{ tag }}</span> }
                </div>
                <div class="sub">
                  {{ store.catById().get(t.category_id ?? '')?.name ?? (t.transfer_id ? 'Transferência' : t.pays_card_id ? 'Pagamento de fatura' : 'Sem categoria') }}
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
  kind = signal<'' | 'in' | 'out'>('');
  paidSel = signal<'' | 'paid' | 'open'>('');
  kindOptions: ChipOption[] = [{ value: 'out', label: 'Saídas', icon: 'arrow_upward', color: 'var(--out)' }, { value: 'in', label: 'Entradas', icon: 'arrow_downward', color: 'var(--in)' }];
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
  icon = (t: Tx) => (t.transfer_id ? 'swap_horiz' : t.pays_card_id ? 'credit_card' : catIcon(this.store.catById().get(t.category_id ?? '')));

  filtered = computed(() => {
    const q = this.q().toLowerCase().trim();
    const cat = this.catSel(), k = this.kind();
    const byId = this.store.catById();
    return this.rows().filter((t) =>
      (!q || t.description.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))) &&
      (!cat || (cat === 'none' ? !t.category_id && !t.transfer_id && !t.pays_card_id : t.category_id === cat || byId.get(t.category_id ?? '')?.parent_id === cat)) &&
      (!k || (k === 'in' ? t.amount > 0 : t.amount < 0)) &&
      (!this.paidSel() || (this.paidSel() === 'paid' ? t.paid : !t.paid)));
  });
  groups = computed(() => {
    const m = new Map<string, Tx[]>();
    for (const t of this.filtered()) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m].map(([date, items]) => ({
      date, items, sum: items.filter((t) => !t.transfer_id && !t.pays_card_id).reduce((s, t) => s + t.amount, 0),
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
    this.rows.set(await must(q.order('date', { ascending: false }).order('created_at', { ascending: false })) as Tx[]);
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
