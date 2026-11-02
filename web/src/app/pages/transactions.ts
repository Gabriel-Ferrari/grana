import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BrlPipe, Store, Tx, addMonths, catIcon, monthEnd, monthLabel, monthStart, must, sb, today } from '../core';
import { Icon } from '../icon';

@Component({
  imports: [BrlPipe, FormsModule, Icon],
  template: `
    <div class="page-title reveal">
      <h1>Lançamentos</h1>
      <div class="month-nav">
        <button class="btn ghost icon" (click)="go(-1)" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
        <b>{{ label() }}</b>
        <button class="btn ghost icon" (click)="go(1)" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
      </div>
    </div>

    <div class="row wrap reveal">
      <div class="search"><g-icon name="search" /><input id="search" placeholder="Buscar descrição ou tag  ( / )" [ngModel]="q()" (ngModelChange)="q.set($event)" /></div>
      <select style="width:auto" [ngModel]="origin()" (ngModelChange)="setParam('o', $event)" aria-label="Conta ou cartão">
        <option value="">Todas as contas e cartões</option>
        <optgroup label="Contas">@for (a of store.accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }</optgroup>
        <optgroup label="Cartões">@for (c of store.cards(); track c.id) { <option [value]="'c:' + c.id">{{ c.name }}</option> }</optgroup>
      </select>
      <select style="width:auto" [ngModel]="catSel()" (ngModelChange)="setParam('cat', $event)" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        <option value="none">Sem categoria</option>
        @for (c of store.categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
      </select>
      <div class="seg">
        <button [class.on]="kind() === ''" (click)="kind.set('')">Tudo</button>
        <button [class.on]="kind() === 'out'" (click)="kind.set('out')">Saídas</button>
        <button [class.on]="kind() === 'in'" (click)="kind.set('in')">Entradas</button>
      </div>
    </div>

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
      <div class="totals">
        <span>Entradas <b class="pos">{{ totals().inc | brl }}</b></span>
        <span>Saídas <b class="neg">{{ -totals().exp | brl }}</b></span>
        <span>Resultado <b [class.neg]="totals().inc + totals().exp < 0">{{ totals().inc + totals().exp | brl }}</b></span>
      </div>
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
  kind = signal<'' | 'in' | 'out'>('');
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
      (!k || (k === 'in' ? t.amount > 0 : t.amount < 0)));
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
  go(n: number) {
    this.setParam('m', addMonths(this.month(), n).slice(0, 7));
  }

  async togglePaid(t: Tx) {
    this.rows.update((l) => l.map((x) => (x.id === t.id ? { ...x, paid: !t.paid } : x))); // otimista
    await this.store.withUndo(t.paid ? 'Marcado como pendente' : 'Marcado como pago', { column: 'id', value: t.id },
      () => must(sb.from('transactions').update({ paid: !t.paid }).eq('id', t.id)));
  }
}
